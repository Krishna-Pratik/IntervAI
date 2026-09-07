/**
 * Clerk auth middleware. NOTE: in @clerk/express v2 `req.auth` is a
 * FUNCTION returning the AuthObject — reading `req.auth.userId` is
 * always undefined; go through getUserId/getUserEmail below.
 */

import { clerkMiddleware, getAuth } from '@clerk/express';
import type { Request, Response, NextFunction } from 'express';

export { clerkMiddleware as clerkAuthMiddleware };

/**
 * 401 JSON (no redirect) when there's no valid session.
 *
 * Re-implemented against getAuth() rather than Clerk's deprecated
 * requireAuth wrapper: the wrapper re-ran authentication a second
 * time, which hung indefinitely on multipart uploads.
 */
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = getAuth(req);
    if (!auth?.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

/** Clerk user id off the request; throws a 401-mapped error if absent. */
export function getUserId(req: Request): string {
  const auth = (req as Request & { auth?: unknown }).auth;
  const userId =
    typeof auth === 'function'
      ? (auth as () => { userId?: string })()?.userId
      : (auth as { userId?: string } | undefined)?.userId; // v1 shape, kept for downgrade safety
  if (!userId) {
    throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
  }
  return userId;
}

/** Session-claims email, or a placeholder when the token omits it. */
export function getUserEmail(req: Request, userId: string): string {
  const auth = (req as Request & { auth?: unknown }).auth;
  const claims =
    typeof auth === 'function'
      ? (auth as () => { sessionClaims?: unknown })()?.sessionClaims
      : (auth as { sessionClaims?: unknown } | undefined)?.sessionClaims;
  const typed = claims as { email?: string; primary_email?: string } | undefined;
  return typed?.email ?? typed?.primary_email ?? `${userId}@unknown.invalid`;
}
