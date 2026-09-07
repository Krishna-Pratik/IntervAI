/**
 * useSpeechDetection — listens to a MediaStream's audio track and
 * flips `isSpeaking` true whenever the mic level crosses a small
 * threshold.
 *
 * Why this lives in a hook (not inside CameraCard):
 *   - The analysis should only run while the candidate is actively
 *     `listening`; CameraCard stays a pure presentational layer.
 *   - AudioContext + AnalyserNode are not React-friendly — we want
 *     a single long-lived analyser per stream, not one per render.
 *
 * Threshold notes:
 *   - 0.02 RMS errs on the "responsive" side — a quiet mumble
 *     should still light the icon up, since the point is to show
 *     the candidate the mic is picking them up.
 *   - Hysteresis: the indicator only goes off after ~250ms below
 *     threshold, so brief gaps in speech don't flicker it.
 */

import { useEffect, useRef, useState } from 'react';

const SPEAKING_THRESHOLD = 0.02;
// Frames at ~60fps — 250ms of silence required before the indicator
// goes off. Wide enough to span natural pauses between words.
const SILENT_FRAMES_TO_RELEASE = 15;

export function useSpeechDetection(
  stream: MediaStream | null,
  active: boolean,
): boolean {
  const [isSpeaking, setIsSpeaking] = useState(false);
  // Refs to long-lived audio nodes. We never put these in React
  // state because re-creating an AudioContext on every render is
  // expensive and would briefly cut the mic.
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  // Mutable hysteresis counter — survives across animation frames
  // without re-triggering renders.
  const silentFramesRef = useRef(0);

  useEffect(() => {
    // Bail if not active or no audio track. We don't want the
    // AudioContext to be created at all if the candidate hasn't
    // started recording.
    if (!active || !stream) return;
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;

    // Lazy-init. Some browsers (Safari) require AudioContext to
    // be created inside a user-gesture handler. The caller has
    // already gated us on `active`, which flips true only after
    // the candidate clicks "Start with camera" / "Start audio only",
    // so we're inside a gesture context by the time we get here.
    const AudioCtor: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtor) return;

    const ctx = new AudioCtor();
    const analyser = ctx.createAnalyser();
    // Small FFT so the per-frame read is cheap. 512 samples is
    // enough granularity to capture a speaking-vs-silent delta
    // without doing meaningful pitch detection.
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.4;

    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    // We deliberately do NOT connect `analyser` to `ctx.destination`
    // — that would play the mic back through the user's speakers,
    // creating a feedback loop. The analyser is read-only.

    audioContextRef.current = ctx;
    analyserRef.current = analyser;
    sourceRef.current = source;

    const buffer = new Uint8Array(analyser.fftSize);
    const tick = () => {
      const a = analyserRef.current;
      if (!a) return;
      a.getByteTimeDomainData(buffer);
      // Time-domain values are unsigned 8-bit centered on 128.
      // Convert to a signed -1..1 range, then compute RMS so
      // silence reads ~0 and a sustained vowel reads as a steady
      // positive value.
      let sumSquares = 0;
      for (let i = 0; i < buffer.length; i++) {
        // `noUncheckedIndexedAccess` makes indexed reads on
        // Uint8Array return `number | undefined`. The buffer is
        // always full at this point (we just wrote it from
        // getByteTimeDomainData), so the value is always defined —
        // collapse to a number with `?? 128` (the silence midpoint).
        const sample = buffer[i] ?? 128;
        const v = (sample - 128) / 128;
        sumSquares += v * v;
      }
      const rms = Math.sqrt(sumSquares / buffer.length);

      if (rms > SPEAKING_THRESHOLD) {
        silentFramesRef.current = 0;
        if (!isSpeaking) setIsSpeaking(true);
      } else if (isSpeaking) {
        silentFramesRef.current += 1;
        if (silentFramesRef.current >= SILENT_FRAMES_TO_RELEASE) {
          setIsSpeaking(false);
        }
      }
      rafRef.current = window.requestAnimationFrame(tick);
    };
    rafRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      // Disconnect the source before closing the context — failing
      // to do this leaves the audio graph in a half-torn-down state
      // that some browsers complain about.
      source.disconnect();
      analyser.disconnect();
      void ctx.close();
      audioContextRef.current = null;
      analyserRef.current = null;
      sourceRef.current = null;
      // Reset hysteresis on teardown so the next session starts clean.
      silentFramesRef.current = 0;
      setIsSpeaking(false);
    };
    // isSpeaking intentionally NOT in deps — the loop reads the
    // latest value via the React state, but we don't want to
    // tear down + rebuild the AudioContext every time it flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stream]);

  return isSpeaking;
}
