import {
  CHUNKING_POLICY_VERSION,
  type EvidenceChunk,
} from '../../../knowledge-server/src/types/protocol';
import { chunkMarkdownSnapshot } from '../../../knowledge-server/src/parser/sectionChunker';
import {
  buildDocumentHashInput,
  normalizeNewlines,
} from '../../../knowledge-server/src/indexing/chunkHashPolicy';
import type { DocumentSet, Note } from '../../types/models';

export type DeltaClassification = 'added' | 'changed' | 'removed' | 'unchanged';

export interface CachedChunkManifestItem {
  occurrenceId: string;
  chunkKey: string;
  contentHash: string;
  headingPath: string[];
  chunkIndex: number;
  startLine: number;
  endLine: number;
  startOffset: number;
  endOffset: number;
}

export interface CachedDocumentManifestItem {
  documentId: string;
  title: string;
  contentHash: string;
  chunks: CachedChunkManifestItem[];
}

export interface CachedActiveSnapshotManifest {
  snapshotId: string;
  setId: string;
  chunkingPolicyVersion: string;
  documents: CachedDocumentManifestItem[];
}

export interface FrozenPublishDocument {
  documentId: string;
  title: string;
  body: string;
  tags: readonly string[];
  contentHash: string;
  chunks: readonly EvidenceChunk[];
}

export interface FrozenPublishSnapshot {
  setId: string;
  setName: string;
  chunkingPolicyVersion: string;
  documents: readonly FrozenPublishDocument[];
}

export interface DocumentDelta {
  documentId: string;
  title: string;
  classification: DeltaClassification;
  previousHash?: string | undefined;
  currentHash?: string | undefined;
}

export interface ChunkDelta {
  documentId: string;
  classification: DeltaClassification;
  moved: boolean;
  previous?: CachedChunkManifestItem | undefined;
  current?: EvidenceChunk | undefined;
}

export interface ChangePreviewCounts {
  documentsAdded: number;
  documentsChanged: number;
  documentsRemoved: number;
  documentsUnchanged: number;
  chunksAdded: number;
  chunksChanged: number;
  chunksRemoved: number;
  chunksUnchanged: number;
}

export interface ChangePreview {
  setId: string;
  documents: readonly DocumentDelta[];
  chunks: readonly ChunkDelta[];
  counts: Readonly<ChangePreviewCounts>;
  hasRemovals: boolean;
  snapshot: FrozenPublishSnapshot;
}

export interface BuildChangePreviewInput {
  documentSet: DocumentSet;
  notes: readonly Note[];
  activeManifest: CachedActiveSnapshotManifest | null;
}

const textEncoder = new TextEncoder();

export async function sha256Text(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    textEncoder.encode(text)
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }
  return value;
}

function queueByContentHash<T extends { contentHash: string }>(items: readonly T[]) {
  const queues = new Map<string, T[]>();
  for (const item of items) {
    const queue = queues.get(item.contentHash);
    if (queue) queue.push(item);
    else queues.set(item.contentHash, [item]);
  }
  return queues;
}

function sameOccurrence(
  previous: CachedChunkManifestItem,
  current: EvidenceChunk
): boolean {
  return (
    previous.chunkIndex === current.chunkIndex &&
    previous.startOffset === current.startOffset &&
    previous.endOffset === current.endOffset &&
    previous.headingPath.length === current.headingPath.length &&
    previous.headingPath.every(
      (heading, index) => heading === current.headingPath[index]
    )
  );
}

function classifyChunks(
  documentId: string,
  previous: readonly CachedChunkManifestItem[],
  current: readonly EvidenceChunk[]
): ChunkDelta[] {
  const previousByHash = queueByContentHash(previous);
  const unmatchedPrevious = new Set(previous);
  const result: ChunkDelta[] = [];
  const unmatchedCurrent: EvidenceChunk[] = [];

  for (const chunk of current) {
    const match = previousByHash.get(chunk.contentHash)?.shift();
    if (!match) {
      unmatchedCurrent.push(chunk);
      continue;
    }
    unmatchedPrevious.delete(match);
    result.push({
      documentId,
      classification: 'unchanged',
      moved: !sameOccurrence(match, chunk),
      previous: match,
      current: chunk,
    });
  }

  const previousRemainder = [...unmatchedPrevious];
  const changedCount = Math.min(previousRemainder.length, unmatchedCurrent.length);
  for (let index = 0; index < changedCount; index += 1) {
    result.push({
      documentId,
      classification: 'changed',
      moved: false,
      previous: previousRemainder[index],
      current: unmatchedCurrent[index],
    });
  }
  for (const chunk of unmatchedCurrent.slice(changedCount)) {
    result.push({
      documentId,
      classification: 'added',
      moved: false,
      current: chunk,
    });
  }
  for (const chunk of previousRemainder.slice(changedCount)) {
    result.push({
      documentId,
      classification: 'removed',
      moved: false,
      previous: chunk,
    });
  }

  return result;
}

function countClassifications<T extends { classification: DeltaClassification }>(
  items: readonly T[],
  classification: DeltaClassification
) {
  return items.filter((item) => item.classification === classification).length;
}

export async function buildChangePreview(
  input: BuildChangePreviewInput
): Promise<ChangePreview> {
  if (
    input.activeManifest &&
    input.activeManifest.setId !== input.documentSet.id
  ) {
    throw new Error('Active snapshot manifest belongs to a different document set');
  }

  const selectedNotes = new Map(input.notes.map((note) => [note.id, note]));
  const frozenDocuments: FrozenPublishDocument[] = [];

  for (const documentId of input.documentSet.documentIds) {
    const note = selectedNotes.get(documentId);
    if (!note || note.deletedAt || note.type === 'folder') {
      throw new Error(`Publish document is unavailable: ${documentId}`);
    }
    const body = `${note.body}`;
    const chunks = chunkMarkdownSnapshot(documentId, body);
    frozenDocuments.push({
      documentId,
      title: note.title ? `${note.title}` : 'Untitled',
      body,
      tags: note.tags ? [...note.tags] : [],
      contentHash: await sha256Text(buildDocumentHashInput(body)),
      chunks: chunks.map((chunk) => ({
        ...chunk,
        headingPath: [...chunk.headingPath],
      })),
    });
  }

  const snapshot: FrozenPublishSnapshot = {
    setId: input.documentSet.id,
    setName: `${input.documentSet.name}`,
    chunkingPolicyVersion: CHUNKING_POLICY_VERSION,
    documents: frozenDocuments,
  };
  const previousDocuments = new Map(
    (input.activeManifest?.documents ?? []).map((document) => [
      document.documentId,
      document,
    ])
  );
  const documents: DocumentDelta[] = [];
  const chunks: ChunkDelta[] = [];

  for (const document of frozenDocuments) {
    const previous = previousDocuments.get(document.documentId);
    documents.push({
      documentId: document.documentId,
      title: document.title,
      classification: previous
        ? previous.contentHash === document.contentHash
          ? 'unchanged'
          : 'changed'
        : 'added',
      ...(previous ? { previousHash: previous.contentHash } : {}),
      currentHash: document.contentHash,
    });
    chunks.push(
      ...classifyChunks(document.documentId, previous?.chunks ?? [], document.chunks)
    );
    previousDocuments.delete(document.documentId);
  }

  for (const previous of previousDocuments.values()) {
    documents.push({
      documentId: previous.documentId,
      title: previous.title,
      classification: 'removed',
      previousHash: previous.contentHash,
    });
    chunks.push(
      ...previous.chunks.map((chunk): ChunkDelta => ({
        documentId: previous.documentId,
        classification: 'removed',
        moved: false,
        previous: chunk,
      }))
    );
  }

  const counts: ChangePreviewCounts = {
    documentsAdded: countClassifications(documents, 'added'),
    documentsChanged: countClassifications(documents, 'changed'),
    documentsRemoved: countClassifications(documents, 'removed'),
    documentsUnchanged: countClassifications(documents, 'unchanged'),
    chunksAdded: countClassifications(chunks, 'added'),
    chunksChanged: countClassifications(chunks, 'changed'),
    chunksRemoved: countClassifications(chunks, 'removed'),
    chunksUnchanged: countClassifications(chunks, 'unchanged'),
  };

  return deepFreeze({
    setId: input.documentSet.id,
    documents,
    chunks,
    counts,
    hasRemovals: counts.documentsRemoved > 0 || counts.chunksRemoved > 0,
    snapshot,
  });
}

export { normalizeNewlines };
