/**
 * Server-authoritative query-only scope resolution (Phase 28, D-01/D-02/D-03/D-05).
 *
 * Published sets come only from the server SnapshotStore enumeration. An
 * explicit `setIds` restriction is exact-matched and never broadened; unknown
 * ids become UNAVAILABLE coverage rather than an empty success.
 */
import {
  DEFAULT_QUERY_ONLY_BUDGETS,
  type FederatedSetCoverage,
  type FederatedRetrievalRequest,
  type ResolvedFederatedRetrievalRequest,
} from '../types/retrievalProtocol.js';

export type SetReadiness = 'GRAPH_READY' | 'PUBLISHED_ONLY' | 'FAILED';

export interface PublishedSetEntry {
  setId: string;
  snapshotId: string;
}

export interface QueryOnlyScopeDeps {
  listPublishedSets(): PublishedSetEntry[];
  getSetReadiness(setId: string): Promise<SetReadiness>;
}

export interface ResolvedQueryOnlyScope {
  resolved: ResolvedFederatedRetrievalRequest | null;
  outcome: 'NO_PUBLISHED_SETS' | 'DEGRADED' | null;
  coverage: FederatedSetCoverage[];
}

export function createQueryOnlyScopeResolver(deps: QueryOnlyScopeDeps) {
  return {
    resolveQueryOnlyScope(
      wire: FederatedRetrievalRequest
    ): Promise<ResolvedQueryOnlyScope> {
      return resolveQueryOnlyScope(wire, deps);
    },
  };
}

function unavailable(setId: string): FederatedSetCoverage {
  return {
    setId,
    state: 'UNAVAILABLE',
    publishedSnapshotId: null,
    retrievalSnapshotId: null,
    staleIndex: false,
  };
}

function assignment(setId: string) {
  return { setId, tier: 'REQUIRED' as const, roleGroup: 'baseline' as const };
}

function resolvedRequest(
  wire: FederatedRetrievalRequest,
  assignments: Array<{ setId: string; tier: 'REQUIRED'; roleGroup: 'baseline' }>
): ResolvedFederatedRetrievalRequest {
  return {
    query: wire.query,
    setTierAssignments: assignments,
    comparisonMode: 'single',
    budgets: { ...DEFAULT_QUERY_ONLY_BUDGETS },
    limit: wire.limit,
    includeInferred: wire.includeInferred,
    recentTurns: wire.recentTurns,
    ...(wire.contextHints ? { contextHints: wire.contextHints } : {}),
  };
}

/**
 * Resolves the thin wire request into the internal fan-out contract.
 * Default discovery reads every published set in ascending setId order up to
 * maxSets; overflow is reported, never silently treated as no-evidence.
 */
export async function resolveQueryOnlyScope(
  wire: FederatedRetrievalRequest,
  deps: QueryOnlyScopeDeps
): Promise<ResolvedQueryOnlyScope> {
  const published = deps.listPublishedSets();
  const bySetId = new Map(published.map((entry) => [entry.setId, entry]));

  if (wire.setIds) {
    const coverage: FederatedSetCoverage[] = [];
    const assignments: Array<{ setId: string; tier: 'REQUIRED'; roleGroup: 'baseline' }> = [];

    for (const setId of wire.setIds) {
      const entry = bySetId.get(setId);
      if (!entry) {
        // Exact match only: unknown/unpublished ids are never broadened to
        // other published sets and never silently dropped.
        coverage.push(unavailable(setId));
        continue;
      }
      // Readiness seeds attribution but never removes a published set from the
      // fleet: a PUBLISHED_ONLY set is assigned and searched lexically (D-02).
      // Its coverage row is produced by the federated ledger (28-03), so no
      // speculative state is emitted here.
      await deps.getSetReadiness(setId);
      assignments.push(assignment(setId));
    }

    if (assignments.length === 0) {
      return { resolved: null, outcome: 'DEGRADED', coverage };
    }
    return { resolved: resolvedRequest(wire, assignments), outcome: null, coverage };
  }

  const ordered = [...published].sort((a, b) => a.setId.localeCompare(b.setId));
  if (ordered.length === 0) {
    return { resolved: null, outcome: 'NO_PUBLISHED_SETS', coverage: [] };
  }

  const maxSets = DEFAULT_QUERY_ONLY_BUDGETS.maxSets;
  const selected = ordered.slice(0, maxSets);
  const coverage: FederatedSetCoverage[] = ordered.slice(maxSets).map((entry) => ({
    setId: entry.setId,
    state: 'NOT_SEARCHED_BUDGET',
    publishedSnapshotId: entry.snapshotId,
    retrievalSnapshotId: null,
    staleIndex: false,
  }));

  const assignments: Array<{ setId: string; tier: 'REQUIRED'; roleGroup: 'baseline' }> = [];
  for (const entry of selected) {
    // Readiness seeds truthful attribution; PUBLISHED_ONLY stays in the fleet
    // and is searched lexically (D-02).
    await deps.getSetReadiness(entry.setId);
    assignments.push(assignment(entry.setId));
  }

  return { resolved: resolvedRequest(wire, assignments), outcome: null, coverage };
}
