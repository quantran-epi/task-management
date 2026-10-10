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

export interface MissingSupportingChunkDiagnostic {
  readonly code: 'MISSING_SUPPORTING_CHUNK';
  readonly edgeId: string;
  readonly chunkId: string;
}

export interface TagRetrievalConflictsOptions {
  readonly snapshotId: string;
  readonly phase17Conflicts?: readonly GraphConflictRecord[] | undefined;
  readonly candidatePool?: readonly RetrievalItem[] | undefined;
}

export interface TaggedRetrievalResult {
  readonly items: RetrievalItem[];
  readonly diagnostics: readonly MissingSupportingChunkDiagnostic[];
}

/**
 * Tags conflicting retrieval candidates and performs citation closure per D-21 and D-22.
 * 1. Divergent targets on FUNCTIONAL relations share a stable 32-hex conflictGroupId.
 * 2. Phase 17 conflicts map to a stable 32-hex conflictGroupId across edge and supporting chunks.
 * 3. Selected edges must have their supportingChunkIds closed under the returned cutoff,
 *    replacing lowest-ranked non-supporting candidates deterministically from candidatePool,
 *    or emitting MISSING_SUPPORTING_CHUNK diagnostics.
 */
export function tagRetrievalConflicts(
  selectedItems: readonly RetrievalItem[],
  options: TagRetrievalConflictsOptions
): TaggedRetrievalResult {
  const { snapshotId, phase17Conflicts = [], candidatePool = selectedItems } = options;
  const diagnostics: MissingSupportingChunkDiagnostic[] = [];

  // Clone items to preserve immutability of inputs
  const items: RetrievalItem[] = selectedItems.map((item) => ({ ...item }));

  // Map candidate pool by composite key for quick lookup during citation closure
  const candidatePoolByKey = new Map<string, RetrievalItem>();
  for (const c of candidatePool) {
    candidatePoolByKey.set(getCompositeKey(c), c);
  }

  // --- Step 1: Citation Closure ---
  // Edges selected in items must have their supportingChunkIds present in items.
  const selectedKeys = new Set<string>(items.map(getCompositeKey));
  const requiredChunkIds = new Set<string>();

  for (const item of items) {
    if (item.type === 'edge' && item.supportingChunkIds) {
      for (const chunkId of item.supportingChunkIds) {
        requiredChunkIds.add(chunkId);
      }
    }
  }

  for (const item of items) {
    if (item.type === 'edge' && item.supportingChunkIds) {
      for (const chunkId of item.supportingChunkIds) {
        const chunkCompositeKey = `chunk:${chunkId}`;
        if (!selectedKeys.has(chunkCompositeKey)) {
          // Check if candidatePool has this chunk
          const candidateChunk = candidatePoolByKey.get(chunkCompositeKey);
          if (candidateChunk) {
            // Find lowest-ranked item in items that is NOT an edge and NOT a required supporting chunk
            let replaceIndex = -1;
            for (let idx = items.length - 1; idx >= 0; idx--) {
              const candidateToEvict = items[idx]!;
              if (candidateToEvict.type === 'edge') continue;
              if (candidateToEvict.type === 'chunk' && requiredChunkIds.has(candidateToEvict.id)) {
                continue;
              }
              replaceIndex = idx;
              break;
            }

            if (replaceIndex !== -1) {
              const evicted = items[replaceIndex]!;
              selectedKeys.delete(getCompositeKey(evicted));
              items[replaceIndex] = { ...candidateChunk };
              selectedKeys.add(chunkCompositeKey);
            } else {
              // Cannot evict, record diagnostic
              diagnostics.push({
                code: 'MISSING_SUPPORTING_CHUNK',
                edgeId: item.id,
                chunkId,
              });
            }
          } else {
            // Genuine missing chunk in pool
            diagnostics.push({
              code: 'MISSING_SUPPORTING_CHUNK',
              edgeId: item.id,
              chunkId,
            });
          }
        }
      }
    }
  }

  // --- Step 2: Phase 17 Conflict Propagation ---
  // If phase17Conflicts provided, map factKeyA and factKeyB to stable conflictGroupId
  const conflictGroupMap = new Map<string, string>(); // factKey or chunkId -> conflictGroupId

  for (const conflict of phase17Conflicts) {
    const rawSeed = `PHASE17_CONFLICT:${snapshotId}:${conflict.conflictId}:${conflict.factKeyA}:${conflict.factKeyB}`;
    const groupId = sha256Hex(rawSeed).slice(0, 32);

    conflictGroupMap.set(conflict.factKeyA, groupId);
    conflictGroupMap.set(conflict.factKeyB, groupId);
  }

  // --- Step 3: Divergent Functional Targets (D-21) ---
  const functionalEdgeBuckets = new Map<string, EdgeItem[]>();
  for (const item of items) {
    if (item.type === 'edge') {
      const semanticSlot = RELATION_SEMANTICS[item.relationType];
      if (semanticSlot === 'FUNCTIONAL') {
        const bucketKey = `${item.sourceUrn}:${item.relationType}`;
        const bucket = functionalEdgeBuckets.get(bucketKey) || [];
        bucket.push(item);
        functionalEdgeBuckets.set(bucketKey, bucket);
      }
    }
  }

  for (const [bucketKey, edgeList] of functionalEdgeBuckets.entries()) {
    if (edgeList.length > 1) {
      const targetUrns = new Set(edgeList.map((e) => e.targetUrn));
      if (targetUrns.size > 1) {
        // Divergent functional targets
        const rawSeed = `CONFLICT:${snapshotId}:${bucketKey}`;
        const groupId = sha256Hex(rawSeed).slice(0, 32);
        for (const e of edgeList) {
          conflictGroupMap.set(e.factKey, groupId);
        }
      }
    }
  }

  // Propagate conflict tags to items
  // Note: Also propagate to supporting chunks referenced by conflicting edges
  const conflictingChunkIds = new Map<string, string>(); // chunkId -> conflictGroupId

  for (const item of items) {
    if (item.type === 'edge') {
      const groupId = conflictGroupMap.get(item.factKey);
      if (groupId) {
        item.hasConflict = true;
        item.conflictGroupId = groupId;
        for (const chunkId of item.supportingChunkIds) {
          conflictingChunkIds.set(chunkId, groupId);
        }
      }
    }
  }

  for (const item of items) {
    if (item.type === 'chunk') {
      const groupId = conflictingChunkIds.get(item.id);
      if (groupId) {
        item.hasConflict = true;
        item.conflictGroupId = groupId;
      }
    }
  }

  return {
    items,
    diagnostics,
  };
}

