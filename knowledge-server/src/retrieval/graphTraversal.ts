import {
  EvidenceClassification,
  RelationType,
  Urn,
} from '../types/graphProtocol.js';
import {
  RELATION_TYPES,
  RETRIEVAL_ONTOLOGY_REGISTRY,
  TraversalDirection,
} from '../graph/ontology.js';
import type {
  LogicalQueryPlan,
  TraversalStep,
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
    'WHERE ALL(r IN relationships(path) WHERE r.graphSnapshotId = $snapshotId AND r.effectiveClassification IN $evidenceClasses)',
    '  AND ALL(n IN nodes(path) WHERE n.graphSnapshotId = $snapshotId AND single(m IN nodes(path) WHERE m = n))',
    'WITH path',
    'LIMIT $pathLimit',
    'UNWIND relationships(path) AS rel',
    'UNWIND nodes(path) AS node',
    'RETURN DISTINCT',
    '  node.urn AS nodeUrn,',
    '  node.canonicalName AS nodeName,',
    '  node.kind AS nodeKind,',
    '  node.firstSeenInDoc AS firstSeenInDoc,',
    '  rel.factKey AS factKey,',
    '  rel.subjectUrn AS subjectUrn,',
    '  type(rel) AS relationType,',
    '  rel.objectUrn AS objectUrn,',
    '  rel.effectiveClassification AS evidenceClass,',
    '  rel.hasConflict AS hasConflict,',
    '  rel.supportingChunkIds AS supportingChunkIds',
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
  readonly clampedDepth: number;
  readonly steps: readonly ValidatedTraversalStep[];
  readonly includeInferred: boolean;
}

export type ValidatedTraversalPlan =
  | {
      readonly valid: true;
      readonly plan: ValidatedTraversalPlanPayload;
      readonly warnings: readonly string[];
    }
  | {
      readonly valid: false;
      readonly reason: string;
      readonly warnings?: readonly string[] | undefined;
    };

/**
 * Validates logical query plan against server-resolved allowlist seeds and ontology bounds (D-12, D-13, D-16).
 * Rechecks seed allowlist, max 5 entries, registry endpoints/direction/hop limits, and clamps depth.
 */
export function validateTraversalPlan(
  plan: LogicalQueryPlan,
  allowedSeedSet: ReadonlySet<string>
): ValidatedTraversalPlan {
  const warnings: string[] = [];

  // 1. Check seed URNs existence
  if (!plan.seedUrns || plan.seedUrns.length === 0) {
    return {
      valid: false,
      reason: 'NO_GRAPH_SEED',
    };
  }

  // Filter placeholder seeds
  const validSeeds = plan.seedUrns.filter((s) => s && !s.includes('fallback:none'));
  if (validSeeds.length === 0) {
    return {
      valid: false,
      reason: 'NO_GRAPH_SEED',
    };
  }

  // Check seeds against server-resolved allowlist
  for (const seed of validSeeds) {
    if (!allowedSeedSet.has(seed)) {
      return {
        valid: false,
        reason: `Unallowlisted seed URN: ${seed}`,
      };
    }
  }

  // 2. Traversal steps bounds: max 5
  if (plan.traversalSteps.length > 5) {
    return {
      valid: false,
      reason: `Traversal steps count ${plan.traversalSteps.length} exceeds maximum 5`,
    };
  }

  // 3. Clamp overall depth to 1..3
  let clampedDepth = plan.overallMaxDepth ?? 3;
  if (clampedDepth > 3) {
    warnings.push(`Overall depth ${clampedDepth} clamped to maximum 3`);
    clampedDepth = 3;
  } else if (clampedDepth < 1) {
    warnings.push(`Overall depth ${clampedDepth} clamped to minimum 1`);
    clampedDepth = 1;
  }

  // 4. Validate each traversal step against ontology registry
  const validatedSteps: ValidatedTraversalStep[] = [];
  for (let i = 0; i < plan.traversalSteps.length; i++) {
    const step: TraversalStep = plan.traversalSteps[i]!;
    const registryEntry = RETRIEVAL_ONTOLOGY_REGISTRY[step.relationType];
    if (!registryEntry) {
      return {
        valid: false,
        reason: `Unknown relation type ${step.relationType} at step ${i}`,
      };
    }

    let hops = step.maxHops ?? 1;
    if (hops > registryEntry.maxHops) {
      warnings.push(
        `Step ${i} (${step.relationType}) hops ${hops} clamped to registry maximum ${registryEntry.maxHops}`
      );
      hops = registryEntry.maxHops;
    }
    if (hops > clampedDepth) {
      hops = clampedDepth;
    }
    if (hops < 1) {
      hops = 1;
    }

    const direction: TraversalDirection = step.direction ?? registryEntry.defaultDirection ?? 'OUTGOING';
    const queryKey: TraversalQueryKey = `${step.relationType}:${direction}:${hops}`;

    if (!STATIC_TRAVERSAL_QUERIES[queryKey]) {
      return {
        valid: false,
        reason: `No static query template registered for ${queryKey}`,
      };
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
      clampedDepth,
      steps: validatedSteps,
      includeInferred: !!plan.includeInferred,
    },
    warnings,
  };
}

export interface GraphTraversalOptions extends OperationOptions {
  readonly allowedSeedSet?: ReadonlySet<string> | undefined;
}

export interface BoundedGraphTraversalResult {
  readonly status: ModalityStatusDetail;
  readonly entities: readonly EntityItem[];
  readonly edges: readonly EdgeItem[];
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
      entities: [],
      edges: [],
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
      entities: [],
      edges: [],
    };
  }

  // 3. Plan validation
  let validatedPlan: ValidatedTraversalPlanPayload;
  if ('steps' in plan && 'clampedDepth' in plan) {
    validatedPlan = plan;
  } else {
    const allowedSet = options.allowedSeedSet ?? new Set(rawSeeds);
    const validation = validateTraversalPlan(plan as LogicalQueryPlan, allowedSet);
    if (!validation.valid) {
      if (validation.reason === 'NO_GRAPH_SEED') {
        return {
          status: {
            status: 'unavailable',
            latencyMs: 0,
            itemCount: 0,
            reason: 'NO_GRAPH_SEED',
          },
          entities: [],
          edges: [],
        };
      }
      return {
        status: {
          status: 'error',
          latencyMs: 0,
          itemCount: 0,
          reason: 'PROVIDER_ERROR',
        },
        entities: [],
        edges: [],
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
      overallMaxDepth: validatedPlan.clampedDepth,
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
        entities: [],
        edges: [],
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
        entities: [],
        edges: [],
      };
    }

    return {
      status: {
        status: 'error',
        latencyMs,
        itemCount: 0,
        reason: 'PROVIDER_ERROR',
      },
      entities: [],
      edges: [],
    };
  }

  const allowedEvidenceSet = new Set(validatedPlan.evidenceClasses);
  let isTruncated = rawResult.truncated === true;

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
        firstSeenInDoc: rawEntity.firstSeenInDoc,
        conflictGroupId: rawEntity.conflictGroupId,
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

  const latencyMs = Math.max(0, Date.now() - startMs);
  const itemCount = entityList.length + edgeList.length;

  return {
    status: {
      status: isTruncated ? 'truncated' : 'ok',
      latencyMs,
      itemCount,
      reason: isTruncated ? 'RESULT_LIMIT_REACHED' : undefined,
    },
    entities: entityList,
    edges: edgeList,
  };
}
