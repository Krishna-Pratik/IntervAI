'use client';

/**
 * SignInShell — split-screen layout for /sign-in: aurora + value-prop
 * left column, glass card with the themed Clerk <SignIn /> right.
 * Single 100vh viewport — below lg the left column hides and the form
 * takes the full screen (scrollable).
 *
 * Already-signed-in users redirect to /dashboard from an effect — not
 * Next's `redirect()` — because the decision depends on the useUser
 * hook, which can't drive a render-path redirect.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { Logo } from '../../../../components/brand/Logo';
import { SignInPanel } from './SignInPanel';

export function SignInShell() {
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace('/dashboard');
    }
  }, [isLoaded, isSignedIn, router]);

  return (
    <div className="relative isolate h-screen overflow-hidden bg-neon-black text-neon-ink lg:grid lg:grid-cols-2">
      {/* A fixed near-black layer so the aurora and orbs sit on a true
          neon canvas, not the warmer ink color from the root layout. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 bg-neon-black"
      />

      {/* =========================================================
       * LEFT — brand + value prop, with the neon aurora
       * backdrop sitting behind the copy. Hidden on small screens;
       * the form owns the viewport there.
       * ========================================================= */}
      <aside className="relative hidden overflow-hidden bg-neon-black lg:flex lg:flex-col lg:justify-between lg:px-10 lg:py-7 xl:px-14">
        {/* Aurora — same recipe as the landing hero, but
            contained inside the left column so it never bleeds into
            the form column. The radial mask keeps the orbs away from
            the column edge. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10"
        >
          <div className="absolute inset-0 bg-aurora animate-aurora-spin" />
          <div className="absolute -left-20 top-1/3 h-60 w-60 rounded-full bg-neon-violet/30 blur-3xl animate-orb-drift" />
          <div className="absolute right-0 bottom-10 h-64 w-64 rounded-full bg-neon-cyan/20 blur-3xl animate-orb-drift" />
          <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-neon-black to-transparent" />
        </div>

        {/* Top — gradient wordmark */}
        <div>
          <Link
            href="/"
            className="type-display text-display-s text-gradient-neon-static transition-opacity hover:opacity-80"
            aria-label="IntervAI home"
          >
            <Logo markSize={26} />
          </Link>
        </div>

        {/* Middle — the value prop, centred vertically */}
        <div className="mx-auto w-full max-w-md">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-neon-glassHi bg-neon-surface/60 px-2.5 py-1 text-eyebrow text-neon-ink2 backdrop-blur">
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full bg-neon-violet2 animate-pulse-dot"
            />
            For job-seekers
          </span>

          {/* Headline — display-m (compact) so it fits one viewport
              even on shorter laptop screens. Gradient on the second
              clause, like the home page. */}
          <h1 className="type-display mt-4 text-display-m text-neon-ink lg:text-display-l">
            Run the interview out loud.{' '}
            <span className="text-gradient-neon-static">Hear where the answer breaks.</span>
          </h1>

          <p className="mt-4 max-w-md text-body-m text-neon-ink2">
            Upload your resume, talk through a live interview, and get
            per-question scoring — as you answer.
          </p>

          {/* Three value rows in mono — kept as a single horizontal
              row on desktop so the column doesn't grow vertically. */}
          <ul className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1.5 font-mono text-mono text-neon-ink2">
            <li className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-px w-3 bg-neon-violet2" />
              5 free sessions
            </li>
            <li className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-px w-3 bg-neon-cyan" />
              Spoken scoring
            </li>
            <li className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-px w-3 bg-neon-magenta" />
              Progress tracked
            </li>
          </ul>
        </div>

        {/* Bottom — quiet back link + tiny build stamp */}
        <div className="flex items-center justify-between font-mono text-mono text-neon-ink3">
          <Link
            href="/"
            className="transition-colors hover:text-neon-ink2"
          >
            ← Back to intervai.com
          </Link>
        </div>
      </aside>

      {/* =========================================================
       * RIGHT — the form panel, on a glass surface so it reads as
       * a distinct card without a hard border. On mobile this is
       * the entire screen.
       * ========================================================= */}
      <main className="relative flex h-screen flex-col overflow-hidden bg-neon-surface lg:h-auto lg:justify-center lg:px-10 lg:py-7 xl:px-14">
        {/* Tiny live indicator top-right while Clerk is loading. The
            point is to acknowledge the state without using a spinner. */}
        {!isLoaded ? (
          <div
            className="absolute right-5 top-5 flex items-center gap-2 font-mono text-mono text-neon-ink3 lg:right-8 lg:top-6"
            aria-live="polite"
          >
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full bg-neon-violet2 animate-pulse-dot"
            />
            Loading
          </div>
        ) : null}

        {/* Mobile-only wordmark — hidden on lg+ where the left column
            already carries it. */}
        <div className="px-6 pt-8 lg:hidden">
          <Link
            href="/"
            className="type-display text-display-m text-gradient-neon-static transition-opacity hover:opacity-80"
            aria-label="IntervAI home"
          >
            <Logo markSize={22} />
          </Link>
        </div>

        <div className="mx-auto flex w-full max-w-[30rem] flex-1 flex-col justify-center overflow-hidden px-6 py-6 sm:px-0 lg:py-0">
          {/* Glass card hosts the form. Wider than the form content so
              Clerk's internal form has room to render at its natural
              width without the right border clipping. min-h-0 lets the
              inner Clerk panel scroll instead of the page, when the
              form is taller than the panel. */}
          <div className="glass-strong shadow-neon-soft relative flex min-h-0 flex-col overflow-hidden rounded-3xl px-6 py-7 sm:px-10 sm:py-8">
            {/* Two soft orbs inside the card so it picks up the same
                aurora feel as the rest of the app. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full bg-neon-violet/20 blur-3xl"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-16 -right-16 h-56 w-56 rounded-full bg-neon-cyan/15 blur-3xl"
            />

            <div className="relative mb-4 shrink-0">
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-neon-glassHi bg-neon-surface/60 px-2.5 py-1 text-eyebrow text-neon-ink2 backdrop-blur">
                <span
                  aria-hidden="true"
                  className="inline-block h-1.5 w-1.5 rounded-full bg-neon-violet2 animate-pulse-dot"
                />
                Sign in
              </span>
              <h2 className="type-display mt-3 text-display-s text-neon-ink">
                Welcome back.
              </h2>
              <p className="mt-1 text-body-m text-neon-ink2">
                Sign in to keep practicing.
              </p>
            </div>

            {/* Themed Clerk sign-in. Clerk handles the actual flow
                (email → password → 2FA → redirect to /dashboard).
                No scroll on this wrapper — the form is sized to fit
                in one viewport at standard sizes. */}
            <div className="relative min-h-0 flex-1 overflow-hidden">
              <SignInPanel />
            </div>

            <p className="relative mt-4 shrink-0 text-center text-body-m text-neon-ink2">
              No account?{' '}
              <Link
                href="/sign-up"
                className="inline-flex min-h-[28px] items-center rounded-md px-1.5 text-neon-ink transition-colors hover:text-neon-violet2"
              >
                Start practicing
                <span aria-hidden="true"> →</span>
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
