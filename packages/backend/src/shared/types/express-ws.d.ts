/**
 * Type declarations for express-ws.
 * express-ws does not ship its own TypeScript definitions.
 */

declare module 'express-ws' {
  import { Application, RequestHandler } from 'express';
  import type { Server as HttpServer } from 'http';

  interface WebSocket {
    send(data: string): void;
    send(data: Buffer): void;
    close(): void;
    close(code?: number, reason?: string): void;
    on(event: 'message', listener: (data: unknown) => void): this;
    on(event: 'close', listener: (code: number, reason: Buffer) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'pong', listener: () => void): this;
  }

  interface Server extends Application {
    getWss(path?: string): { clients: Set<WebSocket> };
    app: Application;
    ws(path: string, ...handlers: RequestHandler[]): void;
    ws(path: string, options: unknown, ...handlers: RequestHandler[]): void;
  }

  interface ExpressWS {
    app: Server;
    server: Server;
  }

  function expressWs(app: Application, server?: HttpServer, options?: Record<string, unknown>): ExpressWS;
}
