'use client';

/**
 * Text-mode interview page → redirect shim.
 *
 * The product is voice-first: interview practice means speaking,
 * not typing. New sessions created from /interview route straight
 * to /interview/<id>/live. This route is kept only as a redirect
 * so that any old bookmark, shared link, or in-flight tab still
 * lands the user on the live (mic + camera) screen.
 *
 * Why a client-side redirect and not a `redirect()` in the
 * route file?
 *   - We still need to bounce signed-out visitors to /sign-in
 *     (preserving the same auth behavior as the other interview
 *     routes).
 *   - The auth check uses Clerk's `useAuth()` hook, which is
 *     client-only — a server `redirect()` would fire before
 *     Clerk resolves and skip the auth-redirect logic.
 *
 * The redirect uses `router.replace` so the text-mode URL doesn't
 * sit in the back/forward history.
 */

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { AppShell } from '../../_components/AppShell';
import { CenterMessage } from '../../_components/CenterMessage';

export default function TextModeRedirect() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const sessionId = params?.sessionId;

  // Bounce signed-out visitors straight to the sign-in screen, with
  // `redirect_url` so Clerk returns them to the live screen after
  // sign-in. Same pattern as /interview and /interview/[id]/live.
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      const back = `/interview/${sessionId}/live`;
      router.replace(
        `/sign-in?redirect_url=${encodeURIComponent(back)}`,
      );
      return;
    }
    // Signed-in: jump to the live (voice) screen. We use `replace`
    // so the text-mode URL is replaced in history — the user can't
    // hit "back" and land on this redirect-only route.
    if (isLoaded && isSignedIn && sessionId) {
      router.replace(`/interview/${sessionId}/live`);
    }
  }, [isLoaded, isSignedIn, sessionId, router]);

  return (
    <AppShell>
      <CenterMessage>Opening live interview…</CenterMessage>
    </AppShell>
  );
}
