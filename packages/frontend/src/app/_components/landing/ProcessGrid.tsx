'use client';

/**
 * ProcessGrid — "How it works" with massive outlined 01/02/03 numerals.
 *
 * The numerals sit behind the copy as outline-only typography, so each
 * step feels anchored to a number without competing with the headline.
 * The cards have a thin luminous border that intensifies on hover.
 *
 * Each step is a self-contained <article> so the layout survives both
 * single-column (mobile) and three-column (desktop) gracefully.
 */

const STEPS = [
  {
    n: '01',
    title: 'Drop your resume.',
    body:
      'We mine it for the role, the domain, and the depth — so the questions we generate aren’t generic, they’re yours.',
  },
  {
    n: '02',
    title: 'Answer out loud.',
    body:
      'We transcribe and score each answer the moment you finish speaking. No waiting, no upload step.',
  },
  {
    n: '03',
    title: 'See what to fix.',
    body:
      'Each session ends with a per-axis score, the answer that dragged you down, and the question type to drill next.',
  },
];

export function ProcessGrid() {
  return (
    <section id="how" className="relative scroll-mt-24 px-4 pb-16 pt-8 sm:px-6 sm:pb-24 sm:pt-12 md:pb-32">
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 max-w-2xl">
          <span className="text-eyebrow text-neon-violet2">How it works</span>
          <h2 className="type-display mt-3 text-display-l text-neon-ink">
            The loop, end to end.
          </h2>
        </div>

        <div className="grid gap-6 sm:grid-cols-3 sm:gap-6">
          {STEPS.map((s) => (
            <article
              key={s.n}
              className="group relative overflow-hidden rounded-2xl border border-neon-glass bg-neon-surface/40 p-8 transition-all duration-300 hover:-translate-y-1 hover:border-neon-violet/40 hover:shadow-neon-soft"
            >
              {/* The big outline numeral — sits behind the content. */}
              <span
                aria-hidden="true"
                className="type-display text-numeral text-outline pointer-events-none absolute -top-4 right-4 select-none leading-none"
              >
                {s.n}
              </span>

              <div className="relative">
                <span className="font-mono text-sm text-neon-violet2">
                  {s.n}
                </span>
                <h3 className="type-display mt-3 text-display-s text-neon-ink">
                  {s.title}
                </h3>
                <p className="mt-3 text-body-m text-neon-ink2">{s.body}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
