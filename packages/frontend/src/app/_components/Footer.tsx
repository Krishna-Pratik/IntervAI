'use client';

/**
 * AppFooter — the site footer for authenticated product screens. Brand
 * column + socials, three real link columns (Product / Company / Legal),
 * a closing CTA strip and the copyright bar — the chrome a buyer expects
 * before trusting a product with their resume.
 *
 * The landing page renders its own variant (_components/landing/Footer.tsx)
 * because some of its links target on-page anchors.
 */

import Link from 'next/link';

const COLUMNS: Array<{ title: string; links: Array<{ label: string; href: string }> }> = [
  {
    title: 'Product',
    links: [
      { label: 'Practice interviews', href: '/interview' },
      { label: 'Resume studio', href: '/resume' },
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Pricing & plans', href: '/billing' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Contact', href: 'mailto:krishnapratik26@gmail.com' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy policy', href: '/legal/privacy' },
      { label: 'Terms of service', href: '/legal/terms' },
    ],
  },
];

export function AppFooter() {
  return (
    <footer className="relative mt-10 border-t border-neon-glass px-4 pb-8 pt-12 sm:px-6 sm:pt-16">
      <div className="mx-auto max-w-6xl">
        {/* Closing CTA — the last push before a visitor leaves. */}
        <div className="mb-12 flex flex-col items-start justify-between gap-4 rounded-2xl border border-neon-violet/20 bg-gradient-to-r from-neon-violet/10 to-neon-magenta/10 px-6 py-6 sm:flex-row sm:items-center">
          <div>
            <h3 className="type-display text-display-s text-neon-ink">
              Ready for the real interview?
            </h3>
            <p className="mt-1 text-body-m text-neon-ink2">
              Run a full mock — voice, camera, scoring, all of it.
            </p>
          </div>
          <Link
            href="/interview"
            className="type-display inline-flex min-h-[44px] flex-shrink-0 items-center gap-2 rounded-full bg-gradient-to-r from-neon-violet to-neon-magenta px-6 py-3 text-body-m text-white shadow-neon-violet transition-transform hover:scale-[1.02]"
          >
            Start a session <span aria-hidden="true">→</span>
          </Link>
        </div>

        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          {/* Brand column — wordmark, one-liner, socials. */}
          <div className="lg:col-span-2">
            <Link
              href="/"
              className="type-display inline-block text-display-s text-gradient-neon-static transition-opacity hover:opacity-80"
              aria-label="IntervAI home"
            >
              IntervAI
            </Link>
            <p className="mt-3 max-w-xs text-body-m text-neon-ink2">
              AI mock interviews that speak back. Practice out loud, get
              scored answer-by-answer, and walk into the real one calm.
            </p>
            <div className="mt-5 flex items-center gap-3">
              <SocialLink href="https://x.com/KrishnaPratik26" label="X">
                <path d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.4l-5.8-7.58-6.64 7.58H.47l8.6-9.83L0 1.15h7.59l5.24 6.93L18.9 1.15Zm-1.29 19.49h2.04L6.48 3.24H4.29l13.32 17.4Z" />
              </SocialLink>
              <SocialLink href="https://www.linkedin.com/in/krishna-pratik/" label="LinkedIn">
                <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z" />
              </SocialLink>
              {/* Personal GitHub profile for now — swap to the IntervAI
                  repo link once it's published. */}
              <SocialLink href="https://github.com/Krishna-Pratik" label="GitHub">
                <path d="M12 .3a12 12 0 0 0-3.8 23.38c.6.12.83-.26.83-.57v-2.23c-3.34.72-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.08-.74.09-.73.09-.73 1.2.09 1.83 1.24 1.83 1.24 1.07 1.83 2.8 1.3 3.49 1 .1-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.11-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.65 1.66.24 2.88.12 3.18.77.84 1.23 1.9 1.23 3.22 0 4.61-2.81 5.62-5.48 5.92.43.37.81 1.1.81 2.22l-.01 3.29c0 .32.22.7.83.58A12 12 0 0 0 12 .3Z" />
              </SocialLink>
            </div>
          </div>

          {COLUMNS.map((c) => (
            <div key={c.title}>
              <div className="text-eyebrow text-neon-ink3">{c.title}</div>
              <ul className="mt-4 space-y-1 text-body-m text-neon-ink2">
                {c.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="inline-flex min-h-[36px] items-center rounded-md px-2 py-1.5 transition-colors hover:bg-neon-surface/40 hover:text-neon-ink"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar — rights line + quiet repeat of the trust links. */}
        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-neon-glass pt-6 text-body-m text-neon-ink3 sm:flex-row sm:items-center">
          <span>© 2026 IntervAI · All rights reserved.</span>
          <span className="flex items-center gap-2">
            Made in India
            <span aria-hidden="true">·</span>
            <Link href="/legal/privacy" className="transition-colors hover:text-neon-ink">
              Privacy
            </Link>
            <span aria-hidden="true">·</span>
            <Link href="/legal/terms" className="transition-colors hover:text-neon-ink">
              Terms
            </Link>
          </span>
        </div>
      </div>
    </footer>
  );
}

function SocialLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-neon-glass bg-neon-black/40 text-neon-ink2 transition-colors hover:border-neon-violet/40 hover:text-neon-ink"
    >
      <svg
        viewBox="0 0 24 24"
        width="15"
        height="15"
        fill="currentColor"
        aria-hidden="true"
      >
        {children}
      </svg>
    </a>
  );
}
