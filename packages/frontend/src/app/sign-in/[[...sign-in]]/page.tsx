/**
 * Sign-in route — /sign-in
 *
 * Catch-all segment ([[...sign-in]]) is intentional: Clerk manages the
 * full sign-in flow (factor-one, verify-email-address, reset-password,
 * sso-callback, etc.) by navigating to sub-paths under /sign-in, and
 * the catch-all means every one of those resolves to this same page
 * without us defining each one explicitly.
 *
 * This is a server component that delegates the actual UI to
 * SignInShell, which is a client component (it needs `useUser` to
 * detect an already-signed-in user and redirect to /dashboard).
 */

import { SignInShell } from './_components/SignInShell';

export default function SignInPage() {
  return <SignInShell />;
}
