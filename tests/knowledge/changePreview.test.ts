// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type { DocumentSet, Note } from '../../src/types/models';
import {
  buildChangePreview,
  type CachedActiveSnapshotManifest,
} from '../../src/services/knowledge/changePreview';

const SET_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DOC_A = '11111111-1111-4111-8111-111111111111';
const DOC_B = '22222222-2222-4222-8222-222222222222';
const DOC_C = '33333333-3333-4333-8333-333333333333';

function note(id: string, body: string, title = id, tags?: string[]): Note {
  return {
    id,
    type: 'document',
    title,
    body,
    ...(tags ? { tags } : {}),
    isPinned: false,
    createdAt: '2026-10-08T00:00:00.000Z',
    updatedAt: '2026-10-08T00:00:00.000Z',
  };
}

function set(documentIds: string[]): DocumentSet {
  return {
    id: SET_ID,
    name: 'Process 60000006',
    documentIds,
    createdAt: '2026-10-08T00:00:00.000Z',
    updatedAt: '2026-10-08T00:00:00.000Z',
  };
}

async function activeManifest(
  documents: Note[]
): Promise<CachedActiveSnapshotManifest> {
  const preview = await buildChangePreview({
    documentSet: set(documents.map((document) => document.id)),
    notes: documents,
    activeManifest: null,
  });

  return {
    snapshotId: 'snapshot-baseline',
    setId: SET_ID,
    chunkingPolicyVersion: preview.snapshot.chunkingPolicyVersion,
    documents: preview.snapshot.documents.map((document) => ({
      documentId: document.documentId,
      title: document.title,
      contentHash: document.contentHash,
      chunks: document.chunks.map((chunk) => ({
        occurrenceId: chunk.occurrenceId,
        chunkKey: chunk.chunkKey,
        contentHash: chunk.contentHash,
        headingPath: [...chunk.headingPath],
        chunkIndex: chunk.chunkIndex,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
      })),
    })),
  };
}

function classifications<T extends { classification: string }>(items: readonly T[]) {
  return items.map((item) => item.classification);
}

describe('buildChangePreview', () => {
  it('classifies exact document and chunk four-way deltas without fetch', async () => {
    const baselineA = note(DOC_A, '## Keep\nSame\n\n## Edit\nBefore\n', 'A');
    const baselineB = note(DOC_B, '## Removed\nGone\n', 'B');
    const manifest = await activeManifest([baselineA, baselineB]);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const preview = await buildChangePreview({
      documentSet: set([DOC_A, DOC_C]),
      notes: [
        note(DOC_A, '## Keep\nSame\n\n## Edit\nAfter\n', 'A'),
        note(DOC_C, '## Added\nNew\n', 'C'),
      ],
      activeManifest: manifest,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    expect(classifications(preview.documents)).toEqual([
      'changed',
      'added',
      'removed',
    ]);
    expect(preview.counts).toEqual({
      documentsAdded: 1,
      documentsChanged: 1,
      documentsRemoved: 1,
      documentsUnchanged: 0,
      chunksAdded: 1,
      chunksChanged: 1,
      chunksRemoved: 1,
      chunksUnchanged: 1,
    });
    expect(preview.hasRemovals).toBe(true);
  });

  it('reports unchanged content with zero mutations and normalizes only newlines', async () => {
    const original = note(
      DOC_A,
      '## SQL\r\n```sql\r\nSELECT  *  FROM T_ACCOUNT;\r\n```\r\n'
    );
    const manifest = await activeManifest([original]);

    for (const body of [
      '## SQL\n```sql\nSELECT  *  FROM T_ACCOUNT;\n```\n',
      '## SQL\r```sql\rSELECT  *  FROM T_ACCOUNT;\r```\r',
    ]) {
      const preview = await buildChangePreview({
        documentSet: set([DOC_A]),
        notes: [note(DOC_A, body)],
        activeManifest: manifest,
      });
      expect(preview.documents[0]?.classification).toBe('unchanged');
      expect(preview.chunks.every((chunk) => chunk.classification === 'unchanged')).toBe(true);
      expect(preview.counts.chunksAdded + preview.counts.chunksChanged + preview.counts.chunksRemoved).toBe(0);
    }

    for (const changedBody of [
      '## sql\n```sql\nSELECT  *  FROM T_ACCOUNT;\n```\n',
      '## SQL\n```sql\nSELECT * FROM T_ACCOUNT;\n```\n',
    ]) {
      const preview = await buildChangePreview({
        documentSet: set([DOC_A]),
        notes: [note(DOC_A, changedBody)],
        activeManifest: manifest,
      });
      expect(preview.documents[0]?.classification).toBe('changed');
      expect(preview.counts.chunksChanged).toBe(1);
    }
  });

  it('preserves reusable identity for moved content and keeps duplicate occurrences', async () => {
    const duplicate = '## Status Codes\n200 OK\n400 Bad Request\n\n';
    const original = note(
      DOC_A,
      `${duplicate}## Another Heading\nMiddle content.\n\n${duplicate}`
    );
    const manifest = await activeManifest([original]);
    const moved = note(
      DOC_A,
      `## Intro\nNew.\n\n${duplicate}## Another Heading\nMiddle content.\n\n${duplicate}`
    );

    const preview = await buildChangePreview({
      documentSet: set([DOC_A]),
      notes: [moved],
      activeManifest: manifest,
    });

    const duplicateHash = manifest.documents[0]?.chunks.find(
      (chunk, index, chunks) =>
        chunks.some(
          (candidate, candidateIndex) =>
            candidateIndex !== index && candidate.contentHash === chunk.contentHash
        )
    )?.contentHash;
    const duplicateMatches = preview.chunks.filter(
      (chunk) => chunk.current?.contentHash === duplicateHash
    );
    expect(duplicateMatches).toHaveLength(2);
    expect(duplicateMatches.every((chunk) => chunk.classification === 'unchanged')).toBe(true);
    expect(duplicateMatches.every((chunk) => chunk.moved)).toBe(true);
    expect(new Set(duplicateMatches.map((chunk) => chunk.current?.occurrenceId)).size).toBe(2);
  });

  it('shows removals, never mutates Notes, and freezes reviewed input deeply', async () => {
    const kept = note(DOC_A, '## Keep\nBody\n', 'Kept', ['tag-a']);
    const removed = note(DOC_B, '## Remove\nRemote only\n', 'Removed');
    const manifest = await activeManifest([kept, removed]);
    const current = note(DOC_A, kept.body, kept.title, kept.tags);
    const before = structuredClone(current);

    const preview = await buildChangePreview({
      documentSet: set([DOC_A]),
      notes: [current],
      activeManifest: manifest,
    });

    expect(current).toEqual(before);
    expect(preview.documents.find((document) => document.documentId === DOC_B)?.classification).toBe('removed');
    expect(Object.isFrozen(preview)).toBe(true);
    expect(Object.isFrozen(preview.snapshot.documents)).toBe(true);
    expect(Object.isFrozen(preview.snapshot.documents[0]?.tags)).toBe(true);
    expect(Object.isFrozen(preview.snapshot.documents[0]?.chunks)).toBe(true);
    expect(() => {
      (preview.snapshot.documents[0]!.tags as string[]).push('mutate');
    }).toThrow();
  });

  it('keeps frozen payload stable after later Note edits and rebuild detects changes', async () => {
    const original = note(DOC_A, '## Version\nOne\n', 'Doc', ['stable']);
    const manifest = await activeManifest([original]);
    const mutable = note(DOC_A, original.body, original.title, original.tags);
    const first = await buildChangePreview({
      documentSet: set([DOC_A]),
      notes: [mutable],
      activeManifest: manifest,
    });
    const frozenBody = first.snapshot.documents[0]?.body;

    mutable.body = '## Version\nTwo\n';
    mutable.title = 'Edited later';
    mutable.tags?.push('later');

    expect(first.snapshot.documents[0]?.body).toBe(frozenBody);
    expect(first.snapshot.documents[0]?.title).toBe('Doc');
    expect(first.snapshot.documents[0]?.tags).toEqual(['stable']);

    const rebuilt = await buildChangePreview({
      documentSet: set([DOC_A]),
      notes: [mutable],
      activeManifest: manifest,
    });
    expect(rebuilt.documents[0]?.classification).toBe('changed');
    expect(rebuilt.snapshot.documents[0]?.body).toBe('## Version\nTwo\n');
  });

  it('contains no network client, polling, or server route dependency', async () => {
    const sourcePath = fileURLToPath(
      new URL('../../src/services/knowledge/changePreview.ts', import.meta.url)
    );
    const source = await readFile(sourcePath, 'utf8');

    for (const forbidden of [
      /\bfetch\s*\(/,
      /knowledgeClient/,
      /poll(?:ing|er)?/i,
      /routes?\//,
      /server\.ts/,
    ]) {
      expect(source).not.toMatch(forbidden);
    }
  });
});
