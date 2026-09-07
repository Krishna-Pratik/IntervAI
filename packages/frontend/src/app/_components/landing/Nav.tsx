'use client';

/**
 * Nav — glass nav for the home / marketing page.
 *
 * Auth-aware: signed-in users see "Features" + "New session" links (the
 * Dashboard job belongs to the CTA, which becomes "Open dashboard") plus
 * the Clerk avatar menu — the same account controls the app nav offers.
 * Signed-out keeps "Sign in" / "Try a session". The wordmark is a
 * violet→cyan gradient and the primary CTA is a violet pill — same
 * vocabulary as the rest of the landing page.
 *
 * Sticky from the top. Scrolling past 8px deepens the glass tint so
 * the nav reads as a separate layer over the page.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useUser, UserButton } from '@clerk/nextjs';
import clsx from 'clsx';
import { Logo } from '../../../components/brand/Logo';
import { MobileMenu } from '../MobileMenu';
import { userButtonAppearance } from '../userButtonAppearance';

const publicLinks = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how' },
  { label: 'Pricing', href: '#pricing' },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const { isLoaded, isSignedIn } = useUser();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // While Clerk is still resolving, render the unauthed variant so the
  // nav doesn't flicker. Once we know the user, swap the links + CTA.
  const showAuthed = isLoaded && isSignedIn;
  const links = showAuthed
    ? [
        // No Dashboard link here — the "Open dashboard" CTA already owns
        // that job. Features fills the slot and scrolls to its section.
        { label: 'Features', href: '#features' },
        { label: 'New session', href: '/interview' },
      ]
    : [...publicLinks, { label: 'Sign in', href: '/sign-in' }];
  const cta = showAuthed
    ? { label: 'Open dashboard', href: '/dashboard' }
    : { label: 'Try a session', href: '/interview' };

  return (
    <header className="sticky top-0 z-50 px-4 pt-4 sm:px-6 sm:pt-5">
      {/*
        Solid near-black scrim behind the nav. Without this, the glass
        tint (~4% white) lets the page content bleed through and mix with
        the nav links. Two layers stacked:
          - the scrim is a full-width near-black band, opacity stepped
            up once we scroll so it reads as a clear surface
          - the nav pill sits on top with its own glass tint
      */}
      <div
        aria-hidden="true"
        className={clsx(
          'pointer-events-none fixed inset-x-0 top-0 -z-10 h-28 transition-opacity duration-300',
          'bg-gradient-to-b from-neon-black via-neon-black/95 to-neon-black/0',
          scrolled ? 'opacity-100' : 'opacity-90',
        )}
      />
      <nav
        className={clsx(
          'relative mx-auto flex h-14 max-w-6xl items-center justify-between rounded-full border px-5 transition-all duration-300 sm:h-16 sm:px-7',
          'backdrop-blur-xl',
          scrolled
            ? // scrolled: solid dark surface, clear separator
              'border-neon-glassHi bg-neon-black/85 shadow-neon-soft'
            : // at top: dark glass, still readable on hero
              'border-neon-glass bg-neon-black/70',
        )}
      >
        <Link
          href="/"
          className="type-display text-display-s text-gradient-neon-static"
          aria-label="IntervAI home"
        >
          <Logo markSize={26} />
        </Link>

        <div className="hidden items-center gap-6 text-body-m text-neon-ink2 sm:flex">
          {links.map((l) => {
            // For in-page anchors, intercept the click and force a
            // smooth scroll on every press — even when the hash is
            // already set, since the browser only re-scrolls on a
            // hash change. Without this, clicking "Features" twice
            // (or clicking it after the user has scrolled away and
            // back to the same hash) silently does nothing.
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
              // Update the URL without re-triggering a hash-jump.
              if (window.location.hash !== l.href) {
                window.history.replaceState(
                  null,
                  '',
                  `${window.location.pathname}${window.location.search}${l.href}`,
                );
              }
            };
            return (
              <Link
                key={l.href}
                href={l.href}
                onClick={handleClick}
                className="group flex items-center gap-2 transition-colors hover:text-neon-ink"
              >
                <span
                  aria-hidden="true"
                  className="h-1 w-1 rounded-full bg-neon-violet2 opacity-0 transition-opacity group-hover:opacity-100"
                />
                {l.label}
              </Link>
            );
          })}
        </div>

        {/* Right side: the primary CTA on sm+ and a hamburger button
            on <sm that opens a sheet with the same links. The two
            share the same vertical rhythm so the nav stays balanced
            when the cluster expands. On phones the CTA is hidden and
            lives inside the mobile sheet so the nav pill stays compact. */}
        <div className="flex items-center gap-2">
          <Link
            href={cta.href}
            className="type-display hidden min-h-[40px] items-center gap-1.5 rounded-full bg-gradient-to-r from-neon-violet to-neon-magenta px-4 py-2 text-sm text-white shadow-neon-violet transition-transform hover:scale-[1.03] sm:inline-flex sm:px-5"
          >
            {cta.label}
            <span aria-hidden="true">→</span>
          </Link>
          {/* Signed-in users get the same avatar menu they see in the
              app nav — account controls shouldn't vanish on the landing
              page. */}
          {showAuthed ? (
            <UserButton appearance={userButtonAppearance} showName={false} />
          ) : null}
          <MobileMenu
            links={links}
            cta={cta}
            authState={isLoaded ? { isSignedIn } : null}
          />
        </div>
      </nav>
    </header>
  );
}
