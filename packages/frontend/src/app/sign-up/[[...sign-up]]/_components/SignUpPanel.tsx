'use client';

/**
 * SignUpPanel — themed Clerk <SignUp /> embedded in our design system.
 *
 * Mirrors SignInPanel. The only behavioural differences are the Clerk
 * component (SignUp vs SignIn) and the post-auth redirect target. All
 * styling lives in signUpAppearance so the panel stays a thin wrapper.
 *
 * `signInUrl` is set so the "Already have an account?" link at the
 * bottom of the form sends the user back to /sign-in.
 */

import { SignUp } from '@clerk/nextjs';
import { signUpAppearance } from './signUpAppearance';

export function SignUpPanel() {
  return (
    <SignUp
      appearance={signUpAppearance}
      // After a successful sign-up, land on the dashboard. The clerk
      // callback handler will run before this redirect so any post-sign-up
      // housekeeping (subscription row, welcome email) completes first.
      forceRedirectUrl="/dashboard"
      signInUrl="/sign-in"
    />
  );
}
