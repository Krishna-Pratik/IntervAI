/**
 * Axios client for the backend. Tokens are attached per call via Clerk
 * getToken (never stored here); response types mirror the backend shapes.
 */

import axios, { type AxiosInstance } from 'axios';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  // No default Content-Type: one set here bleeds into the multipart resume
  // upload and stops axios generating the boundary — the server then hangs.
});

export interface ResumeProfile {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  summary?: string | null;
  skills: string[];
  experience: Array<{
    company: string;
    role: string;
    startDate: string;
    endDate?: string | null;
    description: string;
  }>;
  projects: Array<{
    name: string;
    description: string;
    technologies: string[];
    url?: string | null;
  }>;
  education: Array<{
    institution: string;
    degree: string;
    field: string;
    startDate: string;
    endDate?: string | null;
    gpa?: string | null;
  }>;
}

export interface EvaluationResult {
  overallScore: number;
  precisionLevel: number;
  growthPotential: number;
  detailedScores: Record<string, number>;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  followUpQuestion?: string;
  source: 'gemini' | 'openrouter' | 'deterministic';
  notes?: string;
}

export interface InterviewSession {
  sessionId: string;
  targetRole: string;
  difficulty: string;
  // Optional target company — the backend uses it to tailor
  // the question style/values.
  company?: string | null;
  // Planned interview length in minutes, chosen on the setup page.
  // The AI planner derives the question count from it.
  durationMinutes?: number | null;
  // Optional pasted job description — grounds the question planner.
  jobDescription?: string | null;
  // The AI-designed interview flow, created on the first question
  // fetch. Null on a brand-new session (before the planner runs)
  // and on sessions created before this existed.
  questionPlan?: {
    totalQuestions: number;
    topics: string[];
    note?: string;
  } | null;
  status: string;
  createdAt: string;
  // Cumulative scorecard, written server-side when the session is
  // ended. Null while in progress and on sessions ended before this existed.
  summary?: SessionSummary | null;
  endedAt?: string | null;
  // Set when created with a resumeId from the interview setup form — the
  // session is planned from that resume's parsed profile. Null only on
  // legacy rows created before resume anchoring existed.
  resumeId?: string | null;
}

/**
 * Cumulative end-of-session report. The stats mirror the backend's
 * `SessionSummary` — averages are computed deterministically from the
 * per-question evaluations; the narrative (`verdict`/`strengths`/
 * `improvements`) is AI-written, and `source: 'deterministic'` marks
 * the rare case where the narrative fell back to plain text.
 */
export interface SessionSummary {
  overallScore: number;
  precisionAvg: number;
  growthAvg: number;
  answeredCount: number;
  skippedCount: number;
  questionScores: Array<{
    order: number;
    questionText: string;
    score: number | null;
    isFollowUp: boolean;
  }>;
  verdict: string;
  strengths: string[];
  improvements: string[];
  source: 'gemini' | 'openrouter' | 'deterministic';
  generatedAt: string;
}

export interface InterviewQuestion {
  questionId: string;
  questionText: string;
  intent: string;
  order: number;
  source: 'gemini' | 'openrouter' | 'deterministic';
  model?: string;
  /** How many top-level questions the session's plan calls for.
   * Set on generate-next-question responses; null/undefined when the
   * session predates planning. */
  plannedTotal?: number | null;
  /** When set, this question is a follow-up of the given parent
   * question id. Mirrors the backend's `questions.followUpOf`. The
   * live page reads this to show a "follow-up" pill. */
  followUpOf?: string | null;
}

// --- API functions ---

export async function uploadResume(file: File, getToken: () => Promise<string | null>) {
  const token = await getToken();
  const formData = new FormData();
  formData.append('file', file);

  const { data } = await api.post<{
    resumeId: string;
    cloudinaryUrl: string;
    fileName: string;
    profile: ResumeProfile;
    /** True when a byte-identical resume already existed — nothing new
     *  was stored, the server returned the existing row. */
    reused?: boolean;
  }>('/protected/resumes', formData, {
    // Don't set Content-Type manually — axios will auto-generate the
    // `multipart/form-data; boundary=...` header that multer needs.
    // Setting it without a boundary made the server hang trying to
    // parse an unterminated multipart body.
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return data;
}

export async function listResumes(getToken: () => Promise<string | null>) {
  const token = await getToken();
  const { data } = await api.get<{
    resumes: Array<{
      id: string;
      cloudinaryUrl: string;
      /** Original upload name; null for rows stored before the column existed. */
      fileName: string | null;
      uploadedAt: string;
      resumeProfile: ResumeProfile | null;
    }>;
  }>('/protected/resumes', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return data.resumes;
}

export async function createInterviewSession(
  input: {
    targetRole: string;
    difficulty: 'easy' | 'medium' | 'hard';
    company?: string;
    /** Planned interview length in minutes — the AI planner sizes
     * the question flow from it. */
    durationMinutes: number;
    /** Optional pasted job description for role-specific questions. */
    jobDescription?: string;
    /** Required — the interview is planned from this resume's
     * parsed profile. */
    resumeId: string;
  },
  getToken: () => Promise<string | null>,
) {
  const token = await getToken();
  const { data } = await api.post<{ session: InterviewSession }>(
    '/protected/interview/sessions',
    input,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );
  return data.session;
}

export async function generateNextQuestion(
  sessionId: string,
  getToken: () => Promise<string | null>,
) {
  const token = await getToken();
  const { data } = await api.post<{ question: InterviewQuestion }>(
    `/protected/interview/sessions/${sessionId}/questions`,
    {},
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );
  return data.question;
}

/**
 * Lock in a follow-up question for a parent question + its answer.
 * The backend creates a new question row with `followUpOf: parentQuestionId`
 * and returns it. The client calls this immediately after
 * `submitAnswer` when the evaluation carried a `followUpQuestion`.
 * If both AI models fail, the backend returns 502 and the client
 * falls through to a fresh top-level question.
 */
export async function generateFollowUp(
  sessionId: string,
  parentQuestionId: string,
  getToken: () => Promise<string | null>,
) {
  const token = await getToken();
  const { data } = await api.post<{ question: InterviewQuestion }>(
    `/protected/interview/sessions/${sessionId}/follow-up`,
    { parentQuestionId },
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );
  return data.question;
}

export async function submitAnswer(
  sessionId: string,
  input: { questionId: string; transcriptText: string },
  getToken: () => Promise<string | null>,
) {
  const token = await getToken();
  const { data } = await api.post<{
    answerId: string;
    evaluation: EvaluationResult;
    evaluationSource: 'gemini' | 'openrouter' | 'deterministic';
    evaluationModel: string | null;
  }>(`/protected/interview/sessions/${sessionId}/answers`, input, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return data;
}

export async function getSessionDetail(
  sessionId: string,
  getToken: () => Promise<string | null>,
) {
  const token = await getToken();
  const { data } = await api.get<{
    session: InterviewSession & { id: string };
    questions: Array<{
      id: string;
      questionText: string;
      // Why this question was asked: 'behavioral' for the role bank,
      // or 'project' | 'experience' | 'skills' for the resume-tailored
      // bank. The live page reads this to show a "tailored to your
      // resume" affordance.
      intent: string;
      order: number;
      followUpOf: string | null;
      answer: {
        id: string;
        transcriptText: string;
        submittedAt: string;
        evaluation: EvaluationResult | null;
      } | null;
    }>;
  }>(`/protected/interview/sessions/${sessionId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return data;
}

/**
 * Close a session and get its cumulative scorecard. The backend marks
 * it completed, computes the report from the stored evaluations, and
 * asks the AI for the coaching narrative. Idempotent — calling it again
 * returns the stored summary without a fresh AI call.
 */
export async function endInterviewSession(
  sessionId: string,
  getToken: () => Promise<string | null>,
) {
  const token = await getToken();
  const { data } = await api.post<{ summary: SessionSummary }>(
    `/protected/interview/sessions/${sessionId}/end`,
    {},
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );
  return data.summary;
}

// --- Billing ---

export type SubscriptionStatus =
  | 'free'
  | 'trial'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete';

export interface AccessDecision {
  allowed: boolean;
  reason: 'active' | 'trial' | 'free-tier' | 'limit-reached';
  remainingFreeTrials: number;
  subscriptionStatus: SubscriptionStatus;
  currentPeriodEnd: string | null;
}

export interface SubscriptionView {
  id: string;
  razorpaySubscriptionId: string;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  createdAt: string;
}

export async function getAccessDecision(getToken: () => Promise<string | null>) {
  const token = await getToken();
  const { data } = await api.get<AccessDecision>('/protected/billing/access', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return data;
}

export async function getActiveSubscription(getToken: () => Promise<string | null>) {
  const token = await getToken();
  const { data } = await api.get<{
    active: SubscriptionView | null;
    history: SubscriptionView[];
  }>('/protected/billing/subscription', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return data.active;
}

export interface CheckoutConfig {
  /** Razorpay publishable key id (safe for the browser). */
  keyId: string;
  currency: string;
  /** Plan prices in paise, matching the plan cards on the billing page. */
  amounts: Record<'pro_monthly' | 'pro_yearly', number>;
  paymentsEnabled: boolean;
}

export async function getCheckoutConfig(getToken: () => Promise<string | null>) {
  const token = await getToken();
  const { data } = await api.get<CheckoutConfig>('/protected/billing/checkout-config', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return data;
}

// --- Analytics ---

export interface OverviewMetrics {
  totalSessions: number;
  completedSessions: number;
  totalQuestions: number;
  totalEvaluations: number;
  avgOverallScore: number | null;
  avgPrecision: number | null;
  avgGrowth: number | null;
  bestRole: { role: string; avgScore: number } | null;
  currentStreakDays: number;
  daysActive30: number;
}

export interface ScoreTrendPoint {
  date: string;
  avgScore: number | null;
  evalCount: number;
}

export interface RolePerformance {
  role: string;
  sessionCount: number;
  avgScore: number | null;
}

export interface DifficultyPerformance {
  difficulty: 'easy' | 'medium' | 'hard';
  sessionCount: number;
  avgScore: number | null;
}

export interface SourceMix {
  source: 'gemini' | 'openrouter' | 'deterministic';
  count: number;
  pct: number;
}

export interface FeedbackTheme {
  theme: string;
  occurrences: number;
}

export async function getAnalyticsOverview(getToken: () => Promise<string | null>) {
  const token = await getToken();
  const { data } = await api.get<OverviewMetrics>('/protected/analytics/overview', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return data;
}

export async function getAnalyticsTrend(days: number, getToken: () => Promise<string | null>) {
  const token = await getToken();
  const { data } = await api.get<{ days: number; trend: ScoreTrendPoint[] }>(
    `/protected/analytics/trend?days=${days}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );
  return data.trend;
}

export async function getAnalyticsByRole(getToken: () => Promise<string | null>) {
  const token = await getToken();
  const { data } = await api.get<{ rows: RolePerformance[] }>(
    '/protected/analytics/by-role',
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );
  return data.rows;
}

export async function getAnalyticsByDifficulty(getToken: () => Promise<string | null>) {
  const token = await getToken();
  const { data } = await api.get<{ rows: DifficultyPerformance[] }>(
    '/protected/analytics/by-difficulty',
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );
  return data.rows;
}

export async function getAnalyticsSourceMix(getToken: () => Promise<string | null>) {
  const token = await getToken();
  const { data } = await api.get<{ rows: SourceMix[] }>(
    '/protected/analytics/source-mix',
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );
  return data.rows;
}

export async function getAnalyticsFeedbackThemes(
  kind: 'strengths' | 'weaknesses',
  getToken: () => Promise<string | null>,
) {
  const token = await getToken();
  const { data } = await api.get<{ kind: string; rows: FeedbackTheme[] }>(
    `/protected/analytics/feedback-themes?kind=${kind}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );
  return data.rows;
}
