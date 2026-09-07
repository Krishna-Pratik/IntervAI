/** Deterministic-evaluator unit tests (node:test via tsx — no framework). */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAnswerDeterministically } from '../../src/services/ai/deterministic-evaluator.js';
import type { AnswerInput } from '../../src/services/ai/evaluation.types.js';

const baseInput: AnswerInput = {
  questionText: 'Tell me about a time you debugged a hard production issue.',
  transcriptText: '',
  targetRole: 'Senior Software Engineer',
  difficulty: 'medium',
};

describe('deterministic-evaluator', () => {
  it('always returns a valid EvaluationResult even for empty input', () => {
    const result = evaluateAnswerDeterministically({
      ...baseInput,
      transcriptText: '',
    });

    assert.equal(result.source, 'deterministic');
    assert.ok(result.overallScore >= 1 && result.overallScore <= 10);
    assert.ok(result.precisionLevel >= 1 && result.precisionLevel <= 10);
    assert.ok(result.growthPotential >= 1 && result.growthPotential <= 10);
    assert.ok(Array.isArray(result.strengths));
    assert.ok(Array.isArray(result.weaknesses));
    assert.ok(Array.isArray(result.suggestions));
    assert.ok(result.notes);
    assert.ok(result.notes.includes('deterministic heuristic'));
  });

  it('gives a low score for very short answers', () => {
    const short = evaluateAnswerDeterministically({
      ...baseInput,
      transcriptText: 'I fixed a bug once.',
    });
    assert.ok(short.overallScore <= 4, `expected <= 4 for short, got ${short.overallScore}`);
  });

  it('gives a higher score for substantive, varied answers', () => {
    const long = evaluateAnswerDeterministically({
      ...baseInput,
      transcriptText: Array.from({ length: 120 })
        .map(
          (_, i) =>
            `token${i} system design scalability tradeoffs consistency partition replication`,
        )
        .join(' '),
    });
    assert.ok(long.overallScore >= 6, `expected >= 6 for long varied, got ${long.overallScore}`);
  });

  it('clamps the score into the 1–10 range even for adversarial inputs', () => {
    const huge = evaluateAnswerDeterministically({
      ...baseInput,
      transcriptText: 'word '.repeat(10000).trim(),
    });
    assert.ok(huge.overallScore >= 1 && huge.overallScore <= 10);

    const tiny = evaluateAnswerDeterministically({
      ...baseInput,
      transcriptText: 'a',
    });
    assert.ok(tiny.overallScore >= 1 && tiny.overallScore <= 10);
  });

  it('precisionLevel grows with response length', () => {
    const short = evaluateAnswerDeterministically({
      ...baseInput,
      transcriptText: 'short answer',
    });
    const long = evaluateAnswerDeterministically({
      ...baseInput,
      transcriptText: Array.from({ length: 200 }, (_, i) => `word${i}`).join(' '),
    });
    assert.ok(
      long.precisionLevel > short.precisionLevel,
      `expected longer answer to have higher precision (short=${short.precisionLevel}, long=${long.precisionLevel})`,
    );
  });

  it('growthPotential is roughly inverse of overallScore', () => {
    const good = evaluateAnswerDeterministically({
      ...baseInput,
      transcriptText: Array.from({ length: 200 }, (_, i) => `concept${i} explanation detail`).join(' '),
    });
    const poor = evaluateAnswerDeterministically({
      ...baseInput,
      transcriptText: 'no',
    });
    assert.ok(
      good.growthPotential <= poor.growthPotential,
      `expected good answer to have lower growth potential (good=${good.growthPotential}, poor=${poor.growthPotential})`,
    );
  });
});
