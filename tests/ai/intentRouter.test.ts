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
    expect(result.require_mcp).toBe(false);
    expect(result.target_mcp_servers).toEqual([]);
    expect(IntentResultSchema.safeParse(result).success).toBe(true);
    expect(completeJson).toHaveBeenCalledTimes(1);
  });

  it('validates and accepts require_mcp and target_mcp_servers in schema', () => {
    const raw = {
      intent: 'query_knowledge',
      confidence: 0.95,
      entities: ['SVFE_SHB.CARDS'],
      language: 'vi',
      needs_clarification: false,
      clarify_question: null,
      speculation_requested: false,
      require_mcp: true,
      target_mcp_servers: ['graphiti-banking'],
    };
    const parsed = IntentResultSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.require_mcp).toBe(true);
      expect(parsed.data.target_mcp_servers).toEqual(['graphiti-banking']);
    }
  });

  it('defaults require_mcp to false and target_mcp_servers to [] when missing', () => {
    const raw = {
      intent: 'query_taskmate',
      confidence: 0.9,
      entities: [],
      language: 'en',
      needs_clarification: false,
      clarify_question: null,
      speculation_requested: false,
    };
    const parsed = IntentResultSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.require_mcp).toBe(false);
      expect(parsed.data.target_mcp_servers).toEqual([]);
    }
  });

  it('injects <enabled_mcp_servers> block into system prompt when mcpCapabilities provided', async () => {
    const completeJson = vi.fn().mockResolvedValue({
      intent: 'query_knowledge',
      confidence: 0.95,
      entities: ['SVFE_SHB'],
      language: 'vi',
      needs_clarification: false,
      clarify_question: null,
      speculation_requested: false,
      require_mcp: true,
      target_mcp_servers: ['graphiti-banking'],
    });

    const mcpCapabilities = [
      {
        id: 'graphiti-banking',
        name: 'Graphiti Banking MCP',
        description: 'SmartVista banking cards and database schemas',
        tools: ['search_nodes', 'search_memory_facts', 'list_advertised_groups'],
      },
    ];

    const result = await routeIntent('Kiểm tra bảng SVFE_SHB trong Graphiti', {
      ...baseArgs,
      completeJson,
      mcpCapabilities,
    });

    expect(result.require_mcp).toBe(true);
    expect(result.target_mcp_servers).toEqual(['graphiti-banking']);

    const callArgs = completeJson.mock.calls[0]?.[0];
    const systemMessage = callArgs?.messages.find((m: any) => m.role === 'system');
    expect(systemMessage?.content).toContain('<enabled_mcp_servers>');
    expect(systemMessage?.content).toContain('graphiti-banking');
    expect(systemMessage?.content).toContain('search_nodes');
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
