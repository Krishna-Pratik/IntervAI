'use client';

/**
 * SignInPanel — themed Clerk <SignIn /> embedded in our design system.
 * The appearance object maps Clerk's tokens onto the neon palette
 * (see ./signInAppearance). We deliberately keep Clerk's component
 * structure (factor-one, verify-email, etc.) — the flow itself is
 * correct and battle-tested — and only restyle the primitives.
 */

import { SignIn } from '@clerk/nextjs';
import { signInAppearance } from './signInAppearance';

export function SignInPanel() {
  return (
    <SignIn
      appearance={signInAppearance}
      // Redirect after a successful sign-in. The dashboard is the
      // single landing point for authenticated users (see
      // packages/frontend/src/app/dashboard/page.tsx).
      forceRedirectUrl="/dashboard"
      signUpUrl="/sign-up"
    />
  );
}
