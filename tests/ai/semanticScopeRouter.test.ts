import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  routeScope,
  type SetCatalogEntry,
} from '../../src/services/ai/semanticScopeRouter';
import * as nineRouter from '../../src/services/ai/nineRouterClient';

describe('semanticScopeRouter', () => {
  const sampleCatalog: SetCatalogEntry[] = [
    {
      setId: 'uuid-base-card',
      canonicalName: 'Card System Base',
      domain: 'Card System',
      environment: null,
      version: null,
      aliases: ['thẻ chung', 'hệ thống thẻ'],
      relation: null,
      isBase: true,
    },
    {
      setId: 'uuid-prod-card',
      canonicalName: 'Card System PROD',
      domain: 'Card System',
      environment: 'PROD',
      version: null,
      aliases: ['môi trường thật', 'live', 'thẻ prod'],
      relation: 'EXTENDS',
      isBase: false,
    },
    {
      setId: 'uuid-sit-card',
      canonicalName: 'Card System SIT',
      domain: 'Card System',
      environment: 'SIT',
      version: null,
      aliases: ['thử nghiệm', 'sit'],
      relation: null,
      isBase: false,
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    nineRouter.clearCapabilityProbeCache();
  });

  it('(a) LLM-available happy path resolves "môi trường thật" -> PROD env + baseline + scoped diff', async () => {
    vi.spyOn(nineRouter, 'probeStructuredOutputCapability').mockResolvedValue({
      ok: true,
      strictJsonSchema: true,
    });

    const mockCompleteJson = vi.fn().mockImplementation(async (req) => {
      // Assert NO setId is sent to model in catalog payload
      const body = JSON.parse(req.messages[1].content);
      for (const item of body.catalog) {
        expect(item).not.toHaveProperty('setId');
      }

      return {
        domain: 'Card System',
        environment: 'PROD',
        version: null,
        comparisonMode: 'baseline_vs_scope',
        subqueries: ['luồng xử lý thẻ môi trường thật'],
      };
    });

    const controller = new AbortController();
    const result = await routeScope(
      { query: 'quy trình xử lý tại môi trường thật ra sao' },
      {
        catalog: sampleCatalog,
        completeJson: mockCompleteJson as any,
        completeJsonArgs: {
          endpoint: 'http://localhost:20128',
          apiKey: 'key',
          model: 'gpt-4o',
        },
        signal: controller.signal,
      }
    );

    expect(result.routerSource).toBe('llm');
    expect(result.comparisonMode).toBe('baseline_vs_scope');

    const scoped = result.setTierAssignments.find(
      (a) => a.setId === 'uuid-prod-card'
    );
    expect(scoped).toEqual({
      setId: 'uuid-prod-card',
      tier: 'REQUIRED',
      roleGroup: 'scope_diff',
    });

    const baseline = result.setTierAssignments.find(
      (a) => a.setId === 'uuid-base-card'
    );
    expect(baseline).toEqual({
      setId: 'uuid-base-card',
      tier: 'REQUIRED',
      roleGroup: 'baseline',
    });
  });

  it('(b) LLM-unavailable fallback uses alias match deterministically', async () => {
    const controller = new AbortController();
    // No completeJson provided -> triggers alias fallback
    const result = await routeScope(
      { query: 'xem thông tin môi trường thật' },
      {
        catalog: sampleCatalog,
        signal: controller.signal,
      }
    );

    expect(result.routerSource).toBe('alias');
    expect(result.comparisonMode).toBe('baseline_vs_scope');

    const scoped = result.setTierAssignments.find(
      (a) => a.setId === 'uuid-prod-card'
    );
    expect(scoped).toBeDefined();
    expect(scoped?.roleGroup).toBe('scope_diff');

    const baseline = result.setTierAssignments.find(
      (a) => a.setId === 'uuid-base-card'
    );
    expect(baseline).toBeDefined();
    expect(baseline?.roleGroup).toBe('baseline');
  });

  it('(c) general query without scope resolves isBase baseline sets', async () => {
    const controller = new AbortController();
    const result = await routeScope(
      { query: 'giới thiệu kiến trúc tổng quan hệ thống' },
      {
        catalog: sampleCatalog,
        signal: controller.signal,
      }
    );

    expect(result.routerSource).toBe('base_default');
    expect(result.comparisonMode).toBe('single');
    expect(result.setTierAssignments).toEqual([
      {
        setId: 'uuid-base-card',
        tier: 'REQUIRED',
        roleGroup: 'baseline',
      },
    ]);
  });

  it('(d) LLM response containing a setId field is REJECTED (model must not invent setId)', async () => {
    vi.spyOn(nineRouter, 'probeStructuredOutputCapability').mockResolvedValue({
      ok: true,
      strictJsonSchema: true,
    });

    // Model attempts to invent setId
    const mockCompleteJson = vi.fn().mockResolvedValue({
      domain: 'Card System',
      environment: 'PROD',
      version: null,
      comparisonMode: 'single',
      subqueries: [],
      setId: 'invented-malicious-uuid',
    });

    const controller = new AbortController();
    const result = await routeScope(
      { query: 'tra cứu thông tin môi trường thật' },
      {
        catalog: sampleCatalog,
        completeJson: mockCompleteJson as any,
        completeJsonArgs: {
          endpoint: 'http://localhost:20128',
          model: 'gpt-4o',
        },
        signal: controller.signal,
      }
    );

    // Rejected LLM output falls back to deterministic alias router
    expect(result.routerSource).toBe('alias');
    expect(result.setTierAssignments.some((a) => a.setId === 'invented-malicious-uuid')).toBe(false);
  });

  it('(e) catalog with no isBase and general query returns empty but reports routerSource: "alias" with comparisonMode: null', async () => {
    const noBaseCatalog: SetCatalogEntry[] = [
      {
        setId: 'uuid-custom',
        canonicalName: 'Draft Set',
        domain: 'Custom',
        environment: null,
        version: null,
        aliases: ['bản nháp'],
        relation: null,
        isBase: false,
      },
    ];

    const controller = new AbortController();
    const result = await routeScope(
      { query: 'câu hỏi hoàn toàn không liên quan' },
      {
        catalog: noBaseCatalog,
        signal: controller.signal,
      }
    );

    expect(result).toEqual({
      setTierAssignments: [],
      comparisonMode: null,
      routerSource: 'alias',
    });
  });
});
