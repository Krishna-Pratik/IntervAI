/** Marketing landing page. All CTAs target /interview — both auth states flow through that one route. */

import Link from 'next/link';
import { Nav } from './_components/landing/Nav';
import { HeroBackdrop } from './_components/landing/HeroBackdrop';
import { InterviewCard3D } from './_components/landing/InterviewCard3D';
import { StatsRow } from './_components/landing/StatsRow';
import { ProcessGrid } from './_components/landing/ProcessGrid';
import { FeaturesGrid } from './_components/landing/FeaturesGrid';
import { PricingCards } from './_components/landing/PricingCards';
import { Footer } from './_components/landing/Footer';

export default function HomePage() {
  return (
    <div className="relative isolate min-h-screen overflow-x-clip bg-neon-black text-neon-ink">
      {/* Keeps aurora/orbs on a true near-black canvas before AppShell styles load. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 bg-neon-black"
      />
      <Nav />

      <section className="relative">
        <HeroBackdrop />

        <div className="relative mx-auto grid max-w-6xl grid-cols-1 gap-12 px-4 pb-16 pt-10 sm:px-6 sm:pt-12 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pt-10">
          <div className="flex flex-col justify-center">
            <h1 className="type-display text-hero-l text-neon-ink sm:text-hero-xl">
              Run the interview out loud.
              <br />
              Hear where{' '}
              <span className="text-gradient-neon bg-[length:200%_200%] animate-gradient-shift">
                the answer breaks
              </span>
              .
            </h1>

            <p className="mt-4 max-w-lg text-body-l text-neon-ink2">
              Upload your resume, talk through a live interview, and get
              per-question scoring on structure, precision, and clarity —
              as you answer.
            </p>

            <div className="mt-6 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-4">
              <Link
                href="/interview"
                className="type-display inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-neon-violet to-neon-magenta px-6 py-3 text-body-m text-white shadow-neon-violet transition-transform hover:scale-[1.03]"
              >
                Start a practice session
                <span aria-hidden="true">→</span>
              </Link>
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2">
                  {['#7C3AED', '#06B6D4', '#EC4899', '#A855F7'].map((c, i) => (
                    <span
                      key={i}
                      aria-hidden="true"
                      className="inline-block h-6 w-6 rounded-full border-2 border-neon-black"
                      style={{ background: c }}
                    />
                  ))}
                </div>
                <p className="font-mono text-[0.78rem] leading-tight text-neon-ink3">
                  847 sessions this week
                </p>
              </div>
            </div>
          </div>

          {/* Hidden on mobile — the headline + buttons carry the message there. */}
          <div className="relative hidden items-center justify-center lg:flex">
            <div
              aria-hidden="true"
              className="absolute h-72 w-72 rounded-full bg-neon-violet/30 blur-3xl"
            />
            <div className="relative w-full max-w-md">
              <InterviewCard3D />
            </div>
          </div>
        </div>

        <div className="relative mx-auto -mt-4 mb-12 max-w-md px-4 sm:px-6 lg:hidden">
          <InterviewCard3D />
        </div>
      </section>

      <StatsRow />
      <ProcessGrid />
      <FeaturesGrid />
      <PricingCards />

      <section className="relative px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="glass-strong relative overflow-hidden rounded-3xl px-8 py-12 sm:px-12 sm:py-16">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full bg-neon-violet/30 blur-3xl"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-20 -right-20 h-72 w-72 rounded-full bg-neon-cyan/25 blur-3xl"
            />
            <div className="relative flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
              <div>
                <h2 className="type-display text-display-l text-neon-ink">
                  See where your answers break.
                </h2>
                <p className="mt-2 text-body-m text-neon-ink2">
                  Five sessions on us. No card. No timer on the page.
                </p>
              </div>
              <Link
                href="/interview"
                className="type-display inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-neon-violet to-neon-magenta px-6 py-3 text-body-m text-white shadow-neon-violet transition-transform hover:scale-[1.03]"
              >
                Start free
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
