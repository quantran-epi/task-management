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

export interface PublishedSetEntry {
  setId: string;
  snapshotId: string;
}

export interface QueryOnlyScopeDeps {
  listPublishedSets(): PublishedSetEntry[];
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
  assignments: Array<{ setId: string; tier: 'REQUIRED'; roleGroup: 'baseline' }>,
  publishedSnapshotIdBySet: Record<string, string>
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
    // T-28-15: server-authoritative, enumeration-sourced only. Never derived
    // from a retrieval response, a store read at fan-out time or an item.
    ...(Object.keys(publishedSnapshotIdBySet).length > 0
      ? { publishedSnapshotIdBySet }
      : {}),
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

    const publishedSnapshotIdBySet: Record<string, string> = {};
    for (const setId of wire.setIds) {
      const entry = bySetId.get(setId);
      if (!entry) {
        // Exact match only: unknown/unpublished ids are never broadened to
        // other published sets and never silently dropped.
        coverage.push(unavailable(setId));
        continue;
      }
      // Every published set is assigned and searched with the modalities it
      // actually has (D-02); graph-capability disclosure is owned by the
      // per-set modality status in the retrieval response, not by a readiness
      // signal. Its coverage row is produced by the federated ledger (28-03).
      publishedSnapshotIdBySet[setId] = entry.snapshotId;
      assignments.push(assignment(setId));
    }

    if (assignments.length === 0) {
      return { resolved: null, outcome: 'DEGRADED', coverage };
    }
    return { resolved: resolvedRequest(wire, assignments, publishedSnapshotIdBySet), outcome: null, coverage };
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
    // All published sets stay in the fleet and are searched with the modalities
    // they actually have (D-02); capability disclosure comes from the response.
    assignments.push(assignment(entry.setId));
  }

  // One entry per enumerated set (including later-capped sets), straight from
  // the enumeration the resolver already performed (T-28-15).
  const publishedSnapshotIdBySet: Record<string, string> = {};
  for (const entry of ordered) {
    publishedSnapshotIdBySet[entry.setId] = entry.snapshotId;
  }

  return { resolved: resolvedRequest(wire, assignments, publishedSnapshotIdBySet), outcome: null, coverage };
}
