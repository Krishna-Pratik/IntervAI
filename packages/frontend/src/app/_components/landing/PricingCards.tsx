'use client';

/**
 * PricingCards — Free vs Pro glass cards (Pro gets the violet glow so
 * the eye lands there first).
 *
 * IMPORTANT: This component intentionally does NOT render a price or
 * trial period — those live on /billing, pulled from the Razorpay
 * configuration at runtime. Hardcoding them here would let marketing
 * copy drift out of sync with the actual checkout. Likewise, Free-card
 * limitations ("last 7 days of history") belong on the /billing
 * comparison, not on the marketing card.
 */

import Link from 'next/link';

type Tier = {
  name: string;
  blurb: string;
  features: string[];
  cta: { label: string; href: string };
  highlight?: boolean;
};

const TIERS: Tier[] = [
  {
    name: 'Free',
    blurb: 'Five full sessions. Resume-driven questions. Real-time scoring.',
    features: [
      '5 mock interviews',
      'Resume-driven question bank',
      'Per-question scoring, as you answer',
    ],
    cta: { label: 'Start free', href: '/interview' },
  },
  {
    name: 'Pro',
    blurb: 'Unlimited practice, the trends you can’t see in a single session, and your full history.',
    features: [
      'Unlimited mock interviews',
      'Score trends across sessions',
      'Recurring weak-spot detection',
      'Full session history',
      'Faster scoring under load',
    ],
    cta: { label: 'See Pro pricing', href: '/sign-up?plan=pro' },
    highlight: true,
  },
];

export function PricingCards() {
  return (
    <section id="pricing" className="relative scroll-mt-24 px-4 pb-16 pt-8 sm:px-6 sm:pb-24 sm:pt-12 md:pb-32">
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 max-w-2xl">
          <span className="text-eyebrow text-neon-violet2">Pricing</span>
          <h2 className="type-display mt-3 text-display-l text-neon-ink">
            Two plans. No surprises.
          </h2>
          <p className="mt-4 max-w-xl text-body-m text-neon-ink2">
            Start free. Upgrade when you want more. The price lives on
            the checkout page, not here.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 sm:gap-8">
          {TIERS.map((t) => (
            <div
              key={t.name}
              className={
                t.highlight
                  ? 'relative flex flex-col rounded-2xl border border-neon-violet/30 bg-gradient-to-b from-neon-violet/10 to-transparent p-8 shadow-neon-violet sm:p-10'
                  : 'flex flex-col rounded-2xl border border-neon-glass bg-neon-surface/40 p-8 sm:p-10'
              }
            >
              {t.highlight && (
                <div className="absolute -top-3 right-8 rounded-full bg-gradient-to-r from-neon-violet to-neon-magenta px-3 py-1 text-eyebrow text-white shadow-neon-violet">
                  Most popular
                </div>
              )}

              <div className="flex items-center gap-2.5">
                <span
                  className={
                    t.highlight
                      ? 'text-eyebrow text-neon-violet2'
                      : 'text-eyebrow text-neon-ink3'
                  }
                >
                  {t.name}
                </span>
                {t.highlight && (
                  <span
                    aria-hidden="true"
                    className="inline-block h-1.5 w-1.5 rounded-full bg-neon-violet2"
                  />
                )}
              </div>

              <p className="mt-4 text-body-m text-neon-ink2">{t.blurb}</p>

              <ul className="mt-8 space-y-3 text-body-m text-neon-ink">
                {t.features.map((f) => (
                  <li key={f} className="flex items-baseline gap-3">
                    <span
                      aria-hidden="true"
                      className="inline-block h-px w-3 translate-y-[-3px] bg-neon-ink2"
                    />
                    {f}
                  </li>
                ))}
              </ul>

              <div className="mt-auto pt-10">
                <Link
                  href={t.cta.href}
                  className={
                    t.highlight
                      ? 'type-display inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-neon-violet to-neon-magenta px-5 py-3 text-body-m text-white shadow-neon-violet transition-transform hover:scale-[1.02]'
                      : 'inline-flex w-full items-center justify-center rounded-full border border-neon-glassHi px-5 py-3 text-body-m text-neon-ink transition-all hover:bg-neon-surface'
                  }
                >
                  {t.cta.label}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
