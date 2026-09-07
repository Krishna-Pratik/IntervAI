/**
 * About — the public story page linked from the footer. Plain prose in
 * the brand chrome; no auth, no data fetching.
 */

import Link from 'next/link';
import { AppShell } from '../_components/AppShell';
import { GlassCard } from '../_components/GlassCard';

export default function AboutPage() {
  return (
    <AppShell>
      <section className="relative px-4 pb-12 pt-16 sm:px-6 sm:pt-24">
        <div className="mx-auto max-w-3xl">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-neon-glassHi bg-neon-surface/60 px-3 py-1.5 text-eyebrow text-neon-ink2 backdrop-blur">
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full bg-neon-cyan"
            />
            About IntervAI
          </span>
          <h1 className="type-display mt-4 text-display-l text-neon-ink sm:text-display-xl">
            Interviews are a{' '}
            <span className="text-gradient-neon-static">spoken</span> skill.
          </h1>
          <p className="mt-4 text-body-l leading-relaxed text-neon-ink2">
            You can read about STAR stories all day — the real test is saying
            one out loud, under a timer, while someone watches. That is the
            part nobody practices. IntervAI is the practice room.
          </p>

          <div className="mt-10 space-y-4">
            <GlassCard className="p-6">
              <h2 className="type-display text-display-s text-neon-ink">
                What it does.
              </h2>
              <p className="mt-2 text-body-m text-neon-ink2">
                Upload your resume, pick a role and a length, and an AI
                interviewer plans a question flow around your actual
                experience — starting the way every real interview starts.
                You answer out loud, on camera if you like. Every answer is
                scored, followed up like a real interviewer would, and rolled
                into a cumulative report when you finish.
              </p>
            </GlassCard>
            <GlassCard className="p-6">
              <h2 className="type-display text-display-s text-neon-ink">
                Why it exists.
              </h2>
              <p className="mt-2 text-body-m text-neon-ink2">
                Most candidates get one or two real interviews a year — far
                too few to build the muscle. Reps are cheap here: run a
                fifteen-minute session the morning of an interview, see your
                precision score, fix the rambling, go again. No judgement,
                unlimited attempts.
              </p>
            </GlassCard>
            <GlassCard className="p-6">
              <h2 className="type-display text-display-s text-neon-ink">
                What we believe.
              </h2>
              <p className="mt-2 text-body-m text-neon-ink2">
                Honest feedback beats comfortable feedback. A 4/10 that tells
                you exactly where the answer lost the thread is worth more
                than a pat on the back. The scores are strict on purpose —
                the interview you care about will be.
              </p>
            </GlassCard>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link
              href="/interview"
              className="type-display inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-gradient-to-r from-neon-violet to-neon-magenta px-6 py-3 text-body-m text-white shadow-neon-violet transition-transform hover:scale-[1.01]"
            >
              Try your first session <span aria-hidden="true">→</span>
            </Link>
            <Link
              href="/billing"
              className="min-h-[44px] rounded-full border border-neon-glassHi px-5 py-2.5 text-body-m text-neon-ink2 transition-colors hover:border-neon-violet/40 hover:text-neon-ink"
            >
              See plans
            </Link>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
