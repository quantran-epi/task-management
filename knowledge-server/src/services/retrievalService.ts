import {
  RetrievalRequest,
  RetrievalRequestSchema,
  RetrievalResponse,
  RetrievalResponseSchema,
  CompleteModalityStatus,
  ModalityStatusDetail,
  EmbeddingProviderMetadata,
  RetrievalOutcome,
  PlanTrace,
  ClarificationCandidate,
  ChunkItem,
  EntityItem,
  EdgeItem,
  RetrievalItem,
  ModalityKind,
  ReasonCode,
} from '../types/retrievalProtocol.js';
import type {
  EmbeddingProvider,
  QueryPlanner,
  RetrievalIndexGateway,
  GraphRetrievalGateway,
  PinnedSnapshotLease,
} from '../retrieval/contracts.js';
import {
  buildQueryExecutionPlan,
  type QueryExecutionPlanningOutcome,
} from '../retrieval/queryPlanning.js';
import {
  runBoundedGraphTraversal,
  type BoundedGraphTraversalResult,
} from '../retrieval/graphTraversal.js';
import {
  fuseRetrievalCandidates,
  tagRetrievalConflicts,
} from '../retrieval/fusion.js';

export interface RetrievalTimeouts {
  readonly fulltextMs: number;
  readonly vectorMs: number;
  readonly graphMs: number;
}

export const DEFAULT_RETRIEVAL_TIMEOUTS: RetrievalTimeouts = Object.freeze({
  fulltextMs: 500,
  vectorMs: 1500,
  graphMs: 2000,
});

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
 * Reads retrieval timeouts from environment record with exact D-25 defaults (500/1500/2000 ms).
 */
export function readRetrievalTimeouts(env: Record<string, string | undefined>): RetrievalTimeouts {
  return {
    fulltextMs: parseSafeTimeout(env.RETRIEVAL_TIMEOUT_FULLTEXT_MS, 500, 'RETRIEVAL_TIMEOUT_FULLTEXT_MS'),
    vectorMs: parseSafeTimeout(env.RETRIEVAL_TIMEOUT_VECTOR_MS, 1500, 'RETRIEVAL_TIMEOUT_VECTOR_MS'),
    graphMs: parseSafeTimeout(env.RETRIEVAL_TIMEOUT_GRAPH_MS, 2000, 'RETRIEVAL_TIMEOUT_GRAPH_MS'),
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
}

/**
 * Executes an async task with AbortController deadline.
 */
async function runWithTimeout<T>(
  timeoutMs: number,
  task: (signal: AbortSignal) => Promise<T>,
  timeoutReason: ReasonCode = 'TIMEOUT'
): Promise<{ result?: T; timedOut: boolean; latencyMs: number; error?: any }> {
  const controller = new AbortController();
  const start = Date.now();
  let timer: any;

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
  private readonly now: () => number;

  constructor(
    private readonly deps: RetrievalServiceDependencies,
    options?: RetrievalServiceOptions
  ) {
    this.timeouts = {
      fulltextMs: options?.timeouts?.fulltextMs ?? DEFAULT_RETRIEVAL_TIMEOUTS.fulltextMs,
      vectorMs: options?.timeouts?.vectorMs ?? DEFAULT_RETRIEVAL_TIMEOUTS.vectorMs,
      graphMs: options?.timeouts?.graphMs ?? DEFAULT_RETRIEVAL_TIMEOUTS.graphMs,
    };
    this.now = deps.now ?? Date.now;
  }

  /**
   * Retrieves hybrid multi-modal evidence for a query against a document set.
   */
  async retrieve(setId: string, rawRequest: RetrievalRequest): Promise<RetrievalResponse> {
    // 1. Boundary schema validation
    const request = RetrievalRequestSchema.parse(rawRequest);

    // 2. Acquire pinned snapshot lease
    const lease = await this.deps.indexGateway.acquirePinnedSnapshot(setId);
    if (!lease) {
      // D-24: Return NO_EVIDENCE when no active snapshot exists
      return RetrievalResponseSchema.parse({
        outcome: 'NO_EVIDENCE',
        snapshotId: 'unassigned',
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
      return await this.executeUnderLease(setId, lease, request);
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
    setId: string,
    lease: PinnedSnapshotLease,
    request: RetrievalRequest
  ): Promise<RetrievalResponse> {
    const pinnedSnapshotId = lease.snapshotId;

    // 3. Planning phase
    const planningOutcome = await buildQueryExecutionPlan({
      request,
      pinnedSnapshotId,
      gateway: this.deps.graphGateway,
      planner: this.deps.queryPlanner,
    });

    const isUnsupported = planningOutcome.status === 'unsupported';
    const isClarification = planningOutcome.status === 'needsClarification';
    const planTrace = planningOutcome.planTrace;

    // Fulltext search terms
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
      request.limit
    );

    const vectorPromise = this.runVectorModality(
      pinnedSnapshotId,
      semanticQueryText,
      request.limit
    );

    const graphPromise = this.runGraphModality(
      pinnedSnapshotId,
      planningOutcome
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

    const graphResult: ModalityRunResult<EntityItem | EdgeItem> =
      graphSettled.status === 'fulfilled'
        ? graphSettled.value
        : {
            status: { status: 'error', latencyMs: 0, itemCount: 0, reason: 'PROVIDER_ERROR' },
            items: [],
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

    const modalityStatus: CompleteModalityStatus = {
      fulltext: fulltextResult.status,
      vector: vectorResult.status,
      graph: graphResult.status,
    };

    // 6. RRF Fusion across surviving ready/truncated candidates
    const candidatesForFusion: {
      vector?: ChunkItem[];
      fulltext?: ChunkItem[];
      graph?: Array<EntityItem | EdgeItem>;
    } = {};

    if (modalityStatus.vector.status === 'ok' || modalityStatus.vector.status === 'truncated') {
      candidatesForFusion.vector = vecValidItems;
    }
    if (modalityStatus.fulltext.status === 'ok' || modalityStatus.fulltext.status === 'truncated') {
      candidatesForFusion.fulltext = ftValidItems;
    }
    if (modalityStatus.graph.status === 'ok' || modalityStatus.graph.status === 'truncated') {
      candidatesForFusion.graph = graphValidItems;
    }

    const fused = fuseRetrievalCandidates(candidatesForFusion, request.limit);

    // Step 7: Citation closure & conflict tagging
    const tagged = tagRetrievalConflicts(fused.items, {
      snapshotId: pinnedSnapshotId,
    });

    const finalItems = tagged.items;

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

    if (isUnsupported) {
      outcome = 'UNSUPPORTED';
    } else if (hasClarificationCandidates) {
      outcome = 'NEEDS_CLARIFICATION';
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

    // Safe envelope assembly
    const responsePayload: any = {
      outcome,
      snapshotId: pinnedSnapshotId,
      embeddingProvider: providerMetadata,
      items: finalItems,
      totalCandidates: fused.totalCandidates,
      modalitiesUsed,
      modalityStatus,
      diagnostics: {
        degraded: outcome === 'DEGRADED' || isDegraded,
        degradedReasons: degradedReasons.length > 0 ? degradedReasons : undefined,
      },
      planTrace,
    };

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
    limit: number
  ): Promise<ModalityRunResult<ChunkItem>> {
    const queryText = keywords.join(' ').trim();
    if (!queryText) {
      return {
        status: { status: 'unavailable', latencyMs: 0, itemCount: 0, reason: 'NO_QUERY_KEYWORDS' },
        items: [],
      };
    }

    const timeoutMs = this.timeouts.fulltextMs;
    const run = await runWithTimeout(timeoutMs, async (signal) => {
      return await this.deps.indexGateway.queryFulltext(
        snapshotId,
        { keywords, limit },
        { signal }
      );
    });

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
    limit: number
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
    const run = await runWithTimeout(timeoutMs, async (signal) => {
      // 1. Generate query embedding
      const vector = await this.deps.embeddingProvider!.embedQuery(queryText, { signal });
      // 2. Query vector index
      return await this.deps.indexGateway.queryVector(
        snapshotId,
        { vector, limit },
        { signal }
      );
    });

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
    planningOutcome: QueryExecutionPlanningOutcome
  ): Promise<ModalityRunResult<EntityItem | EdgeItem>> {
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
      : planningOutcome.plan;

    const timeoutMs = this.timeouts.graphMs;
    const run = await runWithTimeout(timeoutMs, async (signal) => {
      return await runBoundedGraphTraversal(
        planToTraverse,
        snapshotId,
        this.deps.graphGateway,
        signal
      );
    });

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

    const result: BoundedGraphTraversalResult = run.result ?? {
      status: { status: 'unavailable', latencyMs: run.latencyMs, itemCount: 0, reason: 'PROVIDER_ERROR' },
      entities: [],
      edges: [],
    };

    const combined: Array<EntityItem | EdgeItem> = [...result.entities, ...result.edges];
    return {
      status: result.status,
      items: combined,
    };
  }
}
