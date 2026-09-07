/**
 * Billing page — current plan + trial status, and the Pro upgrade flow.
 *
 * "Upgrade" opens the real Razorpay checkout widget (loaded from
 * Razorpay's CDN with the publishable key from /billing/checkout-config)
 * so the payment experience looks exactly like production. Payments are
 * NOT being accepted yet, though: no subscription is ever created
 * server-side (createCheckoutSession is gated), no event handler grants
 * anything, and everyone stays on the free tier until billing is
 * enabled. Admin access is unaffected — it lives in the backend.
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import clsx from 'clsx';
import {
  getAccessDecision,
  getActiveSubscription,
  getCheckoutConfig,
  type AccessDecision,
  type SubscriptionView,
} from '../../lib/api';
import { AppShell } from '../_components/AppShell';
import { ErrorNotice } from '../_components/ErrorNotice';

type PlanKey = 'pro_monthly' | 'pro_yearly';

const PLAN_LABELS: Record<PlanKey, { name: string; price: string; cadence: string; tag?: string }> = {
  pro_monthly: { name: 'Pro Monthly', price: '₹499', cadence: '/ month' },
  pro_yearly: { name: 'Pro Yearly', price: '₹4,999', cadence: '/ year', tag: 'Save 17%' },
};

export default function BillingPage() {
  const router = useRouter();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [access, setAccess] = useState<AccessDecision | null>(null);
  const [sub, setSub] = useState<SubscriptionView | null>(null);
  const [plan, setPlan] = useState<PlanKey>('pro_monthly');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    (async () => {
      try {
        const [a, s] = await Promise.all([
          getAccessDecision(getToken),
          getActiveSubscription(getToken),
        ]);
        setAccess(a);
        setSub(s);
      } catch (err) {
        setError(friendlyError(err));
      }
    })();
  }, [isLoaded, isSignedIn, getToken]);

  if (!isLoaded) {
    return (
      <AppShell>
        <CenterMessage>Loading…</CenterMessage>
      </AppShell>
    );
  }
  if (!isSignedIn) {
    return (
      <AppShell>
        <CenterMessage>Please sign in to manage billing.</CenterMessage>
      </AppShell>
    );
  }

  async function upgrade() {
    setBusy(true);
    setError(null);
    try {
      const cfg = await getCheckoutConfig(getToken);
      // Guard the response shape — an undefined amount would open the
      // widget in a broken state (NaN price).
      const amount = cfg.amounts?.[plan];
      if (!amount) {
        throw new Error('Plan price unavailable right now. Try again shortly.');
      }
      const RazorpayCtor = await loadRazorpay();
      const rzp = new RazorpayCtor({
        key: cfg.keyId,
        amount,
        currency: cfg.currency,
        name: 'IntervAI',
        description: `${PLAN_LABELS[plan].name} — preview`,
        notes: { mode: 'checkout-preview' },
        theme: { color: '#7c3aed' },
      });
      // Deliberately no `payment.captured` handler: even if the widget
      // reports a (test) payment, nothing is created or activated here,
      // and the server refuses checkout/subscription creation outright.
      rzp.open();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  // "Paid-looking" state covers real subscribers AND the admin override:
  // checkInterviewAccess reports reason 'active' for admin emails, so the
  // developer account never sees the "0 free trials remaining" card.
  const isPaid =
    sub?.status === 'active' ||
    sub?.status === 'trial' ||
    access?.reason === 'active';
  const trialsRemaining = access?.remainingFreeTrials ?? 0;
  const limitReached = access?.reason === 'limit-reached';

  return (
    <AppShell>
      <section className="relative px-4 pb-12 pt-12 sm:px-6 sm:pt-16">
        <div className="mx-auto max-w-3xl">
          {/* Page heading */}
          <div className="mb-10">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-neon-glassHi bg-neon-surface/60 px-3 py-1.5 text-eyebrow text-neon-ink2 backdrop-blur">
              <span
                aria-hidden="true"
                className="inline-block h-1.5 w-1.5 rounded-full bg-neon-violet2 animate-pulse-dot"
              />
              Billing
            </span>
            <h1 className="type-display mt-3 text-display-l text-neon-ink sm:text-display-xl">
              Your plan,{' '}
              <span className="text-gradient-neon-static">at a glance</span>.
            </h1>
            <p className="mt-2 text-body-l text-neon-ink2">
              Five free sessions, no card. Upgrade when you want more.
            </p>
          </div>

          {/* Current plan card */}
          <div className="glass-strong shadow-neon-soft relative mb-6 overflow-hidden rounded-3xl p-6 sm:p-8">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-neon-violet/20 blur-3xl"
            />
            <div className="relative">
              <div className="text-eyebrow text-neon-ink3">Current plan</div>
              <div className="mt-2 flex items-baseline gap-3">
                <span
                  className={clsx(
                    'type-display text-display-l',
                    isPaid ? 'text-gradient-neon-static' : 'text-neon-ink',
                  )}
                >
                  {isPaid ? 'Pro' : 'Free'}
                </span>
                {sub?.currentPeriodEnd && (
                  <span className="text-body-m text-neon-ink3">
                    renews {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                  </span>
                )}
              </div>
              {access && !isPaid && (
                <p className="mt-2 text-body-m text-neon-ink2">
                  {limitReached
                    ? 'You have used all your free trials. Upgrade to continue.'
                    : `${trialsRemaining} free ${
                        trialsRemaining === 1 ? 'trial' : 'trials'
                      } remaining`}
                </p>
              )}
              {isPaid && (
                <p className="mt-2 text-body-m text-neon-ink2">
                  Unlimited interview sessions and evaluation history.
                </p>
              )}
            </div>
          </div>

          {error && (
            <div className="mb-6">
              <ErrorNotice title="Checkout problem" onRetry={upgrade}>
                {error}
              </ErrorNotice>
            </div>
          )}

          {/* Plan picker — only show if not already paid */}
          {!isPaid && (
            <div className="glass relative overflow-hidden rounded-3xl p-6 sm:p-8">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full bg-neon-violet/15 blur-3xl"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-16 -right-16 h-56 w-56 rounded-full bg-neon-cyan/10 blur-3xl"
              />
              <div className="relative">
                <h2 className="type-display text-display-s text-neon-ink">
                  Upgrade to Pro
                </h2>
                <p className="mt-1 text-body-m text-neon-ink2">
                  Unlimited sessions, per-question analytics, and priority
                  queueing.
                </p>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {(Object.keys(PLAN_LABELS) as PlanKey[]).map((key) => {
                    const meta = PLAN_LABELS[key];
                    const selected = plan === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setPlan(key)}
                        className={clsx(
                          'group relative overflow-hidden rounded-2xl border p-5 text-left transition-all',
                          selected
                            ? 'border-neon-violet2 bg-neon-violet/10 shadow-neon-soft'
                            : 'border-neon-glass bg-neon-surface/40 hover:border-neon-violet/40',
                        )}
                      >
                        {meta.tag && (
                          <span className="absolute right-3 top-3 rounded-full border border-neon-magenta/40 bg-neon-magenta/15 px-2 py-0.5 font-mono text-[0.7rem] font-semibold text-neon-magenta">
                            {meta.tag}
                          </span>
                        )}
                        <div className="text-eyebrow text-neon-ink2">{meta.name}</div>
                        {/* Right padding reserves space for the absolute
                            "Save 17%" tag so the price can't collide
                            with it on narrow screens. */}
                        <div className="mt-2 flex flex-wrap items-baseline gap-x-1 gap-y-1 pr-16">
                          <span
                            className={clsx(
                              'type-display text-display-l',
                              selected ? 'text-gradient-neon-static' : 'text-neon-ink',
                            )}
                          >
                            {meta.price}
                          </span>
                          <span className="text-body-m text-neon-ink3">{meta.cadence}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-8">
                  <button
                    type="button"
                    onClick={upgrade}
                    disabled={busy}
                    className="type-display inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-neon-violet to-neon-magenta px-6 py-3 text-body-m text-white shadow-neon-violet transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busy
                      ? 'Opening checkout…'
                      : `Upgrade — ${PLAN_LABELS[plan].price}`}
                    {!busy ? <span aria-hidden="true">→</span> : null}
                  </button>
                  {/* Honest note — the widget is a preview of the real
                      Razorpay checkout, but we do not take money yet,
                      so no upgrade can complete (and no one gets Pro
                      for free through it). */}
                  <p className="mt-3 text-center font-mono text-[0.78rem] text-neon-ink3">
                    We do not accept payments currently — checkout opens
                    as a preview, and your plan stays Free.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-10 text-center text-body-m text-neon-ink2">
            <button
              onClick={() => router.push('/dashboard')}
              className="text-neon-ink2 transition-colors hover:text-neon-ink"
            >
              ← Back to dashboard
            </button>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function CenterMessage({ children }: { children: React.ReactNode }) {
  return (
    <section className="relative px-4 pb-12 pt-12 sm:px-6 sm:pt-16">
      <div className="mx-auto max-w-3xl">
        <div className="glass rounded-2xl p-12 text-center text-body-m text-neon-ink2">
          <div className="inline-flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full bg-neon-violet2 animate-pulse-dot"
            />
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Surface the server's `{ error }` message, not the raw axios text. */
function friendlyError(err: unknown): string {
  const e = err as {
    response?: { data?: { error?: string } };
    message?: string;
  };
  return e.response?.data?.error ?? e.message ?? 'Something went wrong.';
}

// --- Razorpay checkout widget -------------------------------------

/** Minimal typing for the global constructor Razorpay's CDN script adds. */
type RazorpayInstance = { open(): void };
type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  notes?: Record<string, string>;
  theme?: { color?: string };
};
type RazorpayCtor = new (options: RazorpayOptions) => RazorpayInstance;

/** Injects Razorpay's official checkout.js once and resolves its ctor. */
function loadRazorpay(): Promise<RazorpayCtor> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as { Razorpay?: RazorpayCtor };
    if (w.Razorpay) {
      resolve(w.Razorpay);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => {
      if (w.Razorpay) resolve(w.Razorpay);
      else reject(new Error('Razorpay checkout failed to load.'));
    };
    script.onerror = () =>
      reject(new Error('Could not reach the payment gateway. Try again.'));
    document.body.appendChild(script);
  });
}
