/**
 * Thin wrapper around the Razorpay REST API (subscriptions + webhook
 * signature verification). The npm SDK is intentionally not used —
 * the REST surface we need is tiny (same approach as Deepgram/OpenRouter).
 * Requests are Basic-auth signed with the key pair from config.
 */

import axios, { type AxiosInstance } from 'axios';
import crypto from 'node:crypto';
import { config } from '../../shared/config/index.js';

// Client (singleton, lazy)

let http: AxiosInstance | null = null;

function getClient(): AxiosInstance {
  if (!http) {
    if (!config.razorpayKeyId || !config.razorpayKeySecret) {
      throw new Error('Razorpay is not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing)');
    }
    const auth = Buffer.from(`${config.razorpayKeyId}:${config.razorpayKeySecret}`).toString(
      'base64',
    );
    http = axios.create({
      baseURL: 'https://api.razorpay.com/v1',
      timeout: 10_000,
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    });
  }
  return http;
}

// Public types (simplified Razorpay response shapes)

export interface RazorpayPlan {
  id: string;
  item: { id: string; name: string; amount: number; currency: string };
  period: 'monthly' | 'yearly';
  interval: number;
  notes?: Record<string, string>;
}

export interface RazorpaySubscription {
  id: string;
  entity: 'subscription';
  plan_id: string;
  status:
    | 'created'
    | 'authenticated'
    | 'active'
    | 'past_due'
    | 'halted'
    | 'cancelled'
    | 'completed'
    | 'expired';
  current_start?: number;
  current_end?: number;
  ended_at?: number | null;
  customer_id?: string;
  notes?: Record<string, string>;
}

export interface CreateSubscriptionInput {
  /** Razorpay plan_id (configured in the dashboard) */
  planId: string;
  /** Number of billing cycles. 0 = until cancelled. */
  totalCount: number;
  /** Free-trial period in days (0 = no trial) */
  trialDays?: number;
  /** Caller-defined notes — useful for storing the userId */
  notes?: Record<string, string>;
  /** Customer notify (default true) */
  notify?: boolean;
}

// Public API

/** Create a subscription; the returned `id` feeds the client checkout widget. */
export async function createSubscription(
  input: CreateSubscriptionInput,
): Promise<RazorpaySubscription> {
  const client = getClient();
  const body: Record<string, unknown> = {
    plan_id: input.planId,
    total_count: input.totalCount,
    customer_notify: input.notify ?? 1,
  };
  if (input.notes) body.notes = input.notes;
  // `start_at` is Unix timestamp; trial period needs at least 1 day
  if (input.trialDays && input.trialDays > 0) {
    const startAt = Math.floor(Date.now() / 1000) + input.trialDays * 24 * 60 * 60;
    body.start_at = startAt;
  }
  const res = await client.post<RazorpaySubscription>('/subscriptions', body);
  return res.data;
}

/** Canonical subscription state (webhook payloads can be incomplete). */
export async function fetchSubscription(id: string): Promise<RazorpaySubscription> {
  const client = getClient();
  const res = await client.get<RazorpaySubscription>(`/subscriptions/${id}`);
  return res.data;
}

/** Cancel at cycle end (default), or immediately with `cancelAtCycleEnd: false`. */
export async function cancelSubscription(
  id: string,
  cancelAtCycleEnd: boolean = true,
): Promise<RazorpaySubscription> {
  const client = getClient();
  const res = await client.post<RazorpaySubscription>(`/subscriptions/${id}/cancel`, {
    cancel_at_cycle_end: cancelAtCycleEnd ? 1 : 0,
  });
  return res.data;
}

// Webhook signature verification

/**
 * HMAC-SHA256(raw body, webhook secret) vs the X-Razorpay-Signature
 * header, timing-safe. Throws on mismatch — the handler must 4xx and
 * not process the event.
 */
export function verifyWebhookSignature(rawBody: string, signature: string): void {
  if (!config.razorpayWebhookSecret) {
    throw new Error('RAZORPAY_WEBHOOK_SECRET is not configured');
  }
  const expected = crypto
    .createHmac('sha256', config.razorpayWebhookSecret)
    .update(rawBody)
    .digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  const actualBuf = Buffer.from(signature, 'hex');
  if (
    expectedBuf.length !== actualBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, actualBuf)
  ) {
    throw new Error('Invalid Razorpay webhook signature');
  }
}
