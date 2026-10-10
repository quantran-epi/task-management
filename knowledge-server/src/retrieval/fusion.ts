import { sha256Hex } from '../indexing/chunkHashPolicy.js';
import type {
  ModalityKind,
  RetrievalItem,
  ChunkItem,
  EntityItem,
  EdgeItem,
} from '../types/retrievalProtocol.js';
import { RELATION_SEMANTICS } from '../graph/ontology.js';
import type { GraphConflictRecord } from '../types/graphProtocol.js';

/**
 * Standard RRF smoothing constant per D-17.
 */
export const RRF_K = 60;

/**
 * Content-free error code for candidate integrity mismatch.
 */
export const CANDIDATE_INTEGRITY_MISMATCH = 'CANDIDATE_INTEGRITY_MISMATCH';

/**
 * Modality priority order for tie-breaking per D-17/D-18.
 * vector > fulltext > graph
 */
const MODALITY_PRIORITY: readonly ModalityKind[] = ['vector', 'fulltext', 'graph'];

/**
 * Composite key helper: (type, id)
 */
export function getCompositeKey(item: RetrievalItem): string {
  return `${item.type}:${item.id}`;
}

export interface RankedModalityLists {
  readonly vector?: readonly RetrievalItem[] | undefined;
  readonly fulltext?: readonly RetrievalItem[] | undefined;
  readonly graph?: readonly RetrievalItem[] | undefined;
}

export interface FusedRetrievalResult {
  readonly items: RetrievalItem[];
  readonly totalCandidates: number;
}

/**
 * Validates immutable identity/provenance fields between two occurrences of the same candidate.
 */
function assertCandidateIntegrity(existing: RetrievalItem, incoming: RetrievalItem): void {
  if (existing.type !== incoming.type) {
    throw new Error(CANDIDATE_INTEGRITY_MISMATCH);
  }
  if (existing.snapshotId !== incoming.snapshotId) {
    throw new Error(CANDIDATE_INTEGRITY_MISMATCH);
  }

  if (existing.type === 'chunk' && incoming.type === 'chunk') {
    if (
      existing.sourceDocumentId !== incoming.sourceDocumentId ||
      existing.sectionAnchor !== incoming.sectionAnchor ||
      existing.lineStart !== incoming.lineStart ||
      existing.lineEnd !== incoming.lineEnd
    ) {
      throw new Error(CANDIDATE_INTEGRITY_MISMATCH);
    }
  } else if (existing.type === 'entity' && incoming.type === 'entity') {
    if (
      existing.urn !== incoming.urn ||
      existing.canonicalName !== incoming.canonicalName ||
      existing.kind !== incoming.kind
    ) {
      throw new Error(CANDIDATE_INTEGRITY_MISMATCH);
    }
  } else if (existing.type === 'edge' && incoming.type === 'edge') {
    if (
      existing.factKey !== incoming.factKey ||
      existing.sourceUrn !== incoming.sourceUrn ||
      existing.relationType !== incoming.relationType ||
      existing.targetUrn !== incoming.targetUrn
    ) {
      throw new Error(CANDIDATE_INTEGRITY_MISMATCH);
    }
  }
}

/**
 * Merges modality sets in locked priority order: vector, fulltext, graph.
 */
function mergeModalities(
  modalitiesA: readonly ModalityKind[],
  modalitiesB: readonly ModalityKind[]
): ModalityKind[] {
  const set = new Set<ModalityKind>([...modalitiesA, ...modalitiesB]);
  return MODALITY_PRIORITY.filter((m) => set.has(m));
}

interface AccumulatedCandidate {
  readonly compositeKey: string;
  item: RetrievalItem;
  score: number;
  seenModalities: Set<ModalityKind>;
  highestPriorityModalityIndex: number;
}

/**
 * Pure Reciprocal Rank Fusion (RRF) with composite deduplication and deterministic tie-breaking.
 * Default limit = 20, defensive clamping = 10..50.
 */
export function fuseRetrievalCandidates(
  rankedLists: RankedModalityLists,
  limit: number = 20
): FusedRetrievalResult {
  const clampedLimit = Math.max(10, Math.min(50, limit));
  const candidates = new Map<string, AccumulatedCandidate>();

  for (let mIdx = 0; mIdx < MODALITY_PRIORITY.length; mIdx++) {
    const modality = MODALITY_PRIORITY[mIdx]!;
    const list = rankedLists[modality];
    if (!list || list.length === 0) continue;

    const seenInThisModality = new Set<string>();

    for (let rankIndex = 0; rankIndex < list.length; rankIndex++) {
      const item = list[rankIndex]!;
      const key = getCompositeKey(item);

      // Duplicate IDs within one modality contribute once
      if (seenInThisModality.has(key)) {
        continue;
      }
      seenInThisModality.add(key);

      const rrfContribution = 1 / (RRF_K + (rankIndex + 1));

      const existing = candidates.get(key);
      if (!existing) {
        candidates.set(key, {
          compositeKey: key,
          item: {
            ...item,
            modalitiesContributed: [modality],
          },
          score: rrfContribution,
          seenModalities: new Set([modality]),
          highestPriorityModalityIndex: mIdx,
        });
      } else {
        assertCandidateIntegrity(existing.item, item);
        existing.score += rrfContribution;
        existing.seenModalities.add(modality);

        // Retain payload from highest-priority contributing modality
        if (mIdx < existing.highestPriorityModalityIndex) {
          existing.item = {
            ...item,
            modalitiesContributed: mergeModalities(
              existing.item.modalitiesContributed,
              [modality]
            ),
          };
          existing.highestPriorityModalityIndex = mIdx;
        } else {
          existing.item = {
            ...existing.item,
            modalitiesContributed: mergeModalities(
              existing.item.modalitiesContributed,
              [modality]
            ),
          };
        }
      }
    }
  }

  const candidateArray = Array.from(candidates.values());
  const totalCandidates = candidateArray.length;

  // Tie-breaking:
  // 1. RRF score descending
  // 2. Modalities contributed count descending
  // 3. Modality priority (vector > fulltext > graph)
  // 4. Lexicographical composite ID
  candidateArray.sort((a, b) => {
    if (Math.abs(b.score - a.score) > 1e-12) {
      return b.score - a.score;
    }
    const countDiff = b.seenModalities.size - a.seenModalities.size;
    if (countDiff !== 0) {
      return countDiff;
    }
    const priorityDiff = a.highestPriorityModalityIndex - b.highestPriorityModalityIndex;
    if (priorityDiff !== 0) {
      return priorityDiff;
    }
    return a.compositeKey.localeCompare(b.compositeKey);
  });

  const sliced = candidateArray.slice(0, clampedLimit).map((c) => ({
    ...c.item,
    score: c.score,
  }));

  return {
    items: sliced,
    totalCandidates,
  };
}
