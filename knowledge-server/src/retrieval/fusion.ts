import { sha256Hex } from '../indexing/chunkHashPolicy.js';
import type {
  ModalityKind,
  RetrievalItem,
  ChunkItem,
  EdgeItem,
  OrderedPath,
  ConflictGroup,
} from '../types/retrievalProtocol.js';
import type { OrderedPathCandidate } from './graphTraversal.js';
import { RELATION_SEMANTICS } from '../graph/ontology.js';
import type { EvidenceClassification, GraphConflictRecord } from '../types/graphProtocol.js';

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

/**
 * Maximum share of the result limit that protected graph packages may occupy
 * when textual evidence is present (D-17, T-24-09).
 */
export const PROTECTED_GRAPH_QUOTA_RATIO = 0.6;

/**
 * Citation-closed unit of graph evidence: seed/target entities, the edge(s) or
 * path that connects them, and the chunks that support every hop.
 * Admission is atomic: a package is either wholly present or wholly absent.
 */
export interface ProtectedGraphPackage {
  readonly seedUrns: readonly string[];
  readonly targetUrns: readonly string[];
  readonly edgeIds: readonly string[];
  readonly pathId: string | null;
  readonly supportingChunkIds: readonly string[];
  /** Deterministic total-order key derived by rankGraphPackages. */
  readonly pathRankKey: string;
}

export interface BuildProtectedGraphPackagesInput {
  readonly snapshotId: string;
  readonly chunks: readonly ChunkItem[];
  readonly edges: readonly EdgeItem[];
  readonly paths: readonly OrderedPathCandidate[];
}

export interface BuildProtectedGraphPackagesResult {
  readonly packages: readonly ProtectedGraphPackage[];
  readonly diagnostics: readonly MissingSupportingChunkDiagnostic[];
}

function stableStringCompare(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function packageIdentity(
  seedUrns: readonly string[],
  edgeIds: readonly string[]
): string {
  return `${[...seedUrns].sort().join('|')}::${[...edgeIds].sort().join('|')}`;
}

/**
 * Derives graph packages from citation-closed path candidates plus orphan edges.
 * Rejects packages whose snapshot differs from the pinned snapshot or whose hops
 * carry no supporting citation, and reports missing supporting chunks instead of
 * repairing the package (T-24-07).
 */
export function buildProtectedGraphPackages(
  input: BuildProtectedGraphPackagesInput
): BuildProtectedGraphPackagesResult {
  const edgeByFactKey = new Map(input.edges.map((edge) => [edge.factKey, edge]));
  const chunkIds = new Set(input.chunks.map((chunk) => chunk.id));
  const diagnostics: MissingSupportingChunkDiagnostic[] = [];
  const packages: ProtectedGraphPackage[] = [];
  const consumedEdges = new Set<string>();

  for (const path of input.paths) {
    if (path.snapshotId !== input.snapshotId) continue;
    if (path.edgeFactKeys.length === 0) continue;
    if (path.nodeUrns.length !== path.edgeFactKeys.length + 1) continue;
    if (path.hopSupportingChunkIds.some((ids) => ids.length === 0)) continue;

    let citationClosed = true;
    const supporting: string[] = [];
    for (let hop = 0; hop < path.edgeFactKeys.length; hop++) {
      const factKey = path.edgeFactKeys[hop]!;
      const edge = edgeByFactKey.get(factKey);
      if (!edge || edge.snapshotId !== input.snapshotId) {
        citationClosed = false;
        break;
      }
      for (const chunkId of path.hopSupportingChunkIds[hop]!) {
        if (!chunkIds.has(chunkId)) {
          diagnostics.push({ code: 'MISSING_SUPPORTING_CHUNK', edgeId: factKey, chunkId });
          citationClosed = false;
        }
        if (!supporting.includes(chunkId)) supporting.push(chunkId);
      }
      consumedEdges.add(factKey);
    }
    if (!citationClosed || supporting.length === 0) continue;

    const seedUrns = [path.nodeUrns[0]!];
    const targetUrns = path.nodeUrns.slice(1);
    packages.push({
      seedUrns,
      targetUrns,
      edgeIds: [...path.edgeFactKeys],
      pathId: packageIdentity(seedUrns, path.edgeFactKeys),
      supportingChunkIds: supporting,
      pathRankKey: '',
    });
  }

  for (const edge of input.edges) {
    if (consumedEdges.has(edge.factKey)) continue;
    if (edge.snapshotId !== input.snapshotId) continue;
    if (edge.supportingChunkIds.length === 0) continue;

    let citationClosed = true;
    for (const chunkId of edge.supportingChunkIds) {
      if (!chunkIds.has(chunkId)) {
        diagnostics.push({ code: 'MISSING_SUPPORTING_CHUNK', edgeId: edge.factKey, chunkId });
        citationClosed = false;
      }
    }
    if (!citationClosed) continue;

    const seedUrns = [edge.sourceUrn];
    packages.push({
      seedUrns,
      targetUrns: [edge.targetUrn],
      edgeIds: [edge.factKey],
      pathId: null,
      supportingChunkIds: [...edge.supportingChunkIds],
      pathRankKey: '',
    });
  }

  return { packages, diagnostics };
}

export interface GraphPackageRankContext {
  readonly selectedRelations: readonly string[];
  readonly includeInferred: boolean;
  readonly relationOf: (factKey: string) => string | undefined;
  readonly evidenceStrengthOf: (factKey: string) => EvidenceClassification | undefined;
}

interface ScoredPackage {
  readonly pkg: ProtectedGraphPackage;
  readonly intentRelevance: number;
  readonly answerability: number;
  readonly evidenceStrength: number;
  readonly pathLength: number;
  readonly pathRankKey: string;
}

/**
 * Deterministic total order over graph packages (D-18):
 * intent relevance -> answerability -> evidence strength -> shorter path -> stable identity.
 * Neo4j return order is never an input. No localeCompare: fixed byte order only.
 */
export function rankGraphPackages(
  packages: readonly ProtectedGraphPackage[],
  context: GraphPackageRankContext
): ProtectedGraphPackage[] {
  const selected = new Set(context.selectedRelations);
  const strengthOf = (factKey: string): number => {
    const classification = context.evidenceStrengthOf(factKey);
    if (classification === 'OBSERVED' || classification === 'BUSINESS_APPROVED') return 1;
    if (classification === 'INFERRED') return -1;
    return 0;
  };

  const scored: ScoredPackage[] = packages.map((pkg) => {
    let intentRelevance = 0;
    let evidenceStrength = 0;
    for (const factKey of pkg.edgeIds) {
      const relation = context.relationOf(factKey);
      if (relation && selected.has(relation)) intentRelevance++;
      evidenceStrength += strengthOf(factKey);
    }
    if (!context.includeInferred) {
      evidenceStrength = Math.max(0, evidenceStrength);
    }
    const answerability = new Set(pkg.targetUrns).size + pkg.edgeIds.length;
    const pathLength = pkg.edgeIds.length;
    const identity = `${pkg.seedUrns.join('|')}::${pkg.edgeIds.join('|')}::${pkg.pathId ?? ''}`;
    const pathRankKey =
      `i${String(intentRelevance).padStart(3, '0')}` +
      `-a${String(answerability).padStart(3, '0')}` +
      `-e${String(evidenceStrength + 100).padStart(3, '0')}` +
      `-l${String(pathLength).padStart(3, '0')}` +
      `-${identity}`;
    return { pkg, intentRelevance, answerability, evidenceStrength, pathLength, pathRankKey };
  });

  scored.sort((a, b) => {
    if (a.intentRelevance !== b.intentRelevance) return b.intentRelevance - a.intentRelevance;
    if (a.answerability !== b.answerability) return b.answerability - a.answerability;
    if (a.evidenceStrength !== b.evidenceStrength) return b.evidenceStrength - a.evidenceStrength;
    if (a.pathLength !== b.pathLength) return a.pathLength - b.pathLength;
    return stableStringCompare(a.pathRankKey, b.pathRankKey);
  });

  return scored.map((entry) => ({ ...entry.pkg, pathRankKey: entry.pathRankKey }));
}

/** Member composite keys of a package, in stable presentation order. */
export function protectedPackageMembers(pkg: ProtectedGraphPackage): string[] {
  const keys: string[] = [];
  const push = (key: string) => {
    if (!keys.includes(key)) keys.push(key);
  };
  for (const urn of pkg.seedUrns) push(`entity:${urn}`);
  for (const urn of pkg.targetUrns) push(`entity:${urn}`);
  for (const factKey of pkg.edgeIds) push(`edge:${factKey}`);
  for (const chunkId of pkg.supportingChunkIds) push(`chunk:${chunkId}`);
  return keys;
}

export interface FusedRetrievalResult {
  readonly items: RetrievalItem[];
  readonly totalCandidates: number;
}

export interface FusionOptions {
  /** Ranked packages admitted atomically before RRF fill (D-16, D-17). */
  readonly protectedGraphPackages?: readonly ProtectedGraphPackage[] | undefined;
}

const CLASSIFICATION_STRENGTH = {
  BUSINESS_APPROVED: 0,
  OBSERVED: 1,
  INFERRED: 2,
} as const;

/**
 * Converts traversal candidates to response paths only when every hop citation survived fusion.
 */
export function closeOrderedPaths(
  candidates: readonly OrderedPathCandidate[],
  finalItems: readonly RetrievalItem[]
): OrderedPath[] {
  const returnedChunkIds = new Set(
    finalItems.filter((item) => item.type === 'chunk').map((item) => item.id)
  );

  return candidates.flatMap((candidate, index) => {
    const survivingHops = candidate.hopSupportingChunkIds.map((hopIds) =>
      hopIds.filter((id) => returnedChunkIds.has(id))
    );

    if (
      survivingHops.length === 0 ||
      survivingHops.some((hop) => hop.length === 0)
    ) {
      return [];
    }

    const classification = candidate.hopClassifications.reduce((weakest, current) =>
      CLASSIFICATION_STRENGTH[current] > CLASSIFICATION_STRENGTH[weakest] ? current : weakest
    );

    return [{
      pathId: `P${index + 1}`,
      snapshotId: candidate.snapshotId,
      nodeUrns: candidate.nodeUrns,
      edgeFactKeys: candidate.edgeFactKeys,
      hopClassifications: candidate.hopClassifications,
      hopCitationIds: survivingHops,
      hasConflict: candidate.hasConflict,
      classification,
    }];
  });
}

/** Conflict groups default to unknown scope unless structured metadata proves otherwise. */
export function buildConflictGroups(items: readonly RetrievalItem[]): ConflictGroup[] {
  const groupIds = new Set(
    items.flatMap((item) => item.conflictGroupId ? [item.conflictGroupId] : [])
  );

  return [...groupIds].sort().map((conflictGroupId) => ({
    conflictGroupId,
    dimension: 'Unknown',
    scopeProof: null,
  }));
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
      existing.sourceDocumentTitle !== incoming.sourceDocumentTitle ||
      existing.sectionAnchor !== incoming.sectionAnchor ||
      existing.lineStart !== incoming.lineStart ||
      existing.lineEnd !== incoming.lineEnd ||
      existing.publishedContentHash !== incoming.publishedContentHash
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
  limit: number = 20,
  options?: FusionOptions
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
    return stableStringCompare(a.compositeKey, b.compositeKey);
  });

  const packages = options?.protectedGraphPackages ?? [];
  const sliced = packages.length > 0
    ? admitProtectedPackages(candidateArray, packages, clampedLimit)
    : candidateArray.slice(0, clampedLimit).map((c) => ({
        ...c.item,
        score: c.score,
      }));

  return {
    items: sliced,
    totalCandidates,
  };
}

/**
 * Admits whole graph packages ahead of RRF fill while respecting a bounded quota.
 * A package is never split; the quota expands to the full limit only when no
 * text candidate exists (D-17, T-24-09).
 */
function admitProtectedPackages(
  candidateArray: readonly AccumulatedCandidate[],
  packages: readonly ProtectedGraphPackage[],
  limit: number
): RetrievalItem[] {
  const byKey = new Map(candidateArray.map((candidate) => [candidate.compositeKey, candidate]));
  const hasTextCandidate = candidateArray.some(
    (candidate) => candidate.item.type === 'chunk'
  );
  const quota = hasTextCandidate
    ? Math.max(1, Math.floor(limit * PROTECTED_GRAPH_QUOTA_RATIO))
    : limit;

  const admittedKeys = new Set<string>();
  const admitted: RetrievalItem[] = [];

  for (const pkg of packages) {
    const members = protectedPackageMembers(pkg);
    if (members.length === 0) continue;
    // Every member must exist in the candidate pool and share the pinned snapshot.
    const candidates = members.map((key) => byKey.get(key));
    if (candidates.some((candidate) => candidate === undefined)) continue;
    const snapshotId = candidates[0]!.item.snapshotId;
    if (snapshotId && candidates.some((candidate) => candidate!.item.snapshotId !== snapshotId)) {
      continue;
    }
    if (admitted.length + members.length > quota) continue;
    if (admitted.length + members.length > limit) continue;
    for (let i = 0; i < members.length; i++) {
      const key = members[i]!;
      if (admittedKeys.has(key)) continue;
      admittedKeys.add(key);
      const candidate = candidates[i]!;
      admitted.push({ ...candidate.item, score: candidate.score });
    }
  }

  for (const candidate of candidateArray) {
    if (admitted.length >= limit) break;
    if (admittedKeys.has(candidate.compositeKey)) continue;
    admittedKeys.add(candidate.compositeKey);
    admitted.push({ ...candidate.item, score: candidate.score });
  }

  // Textual evidence must never be fully crowded out by graph items (D-17).
  if (hasTextCandidate && !admitted.some((item) => item.type === 'chunk')) {
    const firstText = candidateArray.find((candidate) => candidate.item.type === 'chunk');
    if (firstText && !admittedKeys.has(firstText.compositeKey)) {
      if (admitted.length >= limit) {
        const evicted = admitted.pop();
        if (evicted) admittedKeys.delete(getCompositeKey(evicted));
      }
      admittedKeys.add(firstText.compositeKey);
      admitted.push({ ...firstText.item, score: firstText.score });
    }
  }

  return admitted;
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

export interface CandidateSourceOccurrence {
  readonly documentId: string;
  readonly evidenceClass: 'BUSINESS_APPROVED' | 'OBSERVED' | 'INFERRED';
  readonly lineStart?: number;
}

/**
 * Pick representative source when UI needs a single source reference.
 * Note: firstSeenInDoc is NOT authority (D-34). All supporting occurrences must be cited.
 * Selection priority: (evidenceClass weight) -> (stable documentId).
 */
export function pickRepresentativeSource<T extends CandidateSourceOccurrence>(
  sources: readonly T[]
): T | null {
  if (sources.length === 0) return null;
  const sorted = [...sources].sort((a, b) => {
    const classDiff = CLASSIFICATION_STRENGTH[a.evidenceClass] - CLASSIFICATION_STRENGTH[b.evidenceClass];
    if (classDiff !== 0) return classDiff;
    return a.documentId.localeCompare(b.documentId);
  });
  return sorted[0] ?? null;
}


