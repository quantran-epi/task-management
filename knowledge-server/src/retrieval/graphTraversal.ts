import {
  EvidenceClassification,
  RelationType,
  Urn,
} from '../types/graphProtocol.js';
import {
  NODE_KINDS,
  RELATION_TYPES,
  RETRIEVAL_ONTOLOGY_REGISTRY,
  TraversalDirection,
  type NodeKind,
} from '../graph/ontology.js';
import type {
  LogicalQueryPlan,
  TraversalStep,
  ChunkItem,
  EntityItem,
  EdgeItem,
  ModalityStatusDetail,
} from '../types/retrievalProtocol.js';
import type {
  GraphRetrievalGateway,
  GraphTraversalCriteria,
  GraphTraversalResult,
  OperationOptions,
} from './contracts.js';
import {
  TRAVERSAL_PLAN_LIMITS,
  validateOverallDepth,
  validateStepAgainstRegistry,
  type LooseTraversalStepCandidate,
  type PlanValidationReasonCode,
} from './retrievalPlanDerivation.js';

/**
 * Key format: `${relationType}:${direction}:${hops}`
 */
export type TraversalQueryKey = `${RelationType}:${TraversalDirection}:${number}`;

/**
 * Builds compile-time static Cypher query template for exact relation, direction, and hop count.
 * Guaranteed zero runtime text concatenation or user-string interpolation (T-18-02).
 */
function buildStaticTemplate(
  relation: RelationType,
  direction: TraversalDirection,
  hops: number
): string {
  const relPattern =
    direction === 'OUTGOING'
      ? `-[rels:${relation}*1..${hops}]->`
      : direction === 'INCOMING'
      ? `<-[rels:${relation}*1..${hops}]-`
      : `-[rels:${relation}*1..${hops}]-`;

  return [
    'UNWIND $seedUrns AS seedUrn',
    'MATCH (seed:Entity {urn: seedUrn, graphSnapshotId: $snapshotId})',
    `MATCH path = (seed)${relPattern}(target:Entity {graphSnapshotId: $snapshotId})`,
    'WHERE ALL(n IN nodes(path) WHERE n.graphSnapshotId = $snapshotId AND single(m IN nodes(path) WHERE m = n))',
    'UNWIND range(0, size(relationships(path)) - 1) AS relIndex',
    'WITH path, relIndex, relationships(path)[relIndex] AS rel',
    'MATCH (fact:Fact {graphSnapshotId: $snapshotId, factKey: rel.factKey})',
    'WHERE fact.effectiveClassification IN $evidenceClasses',
    'MATCH (fact)-[:SUPPORTED_BY]->(chunk:Chunk {graphSnapshotId: $snapshotId})',
    'WITH path, relIndex, fact, chunk',
    'ORDER BY relIndex, chunk.chunkId',
    'WITH path, relIndex, fact, collect(DISTINCT {',
    '  chunkId: chunk.chunkId,',
    '  sourceDocumentId: chunk.documentId,',
    '  sourceDocumentTitle: chunk.documentTitle,',
    '  publishedContentHash: chunk.publishedContentHash,',
    '  headingPath: chunk.headingPath,',
    '  lineStart: chunk.startLine,',
    '  lineEnd: chunk.endLine,',
    '  rawSnippet: chunk.text',
    '}) AS supportingChunks',
    'ORDER BY relIndex',
    'WITH path, collect({',
    '  factKey: fact.factKey,',
    '  subjectUrn: fact.subjectUrn,',
    '  relationType: fact.relation,',
    '  objectUrn: fact.objectUrn,',
    '  evidenceClass: fact.effectiveClassification,',
    '  hasConflict: coalesce(fact.hasConflict, false),',
    '  supportingChunks: supportingChunks,',
    '  graphSnapshotId: fact.graphSnapshotId',
    '}) AS pathEdges',
    'WHERE size(pathEdges) = size(relationships(path))',
    'WITH path, pathEdges',
    'ORDER BY [node IN nodes(path) | node.urn], [edge IN pathEdges | edge.factKey]',
    'LIMIT $pathLimit',
    'RETURN',
    '  [node IN nodes(path) | {',
    '    urn: node.urn,',
    '    canonicalName: node.canonicalName,',
    '    kind: node.kind,',
    '    firstSeenInDoc: node.firstSeenInDoc',
    '  }] AS pathNodes,',
    '  pathEdges',
    'LIMIT $maxEdges',
  ].join('\n');
}

/**
 * Static Cypher template catalog generated once from frozen ontology registry at module construction.
 * Keyed strictly by `${relationType}:${direction}:${depth}` tuples (D-15, D-16, T-18-02).
 */
export const STATIC_TRAVERSAL_QUERIES: Readonly<Record<string, string>> = Object.freeze(
  (() => {
    const catalog: Record<string, string> = {};
    const directions: readonly TraversalDirection[] = ['OUTGOING', 'INCOMING', 'BOTH'];

    for (const rel of RELATION_TYPES) {
      const entry = RETRIEVAL_ONTOLOGY_REGISTRY[rel];
      if (!entry) continue;
      for (const dir of directions) {
        for (let hop = 1; hop <= entry.maxHops; hop++) {
          const key: TraversalQueryKey = `${rel}:${dir}:${hop}`;
          catalog[key] = buildStaticTemplate(rel, dir, hop);
        }
      }
    }

    return catalog;
  })()
);

export interface ValidatedTraversalStep {
  readonly relationType: RelationType;
  readonly direction: TraversalDirection;
  readonly hops: number;
  readonly queryKey: TraversalQueryKey;
}

export interface ValidatedTraversalPlanPayload {
  readonly planId: string;
  readonly seedUrns: readonly Urn[];
  readonly evidenceClasses: readonly EvidenceClassification[];
  readonly validatedDepth: number;
  readonly steps: readonly ValidatedTraversalStep[];
  readonly includeInferred: boolean;
}

export type ValidatedTraversalPlan =
  | {
      readonly valid: true;
      readonly plan: ValidatedTraversalPlanPayload;
    }
  | {
      readonly valid: false;
      readonly reason: PlanValidationReasonCode | 'NO_GRAPH_SEED';
    };

function isPlanValidationCode(
  code: PlanValidationReasonCode | null
): code is PlanValidationReasonCode {
  return code !== null;
}

/**
 * Validates a logical query plan against server-resolved allowlist seeds and ontology
 * bounds (D-12, D-13, D-16). Depth and hop violations are rejected outright;
 * every failure returns a stable code only.
 */
export function validateTraversalPlan(
  plan: LogicalQueryPlan,
  allowedSeedSet: ReadonlySet<string>,
  seedKinds?: Readonly<Record<string, NodeKind>> | undefined
): ValidatedTraversalPlan {
  // 1. Check seed URNs existence
  if (!plan.seedUrns || plan.seedUrns.length === 0) {
    return { valid: false, reason: 'NO_GRAPH_SEED' };
  }

  // Filter placeholder seeds
  const validSeeds = plan.seedUrns.filter((s) => s && !s.includes('fallback:none'));
  if (validSeeds.length === 0) {
    return { valid: false, reason: 'NO_GRAPH_SEED' };
  }

  // Check seeds against server-resolved allowlist
  for (const seed of validSeeds) {
    if (!allowedSeedSet.has(seed)) {
      return { valid: false, reason: 'SEED_NOT_FOUND' };
    }
  }

  // 2. Traversal steps bounds: max 5
  if (plan.traversalSteps.length > TRAVERSAL_PLAN_LIMITS.MAX_STEPS) {
    return { valid: false, reason: 'PLAN_REJECTED' };
  }

  // 3. Reject over-depth instead of clamping (D-15)
  const depth = plan.overallMaxDepth ?? TRAVERSAL_PLAN_LIMITS.MAX_DEPTH;
  if (validateOverallDepth(depth)) {
    return { valid: false, reason: 'HOP_LIMIT_EXCEEDED' };
  }

  // 4. Validate each traversal step against the ontology registry
  const validatedSteps: ValidatedTraversalStep[] = [];
  for (const step of plan.traversalSteps as readonly TraversalStep[]) {
    const candidate = step as LooseTraversalStepCandidate;
    const kinds = step.seedUrn
      ? (seedKinds?.[step.seedUrn] ? [seedKinds[step.seedUrn]!] : [])
      : validSeeds
          .map((seed) => seedKinds?.[seed])
          .filter((kind): kind is NodeKind => Boolean(kind));

    if (kinds.length > 0) {
      const codes = kinds.map((kind) => validateStepAgainstRegistry(candidate, kind));
      if (!codes.includes(null)) {
        return { valid: false, reason: codes.find(isPlanValidationCode) ?? 'PLAN_REJECTED' };
      }
    } else {
      // No kind map supplied: still enforce relation, direction, endpoint, and hop bounds.
      if (!RETRIEVAL_ONTOLOGY_REGISTRY[step.relationType]) {
        return { valid: false, reason: 'INVALID_RELATION' };
      }
      const direction = step.direction ?? 'OUTGOING';
      if (!['OUTGOING', 'INCOMING', 'BOTH'].includes(direction)) {
        return { valid: false, reason: 'INVALID_DIRECTION' };
      }
      if (step.targetKind && !NODE_KINDS.includes(step.targetKind)) {
        return { valid: false, reason: 'INVALID_ENDPOINT_KIND' };
      }
      const registryEntry = RETRIEVAL_ONTOLOGY_REGISTRY[step.relationType];
      const hops = step.maxHops ?? 1;
      if (
        !Number.isInteger(hops) ||
        hops < 1 ||
        hops > registryEntry.maxHops ||
        hops > TRAVERSAL_PLAN_LIMITS.MAX_DEPTH
      ) {
        return { valid: false, reason: 'HOP_LIMIT_EXCEEDED' };
      }
    }

    const hops = step.maxHops ?? 1;
    const direction: TraversalDirection = step.direction ?? 'OUTGOING';
    const queryKey: TraversalQueryKey = `${step.relationType}:${direction}:${hops}`;

    if (!STATIC_TRAVERSAL_QUERIES[queryKey]) {
      return { valid: false, reason: 'PLAN_REJECTED' };
    }

    validatedSteps.push({
      relationType: step.relationType,
      direction,
      hops,
      queryKey,
    });
  }

  // 5. Evidence classifications: default OBSERVED & BUSINESS_APPROVED; INFERRED only if opt-in
  const evidenceClasses: EvidenceClassification[] = ['OBSERVED', 'BUSINESS_APPROVED'];
  if (plan.includeInferred) {
    evidenceClasses.push('INFERRED');
  }

  return {
    valid: true,
    plan: {
      planId: plan.planId,
      seedUrns: validSeeds,
      evidenceClasses,
      validatedDepth: depth,
      steps: validatedSteps,
      includeInferred: !!plan.includeInferred,
    },
  };
}

export interface GraphTraversalOptions extends OperationOptions {
  readonly allowedSeedSet?: ReadonlySet<string> | undefined;
  readonly seedKinds?: Readonly<Record<string, NodeKind>> | undefined;
}

export interface OrderedPathCandidate {
  readonly nodeUrns: readonly Urn[];
  readonly edgeFactKeys: readonly string[];
  readonly hopClassifications: readonly EvidenceClassification[];
  readonly hopSupportingChunkIds: readonly (readonly string[])[];
  readonly snapshotId: string;
  readonly hasConflict: boolean;
}

export interface BoundedGraphTraversalResult {
  readonly status: ModalityStatusDetail;
  readonly chunks: readonly ChunkItem[];
  readonly entities: readonly EntityItem[];
  readonly edges: readonly EdgeItem[];
  readonly paths: readonly OrderedPathCandidate[];
}

/**
 * Hard caps enforced at Cypher boundary and TypeScript mapping (D-15).
 */
export const GRAPH_CAP_MAX_NODES = 100;
export const GRAPH_CAP_MAX_EDGES = 200;

/**
 * Executes safe bounded graph traversal across validated plans (RETR-03, RETR-04, 18-GRAPH-01).
 * Features:
 * - Empty seed yields NO_GRAPH_SEED with zero gateway invocations (D-12).
 * - Enforces simple paths and deduplicates items by identity (URN / factKey).
 * - Enforces evidence classification filter (INFERRED excluded by default).
 * - Bounded node (100) and edge (200) caps with sentinel overflow mapping to RESULT_LIMIT_REACHED (D-15).
 * - Content-free error and timeout mapping without leaking Cypher, query, or exception text (T-18-01).
 */
export async function runBoundedGraphTraversal(
  plan: LogicalQueryPlan | ValidatedTraversalPlanPayload,
  pinnedSnapshotId: string,
  gateway: GraphRetrievalGateway,
  optionsOrSignal?: GraphTraversalOptions | AbortSignal
): Promise<BoundedGraphTraversalResult> {
  const options: GraphTraversalOptions =
    optionsOrSignal instanceof AbortSignal
      ? { signal: optionsOrSignal }
      : optionsOrSignal ?? {};

  // 1. Missing or stale pinned snapshot ID
  if (!pinnedSnapshotId || !pinnedSnapshotId.trim()) {
    return {
      status: {
        status: 'stale',
        latencyMs: 0,
        itemCount: 0,
        reason: 'PINNED_SNAPSHOT_UNAVAILABLE',
      },
      chunks: [],
      entities: [],
      edges: [],
      paths: [],
    };
  }

  // 2. Check seeds existence (D-12)
  const rawSeeds = (plan.seedUrns || []).filter((s) => s && !s.includes('fallback:none'));
  if (rawSeeds.length === 0) {
    return {
      status: {
        status: 'unavailable',
        latencyMs: 0,
        itemCount: 0,
        reason: 'NO_GRAPH_SEED',
      },
      chunks: [],
      entities: [],
      edges: [],
      paths: [],
    };
  }

  // 3. Plan validation
  let validatedPlan: ValidatedTraversalPlanPayload;
  if ('steps' in plan && 'validatedDepth' in plan) {
    validatedPlan = plan;
  } else {
    const allowedSet = options.allowedSeedSet ?? new Set(rawSeeds);
    const validation = validateTraversalPlan(
      plan as LogicalQueryPlan,
      allowedSet,
      options.seedKinds
    );
    if (!validation.valid) {
      // Stable reason code drives the status; no plan content is logged or returned.
      return {
        status: {
          status: validation.reason === 'NO_GRAPH_SEED' ? 'unavailable' : 'error',
          latencyMs: 0,
          itemCount: 0,
          reason: validation.reason,
        },
        chunks: [],
        entities: [],
        edges: [],
        paths: [],
      };
    }
    validatedPlan = validation.plan;
  }

  // 4. Build gateway criteria with +1 sentinel beyond caps to detect truncation
  const criteria: GraphTraversalCriteria = {
    seedUrns: validatedPlan.seedUrns,
    plan: 'traversalSteps' in plan ? (plan as LogicalQueryPlan) : ({
      planId: validatedPlan.planId,
      queryIntent: 'FLOW_TRAVERSAL',
      seedUrns: [...validatedPlan.seedUrns],
      traversalSteps: validatedPlan.steps.map((s) => ({
        relationType: s.relationType,
        direction: s.direction,
        maxHops: s.hops,
      })),
      overallMaxDepth: validatedPlan.validatedDepth,
      includeInferred: validatedPlan.includeInferred,
      fulltextKeywords: [],
      semanticQuery: '',
    } as LogicalQueryPlan),
    evidenceClasses: validatedPlan.evidenceClasses,
    limitNodes: GRAPH_CAP_MAX_NODES + 1,
    limitEdges: GRAPH_CAP_MAX_EDGES + 1,
  };

  const startMs = Date.now();

  // 5. Execute gateway traversal
  let rawResult: GraphTraversalResult;
  try {
    rawResult = await gateway.traverse(pinnedSnapshotId, criteria, options);
  } catch (err: any) {
    const latencyMs = Math.max(0, Date.now() - startMs);
    const errName = err?.name || '';
    const errMsg = (err?.message || '').toLowerCase();

    if (errName === 'AbortError' || errMsg.includes('abort') || errMsg.includes('timeout')) {
      return {
        status: {
          status: 'timeout',
          latencyMs,
          itemCount: 0,
          reason: 'TIMEOUT',
        },
        chunks: [],
      entities: [],
        edges: [],
        paths: [],
      };
    }

    if (
      errMsg.includes('stale') ||
      errMsg.includes('pinned_snapshot_unavailable') ||
      errMsg.includes('snapshot')
    ) {
      return {
        status: {
          status: 'stale',
          latencyMs,
          itemCount: 0,
          reason: 'PINNED_SNAPSHOT_UNAVAILABLE',
        },
        chunks: [],
      entities: [],
        edges: [],
        paths: [],
      };
    }

    return {
      status: {
        status: 'error',
        latencyMs,
        itemCount: 0,
        reason: 'PROVIDER_ERROR',
      },
      chunks: [],
      entities: [],
      edges: [],
      paths: [],
    };
  }

  const allowedEvidenceSet = new Set(validatedPlan.evidenceClasses);
  let isTruncated = rawResult.truncated === true;

  const chunkMap = new Map<string, ChunkItem>();
  for (const rawChunk of rawResult.chunks ?? []) {
    if (!rawChunk.id || rawChunk.snapshotId !== pinnedSnapshotId || chunkMap.has(rawChunk.id)) continue;
    chunkMap.set(rawChunk.id, {
      ...rawChunk,
      modalitiesContributed: ['graph'],
      snapshotId: pinnedSnapshotId,
    });
  }
  const chunkList = Array.from(chunkMap.values()).slice(0, GRAPH_CAP_MAX_EDGES);

  // 6. Map and deduplicate entities by URN
  const entityMap = new Map<string, EntityItem>();
  for (const rawEntity of rawResult.entities) {
    if (!rawEntity.urn) continue;
    if (!entityMap.has(rawEntity.urn)) {
      entityMap.set(rawEntity.urn, {
        type: 'entity',
        id: rawEntity.urn,
        score: rawEntity.score ?? 1.0,
        modalitiesContributed: ['graph'],
        urn: rawEntity.urn,
        canonicalName: rawEntity.canonicalName,
        kind: rawEntity.kind,
        snapshotId: pinnedSnapshotId,
        ...(rawEntity.firstSeenInDoc ? { firstSeenInDoc: rawEntity.firstSeenInDoc } : {}),
        ...(rawEntity.conflictGroupId ? { conflictGroupId: rawEntity.conflictGroupId } : {}),
        hasConflict: !!rawEntity.hasConflict,
      });
    }
  }

  if (rawResult.entities.length > GRAPH_CAP_MAX_NODES || entityMap.size > GRAPH_CAP_MAX_NODES) {
    isTruncated = true;
  }
  const entityList = Array.from(entityMap.values()).slice(0, GRAPH_CAP_MAX_NODES);

  // 7. Map and deduplicate edges by factKey and enforce evidence classification filter
  const edgeMap = new Map<string, EdgeItem>();
  for (const rawEdge of rawResult.edges) {
    if (!rawEdge.factKey) continue;
    // Strict evidence classification filter (D-14)
    if (!allowedEvidenceSet.has(rawEdge.evidenceClass)) {
      continue;
    }
    if (!edgeMap.has(rawEdge.factKey)) {
      edgeMap.set(rawEdge.factKey, {
        type: 'edge',
        id: rawEdge.factKey,
        score: rawEdge.score ?? 1.0,
        modalitiesContributed: ['graph'],
        factKey: rawEdge.factKey,
        sourceUrn: rawEdge.sourceUrn,
        relationType: rawEdge.relationType,
        targetUrn: rawEdge.targetUrn,
        evidenceClass: rawEdge.evidenceClass,
        supportingChunkIds: rawEdge.supportingChunkIds ? [...rawEdge.supportingChunkIds] : [],
        snapshotId: pinnedSnapshotId,
        conflictGroupId: rawEdge.conflictGroupId,
        hasConflict: !!rawEdge.hasConflict,
      });
    }
  }

  if (rawResult.edges.length > GRAPH_CAP_MAX_EDGES || edgeMap.size > GRAPH_CAP_MAX_EDGES) {
    isTruncated = true;
  }
  const edgeList = Array.from(edgeMap.values()).slice(0, GRAPH_CAP_MAX_EDGES);

  // 8. Preserve ordered path identity. Fail closed on mixed snapshots or citationless hops.
  const paths: OrderedPathCandidate[] = [];
  for (const rawPath of rawResult.paths ?? []) {
    if (paths.length >= 20) break;
    if (rawPath.nodeUrns.length !== rawPath.edgeFactKeys.length + 1) continue;
    if (rawPath.hopClassifications.length !== rawPath.edgeFactKeys.length) continue;
    if (rawPath.hopSupportingChunkIds.length !== rawPath.edgeFactKeys.length) continue;
    if (rawPath.edgeSnapshotIds.length !== rawPath.edgeFactKeys.length) continue;
    if (rawPath.edgeSnapshotIds.some((snapshotId) => snapshotId !== pinnedSnapshotId)) continue;
    if (rawPath.hopSupportingChunkIds.some((chunkIds) => chunkIds.length === 0)) continue;
    if (rawPath.hopClassifications.some((classification) => !allowedEvidenceSet.has(classification))) {
      continue;
    }

    paths.push({
      nodeUrns: [...rawPath.nodeUrns],
      edgeFactKeys: [...rawPath.edgeFactKeys],
      hopClassifications: [...rawPath.hopClassifications],
      hopSupportingChunkIds: rawPath.hopSupportingChunkIds.map((ids) => [...ids]),
      snapshotId: pinnedSnapshotId,
      hasConflict: rawPath.hasConflict,
    });
  }

  const latencyMs = Math.max(0, Date.now() - startMs);
  const itemCount = chunkList.length + entityList.length + edgeList.length;

  return {
    status: {
      status: isTruncated ? 'truncated' : 'ok',
      latencyMs,
      itemCount,
      reason: isTruncated ? 'RESULT_LIMIT_REACHED' : undefined,
    },
    chunks: chunkList,
    entities: entityList,
    edges: edgeList,
    paths,
  };
}
