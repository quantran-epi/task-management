import { describe, it, expect } from 'vitest';
import { formatGroundedAnswerForTelegram } from '../telegramHeadlessWorker';
import type { ChatMessageGrounding } from '../../ai/groundedAnswerSchemas';

describe('formatGroundedAnswerForTelegram', () => {
  it('deduplicates claims when conclusion already covers the claim text', () => {
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
    expect(formatted).toContain('Ngày phát hành thẻ được lưu tại cột ISS_DATE');
    // Claim 1 is covered by conclusion, so it should not be repeated as a bullet
    expect(formatted).not.toContain('- Ngày phát hành thẻ được lưu tại cột ISS_DATE');
    // Citation header exists
    expect(formatted).toContain('🔌 **Dữ liệu thực tế từ MCP:** MAIN1.ISS_CARD_INSTANCE');
  });

  it('keeps distinct claims that are not covered in conclusion', () => {
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
    expect(formatted).toContain('Thông tin chung về ngày phát hành thẻ trong hệ thống SmartVista.');
    expect(formatted).toContain('- Cột ISS_DATE lưu ngày phát hành thực tế của phôi thẻ.');
  });
});
