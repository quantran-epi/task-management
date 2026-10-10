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
} from '../types/retrievalProtocol.js';

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
