/**
 * Chat module — the WebSocket voice layer for live interviews.
 *
 * The client opens /ws/interview/:sessionId and authenticates with a
 * Clerk JWT as its first message ({ type: 'auth', token }) — all other
 * messages are rejected until verified. Then, per question:
 *   start-answer → streamed `audio` chunks → server transcribes via
 *   Deepgram and relays `transcript` deltas → end-answer → server saves
 *   the answer, evaluates it (sends `evaluation`), generates the next
 *   question (sends `next-question`).
 * `submit-text` skips audio and posts a transcript directly.
 *
 * Raw audio is never persisted — only the final transcript and the
 * evaluation JSON.
 */

import type WebSocket from 'ws';
import { verifyToken } from '@clerk/backend';
import { eq, and, asc, desc } from 'drizzle-orm';
import { db } from '../../shared/db/db.js';
import {
  interviewSessions,
  questions,
  answers,
  evaluations,
  resumes,
  type ResumeProfile,
} from '../../db/schema.js';
import { openDeepgramSession, type DeepgramSession } from '../../services/speech/deepgram.service.js';
import {
  generateQuestionWithFallback,
  evaluateAnswerWithFallback,
} from '../../services/ai/fallback.js';
import { config } from '../../shared/config/index.js';

// Wire protocol types

/** Messages the CLIENT can send to the server. */
export type ClientMessage =
  | { type: 'auth'; token: string }
  | { type: 'start-answer'; questionId: string }
  | { type: 'audio'; data: string /* base64 */ }
  | { type: 'end-answer' }
  | { type: 'submit-text'; questionId: string; transcriptText: string }
  | { type: 'skip-question' }
  | { type: 'ping' };

/** Messages the SERVER can send to the client. */
export type ServerMessage =
  | { type: 'ready' }
  | { type: 'auth-ok'; userId: string }
  | { type: 'auth-error'; message: string }
  | { type: 'transcript'; text: string; isFinal: boolean }
  | { type: 'audio-ack' }
  | {
      type: 'evaluation';
      answerId: string;
      evaluation: import('../../services/ai/evaluation.types.js').EvaluationResult;
      source: 'gemini' | 'openrouter' | 'deterministic';
      model: string | null;
    }
  | {
      type: 'next-question';
      questionId: string;
      questionText: string;
      intent: string;
      order: number;
      source: 'gemini' | 'openrouter';
      model: string;
    }
  | { type: 'error'; message: string }
  | { type: 'session-ended' }
  | { type: 'pong' };

// Session state (held in memory for the duration of the WebSocket)

export interface InterviewWsState {
  userId: string;
  sessionId: string;
  currentQuestionId: string | null;
  /** Deepgram session — only open while recording an answer */
  dg: DeepgramSession | null;
  /** Live transcript being built up. Reset on each answer. */
  liveTranscript: string;
}

function send(ws: WebSocket, msg: ServerMessage): void {
  try {
    ws.send(JSON.stringify(msg));
  } catch (err) {
    console.error('[chat] Failed to send WS message:', (err as Error).message);
  }
}

function sendError(ws: WebSocket, message: string): void {
  send(ws, { type: 'error', message });
}

// DB helpers (the full versions live in interview.service.ts)

async function loadOwnedSession(userId: string, sessionId: string) {
  const rows = await db
    .select()
    .from(interviewSessions)
    .where(and(eq(interviewSessions.id, sessionId), eq(interviewSessions.userId, userId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error('Session not found');
  if (row.status !== 'in_progress') throw new Error(`Session is ${row.status}`);
  return row;
}

async function loadQuestionForUser(
  userId: string,
  sessionId: string,
  questionId: string,
) {
  const session = await loadOwnedSession(userId, sessionId);
  const qs = await db
    .select()
    .from(questions)
    .where(and(eq(questions.id, questionId), eq(questions.sessionId, session.id)))
    .limit(1);
  return { session, question: qs[0] };
}

async function loadLatestResumeProfile(userId: string): Promise<ResumeProfile | null> {
  const rows = await db
    .select({ profile: resumes.resumeProfile })
    .from(resumes)
    .where(eq(resumes.userId, userId))
    .orderBy(desc(resumes.createdAt))
    .limit(1);
  return rows[0]?.profile ?? null;
}

// Auth

// Lower-level verifyToken so the WS upgrade doesn't need Clerk middleware.
async function verifyClerkJwt(token: string): Promise<{ userId: string }> {
  if (!config.clerkSecretKey) {
    throw new Error('CLERK_SECRET_KEY is not configured');
  }
  const payload = await verifyToken(token, {
    secretKey: config.clerkSecretKey,
  });
  const userId = (payload as { sub?: string }).sub;
  if (!userId) throw new Error('JWT has no sub claim');
  return { userId };
}

// Answer handling — the meat of the voice flow

async function handleTextAnswer(
  state: InterviewWsState,
  ws: WebSocket,
  questionId: string,
  transcriptText: string,
): Promise<void> {
  try {
    const { session, question } = await loadQuestionForUser(
      state.userId,
      state.sessionId,
      questionId,
    );
    if (!question) {
      sendError(ws, 'Question not found in this session');
      return;
    }
    await saveAnswerAndEvaluate({
      ws,
      state,
      session,
      question,
      transcriptText,
    });
    await generateAndSendNextQuestion(ws, state, session);
  } catch (err) {
    sendError(ws, (err as Error).message ?? 'Failed to process answer');
  }
}

async function saveAnswerAndEvaluate(args: {
  ws: WebSocket;
  state: InterviewWsState;
  session: typeof interviewSessions.$inferSelect;
  question: typeof questions.$inferSelect;
  transcriptText: string;
}): Promise<void> {
  const { ws, state, session, question, transcriptText } = args;

  // 1. Insert the answer row
  const inserted = await db
    .insert(answers)
    .values({
      questionId: question.id,
      transcriptText,
    })
    .returning();
  const answer = inserted[0];
  if (!answer) {
    sendError(ws, 'Failed to persist answer');
    return;
  }

  // 2. Load resume profile (if any)
  const resumeProfile = await loadLatestResumeProfile(state.userId);

  // 3. Evaluate via the AI fallback layer
  const { evaluation, source, model, fellThroughAi } = await evaluateAnswerWithFallback({
    questionText: question.questionText,
    transcriptText,
    targetRole: session.targetRole,
    difficulty: session.difficulty as 'easy' | 'medium' | 'hard',
    resumeProfile: resumeProfile ?? undefined,
  });

  if (fellThroughAi) {
    console.warn(
      `[chat] session=${session.id} — both AI models failed, used deterministic`,
    );
  }

  // 4. Persist the evaluation
  await db.insert(evaluations).values({
    answerId: answer.id,
    overallScore: evaluation.overallScore,
    precisionLevel: evaluation.precisionLevel,
    growthPotential: evaluation.growthPotential,
    source,
    rawFeedback: {
      strengths: evaluation.strengths,
      weaknesses: evaluation.weaknesses,
      suggestions: evaluation.suggestions,
      detailedScores: evaluation.detailedScores,
    },
  });

  // 5. Send to client
  send(ws, {
    type: 'evaluation',
    answerId: answer.id,
    evaluation: { ...evaluation, source },
    source,
    model,
  });
}

async function generateAndSendNextQuestion(
  ws: WebSocket,
  state: InterviewWsState,
  session: typeof interviewSessions.$inferSelect,
): Promise<void> {
  // Load previous questions in this session
  const prev = await db
    .select({ questionText: questions.questionText })
    .from(questions)
    .where(eq(questions.sessionId, session.id))
    .orderBy(asc(questions.order));
  const previousQuestions = prev.map((q) => q.questionText);

  const resumeProfile = await loadLatestResumeProfile(state.userId);

  const { data: generated, source, model } = await generateQuestionWithFallback({
    targetRole: session.targetRole,
    difficulty: session.difficulty as 'easy' | 'medium' | 'hard',
    resumeProfile,
    previousQuestions,
  });

  // Persist
  const rows = (await db
    .insert(questions)
    .values({
      sessionId: session.id,
      questionText: generated.questionText,
      order: previousQuestions.length + 1,
    })
    .returning()) as Array<{ id: string; questionText: string; order: number }>;
  const row = rows[0];
  if (!row) {
    sendError(ws, 'Failed to persist next question');
    return;
  }

  state.currentQuestionId = row.id;
  send(ws, {
    type: 'next-question',
    questionId: row.id,
    questionText: row.questionText,
    intent: generated.intent,
    order: row.order,
    source,
    model,
  });
}

// Main message dispatcher

export async function handleInterviewMessage(
  ws: WebSocket,
  state: InterviewWsState | null,
  raw: string | Buffer,
): Promise<InterviewWsState> {
  let msg: ClientMessage;
  try {
    const text = typeof raw === 'string' ? raw : raw.toString('utf-8');
    msg = JSON.parse(text) as ClientMessage;
  } catch {
    sendError(ws, 'Invalid JSON');
    return state ?? createEmptyState();
  }

  // --- Auth gate ---
  if (!state) {
    if (msg.type !== 'auth') {
      sendError(ws, 'Authenticate first');
      return createEmptyState();
    }
    try {
      const { userId } = await verifyClerkJwt(msg.token);
      const newState: InterviewWsState = {
        userId,
        sessionId: extractSessionId(ws),
        currentQuestionId: null,
        dg: null,
        liveTranscript: '',
      };
      send(ws, { type: 'auth-ok', userId });
      return newState;
    } catch (err) {
      send(ws, { type: 'auth-error', message: (err as Error).message });
      return createEmptyState();
    }
  }

  // --- Authenticated messages ---
  switch (msg.type) {
    case 'ping':
      send(ws, { type: 'pong' });
      return state;

    case 'start-answer': {
      state.currentQuestionId = msg.questionId;
      state.liveTranscript = '';

      // A second start-answer before end-answer would otherwise orphan
      // the previous Deepgram socket — close it first.
      if (state.dg) {
        try {
          state.dg.close();
        } catch {
          /* already closed */
        }
        state.dg = null;
      }

      // Open a Deepgram session
      try {
        const dg = openDeepgramSession({
          language: 'en',
          interimResults: true,
          endpointingMs: 500,
        });

        dg.onTranscript((evt) => {
          if (evt.isFinal) {
            state.liveTranscript += (state.liveTranscript ? ' ' : '') + evt.text.trim();
          }
          send(ws, {
            type: 'transcript',
            text: evt.text,
            isFinal: evt.isFinal,
          });
        });
        dg.onError((err) => {
          sendError(ws, `Deepgram: ${err.message}`);
        });
        dg.onClose(() => {
          // Deepgram closed — nothing to do, session is over
        });

        state.dg = dg;
        send(ws, { type: 'ready' });
      } catch (err) {
        sendError(ws, (err as Error).message ?? 'Failed to open transcription session');
      }
      return state;
    }

    case 'audio': {
      if (!state.dg) {
        sendError(ws, 'No active recording session. Send start-answer first.');
        return state;
      }
      try {
        const buf = Buffer.from(msg.data, 'base64');
        state.dg.sendAudio(buf);
        send(ws, { type: 'audio-ack' });
      } catch (err) {
        sendError(ws, `Failed to forward audio: ${(err as Error).message}`);
      }
      return state;
    }

    case 'end-answer': {
      if (!state.dg) {
        sendError(ws, 'No active recording session.');
        return state;
      }
      state.dg.flush();
      // The answer-save happens after Deepgram emits the final
      // transcript; the delay lets the client receive that frame first.
      setTimeout(async () => {
        try {
          const transcript = state.liveTranscript.trim();
          if (!state.currentQuestionId) {
            sendError(ws, 'No current question');
            return;
          }
          if (transcript.length === 0) {
            sendError(ws, 'No transcript captured');
            return;
          }
          const { session, question } = await loadQuestionForUser(
            state.userId,
            state.sessionId,
            state.currentQuestionId,
          );
          if (!question) {
            sendError(ws, 'Question not found');
            return;
          }
          await saveAnswerAndEvaluate({
            ws,
            state,
            session,
            question,
            transcriptText: transcript,
          });
          await generateAndSendNextQuestion(ws, state, session);
        } catch (err) {
          sendError(ws, (err as Error).message ?? 'Failed to finalize answer');
        } finally {
          state.dg?.close();
          state.dg = null;
        }
      }, 800);
      return state;
    }

    case 'submit-text': {
      await handleTextAnswer(state, ws, msg.questionId, msg.transcriptText);
      return state;
    }

    case 'skip-question': {
      if (!state.currentQuestionId) {
        sendError(ws, 'No current question to skip');
        return state;
      }
      try {
        const session = await loadOwnedSession(state.userId, state.sessionId);
        await generateAndSendNextQuestion(ws, state, session);
      } catch (err) {
        sendError(ws, (err as Error).message ?? 'Failed to skip');
      }
      return state;
    }

    case 'auth':
      sendError(ws, 'Already authenticated');
      return state;

    default: {
      // Exhaustiveness check
      const _exhaustive: never = msg;
      void _exhaustive;
      sendError(ws, 'Unknown message type');
      return state;
    }
  }
}

// Helpers

function createEmptyState(): InterviewWsState {
  return {
    userId: '',
    sessionId: '',
    currentQuestionId: null,
    dg: null,
    liveTranscript: '',
  };
}

// Read the sessionId from the upgrade request attached by express-ws
// (older `ws` exposed it as `upgradeReq`, newer as `_request`). If it
// can't be found, the route re-attaches it after the first message.
function extractSessionId(ws: WebSocket): string {
  const anyWs = ws as unknown as {
    upgradeReq?: { params?: Record<string, string> };
    _request?: { params?: Record<string, string> };
  };
  return (
    anyWs.upgradeReq?.params?.sessionId ??
    anyWs._request?.params?.sessionId ??
    ''
  );
}
