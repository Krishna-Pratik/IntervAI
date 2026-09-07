/**
 * Pure-orchestrator unit tests — stub deps, no HTTP. Covers the
 * Gemini → OpenRouter → deterministic ladder, timeouts, and that
 * question-gen throws where no deterministic layer exists.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  orchestrateEvaluation,
  orchestrateQuestion,
  type OrchestratorDeps,
} from '../../src/services/ai/fallback.js';
import { evaluateAnswerDeterministically } from '../../src/services/ai/deterministic-evaluator.js';
import type { AnswerInput } from '../../src/services/ai/evaluation.types.js';
import type { ResumeProfile } from '../../src/db/schema.js';

const baseInput: AnswerInput = {
  questionText: 'How do you scale a web service to 10M users?',
  transcriptText: 'Use load balancers, horizontal scaling, and database sharding.',
  targetRole: 'Senior Software Engineer',
  difficulty: 'medium',
};

const baseQInput = {
  targetRole: 'Senior Software Engineer',
  difficulty: 'medium' as const,
};

// --- Helper to build a deps object with stubbed AI layers ---

interface DepOverrides {
  geminiEval?: OrchestratorDeps['geminiEval'];
  openRouterEval?: OrchestratorDeps['openRouterEval'];
  geminiGenQ?: OrchestratorDeps['geminiGenQ'];
  openRouterGenQ?: OrchestratorDeps['openRouterGenQ'];
  /** Spy on which AI layer was called (in order). */
  calls?: { layer: string; ok: boolean }[];
}

function makeDeps(overrides: DepOverrides = {}): {
  deps: OrchestratorDeps;
  calls: { layer: string; ok: boolean }[];
} {
  const calls = overrides.calls ?? [];

  const deps: OrchestratorDeps = {
    geminiEval:
      overrides.geminiEval ??
      (async () => {
        calls.push({ layer: 'gemini-eval', ok: true });
        return {
          data: { overallScore: 8, source: 'gemini' } as never,
          model: 'gemini-2.5-flash',
        };
      }),
    openRouterEval:
      overrides.openRouterEval ??
      (async () => {
        calls.push({ layer: 'openrouter-eval', ok: true });
        return {
          data: { overallScore: 7, source: 'openrouter' } as never,
          model: 'meta-llama/llama-3.1-8b-instruct:free',
        };
      }),
    deterministicEval: (input) => {
      calls.push({ layer: 'deterministic', ok: true });
      return evaluateAnswerDeterministically(input);
    },
    geminiGenQ:
      overrides.geminiGenQ ??
      (async () => {
        calls.push({ layer: 'gemini-q', ok: true });
        return {
          data: { questionText: 'Explain CAP theorem.', intent: 'system design' },
          model: 'gemini-2.5-flash',
        };
      }),
    openRouterGenQ:
      overrides.openRouterGenQ ??
      (async () => {
        calls.push({ layer: 'openrouter-q', ok: true });
        return {
          data: { questionText: 'Describe eventual consistency.', intent: 'distributed systems' },
          model: 'meta-llama/llama-3.1-8b-instruct:free',
        };
      }),
    perModelTimeoutMs: 100, // fast for tests
    log: () => {}, // silence test output
  };

  return { deps, calls };
}

describe('orchestrateEvaluation', () => {
  it('returns gemini when gemini succeeds (no fallback layers touched)', async () => {
    const { deps, calls } = makeDeps();
    const result = await orchestrateEvaluation(baseInput, deps);

    assert.equal(result.source, 'gemini');
    assert.equal(result.evaluation.overallScore, 8);
    assert.equal(result.fellThroughAi, false);
    assert.deepEqual(
      calls.map((c) => c.layer),
      ['gemini-eval'],
    );
  });

  it('falls through to openrouter when gemini fails', async () => {
    const { deps, calls } = makeDeps({
      geminiEval: async () => {
        calls.push({ layer: 'gemini-eval', ok: false });
        throw new Error('Gemini 503');
      },
    });
    const result = await orchestrateEvaluation(baseInput, deps);

    assert.equal(result.source, 'openrouter');
    assert.equal(result.evaluation.overallScore, 7);
    assert.equal(result.fellThroughAi, false);
    assert.deepEqual(
      calls.map((c) => c.layer),
      ['gemini-eval', 'openrouter-eval'],
    );
  });

  it('falls through to deterministic when both AI layers fail', async () => {
    const { deps, calls } = makeDeps({
      geminiEval: async () => {
        calls.push({ layer: 'gemini-eval', ok: false });
        throw new Error('Gemini timeout');
      },
      openRouterEval: async () => {
        calls.push({ layer: 'openrouter-eval', ok: false });
        throw new Error('OpenRouter 429');
      },
    });
    const result = await orchestrateEvaluation(baseInput, deps);

    assert.equal(result.source, 'deterministic');
    assert.ok(result.evaluation.overallScore >= 1 && result.evaluation.overallScore <= 10);
    assert.equal(result.fellThroughAi, true);
    assert.equal(result.model, null);
    assert.deepEqual(
      calls.map((c) => c.layer),
      ['gemini-eval', 'openrouter-eval', 'deterministic'],
    );
  });

  it('falls through when the per-model timeout fires', async () => {
    const { deps, calls } = makeDeps({
      geminiEval: async () => {
        calls.push({ layer: 'gemini-eval', ok: false });
        // Hang longer than the 100ms test timeout
        await new Promise((r) => setTimeout(r, 500));
        return { data: { overallScore: 1, source: 'gemini' } as never, model: 'x' };
      },
    });
    const result = await orchestrateEvaluation(baseInput, deps);
    assert.equal(result.source, 'openrouter');
    assert.ok(calls.some((c) => c.layer === 'openrouter-eval'));
  });

  it('never throws — even if every layer were to throw (deterministic is the safety net)', async () => {
    const deps: OrchestratorDeps = {
      geminiEval: async () => {
        throw new Error('gemini kaboom');
      },
      openRouterEval: async () => {
        throw new Error('openrouter kaboom');
      },
      deterministicEval: (input) => evaluateAnswerDeterministically(input),
      geminiGenQ: async () => {
        throw new Error('unused');
      },
      openRouterGenQ: async () => {
        throw new Error('unused');
      },
      perModelTimeoutMs: 100,
      log: () => {},
    };
    const result = await orchestrateEvaluation(baseInput, deps);
    assert.equal(result.source, 'deterministic');
    assert.equal(result.fellThroughAi, true);
  });
});

describe('orchestrateQuestion', () => {
  it('returns gemini when gemini succeeds', async () => {
    const { deps, calls } = makeDeps();
    const r = await orchestrateQuestion(baseQInput, deps);
    assert.equal(r.source, 'gemini');
    assert.deepEqual(
      calls.map((c) => c.layer),
      ['gemini-q'],
    );
  });

  it('falls through to openrouter when gemini fails', async () => {
    const { deps, calls } = makeDeps({
      geminiGenQ: async () => {
        calls.push({ layer: 'gemini-q', ok: false });
        throw new Error('gemini down');
      },
    });
    const r = await orchestrateQuestion(baseQInput, deps);
    assert.equal(r.source, 'openrouter');
    assert.deepEqual(
      calls.map((c) => c.layer),
      ['gemini-q', 'openrouter-q'],
    );
  });

  it('throws when both AI layers fail (no deterministic for question-gen)', async () => {
    const { deps } = makeDeps({
      geminiGenQ: async () => {
        throw new Error('gemini down');
      },
      openRouterGenQ: async () => {
        throw new Error('openrouter down');
      },
    });

    await assert.rejects(
      () => orchestrateQuestion(baseQInput, deps),
      /All AI models failed/,
    );
  });
});

// keep the unused import warning quiet
void (null as unknown as ResumeProfile);
