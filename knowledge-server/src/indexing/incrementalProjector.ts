import { chunkMarkdownSnapshot } from '../parser/sectionChunker.js';
import { CHUNKING_POLICY_VERSION } from '../types/protocol.js';
import { createProjectionId, hashChunk, hashDocument } from './chunkHasher.js';

export type DeltaClassification = 'added' | 'changed' | 'removed' | 'unchanged';

export interface ProjectionDocumentInput {
  documentId: string;
  title: string;
  body: string;
  tags?: readonly string[] | undefined;
}

export interface ProjectedChunk {
  occurrenceId: string;
  representationId: string;
  contentHash: string;
  chunkIndex: number;
  headingPath: string[];
  startLine: number;
  endLine: number;
  startOffset: number;
  endOffset: number;
  rawContent: string;
}

export interface ProjectedDocument {
  documentId: string;
  title: string;
  contentHash: string;
  chunks: ProjectedChunk[];
}

export interface ProjectionSnapshot {
  snapshotId: string;
  setId: string;
  chunkingPolicyVersion: string;
  documents: ProjectedDocument[];
}

export interface ProjectionDelta<T> {
  classification: DeltaClassification;
  previous?: T | undefined;
  current?: T | undefined;
}

export interface ProjectionSummary {
  documentsAdded: number;
  documentsChanged: number;
  documentsRemoved: number;
  documentsUnchanged: number;
  chunksAdded: number;
  chunksChanged: number;
  chunksRemoved: number;
  chunksUnchanged: number;
  mutations: number;
}

export interface ProjectionResult {
  candidate: ProjectionSnapshot;
  documentDeltas: ProjectionDelta<ProjectedDocument>[];
  chunkDeltas: ProjectionDelta<ProjectedChunk>[];
  summary: ProjectionSummary;
}

export interface ProjectIncrementallyInput {
  setId: string;
  documents: readonly ProjectionDocumentInput[];
  activeSnapshot: ProjectionSnapshot | null;
  snapshotId?: string | undefined;
}

function queueByHash(items: readonly ProjectedChunk[]) {
  const queues = new Map<string, ProjectedChunk[]>();
  for (const item of items) {
    const queue = queues.get(item.contentHash);
    if (queue) queue.push(item);
    else queues.set(item.contentHash, [item]);
  }
  return queues;
}

function classifyChunks(
  previous: readonly ProjectedChunk[],
  current: readonly ProjectedChunk[]
): ProjectionDelta<ProjectedChunk>[] {
  const previousByHash = queueByHash(previous);
  const unmatchedPrevious = new Set(previous);
  const unmatchedCurrent: ProjectedChunk[] = [];
  const deltas: ProjectionDelta<ProjectedChunk>[] = [];

  for (const chunk of current) {
    const match = previousByHash.get(chunk.contentHash)?.shift();
    if (!match) {
      unmatchedCurrent.push(chunk);
      continue;
    }
    unmatchedPrevious.delete(match);
    chunk.representationId = match.representationId;
    deltas.push({ classification: 'unchanged', previous: match, current: chunk });
  }

  const removed = [...unmatchedPrevious];
  const changedCount = Math.min(removed.length, unmatchedCurrent.length);
  for (let index = 0; index < changedCount; index += 1) {
    deltas.push({
      classification: 'changed',
      previous: removed[index],
      current: unmatchedCurrent[index],
    });
  }
  for (const chunk of unmatchedCurrent.slice(changedCount)) {
    deltas.push({ classification: 'added', current: chunk });
  }
  for (const chunk of removed.slice(changedCount)) {
    deltas.push({ classification: 'removed', previous: chunk });
  }
  return deltas;
}

function count<T>(deltas: readonly ProjectionDelta<T>[], classification: DeltaClassification) {
  return deltas.filter((delta) => delta.classification === classification).length;
}

export function projectIncrementally(input: ProjectIncrementallyInput): ProjectionResult {
  if (input.activeSnapshot && input.activeSnapshot.setId !== input.setId) {
    throw new Error('Active snapshot belongs to a different document set');
  }
  const previousDocuments = new Map(
    (input.activeSnapshot?.documents ?? []).map((document) => [document.documentId, document])
  );
  const documentDeltas: ProjectionDelta<ProjectedDocument>[] = [];
  const chunkDeltas: ProjectionDelta<ProjectedChunk>[] = [];
  const documents: ProjectedDocument[] = [];

  for (const source of input.documents) {
    const previous = previousDocuments.get(source.documentId);
    const chunks: ProjectedChunk[] = chunkMarkdownSnapshot(source.documentId, source.body).map(
      (chunk) => ({
        occurrenceId: chunk.occurrenceId,
        representationId: createProjectionId(),
        contentHash: hashChunk(chunk.rawContent),
        chunkIndex: chunk.chunkIndex,
        headingPath: [...chunk.headingPath],
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
        rawContent: chunk.rawContent,
      })
    );
    const current: ProjectedDocument = {
      documentId: source.documentId,
      title: source.title,
      contentHash: hashDocument(source.body),
      chunks,
    };
    documents.push(current);
    documentDeltas.push({
      classification: previous
        ? previous.contentHash === current.contentHash
          ? 'unchanged'
          : 'changed'
        : 'added',
      ...(previous ? { previous } : {}),
      current,
    });
    chunkDeltas.push(...classifyChunks(previous?.chunks ?? [], chunks));
    previousDocuments.delete(source.documentId);
  }

  for (const previous of previousDocuments.values()) {
    documentDeltas.push({ classification: 'removed', previous });
    chunkDeltas.push(
      ...previous.chunks.map((chunk): ProjectionDelta<ProjectedChunk> => ({
        classification: 'removed',
        previous: chunk,
      }))
    );
  }

  const summary: ProjectionSummary = {
    documentsAdded: count(documentDeltas, 'added'),
    documentsChanged: count(documentDeltas, 'changed'),
    documentsRemoved: count(documentDeltas, 'removed'),
    documentsUnchanged: count(documentDeltas, 'unchanged'),
    chunksAdded: count(chunkDeltas, 'added'),
    chunksChanged: count(chunkDeltas, 'changed'),
    chunksRemoved: count(chunkDeltas, 'removed'),
    chunksUnchanged: count(chunkDeltas, 'unchanged'),
    mutations: count(chunkDeltas, 'added') + count(chunkDeltas, 'changed') + count(chunkDeltas, 'removed'),
  };

  return {
    candidate: {
      snapshotId: input.snapshotId ?? createProjectionId(),
      setId: input.setId,
      chunkingPolicyVersion: CHUNKING_POLICY_VERSION,
      documents,
    },
    documentDeltas,
    chunkDeltas,
    summary,
  };
}
