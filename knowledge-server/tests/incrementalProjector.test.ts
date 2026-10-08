import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256Text } from '../../src/services/knowledge/changePreview.js';
import { CHUNKING_POLICY_VERSION } from '../src/types/protocol.js';
import { buildChunkHashInput } from '../src/indexing/chunkHashPolicy.js';
import { hashChunk } from '../src/indexing/chunkHasher.js';
import {
  projectIncrementally,
  type ProjectionSnapshot,
} from '../src/indexing/incrementalProjector.js';

const DOCUMENT_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_DOCUMENT_ID = '22222222-2222-4222-8222-222222222222';

function project(documents: { documentId: string; title: string; body: string }[], active: ProjectionSnapshot | null = null) {
  return projectIncrementally({ setId: 'set-1', documents, activeSnapshot: active });
}

describe('incremental projection', () => {
  it('matches browser SHA-256 for pilot-like content and CRLF variants', async () => {
    const contents = [
      '## Flow\n\n| Step | Action |\n|---|---|\n| 1 | Run |\n',
      '## SQL\r\n\r\n```sql\r\nselect * from dual;\r\n```\r\n',
    ];

    for (const content of contents) {
      const expected = await sha256Text(buildChunkHashInput(content));
      expect(hashChunk(content)).toBe(expected);
      expect(hashChunk(content)).toBe(
        createHash('sha256').update(buildChunkHashInput(content), 'utf8').digest('hex')
      );
    }
    expect(hashChunk(contents[1]!)).toBe(hashChunk(contents[1]!.replaceAll('\r\n', '\n')));
  });

  it('reports zero mutations and reuses representation IDs on unchanged republish', () => {
    const baseline = project([{ documentId: DOCUMENT_ID, title: 'Flow', body: '## A\n\nSame\n' }]);
    const repeated = project(
      [{ documentId: DOCUMENT_ID, title: 'Flow', body: '## A\n\nSame\n' }],
      baseline.candidate
    );

    expect(repeated.summary).toMatchObject({
      documentsAdded: 0,
      documentsChanged: 0,
      documentsRemoved: 0,
      documentsUnchanged: 1,
      chunksAdded: 0,
      chunksChanged: 0,
      chunksRemoved: 0,
      chunksUnchanged: 1,
      mutations: 0,
    });
    expect(repeated.candidate.documents[0]!.chunks[0]!.representationId).toBe(
      baseline.candidate.documents[0]!.chunks[0]!.representationId
    );
    expect(repeated.candidate.chunkingPolicyVersion).toBe(CHUNKING_POLICY_VERSION);
  });

  it('mutates only one changed section and one removal while reusing unrelated chunks', () => {
    const baseline = project([
      { documentId: DOCUMENT_ID, title: 'Flow', body: '## A\n\nKeep\n\n## B\n\nOld\n' },
      { documentId: SECOND_DOCUMENT_ID, title: 'Remove', body: '## Gone\n\nDelete me\n' },
    ]);
    const changed = project(
      [{ documentId: DOCUMENT_ID, title: 'Flow', body: '## A\n\nKeep\n\n## B\n\nNew\n' }],
      baseline.candidate
    );

    expect(changed.summary).toMatchObject({
      documentsChanged: 1,
      documentsRemoved: 1,
      chunksChanged: 1,
      chunksRemoved: 1,
      chunksUnchanged: 1,
      mutations: 2,
    });
    expect(changed.candidate.documents[0]!.chunks[0]!.representationId).toBe(
      baseline.candidate.documents[0]!.chunks[0]!.representationId
    );
  });

  it('reuses duplicate moved content while preserving independent occurrences', () => {
    const body = '## Same\n\nRepeated\n\n## Same\n\nRepeated\n';
    const baseline = project([{ documentId: DOCUMENT_ID, title: 'Flow', body }]);
    const moved = project([
      { documentId: DOCUMENT_ID, title: 'Flow', body: `## New\n\nPrefix\n\n${body}` },
    ], baseline.candidate);

    const baselineDuplicates = baseline.candidate.documents[0]!.chunks;
    const movedDuplicates = moved.candidate.documents[0]!.chunks.slice(1);
    expect(new Set(baselineDuplicates.map((chunk) => chunk.representationId)).size).toBe(1);
    expect(movedDuplicates.map((chunk) => chunk.representationId)).toEqual(
      baselineDuplicates.map((chunk) => chunk.representationId)
    );
    expect(new Set(movedDuplicates.map((chunk) => chunk.occurrenceId)).size).toBe(2);
    expect(movedDuplicates[0]!.startOffset).not.toBe(baselineDuplicates[0]!.startOffset);
    expect(moved.summary.chunksUnchanged).toBe(2);
  });
});
