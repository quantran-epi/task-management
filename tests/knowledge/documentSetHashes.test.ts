// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { computeSha256, computeNoteHashesCached, normalizeMarkdownForHash } from '../../src/db/repositories/documentSetRepo';
import type { Note } from '../../src/types/models';

function note(id: string, body: string, updatedAt: string): Note {
  return {
    id,
    type: 'document',
    title: id,
    body,
    isPinned: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt,
  };
}

async function expectedHash(body: string): Promise<string> {
  return computeSha256(normalizeMarkdownForHash(body));
}

describe('computeNoteHashesCached', () => {
  it('hashes only passed notes and reuses cache for unchanged (id, updatedAt)', async () => {
    const cache = new Map<string, { updatedAt: string; hash: string }>();
    const first = note('doc-1', '# one', '2026-01-02T00:00:00.000Z');
    const second = note('doc-2', '# two', '2026-01-03T00:00:00.000Z');

    const hashes = await computeNoteHashesCached([first, second], cache);
    expect(hashes).toEqual({
      'doc-1': await expectedHash('# one'),
      'doc-2': await expectedHash('# two'),
    });
    expect(cache.size).toBe(2);

    const again = await computeNoteHashesCached([first, second], cache);
    expect(again).toEqual(hashes);
    expect(cache.size).toBe(2);
  });

  it('invalidates only the changed note when updatedAt changes', async () => {
    const cache = new Map<string, { updatedAt: string; hash: string }>();
    const first = note('doc-1', '# one', '2026-01-02T00:00:00.000Z');
    const second = note('doc-2', '# two', '2026-01-03T00:00:00.000Z');
    const before = await computeNoteHashesCached([first, second], cache);

    const changed = note('doc-1', '# one edited', '2026-01-04T00:00:00.000Z');
    const after = await computeNoteHashesCached([changed, second], cache);

    expect(after['doc-1']).toBe(await expectedHash('# one edited'));
    expect(after['doc-1']).not.toBe(before['doc-1']);
    expect(after['doc-2']).toBe(before['doc-2']);
    expect(cache.size).toBe(2);
  });

  it('keeps caches from different callers isolated and never returns foreign ids', async () => {
    const doc = note('doc-1', '# one', '2026-01-02T00:00:00.000Z');
    const cacheA = new Map<string, { updatedAt: string; hash: string }>();
    const cacheB = new Map<string, { updatedAt: string; hash: string }>();
    cacheB.set('doc-9', { updatedAt: doc.updatedAt, hash: 'foreign' });

    expect(await computeNoteHashesCached([doc], cacheA)).toEqual({
      'doc-1': await expectedHash('# one'),
    });
    expect(await computeNoteHashesCached([doc], cacheB)).toEqual({
      'doc-1': await expectedHash('# one'),
    });
    expect(cacheA.size).toBe(1);
    expect(cacheB.get('doc-9')).toEqual({ updatedAt: doc.updatedAt, hash: 'foreign' });
    expect(await computeNoteHashesCached([], cacheA)).toEqual({});
  });
});
