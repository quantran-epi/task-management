import { describe, it, expect } from 'vitest';
import {
  KNOWLEDGE_SERVER_EMPTY_NOTICE,
  KNOWLEDGE_OUTCOME_CODES,
  detectKnowledgeToolOutcome,
  resolveKnowledgeOutcomeRender,
  type KnowledgeOutcomeCode,
} from '../../src/services/ai/knowledgeOutcome';

// D-12 canonical text, spelled out literally here so a later edit to the
// exported constant fails the exact-string assertion below.
const D12_NOTICE =
  'Knowledge Server chưa có bộ tài liệu nào được publish. Hãy publish ít nhất một bộ tài liệu từ thiết bị có tài liệu, rồi thử lại.';

describe('knowledgeOutcome canonical notice', () => {
  it('exports the exact D-12 canonical string with no surrounding whitespace', () => {
    expect(KNOWLEDGE_SERVER_EMPTY_NOTICE).toBe(D12_NOTICE);
    expect(KNOWLEDGE_SERVER_EMPTY_NOTICE.trim()).toBe(KNOWLEDGE_SERVER_EMPTY_NOTICE);
  });

  it('exports the fixed outcome code vocabulary', () => {
    expect(KNOWLEDGE_OUTCOME_CODES).toEqual(['NO_PUBLISHED_SETS', 'NO_EVIDENCE', 'UNREACHABLE']);
    const code: KnowledgeOutcomeCode = 'NO_PUBLISHED_SETS';
    expect(code).toBe('NO_PUBLISHED_SETS');
  });
});

describe('knowledgeOutcome detect', () => {
  it('detects NO_PUBLISHED_SETS from the outcome field of retrieve_knowledge result JSON', () => {
    const raw = JSON.stringify({ outcome: 'NO_PUBLISHED_SETS', excerpts: [], status: {} });
    expect(detectKnowledgeToolOutcome('retrieve_knowledge', raw)).toBe('NO_PUBLISHED_SETS');
  });

  it('detects NO_EVIDENCE from the outcome field', () => {
    const raw = JSON.stringify({ outcome: 'NO_EVIDENCE', excerpts: [] });
    expect(detectKnowledgeToolOutcome('retrieve_knowledge', raw)).toBe('NO_EVIDENCE');
  });

  it('detects the code from status.code when outcome is absent', () => {
    const raw = JSON.stringify({ status: { code: 'UNREACHABLE' } });
    expect(detectKnowledgeToolOutcome('retrieve_knowledge', raw)).toBe('UNREACHABLE');
  });

  it('normalizes cloaked tool names the way chat surfaces do', () => {
    const raw = JSON.stringify({ outcome: 'NO_PUBLISHED_SETS' });
    expect(detectKnowledgeToolOutcome('retrieve_knowledge_ide', raw)).toBe('NO_PUBLISHED_SETS');
    expect(detectKnowledgeToolOutcome('proxy_retrieve_knowledge', raw)).toBe('NO_PUBLISHED_SETS');
  });

  it('returns null for non-JSON result text without throwing', () => {
    expect(detectKnowledgeToolOutcome('retrieve_knowledge', 'not json {')).toBeNull();
    expect(detectKnowledgeToolOutcome('retrieve_knowledge', '')).toBeNull();
  });

  it('returns null for a different tool name', () => {
    const raw = JSON.stringify({ outcome: 'NO_PUBLISHED_SETS' });
    expect(detectKnowledgeToolOutcome('get_document_details', raw)).toBeNull();
    expect(detectKnowledgeToolOutcome('list_tools', raw)).toBeNull();
  });

  it('returns null for an unrecognized outcome value', () => {
    const raw = JSON.stringify({ outcome: 'SOMETHING_ELSE' });
    expect(detectKnowledgeToolOutcome('retrieve_knowledge', raw)).toBeNull();
  });

  it('reads no dynamic keys and tolerates malformed shapes', () => {
    expect(detectKnowledgeToolOutcome('retrieve_knowledge', 'null')).toBeNull();
    expect(detectKnowledgeToolOutcome('retrieve_knowledge', '[]')).toBeNull();
    expect(detectKnowledgeToolOutcome('retrieve_knowledge', '{"outcome":42}')).toBeNull();
  });
});

describe('knowledgeOutcome render', () => {
  it('maps NO_PUBLISHED_SETS to the canonical notice and publish guide', () => {
    expect(resolveKnowledgeOutcomeRender('NO_PUBLISHED_SETS')).toEqual({
      notice: D12_NOTICE,
      guide: 'publish',
    });
  });

  it('maps NO_EVIDENCE to no notice and a refine guide', () => {
    expect(resolveKnowledgeOutcomeRender('NO_EVIDENCE')).toEqual({
      notice: null,
      guide: 'refine',
    });
  });

  it('maps UNREACHABLE to no notice and an unavailable guide', () => {
    expect(resolveKnowledgeOutcomeRender('UNREACHABLE')).toEqual({
      notice: null,
      guide: 'unavailable',
    });
  });
});
