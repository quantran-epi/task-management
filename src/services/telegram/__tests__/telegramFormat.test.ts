import { describe, it, expect } from 'vitest';
import { formatGroundedAnswerForTelegram } from '../telegramHeadlessWorker';
import type { ChatMessageGrounding } from '../../ai/groundedAnswerSchemas';

describe('formatGroundedAnswerForTelegram', () => {
  it('renders claims instead of conclusion when claims exist', () => {
    const grounding: ChatMessageGrounding = {
      schemaVersion: 1,
      authority: 'server',
      outcome: 'READY',
      answer: {
        schemaVersion: 2,
        language: 'vi',
        conclusion: 'Ngày phát hành thẻ được lưu tại cột ISS_DATE của bảng MAIN1.ISS_CARD_INSTANCE và REG_DATE của bảng MAIN1.ISS_CARD.',
        confidence: 'high',
        confidenceReason: 'Bằng chứng trực tiếp từ schema CSDL',
        hypotheses: [],
        unsupportedParts: [],
        claims: [
          {
            id: 'C1',
            text: 'Ngày phát hành thẻ được lưu tại cột ISS_DATE của bảng MAIN1.ISS_CARD_INSTANCE',
            citationIds: ['M1'],
            classification: 'DIRECT',
            pathId: null,
          },
          {
            id: 'C2',
            text: 'Bảng MAIN1.ISS_CARD lưu ngày đăng ký tại cột REG_DATE',
            citationIds: ['M2'],
            classification: 'DIRECT',
            pathId: null,
          },
        ],
      },
      citations: [
        {
          citationId: 'M1',
          documentId: 'doc-1',
          documentTitle: 'MAIN1.ISS_CARD_INSTANCE',
          sectionAnchor: 'ISS_DATE',
          lineStart: 1,
          lineEnd: 1,
          authority: 'server',
          evidenceClass: 'OBSERVED',
          snapshotId: 'gsnap-1',
          publishedContentHash: 'hash-1',
          citedExcerpt: 'ISS_DATE',
        },
      ],
      paths: [],
      conflicts: [],
      scope: {
        setIds: [],
        routedScope: {
          domain: null,
          environment: null,
          version: null,
          comparisonMode: null,
        },
      },
      modalityDiagnostics: {
        fulltext: { status: 'ok', latencyMs: 0, itemCount: 0 },
        vector: { status: 'ok', latencyMs: 0, itemCount: 0 },
        graph: { status: 'ok', latencyMs: 0, itemCount: 0 },
      },
      coverageWarnings: [],
      fallbackReason: 'NONE',
      routerVersion: 'router-v1',
      promptVersion: 'grounded-v1',
      modelId: 'test-model',
      createdAt: new Date().toISOString(),
    };

    const formatted = formatGroundedAnswerForTelegram(grounding);
    // Structural parity with GroundedAnswerCard: claims replace conclusion (no duplicate prose)
    expect(formatted).not.toContain(grounding.answer!.conclusion);
    expect(formatted).toContain('- Ngày phát hành thẻ được lưu tại cột ISS_DATE');
    expect(formatted).toContain('- Bảng MAIN1.ISS_CARD lưu ngày đăng ký tại cột REG_DATE');
    // Citation header exists
    expect(formatted).toContain('🔌 **Dữ liệu thực tế từ MCP:** MAIN1.ISS_CARD_INSTANCE');
  });

  it('renders HAR tele_duplicate payload without repeating the conclusion', () => {
    // Exact synthesis output from docs/tauri.localhost_tele_duplicate.har entry 15.
    const grounding: ChatMessageGrounding = {
      schemaVersion: 1,
      authority: 'server',
      outcome: 'READY',
      answer: {
        schemaVersion: 2,
        language: 'vi',
        conclusion:
          'Ngày phát hành thẻ lưu ở cột `ISS_DATE` (kiểu `DATE`), bảng `SHB.MAIN1.ISS_CARD_INSTANCE` [M2]. Ngày phát hành lại lưu ở `REISSUE_DATE` cùng bảng `SHB.MAIN1.ISS_CARD_INSTANCE` [M2].',
        confidence: 'high',
        confidenceReason:
          'Thông tin cột và bảng lưu ngày phát hành thẻ được nêu chính xác trong catalog database SmartVista BO.',
        hypotheses: [],
        unsupportedParts: [],
        claims: [
          {
            id: 'C1',
            text: 'Ngày phát hành thẻ (Card instance issuing date) lưu tại cột ISS_DATE kiểu DATE trong bảng SHB.MAIN1.ISS_CARD_INSTANCE.',
            classification: 'DIRECT',
            citationIds: ['M2'],
            pathId: null,
          },
          {
            id: 'C2',
            text: "Ngày phát hành lại thẻ (Date of card's instance reissuing) lưu tại cột REISSUE_DATE kiểu DATE trong bảng SHB.MAIN1.ISS_CARD_INSTANCE.",
            classification: 'DIRECT',
            citationIds: ['M2'],
            pathId: null,
          },
        ],
      },
      citations: [
        {
          citationId: 'M1',
          documentId: 'mcp-list-groups',
          documentTitle: '[MCP] SmartVista FE & BO Database MCP - list_advertised_groups',
          sectionAnchor: '{}',
          lineStart: 1,
          lineEnd: 1,
          authority: 'server',
          evidenceClass: 'OBSERVED',
          snapshotId: 'mcp_live',
          publishedContentHash: null,
          citedExcerpt: 'catalog-prod-20260802T070246Z',
        },
        {
          citationId: 'M2',
          documentId: 'mcp-search-nodes',
          documentTitle: '[MCP] SmartVista FE & BO Database MCP - search_nodes',
          sectionAnchor: '{}',
          lineStart: 1,
          lineEnd: 1,
          authority: 'server',
          evidenceClass: 'OBSERVED',
          snapshotId: 'mcp_live',
          publishedContentHash: null,
          citedExcerpt: 'SHB.MAIN1.ISS_CARD_INSTANCE.ISS_DATE',
        },
      ],
      paths: [],
      conflicts: [],
      scope: {
        setIds: [],
        routedScope: {
          domain: null,
          environment: null,
          version: null,
          comparisonMode: null,
        },
      },
      modalityDiagnostics: {
        fulltext: { status: 'ok', latencyMs: 0, itemCount: 0 },
        vector: { status: 'ok', latencyMs: 0, itemCount: 0 },
        graph: { status: 'ok', latencyMs: 2, itemCount: 10 },
      },
      coverageWarnings: [],
      fallbackReason: 'NONE',
      routerVersion: 'router-v1',
      promptVersion: 'grounded-v1',
      modelId: 'gemini-3.8-flash-n',
      createdAt: new Date().toISOString(),
    };

    const formatted = formatGroundedAnswerForTelegram(grounding);
    expect(formatted).toContain('- Ngày phát hành thẻ (Card instance issuing date)');
    // Conclusion must not be printed when claims are present (source of HAR duplication).
    expect(formatted).not.toContain('Ngày phát hành thẻ lưu ở cột `ISS_DATE`');
    // Each fact appears exactly once.
    expect(formatted.match(/ISS_DATE/g)).toHaveLength(1);
    expect(formatted.match(/REISSUE_DATE/g)).toHaveLength(1);
    expect(formatted).toContain(
      '🔌 **Dữ liệu thực tế từ MCP:** [MCP] SmartVista FE & BO Database MCP - list_advertised_groups, [MCP] SmartVista FE & BO Database MCP - search_nodes'
    );
  });

  it('renders claims instead of conclusion, falling back to conclusion without claims', () => {
    const grounding: ChatMessageGrounding = {
      schemaVersion: 1,
      authority: 'server',
      outcome: 'READY',
      answer: {
        schemaVersion: 2,
        language: 'vi',
        conclusion: 'Thông tin chung về ngày phát hành thẻ trong hệ thống SmartVista.',
        confidence: 'medium',
        confidenceReason: 'Tìm thấy tài liệu chung',
        hypotheses: [],
        unsupportedParts: [],
        claims: [
          {
            id: 'C1',
            text: 'Cột ISS_DATE lưu ngày phát hành thực tế của phôi thẻ.',
            citationIds: ['M1'],
            classification: 'DIRECT',
            pathId: null,
          },
        ],
      },
      citations: [],
      paths: [],
      conflicts: [],
      scope: {
        setIds: [],
        routedScope: {
          domain: null,
          environment: null,
          version: null,
          comparisonMode: null,
        },
      },
      modalityDiagnostics: {
        fulltext: { status: 'ok', latencyMs: 0, itemCount: 0 },
        vector: { status: 'ok', latencyMs: 0, itemCount: 0 },
        graph: { status: 'ok', latencyMs: 0, itemCount: 0 },
      },
      coverageWarnings: [],
      fallbackReason: 'NONE',
      routerVersion: 'router-v1',
      promptVersion: 'grounded-v1',
      modelId: 'test-model',
      createdAt: new Date().toISOString(),
    };

    const formatted = formatGroundedAnswerForTelegram(grounding);
    expect(formatted).not.toContain('Thông tin chung về ngày phát hành thẻ trong hệ thống SmartVista.');
    expect(formatted).toContain('- Cột ISS_DATE lưu ngày phát hành thực tế của phôi thẻ.');

    const noClaims = {
      ...grounding,
      answer: { ...grounding.answer!, claims: [] },
    };
    expect(formatGroundedAnswerForTelegram(noClaims)).toContain(
      'Thông tin chung về ngày phát hành thẻ trong hệ thống SmartVista.'
    );
  });
});
