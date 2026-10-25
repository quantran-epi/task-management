import {
  RetrievalRequest,
  RetrievalRequestSchema,
  RetrievalResponse,
  RetrievalResponseSchema,
  CompleteModalityStatus,
  ModalityStatusDetail,
  EmbeddingProviderMetadata,
  RetrievalOutcome,
  ChunkItem,
  EntityItem,
  EdgeItem,
  RetrievalItem,
  ModalityKind,
  OrderedPath,
  ReasonCode,
  REASON_CODES,
  StageDiagnostic,
} from '../types/retrievalProtocol.js';
import type {
  EmbeddingProvider,
  QueryPlanner,
  RetrievalIndexGateway,
  GraphRetrievalGateway,
  PinnedSnapshotLease,
  OperationOptions,
} from '../retrieval/contracts.js';
import {
  buildQueryExecutionPlan,
  type QueryExecutionPlanningOutcome,
} from '../retrieval/queryPlanning.js';
import {
  runBoundedGraphTraversal,
  type BoundedGraphTraversalResult,
  type BoundedGraphTraversalStatus,
} from '../retrieval/graphTraversal.js';
import {
  buildConflictGroups,
  buildProtectedGraphPackages,
  closeOrderedPaths,
  fuseRetrievalCandidates,
  rankGraphPackages,
  tagRetrievalConflicts,
} from '../retrieval/fusion.js';

export interface RetrievalTimeouts {
  readonly fulltextMs: number;
  readonly vectorMs: number;
  readonly graphMs: number;
}

export const DEFAULT_RETRIEVAL_TIMEOUTS: RetrievalTimeouts = Object.freeze({
  fulltextMs: 2000,
  vectorMs: 5000,
  graphMs: 10000,
});

const SEMANTIC_EVIDENCE_FLOOR = 0.7;
const CROSS_LINGUAL_SEMANTIC_EVIDENCE_FLOOR = 0.5;
const NON_ASCII_LETTER_RE = /[^\x00-\x7F]/;
const QUERY_STOPWORDS = new Set([
  'ai', 'cai', 'cac', 'cau', 'cho', 'co', 'cua', 'dien', 'do', 'duoc', 'gi', 'hay',
  'hoat', 'khi', 'la', 'lam', 'nao', 'nay', 'nhung', 'o', 'ra', 'sao', 'the', 'thi',
  'trong', 'tu', 'va', 've', 'voi', 'what', 'which', 'who', 'where', 'why', 'how',
  'is', 'are', 'does', 'do', 'of', 'the', 'to', 'from', 'in', 'for', 'and', 'or',
  'explain', 'describe', 'detail', 'details', 'information',
  'container', 'process', 'procedure', 'quy', 'trinh', 'thu', 'tuc',
]);

function normalizeEvidenceTokens(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .match(/[a-z0-9_$#]+/g) ?? [];
}

interface MaterialQueryTerms {
  readonly all: readonly string[];
  readonly technical: readonly string[];
}

function materialQueryTerms(
  query: string,
  resolvedUrns: readonly string[],
  graphItems: readonly (ChunkItem | EntityItem | EdgeItem)[]
): MaterialQueryTerms {
  const entityTokens = new Set<string>();
  for (const urn of resolvedUrns) {
    for (const token of normalizeEvidenceTokens(decodeURIComponent(urn))) entityTokens.add(token);
  }
  for (const item of graphItems) {
    if (item.type !== 'entity' || !resolvedUrns.includes(item.urn)) continue;
    for (const token of normalizeEvidenceTokens(item.canonicalName)) entityTokens.add(token);
  }
  const all = [...new Set(normalizeEvidenceTokens(query))].filter(
    (token) => token.length >= 2 && !QUERY_STOPWORDS.has(token) && !entityTokens.has(token)
  );
  const technical = [...new Set(
    (query.match(/[A-Za-z0-9_$#]+/g) ?? [])
      .filter((token) => /[A-Z]{2,}/.test(token) || /(?:[A-Za-z]\d|\d[A-Za-z])/.test(token))
      .flatMap(normalizeEvidenceTokens)
      .filter((token) => all.includes(token))
  )];
  return { all, technical };
}

function chunkSupportsTerms(
  chunk: ChunkItem,
  terms: MaterialQueryTerms,
  options?: { isMultiHopFlow?: boolean; technicalCorroborated?: boolean }
): boolean {
  if (terms.all.length === 0) return true;
  const tokens = new Set(normalizeEvidenceTokens(
    `${chunk.sourceDocumentTitle} ${chunk.sectionAnchor ?? ''} ${chunk.rawSnippet}`
  ));

  const multiHopCorroborated = Boolean(options?.isMultiHopFlow && options?.technicalCorroborated);

  if (terms.technical.length > 0) {
    if (!multiHopCorroborated) {
      if (!terms.technical.every((term) => tokens.has(term))) {
        return false;
      }
    } else {
      if (!terms.all.some((term) => tokens.has(term))) {
        return false;
      }
    }
  }

  const matched = terms.all.filter((term) => tokens.has(term)).length;
  if (multiHopCorroborated) {
    return matched >= 1;
  }
  return matched >= Math.min(2, terms.all.length) && matched / terms.all.length >= 0.5;
}

/**
 * Validates integer in range [min, max] or throws error.
 */
function parseSafeTimeout(envVal: string | undefined, defaultVal: number, varName: string): number {
  if (envVal === undefined || envVal === '') {
    return defaultVal;
  }
  const parsed = Number(envVal);
  if (!Number.isInteger(parsed) || parsed < 50 || parsed > 30000) {
    throw new Error(
      `INVALID_TIMEOUT: Environment variable ${varName} must be an integer between 50 and 30000 ms, got "${envVal}"`
    );
  }
  return parsed;
}

/**
 * Reads retrieval timeouts from environment record with configurable defaults (2000/5000/10000 ms).
 */
export function readRetrievalTimeouts(env: Record<string, string | undefined>): RetrievalTimeouts {
  return {
    fulltextMs: parseSafeTimeout(env.RETRIEVAL_TIMEOUT_FULLTEXT_MS, DEFAULT_RETRIEVAL_TIMEOUTS.fulltextMs, 'RETRIEVAL_TIMEOUT_FULLTEXT_MS'),
    vectorMs: parseSafeTimeout(env.RETRIEVAL_TIMEOUT_VECTOR_MS, DEFAULT_RETRIEVAL_TIMEOUTS.vectorMs, 'RETRIEVAL_TIMEOUT_VECTOR_MS'),
    graphMs: parseSafeTimeout(env.RETRIEVAL_TIMEOUT_GRAPH_MS, DEFAULT_RETRIEVAL_TIMEOUTS.graphMs, 'RETRIEVAL_TIMEOUT_GRAPH_MS'),
  };
}

export interface RetrievalServiceDependencies {
  readonly indexGateway: RetrievalIndexGateway;
  readonly embeddingProvider?: EmbeddingProvider | undefined;
  readonly queryPlanner: QueryPlanner;
  readonly graphGateway: GraphRetrievalGateway;
  readonly now?: (() => number) | undefined;
}

export interface RetrievalServiceOptions {
  readonly timeouts?: Partial<RetrievalTimeouts> | undefined;
}

interface ModalityRunResult<T> {
  readonly status: ModalityStatusDetail;
  readonly items: readonly T[];
  readonly paths?: readonly OrderedPath[] | undefined;
}

type GraphModalityRunResult = {
  readonly status: BoundedGraphTraversalStatus;
  readonly items: readonly (ChunkItem | EntityItem | EdgeItem)[];
  readonly pathCandidates: BoundedGraphTraversalResult['paths'];
};

/**
 * Executes an async task with AbortController deadline and optional parent signal.
 */
async function runWithTimeout<T>(
  timeoutMs: number,
  task: (signal: AbortSignal) => Promise<T>,
  parentSignal?: AbortSignal
): Promise<{ result?: T; timedOut: boolean; latencyMs: number; error?: any }> {
  const controller = new AbortController();
  const start = Date.now();
  let timer: any;

  if (parentSignal?.aborted) {
    controller.abort(parentSignal.reason);
  } else if (parentSignal) {
    parentSignal.addEventListener('abort', () => controller.abort(parentSignal.reason), { once: true });
  }

  const timeoutPromise = new Promise<{ timedOut: true; latencyMs: number }>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ timedOut: true, latencyMs: Date.now() - start });
    }, timeoutMs);
  });

  try {
    const outcome = await Promise.race([
      task(controller.signal).then((val) => ({ result: val, timedOut: false, latencyMs: Date.now() - start })),
      timeoutPromise,
    ]);

    clearTimeout(timer);
    return outcome;
  } catch (err: any) {
    clearTimeout(timer);
    const latencyMs = Date.now() - start;
    const isAborted = controller.signal.aborted || err?.name === 'AbortError';
    return {
      timedOut: isAborted,
      latencyMs,
      error: err,
    };
  }
}

/**
 * RetrievalService coordinating pinned snapshot leases, query planning,
 * parallel modality execution, timeouts, fusion, and response envelope assembly.
 */
export class RetrievalService {
  private readonly timeouts: RetrievalTimeouts;

  constructor(
    private readonly deps: RetrievalServiceDependencies,
    options?: RetrievalServiceOptions
  ) {
    this.timeouts = {
      fulltextMs: options?.timeouts?.fulltextMs ?? DEFAULT_RETRIEVAL_TIMEOUTS.fulltextMs,
      vectorMs: options?.timeouts?.vectorMs ?? DEFAULT_RETRIEVAL_TIMEOUTS.vectorMs,
      graphMs: options?.timeouts?.graphMs ?? DEFAULT_RETRIEVAL_TIMEOUTS.graphMs,
    };
  }

  /**
   * Retrieves hybrid multi-modal evidence for a query against a document set.
   */
  async retrieve(
    setId: string,
    rawRequest: RetrievalRequest,
    options?: OperationOptions
  ): Promise<RetrievalResponse> {
    // 1. Boundary schema validation
    const request = RetrievalRequestSchema.parse(rawRequest);

    // 2. Acquire pinned snapshot lease
    const lease = await this.deps.indexGateway.acquirePinnedSnapshot(setId);
    if (!lease) {
      // D-24: Return NO_EVIDENCE when no active snapshot exists
      return RetrievalResponseSchema.parse({
        outcome: 'NO_EVIDENCE',
        snapshotId: 'gsnap_00000000',
        embeddingProvider: this.deps.embeddingProvider?.describe() ?? {
          provider: 'local-onnx',
          model: 'unconfigured',
          revision: 'none',
          dimensions: 384,
          policyVersion: 'none',
        },
        items: [],
        totalCandidates: 0,
        modalitiesUsed: [],
        modalityStatus: {
          fulltext: { status: 'unavailable', latencyMs: 0, itemCount: 0, reason: 'PINNED_SNAPSHOT_UNAVAILABLE' },
          vector: { status: 'unavailable', latencyMs: 0, itemCount: 0, reason: 'PINNED_SNAPSHOT_UNAVAILABLE' },
          graph: { status: 'unavailable', latencyMs: 0, itemCount: 0, reason: 'PINNED_SNAPSHOT_UNAVAILABLE' },
        },
        diagnostics: { degraded: false },
        planTrace: { fastPath: false, degradedFallback: false, reasonCode: 'PINNED_SNAPSHOT_UNAVAILABLE' },
        reason: 'PINNED_SNAPSHOT_UNAVAILABLE',
        suggestedRefinements: ['Activate or rebuild a valid knowledge graph snapshot before querying.'],
      });
    }

    try {
      return await this.executeUnderLease(setId, lease, request, options);
    } finally {
      // Guarantee lease release exactly once in finally block
      try {
        await lease.release();
      } catch {
        // Silently swallow lease release failure on exit
      }
    }
  }

  private async executeUnderLease(
    _setId: string,
    lease: PinnedSnapshotLease,
    request: RetrievalRequest,
    options?: OperationOptions
  ): Promise<RetrievalResponse> {
    const pinnedSnapshotId = lease.snapshotId;

    // 3. Planning phase
    const planningStartMs = Date.now();
    const planningOutcome = await buildQueryExecutionPlan({
      request,
      pinnedSnapshotId,
      gateway: this.deps.graphGateway,
      planner: this.deps.queryPlanner,
      options,
    });
    const planningLatencyMs = Math.max(0, Date.now() - planningStartMs);

    const isUnsupported = planningOutcome.status === 'unsupported';
    const isClarification = planningOutcome.status === 'needsClarification';
    const planTrace = planningOutcome.planTrace;

    // Keep planner keywords, but do not turn several alternatives into one mandatory phrase.
    const fulltextKeywords = isClarification
      ? planningOutcome.fulltextKeywords
      : isUnsupported
      ? [request.query.trim()]
      : planningOutcome.plan.fulltextKeywords;

    // Semantic query string
    const semanticQueryText = isClarification
      ? planningOutcome.semanticQuery
      : isUnsupported
      ? request.query.trim()
      : planningOutcome.plan.semanticQuery;

    // 4. Modality construction & parallel start in same event loop turn
    const fulltextPromise = this.runFulltextModality(
      pinnedSnapshotId,
      fulltextKeywords,
      request.limit,
      options?.signal
    );

    const vectorPromise = this.runVectorModality(
      pinnedSnapshotId,
      semanticQueryText,
      request.limit,
      options?.signal
    );

    const graphPromise = this.runGraphModality(
      pinnedSnapshotId,
      planningOutcome,
      request.includeInferred,
      options?.signal
    );

    // Concurrently await all 3 modalities using Promise.allSettled
    const [fulltextSettled, vectorSettled, graphSettled] = await Promise.allSettled([
      fulltextPromise,
      vectorPromise,
      graphPromise,
    ]);

    // 5. Extract results & modality statuses safely
    const fulltextResult: ModalityRunResult<ChunkItem> =
      fulltextSettled.status === 'fulfilled'
        ? fulltextSettled.value
        : {
            status: { status: 'error', latencyMs: 0, itemCount: 0, reason: 'PROVIDER_ERROR' },
            items: [],
          };

    const vectorResult: ModalityRunResult<ChunkItem> =
      vectorSettled.status === 'fulfilled'
        ? vectorSettled.value
        : {
            status: { status: 'error', latencyMs: 0, itemCount: 0, reason: 'PROVIDER_ERROR' },
            items: [],
          };

    const graphResult: GraphModalityRunResult =
      graphSettled.status === 'fulfilled'
        ? graphSettled.value
        : {
            status: {
              status: 'error',
              latencyMs: 0,
              itemCount: 0,
              entityCount: 0,
              edgeCount: 0,
              pathCount: 0,
              reason: 'PROVIDER_ERROR',
            },
            items: [],
            pathCandidates: [],
          };

    // Filter stale candidates if any adapter returned mismatched snapshotId
    const sanitizeCandidates = <T extends RetrievalItem>(items: readonly T[], expectedSnapshotId: string): T[] => {
      return items.filter((item) => item.snapshotId === expectedSnapshotId);
    };

    const ftValidItems = sanitizeCandidates(fulltextResult.items, pinnedSnapshotId);
    if (ftValidItems.length !== fulltextResult.items.length) {
      (fulltextResult.status as any).status = 'stale';
      (fulltextResult.status as any).reason = 'PINNED_SNAPSHOT_UNAVAILABLE';
    }

    const vecValidItems = sanitizeCandidates(vectorResult.items, pinnedSnapshotId);
    if (vecValidItems.length !== vectorResult.items.length) {
      (vectorResult.status as any).status = 'stale';
      (vectorResult.status as any).reason = 'PINNED_SNAPSHOT_UNAVAILABLE';
    }

    const graphValidItems = sanitizeCandidates(graphResult.items, pinnedSnapshotId);
    if (graphValidItems.length !== graphResult.items.length) {
      (graphResult.status as any).status = 'stale';
      (graphResult.status as any).reason = 'PINNED_SNAPSHOT_UNAVAILABLE';
    }

    const enforceRelevanceGate = !planTrace.fastPath && !isClarification && !isUnsupported;
    const resolvedUrns = planTrace.resolvedUrns ?? [];
    const materialTerms = materialQueryTerms(request.query, resolvedUrns, graphValidItems);

    const isMultiHopFlow =
      planTrace.intent === 'FLOW_TRAVERSAL' ||
      planTrace.intent === 'IMPACT_ANALYSIS' ||
      (planTrace.depth ?? 1) > 1 ||
      graphResult.pathCandidates.some((p) => p.edgeFactKeys.length > 1);

    const poolTokens = new Set<string>();
    const allCandidateChunks = [
      ...ftValidItems,
      ...vecValidItems,
      ...graphValidItems.filter((item): item is ChunkItem => item.type === 'chunk'),
    ];
    for (const chunk of allCandidateChunks) {
      for (const token of normalizeEvidenceTokens(
        `${chunk.sourceDocumentTitle} ${chunk.sectionAnchor ?? ''} ${chunk.rawSnippet}`
      )) {
        poolTokens.add(token);
      }
    }

    const technicalCorroborated =
      materialTerms.technical.length === 0 ||
      materialTerms.technical.every((term) => poolTokens.has(term));

    const lexicalEvidence = technicalCorroborated
      ? ftValidItems.filter((item) => chunkSupportsTerms(item, materialTerms, {
          isMultiHopFlow,
          technicalCorroborated,
        }))
      : [];
    // ponytail: calibrated for multilingual-e5-small; move floors into provider policy when models vary.
    const semanticFloor = resolvedUrns.length > 0 && NON_ASCII_LETTER_RE.test(request.query)
      ? CROSS_LINGUAL_SEMANTIC_EVIDENCE_FLOOR
      : SEMANTIC_EVIDENCE_FLOOR;
    const semanticEvidence = technicalCorroborated
      ? vecValidItems.filter((item) => item.score >= semanticFloor)
      : [];
    const citedGraphChunks = graphValidItems.filter(
      (item): item is ChunkItem =>
        item.type === 'chunk' && chunkSupportsTerms(item, materialTerms, {
          isMultiHopFlow,
          technicalCorroborated,
        })
    );
    const hasTextualSupport =
      technicalCorroborated &&
      (materialTerms.all.length === 0 ||
        lexicalEvidence.length > 0 ||
        semanticEvidence.length > 0 ||
        citedGraphChunks.length > 0);
    const relevantVectorItems = enforceRelevanceGate && !hasTextualSupport ? [] : vecValidItems;
    const relevantFulltextItems = enforceRelevanceGate && !hasTextualSupport ? [] : ftValidItems;
    // Graph items are already ontology-valid, snapshot-consistent, cap-bounded, and
    // citation-closed by the bounded traversal. The text-corroboration gate applies
    // to fulltext/vector only; a resolved seed must not be blanked (D-01, T-24-06).
    const relevantGraphItems = graphValidItems;

    const modalityStatus: CompleteModalityStatus = {
      fulltext: fulltextResult.status,
      vector: vectorResult.status,
      graph: {
        ...graphResult.status,
        entityCount: graphResult.status.entityCount ?? 0,
        edgeCount: graphResult.status.edgeCount ?? 0,
        pathCount: graphResult.status.pathCount ?? 0,
      },
    };

    // 6. RRF Fusion across surviving ready/truncated candidates
    const candidatesForFusion: {
      vector?: ChunkItem[];
      fulltext?: ChunkItem[];
      graph?: Array<ChunkItem | EntityItem | EdgeItem>;
    } = {};

    if (modalityStatus.vector.status === 'ok' || modalityStatus.vector.status === 'truncated') {
      candidatesForFusion.vector = relevantVectorItems;
    }
    if (modalityStatus.fulltext.status === 'ok' || modalityStatus.fulltext.status === 'truncated') {
      candidatesForFusion.fulltext = relevantFulltextItems;
    }
    if (modalityStatus.graph.status === 'ok' || modalityStatus.graph.status === 'truncated') {
      candidatesForFusion.graph = relevantGraphItems;
    }

    const graphEdges = relevantGraphItems.filter(
      (item): item is EdgeItem => item.type === 'edge'
    );
    const edgesByFactKey = new Map(graphEdges.map((edge) => [edge.factKey, edge]));
    const builtPackages = buildProtectedGraphPackages({
      snapshotId: pinnedSnapshotId,
      chunks: [...relevantVectorItems, ...relevantFulltextItems, ...relevantGraphItems]
        .filter((item): item is ChunkItem => item.type === 'chunk'),
      edges: graphEdges,
      paths: graphResult.pathCandidates,
    });
    const selectedRelations = planningOutcome.status === 'executable'
      ? [...new Set(planningOutcome.plan.traversalSteps.map((step) => step.relationType))]
      : [];
    const rankedPackages = rankGraphPackages(builtPackages.packages, {
      selectedRelations,
      includeInferred: request.includeInferred,
      relationOf: (factKey) => edgesByFactKey.get(factKey)?.relationType,
      evidenceStrengthOf: (factKey) => edgesByFactKey.get(factKey)?.evidenceClass,
    });

    const fused = fuseRetrievalCandidates(candidatesForFusion, request.limit, {
      protectedGraphPackages: rankedPackages,
    });

    // Step 7: Citation closure & conflict tagging
    const tagged = tagRetrievalConflicts(fused.items, {
      snapshotId: pinnedSnapshotId,
      candidatePool: [
        ...relevantVectorItems,
        ...relevantFulltextItems,
        ...relevantGraphItems,
      ],
    });

    const finalItems = tagged.items;
    // Path ordering follows package rank order, never the gateway array index (D-18).
    const rankOrder = new Map<string, number>();
    rankedPackages.forEach((pkg, index) => {
      if (pkg.pathId) rankOrder.set(pkg.edgeIds.join('|'), index);
    });
    const orderedCandidates = [...graphResult.pathCandidates].sort((a, b) => {
      const rankA = rankOrder.get(a.edgeFactKeys.join('|')) ?? Number.MAX_SAFE_INTEGER;
      const rankB = rankOrder.get(b.edgeFactKeys.join('|')) ?? Number.MAX_SAFE_INTEGER;
      if (rankA !== rankB) return rankA - rankB;
      return a.edgeFactKeys.join('|') < b.edgeFactKeys.join('|') ? -1 : 1;
    });
    const paths = closeOrderedPaths(orderedCandidates, finalItems);
    const conflictGroups = buildConflictGroups(finalItems);
    const graphAfterFusion = {
      entity: finalItems.filter((item) => item.type === 'entity').length,
      edge: finalItems.filter((item) => item.type === 'edge').length,
      path: paths.length,
    };
    const graphBeforeFusion = {
      entity: modalityStatus.graph.entityCount ?? 0,
      edge: modalityStatus.graph.edgeCount ?? 0,
      path: modalityStatus.graph.pathCount ?? 0,
    };

    // Determine modalities used (contributing list)
    const modalitiesUsedSet = new Set<ModalityKind>();
    for (const it of finalItems) {
      for (const m of it.modalitiesContributed) {
        modalitiesUsedSet.add(m);
      }
    }
    const modalitiesUsed = (['vector', 'fulltext', 'graph'] as const).filter((m) =>
      modalitiesUsedSet.has(m)
    );

    // Diagnostics & degradation checks
    const degradedReasons: string[] = [];
    if (modalityStatus.fulltext.status !== 'ok' && modalityStatus.fulltext.status !== 'truncated') {
      degradedReasons.push(`fulltext: ${modalityStatus.fulltext.reason ?? modalityStatus.fulltext.status}`);
    }
    if (modalityStatus.vector.status !== 'ok' && modalityStatus.vector.status !== 'truncated') {
      degradedReasons.push(`vector: ${modalityStatus.vector.reason ?? modalityStatus.vector.status}`);
    }
    if (
      modalityStatus.graph.status !== 'ok' &&
      modalityStatus.graph.status !== 'truncated' &&
      modalityStatus.graph.reason !== 'NO_GRAPH_SEED'
    ) {
      degradedReasons.push(`graph: ${modalityStatus.graph.reason ?? modalityStatus.graph.status}`);
    }
    if (planTrace.degradedFallback) {
      degradedReasons.push('planner: fallback');
    }

    const isDegraded = degradedReasons.length > 0;

    // Outcome determination per D-23
    let outcome: RetrievalOutcome;

    const hasClarificationCandidates =
      isClarification && (((planningOutcome as any).safeCandidates?.length ?? 0) > 0);

    const graphStatus = modalityStatus.graph.status;
    // SEED_ONLY means the whole response is seed identity: at least one entity
    // item, no edges, no paths, no conflicts, and no chunk evidence at all.
    const graphSeedOnly =
      (graphStatus === 'ok' || graphStatus === 'truncated') &&
      (modalityStatus.graph.entityCount ?? 0) > 0 &&
      (modalityStatus.graph.edgeCount ?? 0) === 0 &&
      (modalityStatus.graph.pathCount ?? 0) === 0 &&
      finalItems.length > 0 &&
      finalItems.every((item) => item.type === 'entity') &&
      paths.length === 0 &&
      conflictGroups.length === 0;

    if (isUnsupported) {
      outcome = 'UNSUPPORTED';
    } else if (hasClarificationCandidates) {
      outcome = 'NEEDS_CLARIFICATION';
    } else if (isClarification && !hasClarificationCandidates) {
      outcome = 'NO_EVIDENCE';
    } else if (graphSeedOnly) {
      outcome = 'SEED_ONLY';
    } else if (finalItems.length === 0) {
      outcome = 'NO_EVIDENCE';
    } else if (isDegraded) {
      outcome = 'DEGRADED';
    } else {
      outcome = 'READY';
    }

    const rawProviderMeta = this.deps.embeddingProvider?.describe() ?? {
      provider: 'local-onnx',
      model: 'unconfigured',
      revision: 'none',
      dimensions: 384,
      policyVersion: 'none',
    };

    // T-18-01: Redact any accidental secret/endpoint/key fields from provider metadata
    const providerMetadata: EmbeddingProviderMetadata = {
      provider: rawProviderMeta.provider,
      model: rawProviderMeta.model,
      revision: rawProviderMeta.revision,
      dimensions: rawProviderMeta.dimensions,
      policyVersion: rawProviderMeta.policyVersion,
    };

    // 8. Content-free stage diagnostics (D-19, T-24-07)
    const asReasonCodes = (codes: readonly (string | undefined)[]): ReasonCode[] =>
      codes.filter((code): code is ReasonCode =>
        Boolean(code) && (REASON_CODES as readonly string[]).includes(code as string)
      );

    const stageDiagnostics: StageDiagnostic[] = [];
    const failedSeeds = planningOutcome.status === 'executable'
      ? [...planningOutcome.failedSeeds]
      : [];
    const resolvedSeedCount = planTrace.resolvedUrns?.length ?? 0;

    stageDiagnostics.push({
      stage: 'entity_resolution',
      status: 'ok',
      latencyMs: 0,
      accepted: resolvedSeedCount,
      rejected: failedSeeds.length,
      truncated: false,
      fallback: false,
      reasonCodes: asReasonCodes(failedSeeds.map((seed) => seed.reasonCode)),
    });

    stageDiagnostics.push({
      stage: 'validation',
      status: failedSeeds.length > 0 ? 'truncated' : 'ok',
      latencyMs: 0,
      accepted: resolvedSeedCount,
      rejected: failedSeeds.length,
      truncated: false,
      fallback: false,
      reasonCodes: asReasonCodes(failedSeeds.map((seed) => seed.reasonCode)),
    });

    stageDiagnostics.push({
      stage: 'planning',
      status: planTrace.degradedFallback ? 'truncated' : 'ok',
      latencyMs: planningLatencyMs,
      accepted: resolvedSeedCount,
      rejected: failedSeeds.length,
      truncated: false,
      fallback: Boolean(planTrace.degradedFallback),
      ...(planTrace.degradedFallback ? { fallbackReason: 'FALLBACK_ONE_HOP' as const } : {}),
      reasonCodes: asReasonCodes([planTrace.reasonCode]),
    });

    stageDiagnostics.push({
      stage: 'neo4j_traversal',
      status: modalityStatus.graph.status,
      latencyMs: modalityStatus.graph.latencyMs,
      accepted: (modalityStatus.graph.entityCount ?? 0) + (modalityStatus.graph.edgeCount ?? 0),
      rejected: 0,
      truncated: modalityStatus.graph.status === 'truncated',
      fallback: false,
      reasonCodes: asReasonCodes([modalityStatus.graph.reason]),
    });

    const totalCandidateItems =
      relevantVectorItems.length + relevantFulltextItems.length + relevantGraphItems.length;
    stageDiagnostics.push({
      stage: 'fusion',
      status: 'ok',
      latencyMs: 0,
      accepted: finalItems.length,
      rejected: Math.max(0, totalCandidateItems - finalItems.length),
      truncated: false,
      fallback: false,
      reasonCodes: [],
    });

    // Safe envelope assembly
    const responsePayload: any = {
      outcome,
      snapshotId: pinnedSnapshotId,
      embeddingProvider: providerMetadata,
      items: finalItems,
      paths,
      conflictGroups,
      totalCandidates: fused.totalCandidates,
      modalitiesUsed,
      modalityStatus,
      diagnostics: {
        degraded: outcome === 'DEGRADED' || isDegraded,
        degradedReasons: degradedReasons.length > 0 ? degradedReasons : undefined,
        graphBeforeFusion,
        graphAfterFusion,
        stageDiagnostics,
        failedSeeds: failedSeeds.length > 0 ? failedSeeds : undefined,
      },
      planTrace,
    };

    if (outcome === 'SEED_ONLY') {
      responsePayload.reason = 'SEED_FOUND_NO_RELATION';
      responsePayload.suggestedRefinements = [
        'Entity exists in the snapshot but has no outbound or inbound relations.',
        'Try querying related process containers or software components.',
      ];
    }

    if (outcome === 'UNSUPPORTED') {
      const unsupported = planningOutcome as Extract<QueryExecutionPlanningOutcome, { status: 'unsupported' }>;
      responsePayload.reason = unsupported.reason;
      responsePayload.unsupportedConstructs = unsupported.unsupportedConstructs;
    }

    if (outcome === 'NEEDS_CLARIFICATION') {
      responsePayload.candidates = (planningOutcome as any).safeCandidates;
    }

    if (outcome === 'NO_EVIDENCE') {
      responsePayload.reason =
        (isClarification && !hasClarificationCandidates)
          ? 'AMBIGUOUS_WITHOUT_CANDIDATES'
          : (modalityStatus.fulltext.reason || 'NO_MATCHING_EVIDENCE');
      responsePayload.suggestedRefinements = [
        'Broaden query terms or verify spelling against corpus identifiers.',
        'Consult published process documentation for related process containers.',
      ];
    }

    return RetrievalResponseSchema.parse(responsePayload);
  }

  private async runFulltextModality(
    snapshotId: string,
    keywords: readonly string[],
    limit: number,
    parentSignal?: AbortSignal
  ): Promise<ModalityRunResult<ChunkItem>> {
    const queryText = keywords.join(' ').trim();
    if (!queryText) {
      return {
        status: { status: 'unavailable', latencyMs: 0, itemCount: 0, reason: 'NO_QUERY_KEYWORDS' },
        items: [],
      };
    }

    const timeoutMs = this.timeouts.fulltextMs;
    const run = await runWithTimeout(
      timeoutMs,
      async (signal) => {
        return await this.deps.indexGateway.queryFulltext(
          snapshotId,
          { keywords, limit },
          { signal }
        );
      },
      parentSignal
    );

    if (run.timedOut) {
      return {
        status: { status: 'timeout', latencyMs: run.latencyMs, itemCount: 0, reason: 'TIMEOUT' },
        items: [],
      };
    }

    if (run.error) {
      return {
        status: { status: 'error', latencyMs: run.latencyMs, itemCount: 0, reason: 'PROVIDER_ERROR' },
        items: [],
      };
    }

    const items = run.result ?? [];
    return {
      status: { status: 'ok', latencyMs: run.latencyMs, itemCount: items.length },
      items,
    };
  }

  private async runVectorModality(
    snapshotId: string,
    queryText: string,
    limit: number,
    parentSignal?: AbortSignal
  ): Promise<ModalityRunResult<ChunkItem>> {
    if (!this.deps.embeddingProvider) {
      return {
        status: { status: 'unavailable', latencyMs: 0, itemCount: 0, reason: 'UNCONFIGURED' },
        items: [],
      };
    }

    // D-09 / T-18-05: Live provider metadata must match pinned vector index metadata
    const providerMeta = this.deps.embeddingProvider.describe();
    const isMatch = await this.deps.indexGateway.validateVectorIndexMetadata(snapshotId, providerMeta);
    if (!isMatch) {
      return {
        status: { status: 'unavailable', latencyMs: 0, itemCount: 0, reason: 'MODEL_INDEX_MISMATCH' },
        items: [],
      };
    }

    const timeoutMs = this.timeouts.vectorMs;
    const run = await runWithTimeout(
      timeoutMs,
      async (signal) => {
        // 1. Generate query embedding
        const vector = await this.deps.embeddingProvider!.embedQuery(queryText, { signal });
        // 2. Query vector index
        return await this.deps.indexGateway.queryVector(
          snapshotId,
          { vector, limit },
          { signal }
        );
      },
      parentSignal
    );

    if (run.timedOut) {
      return {
        status: { status: 'timeout', latencyMs: run.latencyMs, itemCount: 0, reason: 'TIMEOUT' },
        items: [],
      };
    }

    if (run.error) {
      return {
        status: { status: 'error', latencyMs: run.latencyMs, itemCount: 0, reason: 'PROVIDER_ERROR' },
        items: [],
      };
    }

    const items = run.result ?? [];
    return {
      status: { status: 'ok', latencyMs: run.latencyMs, itemCount: items.length },
      items,
    };
  }

  private async runGraphModality(
    snapshotId: string,
    planningOutcome: QueryExecutionPlanningOutcome,
    includeInferred: boolean,
    parentSignal?: AbortSignal
  ): Promise<GraphModalityRunResult> {
    const isSpecial = planningOutcome.status === 'needsClarification' || planningOutcome.status === 'unsupported';
    const planToTraverse = isSpecial
      ? {
          planId: '00000000-0000-0000-0000-000000000000',
          queryIntent: 'LOOKUP' as const,
          seedUrns: [],
          traversalSteps: [],
          overallMaxDepth: 1,
          includeInferred: false,
          fulltextKeywords: [],
          semanticQuery: '',
        }
      : {
          ...planningOutcome.plan,
          // D-14: the request flag is the only authority for crossing INFERRED edges.
          includeInferred,
        };

    const timeoutMs = this.timeouts.graphMs;
    const seedKinds = isSpecial ? undefined : planningOutcome.seedKinds;
    const run = await runWithTimeout(
      timeoutMs,
      async (signal) => {
        return await runBoundedGraphTraversal(
          planToTraverse,
          snapshotId,
          this.deps.graphGateway,
          { signal, seedKinds }
        );
      },
      parentSignal
    );

    if (run.timedOut) {
      return {
        status: {
          status: 'timeout',
          latencyMs: run.latencyMs,
          itemCount: 0,
          entityCount: 0,
          edgeCount: 0,
          pathCount: 0,
          reason: 'TIMEOUT',
        },
        items: [],
        pathCandidates: [],
      };
    }

    if (run.error) {
      return {
        status: {
          status: 'error',
          latencyMs: run.latencyMs,
          itemCount: 0,
          entityCount: 0,
          edgeCount: 0,
          pathCount: 0,
          reason: 'PROVIDER_ERROR',
        },
        items: [],
        pathCandidates: [],
      };
    }

    const result: BoundedGraphTraversalResult = run.result ?? {
      status: {
        status: 'unavailable',
        latencyMs: run.latencyMs,
        itemCount: 0,
        entityCount: 0,
        edgeCount: 0,
        pathCount: 0,
        reason: 'PROVIDER_ERROR',
      },
      chunks: [],
      entities: [],
      seedEntities: [],
      edges: [],
      paths: [],
    };

    const combined: Array<ChunkItem | EntityItem | EdgeItem> = [
      ...result.chunks,
      ...result.entities,
      ...result.edges,
    ];
    return {
      status: result.status,
      items: combined,
      pathCandidates: result.paths,
    };
  }
}
