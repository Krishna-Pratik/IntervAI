/**
 * Razorpay webhook listener — mirrors subscription lifecycle events
 * into the local DB. Flow: verify X-Razorpay-Signature (invalid → 400,
 * dropped), ack 200 immediately (Razorpay retries on non-2xx), then
 * apply the DB updates asynchronously. Idempotent: re-applying the
 * same event converges to the same state.
 *
 * MUST be mounted before the global express.json() — signature checks
 * need the raw body bytes (captured per-route via the verify hook).
 */

import { Router, type Request, type Response, json } from 'express';
import {
  verifyWebhookSignature,
  fetchSubscription,
} from '../../services/payments/razorpay.service.js';
import { applySubscriptionEvent } from '../billing/billing.service.js';

export const webhookRouter = Router();

// Parses the body but also stashes the raw bytes on req.rawBody for signing.
const rawJson = json({
  limit: '1mb',
  verify: (req: Request, _res, buf) => {
    (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
  },
});

webhookRouter.post(
  '/razorpay',
  rawJson,
  async (req: Request, res: Response) => {
    const signature = req.header('x-razorpay-signature');
    if (!signature) {
      res.status(400).json({ error: 'Missing X-Razorpay-Signature header' });
      return;
    }

    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) {
      res.status(400).json({ error: 'Missing raw body' });
      return;
    }

    // 1. Verify signature
    try {
      verifyWebhookSignature(rawBody.toString('utf-8'), signature);
    } catch (err) {
      console.warn('[webhook] Signature verification failed:', (err as Error).message);
      res.status(400).json({ error: 'Invalid signature' });
      return;
    }

    // 2. Parse the verified body
    let event: {
      event: string;
      payload?: { subscription?: { entity: { id: string } } };
    };
    try {
      event = JSON.parse(rawBody.toString('utf-8'));
    } catch {
      res.status(400).json({ error: 'Invalid JSON' });
      return;
    }

    // 3. Ack IMMEDIATELY (Razorpay gives ~5s; we want to be well under)
    res.status(200).json({ received: true });

    // 4. Process asynchronously. We catch + log to avoid unhandled
    //    rejections; production would push to a durable queue.
    setImmediate(() => {
      processRazorpayEvent(event)
        .then((updated) => {
          if (!updated) {
            console.error(`[webhook] No-op or unknown event: ${event.event}`);
          }
        })
        .catch((err) => {
          console.error(`[webhook] Failed to process ${event.event}:`, err);
        });
    });
  },
);

/**
 * true if a row was updated; false = no-op or unknown. Subscription
 * events with a partial payload are re-fetched from Razorpay first.
 */
async function processRazorpayEvent(
  event: {
    event: string;
    payload?: {
      subscription?: {
        entity: {
          id: string;
          status?: string;
          current_end?: number;
        };
      };
    };
  },
): Promise<boolean> {
  if (!event.event.startsWith('subscription.')) {
    return false; // we only care about subscription events
  }

  let subEntity = event.payload?.subscription?.entity;

  // Partial payload → fetch canonical state from Razorpay.
  if (!subEntity?.status) {
    if (!subEntity?.id) return false;
    try {
      const canonical = await fetchSubscription(subEntity.id);
      subEntity = canonical as typeof subEntity;
    } catch (err) {
      console.error(`[webhook] Failed to fetch canonical sub ${subEntity.id}:`, err);
      return false;
    }
  }

  if (!subEntity) return false;

  return applySubscriptionEvent({
    event: event.event,
    payload: { subscription: { entity: subEntity as never } },
  });
}
