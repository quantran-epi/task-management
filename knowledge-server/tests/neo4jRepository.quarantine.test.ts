import { describe, it, expect, vi } from 'vitest';
import { Neo4jRepository, CYPHER_QUERIES } from '../src/graph/neo4jRepository.js';
import { GraphCandidate, QuarantinedIdentifier } from '../src/types/graphProtocol.js';

/**
 * Phase 19.1 Plan 01 Task 2 (D-20, WR-02)
 * Quarantines persist to Neo4j GraphSnapshot.quarantinesJson and getQuarantines
 * reads them directly from Neo4j (not from process-memory map). This guarantees
 * quarantines survive server restart.
 */
describe('Neo4jRepository durable quarantine persistence (WR-02, D-20)', () => {
  const makeCandidate = (quarantines: QuarantinedIdentifier[]): GraphCandidate => ({
    graphSnapshotId: 'snap-q-1',
    sourceSnapshotId: 'src-1',
    setId: 'set-1',
    ontologyVersion: '2026.10.1',
    normalizedProjectionHash: 'hash-q',
    nodes: [],
    relations: [],
    evidence: [],
    conflicts: [],
    approvals: [],
    quarantines,
    createdAt: '2026-10-12T00:00:00.000Z',
  });

  it('INSERT_GRAPH_SNAPSHOT sets quarantinesJson and writeCandidate passes serialized array', async () => {
    const mockRun = vi.fn().mockResolvedValue({ records: [] });
    const mockSession = {
      run: mockRun,
      executeWrite: vi.fn().mockImplementation(async (cb) => cb({ run: mockRun })),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const mockDriver = {
      session: vi.fn().mockReturnValue(mockSession),
      close: vi.fn().mockResolvedValue(undefined),
    };

    const quarantines = [
      { token: 'FCL_UNKNOWN', kind: 'ORACLE_UNQUALIFIED', reason: 'missing schema' } as any,
      { token: 'STEP_X', kind: 'LLM_UNVERIFIED', reason: 'low confidence' } as any,
    ];
    const repo = new Neo4jRepository({ uri: 'bolt://x', driver: mockDriver as any });
    await repo.writeCandidate(makeCandidate(quarantines));

    expect(CYPHER_QUERIES.INSERT_GRAPH_SNAPSHOT).toContain('s.quarantinesJson = $quarantinesJson');

    const call = mockRun.mock.calls.find(
      (c) => c[0] === CYPHER_QUERIES.INSERT_GRAPH_SNAPSHOT
    );
    expect(call).toBeDefined();
    const params = call![1];
    expect(typeof params.quarantinesJson).toBe('string');
    expect(JSON.parse(params.quarantinesJson)).toEqual(quarantines);
  });

  it('exposes GET_QUARANTINES_BY_SNAPSHOT parameterized query', () => {
    expect((CYPHER_QUERIES as any).GET_QUARANTINES_BY_SNAPSHOT).toBeDefined();
    expect((CYPHER_QUERIES as any).GET_QUARANTINES_BY_SNAPSHOT).toContain(
      '$graphSnapshotId'
    );
    expect((CYPHER_QUERIES as any).GET_QUARANTINES_BY_SNAPSHOT).toContain(
      's.quarantinesJson'
    );
  });

  it('getQuarantines reads quarantinesJson from Neo4j and parses array', async () => {
    const quarantines = [
      { token: 'A', kind: 'ORACLE_UNQUALIFIED', reason: 'r1' },
      { token: 'B', kind: 'LLM_UNVERIFIED', reason: 'r2' },
    ];
    const mockRun = vi.fn().mockResolvedValue({
      records: [{ get: (k: string) => (k === 'quarantinesJson' ? JSON.stringify(quarantines) : null) }],
    });
    const mockSession = {
      run: mockRun,
      close: vi.fn().mockResolvedValue(undefined),
    };
    const mockDriver = {
      session: vi.fn().mockReturnValue(mockSession),
      close: vi.fn().mockResolvedValue(undefined),
    };

    const repo = new Neo4jRepository({ uri: 'bolt://x', driver: mockDriver as any });
    const result = await repo.getQuarantines('snap-q-1');

    // Must query Neo4j (not just read from in-memory map)
    expect(mockRun).toHaveBeenCalledWith(
      (CYPHER_QUERIES as any).GET_QUARANTINES_BY_SNAPSHOT,
      expect.objectContaining({ graphSnapshotId: 'snap-q-1' })
    );
    expect(result).toEqual(quarantines);
  });

  it('getQuarantines returns empty array when quarantinesJson is null or missing', async () => {
    const mockRun = vi.fn().mockResolvedValue({
      records: [{ get: (_: string) => null }],
    });
    const mockSession = { run: mockRun, close: vi.fn().mockResolvedValue(undefined) };
    const mockDriver = {
      session: vi.fn().mockReturnValue(mockSession),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const repo = new Neo4jRepository({ uri: 'bolt://x', driver: mockDriver as any });
    const result = await repo.getQuarantines('snap-q-1');
    expect(result).toEqual([]);
  });

  it('a new Neo4jRepository instance retrieves quarantines persisted by a previous instance', async () => {
    // Simulated DB: write records in a shared store, read them back on new instance.
    const dbStore: Record<string, string> = {};

    const makeMockDriver = () => {
      const mockRun = vi.fn().mockImplementation(async (query: string, params: any) => {
        if (query === CYPHER_QUERIES.INSERT_GRAPH_SNAPSHOT) {
          dbStore[params.graphSnapshotId] = params.quarantinesJson;
          return { records: [] };
        }
        if (query === (CYPHER_QUERIES as any).GET_QUARANTINES_BY_SNAPSHOT) {
          const json = dbStore[params.graphSnapshotId] ?? null;
          return { records: [{ get: (k: string) => (k === 'quarantinesJson' ? json : null) }] };
        }
        return { records: [] };
      });
      return {
        session: vi.fn().mockReturnValue({
          run: mockRun,
          executeWrite: vi.fn().mockImplementation(async (cb) => cb({ run: mockRun })),
          close: vi.fn().mockResolvedValue(undefined),
        }),
        close: vi.fn().mockResolvedValue(undefined),
      };
    };

    const quarantines = [{ token: 'persisted', kind: 'ORACLE_UNQUALIFIED', reason: 'x' } as any];

    // Instance A writes
    const driverA = makeMockDriver();
    const repoA = new Neo4jRepository({ uri: 'bolt://x', driver: driverA as any });
    await repoA.writeCandidate(makeCandidate(quarantines));

    // Instance B reads from shared store without any in-memory handoff
    const driverB = makeMockDriver();
    const repoB = new Neo4jRepository({ uri: 'bolt://x', driver: driverB as any });
    // Share the simulated db store across both drivers by rewriting handler
    (driverB.session() as any).run.mockImplementation(async (query: string, params: any) => {
      if (query === (CYPHER_QUERIES as any).GET_QUARANTINES_BY_SNAPSHOT) {
        const json = dbStore[params.graphSnapshotId] ?? null;
        return { records: [{ get: (k: string) => (k === 'quarantinesJson' ? json : null) }] };
      }
      return { records: [] };
    });

    const read = await repoB.getQuarantines('snap-q-1');
    expect(read).toEqual(quarantines);
  });
});
