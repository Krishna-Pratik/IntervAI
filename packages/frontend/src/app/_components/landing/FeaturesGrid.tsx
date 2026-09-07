'use client';

/**
 * FeaturesGrid — product features section on the landing page: six
 * cards (2×3 desktop / single column mobile), each with a small
 * inline SVG icon, a title, and a body. The wrapper carries
 * id="features" for the nav anchor link.
 *
 * Why inline SVG instead of an icon library?
 *   - Six icons is < 1 KB of SVG — adding lucide / heroicons for
 *     that is a net loss once the import overhead is counted.
 *   - The icons are theme-aware: `currentColor` lets the Tailwind
 *     text-utility set the tint, so the same icon can render in
 *     violet, cyan, or magenta depending on which card it sits in.
 */

type Feature = {
  title: string;
  body: string;
  accent: 'violet' | 'cyan' | 'magenta';
  /** Inline SVG. `currentColor` on every stroke / fill so the
   *  card's text-accent utility controls the tint. */
  icon: React.ReactNode;
};

const ACCENT_TEXT: Record<Feature['accent'], string> = {
  violet: 'text-neon-violet2',
  cyan: 'text-neon-cyan',
  magenta: 'text-neon-magenta',
};

const ACCENT_BG: Record<Feature['accent'], string> = {
  violet: 'bg-neon-violet/10',
  cyan: 'bg-neon-cyan/10',
  magenta: 'bg-neon-magenta/10',
};

const ACCENT_BORDER: Record<Feature['accent'], string> = {
  violet: 'border-neon-violet/40',
  cyan: 'border-neon-cyan/40',
  magenta: 'border-neon-magenta/40',
};

const FEATURES: Feature[] = [
  {
    title: 'Resume-aware questions',
    body:
      "We mine your resume for the role, the domain, and the depth — so questions aren't generic, they're yours.",
    accent: 'violet',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
        aria-hidden="true"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M8 13h8" />
        <path d="M8 17h5" />
      </svg>
    ),
  },
  {
    title: 'Live per-question scoring',
    body:
      'Each answer is scored the moment you finish — precision, growth potential, and structure, not just one number.',
    accent: 'cyan',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
        aria-hidden="true"
      >
        <path d="M3 3v18h18" />
        <path d="M7 14l3-3 4 4 5-7" />
        <circle cx="7" cy="14" r="1" fill="currentColor" />
        <circle cx="10" cy="11" r="1" fill="currentColor" />
        <circle cx="14" cy="15" r="1" fill="currentColor" />
        <circle cx="19" cy="8" r="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    title: 'Follow-up after every answer',
    body:
      'The AI probes the claim you just made before moving on — so the score reflects the answer, not the surface.',
    accent: 'magenta',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
        aria-hidden="true"
      >
        <path d="M21 12a9 9 0 1 1-3.5-7.1" />
        <path d="M21 4v5h-5" />
      </svg>
    ),
  },
  {
    title: 'Voice-first practice',
    body:
      'Answer out loud. The live waveform and transcript show you exactly what the AI is scoring as you speak.',
    accent: 'violet',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
        aria-hidden="true"
      >
        <rect x="9" y="2" width="6" height="13" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0" />
        <path d="M12 18v3" />
        <path d="M8 21h8" />
      </svg>
    ),
  },
  {
    title: 'Tailored to the company',
    body:
      'Type a company name and the AI leans on its real interview style, format, and values — without inventing facts.',
    accent: 'cyan',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
        aria-hidden="true"
      >
        <path d="M3 21h18" />
        <path d="M5 21V8l7-4 7 4v13" />
        <path d="M9 21v-6h6v6" />
        <path d="M9 11h2" />
        <path d="M13 11h2" />
      </svg>
    ),
  },
  {
    title: 'Progress that compounds',
    body:
      'Sessions are tracked over time, so the next one starts with the gap the last one left behind — not from scratch.',
    accent: 'magenta',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
        aria-hidden="true"
      >
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <rect x="7" y="13" width="3" height="6" />
        <rect x="12" y="9" width="3" height="10" />
        <rect x="17" y="5" width="3" height="14" />
      </svg>
    ),
  },
];

export function FeaturesGrid() {
  return (
    <section
      id="features"
      className="relative scroll-mt-24 overflow-hidden px-4 pb-16 pt-8 sm:px-6 sm:pb-24 sm:pt-12 md:pb-32"
    >
      {/* Faint aurora behind the cards so the section feels part of
          the same visual system as the hero and "How it works". */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
      >
        <div className="absolute -left-32 top-1/4 h-72 w-72 rounded-full bg-neon-violet/15 blur-3xl" />
        <div className="absolute -right-32 bottom-1/4 h-72 w-72 rounded-full bg-neon-cyan/15 blur-3xl" />
      </div>

      <div className="mx-auto max-w-6xl">
        <div className="mb-14 max-w-2xl">
          <span className="text-eyebrow text-neon-violet2">Features</span>
          <h2 className="type-display mt-3 text-display-l text-neon-ink">
            What you actually get.
          </h2>
          <p className="mt-3 text-body-l text-neon-ink2">
            Six things that turn a single practice session into a
            measurable step forward.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <article
              key={f.title}
              className="group relative overflow-hidden rounded-2xl border border-neon-glass bg-neon-surface/40 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-neon-violet/40 hover:shadow-neon-soft"
            >
              {/* Faint outlined corner glyph — same motif as
                  <ProcessGrid />. Static (not 01/02) to keep the
                  numbering scheme reserved for the steps section. */}
              <span
                aria-hidden="true"
                className="type-display text-numeral text-outline pointer-events-none absolute -top-6 right-3 select-none leading-none opacity-60"
              >
                ✦
              </span>

              <div className="relative">
                <span
                  className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border ${ACCENT_BORDER[f.accent]} ${ACCENT_BG[f.accent]} ${ACCENT_TEXT[f.accent]}`}
                >
                  {f.icon}
                </span>

                <h3 className="type-display mt-5 text-display-s text-neon-ink">
                  {f.title}
                </h3>
                <p className="mt-2 text-body-m text-neon-ink2">{f.body}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
