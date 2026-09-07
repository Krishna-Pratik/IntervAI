/**
 * useLiveTranscription — real speech-to-text via the browser's Web
 * Speech API (Chrome/Edge; the audio is transcribed by the browser's
 * own service, so no app-side key or backend is involved).
 *
 * Behaviour notes:
 *   - `start()` must be called AFTER getUserMedia has resolved — on a
 *     first session Chrome rejects speech recognition outright while
 *     the mic-permission prompt is still up, which looked like "it
 *     never transcribes".
 *   - `continuous` + auto-restart in `onend`: Chrome closes a session
 *     after a silence gap even in continuous mode, so we relaunch it
 *     (after a short delay — an immediate start() races a not-yet-closed
 *     engine and throws) while the candidate is still recording.
 *   - `stop()` resolves once the engine flushes its last pending
 *     result (with a safety timeout in case `onend` never fires), so
 *     "Stop & submit" captures the final words, not a stale snapshot.
 *   - `error` surfaces hard failures (permission blocked, speech
 *     service unavailable) so the UI can tell the candidate why the
 *     transcript is empty instead of showing "Listening…" forever.
 *   - Unsupported browsers (Firefox) get `supported: false` and the
 *     page falls back to a type-your-answer box.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
}

type WindowWithSR = Window & {
  SpeechRecognition?: new () => RecognitionLike;
  webkitSpeechRecognition?: new () => RecognitionLike;
};

function errorHint(code: string | undefined): string | null {
  switch (code) {
    case 'not-allowed':
      return 'Speech recognition was blocked. Click the mic icon in the address bar and allow microphone + speech access, then start again.';
    case 'service-not-allowed':
      return "Your browser's speech service is turned off. In Chrome, enable it under Settings → Privacy → Use of web services, then start again.";
    case 'audio-capture':
      return 'No microphone was found. Check that one is connected and not in use by another app.';
    case 'network':
      return 'Speech recognition needs the network and it could not be reached. Check your connection and start again.';
    default:
      return null; // 'no-speech' / 'aborted' are transient.
  }
}

export function useLiveTranscription() {
  const [finalText, setFinalText] = useState('');
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<RecognitionLike | null>(null);
  // True while the candidate should still be recording — drives the
  // onend auto-restart decision.
  const activeRef = useRef(false);
  // Accumulated finals kept in a ref so stop() can read the complete
  // text synchronously after the final onresult arrives.
  const finalRef = useRef('');
  const doneResolveRef = useRef<(() => void) | null>(null);
  const restartTimerRef = useRef<number | null>(null);

  const supported =
    typeof window !== 'undefined' &&
    !!((window as WindowWithSR).SpeechRecognition ||
      (window as WindowWithSR).webkitSpeechRecognition);

  const start = useCallback(() => {
    if (!supported) return;
    // Tear down any previous engine before starting a new one.
    activeRef.current = false;
    if (restartTimerRef.current) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    try {
      recRef.current?.abort();
    } catch {
      // already stopped
    }

    finalRef.current = '';
    setFinalText('');
    setInterimText('');
    setError(null);
    activeRef.current = true;

    const Ctor =
      (window as WindowWithSR).SpeechRecognition ??
      (window as WindowWithSR).webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (e: SpeechResultEvent) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (!r) continue;
        if (r.isFinal) {
          finalRef.current += r[0].transcript.trim() + ' ';
        } else {
          interim += r[0].transcript;
        }
      }
      setFinalText(finalRef.current.trim());
      setInterimText(interim);
    };

    rec.onend = () => {
      if (!activeRef.current) {
        doneResolveRef.current?.();
        doneResolveRef.current = null;
        return;
      }
      // Chrome fires onend after silence gaps; an immediate start()
      // can throw because the previous session hasn't fully closed —
      // retry on the next tick, and if that also fails the engine
      // simply stays done (the error hint / empty-transcript path
      // tells the candidate to restart).
      restartTimerRef.current = window.setTimeout(() => {
        restartTimerRef.current = null;
        if (!activeRef.current) return;
        try {
          rec.start();
        } catch {
          // Engine died; leave transcript as-is.
        }
      }, 250);
    };

    rec.onerror = (e) => {
      const hint = errorHint(e?.error);
      if (hint) {
        setError(hint);
        activeRef.current = false;
      }
    };

    recRef.current = rec;
    try {
      rec.start();
    } catch {
      // Already started — ignore.
    }
  }, [supported]);

  /** Stop recording and resolve with the complete final transcript. */
  const stop = useCallback(async (): Promise<string> => {
    activeRef.current = false;
    if (restartTimerRef.current) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    const rec = recRef.current;
    if (!rec) return finalRef.current.trim();
    await new Promise<void>((resolve) => {
      doneResolveRef.current = resolve;
      try {
        rec.stop();
      } catch {
        resolve();
      }
      // Safety: if onend never fires, don't hang the submit.
      window.setTimeout(resolve, 2500);
    });
    doneResolveRef.current = null;
    recRef.current = null;
    return finalRef.current.trim();
  }, []);

  useEffect(() => {
    return () => {
      activeRef.current = false;
      if (restartTimerRef.current) {
        window.clearTimeout(restartTimerRef.current);
      }
      try {
        recRef.current?.abort();
      } catch {
        // already stopped
      }
      recRef.current = null;
    };
  }, []);

  const displayText = interimText
    ? `${finalText ? finalText + ' ' : ''}${interimText}`
    : finalText;

  return { supported, start, stop, displayText, error };
}
