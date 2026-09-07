/**
 * Chat module — WebSocket route registration for /ws/interview/:sessionId.
 * Wire protocol and message flow are documented in chat.service.ts.
 *
 * Browsers can't set an Authorization header on a WS upgrade, so the
 * client authenticates by sending its Clerk JWT as the first message.
 */

import type { IncomingMessage } from 'http';
import type { Application } from 'express';
import type { WebSocketServer as WsWebSocketServer } from 'ws';
import WebSocket from 'ws';
import { handleInterviewMessage, type InterviewWsState } from './chat.service.js';

/** express-ws has no .d.ts — this is the shape it returns. */
export interface ExpressWsServer {
  app: Application;
  getWss(): WsWebSocketServer;
}

export function registerWebSocketRoutes(wsServer: ExpressWsServer): void {
  const app = wsServer.app as Application & {
    ws: (path: string, handler: (ws: WebSocket, req: IncomingMessage) => void) => void;
  };
  app.ws('/ws/interview/:sessionId', (ws: WebSocket, req: IncomingMessage) => {
    const sessionId =
      (req as IncomingMessage & { params?: Record<string, string> }).params?.sessionId ?? '';

    let state: InterviewWsState | null = null;

    ws.on('message', async (data: WebSocket.RawData) => {
      try {
        state = await handleInterviewMessage(ws, state, data as Buffer);
        // If extractSessionId couldn't read it off the upgrade request,
        // carry the route param over into the authenticated state.
        if (state && !state.sessionId && sessionId) {
          state.sessionId = sessionId;
        }
      } catch (err) {
        console.error('[chat] Unhandled error in WS handler:', err);
        try {
          ws.send(
            JSON.stringify({
              type: 'error',
              message: (err as Error).message ?? 'Internal error',
            }),
          );
        } catch {
          /* socket may be closed */
        }
      }
    });

    ws.on('close', () => {
      if (state?.dg) {
        try {
          state.dg.close();
        } catch {
          /* ignore */
        }
        state.dg = null;
      }
      try {
        ws.send(JSON.stringify({ type: 'session-ended' }));
      } catch {
        /* socket may already be closed */
      }
    });

    ws.on('error', (err: Error) => {
      console.error('[chat] WebSocket error:', err);
    });
  });
}
