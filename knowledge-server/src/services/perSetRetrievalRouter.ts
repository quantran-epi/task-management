/**
 * Per-set retrieval router (Phase 28, D-02).
 *
 * A published set stays searchable when the graph/retrieval generation is
 * unavailable: the router falls back to the server-local snapshot-lexical
 * modality. Readiness is decided by real evidence, never by a fabricated
 * `gsnap_...` placeholder.
 */
import type { SnapshotStore } from '../indexing/snapshotStore.js';
import { retrieveFromPublishedSnapshot } from './snapshotLexicalRetrieval.js';
import {
  RetrievalResponseSchema,
  type RetrievalResponse,
} from '../types/retrievalProtocol.js';

export interface PerSetRetrievalRequest {
  query: string;
  limit: number;
  includeInferred: boolean;
  recentTurns: unknown[];
}

export interface PerSetRetrieverDeps {
  snapshotStore: Pick<SnapshotStore, 'getActiveSnapshot'>;
  retrievalService?: {
    retrieve(
      setId: string,
      request: unknown,
      options?: { signal?: AbortSignal | undefined }
    ): Promise<RetrievalResponse>;
  } | undefined;
}

export interface PerSetRetriever {
  retrievePerSet(
    setId: string,
    request: PerSetRetrievalRequest,
    signal?: AbortSignal
  ): Promise<RetrievalResponse>;
}

function allModalitiesUnavailable(setId: string): RetrievalResponse {
  return RetrievalResponseSchema.parse({
    outcome: 'NO_EVIDENCE',
    snapshotId: 'gsnap_00000000',
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
      fulltext: { status: 'unavailable', latencyMs: 0, itemCount: 0, reason: 'NO_SEARCHABLE_SNAPSHOT' },
      vector: { status: 'unavailable', latencyMs: 0, itemCount: 0, reason: 'NO_RETRIEVAL_GENERATION' },
      graph: { status: 'unavailable', latencyMs: 0, itemCount: 0, reason: 'NO_RETRIEVAL_GENERATION' },
    },
    diagnostics: {
      degraded: true,
      degradedReasons: ['NO_SEARCHABLE_SNAPSHOT'],
    },
    planTrace: { fastPath: true, degradedFallback: false },
    reason: 'NO_SEARCHABLE_SNAPSHOT',
    suggestedRefinements: [
      `Set ${setId} has no active published snapshot or retrieval generation.`,
    ],
  });
}

export function createPerSetRetriever(deps: PerSetRetrieverDeps): PerSetRetriever {
  return {
    async retrievePerSet(setId, request, signal) {
      if (deps.retrievalService) {
        const fromGraph = await deps.retrievalService.retrieve(
          setId,
          {
            query: request.query,
            limit: request.limit,
            includeInferred: request.includeInferred,
            recentTurns: request.recentTurns,
          },
          signal ? { signal } : undefined
        );
        const hasEvidence =
          fromGraph.items.length > 0 ||
          fromGraph.paths.length > 0 ||
          fromGraph.conflictGroups.length > 0;
        if (hasEvidence) return fromGraph;
        if (fromGraph.reason !== 'PINNED_SNAPSHOT_UNAVAILABLE') return fromGraph;
      }

      const snapshot = deps.snapshotStore.getActiveSnapshot(setId);
      if (snapshot) {
        return retrieveFromPublishedSnapshot(snapshot, request, signal ? { signal } : undefined);
      }
      return allModalitiesUnavailable(setId);
    },
  };
}
