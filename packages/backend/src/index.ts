/**
 * IntervAI backend entry point.
 *
 * Middleware order is significant:
 *   1. CORS
 *   2. Razorpay webhook router (its own raw-body parser — MUST come
 *      before global express.json() so the signature is verified
 *      against the raw bytes)
 *   3. express.json() / urlencoded for the rest of the API
 *   4. Clerk middleware
 *   5. API routes
 *   6. WebSocket routes
 */

import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import * as expressWsNs from 'express-ws';
import { clerkMiddleware } from '@clerk/express';

// express-ws is CJS — under Node's interop the callable is on `.default`,
// and the package ships no usable TS types, so the return type is manual.
type ExpressWsServer = {
  app: express.Express;
  getWss: () => import('ws').WebSocketServer;
};
const expressWs = (
  expressWsNs as unknown as { default: (app: express.Express, server?: unknown) => ExpressWsServer }
).default;

const PORT = process.env.PORT ?? 4000;
const NODE_ENV = process.env.NODE_ENV ?? 'development';

const app = express();

// CORS — restrict to frontend origin in production
app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  }),
);

// Razorpay webhook — mounted BEFORE the global json parser so it gets the
// raw body for signature verification. (Has its own per-route rawJson parser.)
import { webhookRouter } from './modules/webhook/webhook.routes.js';
app.use('/api/v1/webhook', webhookRouter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Clerk middleware — runs on every request, populates req.auth
app.use(clerkMiddleware());

const wsServer = expressWs(app);

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
  });
});

import { apiRouter } from './shared/api-router.js';
app.use('/api/v1', apiRouter);

import { registerWebSocketRoutes } from './modules/chat/chat.routes.js';
registerWebSocketRoutes(wsServer);

// Unknown /api/v1 paths → JSON 404 (Express's default HTML "Cannot GET"
// page is unparsable by the axios client).
app.use('/api/v1', (_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler — routes forward via next(err); without this,
// Express replies with an HTML stack page. The stack is logged
// server-side; the client only ever sees a clean JSON error.
app.use(
  // Express identifies error middleware by its 4-parameter arity, so the
  // unused `_next` below is load-bearing even though lint can't know it.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  (err: Error, req: Request, res: Response, _next: NextFunction): void => {
    console.error(`[api] ${req.method} ${req.originalUrl} failed:`, err);
    const statusCode = (err as { statusCode?: unknown }).statusCode;
    const status = typeof statusCode === 'number' ? statusCode : 500;
    res.status(status).json({
      error: status >= 500 ? 'Internal server error' : err.message,
      ...(NODE_ENV === 'development' ? { message: err.message } : {}),
    });
  },
);

// Under tsx, `process.argv[1]` is the tsx CLI, not this file, so the usual
// entry-point check falsely fails — use env guards instead, leaving tests
// able to import the app without it listening.
const shouldListen = process.env.NODE_ENV !== 'test' && process.env.SUPPRESS_LISTEN !== '1';

if (shouldListen) {
  app.listen(Number(PORT), () => {
    console.log(`[IntervAI Backend] Server running on port ${PORT} (${NODE_ENV})`);
  });
}

export { app as default };
