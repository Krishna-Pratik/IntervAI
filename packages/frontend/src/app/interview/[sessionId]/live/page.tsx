/**
 * Live voice interview screen: camera + mic + current question +
 * waveform + transcript + session timer. Phases: connecting → idle
 * (question loaded) → listening → submitting → evaluating, plus
 * ended/error. `?simulate=1` unlocks a canned-answer simulation so
 * the flow is reviewable without a microphone.
 */

'use client';

import { useEffect, useRef, useState, useCallback, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import clsx from 'clsx';
import {
  generateNextQuestion,
  generateFollowUp,
  submitAnswer,
  getSessionDetail,
  endInterviewSession,
  type EvaluationResult,
  type InterviewQuestion,
  type InterviewSession,
} from '../../../../lib/api';
import { AppShell } from '../../../_components/AppShell';
import { GlassCard } from '../../../_components/GlassCard';
import { CenterMessage } from '../../../_components/CenterMessage';
import { ErrorNotice } from '../../../_components/ErrorNotice';
import { ScoreBar } from '../../_components/ScoreBar';
import { ScoreRow } from '../../_components/ScoreRow';
import {
  CameraCard,
  type CameraPermission,
} from '../../_components/CameraCard';
import { EndSessionConfirm } from '../../_components/EndSessionConfirm';
import { LiveWaveform } from '../../_components/LiveWaveform';
import { useSpeechDetection } from '../../_components/useSpeechDetection';
import { useLiveTranscription } from '../../_components/useLiveTranscription';

type Phase =
  | 'connecting'
  | 'idle'
  | 'listening'
  | 'submitting'
  | 'evaluating'
  | 'ended'
  | 'error';

/**
 * Streams are tracked on `window`, not on the component. A hot-reload
 * or remount kills the old component but leaves its getUserMedia
 * streams (and the camera light) alive — a per-component ref cannot
 * sweep what a previous instance owned. Every live interview stream
 * registers here; stopStream and the mount-time reaper read it.
 */
function liveStreams(): Set<MediaStream> {
  const w = window as unknown as { __interviewStreams?: Set<MediaStream> };
  return (w.__interviewStreams ??= new Set());
}

function reapStreams(set: Set<MediaStream>) {
  set.forEach((s) => s.getTracks().forEach((t) => t.stop()));
  set.clear();
}

/**
 * Pull a human-readable message out of an API error. The backend
 * answers failures with `{ error: '…' }`; axios's own `message` is
 * noise ("Request failed with status code 409"), so prefer the body.
 */
function friendlyError(err: unknown): string {
  const e = err as {
    response?: { status?: number; data?: { error?: string } };
    message?: string;
  };
  return e.response?.data?.error ?? e.message ?? 'Something went wrong.';
}

function isSessionClosedError(err: unknown): boolean {
  const e = err as { response?: { status?: number } };
  return e.response?.status === 409;
}

// Canned answers for the ?simulate=1 affordance, rotated per
// question order so successive simulations differ.
const SIMULATED_ANSWERS: string[] = [
  'I would use a token bucket per API key stored in Redis, with a short TTL on the counter and a separate background job to refill tokens. For bursty traffic I would allow a small initial grant. I would expose the remaining count in a response header so clients can self-throttle before they hit a hard limit.',
  'First I would reproduce the bug in a staging environment with the same data shape. Then I would bisect the recent deploys to find the regression. Once I have a candidate, I would add logging at the boundary that shows up in the failure mode. I have shipped this kind of fix a few times and the pattern is always: reproduce, isolate, fix at the source, add a regression test.',
  'I would set up a small opinionated design system early — colour tokens, spacing tokens, a few base components. Then I would resist the urge to over-engineer. The job of a design system is to make the next feature cheaper to build, not to be a destination in itself. I would pair the system with a small set of usage rules and review against them in PRs.',
];

export default function LiveInterviewPage() {
  return (
    <Suspense fallback={null}>
      <LiveInterviewPageInner />
    </Suspense>
  );
}

function LiveInterviewPageInner() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const sessionId = params?.sessionId;

  // Enables the "Simulate answer" button without a real microphone.
  const simulateEnabled = searchParams?.get('simulate') === '1';

  // --- State ---
  const [phase, setPhase] = useState<Phase>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [question, setQuestion] = useState<InterviewQuestion | null>(null);
  // Total top-level questions the AI plan calls for. Null until a
  // plan exists — the header then shows "Question n" without a total.
  const [plannedTotal, setPlannedTotal] = useState<number | null>(null);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  // Which layer served the evaluation — used only to gate the auto
  // follow-up effect (distinguishes a fresh submit from a rehydrate);
  // never displayed.
  const [evaluationSource, setEvaluationSource] = useState<
    'gemini' | 'openrouter' | 'deterministic' | null
  >(null);

  // --- Camera + mic state ---
  const [cameraPermission, setCameraPermission] = useState<CameraPermission>('unknown');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [micPermission, setMicPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const streamRef = useRef<MediaStream | null>(null);

  /** Point the page at a freshly acquired stream, retiring any previous one. */
  function adoptStream(s: MediaStream) {
    const prev = streamRef.current;
    if (prev && prev !== s) {
      prev.getTracks().forEach((t) => t.stop());
      liveStreams().delete(prev);
    }
    liveStreams().add(s);
    streamRef.current = s;
    setStream(s);
  }

  // --- Speech detection ---
  // `isSpeaking` lights a mic-wave badge on the camera card while listening.
  const isSpeaking = useSpeechDetection(stream, phase === 'listening');

  // --- Live speech-to-text ---
  // `displayText` streams the candidate's words as they speak (final +
  // interim). When the browser has no STT engine, the page falls back
  // to a type-your-answer box and `liveTranscript` carries the text.
  const {
    supported: sttSupported,
    start: startStt,
    stop: stopStt,
    displayText,
    error: sttError,
  } = useLiveTranscription();

  // --- Session timer ---
  // 1-second MM:SS tick; stops once ended so the final value is stable.
  const [elapsedSec, setElapsedSec] = useState(0);
  useEffect(() => {
    if (phase === 'ended') return;
    const id = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  // --- End-session modal ---
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);

  // --- Simulate affordance ---
  const simulateTimerRef = useRef<number | null>(null);

  // --- TTS ---
  // Each question is read aloud when it lands. `autoSpeak` mutes the
  // speaker; the ref tracks the active utterance so it can be cancelled.
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const lastSpokenQuestionIdRef = useRef<string | null>(null);

  // --- Load session + first question on mount ---
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const detail = await getSessionDetail(sessionId, getToken);
        if (cancelled) return;
        // A session that's already over has nothing left to interview —
        // the report is the right destination, not this page.
        if (detail.session.status !== 'in_progress') {
          router.replace(`/interview/${sessionId}/summary`);
          return;
        }
        setSession(detail.session);
        if (detail.session.questionPlan) {
          setPlannedTotal(detail.session.questionPlan.totalQuestions);
        }
        const lastQ = detail.questions[detail.questions.length - 1];
        if (lastQ) {
          setQuestion({
            questionId: lastQ.id,
            questionText: lastQ.questionText,
            intent: lastQ.intent ?? '',
            order: lastQ.order,
            source: 'gemini',
            followUpOf: lastQ.followUpOf,
          });
          if (lastQ.answer?.evaluation) {
            setEvaluation(lastQ.answer.evaluation);
            setPhase('evaluating');
          } else {
            setPhase('idle');
          }
        } else {
          // Fresh session — triggers the backend's planner, which designs
          // the whole flow and returns the opening question.
          const q = await generateNextQuestion(sessionId, getToken);
          if (cancelled) return;
          setQuestion(q);
          if (q.plannedTotal) setPlannedTotal(q.plannedTotal);
          setPhase('idle');
        }
      } catch (err) {
        if (!cancelled) {
          setError(friendlyError(err));
          setPhase('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, sessionId, getToken]);

  // Bounce signed-out visitors to sign-in, passing the current path so
  // Clerk returns them here after. Effect (not render) to avoid
  // "update during render" warnings.
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      const back = window.location.pathname + window.location.search;
      router.replace(`/sign-in?redirect_url=${encodeURIComponent(back)}`);
    }
  }, [isLoaded, isSignedIn, router]);


  // --- Tear down camera + mic on unmount ---
  useEffect(() => {
    return () => {
      stopStream();
      stopSpeaking();
      if (simulateTimerRef.current) {
        window.clearInterval(simulateTimerRef.current);
        simulateTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Reap streams orphaned by a previous page instance ---
  // Hot reloads and remounts detach the old component while its media
  // tracks (camera light included) stay live. At this fresh mount the
  // page owns no stream yet, so anything left in the window registry
  // is an orphan — stop it before the interview begins.
  useEffect(() => {
    reapStreams(liveStreams());
  }, []);

  // --- Auto follow-up: when a fresh evaluation arrives with a
  // followUpQuestion, show it as the next question. Only fires once
  // per evaluation ("Next question" leads to a top-level question).
  useEffect(() => {
    if (
      phase === 'evaluating' &&
      evaluation?.followUpQuestion &&
      // Skip the rehydrate case (evaluation restored from a refresh) —
      // only auto-fire for fresh submits.
      evaluationSource !== null
    ) {
      void maybeStartFollowUp();
    }
    // The phase guard stops the loop after the first fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, evaluation?.followUpQuestion, evaluationSource]);

  // --- Speak the question aloud (load, follow-up, next question).
  // The last-spoken id prevents the same question reading twice.
  useEffect(() => {
    if (!question) return;
    if (!autoSpeak) return;
    if (lastSpokenQuestionIdRef.current === question.questionId) return;
    lastSpokenQuestionIdRef.current = question.questionId;
    speakQuestion(question.questionText);
  }, [question, autoSpeak]);

  // --- Helpers ---

  const fetchNextQuestion = useCallback(async () => {
    if (!sessionId) return;
    setPhase('connecting');
    setError(null);
    setEvaluation(null);
    setEvaluationSource(null);
    setLiveTranscript('');
    try {
      const q = await generateNextQuestion(sessionId, getToken);
      setQuestion(q);
      if (q.plannedTotal) setPlannedTotal(q.plannedTotal);
      setPhase('idle');
    } catch (err) {
      // 409 = the session was closed (report generated) while this tab
      // stayed open — the report is where this user belongs.
      if (isSessionClosedError(err)) {
        if (sessionId) router.replace(`/interview/${sessionId}/summary`);
        return;
      }
      setError(friendlyError(err));
      setPhase('error');
    }
    // `plannedTotal` is not a dependency on purpose — re-fetching on its
    // change would double-fire the request after each question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, getToken]);

  function stopStream() {
    // Sweep the window-level registry — an orphaned stream (older
    // component instance, replaced request) is exactly what keeps the
    // device light on after this view believes the camera is done.
    reapStreams(liveStreams());
    streamRef.current = null;
    setStream(null);
  }

  /**
   * Read the question aloud via speechSynthesis. Cancels any in-flight
   * utterance; prefers an English voice (interviews are in English).
   */
  function speakQuestion(text: string) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1;
      u.pitch = 1;
      const voices = window.speechSynthesis.getVoices();
      // Prefer an English voice; fall back to whatever the browser
      // ships as the default voice for the current locale.
      const en =
        voices.find((v) => v.lang?.toLowerCase().startsWith('en')) ??
        voices[0];
      if (en) u.voice = en;
      utteranceRef.current = u;
      window.speechSynthesis.speak(u);
    } catch {
      // Some browsers throw on speak() before user interaction;
      // we silently no-op so TTS never breaks the interview.
    }
  }

  function stopSpeaking() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    utteranceRef.current = null;
  }

  /**
   * Request camera + mic in a single getUserMedia call (one prompt,
   * not two). Each track's grant is tracked independently — the user
   * can allow one and deny the other.
   */
  async function requestMedia() {
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
      adoptStream(s);
      const videoTracks = s.getVideoTracks();
      const audioTracks = s.getAudioTracks();
      setCameraPermission(videoTracks.length > 0 ? 'granted' : 'denied');
      setMicPermission(audioTracks.length > 0 ? 'granted' : 'denied');
    } catch (err) {
      // NotAllowedError (denied) and NotFoundError (no device) collapse
      // into the same "denied" state — the user can re-request.
      setCameraPermission('denied');
      setMicPermission('denied');
      setError(
        (err as Error).message?.includes('Permission')
          ? 'Camera or microphone access was blocked.'
          : 'No camera or microphone was found.',
      );
    }
  }

  /** Audio-only request for "Start without camera" — no video prompt. */
  async function requestMicOnly() {
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      adoptStream(s);
      setCameraPermission('off');
      setMicPermission(s.getAudioTracks().length > 0 ? 'granted' : 'denied');
    } catch (err) {
      setCameraPermission('off');
      setMicPermission('denied');
      setError(
        (err as Error).message?.includes('Permission')
          ? 'Microphone access was blocked.'
          : 'No microphone was found.',
      );
    }
  }

  function turnCameraOff() {
    const s = streamRef.current;
    if (s) {
      // Stop AND remove: a stopped track left in the stream stays as
      // its first video track, and a re-added live track is ignored —
      // <video> binds the earliest track and renders black.
      s.getVideoTracks().forEach((t) => {
        t.stop();
        s.removeTrack(t);
      });
    }
    setCameraPermission('off');
  }

  /**
   * Re-acquire the camera mid-call from the in-panel toggle. If the
   * stream is gone entirely (audio-only start after a stop, etc.) we
   * run the full prompt again; otherwise we just add a fresh video
   * track to the existing mic stream.
   */
  async function turnCameraOn() {
    setError(null);
    const s = streamRef.current;
    if (!s) {
      await requestMedia();
      return;
    }
    // Sweep any ended video tracks left from an earlier off-toggle.
    s.getVideoTracks().forEach((t) => {
      if (t.readyState === 'ended') {
        t.stop();
        s.removeTrack(t);
      }
    });
    let fresh: MediaStream | null = null;
    try {
      fresh = await navigator.mediaDevices.getUserMedia({ video: true });
      const track = fresh.getVideoTracks()[0];
      if (track) {
        s.addTrack(track);
        setCameraPermission('granted');
      }
    } catch {
      fresh?.getTracks().forEach((t) => t.stop());
      setCameraPermission('denied');
      setError('Camera access was blocked.');
    }
  }

  /**
   * Start recording — mic open, waveform animating, live STT on.
   * STT starts only after the mic is actually granted: Chrome rejects
   * speech recognition while the permission prompt is still up.
   */
  async function startListening() {
    if (!question) return;
    setError(null);
    setLiveTranscript('');
    // Don't let the question TTS talk over the candidate.
    stopSpeaking();

    // Prompt for media if not granted yet; denial keeps the phase at idle.
    if (!streamRef.current) {
      await requestMedia();
    }
    if (micPermission === 'granted' || streamRef.current?.getAudioTracks().length) {
      startStt();
      setPhase('listening');
    }
  }

  /**
   * Entry-point buttons — camera mode picked before the prompt fires
   * so the browser only asks for the permissions actually needed.
   */
  async function startWithCamera() {
    if (!question) return;
    setError(null);
    setLiveTranscript('');
    stopSpeaking();
    await requestMedia();
    if (streamRef.current?.getAudioTracks().length) {
      startStt();
      setPhase('listening');
    }
  }

  async function startWithoutCamera() {
    if (!question) return;
    setError(null);
    setLiveTranscript('');
    stopSpeaking();
    await requestMicOnly();
    if (streamRef.current?.getAudioTracks().length) {
      startStt();
      setPhase('listening');
    }
  }

  /** Stop recording, flush the last words, then evaluate + follow up. */
  async function stopListening() {
    setPhase('submitting');
    const spoken = sttSupported ? await stopStt() : '';
    void submitCurrentAnswer(spoken || liveTranscript);
  }

  /** Submit a transcript (live or simulated) for evaluation. */
  async function submitCurrentAnswer(transcript: string) {
    if (!question || !sessionId) return;
    if (transcript.trim().length === 0) {
      setError('Please answer the question before submitting.');
      setPhase('idle');
      return;
    }
    setPhase('submitting');
    setError(null);
    try {
      const result = await submitAnswer(
        sessionId,
        { questionId: question.questionId, transcriptText: transcript.trim() },
        getToken,
      );
      setEvaluation(result.evaluation);
      setEvaluationSource(result.evaluationSource);
      setPhase('evaluating');
    } catch (err) {
      if (isSessionClosedError(err) && sessionId) {
        router.replace(`/interview/${sessionId}/summary`);
        return;
      }
      setError(friendlyError(err));
      setPhase('error');
    }
  }

  /**
   * Present the follow-up question from the evaluation as the next
   * turn. If the follow-up call fails (both AI models down), fall
   * through to a fresh top-level question so the session never sticks.
   */
  async function maybeStartFollowUp() {
    if (!sessionId || !question || !evaluation?.followUpQuestion) return;
    const parentId = question.questionId;
    try {
      const followUp = await generateFollowUp(sessionId, parentId, getToken);
      setQuestion(followUp);
      setEvaluation(null);
      setEvaluationSource(null);
      setLiveTranscript('');
      setPhase('idle');
    } catch {
      // Follow-up failed — progress with a fresh top-level question.
      await fetchNextQuestion();
    }
  }

  /**
   * "Simulate answer" typewriter: types a canned answer into
   * `liveTranscript` and auto-submits so the full flow is reviewable.
   */
  function startSimulatedAnswer() {
    if (!question) return;
    setError(null);
    setLiveTranscript('');

    // Stable per question (order-indexed) so re-running the sim doesn't
    // change the score. `?? ''` narrows the indexed access.
    const sample: string =
      SIMULATED_ANSWERS[question.order % SIMULATED_ANSWERS.length] ??
      SIMULATED_ANSWERS[0] ??
      '';
    const chunkSize = 12;
    let i = 0;
    setPhase('listening');

    simulateTimerRef.current = window.setInterval(() => {
      i += chunkSize;
      if (i >= sample.length) {
        setLiveTranscript(sample);
        if (simulateTimerRef.current) {
          window.clearInterval(simulateTimerRef.current);
          simulateTimerRef.current = null;
        }
        // Submit after a short pause so the user sees the full
        // transcript before the evaluation card appears.
        window.setTimeout(() => {
          void submitCurrentAnswer(sample);
        }, 600);
        return;
      }
      setLiveTranscript(sample.slice(0, i));
    }, 100);
  }

  function skip() {
    void fetchNextQuestion();
  }

  function openEndConfirm() {
    setEndConfirmOpen(true);
  }

  function cancelEnd() {
    setEndConfirmOpen(false);
  }

  async function confirmEnd() {
    setEndConfirmOpen(false);
    stopStream();
    stopSpeaking();
    if (simulateTimerRef.current) {
      window.clearInterval(simulateTimerRef.current);
      simulateTimerRef.current = null;
    }
    setPhase('ended');
    // Ask the backend to close + summarise before navigating. If the
    // call fails (offline, etc.) the session stays open server-side
    // and the report page offers an "End session" retry.
    if (sessionId) {
      try {
        await endInterviewSession(sessionId, getToken);
      } catch {
        // Non-fatal — handled by the report page's retry affordance.
      }
      router.push(`/interview/${sessionId}/summary`);
    } else {
      router.push('/dashboard');
    }
  }

  // --- Render guards ---

  if (!isLoaded) {
    return (
      <AppShell>
        <CenterMessage>Loading…</CenterMessage>
      </AppShell>
    );
  }
  if (!isSignedIn) {
    // Redirect fires in the effect above; show a quiet placeholder meanwhile.
    return (
      <AppShell>
        <CenterMessage>Redirecting to sign in…</CenterMessage>
      </AppShell>
    );
  }

  const showEndButton =
    phase !== 'submitting' && phase !== 'evaluating' && phase !== 'ended';
  // The session is live from load until it ends — the header pill shows
  // a steady green "lamp" the whole time, and both the lamp and the
  // "Live" label switch off the moment the session is over.
  const isLive = phase !== 'ended';
  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
  const ss = String(elapsedSec % 60).padStart(2, '0');

  return (
    <AppShell>
      <section className="relative px-4 pb-12 pt-8 sm:px-6 sm:pt-12">
        <div className="mx-auto max-w-5xl">
          {/* --- Header strip --- */}
          <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-neon-glassHi bg-neon-surface/60 px-3 py-1.5 text-eyebrow text-neon-ink2 backdrop-blur">
                <span
                  aria-hidden="true"
                  className={clsx(
                    'inline-block h-1.5 w-1.5 rounded-full transition-colors',
                    // lit: solid green with a soft glow; off: plain grey
                    isLive
                      ? 'bg-[#22c55e] shadow-[0_0_7px_rgba(34,197,94,0.85)]'
                      : 'bg-neon-ink3',
                  )}
                />
                {isLive ? `Live · ${phase}` : phase}
              </span>
              <h1 className="type-display mt-3 text-display-l text-neon-ink">
                Live interview
              </h1>
              {session && (
                <p className="mt-1 text-body-m text-neon-ink2">
                  {session.targetRole} · {session.difficulty}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
              <span className="min-w-[5.5rem] text-right font-mono text-[0.78rem] text-neon-ink3">
                Session {mm}:{ss}
              </span>
              {phase === 'listening' && (
                <span className="inline-flex items-center gap-2 font-mono text-[0.7rem] text-neon-cyan">
                  <span
                    aria-hidden="true"
                    className="inline-block h-1.5 w-1.5 rounded-full bg-neon-cyan animate-pulse-dot"
                  />
                  Recording
                </span>
              )}
              {showEndButton ? (
                <>
                  {/* Speaker toggle — icon-only so the header stays tight. */}
                  <button
                    type="button"
                    onClick={() => {
                      const next = !autoSpeak;
                      setAutoSpeak(next);
                      if (!next) stopSpeaking();
                    }}
                    aria-label={autoSpeak ? 'Mute speaker' : 'Unmute speaker'}
                    title={autoSpeak ? 'Mute speaker' : 'Unmute speaker'}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-neon-glassHi text-neon-ink2 transition-colors hover:border-neon-violet/40 hover:text-neon-ink"
                  >
                    {autoSpeak ? (
                      <svg
                        viewBox="0 0 24 24"
                        width="18"
                        height="18"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M11 5L6 9H2v6h4l5 4z" />
                        <path d="M15 9a4 4 0 0 1 0 6" />
                        <path d="M18 6a8 8 0 0 1 0 12" />
                      </svg>
                    ) : (
                      <svg
                        viewBox="0 0 24 24"
                        width="18"
                        height="18"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M11 5L6 9H2v6h4l5 4z" />
                        <line x1="22" y1="9" x2="16" y2="15" />
                        <line x1="16" y1="9" x2="22" y2="15" />
                      </svg>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={openEndConfirm}
                    aria-label="End session"
                    className="min-h-[40px] rounded-full border border-neon-glassHi px-4 py-2 text-body-m text-neon-ink2 transition-colors hover:border-neon-violet/40 hover:text-neon-ink"
                  >
                    <span className="hidden sm:inline">End →</span>
                    <span aria-hidden="true" className="sm:hidden">
                      ×
                    </span>
                  </button>
                </>
              ) : null}
            </div>
          </div>

          {error && (
            <div className="mb-6">
              <ErrorNotice title="Connection problem">{error}</ErrorNotice>
            </div>
          )}

          {/* --- Question hero card ---
              Single-column layout: the question text is the focal point;
              the camera self-view is a PiP overlay top-right (sm+) or
              inline above the question on mobile. */}
          <GlassCard
            variant="strong"
            withOrbs
            className="relative flex flex-col gap-6 p-5 sm:p-7 md:p-9"
          >
            {question ? (
              <>
                {/* Mobile-only PiP (the absolute one below is hidden on mobile). */}
                <div className="flex justify-end sm:hidden">
                  <CameraCard
                    compact
                    stream={stream}
                    permission={cameraPermission}
                    recording={phase === 'listening'}
                    isSpeaking={isSpeaking}
                    onRequest={requestMedia}
                    onTurnOff={turnCameraOff}
                    onTurnOn={turnCameraOn}
                  />
                </div>

                {/* Desktop PiP — the sm:pr-[220px] on the question reserves its space. */}
                <div className="absolute right-4 top-4 z-10 hidden sm:block">
                  <CameraCard
                    compact
                    stream={stream}
                    permission={cameraPermission}
                    recording={phase === 'listening'}
                    isSpeaking={isSpeaking}
                    onRequest={requestMedia}
                    onTurnOff={turnCameraOff}
                    onTurnOn={turnCameraOn}
                  />
                </div>

                {/* Top row: progress dots (left) + meta pills (right);
                    the right container reserves the PiP width so badges
                    don't collide with the camera. */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-col gap-2">
                    <span className="text-eyebrow text-neon-ink3">
                      {plannedTotal
                        ? question.order >= plannedTotal
                          ? `Final question · ${question.order} of ${plannedTotal}`
                          : `Question ${question.order} of ${plannedTotal}`
                        : `Question ${question.order}`}
                    </span>
                    {/* One segment per planned question; without a
                        plan, 5 segments anchored to the current order. */}
                    <ProgressDots
                      total={plannedTotal ?? Math.max(5, question.order)}
                      current={question.order}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:max-w-[calc(100%-220px)] sm:justify-end">
                    {question.followUpOf && (
                      <span
                        title="This is a follow-up to your previous answer"
                        className="inline-flex items-center gap-1.5 rounded-full border border-neon-magenta/40 bg-neon-magenta/10 px-2.5 py-1 font-mono text-[0.7rem] text-neon-magenta backdrop-blur"
                      >
                        <span
                          aria-hidden="true"
                          className="inline-block h-1.5 w-1.5 rounded-full bg-neon-magenta animate-pulse-dot"
                        />
                        follow-up
                      </span>
                    )}
                    {session?.resumeId &&
                      question.intent &&
                      question.intent !== 'behavioral' && (
                        <span
                          title="This question was generated from your resume"
                          className="inline-flex items-center gap-1.5 rounded-full border border-neon-cyan/40 bg-neon-cyan/10 px-2.5 py-1 font-mono text-[0.7rem] text-neon-cyan backdrop-blur"
                        >
                          <span
                            aria-hidden="true"
                            className="inline-block h-1.5 w-1.5 rounded-full bg-neon-cyan animate-pulse-dot"
                          />
                          tailored
                        </span>
                      )}
                  </div>
                </div>

                {/* THE QUESTION — the visual hero. display-m/44px cap:
                    the earlier display-xl scale made 2-sentence questions
                    swallow the viewport. */}
                <p
                  className={clsx(
                    'type-display text-neon-ink sm:pr-[220px]',
                    'text-display-m sm:text-display-l',
                    'text-center sm:text-left',
                    'leading-[1.25]',
                  )}
                >
                  {question.questionText}
                </p>

                {/* Replay + waveform — side-by-side on sm+. */}
                <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:gap-5">
                  {phase === 'idle' ? (
                    <button
                      type="button"
                      onClick={() => speakQuestion(question.questionText)}
                      className="inline-flex w-fit min-h-[36px] items-center gap-1.5 self-center rounded-full border border-neon-glass px-3 py-1.5 text-body-m text-neon-ink2 transition-colors hover:border-neon-violet/40 hover:text-neon-ink sm:self-auto"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="14"
                        height="14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M11 5L6 9H2v6h4l5 4z" />
                        <path d="M15 9a4 4 0 0 1 0 6" />
                      </svg>
                      Replay
                    </button>
                  ) : null}
                  <div className="flex-1">
                    <LiveWaveform listening={phase === 'listening'} />
                  </div>
                </div>

                {/* Live transcript — visible only mid-answer. */}
                {phase === 'listening' ? (
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <h2 className="text-eyebrow text-neon-ink2">
                        Live transcript
                      </h2>
                      <span className="inline-flex items-center gap-2 font-mono text-[0.7rem] text-neon-cyan">
                        <span
                          aria-hidden="true"
                          className="inline-block h-1.5 w-1.5 rounded-full bg-neon-cyan animate-pulse-dot"
                        />
                        recording
                      </span>
                    </div>
                    {sttSupported ? (
                      <p className="min-h-[4rem] whitespace-pre-wrap rounded-xl border border-neon-glass bg-neon-black/30 px-4 py-3 text-body-l text-neon-ink">
                        {liveTranscript || displayText ? (
                          liveTranscript || displayText
                        ) : sttError ? (
                          <span className="text-neon-magenta">{sttError}</span>
                        ) : (
                          <span className="italic text-neon-ink3">
                            Listening… start speaking and your words will
                            appear here.
                          </span>
                        )}
                      </p>
                    ) : (
                      // No browser STT engine (e.g. Firefox) — let the
                      // candidate type the answer so the evaluate +
                      // follow-up flow still works end to end.
                      <>
                        <textarea
                          value={liveTranscript}
                          onChange={(e) => setLiveTranscript(e.target.value)}
                          rows={3}
                          autoFocus
                          placeholder="Your browser can't transcribe speech live — type your answer here."
                          className="min-h-[4rem] w-full whitespace-pre-wrap rounded-xl border border-neon-glass bg-neon-black/30 px-4 py-3 text-body-l text-neon-ink placeholder:italic placeholder:text-neon-ink3 focus:border-neon-violet2 focus:outline-none"
                        />
                      </>
                    )}
                  </div>
                ) : null}

                {/* Submit controls */}
                {phase === 'listening' ? (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={stopListening}
                      className="type-display inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-neon-magenta/50 bg-neon-magenta/15 px-5 py-2.5 text-body-m text-neon-magenta transition-colors hover:bg-neon-magenta/25"
                    >
                      <span
                        aria-hidden="true"
                        className="inline-block h-1.5 w-1.5 rounded-full bg-neon-magenta"
                      />
                      Stop &amp; submit
                    </button>
                    <span className="font-mono text-[0.78rem] text-neon-ink3">
                      {micPermission === 'denied'
                        ? 'Microphone blocked. Allow it in your browser address bar to record.'
                        : 'Recording in progress'}
                    </span>
                  </div>
                ) : phase === 'idle' ? (
                  <div className="flex flex-col gap-3">
                    <p className="text-eyebrow text-neon-ink3">
                      Pick how you want to appear
                    </p>
                    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                      <button
                        type="button"
                        onClick={startWithCamera}
                        disabled={simulateEnabled}
                        className="type-display inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-gradient-to-r from-neon-violet to-neon-magenta px-5 py-2.5 text-body-m text-white shadow-neon-violet transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="18"
                          height="18"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M3 7h3l2-2h8l2 2h3v12H3z" />
                          <circle cx="12" cy="12" r="3.5" />
                        </svg>
                        Start with camera on
                      </button>
                      <button
                        type="button"
                        onClick={startWithoutCamera}
                        disabled={simulateEnabled}
                        className="type-display inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-neon-glassHi bg-neon-black/40 px-5 py-2.5 text-body-m text-neon-ink2 transition-colors hover:border-neon-violet/40 hover:text-neon-ink disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="18"
                          height="18"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <rect x="9" y="2" width="6" height="13" rx="3" />
                          <path d="M5 11a7 7 0 0 0 14 0" />
                          <path d="M12 18v3" />
                          <path d="M8 21h8" />
                        </svg>
                        Start audio only
                      </button>
                      {simulateEnabled ? (
                        <button
                          type="button"
                          onClick={startSimulatedAnswer}
                          className="min-h-[44px] rounded-full border border-neon-glassHi px-4 py-2.5 text-body-m text-neon-ink2 transition-colors hover:border-neon-violet/40 hover:text-neon-ink"
                        >
                          Simulate answer
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={skip}
                        className="min-h-[44px] rounded-full border border-neon-glass px-4 py-2.5 text-body-m text-neon-ink3 transition-colors hover:border-neon-violet/40 hover:text-neon-ink"
                      >
                        Skip →
                      </button>
                    </div>
                  </div>
                ) : phase === 'submitting' || phase === 'evaluating' ? (
                  <div className="text-center text-body-m text-neon-ink2">
                    <span className="inline-flex items-center gap-2 font-mono text-[0.78rem]">
                      <span
                        aria-hidden="true"
                        className="inline-block h-1.5 w-1.5 rounded-full bg-neon-violet2 animate-pulse-dot"
                      />
                      {phase === 'submitting'
                        ? 'Sending answer…'
                        : 'Scoring your answer…'}
                    </span>
                  </div>
                ) : null}
              </>
            ) : phase === 'connecting' ? (
              <div className="flex min-h-[16rem] flex-col items-center justify-center text-center">
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 rounded-full bg-neon-violet2 animate-pulse-dot"
                />
                <p className="mt-3 text-body-m text-neon-ink2">
                  Loading question…
                </p>
              </div>
            ) : phase === 'ended' ? (
              <div className="flex min-h-[16rem] flex-col items-center justify-center text-center">
                <p className="type-display text-display-s text-neon-ink">
                  Session ended.
                </p>
                <p className="mt-2 text-body-m text-neon-ink2">
                  Preparing your scorecard…
                </p>
                {sessionId && (
                  <button
                    type="button"
                    onClick={() => router.push(`/interview/${sessionId}/summary`)}
                    className="mt-4 min-h-[40px] rounded-full border border-neon-glassHi px-4 py-2 text-body-m text-neon-ink2 transition-colors hover:border-neon-violet/40 hover:text-neon-ink"
                  >
                    View report
                  </button>
                )}
              </div>
            ) : (
              // Backstop: error / idle-without-question. The card must
              // never render blank — always offer a way forward.
              <div className="flex min-h-[16rem] flex-col items-center justify-center text-center">
                <p className="type-display text-display-s text-neon-ink">
                  {phase === 'error' ? 'Something went wrong.' : 'Ready when you are.'}
                </p>
                <p className="mt-2 max-w-md text-body-s text-neon-ink3">
                  {error ??
                    'We could not load a question right now. Give it another go.'}
                </p>
                <button
                  type="button"
                  onClick={fetchNextQuestion}
                  className="mt-4 min-h-[40px] rounded-full border border-neon-glassHi px-4 py-2 text-body-m text-neon-ink2 transition-colors hover:border-neon-violet/40 hover:text-neon-ink"
                >
                  Load first question
                </button>
              </div>
            )}
          </GlassCard>


          {/* --- Evaluation --- */}
          {evaluation && question && (
            <GlassCard
              variant="strong"
              withOrbs
              className="mt-6 p-6 sm:p-8"
            >
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-eyebrow text-neon-ink3">
                    Evaluation
                  </div>
                  <h2 className="type-display mt-1 text-display-s text-neon-ink">
                    How it landed.
                  </h2>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="type-display text-stat text-gradient-neon-static leading-none">
                      {evaluation.overallScore}
                    </div>
                    <div className="font-mono text-[0.7rem] text-neon-ink3">
                      / 10
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-body-m sm:grid-cols-3">
                <ScoreRow
                  label="Precision"
                  value={`${evaluation.precisionLevel}/10`}
                  accent="violet"
                />
                <ScoreRow
                  label="Growth"
                  value={`${evaluation.growthPotential}/10`}
                  accent="cyan"
                />
              </div>

              {Object.keys(evaluation.detailedScores).length > 0 && (
                <div className="mt-4 space-y-2.5 text-body-m">
                  {Object.entries(evaluation.detailedScores).map(
                    ([k, v], i) => (
                      <ScoreBar
                        key={k}
                        label={k}
                        value={v}
                        accent={i % 2 === 0 ? 'violet' : 'cyan'}
                        widthClass="w-24"
                      />
                    ),
                  )}
                </div>
              )}

              <div className="mt-6">
                <button
                  type="button"
                  onClick={fetchNextQuestion}
                  className="type-display inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-neon-violet to-neon-magenta px-6 py-3 text-body-m text-white shadow-neon-violet transition-transform hover:scale-[1.01]"
                >
                  Next question
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            </GlassCard>
          )}
        </div>
      </section>

      <EndSessionConfirm
        open={endConfirmOpen}
        currentQuestionNumber={question?.order ?? 0}
        onCancel={cancelEnd}
        onConfirm={confirmEnd}
      />
    </AppShell>
  );
}

// Local phase-to-style helpers for the header dot.
/**
 * ProgressDots — `total` segments, first `current` filled in violet.
 * Dots not a bar: a segment row reads as "step N of M", which is how
 * interviews are mentally modelled; a continuous bar implies "how
 * close am I to done" — less useful mid-answer.
 */
function ProgressDots({
  total,
  current,
}: {
  total: number;
  current: number;
}) {
  return (
    <div
      role="progressbar"
      aria-valuenow={current}
      aria-valuemin={1}
      aria-valuemax={total}
      className="flex items-center gap-1.5"
    >
      {Array.from({ length: total }).map((_, i) => {
        const idx = i + 1;
        const state =
          idx < current
            ? 'done'
            : idx === current
              ? 'current'
              : 'upcoming';
        return (
          <span
            key={idx}
            aria-hidden="true"
            className={clsx(
              'h-1.5 rounded-full transition-colors',
              state === 'done'
                ? 'w-6 bg-neon-violet2/80'
                : state === 'current'
                  ? // Current: longer + soft glow so the eye finds it.
                    'w-8 bg-neon-violet2 shadow-[0_0_8px_rgba(167,139,250,0.6)]'
                  : 'w-6 bg-neon-glass',
            )}
          />
        );
      })}
    </div>
  );
}
