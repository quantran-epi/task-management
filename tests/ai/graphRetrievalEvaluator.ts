import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import type { NodeKind, RelationType } from '../../knowledge-server/src/graph/ontology';
import type {
  ChunkItem,
  EdgeItem,
  EntityItem,
  LogicalQueryPlan,
  ModalityKind,
  TraversalStep,
} from '../../knowledge-server/src/types/retrievalProtocol';
import type {
  GraphRetrievalGateway,
  GraphTraversalCriteria,
  GraphTraversalResult,
  GraphTraversalPathRecord,
} from '../../knowledge-server/src/retrieval/contracts';
import { deriveSeedPlan } from '../../knowledge-server/src/retrieval/retrievalPlanDerivation';
import {
  closeOrderedPaths,
  buildProtectedGraphPackages,
  rankGraphPackages,
  fuseRetrievalCandidates,
} from '../../knowledge-server/src/retrieval/fusion';
import {
  runBoundedGraphTraversal,
  validateTraversalPlan,
} from '../../knowledge-server/src/retrieval/graphTraversal';
import type { GraphReferenceCase } from '../fixtures/ai/graph-reference-fixture-schema';

/**
 * Hard gate thresholds for D-22. Correctness must pass before any Neo4j
 * EXPLAIN/PROFILE tuning may start, and tuning must never lower these values.
 */
export const GRAPH_GATE_THRESHOLDS = Object.freeze({
  maxZeroResultRate: 0.1,
  minEntityRecall: 0.9,
  minEdgePrecision: 0.9,
  requireIdentityPreservation: true,
  requireCitationClosure: true,
  requireDeterministicOrdering: true,
  minLatencySamples: 12,
});

const SNAPSHOT_ID = 'gsnap_24070001';
const PLAN_ID = '24000000-0000-4000-8000-000000000007';

export interface GraphCaseResult {
  readonly caseId: string;
  readonly category: string;
  readonly passed: boolean;
  readonly outcome: string;
  readonly reasonCode: string | null;
  readonly failureCodes: readonly string[];
  readonly returnedItemCount: number;
  readonly entityRecall: number;
  readonly edgePrecision: number;
  readonly identityPreserved: boolean;
  readonly citationClosed: boolean;
  readonly orderedItemIds: readonly string[];
  readonly orderedPathKeys: readonly string[];
  readonly latencyMs: number;
}

export interface GraphMetrics {
  readonly totalCases: number;
  readonly zeroResultRate: number;
  readonly zeroResultDenominator: number;
  readonly entityRecall: number;
  readonly entityRecallDenominator: number;
  readonly edgePrecision: number;
  readonly edgePrecisionDenominator: number;
  readonly identityPreserved: boolean;
  readonly citationClosed: boolean;
  readonly deterministicOrdering: boolean;
  readonly latency: {
    readonly samples: number;
    readonly p50Ms: number;
    readonly p95Ms: number;
  };
  readonly caseResults: readonly GraphCaseResult[];
}

export interface GraphGateFailure {
  readonly code:
    | 'ZERO_RESULT_RATE'
    | 'ENTITY_RECALL'
    | 'EDGE_PRECISION'
    | 'IDENTITY_PRESERVATION'
    | 'CITATION_CLOSURE'
    | 'DETERMINISTIC_ORDERING'
    | 'INSUFFICIENT_LATENCY_SAMPLES'
    | 'CASE_FAILED';
  readonly caseId?: string;
}

export interface GraphGateVerdict {
  readonly passed: boolean;
  readonly failures: readonly GraphGateFailure[];
}

interface CasePassResult {
  readonly caseId: string;
  readonly category: string;
  readonly outcome: string;
  readonly reasonCode: string | null;
  readonly failureCodes: string[];
  readonly expectedEntityUrns: readonly string[];
  readonly returnedEntityUrns: readonly string[];
  readonly expectedEdgeFactKeys: readonly string[];
  readonly returnedEdgeFactKeys: readonly string[];
  readonly returnedItemCount: number;
  readonly identityPreserved: boolean;
  readonly citationClosed: boolean;
  readonly orderedItemIds: readonly string[];
  readonly orderedPathKeys: readonly string[];
  readonly latencyMs: number;
  readonly evidenceExpecting: boolean;
  readonly declaredEdges: readonly { subjectUrn: string; relation: string; objectUrn: string; factKey: string }[];
}

function sorted<T>(values: readonly T[]): T[] {
  return [...values].sort();
}

function percentile(samples: readonly number[], fraction: number): number {
  if (samples.length === 0) return 0;
  const sortedSamples = [...samples].sort((a, b) => a - b);
  const index = Math.min(sortedSamples.length - 1, Math.ceil(fraction * sortedSamples.length) - 1);
  return Number((sortedSamples[Math.max(0, index)] ?? 0).toFixed(3));
}

/**
 * In-process deterministic gateway over the fixture corpus. No socket, no
 * environment, no model: arrays are sorted by stable identity so reversed
 * fixture input cannot leak ordering into the pipeline.
 */
function createFixtureGateway(testCase: GraphReferenceCase): GraphRetrievalGateway {
  const nodesByUrn = new Map(testCase.nodes.map((node) => [node.urn, node]));
  const chunks: ChunkItem[] = testCase.chunks
    .map((chunk) => ({
      type: 'chunk' as const,
      id: chunk.id,
      score: 1,
      modalitiesContributed: ['graph'] as ModalityKind[],
      sourceDocumentId: chunk.documentId,
      sourceDocumentTitle: chunk.documentTitle,
      sectionAnchor: chunk.sectionAnchor,
      lineStart: chunk.lineStart,
      lineEnd: chunk.lineEnd,
      rawSnippet: chunk.rawSnippet,
      publishedContentHash: chunk.publishedContentHash,
      snapshotId: SNAPSHOT_ID,
      hasConflict: false,
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const edges: EdgeItem[] = testCase.edges
    .map((edge) => ({
      type: 'edge' as const,
      id: edge.factKey,
      score: 1,
      modalitiesContributed: ['graph'] as ModalityKind[],
      factKey: edge.factKey,
      sourceUrn: edge.subjectUrn,
      relationType: edge.relation,
      targetUrn: edge.objectUrn,
      evidenceClass: edge.evidenceClass,
      supportingChunkIds: [...edge.supportingChunkIds],
      snapshotId: SNAPSHOT_ID,
      hasConflict: false,
    }))
    .sort((a, b) => (a.factKey < b.factKey ? -1 : a.factKey > b.factKey ? 1 : 0));
  const chunkById = new Map(chunks.map((chunk) => [chunk.id, chunk]));

  const toEntity = (urn: string): EntityItem | null => {
    const node = nodesByUrn.get(urn);
    if (!node) return null;
    return {
      type: 'entity',
      id: node.urn,
      score: 1,
      modalitiesContributed: ['graph'],
      urn: node.urn,
      canonicalName: node.canonicalName,
      kind: node.kind,
      snapshotId: SNAPSHOT_ID,
      hasConflict: false,
    };
  };

  return {
    async resolveEntities(_snapshotId, queryTokens) {
      return testCase.seeds
        .filter((seed) => queryTokens.includes(seed.urn) && nodesByUrn.has(seed.urn))
        .map((seed) => ({
          urn: seed.urn,
          canonicalName: nodesByUrn.get(seed.urn)!.canonicalName,
          kind: seed.kind,
        }));
    },

    async traverse(_snapshotId, criteria: GraphTraversalCriteria): Promise<GraphTraversalResult> {
      const steps = criteria.plan.traversalSteps;
      const reachedEntities = new Set<string>();
      const traversedEdges = new Set<string>();
      const pathRecords: GraphTraversalPathRecord[] = [];
      const edgeByKey = new Map(edges.map((edge) => [edge.factKey, edge]));

      for (const step of steps) {
        const hopLimit = Math.min(step.maxHops, 3);
        for (const seedUrn of criteria.seedUrns) {
          const walk = (
            currentUrn: string,
            visited: readonly string[],
            edgeKeys: readonly string[],
            classifications: readonly ('OBSERVED' | 'INFERRED' | 'BUSINESS_APPROVED')[],
            hopChunks: readonly (readonly string[])[]
          ): void => {
            if (edgeKeys.length >= hopLimit) return;
            for (const edge of edges) {
              if (edge.relationType !== step.relationType) continue;
              let nextUrn: string | null = null;
              if ((step.direction === 'OUTGOING' || step.direction === 'BOTH') && edge.sourceUrn === currentUrn) {
                nextUrn = edge.targetUrn;
              } else if (
                (step.direction === 'INCOMING' || step.direction === 'BOTH') &&
                edge.targetUrn === currentUrn
              ) {
                nextUrn = edge.sourceUrn;
              }
              if (!nextUrn || visited.includes(nextUrn)) continue;

              const nextEdgeKeys = [...edgeKeys, edge.factKey];
              const nextClassifications = [...classifications, edge.evidenceClass];
              const nextChunks = [...hopChunks, edge.supportingChunkIds];
              reachedEntities.add(nextUrn);
              traversedEdges.add(edge.factKey);
              pathRecords.push({
                nodeUrns: [...visited, nextUrn],
                edgeFactKeys: nextEdgeKeys,
                hopClassifications: nextClassifications,
                hopSupportingChunkIds: nextChunks,
                edgeSnapshotIds: nextEdgeKeys.map(() => SNAPSHOT_ID),
                hasConflict: false,
              });
              walk(nextUrn, [...visited, nextUrn], nextEdgeKeys, nextClassifications, nextChunks);
            }
          };
          walk(seedUrn, [seedUrn], [], [], []);
        }
      }

      const seedEntities = criteria.seedUrns
        .map((urn) => toEntity(urn))
        .filter((entity): entity is EntityItem => entity !== null)
        .sort((a, b) => (a.urn < b.urn ? -1 : a.urn > b.urn ? 1 : 0));
      const entities = [...reachedEntities]
        .map((urn) => toEntity(urn))
        .filter((entity): entity is EntityItem => entity !== null)
        .sort((a, b) => (a.urn < b.urn ? -1 : a.urn > b.urn ? 1 : 0));

      const returnedEdges = [...traversedEdges]
        .map((factKey) => edgeByKey.get(factKey))
        .filter((edge): edge is EdgeItem => edge !== undefined)
        .sort((a, b) => (a.factKey < b.factKey ? -1 : a.factKey > b.factKey ? 1 : 0));

      const supportingChunkIds = sorted([
        ...new Set(returnedEdges.flatMap((edge) => edge.supportingChunkIds)),
      ]);
      const returnedChunks = supportingChunkIds
        .map((id) => chunkById.get(id))
        .filter((chunk): chunk is ChunkItem => chunk !== undefined);

      pathRecords.sort((a, b) => {
        const aKey = `${a.nodeUrns.join('>')}|${a.edgeFactKeys.join('>')}`;
        const bKey = `${b.nodeUrns.join('>')}|${b.edgeFactKeys.join('>')}`;
        return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
      });

      return {
        chunks: returnedChunks,
        entities,
        seedEntities,
        edges: returnedEdges,
        paths: pathRecords,
        truncated: false,
      };
    },
  };
}

interface PassOutput {
  readonly results: readonly CasePassResult[];
}

async function runPass(cases: readonly GraphReferenceCase[]): Promise<PassOutput> {
  const results: CasePassResult[] = [];

  for (const testCase of cases) {
    const started = performance.now();
    const failureCodes: string[] = [];
    const nodesByUrn = new Map(testCase.nodes.map((node) => [node.urn, node]));
    const declaredEdges = testCase.edges.map((edge) => ({
      subjectUrn: edge.subjectUrn,
      relation: edge.relation as string,
      objectUrn: edge.objectUrn,
      factKey: edge.factKey,
    }));

    const resolvedSeeds = testCase.seeds.filter((seed) => nodesByUrn.has(seed.urn));
    const seedKinds: Record<string, NodeKind> = {};
    for (const seed of resolvedSeeds) seedKinds[seed.urn] = seed.kind;

    let outcome = 'NO_EVIDENCE';
    let reasonCode: string | null = null;
    let returnedEntities: string[] = [];
    let returnedEdges: string[] = [];
    let returnedItemIds: string[] = [];
    let pathKeys: string[] = [];
    let returnedItemCount = 0;
    let identityPreserved = true;
    let citationClosed = true;

    const finish = (): CasePassResult => ({
      caseId: testCase.id,
      category: testCase.category,
      outcome,
      reasonCode,
      failureCodes,
      expectedEntityUrns: sorted(testCase.expected.entityUrns),
      returnedEntityUrns: sorted(returnedEntities),
      expectedEdgeFactKeys: sorted(testCase.expected.edgeFactKeys),
      returnedEdgeFactKeys: sorted(returnedEdges),
      returnedItemCount,
      identityPreserved,
      citationClosed,
      orderedItemIds: returnedItemIds,
      orderedPathKeys: pathKeys,
      latencyMs: Number((performance.now() - started).toFixed(3)),
      evidenceExpecting:
        testCase.expected.outcome === 'READY' || testCase.expected.outcome === 'SEED_ONLY',
      declaredEdges,
    });

    if (resolvedSeeds.length === 0) {
      reasonCode = 'SEED_NOT_FOUND';
      results.push(finish());
      continue;
    }

    const steps: TraversalStep[] = [];
    for (const seed of resolvedSeeds) {
      const derived = deriveSeedPlan(
        {
          urn: seed.urn,
          canonicalName: nodesByUrn.get(seed.urn)!.canonicalName,
          kind: seed.kind,
        },
        {
          maxDepth: testCase.maxDepth,
          ...(testCase.selectedRelations ? { selectedRelations: testCase.selectedRelations } : {}),
        }
      );
      steps.push(...derived.steps);
    }

    const plan: LogicalQueryPlan = {
      planId: PLAN_ID,
      queryIntent: testCase.intent,
      seedUrns: resolvedSeeds.map((seed) => seed.urn),
      traversalSteps: steps.slice(0, 5),
      overallMaxDepth: testCase.maxDepth,
      includeInferred: false,
      fulltextKeywords: [testCase.id],
      semanticQuery: testCase.query,
    };

    const validation = validateTraversalPlan(
      plan,
      new Set(resolvedSeeds.map((seed) => seed.urn)),
      seedKinds
    );
    if (!validation.valid) {
      reasonCode = validation.reason;
      results.push(finish());
      continue;
    }

    const gateway = createFixtureGateway(testCase);
    const traversal = await runBoundedGraphTraversal(validation.plan, SNAPSHOT_ID, gateway);

    if (traversal.status.status === 'error' || traversal.status.status === 'stale') {
      reasonCode = traversal.status.reason ?? null;
      results.push(finish());
      continue;
    }

    const graphItems = [
      ...traversal.entities,
      ...traversal.edges,
      ...traversal.chunks,
    ];
    const packages = buildProtectedGraphPackages({
      snapshotId: SNAPSHOT_ID,
      chunks: traversal.chunks,
      edges: traversal.edges,
      paths: traversal.paths,
    });
    const edgesByFactKey = new Map(traversal.edges.map((edge) => [edge.factKey, edge]));
    const selectedRelations = [...new Set(steps.map((step) => step.relationType))] as RelationType[];
    const ranked = rankGraphPackages(packages.packages, {
      selectedRelations,
      includeInferred: false,
      relationOf: (factKey) => edgesByFactKey.get(factKey)?.relationType,
      evidenceStrengthOf: (factKey) => edgesByFactKey.get(factKey)?.evidenceClass,
    });
    const fused = fuseRetrievalCandidates({ graph: graphItems }, 50, {
      protectedGraphPackages: ranked,
    });

    const rankOrder = new Map<string, number>();
    ranked.forEach((pkg, index) => {
      if (pkg.pathId) rankOrder.set(pkg.edgeIds.join('|'), index);
    });
    const orderedCandidates = [...traversal.paths].sort((a, b) => {
      const rankA = rankOrder.get(a.edgeFactKeys.join('|')) ?? Number.MAX_SAFE_INTEGER;
      const rankB = rankOrder.get(b.edgeFactKeys.join('|')) ?? Number.MAX_SAFE_INTEGER;
      if (rankA !== rankB) return rankA - rankB;
      return a.edgeFactKeys.join('|') < b.edgeFactKeys.join('|') ? -1 : 1;
    });
    const closedPaths = closeOrderedPaths(orderedCandidates, fused.items);

    returnedEntities = traversal.entities.map((entity) => entity.urn);
    returnedEdges = traversal.edges.map((edge) => edge.factKey);
    returnedItemIds = fused.items.map((item) => `${item.type}:${item.id}`);
    pathKeys = closedPaths.map((path) => path.edgeFactKeys.join('>'));
    returnedItemCount = fused.items.length;

    // Identity: every returned factKey must equal the fixture-declared key for
    // the same (subject, relation, object), and must be an expected key.
    const declaredByTriple = new Map(
      declaredEdges.map((edge) => [`${edge.subjectUrn}|${edge.relation}|${edge.objectUrn}`, edge.factKey])
    );
    for (const edge of traversal.edges) {
      const declaredKey = declaredByTriple.get(
        `${edge.sourceUrn}|${edge.relationType}|${edge.targetUrn}`
      );
      if (declaredKey !== edge.factKey) {
        identityPreserved = false;
        failureCodes.push('IDENTITY_MISMATCH');
      }
      if (
        testCase.expected.edgeFactKeys.length > 0 &&
        !testCase.expected.edgeFactKeys.includes(edge.factKey)
      ) {
        identityPreserved = false;
        failureCodes.push('IDENTITY_MISMATCH');
      }
    }

    // Closure: every hop of every traversal path must cite a returned chunk.
    const returnedChunkIds = new Set(traversal.chunks.map((chunk) => chunk.id));
    for (const path of traversal.paths) {
      const closed = path.hopSupportingChunkIds.every(
        (ids) => ids.length > 0 && ids.every((id) => returnedChunkIds.has(id))
      );
      if (!closed) {
        citationClosed = false;
        failureCodes.push('CITATION_NOT_CLOSED');
      }
    }

    const hasEdges = traversal.edges.length > 0;
    const hasPaths = traversal.paths.length > 0;
    const entityOnly = returnedItemCount > 0 && fused.items.every((item) => item.type === 'entity');

    if (returnedItemCount === 0) {
      outcome = 'NO_EVIDENCE';
    } else if (!hasEdges && !hasPaths && entityOnly) {
      outcome = 'SEED_ONLY';
      reasonCode = 'SEED_FOUND_NO_RELATION';
    } else {
      outcome = 'READY';
    }

    if (outcome !== testCase.expected.outcome) failureCodes.push('OUTCOME_MISMATCH');
    if (testCase.expected.reasonCode && reasonCode !== testCase.expected.reasonCode) {
      failureCodes.push('REASON_CODE_MISMATCH');
    }
    if (
      sorted(testCase.expected.entityUrns).join('|') !== sorted(returnedEntities).join('|')
    ) {
      failureCodes.push('ENTITY_SET_MISMATCH');
    }
    if (
      sorted(testCase.expected.edgeFactKeys).join('|') !== sorted(returnedEdges).join('|')
    ) {
      failureCodes.push('EDGE_SET_MISMATCH');
    }
    if (closedPaths.length < testCase.expected.minPathCount) {
      failureCodes.push('PATH_COUNT_TOO_LOW');
    }
    if (
      testCase.expected.maxPathCount !== undefined &&
      closedPaths.length > testCase.expected.maxPathCount
    ) {
      failureCodes.push('PATH_COUNT_TOO_HIGH');
    }

    results.push(finish());
  }

  return { results };
}

function aggregate(results: readonly CasePassResult[]): GraphMetrics {
  const evidenceExpecting = results.filter((result) => result.evidenceExpecting);
  const zeroResults = evidenceExpecting.filter(
    (result) => result.returnedEntityUrns.length === 0
  ).length;

  const expectedEntityCount = results.reduce(
    (total, result) => total + result.expectedEntityUrns.length,
    0
  );
  const matchedEntityCount = results.reduce(
    (total, result) =>
      total +
      result.expectedEntityUrns.filter((urn) => result.returnedEntityUrns.includes(urn)).length,
    0
  );

  const returnedEdgeCount = results.reduce(
    (total, result) => total + result.returnedEdgeFactKeys.length,
    0
  );
  const matchedEdgeCount = results.reduce(
    (total, result) =>
      total +
      result.returnedEdgeFactKeys.filter((key) => result.expectedEdgeFactKeys.includes(key)).length,
    0
  );

  const samples = results.map((result) => result.latencyMs);

  return {
    totalCases: results.length,
    zeroResultRate: evidenceExpecting.length > 0 ? zeroResults / evidenceExpecting.length : 0,
    zeroResultDenominator: evidenceExpecting.length,
    entityRecall: expectedEntityCount > 0 ? matchedEntityCount / expectedEntityCount : 1,
    entityRecallDenominator: expectedEntityCount,
    edgePrecision: returnedEdgeCount > 0 ? matchedEdgeCount / returnedEdgeCount : 1,
    edgePrecisionDenominator: returnedEdgeCount,
    identityPreserved: results.every((result) => result.identityPreserved),
    citationClosed: results.every((result) => result.citationClosed),
    deterministicOrdering: true,
    latency: {
      samples: samples.length,
      p50Ms: percentile(samples, 0.5),
      p95Ms: percentile(samples, 0.95),
    },
    caseResults: results.map((result) => ({
      caseId: result.caseId,
      category: result.category,
      passed: result.failureCodes.length === 0,
      outcome: result.outcome,
      reasonCode: result.reasonCode,
      failureCodes: result.failureCodes,
      returnedItemCount: result.returnedItemCount,
      entityRecall:
        result.expectedEntityUrns.length > 0
          ? result.expectedEntityUrns.filter((urn) => result.returnedEntityUrns.includes(urn)).length /
            result.expectedEntityUrns.length
          : 1,
      edgePrecision:
        result.returnedEdgeFactKeys.length > 0
          ? result.returnedEdgeFactKeys.filter((key) => result.expectedEdgeFactKeys.includes(key)).length /
            result.returnedEdgeFactKeys.length
          : 1,
      identityPreserved: result.identityPreserved,
      citationClosed: result.citationClosed,
      orderedItemIds: result.orderedItemIds,
      orderedPathKeys: result.orderedPathKeys,
      latencyMs: result.latencyMs,
    })),
  };
}

function reverseCase(testCase: GraphReferenceCase): GraphReferenceCase {
  return {
    ...testCase,
    nodes: [...testCase.nodes].reverse(),
    edges: [...testCase.edges].reverse(),
    chunks: [...testCase.chunks].reverse(),
  };
}

/**
 * Evaluates the committed reference set twice: fixture order and fully reversed
 * order. Only ordering-independent output passes the determinism dimension.
 */
export async function evaluateGraphReferenceCases(
  cases: readonly GraphReferenceCase[]
): Promise<GraphMetrics> {
  const forward = await runPass(cases);
  const reversed = await runPass([...cases].reverse().map(reverseCase));

  const reversedById = new Map(reversed.results.map((result) => [result.caseId, result]));
  let deterministicOrdering = forward.results.length === reversed.results.length;
  for (const result of forward.results) {
    const mirrored = reversedById.get(result.caseId);
    if (!mirrored) {
      deterministicOrdering = false;
      break;
    }
    if (
      result.orderedItemIds.join('|') !== mirrored.orderedItemIds.join('|') ||
      result.orderedPathKeys.join('|') !== mirrored.orderedPathKeys.join('|')
    ) {
      deterministicOrdering = false;
      break;
    }
  }

  const metrics = aggregate(forward.results);
  return { ...metrics, deterministicOrdering };
}

/**
 * Content-free baseline artifact (D-22, T-24-17/T-24-18). Only IDs, stable
 * codes, counts, hashes, thresholds, and metrics are persisted.
 */
export const GRAPH_BASELINE_SCHEMA_VERSION = '1.0.0' as const;

export function computeFixtureHash(fixtureBytes: string | Uint8Array): string {
  return createHash('sha256').update(fixtureBytes).digest('hex');
}

export interface GraphBaseline {
  readonly schemaVersion: typeof GRAPH_BASELINE_SCHEMA_VERSION;
  readonly createdAt: string;
  readonly fixtureHash: string;
  readonly thresholds: typeof GRAPH_GATE_THRESHOLDS;
  readonly metrics: {
    readonly totalCases: number;
    readonly zeroResultRate: number;
    readonly zeroResultDenominator: number;
    readonly entityRecall: number;
    readonly entityRecallDenominator: number;
    readonly edgePrecision: number;
    readonly edgePrecisionDenominator: number;
    readonly identityPreserved: boolean;
    readonly citationClosed: boolean;
    readonly deterministicOrdering: boolean;
    readonly latency: GraphMetrics['latency'];
    readonly cases: readonly {
      readonly caseId: string;
      readonly category: string;
      readonly passed: boolean;
      readonly outcome: string;
      readonly reasonCode: string | null;
      readonly failureCodes: readonly string[];
      readonly returnedItemCount: number;
      readonly latencyMs: number;
    }[];
  };
  readonly passed: boolean;
  readonly failures: readonly GraphGateFailure[];
}

export function buildGraphBaseline(
  metrics: GraphMetrics,
  verdict: GraphGateVerdict,
  fixtureHash: string,
  createdAt: string
): GraphBaseline {
  return {
    schemaVersion: GRAPH_BASELINE_SCHEMA_VERSION,
    createdAt,
    fixtureHash,
    thresholds: GRAPH_GATE_THRESHOLDS,
    metrics: {
      totalCases: metrics.totalCases,
      zeroResultRate: metrics.zeroResultRate,
      zeroResultDenominator: metrics.zeroResultDenominator,
      entityRecall: metrics.entityRecall,
      entityRecallDenominator: metrics.entityRecallDenominator,
      edgePrecision: metrics.edgePrecision,
      edgePrecisionDenominator: metrics.edgePrecisionDenominator,
      identityPreserved: metrics.identityPreserved,
      citationClosed: metrics.citationClosed,
      deterministicOrdering: metrics.deterministicOrdering,
      latency: metrics.latency,
      cases: metrics.caseResults.map((result) => ({
        caseId: result.caseId,
        category: result.category,
        passed: result.passed,
        outcome: result.outcome,
        reasonCode: result.reasonCode,
        failureCodes: result.failureCodes,
        returnedItemCount: result.returnedItemCount,
        latencyMs: result.latencyMs,
      })),
    },
    passed: verdict.passed,
    failures: verdict.failures,
  };
}

export function serializeGraphBaseline(baseline: GraphBaseline): string {
  return `${JSON.stringify(baseline, null, 2)}\n`;
}

/**
 * Refuses to overwrite a baseline whose fixture hash differs from the current
 * committed fixture bytes. Re-baselining must be explicit (delete the artifact).
 */
export function checkBaselineFixtureHash(
  existingBaselineJson: string | null,
  currentFixtureHash: string
): 'ok' | 'FIXTURE_HASH_MISMATCH' {
  if (!existingBaselineJson) return 'ok';
  try {
    const parsed = JSON.parse(existingBaselineJson) as { fixtureHash?: unknown };
    if (parsed.fixtureHash !== currentFixtureHash) return 'FIXTURE_HASH_MISMATCH';
  } catch {
    return 'FIXTURE_HASH_MISMATCH';
  }
  return 'ok';
}

/**
 * Hard gate. Returns only stable metric codes and case IDs — never queries,
 * chunks, endpoints, or credentials.
 */
export function evaluateGraphGate(
  metrics: GraphMetrics,
  thresholds = GRAPH_GATE_THRESHOLDS
): GraphGateVerdict {
  const failures: GraphGateFailure[] = [];

  if (metrics.zeroResultRate > thresholds.maxZeroResultRate) {
    failures.push({ code: 'ZERO_RESULT_RATE' });
  }
  if (metrics.entityRecall < thresholds.minEntityRecall) {
    failures.push({ code: 'ENTITY_RECALL' });
  }
  if (metrics.edgePrecision < thresholds.minEdgePrecision) {
    failures.push({ code: 'EDGE_PRECISION' });
  }
  if (thresholds.requireIdentityPreservation && !metrics.identityPreserved) {
    failures.push({ code: 'IDENTITY_PRESERVATION' });
  }
  if (thresholds.requireCitationClosure && !metrics.citationClosed) {
    failures.push({ code: 'CITATION_CLOSURE' });
  }
  if (thresholds.requireDeterministicOrdering && !metrics.deterministicOrdering) {
    failures.push({ code: 'DETERMINISTIC_ORDERING' });
  }
  if (metrics.latency.samples < thresholds.minLatencySamples) {
    failures.push({ code: 'INSUFFICIENT_LATENCY_SAMPLES' });
  }

  for (const result of metrics.caseResults) {
    if (!result.passed) {
      failures.push({ code: 'CASE_FAILED', caseId: result.caseId });
    }
  }

  return { passed: failures.length === 0, failures };
}
