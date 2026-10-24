import {
  NODE_KINDS,
  RELATION_TYPES,
  RETRIEVAL_ONTOLOGY_REGISTRY,
  type NodeKind,
  type RelationType,
  type RetrievalOntologyEntry,
  type TraversalDirection,
} from '../graph/ontology.js';
import { z } from 'zod';
import { UrnSchema } from '../types/graphProtocol.js';
import {
  MODEL_DEPTH_INPUT_CAP,
  TRAVERSAL_DIRECTIONS,
  type ClarificationCandidate,
  type TraversalStep,
} from '../types/retrievalProtocol.js';

/**
 * Validation reason codes shared by planning and traversal boundaries (D-14).
 */
export const PLAN_VALIDATION_REASON_CODES = [
  'INVALID_RELATION',
  'INVALID_DIRECTION',
  'INVALID_ENDPOINT_KIND',
  'HOP_LIMIT_EXCEEDED',
  'SEED_NOT_FOUND',
  'PLAN_REJECTED',
] as const;

export type PlanValidationReasonCode = (typeof PLAN_VALIDATION_REASON_CODES)[number];

/**
 * Shared bounds for server-derived traversal plans (D-09, D-15).
 */
export const TRAVERSAL_PLAN_LIMITS = Object.freeze({
  MAX_STEPS: 5,
  MAX_DEPTH: 3,
  SAFE_FALLBACK_DEPTH: 1,
  MAX_SEEDS: 5,
});

/**
 * Loose planner-facing step shape. Unknown relations must reach INVALID_RELATION
 * instead of being swallowed by the strict Zod enum.
 */export interface LooseTraversalStepCandidate {
  readonly relationType: string;
  readonly direction?: string | undefined;
  readonly maxHops?: number | undefined;
  readonly targetKind?: string | undefined;
}

/**
 * Loose planner-facing schemas. Fields are bounded so an unknown relation or
 * over-depth value reaches semantic validation instead of dying at parse time.
 */
export const LooseTraversalStepSchema = z
  .object({
    relationType: z.string().min(1).max(64),
    direction: z.string().max(32).optional(),
    maxHops: z.number().int().min(1).max(MODEL_DEPTH_INPUT_CAP).optional(),
    targetKind: z.string().max(64).optional(),
    seedUrn: UrnSchema.optional(),
  })
  .passthrough();

export const LooseLogicalQueryPlanSchema = z
  .object({
    planId: z.string().min(1).max(64),
    queryIntent: z.string().min(1).max(64),
    seedUrns: z.array(UrnSchema).min(1).max(TRAVERSAL_PLAN_LIMITS.MAX_SEEDS),
    traversalSteps: z.array(LooseTraversalStepSchema).max(TRAVERSAL_PLAN_LIMITS.MAX_STEPS),
    overallMaxDepth: z.number().int().min(1).max(MODEL_DEPTH_INPUT_CAP),
    includeInferred: z.boolean().optional(),
    fulltextKeywords: z.array(z.string().min(1)).min(1),
    semanticQuery: z.string().min(1),
  })
  .passthrough();

export type LooseLogicalQueryPlan = z.infer<typeof LooseLogicalQueryPlanSchema>;

/**
 * Direction legal for a seed kind: BOTH only when the kind is legal on both
 * endpoints of the relation. This keeps derived BOTH steps limited to
 * PRECEDES/ProcessStep and CALLS/SoftwareComponent.
 */
export function directionForSeedKind(
  entry: RetrievalOntologyEntry,
  kind: NodeKind
): TraversalDirection | null {
  const isSource = entry.allowedSourceKinds.includes(kind);
  const isTarget = entry.allowedTargetKinds.includes(kind);
  if (isSource && isTarget) return 'BOTH';
  if (isSource) return 'OUTGOING';
  if (isTarget) return 'INCOMING';
  return null;
}

/**
 * Derives every ontology-valid one-hop shape for a seed kind from the frozen
 * registry, preserving registry insertion order. No hardcoded relation list.
 */
export function deriveAllRelationSteps(kind: NodeKind, maxDepth: number): TraversalStep[] {
  const depth = Math.max(1, Math.min(maxDepth, TRAVERSAL_PLAN_LIMITS.MAX_DEPTH));
  const steps: TraversalStep[] = [];

  for (const relationType of Object.keys(RETRIEVAL_ONTOLOGY_REGISTRY) as RelationType[]) {
    const entry = RETRIEVAL_ONTOLOGY_REGISTRY[relationType];
    if (!entry) continue;

    const direction = directionForSeedKind(entry, kind);
    if (!direction) continue;

    const targetKind =
      direction === 'INCOMING'
        ? entry.allowedSourceKinds[0]
        : entry.allowedTargetKinds[0];
    if (!targetKind) continue;

    steps.push({
      relationType,
      direction,
      maxHops: Math.min(depth, entry.maxHops),
      targetKind,
    });
  }

  return steps;
}

export interface DeriveSeedPlanOptions {
  readonly maxDepth: number;
  readonly selectedRelations?: readonly string[] | undefined;
  readonly allowAllRelations?: boolean | undefined;
  readonly applySafeFallback?: boolean | undefined;
}

export interface DerivedSeedPlan {
  readonly seedUrn: string;
  readonly seedKind: NodeKind;
  readonly steps: readonly TraversalStep[];
}

/**
 * Builds a per-seed plan from the registry. A seed's own kind governs its steps;
 * another seed's kind never leaks into this plan (D-06, D-08).
 */
export function deriveSeedPlan(
  seed: ClarificationCandidate,
  options: DeriveSeedPlanOptions
): DerivedSeedPlan {
  const build = (maxDepth: number, allRelationsOnly = false): TraversalStep[] => {
    const all = deriveAllRelationSteps(seed.kind, maxDepth);
    if (allRelationsOnly || options.allowAllRelations || !options.selectedRelations) return all;
    const selected = new Set(options.selectedRelations);
    return all.filter((step) => selected.has(step.relationType));
  };

  let steps = build(options.maxDepth);
  if (steps.length === 0 && options.applySafeFallback) {
    steps = build(TRAVERSAL_PLAN_LIMITS.SAFE_FALLBACK_DEPTH, true);
  }

  return {
    seedUrn: seed.urn,
    seedKind: seed.kind,
    steps: steps
      .slice(0, TRAVERSAL_PLAN_LIMITS.MAX_STEPS)
      .map((step) => ({ ...step, seedUrn: seed.urn })),
  };
}

function isLegalDirection(
  entry: RetrievalOntologyEntry,
  seedKind: NodeKind,
  direction: string
): boolean {
  if (direction === 'OUTGOING') return entry.allowedSourceKinds.includes(seedKind);
  if (direction === 'INCOMING') return entry.allowedTargetKinds.includes(seedKind);
  if (direction === 'BOTH') {
    return (
      entry.allowedSourceKinds.includes(seedKind) && entry.allowedTargetKinds.includes(seedKind)
    );
  }
  return false;
}

/**
 * Validates a single step against the registry for a given seed kind.
 * Returns null when valid, otherwise exactly one stable reason code.
 */
export function validateStepAgainstRegistry(
  step: LooseTraversalStepCandidate,
  seedKind: NodeKind
): PlanValidationReasonCode | null {
  if (!(RELATION_TYPES as readonly string[]).includes(step.relationType)) {
    return 'INVALID_RELATION';
  }

  const entry = RETRIEVAL_ONTOLOGY_REGISTRY[step.relationType as RelationType];
  if (!entry) return 'INVALID_RELATION';

  const direction = step.direction ?? 'OUTGOING';
  if (!(TRAVERSAL_DIRECTIONS as readonly string[]).includes(direction)) {
    return 'INVALID_DIRECTION';
  }
  if (!isLegalDirection(entry, seedKind, direction)) {
    return 'INVALID_DIRECTION';
  }

  if (step.targetKind) {
    const legalKinds =
      direction === 'OUTGOING'
        ? entry.allowedTargetKinds
        : direction === 'INCOMING'
          ? entry.allowedSourceKinds
          : [...entry.allowedSourceKinds, ...entry.allowedTargetKinds];
    if (!(NODE_KINDS as readonly string[]).includes(step.targetKind)) {
      return 'INVALID_ENDPOINT_KIND';
    }
    if (!legalKinds.includes(step.targetKind as NodeKind)) {
      return 'INVALID_ENDPOINT_KIND';
    }
  }

  if (step.maxHops !== undefined) {
    if (
      !Number.isInteger(step.maxHops) ||
      step.maxHops < 1 ||
      step.maxHops > entry.maxHops ||
      step.maxHops > TRAVERSAL_PLAN_LIMITS.MAX_DEPTH
    ) {
      return 'HOP_LIMIT_EXCEEDED';
    }
  }

  return null;
}

/**
 * Rejects over-depth plans instead of silently clamping them (D-15).
 */
export function validateOverallDepth(depth: number): PlanValidationReasonCode | null {
  if (!Number.isInteger(depth) || depth < 1 || depth > TRAVERSAL_PLAN_LIMITS.MAX_DEPTH) {
    return 'HOP_LIMIT_EXCEEDED';
  }
  return null;
}
