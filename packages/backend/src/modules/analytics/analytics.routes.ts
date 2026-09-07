/**
 * Analytics routes (all behind requireAuth). Query params are bounded
 * by hand — not worth a Zod schema per route. userId always comes from
 * Clerk auth, never from the query.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireAuth, getUserId } from '../../shared/middleware/auth.middleware.js';
import {
  getOverviewMetrics,
  getScoreTrend,
  getPerformanceByRole,
  getPerformanceByDifficulty,
  getSourceMix,
  getTopFeedbackThemes,
} from './analytics.service.js';

/** Minimal HTTP error so we don't have to import every Error class. */
class HttpError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

// HttpError → its status; everything else → next(). Keeps route bodies short.
function wrap(
  handler: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  return async (req, res, next) => {
    try {
      await handler(req, res);
    } catch (err) {
      if (res.headersSent) return next(err);
      if (err instanceof HttpError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      next(err);
    }
  };
}

export const analyticsRouter = Router();

analyticsRouter.get(
  '/overview',
  requireAuth,
  wrap(async (req, res) => {
    const userId = getUserId(req);
    const metrics = await getOverviewMetrics(userId);
    res.json(metrics);
  }),
);

// GET /trend?days=30 — days bounded to [1, 90]
analyticsRouter.get(
  '/trend',
  requireAuth,
  wrap(async (req, res) => {
    const userId = getUserId(req);
    const daysParam = Number((req.query as Record<string, string>).days ?? '30');
    const days = Math.min(90, Math.max(1, Number.isFinite(daysParam) ? daysParam : 30));
    const trend = await getScoreTrend(userId, days);
    res.json({ days, trend });
  }),
);

// GET /by-role?limit=8 — top roles by session count
analyticsRouter.get(
  '/by-role',
  requireAuth,
  wrap(async (req, res) => {
    const userId = getUserId(req);
    const limitParam = Number((req.query as Record<string, string>).limit ?? '8');
    const limit = Math.min(20, Math.max(1, Number.isFinite(limitParam) ? limitParam : 8));
    const rows = await getPerformanceByRole(userId, limit);
    res.json({ rows });
  }),
);

// GET /by-difficulty — always all three, even 0-session ones
analyticsRouter.get(
  '/by-difficulty',
  requireAuth,
  wrap(async (req, res) => {
    const userId = getUserId(req);
    const rows = await getPerformanceByDifficulty(userId);
    res.json({ rows });
  }),
);

// GET /source-mix
analyticsRouter.get(
  '/source-mix',
  requireAuth,
  wrap(async (req, res) => {
    const userId = getUserId(req);
    const rows = await getSourceMix(userId);
    res.json({ rows });
  }),
);

// GET /feedback-themes?kind=strengths|weaknesses&limit=5
analyticsRouter.get(
  '/feedback-themes',
  requireAuth,
  wrap(async (req, res) => {
    const userId = getUserId(req);
    const q = req.query as Record<string, string>;
    const kindRaw = q.kind ?? 'strengths';
    if (kindRaw !== 'strengths' && kindRaw !== 'weaknesses') {
      res.status(400).json({ error: 'kind must be "strengths" or "weaknesses"' });
      return;
    }
    const limitParam = Number(q.limit ?? '5');
    const limit = Math.min(20, Math.max(1, Number.isFinite(limitParam) ? limitParam : 5));
    const rows = await getTopFeedbackThemes(userId, kindRaw, limit);
    res.json({ kind: kindRaw, rows });
  }),
);
