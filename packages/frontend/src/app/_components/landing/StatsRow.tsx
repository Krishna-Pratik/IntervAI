'use client';

/**
 * StatsRow — three oversized gradient numerals under the hero.
 *
 * Each stat uses the `text-stat` token (5rem) and `text-gradient-neon` for
 * the numeral. The label underneath is in mono, the way product teams
 * tag a metric — small, technical, factual.
 *
 * The numbers are placeholders — swap them once the product has real
 * data behind them.
 */

type Stat = {
  value: string;
  label: string;
  hint: string;
};

const STATS: Stat[] = [
  { value: '12K+', label: 'Candidates',         hint: 'practicing this quarter' },
  { value: '8.7',  label: 'Avg. score',         hint: 'across 50K mock sessions' },
  { value: '94%',  label: 'Land the offer',     hint: 'of users who finish 10+ sessions' },
];

export function StatsRow() {
  return (
    <section className="relative px-4 py-12 sm:px-6 sm:py-16">
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-10 sm:grid-cols-3 sm:gap-8">
        {STATS.map((s) => (
          <div
            key={s.label}
            className="flex flex-col items-start gap-2 border-l border-neon-glass pl-6"
          >
            <span className="type-display text-stat leading-none text-gradient-neon animate-gradient-shift bg-[length:200%_200%]">
              {s.value}
            </span>
            <span className="type-display text-display-s text-neon-ink">
              {s.label}
            </span>
            <span className="font-mono text-[0.78rem] text-neon-ink3">
              {s.hint}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
