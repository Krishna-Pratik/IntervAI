/**
 * Base API router — mounts the domain module routers under /api/v1.
 *
 * The Razorpay webhook is deliberately NOT here: it is mounted in
 * index.ts BEFORE the global express.json() so it can verify the
 * signature against the raw body.
 */

import { Router } from 'express';
import { requireAuth } from './middleware/auth.middleware.js';
import { resumeRouter } from '../modules/resume/resume.routes.js';
import { interviewRouter } from '../modules/interview/interview.routes.js';
import { billingRouter } from '../modules/billing/billing.routes.js';
import { analyticsRouter } from '../modules/analytics/analytics.routes.js';

export const apiRouter = Router();

// Health (no auth)
apiRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'intervai-backend' });
});

// Everything below requires authentication
const protectedRouter = Router();
protectedRouter.use(requireAuth);

protectedRouter.use('/resumes', resumeRouter);
protectedRouter.use('/interview', interviewRouter);
protectedRouter.use('/billing', billingRouter);
protectedRouter.use('/analytics', analyticsRouter);

apiRouter.use('/protected', protectedRouter);