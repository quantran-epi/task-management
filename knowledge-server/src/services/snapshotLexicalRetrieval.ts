/**
 * Server-local snapshot lexical retrieval (Phase 28).
 *
 * Publishes evidence from an active ProjectionSnapshot using Okapi BM25, with
 * Vietnamese diacritic normalization mirroring `src/utils/bm25.ts`. That client
 * module cannot be imported here because the server tsconfig rootDir is `src`.
 * Ranked text is emitted strictly as inert evidence data (T-28-01).
 */
import type { ProjectionSnapshot, ProjectedChunk, ProjectedDocument } from '../indexing/incrementalProjector.js';
import {
  RetrievalResponseSchema,
  type RetrievalResponse,
  type RetrievalItem,
} from '../types/retrievalProtocol.js';

const K1 = 1.2;
const B = 0.75;
const TITLE_WEIGHT = 3;

export interface SnapshotLexicalRequest {
  query: string;
  limit: number;
}

export interface SnapshotLexicalOptions {
  signal?: AbortSignal | undefined;
}

/** Normalizes Vietnamese text to lowercase base Latin (NFD, strip marks, đ→d). */
export function normalizeVietnamese(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/** Tokenizes text into lowercase alphanumeric words with length > 1. */
export function tokenize(text: string): string[] {
  if (!text) return [];
  return normalizeVietnamese(text)
    .split(/[^a-z0-9_]+/i)
    .filter((token) => token.length > 1);
}

type Candidate = {
  chunk: ProjectedChunk;
  document: ProjectedDocument;
  tokens: string[];
  score: number;
};

function weightedTokens(title: string, body: string): string[] {
  const titleTokens = tokenize(title);
  const bodyTokens = tokenize(body);
  return [
    ...Array.from({ length: TITLE_WEIGHT }, () => titleTokens).flat(),
    ...bodyTokens,
  ];
}

function rankChunks(snapshot: ProjectionSnapshot, query: string): Candidate[] {
  const queryTokens = Array.from(new Set(tokenize(query)));
  const candidates: Candidate[] = [];
  if (queryTokens.length === 0 || snapshot.documents.length === 0) return candidates;

  for (const document of snapshot.documents) {
    for (const chunk of document.chunks) {
      const tokens = weightedTokens(document.title, chunk.rawContent);
      candidates.push({ chunk, document, tokens, score: 0 });
    }
  }
  if (candidates.length === 0) return candidates;

  const totalLength = candidates.reduce((sum, candidate) => sum + candidate.tokens.length, 0);
  const avgdl = totalLength / candidates.length;
  const n = candidates.length;

  const documentFrequencies = new Map<string, number>();
  for (const term of queryTokens) {
    let df = 0;
    for (const candidate of candidates) {
      if (candidate.tokens.includes(term)) df += 1;
    }
    documentFrequencies.set(term, df);
  }

  for (const candidate of candidates) {
    const termCounts = new Map<string, number>();
    for (const token of candidate.tokens) {
      termCounts.set(token, (termCounts.get(token) ?? 0) + 1);
    }
    for (const term of queryTokens) {
      const df = documentFrequencies.get(term) ?? 0;
      if (df === 0) continue;
      const tf = termCounts.get(term) ?? 0;
      if (tf === 0) continue;
      const idf = Math.log((n - df + 0.5) / (df + 0.5) + 1);
      const numerator = tf * (K1 + 1);
      const denominator = tf + K1 * (1 - B + (B * (avgdl > 0 ? candidate.tokens.length / avgdl : 1)));
      candidate.score += idf * (numerator / denominator);
    }
  }

  return candidates
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.chunk.occurrenceId.localeCompare(b.chunk.occurrenceId));
}

/**
 * Empty lexical envelope. Two distinct shapes:
 * - `structural: true` — the fulltext modality ran successfully but matched no
 *   chunks. Vector/graph are truthfully disclosed as absent (no retrieval
 *   generation, D-02), but this is NOT a degraded search: the federated outcome
 *   must stay NO_EVIDENCE so the client routes to D-15 query-refinement guidance.
 * - `structural: false` — no search ran at all (e.g. aborted); all modalities
 *   are unavailable and the envelope is genuinely degraded.
 */
function emptyEnvelope(
  snapshot: ProjectionSnapshot,
  reason: string,
  options: { structural?: boolean } = {}
): RetrievalResponse {
  const structural = options.structural === true;
  return RetrievalResponseSchema.parse({
    outcome: 'NO_EVIDENCE',
    snapshotId: snapshot.snapshotId,
    embeddingProvider: {
      provider: 'local-onnx',
      model: 'snapshot-lexical',
      revision: 'none',
      dimensions: 384,
      policyVersion: 'none',
    },
    items: [],
    paths: [],
    conflictGroups: [],
    totalCandidates: 0,
    modalitiesUsed: [],
    modalityStatus: {
      fulltext: structural
        ? { status: 'ok', latencyMs: 0, itemCount: 0, reason: 'NO_MATCHING_CHUNKS' }
        : { status: 'unavailable', latencyMs: 0, itemCount: 0, reason: 'NO_RETRIEVAL_GENERATION' },
      vector: { status: 'unavailable', latencyMs: 0, itemCount: 0, reason: 'NO_RETRIEVAL_GENERATION' },
      graph: { status: 'unavailable', latencyMs: 0, itemCount: 0, reason: 'NO_RETRIEVAL_GENERATION' },
    },
    diagnostics: structural
      ? { degraded: false }
      : { degraded: true, degradedReasons: [reason] },
    planTrace: { fastPath: true, degradedFallback: false },
    reason,
    suggestedRefinements: ['Try broader query terms or publish more documents to this set.'],
  });
}

/**
 * Retrieves from a published snapshot with no graph/retrieval generation.
 * The returned envelope always names the real published snapshot id.
 */
export function retrieveFromPublishedSnapshot(
  snapshot: ProjectionSnapshot,
  request: SnapshotLexicalRequest,
  options?: SnapshotLexicalOptions
): RetrievalResponse {
  if (options?.signal?.aborted) {
    return emptyEnvelope(snapshot, 'ABORTED');
  }

  const ranked = rankChunks(snapshot, request.query);
  const limit = Math.min(Math.max(10, Math.floor(request.limit)), 50);
  const items: RetrievalItem[] = ranked.slice(0, limit).map(({ chunk, document, score }) => ({
    type: 'chunk',
    id: chunk.occurrenceId,
    score,
    modalitiesContributed: ['fulltext'],
    sourceDocumentId: document.documentId,
    sourceDocumentTitle: document.title,
    sectionAnchor: chunk.headingPath.join(' > ') || 'root',
    lineStart: Math.max(1, chunk.startLine),
    lineEnd: Math.max(1, chunk.endLine),
    rawSnippet: chunk.rawContent,
    publishedContentHash: document.contentHash,
    snapshotId: snapshot.snapshotId,
    hasConflict: false,
  }));

  if (items.length === 0) {
    // A successful lexical search with zero hits is not an unavailable modality.
    return emptyEnvelope(snapshot, 'NO_MATCHING_CHUNKS', { structural: true });
  }

  return RetrievalResponseSchema.parse({
    outcome: 'READY',
    snapshotId: snapshot.snapshotId,
    embeddingProvider: {
      provider: 'local-onnx',
      model: 'snapshot-lexical',
      revision: 'none',
      dimensions: 384,
      policyVersion: 'none',
    },
    items,
    paths: [],
    conflictGroups: [],
    totalCandidates: ranked.length,
    modalitiesUsed: ['fulltext'],
    modalityStatus: {
      fulltext: { status: 'ok', latencyMs: 0, itemCount: items.length, reason: 'SNAPSHOT_LEXICAL' },
      vector: { status: 'unavailable', latencyMs: 0, itemCount: 0, reason: 'NO_RETRIEVAL_GENERATION' },
      graph: { status: 'unavailable', latencyMs: 0, itemCount: 0, reason: 'NO_RETRIEVAL_GENERATION' },
    },
    diagnostics: { degraded: false },
    planTrace: { fastPath: true, degradedFallback: false },
  });
}
