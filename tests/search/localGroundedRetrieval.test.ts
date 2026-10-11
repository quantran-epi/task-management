import { describe, it, expect, vi } from 'vitest';
import {
  runLocalGroundedRetrieval,
  strongEvidenceVerdict,
  tokenizeQuery,
  type MemberEntry,
} from '../../src/services/search/localGroundedRetrieval';
import { normalizeMarkdownForHash, computeSha256 } from '../../src/db/repositories/documentSetRepo';

describe('localGroundedRetrieval', () => {
  it('1. Scope restriction: only resolvedSetIds members are scanned', async () => {
    const loadSetMembers = vi.fn().mockImplementation(async (setIds: readonly string[]) => {
      expect(setIds).toEqual(['set-A']);
      return [
        { setId: 'set-A', setName: 'Set A', documentId: 'doc-1' },
      ];
    });

    const loadNoteBody = vi.fn().mockImplementation(async (docId: string) => {
      if (docId === 'doc-1') {
        return { title: 'Doc One', body: 'This is document one' };
      }
      return null;
    });

    const res = await runLocalGroundedRetrieval(
      { query: 'document', resolvedSetIds: ['set-A'] },
      { loadSetMembers, loadNoteBody }
    );

    expect(loadSetMembers).toHaveBeenCalledWith(['set-A']);
    expect(loadNoteBody).toHaveBeenCalledWith('doc-1');
    expect(loadNoteBody).not.toHaveBeenCalledWith('doc-2');
    expect(res.totalScanned).toBe(1);
    expect(res.ranges.length).toBe(1);
    expect(res.ranges[0]?.documentId).toBe('doc-1');
  });

  it('2. Empty scope guard: empty resolvedSetIds returns empty and skips loader', async () => {
    const loadSetMembers = vi.fn();
    const loadNoteBody = vi.fn();

    const res = await runLocalGroundedRetrieval(
      { query: 'anything', resolvedSetIds: [] },
      { loadSetMembers, loadNoteBody }
    );

    expect(res.ranges).toEqual([]);
    expect(res.strongEvidence).toBe(false);
    expect(res.totalScanned).toBe(0);
    expect(loadSetMembers).not.toHaveBeenCalled();
    expect(loadNoteBody).not.toHaveBeenCalled();
  });

  it('3. Range accuracy: returns correct line numbers and section anchor', async () => {
    const body = '# Flow\nStart\nMATCH here\nEnd';
    const loadSetMembers = vi.fn().mockResolvedValue([
      { setId: 'set-A', setName: 'Set A', documentId: 'doc-flow' },
    ]);
    const loadNoteBody = vi.fn().mockResolvedValue({
      title: 'Flow Title',
      body,
    });

    const res = await runLocalGroundedRetrieval(
      { query: 'MATCH', resolvedSetIds: ['set-A'] },
      { loadSetMembers, loadNoteBody }
    );

    expect(res.ranges.length).toBe(1);
    const range = res.ranges[0]!;
    expect(range.lineStart).toBeLessThanOrEqual(3);
    expect(range.lineEnd).toBeGreaterThanOrEqual(3);
    expect(range.sectionAnchor).toBe('Flow');
    expect(range.rawSnippet).toContain('MATCH here');
  });

  it('4. Offset accuracy: startOffset/endOffset substring matches rawSnippet exactly', async () => {
    const body = '# Section A\nLine 1\nLine 2 contains some special key term.\nLine 3\nLine 4';
    const loadSetMembers = vi.fn().mockResolvedValue([
      { setId: 'set-A', setName: 'Set A', documentId: 'doc-offset' },
    ]);
    const loadNoteBody = vi.fn().mockResolvedValue({
      title: 'Offset Test',
      body,
    });

    const res = await runLocalGroundedRetrieval(
      { query: 'special key term', resolvedSetIds: ['set-A'] },
      { loadSetMembers, loadNoteBody }
    );

    expect(res.ranges.length).toBe(1);
    const range = res.ranges[0]!;
    const sliced = body.slice(range.startOffset, range.endOffset);
    expect(sliced).toBe(range.rawSnippet);
  });

  it('5. Dedup across memberships (D-39): one range with all containing sets', async () => {
    const loadSetMembers = vi.fn().mockResolvedValue([
      { setId: 'set-A', setName: 'Set Alpha', documentId: 'doc-shared' },
      { setId: 'set-B', setName: 'Set Beta', documentId: 'doc-shared' },
    ]);
    const loadNoteBody = vi.fn().mockResolvedValue({
      title: 'Shared Doc',
      body: 'Shared content across multiple sets.',
    });

    const res = await runLocalGroundedRetrieval(
      { query: 'shared', resolvedSetIds: ['set-A', 'set-B'] },
      { loadSetMembers, loadNoteBody }
    );

    expect(res.ranges.length).toBe(1);
    const range = res.ranges[0]!;
    expect(range.setMemberships).toHaveLength(2);
    expect(range.setMemberships).toEqual([
      { setId: 'set-A', setName: 'Set Alpha' },
      { setId: 'set-B', setName: 'Set Beta' },
    ]);
  });

  it('6. Strong evidence: query matches 2+ distinct terms or title token', async () => {
    const loadSetMembers = vi.fn().mockResolvedValue([
      { setId: 'set-A', setName: 'Set A', documentId: 'doc-strong' },
    ]);
    const loadNoteBody = vi.fn().mockResolvedValue({
      title: 'Account Reconciliation Process',
      body: 'Contains details about cycle codes and settlement.',
    });

    const res = await runLocalGroundedRetrieval(
      { query: 'cycle codes settlement', resolvedSetIds: ['set-A'] },
      { loadSetMembers, loadNoteBody }
    );

    expect(res.strongEvidence).toBe(true);
    expect(strongEvidenceVerdict(res, tokenizeQuery('cycle codes settlement'))).toBe(true);
  });

  it('7. Weak evidence: single match in body without title match', async () => {
    const loadSetMembers = vi.fn().mockResolvedValue([
      { setId: 'set-A', setName: 'Set A', documentId: 'doc-weak' },
    ]);
    const loadNoteBody = vi.fn().mockResolvedValue({
      title: 'General Overview',
      body: 'A single incidental mention of pineapple here.',
    });

    const res = await runLocalGroundedRetrieval(
      { query: 'pineapple', resolvedSetIds: ['set-A'] },
      { loadSetMembers, loadNoteBody }
    );

    expect(res.ranges.length).toBe(1);
    expect(res.strongEvidence).toBe(false);
  });

  it('8. Content hash: contentHash matches computeSha256(normalizeMarkdownForHash(body))', async () => {
    const body = '# Title\r\nCRLF formatted body text.\r\nEnd.';
    const expectedHash = await computeSha256(normalizeMarkdownForHash(body));

    const loadSetMembers = vi.fn().mockResolvedValue([
      { setId: 'set-A', setName: 'Set A', documentId: 'doc-hash' },
    ]);
    const loadNoteBody = vi.fn().mockResolvedValue({
      title: 'Hash Test',
      body,
    });

    const res = await runLocalGroundedRetrieval(
      { query: 'formatted', resolvedSetIds: ['set-A'] },
      { loadSetMembers, loadNoteBody }
    );

    expect(res.ranges.length).toBe(1);
    expect(res.ranges[0]?.contentHash).toBe(expectedHash);
  });

  it('9. Vietnamese diacritic normalization: matches diacritic variations', async () => {
    const body = 'Hướng dẫn thiết lập môi trường triển khai thực tế.';
    const loadSetMembers = vi.fn().mockResolvedValue([
      { setId: 'set-A', setName: 'Set A', documentId: 'doc-vn' },
    ]);
    const loadNoteBody = vi.fn().mockResolvedValue({
      title: 'Tài liệu môi trường',
      body,
    });

    const res = await runLocalGroundedRetrieval(
      { query: 'moi truong', resolvedSetIds: ['set-A'] },
      { loadSetMembers, loadNoteBody }
    );

    expect(res.ranges.length).toBe(1);
    expect(res.ranges[0]?.matchedTerms).toContain('moi');
    expect(res.ranges[0]?.matchedTerms).toContain('truong');
  });

  it('10. MaxResults bound: returns exactly maxResults highest scored', async () => {
    const members: MemberEntry[] = [];
    const notesMap = new Map<string, { title: string; body: string }>();

    for (let i = 1; i <= 10; i++) {
      const docId = `doc-${i}`;
      members.push({ setId: 'set-A', setName: 'Set A', documentId: docId });
      notesMap.set(docId, {
        title: `Doc Number ${i}`,
        body: `Match targetterm in document body number ${i}.`,
      });
    }

    const loadSetMembers = vi.fn().mockResolvedValue(members);
    const loadNoteBody = vi.fn().mockImplementation(async (id: string) => notesMap.get(id) ?? null);

    const res = await runLocalGroundedRetrieval(
      { query: 'targetterm', resolvedSetIds: ['set-A'], maxResults: 3 },
      { loadSetMembers, loadNoteBody }
    );

    expect(res.ranges).toHaveLength(3);
    for (const range of res.ranges) {
      expect(range.matchedTerms).toContain('targetterm');
    }
  });

  it('11. Snippet cap: snippet length never exceeds maxSnippetChars', async () => {
    const longBody = Array.from({ length: 100 }, (_, i) => `Paragraph ${i}: ${'x'.repeat(80)}`).join('\n') +
      '\nTarget match keyword here.\n' +
      Array.from({ length: 100 }, (_, i) => `After ${i}: ${'y'.repeat(80)}`).join('\n');

    const loadSetMembers = vi.fn().mockResolvedValue([
      { setId: 'set-A', setName: 'Set A', documentId: 'doc-long' },
    ]);
    const loadNoteBody = vi.fn().mockResolvedValue({
      title: 'Long Doc',
      body: longBody,
    });

    const res = await runLocalGroundedRetrieval(
      { query: 'target match keyword', resolvedSetIds: ['set-A'], maxSnippetChars: 300 },
      { loadSetMembers, loadNoteBody }
    );

    expect(res.ranges.length).toBe(1);
    const range = res.ranges[0]!;
    expect(range.rawSnippet.length).toBeLessThanOrEqual(300);
    expect(range.endOffset - range.startOffset).toBeLessThanOrEqual(300);
  });

  it('12. Missing document: skips missing note body silently without crashing', async () => {
    const loadSetMembers = vi.fn().mockResolvedValue([
      { setId: 'set-A', setName: 'Set A', documentId: 'doc-missing' },
      { setId: 'set-A', setName: 'Set A', documentId: 'doc-present' },
    ]);
    const loadNoteBody = vi.fn().mockImplementation(async (id: string) => {
      if (id === 'doc-present') {
        return { title: 'Present Doc', body: 'Valid note body with search term.' };
      }
      return null;
    });

    const res = await runLocalGroundedRetrieval(
      { query: 'search term', resolvedSetIds: ['set-A'] },
      { loadSetMembers, loadNoteBody }
    );

    expect(res.ranges.length).toBe(1);
    expect(res.ranges[0]?.documentId).toBe('doc-present');
  });
});
