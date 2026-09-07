/**
 * EmptyAnalyticsState — friendly CTA shown when the user has
 * 0 completed sessions. Glass card + orbs + the standard violet→
 * magenta gradient pill, matching the landing CTAs.
 */

'use client';

import Link from 'next/link';

export function EmptyAnalyticsState() {
  return (
    <div className="glass-strong shadow-neon-soft relative overflow-hidden rounded-2xl p-12 text-center">
      {/* Two soft orbs so the empty state still picks up the aurora. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-12 -top-12 h-48 w-48 rounded-full bg-neon-violet/25 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-12 -right-12 h-48 w-48 rounded-full bg-neon-cyan/15 blur-3xl"
      />

      <div className="relative">
        <span className="inline-flex items-center gap-2 rounded-full border border-neon-glassHi bg-neon-surface/60 px-3 py-1.5 text-eyebrow text-neon-ink2 backdrop-blur">
          <span
            aria-hidden="true"
            className="inline-block h-1.5 w-1.5 rounded-full bg-neon-violet2 animate-pulse-dot"
          />
          No sessions yet
        </span>

        <h2 className="type-display mt-4 text-display-l text-neon-ink">
          Your analytics live here.
        </h2>
        <p className="mx-auto mt-3 max-w-md text-body-m text-neon-ink2">
          Complete your first interview to see score trends,
          role-by-role performance, and recurring themes from AI feedback.
        </p>
        <div className="mt-8">
          <Link
            href="/interview"
            className="type-display inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-neon-violet to-neon-magenta px-6 py-3 text-body-m text-white shadow-neon-violet transition-transform hover:scale-[1.03]"
          >
            Take your first interview
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
