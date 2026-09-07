/**
 * AI Fallback Orchestrator — the single entry point the interview
 * service uses for all AI work (it never calls Gemini/OpenRouter directly).
 *
 *   Layer 1 — model fallback: Gemini (primary) → OpenRouter, same
 *     prompt shape and Zod schema.
 *   Layer 2 — deterministic evaluation fallback (evaluation only).
 *     Pure heuristic, never throws, so live interviews always continue.
 *     Question/plan/follow-up generation has NO deterministic fallback:
 *     both models failing throws and the route returns 502.
 *
 * The core is a set of pure `orchestrate*` functions taking a `deps`
 * object; the exported `*WithFallback` wrappers pass the real AI-layer
 * functions (lazy-loaded so tests don't need env vars).
 */

import type { AnswerInput, EvaluationResult } from './evaluation.types.js';
import type { ResumeProfile } from '../../db/schema.js';

// Inline minimal Axios-error describer — avoids importing the OpenRouter
// service at module load (which would pull in config's env validation).
function describeAxiosError(err: unknown): string {
  if (err && typeof err === 'object' && 'isAxiosError' in err) {
    const e = err as {
      code?: string;
      response?: { status?: number };
      message?: string;
    };
    if (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT') return 'timeout';
    if (e.response?.status === 429) return 'rate-limited';
    if (e.response?.status && e.response.status >= 500) return `upstream-${e.response.status}`;
    if (e.response?.status && e.response.status >= 400) return `http-${e.response.status}`;
    return e.message ?? 'unknown axios error';
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

// Per-model timeout. Gemini question-gen measures ~2–5s; 15s gives
// real headroom while still bounding worst-case wait before fallthrough.
// withTimeout also rejects calls whose SDK hangs past its own internal
// timeout (Gemini SDK, or OpenRouter's 4.5s axios cap).
const PER_MODEL_TIMEOUT_MS = 15_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} exceeded ${ms}ms timeout`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

// Shared types

export interface QuestionInput {
  targetRole: string;
  difficulty: 'easy' | 'medium' | 'hard';
  /** Optional target company — see gemini.service for guardrail. */
  company?: string | null;
  jobDescription?: string | null;
  resumeProfile?: ResumeProfile | null;
  previousQuestions?: string[];
  /** The session's AI-designed flow — the question must advance it. */
  plan?: { totalQuestions: number; topics: string[] } | null;
  /** 1-based index of THIS question within the plan (top-level only). */
  questionIndex?: number;
}

/**
 * One-shot interview planner input. Runs once per session on the first
 * next-question call; the model decides the question count from durationMinutes.
 */
export interface PlanInput {
  targetRole: string;
  difficulty: 'easy' | 'medium' | 'hard';
  durationMinutes: number;
  company?: string | null;
  jobDescription?: string | null;
  resumeProfile?: ResumeProfile | null;
}

export interface InterviewPlan {
  totalQuestions: number;
  topics: string[];
  openingQuestion: string;
  openingIntent: string;
  note?: string;
}

export interface FallbackPlanResult {
  data: InterviewPlan;
  source: 'gemini' | 'openrouter';
  model: string;
}

export interface FallbackQuestionResult {
  data: { questionText: string; intent: string };
  source: 'gemini' | 'openrouter';
  model: string;
}

/**
 * Follow-up generation — QuestionInput plus the parent question and the
 * candidate's transcript answer. No deterministic fallback: both models
 * failing throws so the route returns 502.
 */
export interface FollowUpInput {
  targetRole: string;
  difficulty: 'easy' | 'medium' | 'hard';
  company?: string | null;
  resumeProfile?: ResumeProfile | null;
  parentQuestionText: string;
  parentAnswerText: string;
  previousFollowUps?: string[];
}

export interface FallbackFollowUpResult {
  data: { questionText: string; intent: string };
  source: 'gemini' | 'openrouter';
  model: string;
}

export interface FallbackEvaluationResult {
  evaluation: EvaluationResult;
  source: 'gemini' | 'openrouter' | 'deterministic';
  /** Which specific model served the request (only set for AI layers) */
  model: string | null;
  /** Whether the deterministic fallback was used after AI failure */
  fellThroughAi: boolean;
}

/**
 * Session-summary narrative input — the service has already computed the
 * cumulative scores; the model only writes the verdict/strengths/
 * improvements on top. Kept structurally compatible with the per-service
 * copies (gemini.service / openrouter.service).
 */
export interface SummaryInput {
  targetRole: string;
  difficulty: 'easy' | 'medium' | 'hard';
  company?: string | null;
  durationMinutes?: number | null;
  overallScore: number;
  answeredCount: number;
  skippedCount: number;
  entries: Array<{
    question: string;
    answer: string | null;
    score: number | null;
    topic?: string;
    weaknesses: string[];
  }>;
}

export interface SummaryNarrative {
  verdict: string;
  strengths: string[];
  improvements: string[];
}

export interface FallbackSummaryResult {
  data: SummaryNarrative;
  source: 'gemini' | 'openrouter';
  model: string;
}

// Pure orchestrator (testable) — the exported wrappers below pass real deps.

type GeminiEvalFn = (input: AnswerInput) => Promise<{ data: EvaluationResult; model: string }>;
type OpenRouterEvalFn = (input: AnswerInput) => Promise<{ data: EvaluationResult; model: string }>;
type DeterministicEvalFn = (input: AnswerInput) => EvaluationResult;
type GeminiGenQFn = (input: QuestionInput) => Promise<{ data: { questionText: string; intent: string }; model: string }>;
type OpenRouterGenQFn = (input: QuestionInput) => Promise<{ data: { questionText: string; intent: string }; model: string }>;
type GeminiPlanFn = (input: PlanInput) => Promise<{ data: InterviewPlan; model: string }>;
type OpenRouterPlanFn = (input: PlanInput) => Promise<{ data: InterviewPlan; model: string }>;
type GeminiFollowUpFn = (input: FollowUpInput) => Promise<{ data: { questionText: string; intent: string }; model: string }>;
type OpenRouterFollowUpFn = (input: FollowUpInput) => Promise<{ data: { questionText: string; intent: string }; model: string }>;
type GeminiSummaryFn = (input: SummaryInput) => Promise<{ data: SummaryNarrative; model: string }>;
type OpenRouterSummaryFn = (input: SummaryInput) => Promise<{ data: SummaryNarrative; model: string }>;

export interface OrchestratorDeps {
  geminiEval: GeminiEvalFn;
  openRouterEval: OpenRouterEvalFn;
  deterministicEval: DeterministicEvalFn;
  geminiGenQ: GeminiGenQFn;
  openRouterGenQ: OpenRouterGenQFn;
  geminiPlan: GeminiPlanFn;
  openRouterPlan: OpenRouterPlanFn;
  geminiFollowUp: GeminiFollowUpFn;
  openRouterFollowUp: OpenRouterFollowUpFn;
  // Optional so orchestrator tests keep compiling; the service always
  // wires the real ones via getRealDeps.
  geminiSummary?: GeminiSummaryFn;
  openRouterSummary?: OpenRouterSummaryFn;
  /** Per-model timeout in ms (override in tests to make them fast) */
  perModelTimeoutMs?: number;
  log?: (line: string) => void;
}

export async function orchestrateEvaluation(
  input: AnswerInput,
  deps: OrchestratorDeps,
): Promise<FallbackEvaluationResult> {
  const timeout = deps.perModelTimeoutMs ?? PER_MODEL_TIMEOUT_MS;
  const log = deps.log ?? (() => {});

  // --- Layer 1a: Gemini ---
  try {
    const { data, model } = await withTimeout(
      deps.geminiEval(input),
      timeout,
      'gemini.evaluateAnswer',
    );
    log(JSON.stringify({ event: 'ai.served', source: 'gemini', model, ts: new Date().toISOString() }));
    return { evaluation: data, source: 'gemini', model, fellThroughAi: false };
  } catch (geminiErr) {
    log(
      `[ai-fallback] Gemini evaluation failed, trying OpenRouter: ${(geminiErr as Error).message}`,
    );
  }

  // --- Layer 1b: OpenRouter ---
  try {
    const { data, model } = await withTimeout(
      deps.openRouterEval(input),
      timeout,
      'openrouter.evaluateAnswer',
    );
    log(JSON.stringify({ event: 'ai.served', source: 'openrouter', model, ts: new Date().toISOString() }));
    return { evaluation: data, source: 'openrouter', model, fellThroughAi: false };
  } catch (openErr) {
    log(
      `[ai-fallback] OpenRouter evaluation also failed, using deterministic: ${describeAxiosError(openErr)}`,
    );
  }

  // --- Layer 2: deterministic (cannot throw) ---
  const det = deps.deterministicEval(input);
  log(JSON.stringify({ event: 'ai.served', source: 'deterministic', model: null, ts: new Date().toISOString() }));
  return { evaluation: det, source: 'deterministic', model: null, fellThroughAi: true };
}

/**
 * Pure question-gen orchestrator — Layer 1 only, throws if both models fail.
 */
export async function orchestrateQuestion(
  input: QuestionInput,
  deps: OrchestratorDeps,
): Promise<FallbackQuestionResult> {
  const timeout = deps.perModelTimeoutMs ?? PER_MODEL_TIMEOUT_MS;
  const log = deps.log ?? (() => {});

  try {
    const { data, model } = await withTimeout(
      deps.geminiGenQ(input),
      timeout,
      'gemini.generateQuestion',
    );
    log(JSON.stringify({ event: 'ai.served', source: 'gemini', model, ts: new Date().toISOString() }));
    return { data, source: 'gemini', model };
  } catch (geminiErr) {
    log(
      `[ai-fallback] Gemini question-gen failed, trying OpenRouter: ${(geminiErr as Error).message}`,
    );
  }

  try {
    const { data, model } = await withTimeout(
      deps.openRouterGenQ(input),
      timeout,
      'openrouter.generateQuestion',
    );
    log(JSON.stringify({ event: 'ai.served', source: 'openrouter', model, ts: new Date().toISOString() }));
    return { data, source: 'openrouter', model };
  } catch (openErr) {
    log(
      `[ai-fallback] OpenRouter question-gen also failed: ${describeAxiosError(openErr)}`,
    );
    throw new Error('All AI models failed for question generation');
  }
}

/**
 * Pure plan orchestrator — Layer 1 only, throws if both models fail.
 * We deliberately do NOT degrade the planner: a failed plan means the
 * session has no designed flow, and shipping a random question instead
 * is exactly what this feature exists to prevent. The route maps the
 * throw to 502 and the client offers a retry.
 */
export async function orchestratePlan(
  input: PlanInput,
  deps: OrchestratorDeps,
): Promise<FallbackPlanResult> {
  const timeout = deps.perModelTimeoutMs ?? PER_MODEL_TIMEOUT_MS;
  const log = deps.log ?? (() => {});

  try {
    const { data, model } = await withTimeout(
      deps.geminiPlan(input),
      timeout,
      'gemini.generatePlan',
    );
    log(JSON.stringify({ event: 'ai.served', source: 'gemini', model, task: 'plan', ts: new Date().toISOString() }));
    return { data, source: 'gemini', model };
  } catch (geminiErr) {
    log(
      `[ai-fallback] Gemini plan failed, trying OpenRouter: ${(geminiErr as Error).message}`,
    );
  }

  try {
    const { data, model } = await withTimeout(
      deps.openRouterPlan(input),
      timeout,
      'openrouter.generatePlan',
    );
    log(JSON.stringify({ event: 'ai.served', source: 'openrouter', model, task: 'plan', ts: new Date().toISOString() }));
    return { data, source: 'openrouter', model };
  } catch (openErr) {
    log(
      `[ai-fallback] OpenRouter plan also failed: ${describeAxiosError(openErr)}`,
    );
    throw new Error('All AI models failed for interview planning');
  }
}

/**
 * Pure follow-up orchestrator — same Layer-1-only shape as question-gen;
 * throws so the route can return 502 (no canned "tell me more" fallback).
 */
export async function orchestrateFollowUp(
  input: FollowUpInput,
  deps: OrchestratorDeps,
): Promise<FallbackFollowUpResult> {
  const timeout = deps.perModelTimeoutMs ?? PER_MODEL_TIMEOUT_MS;
  const log = deps.log ?? (() => {});

  try {
    const { data, model } = await withTimeout(
      deps.geminiFollowUp(input),
      timeout,
      'gemini.generateFollowUp',
    );
    log(JSON.stringify({ event: 'ai.served', source: 'gemini', model, ts: new Date().toISOString() }));
    return { data, source: 'gemini', model };
  } catch (geminiErr) {
    log(
      `[ai-fallback] Gemini follow-up failed, trying OpenRouter: ${(geminiErr as Error).message}`,
    );
  }

  try {
    const { data, model } = await withTimeout(
      deps.openRouterFollowUp(input),
      timeout,
      'openrouter.generateFollowUp',
    );
    log(JSON.stringify({ event: 'ai.served', source: 'openrouter', model, ts: new Date().toISOString() }));
    return { data, source: 'openrouter', model };
  } catch (openErr) {
    log(
      `[ai-fallback] OpenRouter follow-up also failed: ${describeAxiosError(openErr)}`,
    );
    throw new Error('All AI models failed for follow-up generation');
  }
}

/**
 * Pure summary-narrative orchestrator — Layer 1 only. Unlike
 * question/plan/follow-up, a summary failure is NOT fatal: the service
 * catches the throw and persists the deterministic report (scores were
 * already computed; only the coaching narrative is missing).
 */
export async function orchestrateSummary(
  input: SummaryInput,
  deps: OrchestratorDeps,
): Promise<FallbackSummaryResult> {
  const timeout = deps.perModelTimeoutMs ?? PER_MODEL_TIMEOUT_MS;
  const log = deps.log ?? (() => {});

  try {
    if (!deps.geminiSummary) throw new Error('gemini summary layer not wired');
    const { data, model } = await withTimeout(
      deps.geminiSummary(input),
      timeout,
      'gemini.generateSummary',
    );
    log(JSON.stringify({ event: 'ai.served', source: 'gemini', model, task: 'summary', ts: new Date().toISOString() }));
    return { data, source: 'gemini', model };
  } catch (geminiErr) {
    log(
      `[ai-fallback] Gemini summary failed, trying OpenRouter: ${(geminiErr as Error).message}`,
    );
  }

  try {
    if (!deps.openRouterSummary) throw new Error('openrouter summary layer not wired');
    const { data, model } = await withTimeout(
      deps.openRouterSummary(input),
      timeout,
      'openrouter.generateSummary',
    );
    log(JSON.stringify({ event: 'ai.served', source: 'openrouter', model, task: 'summary', ts: new Date().toISOString() }));
    return { data, source: 'openrouter', model };
  } catch (openErr) {
    log(
      `[ai-fallback] OpenRouter summary also failed: ${describeAxiosError(openErr)}`,
    );
    throw new Error('All AI models failed for session summary');
  }
}

// Public API — production entry points. The AI-layer modules are
// lazy-loaded here (rather than at the top of the file) so tests that
// only use the pure orchestrators don't transitively pull in config's
// env-var validation.
let _realDeps: OrchestratorDeps | null = null;
async function getRealDeps(): Promise<OrchestratorDeps> {
  if (_realDeps) return _realDeps;
  const [geminiMod, openRouterMod, deterministicMod] = await Promise.all([
    import('./gemini.service.js'),
    import('./openrouter.service.js'),
    import('./deterministic-evaluator.js'),
  ]);
  _realDeps = {
    geminiEval: geminiMod.evaluateAnswerWithGemini,
    openRouterEval: openRouterMod.evaluateAnswerWithOpenRouter,
    deterministicEval: deterministicMod.evaluateAnswerDeterministically,
    geminiGenQ: geminiMod.generateInterviewQuestion,
    openRouterGenQ: openRouterMod.generateInterviewQuestionWithOpenRouter,
    geminiPlan: geminiMod.generateInterviewPlan,
    openRouterPlan: openRouterMod.generateInterviewPlanWithOpenRouter,
    geminiFollowUp: geminiMod.generateFollowUpWithGemini,
    openRouterFollowUp: openRouterMod.generateFollowUpWithOpenRouter,
    geminiSummary: geminiMod.generateSessionSummary,
    openRouterSummary: openRouterMod.generateSessionSummaryWithOpenRouter,
    perModelTimeoutMs: PER_MODEL_TIMEOUT_MS,
    log: (line) => console.log(line),
  };
  return _realDeps;
}

export async function evaluateAnswerWithFallback(
  input: AnswerInput,
): Promise<FallbackEvaluationResult> {
  const deps = await getRealDeps();
  return orchestrateEvaluation(input, deps);
}

export async function generateQuestionWithFallback(
  input: QuestionInput,
): Promise<FallbackQuestionResult> {
  const deps = await getRealDeps();
  return orchestrateQuestion(input, deps);
}

export async function generatePlanWithFallback(
  input: PlanInput,
): Promise<FallbackPlanResult> {
  const deps = await getRealDeps();
  return orchestratePlan(input, deps);
}

export async function generateFollowUpWithFallback(
  input: FollowUpInput,
): Promise<FallbackFollowUpResult> {
  const deps = await getRealDeps();
  return orchestrateFollowUp(input, deps);
}

export async function generateSessionSummaryWithFallback(
  input: SummaryInput,
): Promise<FallbackSummaryResult> {
  const deps = await getRealDeps();
  return orchestrateSummary(input, deps);
}
