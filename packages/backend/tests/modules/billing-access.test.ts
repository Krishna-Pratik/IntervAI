/** Access-decision unit tests (stubbed DB; pure Razorpay-status mapping). */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

let mapRazorpayStatus: typeof import('../../src/modules/billing/billing.service.js').mapRazorpayStatus;

before(async () => {
  // Set test env vars BEFORE the module load — billing.service imports
  // config which validates DATABASE_URL at module load.
  process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
  process.env.CLERK_SECRET_KEY ??= 'sk_test_placeholder';
  process.env.GEMINI_API_KEY ??= 'test_gemini';
  process.env.OPENROUTER_API_KEY ??= 'test_or';
  process.env.DEEPGRAM_API_KEY ??= 'test_dg';
  process.env.CLOUDINARY_CLOUD_NAME ??= 'test';
  process.env.CLOUDINARY_API_KEY ??= 'test';
  process.env.CLOUDINARY_API_SECRET ??= 'test';
  process.env.RAZORPAY_KEY_ID ??= 'rzp_test_placeholder';
  process.env.RAZORPAY_KEY_SECRET ??= 'placeholder';
  process.env.RAZORPAY_WEBHOOK_SECRET ??= 'test_webhook_secret';

  const mod = await import('../../src/modules/billing/billing.service.js');
  mapRazorpayStatus = mod.mapRazorpayStatus;
});

describe('billing.mapRazorpayStatus', () => {
  it('maps "active" / "authenticated" / "created" → active', () => {
    assert.equal(mapRazorpayStatus('active'), 'active');
    assert.equal(mapRazorpayStatus('authenticated'), 'active');
    assert.equal(mapRazorpayStatus('created'), 'active');
  });

  it('maps "past_due" → past_due', () => {
    assert.equal(mapRazorpayStatus('past_due'), 'past_due');
  });

  it('maps "halted" / "cancelled" / "canceled" → canceled', () => {
    assert.equal(mapRazorpayStatus('halted'), 'canceled');
    assert.equal(mapRazorpayStatus('cancelled'), 'canceled');
    assert.equal(mapRazorpayStatus('canceled'), 'canceled');
  });

  it('maps "completed" / "expired" → canceled', () => {
    assert.equal(mapRazorpayStatus('completed'), 'canceled');
    assert.equal(mapRazorpayStatus('expired'), 'canceled');
  });

  it('maps "trial" → trial', () => {
    assert.equal(mapRazorpayStatus('trial'), 'trial');
  });

  it('maps unknown statuses to "incomplete" (conservative)', () => {
    assert.equal(mapRazorpayStatus('what-is-this'), 'incomplete');
    assert.equal(mapRazorpayStatus(''), 'incomplete');
  });
});
