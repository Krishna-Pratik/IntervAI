/**
 * Last line of defense: if every AI model fails, still return a
 * structured EvaluationResult so the session can continue. Heuristic
 * only — length-vs-baseline and vocabulary diversity, clamped to 1–10.
 * The `source: 'deterministic'` field lets the UI flag the downgrade.
 */

import type { AnswerInput, EvaluationResult } from './evaluation.types.js';

// A small, conservative stop-word set — noise filter, not full NLP.
const STOP_WORDS = new Set<string>([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'has', 'have', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that',
  'the', 'this', 'to', 'was', 'were', 'will', 'with', 'i', 'you',
  'we', 'they', 'he', 'she', 'my', 'your', 'our', 'their', 'me',
  'him', 'her', 'us', 'them', 'so', 'if', 'but', 'not', 'no',
  'do', 'does', 'did', 'can', 'could', 'should', 'would', 'about',
  'than', 'then', 'just', 'like', 'also', 'into', 'over', 'out',
  'up', 'down', 'some', 'any', 'all', 'more', 'less', 'very',
  'really', 'kind', 'sort', 'um', 'uh', 'er', 'ah', 'okay',
  'ok', 'yeah', 'yes', 'no', 'maybe', 'actually', 'basically',
]);

// Baselines sit slightly above a rushed candidate's output so length
// alone doesn't yield a high score.
const EXPECTED_WORDS_BY_DIFFICULTY: Record<AnswerInput['difficulty'], number> = {
  easy: 60,
  medium: 90,
  hard: 130,
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

function dropStopWords(tokens: string[]): string[] {
  return tokens.filter((t) => !STOP_WORDS.has(t));
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Length vs the difficulty baseline, 0–1 (at/above baseline → 1, cap 1.5x). */
function lengthScore(words: number, difficulty: AnswerInput['difficulty']): number {
  const baseline = EXPECTED_WORDS_BY_DIFFICULTY[difficulty];
  if (baseline === 0) return 0;
  const ratio = words / baseline;
  return clamp(ratio, 0, 1.5) / 1.5;
}

/** uniqueTerms/totalTokens, 0–1; ~0.4 is typical for natural speech. */
function vocabularyScore(uniqueTerms: number, totalTokens: number): number {
  if (totalTokens === 0) return 0;
  const ratio = uniqueTerms / totalTokens;
  return clamp((ratio - 0.2) / 0.4, 0, 1);
}

/** Always returns a valid EvaluationResult. Never throws. */
export function evaluateAnswerDeterministically(input: AnswerInput): EvaluationResult {
  const tokens = tokenize(input.transcriptText);
  const totalTokens = tokens.length;
  const meaningfulTokens = dropStopWords(tokens);
  const uniqueTerms = new Set(meaningfulTokens).size;

  const nodesAnalyzed = uniqueTerms;

  const length = lengthScore(totalTokens, input.difficulty);
  const vocab = vocabularyScore(uniqueTerms, totalTokens);

  // Length is the strongest "did they answer" signal; vocabulary is weak.
  const blended = length * 0.7 + vocab * 0.3;
  const overallScore = clamp(Math.round(blended * 10), 1, 10);

  // More tokens → more confidence in the score.
  const precisionLevel = clamp(Math.round(Math.log2(totalTokens + 1) * 1.5), 1, 10);
  const growthPotential = clamp(11 - overallScore, 1, 10);

  // Describe the heuristics that fired — the UI gets meaningful text
  // without claiming real qualitative feedback.
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const suggestions: string[] = [];

  if (length >= 0.8) {
    strengths.push('Answered at appropriate length for the difficulty level.');
  } else if (length < 0.4) {
    weaknesses.push('Response was shorter than expected for this difficulty.');
    suggestions.push('Try to elaborate with concrete examples or reasoning.');
  }

  if (vocab >= 0.7) {
    strengths.push('Used varied, specific vocabulary.');
  } else if (totalTokens > 0 && vocab < 0.3) {
    weaknesses.push('Vocabulary was repetitive — consider more specific terms.');
  }

  if (totalTokens < 10) {
    weaknesses.push('Very short response — almost no content to evaluate.');
    suggestions.push('Provide a more substantive answer to get useful feedback.');
  }

  if (strengths.length === 0) {
    strengths.push('Response was received.');
  }
  if (weaknesses.length === 0) {
    weaknesses.push('No specific weaknesses detected by the heuristic.');
  }
  if (suggestions.length === 0) {
    suggestions.push('Consider adding concrete examples to strengthen your answer.');
  }

  return {
    overallScore,
    precisionLevel,
    growthPotential,
    detailedScores: {
      length: clamp(Math.round(length * 10), 1, 10),
      vocabulary: clamp(Math.round(vocab * 10), 1, 10),
    },
    strengths,
    weaknesses,
    suggestions,
    notes:
      'This evaluation was produced by a deterministic heuristic because the AI service was unavailable. ' +
      `Analyzed ${nodesAnalyzed} unique terms across ${totalTokens} total words.`,
    source: 'deterministic',
  };
}
