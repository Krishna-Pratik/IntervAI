/**
 * Billing routes (all behind requireAuth): access decision, subscription
 * state, checkout, cancel. Webhooks live in the webhook module.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import {
  requireAuth,
  getUserId,
  getUserEmail,
} from '../../shared/middleware/auth.middleware.js';
import { validate, handleValidationErrors } from '../../shared/middleware/validate.middleware.js';
import { config } from '../../shared/config/index.js';
import {
  checkInterviewAccess,
  getActiveSubscription,
  listUserSubscriptions,
  createCheckoutSession,
  cancelUserSubscription,
  BillingError,
  PAYMENTS_ENABLED,
} from './billing.service.js';

export const billingRouter = Router();

const checkoutBodySchema = z.object({
  plan: z.enum(['pro_monthly', 'pro_yearly']),
  trialDays: z.number().int().min(0).max(30).optional(),
});

billingRouter.get(
  '/access',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const email = getUserEmail(req, userId);
      // Email lets the ADMIN_EMAILS override work without a DB read.
      const decision = await checkInterviewAccess(userId, email);
      res.json(decision);
    } catch (err) {
      if (err instanceof BillingError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      next(err);
    }
  },
);

billingRouter.get(
  '/subscription',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const active = await getActiveSubscription(userId);
      const all = await listUserSubscriptions(userId);
      res.json({ active, history: all });
    } catch (err) {
      if (err instanceof BillingError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      next(err);
    }
  },
);

// Publishable config for the Razorpay checkout widget. The key id is a
// public identifier (safe for the browser); the secret never leaves the
// server, and this endpoint cannot create or activate anything.
billingRouter.get(
  '/checkout-config',
  requireAuth,
  async (_req: Request, res: Response) => {
    const keyId = config.razorpayKeyId ?? '';
    if (!keyId) {
      res.status(503).json({ error: 'Billing is not configured yet.' });
      return;
    }
    res.json({
      keyId,
      currency: 'INR',
      // Paise, matching the prices shown on the plan cards.
      amounts: { pro_monthly: 49900, pro_yearly: 499900 },
      paymentsEnabled: PAYMENTS_ENABLED,
    });
  },
);

// The client renders Razorpay's checkout widget with the returned id.
billingRouter.post(
  '/checkout',
  requireAuth,
  validate.body(checkoutBodySchema),
  handleValidationErrors,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const body = (req as Request & { validated?: { body?: { plan: 'pro_monthly' | 'pro_yearly'; trialDays?: number } } })
        .validated?.body;
      if (!body) {
        res.status(400).json({ error: 'Invalid request body' });
        return;
      }
      const result = await createCheckoutSession({
        userId,
        email: getUserEmail(req, userId),
        plan: body.plan,
        trialDays: body.trialDays,
      });
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof BillingError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      next(err);
    }
  },
);

billingRouter.post(
  '/cancel',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const result = await cancelUserSubscription(userId);
      res.json({ subscription: result });
    } catch (err) {
      if (err instanceof BillingError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      next(err);
    }
  },
);
