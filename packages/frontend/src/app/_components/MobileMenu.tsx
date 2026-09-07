'use client';

/** Slide-out mobile sheet for both Nav variants (link clusters hide below sm).
 *  Full-screen sheet, not a popover: at 390px a popover crowds the pill nav, and
 *  the sheet reuses the sign-in panel's surface so the app doesn't feel left. */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import clsx from 'clsx';

export type MobileLink = { label: string; href: string };

export function MobileMenu({
  links,
  cta,
  authState,
}: {
  links: MobileLink[];
  cta?: { label: string; href: string };
  /** null = parent auth not loaded (render nothing in sheet);
   *  signed-out shows a "Sign in" link — only entry point on phones. */
  authState?: { isSignedIn: boolean } | null;
}) {
  const [open, setOpen] = useState(false);

  // Bound only while open so desktop doesn't carry a dead listener.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // So the overlay can't get stuck open when the window widens past sm.
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia('(min-width: 640px)');
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [open]);

  // Lock body scroll while the sheet is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="mobile-menu-sheet"
        className="type-display inline-flex h-10 w-10 items-center justify-center rounded-full border border-neon-glass bg-neon-black/60 text-neon-ink transition-colors hover:border-neon-violet/40 sm:hidden"
      >
        {/* Hamburger drawn as a span stack so colours inherit from the parent. */}
        <span aria-hidden="true" className="flex flex-col gap-[3px]">
          <span className="block h-0.5 w-4 rounded-full bg-current" />
          <span className="block h-0.5 w-4 rounded-full bg-current" />
          <span className="block h-0.5 w-4 rounded-full bg-current" />
        </span>
      </button>

      {/* Rendered always so the transition doesn't re-mount; inert when
          closed so it can't trap focus. */}
      <div
        id="mobile-menu-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        aria-hidden={!open}
        inert={!open}
        className={clsx(
          'fixed inset-0 z-[60] sm:hidden',
          open ? 'pointer-events-auto' : 'pointer-events-none',
        )}
      >
        <button
          type="button"
          aria-label="Close menu"
          tabIndex={open ? 0 : -1}
          onClick={() => setOpen(false)}
          className={clsx(
            'absolute inset-0 bg-neon-black/70 backdrop-blur-sm transition-opacity duration-200',
            open ? 'opacity-100' : 'opacity-0',
          )}
        />

        <div
          className={clsx(
            'absolute inset-x-0 top-0 origin-top bg-neon-black/95 shadow-neon-violet backdrop-blur-xl transition-transform duration-200',
            open ? 'translate-y-0' : '-translate-y-full',
          )}
        >
          <div className="flex items-center justify-between border-b border-neon-glass px-5 py-4">
            <span className="type-display text-display-s text-gradient-neon-static">
              IntervAI
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-neon-glass text-neon-ink transition-colors hover:border-neon-violet/40"
            >
              <span aria-hidden="true" className="text-xl leading-none">
                ×
              </span>
            </button>
          </div>
          <nav className="flex flex-col gap-1 px-5 py-6">
            {links.map((l) => {
              // Browsers only re-scroll on hash change, so anchor links
              // scroll manually on every press. Same handler as in <Nav />.
              const isHashLink = l.href.startsWith('#');
              const handleClick = () => {
                if (isHashLink) {
                  const id = l.href.slice(1);
                  const target = document.getElementById(id);
                  if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    if (window.location.hash !== l.href) {
                      window.history.replaceState(
                        null,
                        '',
                        `${window.location.pathname}${window.location.search}${l.href}`,
                      );
                    }
                  }
                }
                setOpen(false);
              };
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={handleClick}
                  className="flex min-h-[44px] items-center rounded-lg px-3 text-body-l text-neon-ink2 transition-colors hover:bg-neon-surface/60 hover:text-neon-ink"
                >
                  {l.label}
                </Link>
              );
            })}
            {/* Only sign-in entry point on phones (desktop button hides below sm). */}
            {authState && !authState.isSignedIn ? (
              <Link
                href="/sign-in"
                onClick={() => setOpen(false)}
                className="mt-2 flex min-h-[44px] items-center justify-center rounded-full border border-neon-glassHi px-4 text-body-m text-neon-ink transition-colors hover:border-neon-violet/40 hover:text-white"
              >
                Sign in
              </Link>
            ) : null}
            {cta ? (
              <Link
                href={cta.href}
                onClick={() => setOpen(false)}
                className="type-display mt-4 inline-flex min-h-[48px] items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-neon-violet to-neon-magenta px-5 py-3 text-body-m text-white shadow-neon-violet"
              >
                {cta.label}
                <span aria-hidden="true">→</span>
              </Link>
            ) : null}
          </nav>
        </div>
      </div>
    </>
  );
}
