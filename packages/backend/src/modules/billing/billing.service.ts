/**
 * Billing domain service — subscription state machine + trial limits.
 * Freemium: free tier gets FREE_TRIAL_LIMIT sessions, active/trial
 * subscribers are unlimited, past_due/canceled fall back to free.
 *
 * Source of truth is `users.subscriptionStatus` (denormalized mirror
 * of the `subscriptions` table, updated together by the webhook
 * handler), so authorization reads are O(1) and never touch Razorpay —
 * Razorpay is only called to mutate state.
 */

import { eq, and, desc, count, sql, lt } from 'drizzle-orm';
import { db } from '../../shared/db/db.js';
import {
  users,
  subscriptions,
  interviewSessions,
  subscriptionStatusEnum,
} from '../../db/schema.js';
import { config } from '../../shared/config/index.js';
import {
  createSubscription as razorpayCreateSubscription,
  cancelSubscription as razorpayCancelSubscription,
  type RazorpaySubscription,
} from '../../services/payments/razorpay.service.js';

/** Narrow union of statuses, derived from the schema's pgEnum to stay in sync. */
export type SubscriptionStatus = (typeof subscriptionStatusEnum.enumValues)[number];

// Errors

export class BillingError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'BillingError';
  }
}

// Plan configuration

/** Plan ids come from Razorpay's dashboard via env (missing → checkout 503). */
export const PLAN_IDS = {
  pro_monthly: process.env.RAZORPAY_PLAN_PRO_MONTHLY ?? '',
  pro_yearly: process.env.RAZORPAY_PLAN_PRO_YEARLY ?? '',
} as const;

/**
 * Payments are not being accepted yet. The billing UI still opens the
 * real Razorpay checkout — as a preview — but no subscription may be
 * created, so nothing can activate Pro (everyone stays on free tier;
 * the admin override in checkInterviewAccess is unaffected).
 * Flip to true once payment collection is wired to a bank account.
 */
export const PAYMENTS_ENABLED = false;

export type PlanKey = keyof typeof PLAN_IDS;

// Authorization decisions

export interface AccessDecision {
  allowed: boolean;
  reason: 'active' | 'trial' | 'free-tier' | 'limit-reached';
  remainingFreeTrials: number;
  subscriptionStatus: SubscriptionStatus;
  currentPeriodEnd: Date | null;
}

/**
 * Can this user start a new interview? Called by the interview
 * service before creating a session. Admins bypass; active/trial are
 * always allowed; free (and past_due/canceled, which count as free)
 * are allowed until the trial limit runs out.
 */
export async function checkInterviewAccess(
  userId: string,
  email?: string | null,
): Promise<AccessDecision> {
  const userRow = await db
    .select({
      id: users.id,
      subscriptionStatus: users.subscriptionStatus,
      trialCount: users.trialCount,
      isAdmin: users.isAdmin,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const user = userRow[0];
  if (!user) {
    // New user — interview service upserts the row with trialCount=0.
    return {
      allowed: true,
      reason: 'free-tier',
      remainingFreeTrials: config.freeTrialLimit,
      subscriptionStatus: 'free',
      currentPeriodEnd: null,
    };
  }

  // Admin override — checked BEFORE the subscription branch so an
  // admin with a 'free'/'canceled' column value still gets unlimited
  // access. Reports status 'active' so the existing Pro UI branch
  // renders it with no frontend changes.
  if (user.isAdmin || (email && config.adminEmails.includes(email.trim().toLowerCase()))) {
    return {
      allowed: true,
      reason: 'active',
      remainingFreeTrials: Number.POSITIVE_INFINITY,
      subscriptionStatus: 'active',
      currentPeriodEnd: null,
    };
  }

  // Active or in a paid trial → always allowed
  if (user.subscriptionStatus === 'active' || user.subscriptionStatus === 'trial') {
    const sub = await getActiveSubscription(userId);
    return {
      allowed: true,
      reason: user.subscriptionStatus === 'active' ? 'active' : 'trial',
      remainingFreeTrials: Number.POSITIVE_INFINITY,
      subscriptionStatus: user.subscriptionStatus,
      currentPeriodEnd: sub?.currentPeriodEnd ?? null,
    };
  }

  // Free / past-due / canceled / incomplete → use trial count
  const remaining = Math.max(0, config.freeTrialLimit - user.trialCount);
  const allowed = remaining > 0;

  return {
    allowed,
    reason: allowed ? 'free-tier' : 'limit-reached',
    remainingFreeTrials: remaining,
    subscriptionStatus: user.subscriptionStatus,
    currentPeriodEnd: null,
  };
}

/**
 * Strict free-trial gate: consumes one trial ATOMICALLY and reports
 * whether it succeeded. Returns false when the account is already at or
 * past `freeTrialLimit` — the check and the increment happen in a single
 * statement, so two concurrent "create session" requests can never both
 * slip through on a stale read. Never call this for admins or
 * subscribers; `checkInterviewAccess` routes only free-tier users here.
 */
export async function tryConsumeFreeTrial(userId: string): Promise<boolean> {
  const updated = await db
    .update(users)
    .set({
      trialCount: sql`${users.trialCount} + 1`,
      updatedAt: sql`NOW()`,
    })
    .where(and(eq(users.id, userId), lt(users.trialCount, config.freeTrialLimit)))
    .returning({ id: users.id });
  return updated.length > 0;
}

/**
 * Hand one trial back when a session creation fails AFTER the consume,
 * so a server-side failure never silently burns a user's trial.
 */
export async function refundFreeTrial(userId: string): Promise<void> {
  await db
    .update(users)
    .set({
      trialCount: sql`CASE WHEN ${users.trialCount} > 0 THEN ${users.trialCount} - 1 ELSE 0 END`,
      updatedAt: sql`NOW()`,
    })
    .where(eq(users.id, userId));
}

// Subscription read helpers

export interface SubscriptionView {
  id: string;
  razorpaySubscriptionId: string;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  createdAt: Date;
}

export async function getActiveSubscription(userId: string): Promise<SubscriptionView | null> {
  const rows = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, 'active')))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function listUserSubscriptions(userId: string): Promise<SubscriptionView[]> {
  return db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.createdAt));
}

// Mutations (called from the route handlers)

export interface CreateCheckoutInput {
  userId: string;
  email: string;
  plan: PlanKey;
  /** Free trial days to attach to the subscription. 0 = none. */
  trialDays?: number;
}

export interface CreateCheckoutResult {
  razorpaySubscriptionId: string;
  /** Razorpay's raw status; the client picks widget vs hosted short_url. */
  status: string;
}

/**
 * Create the Razorpay subscription + a local mirror row; the webhook
 * handler owns all later status changes.
 */
export async function createCheckoutSession(
  input: CreateCheckoutInput,
): Promise<CreateCheckoutResult> {
  if (!PAYMENTS_ENABLED) {
    throw new BillingError('We do not accept payments currently.', 503);
  }
  const planId = PLAN_IDS[input.plan];
  if (!planId) {
    throw new BillingError(
      `Plan ${input.plan} is not configured. Set RAZORPAY_PLAN_${input.plan.toUpperCase()} in env.`,
      503,
    );
  }

  // Ensure the user row exists (FK target)
  await ensureUserRow(input.userId, input.email);

  const razorpaySub = await razorpayCreateSubscription({
    planId,
    totalCount: input.plan === 'pro_yearly' ? 5 : 12, // 5 years / 12 months
    trialDays: input.trialDays,
    notes: {
      // Storing the userId in notes makes webhook reconciliation easy
      userId: input.userId,
    },
  });

  // Persist a local mirror row. Webhooks will update this.
  await db.insert(subscriptions).values({
    userId: input.userId,
    razorpaySubscriptionId: razorpaySub.id,
    status: mapRazorpayStatus(razorpaySub.status),
    currentPeriodEnd: razorpaySub.current_end
      ? new Date(razorpaySub.current_end * 1000)
      : null,
  });

  return {
    razorpaySubscriptionId: razorpaySub.id,
    status: razorpaySub.status,
  };
}

/** Ask Razorpay to cancel at cycle end; the webhook flips local status. */
export async function cancelUserSubscription(userId: string): Promise<SubscriptionView> {
  const sub = await getActiveSubscription(userId);
  if (!sub) {
    throw new BillingError('No active subscription to cancel', 404);
  }

  await razorpayCancelSubscription(sub.razorpaySubscriptionId, true);

  // Local status is left alone here — updating would race the webhook.
  return sub;
}

// Webhook handler helpers

/** Map a Razorpay status to our enum; unknown → 'incomplete' (conservative). */
export function mapRazorpayStatus(
  s: RazorpaySubscription['status'] | string,
): SubscriptionStatus {
  switch (s) {
    case 'active':
    case 'authenticated':
    case 'created':
      return 'active';
    case 'past_due':
      return 'past_due';
    case 'halted':
    case 'cancelled':
    case 'canceled':
      return 'canceled';
    case 'completed':
    case 'expired':
      return 'canceled';
    case 'trial':
      return 'trial';
    default:
      return 'incomplete';
  }
}

/**
 * Apply a webhook event to the local DB (subscription row + user
 * mirror). Returns false for events that are a no-op (unknown
 * subscription). Safe to call repeatedly for the same event.
 */
export async function applySubscriptionEvent(event: {
  event: string;
  payload: { subscription?: { entity: RazorpaySubscription } };
}): Promise<boolean> {
  const sub = event.payload.subscription?.entity;
  if (!sub) return false;

  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.razorpaySubscriptionId, sub.id))
    .limit(1);

  const local = rows[0];
  if (!local) {
    console.warn(`[billing] Webhook for unknown subscription ${sub.id}`);
    return false;
  }

  const status = mapRazorpayStatus(sub.status);
  const currentPeriodEnd = sub.current_end ? new Date(sub.current_end * 1000) : null;

  await db
    .update(subscriptions)
    .set({
      status,
      currentPeriodEnd,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, local.id));

  // Mirror the status onto the user row so auth checks are O(1)
  await db
    .update(users)
    .set({
      subscriptionStatus: status,
      updatedAt: new Date(),
    })
    .where(eq(users.id, local.userId));

  return true;
}

// Helpers

async function ensureUserRow(userId: string, email: string): Promise<void> {
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.id, userId));
  if (existing.length === 0) {
    await db.insert(users).values({ id: userId, email });
  }
}

export async function getSessionCountForUser(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(interviewSessions)
    .where(eq(interviewSessions.userId, userId));
  return row?.n ?? 0;
}
