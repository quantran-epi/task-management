/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { resolveQueryOnlyScope, type PublishedSetEntry } from '../src/services/publishedSetDiscovery.js';
import type { FederatedRetrievalRequest } from '../src/types/retrievalProtocol.js';

const SET_A = '00000000-0000-4000-8000-000000000001';
const SET_B = '00000000-0000-4000-8000-000000000002';
const SET_C = '00000000-0000-4000-8000-000000000003';
const SNAP_A = '10000000-0000-4000-8000-000000000001';
const SNAP_B = '10000000-0000-4000-8000-000000000002';
const SNAP_C = '10000000-0000-4000-8000-000000000003';

const published: PublishedSetEntry[] = [
  { setId: SET_B, snapshotId: SNAP_B },
  { setId: SET_A, snapshotId: SNAP_A },
  { setId: SET_C, snapshotId: SNAP_C },
];

const wire = (overrides: Partial<FederatedRetrievalRequest> = {}): FederatedRetrievalRequest => ({
  query: 'rui ro',
  limit: 20,
  includeInferred: false,
  recentTurns: [],
  ...overrides,
});

function deps(entries: PublishedSetEntry[]) {
  return { listPublishedSets: () => entries };
}

describe('publishedSetDiscovery (Phase 28 Task 3)', () => {
  it('returns NO_PUBLISHED_SETS with empty coverage for zero active snapshots', async () => {
    const result = await resolveQueryOnlyScope(wire(), deps([]));
    expect(result.resolved).toBeNull();
    expect(result.outcome).toBe('NO_PUBLISHED_SETS');
    expect(result.coverage).toEqual([]);
  });

  it('resolves every published set in ascending setId order with query-only budgets', async () => {
    const result = await resolveQueryOnlyScope(wire(), deps(published));
    expect(result.outcome).toBeNull();
    expect(result.resolved?.setTierAssignments).toEqual([
      { setId: SET_A, tier: 'REQUIRED', roleGroup: 'baseline' },
      { setId: SET_B, tier: 'REQUIRED', roleGroup: 'baseline' },
      { setId: SET_C, tier: 'REQUIRED', roleGroup: 'baseline' },
    ]);
    expect(result.resolved?.budgets).toEqual({
      concurrency: 4, elapsedMs: 20_000, maxSets: 15, maxItems: 60, maxEvidenceChars: 56_000,
    });
    expect(result.resolved?.comparisonMode).toBe('single');
  });

  it('resolves only the published member of an explicit restriction and marks the unknown UNAVAILABLE', async () => {
    const unknown = '99999999-9999-4999-8999-999999999999';
    const result = await resolveQueryOnlyScope(wire({ setIds: [unknown, SET_A] }), deps(published));
    expect(result.resolved?.setTierAssignments).toEqual([
      { setId: SET_A, tier: 'REQUIRED', roleGroup: 'baseline' },
    ]);
    expect(result.coverage).toHaveLength(1);
    expect(result.coverage[0]).toEqual({
      setId: unknown,
      state: 'UNAVAILABLE',
      publishedSnapshotId: null,
      retrievalSnapshotId: null,
      staleIndex: false,
    });
  });

  it('returns DEGRADED with one UNAVAILABLE row per id when every explicit set is unknown', async () => {
    const id1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
    const id2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
    const result = await resolveQueryOnlyScope(wire({ setIds: [id1, id2] }), deps(published));
    expect(result.resolved).toBeNull();
    expect(result.outcome).toBe('DEGRADED');
    expect(result.coverage).toHaveLength(2);
    for (const row of result.coverage) {
      expect(row.state).toBe('UNAVAILABLE');
      expect(row.publishedSnapshotId).toBeNull();
      expect(row.retrievalSnapshotId).toBeNull();
    }
  });

  it('keeps a PUBLISHED_ONLY set assigned rather than dropping it from the fleet', async () => {
    const result = await resolveQueryOnlyScope(wire({ setIds: [SET_B] }), deps(published));
    expect(result.resolved?.setTierAssignments).toEqual([
      { setId: SET_B, tier: 'REQUIRED', roleGroup: 'baseline' },
    ]);
    expect(result.outcome).toBeNull();
  });

  it('attaches publishedSnapshotIdBySet from enumeration for every default-discovered set', async () => {
    const result = await resolveQueryOnlyScope(wire(), deps(published));
    expect(result.resolved?.publishedSnapshotIdBySet).toEqual({
      [SET_A]: SNAP_A,
      [SET_B]: SNAP_B,
      [SET_C]: SNAP_C,
    });
  });

  it('maps only published matches for an explicit restriction, never unknown ids', async () => {
    const unknown = '99999999-9999-4999-8999-999999999999';
    const result = await resolveQueryOnlyScope(wire({ setIds: [unknown, SET_A, SET_B] }), deps(published));
    expect(result.resolved?.publishedSnapshotIdBySet).toEqual({
      [SET_A]: SNAP_A,
      [SET_B]: SNAP_B,
    });
  });

  it('returns a null (absent) map for an all-unknown restriction with no resolved request', async () => {
    const unknown = '99999999-9999-4999-8999-999999999999';
    const result = await resolveQueryOnlyScope(wire({ setIds: [unknown] }), deps(published));
    expect(result.resolved).toBeNull();
  });
});
