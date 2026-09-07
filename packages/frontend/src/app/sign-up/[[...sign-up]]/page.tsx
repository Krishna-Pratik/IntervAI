/**
 * Sign-up route — /sign-up
 *
 * Catch-all segment ([[...sign-up]]) is intentional: Clerk manages the
 * full sign-up flow (continue, verify-email-address, sso-callback, etc.)
 * by navigating to sub-paths under /sign-up, and the catch-all means
 * every one of those resolves to this same page without us defining each
 * one explicitly.
 *
 * Mirrors the architecture of /sign-in: server component page, client
 * shell that handles auth state + redirect, client panel that renders
 * the themed <SignUp />, and a separate appearance map so the styling
 * surface is reusable.
 */

import { SignUpShell } from './_components/SignUpShell';

export default function SignUpPage() {
  return <SignUpShell />;
}
