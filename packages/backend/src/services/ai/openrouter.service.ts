/**
 * OpenRouter service — secondary AI layer used when Gemini fails
 * (see fallback.ts). Interface mirrors gemini.service.ts: OpenAI-compatible
 * /chat/completions with `response_format: { type: 'json_object' }`,
 * responses validated with the same Zod schemas.
 *
 * Throws on any failure; the orchestrator decides the next layer.
 */

import axios, { type AxiosInstance } from 'axios';
import { z } from 'zod';
import { config } from '../../shared/config/index.js';
import type { AnswerInput, EvaluationResult } from './evaluation.types.js';
import type { ResumeProfile } from '../../db/schema.js';

let http: AxiosInstance | null = null;

function getClient(): AxiosInstance {
  if (!http) {
    if (!config.openRouterApiKey) {
      throw new Error('OPENROUTER_API_KEY is not configured');
    }
    http = axios.create({
      baseURL: 'https://openrouter.ai/api/v1',
      timeout: 4_500,
      headers: {
        Authorization: `Bearer ${config.openRouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': config.frontendUrl,
        'X-Title': 'IntervAI',
      },
    });
  }
  return http;
}

// Zod schemas — mirror the Gemini ones so the orchestrator is provider-agnostic.
const evaluationSchema = z.object({
  overallScore: z.number().int().min(1).max(10),
  precisionLevel: z.number().int().min(1).max(10),
  growthPotential: z.number().int().min(1).max(10),
  detailedScores: z.record(z.string(), z.number().min(0).max(10)).default({}),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  suggestions: z.array(z.string()).default([]),
  followUpQuestion: z.string().optional(),
  notes: z.string().optional(),
});

const questionSchema = z.object({
  questionText: z.string().min(10).max(800),
  intent: z.string().min(3).max(200),
});

const planSchema = z.object({
  totalQuestions: z.number().int().min(1).max(20),
  topics: z.array(z.string().min(1)).min(1).max(20),
  openingQuestion: z.string().min(10).max(400),
  openingIntent: z.string().min(3).max(200),
  note: z.string().optional(),
});

// Prompt builders — same shape as Gemini's so AI behavior is consistent.
const EVAL_SYSTEM_INSTRUCTION = `You are a fair, precise interview evaluator.
Score the candidate's answer against the question and target role.
Be honest — do not inflate scores. Use the FULL 1–10 range.
Return ONLY a valid JSON object — no prose, no markdown fences.`;

function buildEvaluationPrompt(input: AnswerInput): string {
  const resumeLine = input.resumeProfile
    ? `\nCandidate resume summary: ${JSON.stringify(input.resumeProfile).slice(0, 1500)}`
    : '';
  return `Evaluate the candidate's answer.

Return JSON of the shape:
{
  "overallScore": integer 1-10,
  "precisionLevel": integer 1-10,
  "growthPotential": integer 1-10,
  "detailedScores": { "clarity": 1-10, "depth": 1-10, "relevance": 1-10 },
  "strengths": string[],
  "weaknesses": string[],
  "suggestions": string[],
  "followUpQuestion": string,
  "notes": string
}

Target role: ${input.targetRole}
Difficulty: ${input.difficulty}
${resumeLine}

Question:
"""
${input.questionText}
"""

Candidate's answer (transcript):
"""
${input.transcriptText}
"""
`;
}

const QUESTION_SYSTEM_INSTRUCTION = `You are an expert technical interviewer.
Generate one concise interview question for the given role and difficulty.
Return ONLY a valid JSON object — no prose, no markdown fences.`;

export interface QuestionInput {
  targetRole: string;
  difficulty: 'easy' | 'medium' | 'hard';
  /** Optional target company — see buildQuestionPrompt for guardrail. */
  company?: string | null;
  jobDescription?: string | null;
  resumeProfile?: ResumeProfile | null;
  previousQuestions?: string[];
  /** The session's AI-designed flow (mirrors gemini.service). */
  plan?: { totalQuestions: number; topics: string[] } | null;
  /** 1-based index of THIS question within the plan. */
  questionIndex?: number;
}

function buildQuestionPrompt(input: QuestionInput): string {
  const previousLine =
    input.previousQuestions && input.previousQuestions.length > 0
      ? `\nAlready asked (do NOT repeat):\n- ${input.previousQuestions.join('\n- ')}`
      : '';
  // "do not invent facts" guardrail: lean on the company's publicly
  // known interview style without hallucinating stale details.
  const companyLine = input.company
    ? `\nTarget company: ${input.company} (use its real interview style, format, and values as inspiration; do not invent facts about the company that are not widely known)`
    : '';
  const jdLine = input.jobDescription
    ? `\nJob description (ground the question in these requirements):\n"""\n${input.jobDescription.slice(0, 2000)}\n"""`
    : '';
  const resumeLine = input.resumeProfile
    ? `\nCandidate background (use to tailor difficulty, NOT to leak into the question):
- Skills: ${input.resumeProfile.skills.slice(0, 12).join(', ')}
- Recent role: ${
        input.resumeProfile.experience[0]
          ? `${input.resumeProfile.experience[0].role} @ ${input.resumeProfile.experience[0].company}`
          : 'unknown'
      }`
    : '';

  // Plan guidance — identical contract to gemini.service.
  let planLine = '';
  if (input.plan && input.questionIndex) {
    const { totalQuestions, topics } = input.plan;
    const topic = topics[input.questionIndex - 1] ?? topics[topics.length - 1] ?? '';
    const flow = topics.map((t, i) => `${i + 1}) ${t}`).join('\n');
    const closing =
      input.questionIndex >= totalQuestions
        ? '\nThis is the FINAL question — make it a brief wrap-up.'
        : '';
    planLine = `

You are inside a planned ${totalQuestions}-question interview. This is question ${input.questionIndex} of ${totalQuestions}.
Planned flow:
${flow}

Ask the question for step ${input.questionIndex} — topic: "${topic}". Adapt the wording to what the candidate has already said, but stay on the plan.${closing}`;
  }

  return `Generate one interview question.

Return JSON of the shape:
{
  "questionText": string,
  "intent": string
}

Target role: ${input.targetRole}
Difficulty: ${input.difficulty}${companyLine}${jdLine}${resumeLine}${previousLine}${planLine}
`;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionResponse {
  choices: Array<{
    message: { content: string };
  }>;
  model: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

async function callChatCompletion(opts: {
  systemInstruction: string;
  userPrompt: string;
  /** Set true to force JSON object output (OpenRouter passes this to the upstream model) */
  json: boolean;
  modelOverride?: string;
}): Promise<{ content: string; model: string }> {
  const client = getClient();
  const messages: ChatMessage[] = [
    { role: 'system', content: opts.systemInstruction },
    { role: 'user', content: opts.userPrompt },
  ];

  const body: Record<string, unknown> = {
    model: opts.modelOverride ?? config.openRouterModel,
    messages,
    temperature: 0.2,
  };
  if (opts.json) {
    body.response_format = { type: 'json_object' };
  }

  const res = await client.post<ChatCompletionResponse>('/chat/completions', body);

  const content = res.data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenRouter returned an empty completion');
  }
  return { content, model: res.data.model ?? opts.modelOverride ?? config.openRouterModel };
}

function extractJson(content: string): unknown {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `OpenRouter returned non-JSON: ${(err as Error).message}. First 200 chars: ${cleaned.slice(0, 200)}`,
    );
  }
}

export interface GeminiResult<T> {
  data: T;
  model: string;
}

export async function evaluateAnswerWithOpenRouter(
  input: AnswerInput,
): Promise<GeminiResult<EvaluationResult>> {
  const { content, model } = await callChatCompletion({
    systemInstruction: EVAL_SYSTEM_INSTRUCTION,
    userPrompt: buildEvaluationPrompt(input),
    json: true,
  });
  const parsed = extractJson(content);
  const validated = evaluationSchema.parse(parsed);
  return {
    data: { ...validated, source: 'openrouter' as const },
    model,
  };
}

export async function generateInterviewQuestionWithOpenRouter(
  input: QuestionInput,
): Promise<GeminiResult<{ questionText: string; intent: string }>> {
  const { content, model } = await callChatCompletion({
    systemInstruction: QUESTION_SYSTEM_INSTRUCTION,
    userPrompt: buildQuestionPrompt(input),
    json: true,
  });
  const parsed = extractJson(content);
  const validated = questionSchema.parse(parsed);
  return { data: validated, model };
}

const PLAN_SYSTEM_INSTRUCTION = `You are a senior interviewer designing a mock interview.
Design the complete flow for a spoken mock interview of the given duration.
Decide yourself how many main questions fit that time (budget roughly
3–4 minutes per main question, covering the candidate's spoken answer and
any short follow-up). Order the topics the way a real interviewer would:
open with a warm introduction question, then build from background into
role-specific depth, ending with wrap-up / candidate questions.
Use the resume and job description (when provided) to make the topics
specific to THIS candidate, not generic.
Return ONLY a valid JSON object — no prose, no markdown fences.`;

function buildPlanPrompt(input: {
  targetRole: string;
  difficulty: 'easy' | 'medium' | 'hard';
  durationMinutes: number;
  company?: string | null;
  jobDescription?: string | null;
  resumeProfile?: ResumeProfile | null;
}): string {
  const companyLine = input.company
    ? `\nTarget company: ${input.company} (shape the flow around its real interview style and values; do not invent facts about the company that are not widely known)`
    : '';
  const jdLine = input.jobDescription
    ? `\nJob description (ground the topics in these requirements):\n"""\n${input.jobDescription.slice(0, 2000)}\n"""`
    : '';
  const resumeLine = input.resumeProfile
    ? `\nCandidate background (make topics reference their actual skills / projects):
- Skills: ${input.resumeProfile.skills.slice(0, 12).join(', ')}
- Recent role: ${
        input.resumeProfile.experience[0]
          ? `${input.resumeProfile.experience[0].role} @ ${input.resumeProfile.experience[0].company}`
          : 'unknown'
      }`
    : '';

  return `Design the interview flow.

Return JSON of the shape:
{
  "totalQuestions": integer,     // how many main questions fit the duration (you decide)
  "topics": string[],            // one topic per question, in order — topic i is question i
  "openingQuestion": string,     // the FIRST question to ask, conventional interview opener
  "openingIntent": string,       // short tag for the opener, e.g. "introduction"
  "note": string                 // 1 sentence on how you sized the flow (optional)
}

Target role: ${input.targetRole}
Difficulty: ${input.difficulty}
Interview duration: ${input.durationMinutes} minutes${companyLine}${jdLine}${resumeLine}
`;
}

/** Design the interview flow via OpenRouter (fallback for the Gemini planner). */
export async function generateInterviewPlanWithOpenRouter(
  input: {
    targetRole: string;
    difficulty: 'easy' | 'medium' | 'hard';
    durationMinutes: number;
    company?: string | null;
    jobDescription?: string | null;
    resumeProfile?: ResumeProfile | null;
  },
): Promise<GeminiResult<{
  totalQuestions: number;
  topics: string[];
  openingQuestion: string;
  openingIntent: string;
  note?: string;
}>> {
  const { content, model } = await callChatCompletion({
    systemInstruction: PLAN_SYSTEM_INSTRUCTION,
    userPrompt: buildPlanPrompt(input),
    json: true,
  });
  const parsed = extractJson(content);
  const validated = planSchema.parse(parsed);
  return { data: validated, model };
}

// Follow-up questions — mirrors gemini.service.ts (same prompt shape, same schema).
const FOLLOW_UP_SYSTEM_INSTRUCTION = `You are an expert technical interviewer conducting a real interview.
Given the previous question and the candidate's answer, generate ONE short follow-up question that:
  - Probes a specific claim, gap, or interesting thread in the answer
  - Is answerable in 30–60 seconds of spoken response
  - Does NOT repeat the previous question or re-ask something they already covered
  - Stays on-topic for the target role and difficulty
Return ONLY a valid JSON object — no prose, no markdown fences.`;

export interface FollowUpInput {
  targetRole: string;
  difficulty: 'easy' | 'medium' | 'hard';
  company?: string | null;
  resumeProfile?: ResumeProfile | null;
  parentQuestionText: string;
  parentAnswerText: string;
  previousFollowUps?: string[];
}

function buildFollowUpPrompt(input: FollowUpInput): string {
  const companyLine = input.company
    ? `\nTarget company: ${input.company} (use its real interview style, format, and values as inspiration; do not invent facts about the company that are not widely known)`
    : '';
  const resumeLine = input.resumeProfile
    ? `\nCandidate background (use to tailor difficulty, NOT to leak into the question):
- Skills: ${input.resumeProfile.skills.slice(0, 12).join(', ')}
- Recent role: ${
        input.resumeProfile.experience[0]
          ? `${input.resumeProfile.experience[0].role} @ ${input.resumeProfile.experience[0].company}`
          : 'unknown'
      }`
    : '';
  const previousFollowUpsLine =
    input.previousFollowUps && input.previousFollowUps.length > 0
      ? `\nPrevious follow-ups in this chain (do NOT repeat):\n- ${input.previousFollowUps.join('\n- ')}`
      : '';

  return `Generate one short follow-up question for the candidate's previous answer.

Return JSON of the shape:
{
  "questionText": string,
  "intent": string
}

Target role: ${input.targetRole}
Difficulty: ${input.difficulty}${companyLine}${resumeLine}${previousFollowUpsLine}

Previous question:
"""
${input.parentQuestionText}
"""

Candidate's answer (transcript):
"""
${input.parentAnswerText}
"""
`;
}

export async function generateFollowUpWithOpenRouter(
  input: FollowUpInput,
): Promise<GeminiResult<{ questionText: string; intent: string }>> {
  const { content, model } = await callChatCompletion({
    systemInstruction: FOLLOW_UP_SYSTEM_INSTRUCTION,
    userPrompt: buildFollowUpPrompt(input),
    json: true,
  });
  const parsed = extractJson(content);
  const validated = questionSchema.parse(parsed);
  return { data: validated, model };
}

// Session summary narrative — mirrors gemini.service.ts. The cumulative
// scores are computed by the service; this only writes the wrap-up text.

const summarySchema = z.object({
  verdict: z.string().min(20).max(700),
  strengths: z.array(z.string().min(3).max(300)).min(1).max(6),
  improvements: z.array(z.string().min(3).max(300)).min(1).max(6),
});

interface SummaryEntry {
  question: string;
  answer: string | null;
  score: number | null;
  topic?: string;
  weaknesses: string[];
}

export interface SessionSummaryInput {
  targetRole: string;
  difficulty: 'easy' | 'medium' | 'hard';
  company?: string | null;
  durationMinutes?: number | null;
  overallScore: number;
  answeredCount: number;
  skippedCount: number;
  entries: SummaryEntry[];
}

export interface SessionSummaryNarrative {
  verdict: string;
  strengths: string[];
  improvements: string[];
}

const SUMMARY_SYSTEM_INSTRUCTION = `You are a senior interview coach writing the wrap-up of a completed mock interview.
You are given the full Q&A record with the per-question scores that were
already assigned — do NOT re-score anything, only interpret the pattern.
Be specific: reference the actual questions/topics the candidate handled
well or poorly. Be honest — no empty encouragement.
Return ONLY a valid JSON object — no prose, no markdown fences.`;

function buildSummaryPrompt(input: SessionSummaryInput): string {
  const companyLine = input.company ? `\nTarget company: ${input.company}` : '';
  const durationLine = input.durationMinutes
    ? `\nPlanned duration: ${input.durationMinutes} minutes`
    : '';
  const record = input.entries
    .map((e, i) => {
      const topic = e.topic ? ` [topic: ${e.topic}]` : '';
      const score = e.score === null ? 'SKIPPED (never answered)' : `${e.score}/10`;
      const answer = e.answer
        ? `Answer: """\n${e.answer.slice(0, 500)}\n"""`
        : 'Answer: (none)';
      const weak = e.weaknesses.length
        ? `Known weaknesses noted: ${e.weaknesses.join('; ')}`
        : '';
      return `Q${i + 1}${topic} — score: ${score}\nQuestion: ${e.question}\n${answer}\n${weak}`;
    })
    .join('\n\n');

  return `Write the session wrap-up for this completed mock interview.

Return JSON of the shape:
{
  "verdict": string,         // 2-4 sentences on overall performance and interview readiness
  "strengths": string[],     // 1-6 cross-question strengths (patterns, not one-off praise)
  "improvements": string[]   // 1-6 highest-leverage things to work on, concrete
}

Target role: ${input.targetRole}
Difficulty: ${input.difficulty}${companyLine}${durationLine}
Answered ${input.answeredCount} question(s), skipped ${input.skippedCount}. Average score: ${input.overallScore}/10.

Full record:
${record}
`;
}

/** Generate the session-report narrative via OpenRouter (Gemini fallback). */
export async function generateSessionSummaryWithOpenRouter(
  input: SessionSummaryInput,
): Promise<GeminiResult<SessionSummaryNarrative>> {
  const { content, model } = await callChatCompletion({
    systemInstruction: SUMMARY_SYSTEM_INSTRUCTION,
    userPrompt: buildSummaryPrompt(input),
    json: true,
  });
  const parsed = extractJson(content);
  const validated = summarySchema.parse(parsed);
  return { data: validated, model };
}
