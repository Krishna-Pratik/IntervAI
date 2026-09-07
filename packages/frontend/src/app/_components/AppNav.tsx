'use client';

/** Shared top nav for authenticated screens; the right cluster adapts to
 *  route + auth state so the chrome doesn't shift between pages. */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { useUser, SignInButton, UserButton } from '@clerk/nextjs';
import { userButtonAppearance } from './userButtonAppearance';
import { MobileMenu } from './MobileMenu';

const PRODUCT_LINKS = [
  // Home = the public landing page. Signed-in users can browse it too —
  // its own nav detects auth and swaps in "Open dashboard".
  { label: 'Home', href: '/' },
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Interview', href: '/interview' },
  { label: 'Billing', href: '/billing' },
];

export function AppNav() {
  const { isLoaded, isSignedIn } = useUser();
  const pathname = usePathname() ?? '';

  // Hide the CTA on /interview — the user is already there.
  const hidePrimaryCta = pathname.startsWith('/interview');

  return (
    <header className="sticky top-0 z-50 px-4 pt-4 sm:px-6 sm:pt-6">
      <nav
        className={clsx(
          // glass-strong alone is near-transparent — fine over static
          // page content, but this bar is sticky: scrolled text used to
          // bleed through and collide with the nav labels. The opaque
          // dark tint (inline so it beats the layer's shorthand) sits
          // under the blur so content fades out below it.
          'glass-strong mx-auto flex h-14 max-w-6xl items-center justify-between rounded-full px-5 sm:h-16 sm:px-7',
        )}
        style={{ backgroundColor: 'rgba(10, 10, 18, 0.88)' }}
      >
        {/* Wordmark → landing page, the site-wide convention. */}
        <Link
          href="/"
          className="type-display text-display-s text-gradient-neon-static transition-opacity hover:opacity-80"
          aria-label="IntervAI home"
        >
          IntervAI
        </Link>

        <div className="hidden items-center gap-7 text-body-m text-neon-ink2 sm:flex">
          {PRODUCT_LINKS.map((l) => {
            const active = pathname === l.href || pathname.startsWith(l.href + '/');
            return (
              <Link
                key={l.href}
                href={l.href}
                className={clsx(
                  'group flex items-center gap-2 transition-colors hover:text-neon-ink',
                  active && 'text-neon-ink',
                )}
              >
                <span
                  aria-hidden="true"
                  className={clsx(
                    'h-1 w-1 rounded-full transition-opacity',
                    active ? 'bg-neon-violet2 opacity-100' : 'bg-neon-violet2 opacity-0 group-hover:opacity-100',
                  )}
                />
                {l.label}
              </Link>
            );
          })}
        </div>

        {/* Right — CTA + auth cluster; mobile menu is mounted always and
            hides itself below sm so the desktop cluster stays intact. */}
        <div className="flex items-center gap-2 sm:gap-3">
          {!hidePrimaryCta ? (
            <Link
              href="/interview"
              className="type-display hidden min-h-[40px] items-center gap-1.5 rounded-full bg-gradient-to-r from-neon-violet to-neon-magenta px-4 py-2 text-sm text-white shadow-neon-violet transition-transform hover:scale-[1.03] sm:inline-flex sm:px-5"
            >
              Start a session
              <span aria-hidden="true">→</span>
            </Link>
          ) : null}

          {!isLoaded ? null : isSignedIn ? (
            <UserButton
              appearance={userButtonAppearance}
              // Clerk-hosted profile pages aren't set up, so keep the menu minimal.
              showName={false}
            />
          ) : (
            <SignInButton mode="modal">
              <button
                type="button"
                className="type-display hidden min-h-[40px] rounded-full border border-neon-glassHi px-4 py-2 text-sm text-neon-ink transition-colors hover:border-neon-violet/40 hover:text-white sm:inline-flex sm:px-5"
              >
                Sign in
              </button>
            </SignInButton>
          )}

          {/* Mobile sheet — CTA and auth links are route/auth-aware because
              the desktop cluster is hidden below sm. */}
          <MobileMenu
            links={PRODUCT_LINKS}
            cta={
              hidePrimaryCta
                ? { label: 'Back to dashboard', href: '/dashboard' }
                : { label: 'Start a session', href: '/interview' }
            }
            authState={isLoaded ? { isSignedIn } : null}
          />
        </div>
      </nav>
    </header>
  );
}
