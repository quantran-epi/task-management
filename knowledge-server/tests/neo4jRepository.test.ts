import { describe, it, expect, vi } from 'vitest';
import {
  Neo4jRepository,
  CYPHER_QUERIES,
  STATIC_RELATION_WRITERS,
  escapeLuceneSpecialChars,
} from '../src/graph/neo4jRepository.js';
import { InMemoryGraphRepository, deriveGenerationToken } from '../src/graph/graphRepository.js';
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

describe('Neo4j Repository Adapter & Parameterized Cypher Generation (GRAPH-04, T-17-04, T-18-02)', () => {
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

  it('verifies full-text and vector query templates use standard parameters only', () => {
    expect(CYPHER_QUERIES.QUERY_CHUNK_FULLTEXT).toContain('db.index.fulltext.queryNodes($indexName, $luceneQuery)');
    expect(CYPHER_QUERIES.QUERY_CHUNK_FULLTEXT).toContain('WHERE node.graphSnapshotId = $snapshotId');
    expect(CYPHER_QUERIES.QUERY_CHUNK_VECTOR).toContain('db.index.vector.queryNodes($indexName, $limit, $queryEmbedding)');
    expect(CYPHER_QUERIES.QUERY_CHUNK_VECTOR).toContain('WHERE node.graphSnapshotId = $snapshotId');
  });

  it('escapes Lucene special characters deterministically', () => {
    const raw = 'MAIN1.FCL_CYCLE_COUNTER && FCL_PRC_CYCLE_COUNTER_PKG.PROCESS + (bind: 60000006)';
    const escaped = escapeLuceneSpecialChars(raw);
    expect(escaped).not.toContain('&&');
    expect(escaped).toContain('\\&\\&');
    expect(escaped).toContain('\\(');
    expect(escaped).toContain('\\)');
    expect(escaped).toContain('\\:');
    expect(escaped).toContain('\\+');
  });

  it('validates generation token derives strictly from lowercase hex digest', () => {
    const token = deriveGenerationToken('7f35a2c1-0000-4000-8000-000000000000');
    expect(token).toMatch(/^[a-f0-9]{16}$/);
    expect(token.length).toBe(16);
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
    expect(mockRun).toHaveBeenCalledTimes(
      CYPHER_QUERIES.CREATE_CONSTRAINTS.length + CYPHER_QUERIES.CREATE_INDEXES.length
    );

    // Verify activation supports READY candidates and SUPERSEDED rollback targets.
    expect(CYPHER_QUERIES.ACTIVATE_CANDIDATE).toContain(
      "candidate.state IN ['READY', 'SUPERSEDED']"
    );
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

  it('purgeSet executes scoped non-cartesian deletes and cleans up indexes', async () => {
    const executedQueries: string[] = [];
    const mockRun = vi.fn().mockImplementation(async (query: string) => {
      executedQueries.push(query);
      if (query.includes('MATCH (s:GraphSnapshot {setId: $setId})')) {
        return {
          records: [
            {
              get: (k: string) => {
                if (k === 'graphSnapshotId') return 'snap-to-purge-1';
                if (k === 'fulltextIndexName') return 'idx_ft_1';
                if (k === 'vectorIndexName') return 'idx_vec_1';
                return null;
              },
            },
          ],
        };
      }
      if (query.includes('MATCH (set:GraphSet {setId: $setId})')) {
        return { records: [{ get: () => 'set-purge-1' }] };
      }
      if (query.includes('MATCH (l:RetrievalLease {setId: $setId})')) {
        return { records: [{ get: () => 0 }] };
      }
      return { records: [] };
    });

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

    const purged = await repo.purgeSet('set-purge-1');
    expect(purged).toBe(true);

    // Verify index drops
    expect(executedQueries.some((q) => q.includes('DROP INDEX `idx_ft_1` IF EXISTS'))).toBe(true);
    expect(executedQueries.some((q) => q.includes('DROP INDEX `idx_vec_1` IF EXISTS'))).toBe(true);

    // Verify all scoped queries were run inside executeWrite
    expect(mockExecuteWrite).toHaveBeenCalled();
    expect(executedQueries.some((q) => q.includes('Evidence') && q.includes('DETACH DELETE ev'))).toBe(true);
    expect(executedQueries.some((q) => q.includes('Conflict') && q.includes('DETACH DELETE co'))).toBe(true);
    expect(executedQueries.some((q) => q.includes('Fact') && q.includes('DETACH DELETE f'))).toBe(true);
    expect(executedQueries.some((q) => q.includes('Entity') && q.includes('DETACH DELETE e'))).toBe(true);
    expect(executedQueries.some((q) => q.includes('Chunk') && q.includes('DETACH DELETE c'))).toBe(true);
    expect(executedQueries.some((q) => q.includes('GraphSnapshot') && q.includes('DETACH DELETE s'))).toBe(true);
    expect(executedQueries.some((q) => q.includes('GraphSet') && q.includes('DETACH DELETE set'))).toBe(true);

    // Assert zero stacked OPTIONAL MATCH cartesian products
    for (const q of executedQueries) {
      const optionalMatches = (q.match(/OPTIONAL MATCH/g) || []).length;
      expect(optionalMatches).toBeLessThanOrEqual(1);
    }
  });

  describe('RESOLVE_ENTITIES parameterized Cypher template', () => {
    it('verifies RESOLVE_ENTITIES template uses substring contains for canonicalName and aliases', () => {
      const query = CYPHER_QUERIES.RESOLVE_ENTITIES;
      expect(query).toContain('toLower(e.canonicalName) CONTAINS toLower(token)');
      expect(query).toContain('any(a IN e.aliases WHERE toLower(a) CONTAINS toLower(token))');
      expect(query).toContain('e.urn = token');
      expect(query).toContain('e.normalizedKey = token');
      expect(query).toContain('LIMIT 25');
    });

    it('passes tokens array parameter to session.run in resolveEntities', async () => {
      const mockRun = vi.fn().mockResolvedValue({
        records: [
          {
            get: (k: string) => {
              if (k === 'urn') return 'urn:test:1';
              if (k === 'canonicalName') return 'Thanh toán hoá đơn';
              if (k === 'kind') return 'ProcessStep';
              return null;
            },
          },
        ],
      });
      const mockSession = {
        run: mockRun,
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

      const results = await repo.resolveEntities('snap-1', ['thanh toan']);
      expect(results).toHaveLength(1);
      expect(results[0]?.urn).toBe('urn:test:1');
      expect(mockRun).toHaveBeenCalledWith(
        CYPHER_QUERIES.RESOLVE_ENTITIES,
        {
          snapshotId: 'snap-1',
          tokens: ['thanh toan'],
        }
      );
    });
  });
});
