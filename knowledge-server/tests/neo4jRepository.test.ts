import { describe, it, expect, vi } from 'vitest';
import {
  Neo4jRepository,
  CYPHER_QUERIES,
  STATIC_RELATION_WRITERS,
} from '../src/graph/neo4jRepository.js';
import { InMemoryGraphRepository } from '../src/graph/graphRepository.js';
import {
  GraphCandidate,
  GraphNode,
  GraphRelation,
} from '../src/types/graphProtocol.js';
import {
  PILOT_GOLD_NODES,
  URN_PROCESS_60000006,
  URN_SUBPROCESS_10000304,
} from './fixtures/pilotGoldEntities.js';

describe('Neo4j Repository Adapter & Parameterized Cypher Generation (GRAPH-04, T-17-04)', () => {
  it('verifies static Cypher query templates contain zero interpolated variables', () => {
    // Assert all query constants are static strings
    for (const [key, query] of Object.entries(CYPHER_QUERIES)) {
      if (Array.isArray(query)) {
        for (const q of query) {
          expect(typeof q).toBe('string');
          expect(q).not.toContain('${');
        }
      } else {
        expect(typeof query).toBe('string');
        expect(query).not.toContain('${');
      }
    }

    for (const [rel, query] of Object.entries(STATIC_RELATION_WRITERS)) {
      expect(typeof query).toBe('string');
      expect(query).not.toContain('${');
      expect(query).toContain(`:${rel}`);
    }
  });

  it('InMemoryGraphRepository writes candidate, activates pointer, and retrieves facts correctly', async () => {
    const repo = new InMemoryGraphRepository();
    const setId = 'set-pilot-1';
    const graphSnapshotId = 'snap-test-1';

    const testRelation: GraphRelation = {
      factKey: '1111111111111111111111111111111111111111111111111111111111111111',
      ontologyVersion: '2026.10.1',
      subjectUrn: URN_PROCESS_60000006,
      relation: 'INVOKES',
      objectUrn: URN_SUBPROCESS_10000304,
      qualifiers: {},
      effectiveClassification: 'OBSERVED',
      hasConflict: false,
      sourceMissing: false,
    };

    const candidate: GraphCandidate = {
      graphSnapshotId,
      sourceSnapshotId: 'src-snap-1',
      setId,
      ontologyVersion: '2026.10.1',
      normalizedProjectionHash: 'hash-12345',
      nodes: PILOT_GOLD_NODES as GraphNode[],
      relations: [testRelation],
      evidence: [],
      conflicts: [],
      approvals: [],
      quarantines: [],
      createdAt: '2026-10-10T00:00:00.000Z',
    };

    // Before activation, active graph is null
    expect(await repo.getActiveGraph(setId)).toBeNull();

    // Write candidate
    await repo.writeCandidate(candidate);

    // Activate candidate
    await repo.activateCandidate(setId, graphSnapshotId);

    // Active graph is available
    const active = await repo.getActiveGraph(setId);
    expect(active).not.toBeNull();
    expect(active?.graphSnapshotId).toBe(graphSnapshotId);
    expect(active?.setId).toBe(setId);
    expect(active?.nodeCount).toBe(PILOT_GOLD_NODES.length);

    // Retrieve facts
    const facts = await repo.getFacts(graphSnapshotId);
    expect(facts.length).toBe(1);
    expect(facts[0]!.relation.factKey).toBe(testRelation.factKey);
    expect(facts[0]!.relation.relation).toBe('INVOKES');
  });

  it('Neo4jRepository passes strictly parameterized inputs to session.run and executeWrite', async () => {
    const mockRun = vi.fn().mockResolvedValue({ records: [] });
    const mockExecuteWrite = vi.fn().mockImplementation(async (cb) => {
      const tx = { run: mockRun };
      return cb(tx);
    });
    const mockSession = {
      run: mockRun,
      executeWrite: mockExecuteWrite,
      close: vi.fn().mockResolvedValue(undefined),
    };
    const mockDriver = {
      session: vi.fn().mockReturnValue(mockSession),
      close: vi.fn().mockResolvedValue(undefined),
    };

    const repo = new Neo4jRepository({
      uri: 'bolt://localhost:7687',
      driver: mockDriver as any,
    });

    await repo.initializeSchemaConstraints();
    expect(mockDriver.session).toHaveBeenCalled();
    expect(mockRun).toHaveBeenCalledTimes(3);

    // Verify activateCandidate uses parameterized query
    mockRun.mockResolvedValueOnce({ records: [{ get: () => 'snap-1' }] });
    await repo.activateCandidate('set-1', 'snap-1');
    expect(mockExecuteWrite).toHaveBeenCalled();
    expect(mockRun).toHaveBeenCalledWith(
      CYPHER_QUERIES.ACTIVATE_CANDIDATE,
      expect.objectContaining({
        setId: 'set-1',
        graphSnapshotId: 'snap-1',
      })
    );
  });
});
