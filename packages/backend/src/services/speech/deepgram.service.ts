/**
 * Deepgram live transcription — raw `ws` instead of the SDK (we only
 * need streaming; the SDK is far heavier than the protocol we use).
 * Send binary audio frames, receive JSON transcript events, send a
 * CloseStream frame to flush finals. Raw audio is never persisted.
 */

import WebSocket from 'ws';
import { config } from '../../shared/config/index.js';

export interface DeepgramTranscriptEvent {
  /** Whether this is a final (committed) transcript or a partial preview */
  isFinal: boolean;
  /** The transcript text (may be empty for partial frames with no speech yet) */
  text: string;
}

export interface DeepgramSessionOptions {
  /** Language code, e.g. 'en'. Defaults to 'en' */
  language?: string;
  /** Smart-format punctuation + casing */
  smartFormat?: boolean;
  /** Interim (partial) results on each frame — needed for live UI */
  interimResults?: boolean;
  /** Voice activity detection — Deepgram will auto-detect end-of-utterance */
  vad?: boolean;
  /** Endpointing in ms — how long of a pause to wait before closing a segment */
  endpointingMs?: number;
}

export interface DeepgramSession {
  /** Stream a chunk of audio to Deepgram. Buffer should be raw PCM/Opus/WebM. */
  sendAudio(chunk: Buffer | Uint8Array): void;
  /** Request that Deepgram flush the current segment (final transcript). */
  flush(): void;
  /** Close the connection gracefully. */
  close(): void;
  /** Fires for every transcript event (partial or final). */
  onTranscript(handler: (e: DeepgramTranscriptEvent) => void): void;
  /** Fires once if the connection errors out unrecoverably. */
  onError(handler: (err: Error) => void): void;
  /** Fires when the connection closes (cleanly or otherwise). */
  onClose(handler: (code: number, reason: string) => void): void;
  /** True if the underlying WebSocket is open and ready. */
  readonly isOpen: boolean;
}

/** Checked at open time — the key may legitimately be absent in CI/dev. */
function getApiKey(): string {
  if (!config.deepgramApiKey) {
    throw new Error('DEEPGRAM_API_KEY is not configured');
  }
  return config.deepgramApiKey;
}

/** Open a single-use live session; call close() when done. */
export function openDeepgramSession(
  options: DeepgramSessionOptions = {},
): DeepgramSession {
  const apiKey = getApiKey();
  const params = new URLSearchParams({
    model: 'nova-2',
    language: options.language ?? 'en',
    smart_format: String(options.smartFormat ?? true),
    interim_results: String(options.interimResults ?? true),
    vad_events: String(options.vad ?? true),
    endpointing: String(options.endpointingMs ?? 300),
    encoding: 'webm', // matches MediaRecorder's default for Chrome / Firefox
    sample_rate: '48000',
  });

  const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`;

  const ws = new WebSocket(url, {
    headers: { Authorization: `Token ${apiKey}` },
  });

  let transcriptHandler: ((e: DeepgramTranscriptEvent) => void) | null = null;
  let errorHandler: ((err: Error) => void) | null = null;
  let closeHandler: ((code: number, reason: string) => void) | null = null;

  ws.on('message', (raw: Buffer | string) => {
    let msg: {
      type?: string;
      is_final?: boolean;
      channel?: { alternatives?: Array<{ transcript?: string }> };
      message?: string;
    };
    try {
      const text = typeof raw === 'string' ? raw : raw.toString('utf-8');
      msg = JSON.parse(text);
    } catch {
      return; // ignore non-JSON frames
    }

    if (msg.type === 'Results' && transcriptHandler) {
      const text = msg.channel?.alternatives?.[0]?.transcript ?? '';
      const event: DeepgramTranscriptEvent = {
        isFinal: Boolean(msg.is_final),
        text,
      };
      transcriptHandler(event);
    } else if (msg.type === 'Error' && errorHandler) {
      errorHandler(new Error(msg.message ?? 'Deepgram error'));
    }
  });

  ws.on('error', (err: Error) => {
    if (errorHandler) errorHandler(err);
  });

  ws.on('close', (code: number, reasonBuf: Buffer) => {
    if (closeHandler) {
      closeHandler(code, reasonBuf.toString('utf-8'));
    }
  });

  return {
    sendAudio(chunk: Buffer | Uint8Array) {
      if (ws.readyState !== WebSocket.OPEN) return;
      // Deepgram expects binary frames for audio
      ws.send(chunk as Buffer);
    },
    flush() {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: 'CloseStream' }));
    },
    close() {
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        try {
          ws.close(1000, 'client-closed');
        } catch {
          /* ignore */
        }
      }
    },
    onTranscript(handler) {
      transcriptHandler = handler;
    },
    onError(handler) {
      errorHandler = handler;
    },
    onClose(handler) {
      closeHandler = handler;
    },
    get isOpen() {
      return ws.readyState === WebSocket.OPEN;
    },
  };
}
