/**
 * Interview domain service — the only thing that talks to the AI layer
 * and the DB for this module. It is intentionally blind to which model
 * served a request; the fallback orchestrator owns that decision and we
 * just record the returned `source`.
 */

import { eq, and, desc, asc } from 'drizzle-orm';
import { db } from '../../shared/db/db.js';
import {
  interviewSessions,
  questions,
  answers,
  evaluations,
  resumes,
  users,
  type ResumeProfile,
  type SessionSummary,
} from '../../db/schema.js';
import {
  generateQuestionWithFallback,
  evaluateAnswerWithFallback,
  generateFollowUpWithFallback,
  generatePlanWithFallback,
  generateSessionSummaryWithFallback,
  type FollowUpInput,
  type SummaryInput,
  type SummaryNarrative,
} from '../../services/ai/fallback.js';
import type { QuestionPlan } from '../../db/schema.js';
import type { EvaluationResult } from '../../services/ai/evaluation.types.js';

// Errors

export class InterviewServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'InterviewServiceError';
  }
}

// Session creation

export interface CreateSessionInput {
  userId: string;
  email: string;
  targetRole: string;
  difficulty: 'easy' | 'medium' | 'hard';
  /** Optional target company — feeds the AI prompt, never shown in the question. */
  company?: string | null;
  /** Required from new clients; nullable only for legacy rows. */
  durationMinutes?: number | null;
  /** Optional pasted job description — grounds the planner / question prompts. */
  jobDescription?: string | null;
  /** Required from new clients (the plan is built from this resume's
   * profile); nullable only for legacy rows / direct service calls. */
  resumeId?: string | null;
}

export interface CreateSessionResult {
  sessionId: string;
  targetRole: string;
  difficulty: string;
  company: string | null;
  durationMinutes: number | null;
  jobDescription: string | null;
  status: string;
  createdAt: Date;
}

// Ensure the user row exists (FK target).
async function ensureUserRow(userId: string, email: string): Promise<void> {
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.id, userId));
  if (existing.length === 0) {
    await db.insert(users).values({ id: userId, email });
  }
}

// Latest resume profile for the user, if any.
async function loadLatestResumeProfile(userId: string): Promise<ResumeProfile | null> {
  const rows = await db
    .select({ profile: resumes.resumeProfile })
    .from(resumes)
    .where(eq(resumes.userId, userId))
    .orderBy(desc(resumes.createdAt))
    .limit(1);
  return rows[0]?.profile ?? null;
}

/**
 * Create an interview session, strictly enforcing the free-trial limit.
 * Admins and active subscribers bypass; every free-tier user (including
 * past-due/canceled, which fall back to free) must atomically CONSUME a
 * trial before the session row exists — so an account at zero trials can
 * never start a session, not even via concurrent requests.
 */
export async function createInterviewSession(
  input: CreateSessionInput,
): Promise<CreateSessionResult> {
  await ensureUserRow(input.userId, input.email);

  // A resumeId must belong to this user (the interview is built from it).
  if (input.resumeId) {
    const owned = await db
      .select({ id: resumes.id })
      .from(resumes)
      .where(and(eq(resumes.id, input.resumeId), eq(resumes.userId, input.userId)))
      .limit(1);
    if (owned.length === 0) {
      throw new InterviewServiceError('Resume not found for this account', 404);
    }
  }

  const { checkInterviewAccess, tryConsumeFreeTrial, refundFreeTrial } = await import(
    '../billing/billing.service.js'
  );
  const decision = await checkInterviewAccess(input.userId, input.email);
  if (!decision.allowed) {
    throw new InterviewServiceError(
      `Free trial limit reached (${decision.remainingFreeTrials} remaining). Please upgrade to continue.`,
      402, // Payment Required
    );
  }

  // Strict gate: the atomic consume IS the limit check — if the account
  // is already at the cap by the time this runs (e.g. a parallel
  // request just took the last trial), it returns false and we refuse
  // with 402. `reason === 'free-tier'` intentionally also covers
  // past_due/canceled accounts; the old `subscriptionStatus === 'free'`
  // consume condition let exactly those users run unlimited sessions.
  const mustBurnTrial = decision.reason === 'free-tier';
  if (mustBurnTrial) {
    const consumed = await tryConsumeFreeTrial(input.userId);
    if (!consumed) {
      throw new InterviewServiceError(
        'Free trial limit reached (0 remaining). Please upgrade to continue.',
        402,
      );
    }
  }

  let row;
  try {
    const inserted = await db
      .insert(interviewSessions)
      .values({
        userId: input.userId,
        targetRole: input.targetRole,
        difficulty: input.difficulty,
        company: input.company ?? null,
        durationMinutes: input.durationMinutes ?? null,
        jobDescription: input.jobDescription ?? null,
        status: 'in_progress',
      })
      .returning();
    row = inserted[0];
  } catch (err) {
    // Session never created — hand the trial back so the failure is free.
    if (mustBurnTrial) {
      await refundFreeTrial(input.userId).catch(() => undefined);
    }
    throw err;
  }

  if (!row) {
    if (mustBurnTrial) {
      await refundFreeTrial(input.userId);
    }
    throw new InterviewServiceError('Failed to create interview session', 500);
  }

  return {
    sessionId: row.id,
    targetRole: row.targetRole,
    difficulty: row.difficulty,
    company: row.company,
    durationMinutes: row.durationMinutes,
    jobDescription: row.jobDescription,
    status: row.status,
    createdAt: row.createdAt,
  };
}

// Question generation

export interface GenerateNextQuestionInput {
  userId: string;
  sessionId: string;
}

export interface GenerateNextQuestionResult {
  questionId: string;
  questionText: string;
  intent: string;
  order: number;
  source: 'gemini' | 'openrouter' | 'deterministic';
  /** How many top-level questions the plan calls for (when a plan exists). */
  plannedTotal: number | null;
}

// Session exists and belongs to the user. Generation paths require
// in_progress; reads (detail/summary page) pass `allowEnded` because a
// finished session must stay viewable.
async function loadOwnedSession(
  userId: string,
  sessionId: string,
  allowEnded = false,
) {
  const rows = await db
    .select()
    .from(interviewSessions)
    .where(and(eq(interviewSessions.id, sessionId), eq(interviewSessions.userId, userId)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new InterviewServiceError('Session not found', 404);
  }
  if (!allowEnded && row.status !== 'in_progress') {
    throw new InterviewServiceError(`Session is ${row.status}; cannot add more questions`, 409);
  }
  return row;
}

/**
 * Generate the next interview question for a session.
 *
 * Fresh session (no plan yet): the AI planner designs the whole flow,
 * we persist the plan, and its opening question becomes question 1.
 * Never degrades to a random question — planner failure throws so the
 * route surfaces 502 + retry.
 * Session with a plan: generate the question for the next plan slot.
 */
export async function generateNextQuestion(
  input: GenerateNextQuestionInput,
): Promise<GenerateNextQuestionResult> {
  const session = await loadOwnedSession(input.userId, input.sessionId);

  const prev = await db
    .select({ id: questions.id, questionText: questions.questionText, followUpOf: questions.followUpOf })
    .from(questions)
    .where(eq(questions.sessionId, session.id))
    .orderBy(asc(questions.order));

  const previousQuestions = prev.map((q) => q.questionText);
  // Top-level count drives the plan index — follow-ups don't consume
  // a planned slot (they probe the same topic deeper).
  const topLevelCount = prev.filter((q) => q.followUpOf === null).length;

  const resumeProfile = await loadLatestResumeProfile(input.userId);

  // --- Fresh session: design the flow, return the opening question ---
  if (!session.questionPlan) {
    const { data: plan, source } = await generatePlanWithFallback({
      targetRole: session.targetRole,
      difficulty: session.difficulty as 'easy' | 'medium' | 'hard',
      durationMinutes: session.durationMinutes ?? 30, // legacy rows predate the column
      company: session.company,
      jobDescription: session.jobDescription,
      resumeProfile,
    });

    const questionPlan: QuestionPlan = {
      totalQuestions: plan.totalQuestions,
      topics: plan.topics,
      ...(plan.note ? { note: plan.note } : {}),
    };
    await db
      .update(interviewSessions)
      .set({ questionPlan, updatedAt: new Date() })
      .where(eq(interviewSessions.id, session.id));

    const rows = (await db
      .insert(questions)
      .values({
        sessionId: session.id,
        questionText: plan.openingQuestion,
        order: 1,
      })
      .returning()) as Array<{ id: string; questionText: string; order: number }>;

    const row = rows[0];
    if (!row) {
      throw new InterviewServiceError('Failed to persist opening question', 500);
    }

    return {
      questionId: row.id,
      questionText: row.questionText,
      intent: plan.openingIntent,
      order: row.order,
      source,
      plannedTotal: plan.totalQuestions,
    };
  }

  const plan = session.questionPlan;

  // --- Plan exists: generate the next planned question ---
  const { data: generated, source } = await generateQuestionWithFallback({
    targetRole: session.targetRole,
    difficulty: session.difficulty as 'easy' | 'medium' | 'hard',
    company: session.company,
    jobDescription: session.jobDescription,
    resumeProfile,
    previousQuestions,
    plan: { totalQuestions: plan.totalQuestions, topics: plan.topics },
    questionIndex: topLevelCount + 1,
  });

  const nextOrder = previousQuestions.length + 1;
  const rows = (await db
    .insert(questions)
    .values({
      sessionId: session.id,
      questionText: generated.questionText,
      order: nextOrder,
    })
    .returning()) as Array<{ id: string; questionText: string; order: number }>;

  const row = rows[0];
  if (!row) {
    throw new InterviewServiceError('Failed to persist question', 500);
  }

  return {
    questionId: row.id,
    questionText: row.questionText,
    intent: generated.intent,
    order: row.order,
    source,
    plannedTotal: plan.totalQuestions,
  };
}

// Answer submission + evaluation

export interface SubmitAnswerInput {
  userId: string;
  sessionId: string;
  questionId: string;
  transcriptText: string;
}

export interface SubmitAnswerResult {
  answerId: string;
  evaluation: EvaluationResult;
  /** Which layer actually served the evaluation. */
  evaluationSource: 'gemini' | 'openrouter' | 'deterministic';
  /** Which specific model served it (null for deterministic). */
  evaluationModel: string | null;
}

/**
 * Submit a transcript answer and persist its evaluation. Evaluation goes
 * through the fallback layer (Gemini → OpenRouter → deterministic), and
 * the deterministic layer never fails — this never throws on AI errors.
 */
export async function submitAnswer(
  input: SubmitAnswerInput,
): Promise<SubmitAnswerResult> {
  const session = await loadOwnedSession(input.userId, input.sessionId);

  const qRows = await db
    .select()
    .from(questions)
    .where(and(eq(questions.id, input.questionId), eq(questions.sessionId, session.id)))
    .limit(1);

  const question = qRows[0];
  if (!question) {
    throw new InterviewServiceError('Question not found in this session', 404);
  }

  const answerInserted = await db
    .insert(answers)
    .values({
      questionId: question.id,
      transcriptText: input.transcriptText,
    })
    .returning();

  const answer = answerInserted[0];
  if (!answer) {
    throw new InterviewServiceError('Failed to persist answer', 500);
  }

  const resumeProfile = await loadLatestResumeProfile(input.userId);

  const { evaluation, source, model, fellThroughAi } = await evaluateAnswerWithFallback({
    questionText: question.questionText,
    transcriptText: input.transcriptText,
    targetRole: session.targetRole,
    difficulty: session.difficulty as 'easy' | 'medium' | 'hard',
    resumeProfile: resumeProfile ?? undefined,
  });

  if (fellThroughAi) {
    console.warn(
      '[interview.service] Both AI models failed — evaluation served by deterministic fallback.',
    );
  }

  // `followUpQuestion` is kept in rawFeedback so the live page can
  // rehydrate it after a refresh.
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
      followUpQuestion: evaluation.followUpQuestion,
    },
  });

  return {
    answerId: answer.id,
    evaluation: { ...evaluation, source },
    evaluationSource: source,
    evaluationModel: model,
  };
}

// Follow-up question generation

export interface GenerateFollowUpInput {
  userId: string;
  sessionId: string;
  parentQuestionId: string;
}

export interface GenerateFollowUpResult {
  questionId: string;
  questionText: string;
  intent: string;
  order: number;
  source: 'gemini' | 'openrouter';
}

/**
 * Generate a follow-up for a parent question's latest answer and persist
 * it with `followUpOf: parentQuestionId`. If both AI models fail this
 * throws — the route maps it to 502.
 */
export async function generateFollowUpQuestion(
  input: GenerateFollowUpInput,
): Promise<GenerateFollowUpResult> {
  const session = await loadOwnedSession(input.userId, input.sessionId);

  const parentRows = await db
    .select()
    .from(questions)
    .where(and(eq(questions.id, input.parentQuestionId), eq(questions.sessionId, session.id)))
    .limit(1);

  const parent = parentRows[0];
  if (!parent) {
    throw new InterviewServiceError('Parent question not found in this session', 404);
  }

  const ansRows = await db
    .select()
    .from(answers)
    .where(eq(answers.questionId, parent.id))
    .orderBy(desc(answers.submittedAt))
    .limit(1);

  const parentAnswer = ansRows[0];
  if (!parentAnswer) {
    throw new InterviewServiceError('Parent question has no answer to follow up on', 409);
  }

  // Existing follow-ups in this chain, so the AI doesn't repeat one.
  const chainRows = await db
    .select({ id: questions.id, questionText: questions.questionText })
    .from(questions)
    .where(eq(questions.followUpOf, parent.id))
    .orderBy(asc(questions.order));
  const previousFollowUps = chainRows.map((q) => q.questionText);

  const resumeProfile = await loadLatestResumeProfile(input.userId);
  const followUpInput: FollowUpInput = {
    targetRole: session.targetRole,
    difficulty: session.difficulty as 'easy' | 'medium' | 'hard',
    company: session.company,
    resumeProfile,
    parentQuestionText: parent.questionText,
    parentAnswerText: parentAnswer.transcriptText,
    previousFollowUps,
  };

  const { data: generated, source } = await generateFollowUpWithFallback(followUpInput);

  // Order is "max + 1" so the follow-up lands at the end of the
  // timeline even if top-level questions were added in parallel.
  const orderRows = await db
    .select({ order: questions.order })
    .from(questions)
    .where(eq(questions.sessionId, session.id))
    .orderBy(desc(questions.order))
    .limit(1);
  const nextOrder = (orderRows[0]?.order ?? 0) + 1;

  const inserted = (await db
    .insert(questions)
    .values({
      sessionId: session.id,
      questionText: generated.questionText,
      order: nextOrder,
      followUpOf: parent.id,
    })
    .returning()) as Array<{ id: string; questionText: string; order: number }>;

  const row = inserted[0];
  if (!row) {
    throw new InterviewServiceError('Failed to persist follow-up question', 500);
  }

  return {
    questionId: row.id,
    questionText: row.questionText,
    intent: generated.intent,
    order: row.order,
    source,
  };
}

// Read endpoints

export interface SessionDetailResult {
  session: typeof interviewSessions.$inferSelect;
  questions: Array<{
    id: string;
    questionText: string;
    order: number;
    followUpOf: string | null;
    answer: {
      id: string;
      transcriptText: string;
      submittedAt: Date;
      evaluation: {
        overallScore: number;
        precisionLevel: number | null;
        growthPotential: number | null;
        source: string;
        rawFeedback: unknown;
      } | null;
    } | null;
  }>;
}

export async function getSessionDetail(
  userId: string,
  sessionId: string,
): Promise<SessionDetailResult> {
  // allowEnded — finished sessions must remain readable for their report.
  const session = await loadOwnedSession(userId, sessionId, true);
  return { session, questions: await assembleSessionDetail(session.id) };
}

/** Load the full question → answer → evaluation timeline for a session. */
async function assembleSessionDetail(
  sessionRowId: string,
): Promise<SessionDetailResult['questions']> {
  const qs = await db
    .select()
    .from(questions)
    .where(eq(questions.sessionId, sessionRowId))
    .orderBy(asc(questions.order));

  const detail: SessionDetailResult['questions'] = [];

  for (const q of qs) {
    const a = await db
      .select()
      .from(answers)
      .where(eq(answers.questionId, q.id))
      .orderBy(desc(answers.submittedAt))
      .limit(1);

    const ans = a[0];
    if (!ans) {
      detail.push({
        id: q.id,
        questionText: q.questionText,
        order: q.order,
        followUpOf: q.followUpOf,
        answer: null,
      });
      continue;
    }

    const e = await db
      .select()
      .from(evaluations)
      .where(eq(evaluations.answerId, ans.id))
      .limit(1);

    const ev = e[0];
    detail.push({
      id: q.id,
      questionText: q.questionText,
      order: q.order,
      followUpOf: q.followUpOf,
      answer: {
        id: ans.id,
        transcriptText: ans.transcriptText,
        submittedAt: ans.submittedAt,
        evaluation: ev
          ? {
              overallScore: ev.overallScore,
              precisionLevel: ev.precisionLevel,
              growthPotential: ev.growthPotential,
              source: ev.source,
              rawFeedback: ev.rawFeedback,
            }
          : null,
      },
    });
  }

  return detail;
}

// Session end — cumulative scorecard

/**
 * Close a session and build its cumulative report. The stats
 * (average scores, per-question table, answered/skipped) are computed
 * deterministically from the persisted evaluations, so the report
 * always exists; the AI adds the coaching narrative on top and its
 * failure only degrades the narrative (verdict becomes plain text).
 * Idempotent: ending an already-completed session returns its stored
 * summary without a fresh AI call.
 */
export async function endInterviewSession(
  userId: string,
  sessionId: string,
): Promise<SessionSummary> {
  const session = await loadOwnedSession(userId, sessionId, true);
  if (session.summary) return session.summary;

  const detail = await assembleSessionDetail(session.id);

  // Cumulative stats. Top-level and follow-up answers both count
  // towards the average — every spoken answer was evaluated.
  const scored = detail.filter(
    (q) => q.answer?.evaluation != null,
  );
  const avg = (vals: number[]): number =>
    vals.length === 0
      ? 0
      : Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;

  const overallScore = avg(scored.map((q) => q.answer!.evaluation!.overallScore));
  const precisionAvg = avg(
    scored
      .map((q) => q.answer!.evaluation!.precisionLevel)
      .filter((v): v is number => v != null),
  );
  const growthAvg = avg(
    scored
      .map((q) => q.answer!.evaluation!.growthPotential)
      .filter((v): v is number => v != null),
  );

  // A top-level question the candidate never answered counts as skipped.
  const topLevel = detail.filter((q) => q.followUpOf === null);
  const skippedCount = topLevel.filter((q) => !q.answer).length;

  const questionScores: SessionSummary['questionScores'] = detail.map((q) => ({
    order: q.order,
    questionText: q.questionText,
    score: q.answer?.evaluation?.overallScore ?? null,
    isFollowUp: q.followUpOf !== null,
  }));

  // Topic mapping for the narrative prompt: topic i belongs to top-level
  // question i (follow-ups stay under their parent's topic).
  const topics = session.questionPlan?.topics ?? [];
  let topIdx = 0;
  const entries: SummaryInput['entries'] = detail.map((q) => {
    const isTop = q.followUpOf === null;
    const topicIdx = isTop ? topIdx++ : Math.max(0, topIdx - 1);
    return {
      question: q.questionText,
      answer: q.answer?.transcriptText ?? null,
      score: q.answer?.evaluation?.overallScore ?? null,
      topic: topics[topicIdx],
      weaknesses:
        (
          q.answer?.evaluation?.rawFeedback as
            | { weaknesses?: string[] }
            | null
        )?.weaknesses ?? [],
    };
  });

  const stats: Omit<
    SessionSummary,
    'verdict' | 'strengths' | 'improvements' | 'source' | 'generatedAt'
  > = {
    overallScore,
    precisionAvg,
    growthAvg,
    answeredCount: scored.length,
    skippedCount,
    questionScores,
  };

  let narrative: SummaryNarrative;
  let source: SessionSummary['source'];
  try {
    const result = await generateSessionSummaryWithFallback({
      targetRole: session.targetRole,
      difficulty: session.difficulty as 'easy' | 'medium' | 'hard',
      company: session.company,
      durationMinutes: session.durationMinutes,
      overallScore,
      answeredCount: stats.answeredCount,
      skippedCount,
      entries,
    });
    narrative = result.data;
    source = result.source;
  } catch {
    // Both AI models down — ship the deterministic report.
    narrative = {
      verdict:
        stats.answeredCount === 0
          ? 'No questions were answered in this session, so there is nothing to score yet. Start a new interview when you are ready.'
          : `Across ${stats.answeredCount} evaluated answer(s) you averaged ${overallScore}/10 (${skippedCount} question(s) skipped). The per-question scores below show where you landed; run another session for AI coaching notes when the service is available.`,
      strengths: [],
      improvements: [],
    };
    source = 'deterministic';
  }

  const summary: SessionSummary = {
    ...stats,
    ...narrative,
    source,
    generatedAt: new Date().toISOString(),
  };

  await db
    .update(interviewSessions)
    .set({ summary, status: 'completed', endedAt: new Date(), updatedAt: new Date() })
    .where(eq(interviewSessions.id, session.id));

  return summary;
}
