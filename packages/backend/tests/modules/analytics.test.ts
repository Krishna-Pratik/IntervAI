/** Unit tests for the two pure helpers: signature() and countTrailingStreak(). */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

let signature: typeof import('../../src/modules/analytics/analytics.service.js').signature;
let countTrailingStreak: typeof import('../../src/modules/analytics/analytics.service.js').countTrailingStreak;

before(async () => {
  // Set env vars BEFORE the module load — analytics.service transitively
  // imports config which validates DATABASE_URL.
  process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
  process.env.CLERK_SECRET_KEY ??= 'sk_test_placeholder';
  process.env.GEMINI_API_KEY ??= 'test_gemini';
  process.env.OPENROUTER_API_KEY ??= 'test_or';
  process.env.DEEPGRAM_API_KEY ??= 'test_dg';
  process.env.CLOUDINARY_CLOUD_NAME ??= 'test';
  process.env.CLOUDINARY_API_KEY ??= 'test';
  process.env.CLOUDINARY_API_SECRET ??= 'test';
  process.env.RAZORPAY_KEY_ID ??= 'rzp_test';
  process.env.RAZORPAY_KEY_SECRET ??= 'placeholder';
  process.env.RAZORPAY_WEBHOOK_SECRET ??= 'test_webhook_secret';

  const mod = await import('../../src/modules/analytics/analytics.service.js');
  signature = mod.signature;
  countTrailingStreak = mod.countTrailingStreak;
});

describe('analytics.signature', () => {
  it('lowercases', () => {
    assert.equal(signature('Strong System Design'), 'strong system design');
  });

  it('strips punctuation', () => {
    assert.equal(signature('Great use of recursion!'), 'great use of');
  });

  it('truncates to 3 words', () => {
    assert.equal(
      signature('one two three four five six'),
      'one two three',
    );
  });

  it('collapses whitespace', () => {
    assert.equal(signature('  lots   of    spaces  '), 'lots of spaces');
  });

  it('returns empty string for empty / whitespace input', () => {
    assert.equal(signature(''), '');
    assert.equal(signature('   '), '');
  });

  it('strips non-alphanumeric chars but keeps word boundaries', () => {
    assert.equal(signature('JWT-based auth, correctly'), 'jwt based auth');
  });

  it('treats numbers as words', () => {
    assert.equal(signature('Solved 3 leetcode hards'), 'solved 3 leetcode');
  });
});

describe('analytics.countTrailingStreak', () => {
  it('returns 0 for empty set', () => {
    assert.equal(countTrailingStreak(new Set()), 0);
  });

  it('returns 1 for a single day', () => {
    assert.equal(countTrailingStreak(new Set(['2026-09-04'])), 1);
  });

  it('returns the count when today and yesterday are both present', () => {
    assert.equal(
      countTrailingStreak(new Set(['2026-09-04', '2026-09-03'])),
      2,
    );
  });

  it('counts a 3-day streak', () => {
    assert.equal(
      countTrailingStreak(
        new Set(['2026-09-04', '2026-09-03', '2026-09-02']),
      ),
      3,
    );
  });

  it('stops at the first gap', () => {
    assert.equal(
      countTrailingStreak(
        new Set(['2026-09-04', '2026-09-03', '2026-09-01']),
      ),
      2,
    );
  });

  it('anchors to the latest day in the set, not the calendar today', () => {
    // latest day in the set is 2026-09-01; it has no successor in the set
    // → 1 day streak
    assert.equal(
      countTrailingStreak(new Set(['2026-09-01', '2026-08-31'])),
      2,
    );
  });

  it('handles month boundaries correctly', () => {
    assert.equal(
      countTrailingStreak(
        new Set(['2026-10-01', '2026-09-30', '2026-09-29']),
      ),
      3,
    );
  });

  it('handles leap year (Feb 29)', () => {
    // 2024 is a leap year
    assert.equal(
      countTrailingStreak(
        new Set(['2024-03-01', '2024-02-29', '2024-02-28']),
      ),
      3,
    );
  });
});
