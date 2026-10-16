import {
  FederatedRetrievalRequest,
  FederatedRetrievalResponse,
  FederatedRetrievalResponseSchema,
  RetrievalResponse,
  CompleteModalityStatus,
  RetrievalOutcome,
} from '../types/retrievalProtocol.js';

export interface FederatedRetrievalDependencies {
  retrievePerSet(
    setId: string,
    request: { query: string; limit: number; includeInferred: boolean; recentTurns: any[] },
    signal?: AbortSignal
  ): Promise<RetrievalResponse>;
  now?(): number;
}

export interface TaskTimeoutResult<T> {
  result?: T;
  timedOut: boolean;
  latencyMs: number;
  error?: any;
}

/**
 * Runs task with AbortController deadline. Reuses retrievalService timeout pattern.
 */
async function runWithTimeout<T>(
  timeoutMs: number,
  task: (signal: AbortSignal) => Promise<T>,
  now: () => number
): Promise<TaskTimeoutResult<T>> {
  const controller = new AbortController();
  const start = now();
  let timer: any;

  const timeoutPromise = new Promise<{ timedOut: true; latencyMs: number }>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ timedOut: true, latencyMs: now() - start });
    }, timeoutMs);
  });

  try {
    const outcome = await Promise.race([
      task(controller.signal).then((val) => ({ result: val, timedOut: false, latencyMs: now() - start })),
      timeoutPromise,
    ]);
    clearTimeout(timer);
    return outcome;
  } catch (err: any) {
    clearTimeout(timer);
    const latencyMs = now() - start;
    const isAborted = controller.signal.aborted || err?.name === 'AbortError';
    return {
      timedOut: isAborted,
      latencyMs,
      error: err,
    };
  }
}

/**
 * Helper to limit concurrent executions using a worker pool.
 */
async function mapConcurrent<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const cur = index++;
      results[cur] = await fn(items[cur]!);
    }
  }

  const pool = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(pool);
  return results;
}

function computeEvidenceChars(item: any): number {
  if (item.type === 'chunk') {
    return (item.rawSnippet?.length ?? 0) + (item.sourceDocumentTitle?.length ?? 0);
  }
  if (item.type === 'entity') {
    return (item.canonicalName?.length ?? 0) + (item.urn?.length ?? 0);
  }
  if (item.type === 'edge') {
    return (item.relationType?.length ?? 0) + (item.sourceUrn?.length ?? 0) + (item.targetUrn?.length ?? 0);
  }
  return 0;
}

export async function runFederatedRetrieval(
  request: FederatedRetrievalRequest,
  deps: FederatedRetrievalDependencies
): Promise<FederatedRetrievalResponse> {
  const now = deps.now ?? Date.now;
  const startTime = now();
  const budgets = request.budgets;

  const coverageWarnings: Array<{
    code: 'TIMEOUT' | 'STALE' | 'ERROR' | 'BUDGET_SETS' | 'BUDGET_ITEMS' | 'BUDGET_EVIDENCE' | 'BUDGET_ELAPSED';
    setId: string | null;
    message: string;
  }> = [];

  const tierOrder: Array<'REQUIRED' | 'LIKELY' | 'OPTIONAL'> = ['REQUIRED', 'LIKELY', 'OPTIONAL'];
  const processedSetIds = new Set<string>();

  const perSetResults: Array<{
    assignment: (typeof request.setTierAssignments)[number];
    response?: RetrievalResponse;
    failureReason?: 'TIMEOUT' | 'STALE' | 'ERROR';
  }> = [];

  let accumulatedItemsCount = 0;
  let accumulatedEvidenceChars = 0;
  let hasSetRejection = false;
  let budgetStopCode: 'BUDGET_SETS' | 'BUDGET_ITEMS' | 'BUDGET_EVIDENCE' | 'BUDGET_ELAPSED' | null = null;

  for (let tierIdx = 0; tierIdx < tierOrder.length; tierIdx++) {
    const currentTier = tierOrder[tierIdx]!;
    const assignmentsInTier = request.setTierAssignments.filter(
      (a) => a.tier === currentTier && !processedSetIds.has(a.setId)
    );

    if (assignmentsInTier.length === 0) {
      continue;
    }

    // Check budget elapsed before tier execution
    const elapsedBeforeTier = now() - startTime;
    if (elapsedBeforeTier >= budgets.elapsedMs) {
      budgetStopCode = 'BUDGET_ELAPSED';
      break;
    }

    // Check if expansion to LIKELY / OPTIONAL is needed
    if (currentTier !== 'REQUIRED') {
      const coverageThreshold = budgets.maxItems * 0.6;
      const baselineRequiredAssignments = request.setTierAssignments.filter(
        (a) => a.tier === 'REQUIRED' && a.roleGroup === 'baseline'
      );
      const scopeDiffRequiredAssignments = request.setTierAssignments.filter(
        (a) => a.tier === 'REQUIRED' && a.roleGroup === 'scope_diff'
      );

      const hasBaselineSuccess = perSetResults.some(
        (r) => r.assignment.roleGroup === 'baseline' && r.response && r.response.items.length > 0
      );
      const hasScopeDiffSuccess = perSetResults.some(
        (r) => r.assignment.roleGroup === 'scope_diff' && r.response && r.response.items.length > 0
      );

      const missingScope =
        request.comparisonMode === 'baseline_vs_scope' &&
        ((baselineRequiredAssignments.length > 0 && !hasBaselineSuccess) ||
          (scopeDiffRequiredAssignments.length > 0 && !hasScopeDiffSuccess));

      const needsMoreItems = accumulatedItemsCount < coverageThreshold;

      if (!needsMoreItems && !missingScope) {
        // Sufficient coverage already reached
        break;
      }
    }

    // Filter assignments that fit within maxSets budget
    const remainingSetsBudget = budgets.maxSets - processedSetIds.size;
    if (remainingSetsBudget <= 0) {
      budgetStopCode = 'BUDGET_SETS';
      break;
    }

    const assignmentsToRun = assignmentsInTier.slice(0, remainingSetsBudget);
    if (assignmentsToRun.length < assignmentsInTier.length) {
      budgetStopCode = 'BUDGET_SETS';
    }

    // Sets in one tier run concurrently, so each can use the remaining global deadline.
    const elapsedSoFar = now() - startTime;
    const perSetTimeoutMs = Math.max(10, budgets.elapsedMs - elapsedSoFar);

    const tierRunResults = await mapConcurrent(
      assignmentsToRun,
      budgets.concurrency,
      async (assignment) => {
        processedSetIds.add(assignment.setId);

        const outcome = await runWithTimeout(
          perSetTimeoutMs,
          async (signal) => {
            return deps.retrievePerSet(
              assignment.setId,
              {
                query: request.query,
                limit: request.limit,
                includeInferred: request.includeInferred,
                recentTurns: request.recentTurns,
              },
              signal
            );
          },
          now
        );

        if (outcome.timedOut) {
          return {
            assignment,
            failureReason: 'TIMEOUT' as const,
          };
        } else if (outcome.error || !outcome.result) {
          return {
            assignment,
            failureReason: 'ERROR' as const,
          };
        } else {
          return {
            assignment,
            response: outcome.result,
          };
        }
      }
    );

    for (const res of tierRunResults) {
      perSetResults.push(res);
      if (res.failureReason) {
        hasSetRejection = true;
        coverageWarnings.push({
          code: res.failureReason,
          setId: res.assignment.setId,
          message: `Set ${res.assignment.setId} failed with ${res.failureReason}`,
        });
      } else if (res.response) {
        for (const it of res.response.items) {
          accumulatedItemsCount++;
          accumulatedEvidenceChars += computeEvidenceChars(it);
        }
      }
    }

    // Check budget items and chars
    if (accumulatedItemsCount >= budgets.maxItems) {
      budgetStopCode = 'BUDGET_ITEMS';
      break;
    }
    if (accumulatedEvidenceChars >= budgets.maxEvidenceChars) {
      budgetStopCode = 'BUDGET_EVIDENCE';
      break;
    }
    if (now() - startTime >= budgets.elapsedMs) {
      budgetStopCode = 'BUDGET_ELAPSED';
      break;
    }
  }

  if (budgetStopCode) {
    coverageWarnings.push({
      code: budgetStopCode,
      setId: null,
      message: `Retrieval stopped by budget limit: ${budgetStopCode}`,
    });
  }

  // Combine results
  // Baseline roleGroup first, then scope_diff per D-22
  const baselineResults = perSetResults.filter((r) => r.assignment.roleGroup === 'baseline' && r.response);
  const scopeDiffResults = perSetResults.filter((r) => r.assignment.roleGroup === 'scope_diff' && r.response);

  const orderedResults = [...baselineResults, ...scopeDiffResults];

  const items: FederatedRetrievalResponse['items'] = [];
  const paths: FederatedRetrievalResponse['paths'] = [];
  const conflictGroups: FederatedRetrievalResponse['conflictGroups'] = [];

  let totalCharsIncluded = 0;

  for (const setRes of orderedResults) {
    const { assignment, response } = setRes;
    if (!response) continue;

    // Preserving paths per-set as-is; never concatenated across snapshots (D-14)
    for (const p of response.paths) {
      if (paths.length < 100) {
        paths.push({
          setId: assignment.setId,
          snapshotId: response.snapshotId,
          roleGroup: assignment.roleGroup,
          path: p,
        });
      }
    }

    // Conflict groups
    for (const cg of response.conflictGroups) {
      if (conflictGroups.length < 100) {
        conflictGroups.push({
          setId: assignment.setId,
          snapshotId: response.snapshotId,
          roleGroup: assignment.roleGroup,
          conflictGroup: cg,
        });
      }
    }

    // Items within set are kept in internal rank order (D-22: fusionScore within snapshot, across groups roleGroup order)
    for (const it of response.items) {
      if (items.length >= budgets.maxItems || items.length >= 200) {
        break;
      }
      const itemChars = computeEvidenceChars(it);
      if (totalCharsIncluded + itemChars > budgets.maxEvidenceChars && items.length > 0) {
        break;
      }
      totalCharsIncluded += itemChars;
      items.push({
        setId: assignment.setId,
        snapshotId: response.snapshotId,
        roleGroup: assignment.roleGroup,
        item: it,
      });
    }
  }

  // Aggregate modality statuses across all successful responses
  const modalityStatus: CompleteModalityStatus = {
    fulltext: { status: 'ok', latencyMs: 0, itemCount: 0 },
    vector: { status: 'ok', latencyMs: 0, itemCount: 0 },
    graph: { status: 'ok', latencyMs: 0, itemCount: 0 },
  };

  const successfulSets = perSetResults.filter((result) => Boolean(result.response));
  const allTimedOut =
    perSetResults.length > 0 &&
    successfulSets.length === 0 &&
    perSetResults.every((result) => result.failureReason === 'TIMEOUT');

  if (allTimedOut) {
    modalityStatus.fulltext.status = 'timeout';
    modalityStatus.vector.status = 'timeout';
    modalityStatus.graph.status = 'timeout';
  } else {
    for (const setRes of perSetResults) {
      if (setRes.response) {
        const ms = setRes.response.modalityStatus;
        modalityStatus.fulltext.latencyMs = Math.max(modalityStatus.fulltext.latencyMs, ms.fulltext.latencyMs);
        modalityStatus.fulltext.itemCount += ms.fulltext.itemCount;
        if (ms.fulltext.status !== 'ok') modalityStatus.fulltext.status = ms.fulltext.status;

        modalityStatus.vector.latencyMs = Math.max(modalityStatus.vector.latencyMs, ms.vector.latencyMs);
        modalityStatus.vector.itemCount += ms.vector.itemCount;
        if (ms.vector.status !== 'ok') modalityStatus.vector.status = ms.vector.status;

        modalityStatus.graph.latencyMs = Math.max(modalityStatus.graph.latencyMs, ms.graph.latencyMs);
        modalityStatus.graph.itemCount += ms.graph.itemCount;
        if (ms.graph.status !== 'ok') modalityStatus.graph.status = ms.graph.status;
      }
    }
  }

  // Outcome calculation:
  // If partial failure occurred and items exist, outcome = DEGRADED per D-24.
  // If no items found anywhere, NO_EVIDENCE.
  // Otherwise READY.
  let outcome: RetrievalOutcome = 'READY';
  if (hasSetRejection || coverageWarnings.length > 0) {
    outcome = 'DEGRADED';
  } else if (items.length === 0 && paths.length === 0) {
    outcome = 'NO_EVIDENCE';
  }

  const responsePayload = {
    outcome,
    items,
    paths,
    conflictGroups,
    modalityStatus,
    diagnostics: {
      degraded: outcome === 'DEGRADED',
      coverageWarnings,
    },
  };

  return FederatedRetrievalResponseSchema.parse(responsePayload);
}
