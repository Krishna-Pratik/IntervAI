'use client';

/**
 * Footer — multi-column site footer for the marketing landing page.
 * Uses the same neon/glass chrome as the rest of the public-facing
 * surfaces (AppNav, GlassCard, etc.).
 */

import Link from 'next/link';
import { Logo } from '../../../components/brand/Logo';

const COLUMNS = [
  {
    title: 'Product',
    links: [
      { label: 'How it works', href: '#how' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'Sign in', href: '/sign-in' },
      { label: 'Start practicing', href: '/interview' },
    ],
  },
  {
    title: 'Account',
    links: [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Billing', href: '/billing' },
      { label: 'Upload resume', href: '/resume' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Privacy', href: '/legal/privacy' },
      { label: 'Terms', href: '/legal/terms' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative border-t border-neon-glass px-4 py-12 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="type-display text-display-s text-gradient-neon-static">
              <Logo markSize={26} />
            </div>
            <p className="mt-3 text-body-m text-neon-ink2">
              Practice out loud.
            </p>
          </div>
          {COLUMNS.map((c) => (
            <div key={c.title}>
              <div className="text-eyebrow text-neon-ink3">{c.title}</div>
              <ul className="mt-4 space-y-1 text-body-m text-neon-ink2">
                {c.links.map((l) => {
                  // For in-page anchors, force a smooth scroll on every
                  // press (see the same handler in <Nav /> for details).
                  const isHashLink = l.href.startsWith('#');
                  const handleClick = (
                    e: React.MouseEvent<HTMLAnchorElement>,
                  ) => {
                    if (!isHashLink) return;
                    e.preventDefault();
                    const id = l.href.slice(1);
                    const target = document.getElementById(id);
                    if (!target) return;
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    if (window.location.hash !== l.href) {
                      window.history.replaceState(
                        null,
                        '',
                        `${window.location.pathname}${window.location.search}${l.href}`,
                      );
                    }
                  };
                  return (
                    <li key={l.label}>
                      <Link
                        href={l.href}
                        onClick={handleClick}
                        className="inline-flex min-h-[36px] items-center rounded-md px-2 py-1.5 transition-colors hover:bg-neon-surface/40 hover:text-neon-ink"
                      >
                        {l.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-neon-glass pt-6 text-body-m text-neon-ink3 sm:flex-row sm:items-center">
          <span>© 2026 IntervAI</span>
        </div>
      </div>
    </footer>
  );
}
