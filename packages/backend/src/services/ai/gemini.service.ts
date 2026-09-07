/**
 * Gemini service — the primary AI layer (fallback.ts orchestrates it).
 * Every call forces JSON output, parses it, and validates with a Zod
 * schema; any failure throws and the orchestrator decides the next layer.
 * This file knows nothing about OpenRouter or the deterministic evaluator.
 */

import { GoogleGenerativeAI, type GenerationConfig } from '@google/generative-ai';
import { z } from 'zod';
import { config } from '../../shared/config/index.js';
import type { ResumeProfile } from '../../db/schema.js';
import type { AnswerInput, EvaluationResult } from './evaluation.types.js';

// Client singleton
let client: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!client) {
    if (!config.geminiApiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }
    client = new GoogleGenerativeAI(config.geminiApiKey);
  }
  return client;
}

// Zod schemas for model output validation
const resumeProfileSchema = z.object({
  name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  skills: z.array(z.string()).default([]),
  experience: z
    .array(
      z.object({
        company: z.string().default(''),
        role: z.string().default(''),
        startDate: z.string().default(''),
        endDate: z.string().nullable().optional(),
        description: z.string().default(''),
      }),
    )
    .default([]),
  projects: z
    .array(
      z.object({
        name: z.string().default(''),
        description: z.string().default(''),
        technologies: z.array(z.string()).default([]),
        url: z.string().nullable().optional(),
      }),
    )
    .default([]),
  education: z
    .array(
      z.object({
        institution: z.string().default(''),
        degree: z.string().default(''),
        field: z.string().default(''),
        startDate: z.string().default(''),
        endDate: z.string().nullable().optional(),
        gpa: z.string().nullable().optional(),
      }),
    )
    .default([]),
});

const questionSchema = z.object({
  questionText: z.string().min(10).max(800),
  intent: z.string().min(3).max(200), // e.g. "assess system design depth"
});

const planSchema = z.object({
  totalQuestions: z.number().int().min(1).max(20),
  topics: z.array(z.string().min(1)).min(1).max(20),
  openingQuestion: z.string().min(10).max(400),
  openingIntent: z.string().min(3).max(200),
  note: z.string().optional(),
});

const summarySchema = z.object({
  verdict: z.string().min(20).max(700),
  strengths: z.array(z.string().min(3).max(300)).min(1).max(6),
  improvements: z.array(z.string().min(3).max(300)).min(1).max(6),
});

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

// Prompt builders
const RESUME_SYSTEM_INSTRUCTION = `You are a precise resume parser.
Extract structured information from the candidate's resume text.
Return ONLY a valid JSON object matching the schema. No prose, no markdown fences.
If a field cannot be inferred, use null (for scalars) or an empty array.
Be conservative: do not invent facts that are not in the resume.`;

function buildResumePrompt(resumeText: string): string {
  const MAX_CHARS = 12_000;
  const trimmed =
    resumeText.length > MAX_CHARS
      ? resumeText.slice(0, MAX_CHARS) + '\n...[truncated]'
      : resumeText;

  return `Extract the candidate's resume into the following JSON shape.

Required JSON shape:
{
  "name": string | null,
  "email": string | null,
  "phone": string | null,
  "location": string | null,
  "summary": string | null,
  "skills": string[],
  "experience": [
    { "company": string, "role": string, "startDate": string, "endDate": string | null, "description": string }
  ],
  "projects": [
    { "name": string, "description": string, "technologies": string[], "url": string | null }
  ],
  "education": [
    { "institution": string, "degree": string, "field": string, "startDate": string, "endDate": string | null, "gpa": string | null }
  ]
}

Resume text:
"""
${trimmed}
"""
`;
}

const QUESTION_SYSTEM_INSTRUCTION = `You are an expert technical interviewer.
Generate one concise interview question for the given role and difficulty.
Return ONLY a valid JSON object — no prose, no markdown fences.
The question must be answerable in 60–120 seconds of spoken response.`;

// Interview planning — the session's first next-question call designs the
// whole flow (question count for the duration, topic order, opening
// question); every later question is generated against that plan.
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
  // Trim so one big paste can't dominate the prompt.
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
                                 // (e.g. "tell me about yourself" / "walk me through your
                                 // background"), tailored to this candidate when possible
  "openingIntent": string,       // short tag for the opener, e.g. "introduction"
  "note": string                 // 1 sentence on how you sized the flow (optional)
}

Target role: ${input.targetRole}
Difficulty: ${input.difficulty}
Interview duration: ${input.durationMinutes} minutes${companyLine}${jdLine}${resumeLine}
`;
}

export interface QuestionInput {
  targetRole: string;
  difficulty: 'easy' | 'medium' | 'hard';
  /** Optional target company — see buildQuestionPrompt for guardrail. */
  company?: string | null;
  jobDescription?: string | null;
  resumeProfile?: ResumeProfile | null;
  previousQuestions?: string[];
  /** The session's AI-designed flow. When present the question must
   * advance the plan instead of being a random ask. */
  plan?: { totalQuestions: number; topics: string[] } | null;
  /** 1-based index of THIS question within the plan (top-level only). */
  questionIndex?: number;
}

function buildQuestionPrompt(input: QuestionInput): string {
  const previousLine =
    input.previousQuestions && input.previousQuestions.length > 0
      ? `\nAlready asked (do NOT repeat):\n- ${input.previousQuestions.join('\n- ')}`
      : '';
  // "do not invent facts" guardrail: lean on the company's publicly
  // known interview style without hallucinating stale question sets.
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

  // When a plan exists, this question must advance it instead of
  // being a random ask.
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
  "questionText": string,      // the question itself, max 800 chars
  "intent": string             // short tag like "system design", "behavioral", "troubleshooting"
}

Target role: ${input.targetRole}
Difficulty: ${input.difficulty}${companyLine}${jdLine}${resumeLine}${previousLine}${planLine}
`;
}

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
  "overallScore": integer 1-10,        // overall quality
  "precisionLevel": integer 1-10,      // confidence in this score (10 = very confident)
  "growthPotential": integer 1-10,     // how much room they have to grow (10 = huge room)
  "detailedScores": {                   // any per-dimension scores you think are useful
    "clarity": 1-10,
    "depth": 1-10,
    "relevance": 1-10
  },
  "strengths": string[],                 // 1-4 bullets
  "weaknesses": string[],               // 1-4 bullets
  "suggestions": string[],              // 1-4 actionable bullets
  "followUpQuestion": string,           // one short follow-up (optional, omit if none)
  "notes": string                       // 1-2 sentence summary
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

/**
 * Free-tier quotas reset daily per model (~20 requests/day), and "latest"
 * aliases can hit transient 503 capacity errors — so on an
 * unavailable-model error we rotate through the candidates and only
 * then surface the failure to the fallback orchestrator.
 */
const MODEL_ROTATION = [
  'gemini-flash-latest',
  'gemini-2.5-flash',
  'gemini-flash-lite-latest',
];

function isModelUnavailableError(err: unknown): boolean {
  const msg = (err as Error)?.message ?? '';
  return /\[429/.test(msg) || /\[503/.test(msg) || /quota/i.test(msg) || /high demand/i.test(msg);
}

async function generateJson<T>(opts: {
  systemInstruction: string;
  userPrompt: string;
  schema: z.ZodType<T>;
  model?: string;
  temperature?: number;
}): Promise<{ data: T; model: string }> {
  const genAI = getClient();
  const configured = opts.model ?? config.geminiModel;
  const candidates = opts.model
    ? [opts.model]
    : [configured, ...MODEL_ROTATION.filter((m) => m !== configured)];

  let lastError: unknown = null;
  for (const modelName of candidates) {
    try {
      const data = await callGemini(genAI, modelName, opts);
      return { data, model: modelName };
    } catch (err) {
      if (!isModelUnavailableError(err)) throw err;
      lastError = err;
    }
  }
  throw lastError ?? new Error('No Gemini models available');
}

async function callGemini<T>(
  genAI: ReturnType<typeof getClient>,
  modelName: string,
  opts: {
    systemInstruction: string;
    userPrompt: string;
    schema: z.ZodType<T>;
    temperature?: number;
  },
): Promise<T> {
  const model = genAI.getGenerativeModel(
    {
      model: modelName,
      systemInstruction: opts.systemInstruction,
      generationConfig: {
        temperature: opts.temperature ?? 0.2,
        topP: 0.9,
        responseMimeType: 'application/json',
      } satisfies GenerationConfig,
    },
    // SDK-level HTTP timeout; kept under the orchestrator's 15s race
    // so timeouts surface as clean SDK errors, with the race only
    // catching a fully hung call.
    { timeout: 14_000 },
  );

  const result = await model.generateContent(opts.userPrompt);
  const raw = result.response.text();

  if (!raw) {
    throw new Error('Gemini returned an empty response');
  }

  // Strip accidental code fences just in case
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `Gemini returned non-JSON: ${(err as Error).message}. First 200 chars: ${cleaned.slice(0, 200)}`,
    );
  }

  return opts.schema.parse(parsed);
}

export interface GeminiResult<T> {
  data: T;
  model: string;
}

export async function extractResumeProfile(
  resumeText: string,
): Promise<GeminiResult<ResumeProfile>> {
  const { data, model } = await generateJson({
    systemInstruction: RESUME_SYSTEM_INSTRUCTION,
    userPrompt: buildResumePrompt(resumeText),
    schema: resumeProfileSchema,
    temperature: 0.1,
  });
  return { data: data as ResumeProfile, model };
}

export async function generateInterviewQuestion(
  input: QuestionInput,
): Promise<GeminiResult<{ questionText: string; intent: string }>> {
  const { data, model } = await generateJson({
    systemInstruction: QUESTION_SYSTEM_INSTRUCTION,
    userPrompt: buildQuestionPrompt(input),
    schema: questionSchema,
    temperature: 0.7, // higher for variety across questions
  });
  return { data, model };
}

export interface PlanInput {
  targetRole: string;
  difficulty: 'easy' | 'medium' | 'hard';
  durationMinutes: number;
  company?: string | null;
  jobDescription?: string | null;
  resumeProfile?: ResumeProfile | null;
}

/** Design the interview flow for a fresh session. */
export async function generateInterviewPlan(
  input: PlanInput,
): Promise<GeminiResult<{
  totalQuestions: number;
  topics: string[];
  openingQuestion: string;
  openingIntent: string;
  note?: string;
}>> {
  const { data, model } = await generateJson({
    systemInstruction: PLAN_SYSTEM_INSTRUCTION,
    userPrompt: buildPlanPrompt(input),
    schema: planSchema,
    temperature: 0.4,
  });
  return { data, model };
}

// Follow-up questions — a single short probe of the candidate's previous
// answer (30–60s), tied to a specific claim, gap, or thread in the transcript.

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
  /** Previous top-level question + candidate's answer — the source of the follow-up */
  parentQuestionText: string;
  parentAnswerText: string;
  /** Already-asked follow-ups in this chain, so we don't repeat */
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
  "questionText": string,      // the follow-up itself, max 600 chars
  "intent": string             // short tag like "deeper dive", "edge case", "tradeoff"
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

export async function generateFollowUpWithGemini(
  input: FollowUpInput,
): Promise<GeminiResult<{ questionText: string; intent: string }>> {
  const { data, model } = await generateJson({
    systemInstruction: FOLLOW_UP_SYSTEM_INSTRUCTION,
    userPrompt: buildFollowUpPrompt(input),
    schema: questionSchema,
    temperature: 0.7,
  });
  return { data, model };
}

export async function evaluateAnswerWithGemini(
  input: AnswerInput,
): Promise<GeminiResult<EvaluationResult>> {
  const { data, model } = await generateJson({
    systemInstruction: EVAL_SYSTEM_INSTRUCTION,
    userPrompt: buildEvaluationPrompt(input),
    schema: evaluationSchema,
    temperature: 0.2,
  });
  return {
    data: { ...data, source: 'gemini' as const },
    model,
  };
}

// Session summary — the narrative half of the end-of-session report.
// The cumulative SCORES are computed deterministically by the service;
// this call only writes the verdict / strengths / improvements on top.

export interface SummaryEntry {
  question: string;
  /** Candidate's transcript, null when the question went unanswered. */
  answer: string | null;
  /** Per-question evaluation score, null when unanswered. */
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

/** Generate the narrative for the end-of-session report. */
export async function generateSessionSummary(
  input: SessionSummaryInput,
): Promise<GeminiResult<SessionSummaryNarrative>> {
  const { data, model } = await generateJson({
    systemInstruction: SUMMARY_SYSTEM_INSTRUCTION,
    userPrompt: buildSummaryPrompt(input),
    schema: summarySchema,
    temperature: 0.4,
  });
  return { data, model };
}
