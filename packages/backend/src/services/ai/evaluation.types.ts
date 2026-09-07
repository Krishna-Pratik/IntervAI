/**
 * Shared contract: every AI layer (Gemini → OpenRouter → deterministic)
 * produces this shape, and the interview module is blind to which did.
 * Mirrors the `evaluations` table columns + raw_feedback JSONB.
 */

export interface EvaluationResult {
  /** Overall score 1–10 (deterministic fallback enforces the clamp) */
  overallScore: number;
  /** Confidence in the score, 1–10 */
  precisionLevel: number;
  /** Room to improve, 1–10 */
  growthPotential: number;
  /** Per-dimension scores, e.g. { clarity: 7, depth: 5 } */
  detailedScores: Record<string, number>;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  followUpQuestion?: string;
  /** Which layer produced it (the UI flags the deterministic case) */
  source: 'gemini' | 'openrouter' | 'deterministic';
  notes?: string;
}

/** Plain interface (no zod) so text and voice flows share it. */
export interface AnswerInput {
  questionText: string;
  transcriptText: string;
  targetRole: string;
  difficulty: 'easy' | 'medium' | 'hard';
  /** Optional context from the resume to make evaluation role-aware */
  resumeProfile?: unknown;
}
