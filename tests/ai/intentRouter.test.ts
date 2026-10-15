import { describe, it, expect, vi } from 'vitest';
import {
  routeIntent,
  IntentResultSchema,
  INTENT_TAXONOMY,
  IntentRouterUnavailableError,
} from '../../src/services/ai/intentRouter';

const baseArgs = {
  completeJsonArgs: {
    endpoint: 'https://router.local',
    apiKey: 'sk-test',
    model: 'test-model',
  },
  signal: new AbortController().signal,
};

describe('intentRouter (LLM-reasoned, no keyword/verb lists)', () => {
  it('routes a status/read question to query_taskmate (the previously-missing read route)', async () => {
    const completeJson = vi.fn().mockResolvedValue({
      intent: 'query_taskmate',
      confidence: 0.9,
      entities: ['click to pay'],
      language: 'vi',
      needs_clarification: false,
      clarify_question: null,
      speculation_requested: false,
    });

    const result = await routeIntent('tình hình click to pay như nào rồi', {
      ...baseArgs,
      completeJson,
    });

    expect(result.intent).toBe('query_taskmate');
    expect(IntentResultSchema.safeParse(result).success).toBe(true);
    expect(completeJson).toHaveBeenCalledTimes(1);
  });

  it('normalizes a clarify intent to needs_clarification=true even if model contradicts itself', async () => {
    const completeJson = vi.fn().mockResolvedValue({
      intent: 'clarify',
      confidence: 0.2,
      entities: [],
      language: 'vi',
      needs_clarification: false, // contradicts intent
      clarify_question: 'Bạn muốn hỏi về việc gì?',
      speculation_requested: false,
    });

    const result = await routeIntent('cái đó', { ...baseArgs, completeJson });
    expect(result.intent).toBe('clarify');
    expect(result.needs_clarification).toBe(true);
    expect(result.clarify_question).toBe('Bạn muốn hỏi về việc gì?');
  });

  it('forces intent=clarify when needs_clarification=true', async () => {
    const completeJson = vi.fn().mockResolvedValue({
      intent: 'query_knowledge',
      confidence: 0.3,
      entities: [],
      language: 'en',
      needs_clarification: true,
      clarify_question: 'Which process do you mean?',
      speculation_requested: false,
    });

    const result = await routeIntent('how does it work', { ...baseArgs, completeJson });
    expect(result.intent).toBe('clarify');
    expect(result.needs_clarification).toBe(true);
  });

  it('retries exactly once on off-schema output, then succeeds', async () => {
    const completeJson = vi
      .fn()
      .mockResolvedValueOnce({ intent: 'not_a_real_intent' })
      .mockResolvedValueOnce({
        intent: 'operate_taskmate',
        confidence: 0.8,
        entities: ['task'],
        language: 'vi',
        needs_clarification: false,
        clarify_question: null,
        speculation_requested: false,
      });

    const result = await routeIntent('tạo task mới', { ...baseArgs, completeJson });
    expect(result.intent).toBe('operate_taskmate');
    expect(completeJson).toHaveBeenCalledTimes(2);
  });

  it('throws IntentRouterUnavailableError when the LLM endpoint is not configured (feature UNAVAILABLE, no keyword fallback)', async () => {
    await expect(
      routeIntent('bất kỳ câu nào', { signal: new AbortController().signal })
    ).rejects.toBeInstanceOf(IntentRouterUnavailableError);
  });

  it('throws IntentRouterUnavailableError when output stays off-schema after the retry', async () => {
    const completeJson = vi.fn().mockResolvedValue({ garbage: true });
    await expect(
      routeIntent('x', { ...baseArgs, completeJson })
    ).rejects.toBeInstanceOf(IntentRouterUnavailableError);
    expect(completeJson).toHaveBeenCalledTimes(2);
  });

  it('exposes the fixed taxonomy and exports NO verb/keyword lists', async () => {
    const mod: Record<string, unknown> = await import(
      '../../src/services/ai/intentRouter'
    );
    expect(mod.DEFAULT_OPERATIONAL_VERBS).toBeUndefined();
    expect(mod.DEFAULT_KNOWLEDGE_HINTS).toBeUndefined();
    expect(mod.matchTerms).toBeUndefined();
    expect([...INTENT_TAXONOMY]).toEqual([
      'operate_taskmate',
      'query_taskmate',
      'query_knowledge',
      'mixed',
      'clarify',
    ]);
  });
});
