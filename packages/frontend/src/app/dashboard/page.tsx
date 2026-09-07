/**
 * Dashboard — the analytics home plus the three "what can I do
 * next" actions. Shared chrome (AppShell, GlassCard) and the same
 * eyebrow-pill + display heading pattern as the other authenticated pages.
 */

'use client';

import Link from 'next/link';
import { useAuth } from '@clerk/nextjs';
import { AnalyticsDashboard } from '../../components/analytics/AnalyticsDashboard';
import { AppShell } from '../_components/AppShell';
import { CenterMessage } from '../_components/CenterMessage';

export default function DashboardPage() {
  const { isLoaded, isSignedIn } = useAuth();

  return (
    <AppShell>
      <section className="relative px-4 pb-12 pt-12 sm:px-6 sm:pt-16">
        <div className="mx-auto max-w-6xl">
          {/* Page heading */}
          <div className="mb-10">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-neon-glassHi bg-neon-surface/60 px-3 py-1.5 text-eyebrow text-neon-ink2 backdrop-blur">
              <span
                aria-hidden="true"
                className="inline-block h-1.5 w-1.5 rounded-full bg-neon-violet2 animate-pulse-dot"
              />
              Analytics
            </span>
            <h1 className="type-display mt-3 text-display-l text-neon-ink sm:text-display-xl">
              How your{' '}
              <span className="text-gradient-neon-static">answers</span> land.
            </h1>
            <p className="mt-2 text-body-l text-neon-ink2">
              Your performance across all mock interviews.
            </p>
          </div>

          {!isLoaded ? (
            <CenterMessage>Loading…</CenterMessage>
          ) : !isSignedIn ? (
            <CenterMessage>Please sign in.</CenterMessage>
          ) : (
            <>
              <AnalyticsDashboard />

              {/* Action cards — the three things a user can do
                  besides consume analytics. Each card has a specific
                  CTA (not just "Open") so the row reads as a list of
                  affordances, not a list of links. */}
              <div className="mt-12 grid gap-4 sm:grid-cols-3">
                <ActionCard
                  href="/interview"
                  accent="violet"
                  label="Configure a session"
                  description="Pick a role and difficulty, then the AI will tailor the questions."
                  cta="Configure"
                />
                <ActionCard
                  href="/resume"
                  accent="cyan"
                  label="Upload your resume"
                  description="Anchor the first questions to your real projects and skills. Pick a resume on the next screen."
                  cta="Upload"
                />
                <ActionCard
                  href="/billing"
                  accent="magenta"
                  label="Manage your plan"
                  description="See your trial status, current plan, and what Pro unlocks."
                  cta="Manage"
                />
              </div>
            </>
          )}
        </div>
      </section>
    </AppShell>
  );
}

function ActionCard({
  href,
  accent,
  label,
  description,
  cta,
}: {
  href: string;
  accent: 'violet' | 'cyan' | 'magenta';
  label: string;
  description: string;
  cta: string;
}) {
  const dotColor: Record<typeof accent, string> = {
    violet: 'bg-neon-violet2',
    cyan: 'bg-neon-cyan',
    magenta: 'bg-neon-magenta',
  };
  return (
    <Link
      href={href}
      className="group glass relative block overflow-hidden rounded-2xl p-6 transition-all hover:border-neon-violet/40 hover:shadow-neon-soft"
    >
      {/* One soft orb per card so the row of three picks up the aurora
          but each card has a slightly different hue. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-25 blur-2xl transition-opacity group-hover:opacity-40"
        style={{
          background:
            accent === 'violet'
              ? '#7C3AED'
              : accent === 'cyan'
                ? '#06B6D4'
                : '#EC4899',
        }}
      />
      <div className="relative">
        <span
          aria-hidden="true"
          className={`inline-block h-2 w-2 rounded-full ${dotColor[accent]}`}
        />
        <h2 className="type-display mt-4 text-display-s text-neon-ink">{label}</h2>
        <p className="mt-2 text-body-m text-neon-ink2">{description}</p>
        <div className="mt-6 inline-flex items-center gap-1.5 text-body-m text-neon-ink2 transition-colors group-hover:text-neon-ink">
          {cta}
          <span aria-hidden="true">→</span>
        </div>
      </div>
    </Link>
  );
}
