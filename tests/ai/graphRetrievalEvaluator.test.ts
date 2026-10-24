import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GRAPH_REFERENCE_CATEGORIES,
  GraphReferenceCaseSchema,
  GraphReferenceFixtureSchema,
  type GraphReferenceCase,
} from '../fixtures/ai/graph-reference-fixture-schema';
import { RETRIEVAL_ONTOLOGY_REGISTRY } from '../../knowledge-server/src/graph/ontology';
import { NODE_KINDS, URN_REGEX } from '../../knowledge-server/src/types/graphProtocol';
import { validateOverallDepth } from '../../knowledge-server/src/retrieval/retrievalPlanDerivation';
import {
  GRAPH_GATE_THRESHOLDS,
  evaluateGraphGate,
  evaluateGraphReferenceCases,
  type GraphMetrics,
} from './graphRetrievalEvaluator';

const FIXTURE_PATH = path.resolve('tests/fixtures/ai/graph-retrieval-reference.json');

function loadFixture(): GraphReferenceCase[] {
  return GraphReferenceFixtureSchema.parse(JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8')));
}

describe('graph reference fixture (D-21)', () => {
  const cases = loadFixture();

  it('parses and contains all seven D-21 categories', () => {
    expect(cases.length).toBeGreaterThanOrEqual(12);
    const categories = new Set(cases.map((c) => c.category));
    for (const category of GRAPH_REFERENCE_CATEGORIES) {
      expect(categories.has(category)).toBe(true);
    }
  });

  it('uses unique, stable GRF-NN ids', () => {
    const ids = cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).toMatch(/^GRF-[0-9]{2}$/));
  });

  it('keeps every expected URN inside the protocol regex', () => {
    for (const testCase of cases) {
      const urns = [
        ...testCase.expected.entityUrns,
        ...testCase.seeds.map((seed) => seed.urn),
        ...testCase.nodes.map((node) => node.urn),
        ...testCase.edges.flatMap((edge) => [edge.subjectUrn, edge.objectUrn]),
      ];
      urns.forEach((urn) => expect(urn).toMatch(URN_REGEX));
    }
  });

  it('keeps every fixture relation registry-legal for its endpoint kinds', () => {
    for (const testCase of cases) {
      const kindOf = new Map(testCase.nodes.map((node) => [node.urn, node.kind]));
      for (const edge of testCase.edges) {
        const entry = RETRIEVAL_ONTOLOGY_REGISTRY[edge.relation];
        expect(entry).toBeDefined();
        expect(entry!.allowedSourceKinds).toContain(kindOf.get(edge.subjectUrn));
        expect(entry!.allowedTargetKinds).toContain(kindOf.get(edge.objectUrn));
      }
      testCase.seeds.forEach((seed) => expect(NODE_KINDS).toContain(seed.kind));
    }
  });

  it('declares a mixed-kind case with at least two seed kinds', () => {
    const mixed = cases.filter((c) => c.category === 'mixed_kinds');
    expect(mixed.length).toBeGreaterThan(0);
    for (const testCase of mixed) {
      expect(new Set(testCase.seeds.map((seed) => seed.kind)).size).toBeGreaterThanOrEqual(2);
    }
  });

  it('expects seed-only cases to return an entity with no edges or paths', () => {
    const seedOnly = cases.filter((c) => c.category === 'seed_only');
    expect(seedOnly.length).toBeGreaterThan(0);
    for (const testCase of seedOnly) {
      expect(testCase.expected.outcome).toBe('SEED_ONLY');
      expect(testCase.expected.reasonCode).toBe('SEED_FOUND_NO_RELATION');
      expect(testCase.expected.entityUrns.length).toBeGreaterThan(0);
      expect(testCase.expected.edgeFactKeys).toHaveLength(0);
      expect(testCase.expected.minPathCount).toBe(0);
      expect(testCase.expected.maxPathCount).toBe(0);
    }
  });

  it('routes depth-5 through the real semantic boundary as HOP_LIMIT_EXCEEDED', () => {
    const depthFive = cases.filter((c) => c.maxDepth === 5);
    expect(depthFive.length).toBeGreaterThan(0);
    for (const testCase of depthFive) {
      expect(validateOverallDepth(testCase.maxDepth)).toBe('HOP_LIMIT_EXCEEDED');
      expect(testCase.expected.outcome).toBe('NO_EVIDENCE');
      expect(testCase.expected.reasonCode).toBe('HOP_LIMIT_EXCEEDED');
    }
  });

  it('expects nonexistent entities to resolve to SEED_NOT_FOUND, not a generic failure', () => {
    const missing = cases.filter((c) => c.category === 'nonexistent_entity');
    expect(missing.length).toBeGreaterThan(0);
    for (const testCase of missing) {
      expect(testCase.expected.reasonCode).toBe('SEED_NOT_FOUND');
      expect(testCase.expected.entityUrns).toHaveLength(0);
    }
  });
});

const SNAPSHOT_ID = 'gsnap_24070001';
const WRITER_URN = 'urn:plannermate:plsql:PLSQL_PROCEDURE:MAIN1.EVT_EVENT_PKG.PROCESS';
const TABLE_URN = 'urn:plannermate:oracle:ORACLE_TABLE:MAIN1.EVT_EVENT';
const FACT_KEY = 'fc121bcd064d8561f0717f0e47ba46f46611ede26a04c30e624f2e0aadf28e4e';
const CHUNK_ID = 'chunk-e1';

function makeCase(overrides: {
  id: string;
  category?: GraphReferenceCase['category'];
  seedUrn?: string;
  nodes?: GraphReferenceCase['nodes'];
  edges?: GraphReferenceCase['edges'];
  chunks?: GraphReferenceCase['chunks'];
  expected?: Partial<GraphReferenceCase['expected']>;
}): GraphReferenceCase {
  const seedUrn = overrides.seedUrn ?? TABLE_URN;
  const nodes = overrides.nodes ?? [
    { urn: TABLE_URN, kind: 'DatabaseObject', canonicalName: 'MAIN1.EVT_EVENT' },
    { urn: WRITER_URN, kind: 'SoftwareComponent', canonicalName: 'MAIN1.EVT_EVENT_PKG.PROCESS' },
  ];
  const edges = overrides.edges ?? [
    {
      factKey: FACT_KEY,
      subjectUrn: WRITER_URN,
      relation: 'WRITES_TO',
      objectUrn: TABLE_URN,
      evidenceClass: 'OBSERVED',
      supportingChunkIds: [CHUNK_ID],
    },
  ];
  const chunks = overrides.chunks ?? [
    {
      id: CHUNK_ID,
      documentId: '60000006-0000-4000-8000-000000000101',
      documentTitle: 'EVT_EVENT data dictionary',
      sectionAnchor: 'writers',
      lineStart: 10,
      lineEnd: 12,
      publishedContentHash: 'a'.repeat(64),
      rawSnippet: 'Writer inserts into table.',
    },
  ];

  return GraphReferenceCaseSchema.parse({
    id: overrides.id,
    category: overrides.category ?? 'read_write_relation',
    language: 'vi',
    query: 'Test query',
    intent: 'IMPACT_ANALYSIS',
    seeds: [{ urn: seedUrn, kind: seedUrn === TABLE_URN ? 'DatabaseObject' : 'SoftwareComponent' }],
    maxDepth: 1,
    selectedRelations: ['WRITES_TO'],
    nodes,
    edges,
    chunks,
    expected: {
      outcome: 'READY',
      entityUrns: [TABLE_URN, WRITER_URN],
      edgeFactKeys: [FACT_KEY],
      relations: ['WRITES_TO'],
      maxHops: 1,
      minPathCount: 1,
      ...overrides.expected,
    },
  });
}

describe('graph evaluator metrics (D-22)', () => {
  it('fails the gate when expected entities are missing (zero-result + recall)', async () => {
    const missingSeed = makeCase({
      id: 'GRF-90',
      category: 'nonexistent_entity',
      seedUrn: 'urn:plannermate:oracle:ORACLE_TABLE:MAIN1.MISSING',
      nodes: [],
      edges: [],
      chunks: [],
      expected: {
        outcome: 'READY',
        entityUrns: ['urn:plannermate:oracle:ORACLE_TABLE:MAIN1.MISSING'],
        edgeFactKeys: [],
        relations: [],
        minPathCount: 0,
      },
    });

    const metrics = await evaluateGraphReferenceCases([missingSeed]);
    expect(metrics.zeroResultRate).toBe(1);
    expect(metrics.entityRecall).toBe(0);
    expect(metrics.entityRecallDenominator).toBe(1);

    const verdict = evaluateGraphGate(metrics);
    expect(verdict.passed).toBe(false);
    expect(verdict.failures.map((f) => f.code)).toContain('ZERO_RESULT_RATE');
    expect(verdict.failures.map((f) => f.code)).toContain('ENTITY_RECALL');
  });

  it('documents recall and precision denominators from the fixture expectation', async () => {
    const fixture = loadFixture();
    const metrics = await evaluateGraphReferenceCases(fixture);

    const expectedEntities = fixture.reduce((n, c) => n + c.expected.entityUrns.length, 0);
    const expectedEdges = fixture.reduce((n, c) => n + c.expected.edgeFactKeys.length, 0);

    expect(metrics.entityRecallDenominator).toBe(expectedEntities);
    expect(metrics.edgePrecisionDenominator).toBe(expectedEdges);
    expect(metrics.totalCases).toBe(fixture.length);
  });

  it('fails identity when a returned factKey differs from the declared key', async () => {
    const changedKey = 'f'.repeat(64);
    const testCase = makeCase({
      id: 'GRF-91',
      edges: [
        {
          factKey: changedKey,
          subjectUrn: WRITER_URN,
          relation: 'WRITES_TO',
          objectUrn: TABLE_URN,
          evidenceClass: 'OBSERVED',
          supportingChunkIds: [CHUNK_ID],
        },
      ],
      expected: { edgeFactKeys: [FACT_KEY] },
    });

    const metrics = await evaluateGraphReferenceCases([testCase]);
    expect(metrics.identityPreserved).toBe(false);
    expect(metrics.caseResults[0]!.failureCodes).toContain('IDENTITY_MISMATCH');

    const verdict = evaluateGraphGate(metrics);
    expect(verdict.failures.map((f) => f.code)).toContain('IDENTITY_PRESERVATION');
  });

  it('fails closure when a path hop cites no supporting chunk', async () => {
    const testCase = makeCase({
      id: 'GRF-92',
      edges: [
        {
          factKey: FACT_KEY,
          subjectUrn: WRITER_URN,
          relation: 'WRITES_TO',
          objectUrn: TABLE_URN,
          evidenceClass: 'OBSERVED',
          supportingChunkIds: ['chunk-not-declared'],
        },
      ],
      expected: { edgeFactKeys: [FACT_KEY] },
    });

    const metrics = await evaluateGraphReferenceCases([testCase]);
    expect(metrics.citationClosed).toBe(false);
    expect(metrics.caseResults[0]!.failureCodes).toContain('CITATION_NOT_CLOSED');

    const verdict = evaluateGraphGate(metrics);
    expect(verdict.failures.map((f) => f.code)).toContain('CITATION_CLOSURE');
  });

  it('produces identical item and path order for reversed fixture arrays', async () => {
    const fixture = loadFixture();
    const metrics = await evaluateGraphReferenceCases(fixture);

    expect(metrics.deterministicOrdering).toBe(true);
    expect(evaluateGraphGate(metrics).failures.map((f) => f.code)).not.toContain(
      'DETERMINISTIC_ORDERING'
    );
  });

  it('collects at least 12 latency samples for p50/p95', async () => {
    const metrics = await evaluateGraphReferenceCases(loadFixture());
    expect(metrics.latency.samples).toBeGreaterThanOrEqual(
      GRAPH_GATE_THRESHOLDS.minLatencySamples
    );
    expect(metrics.latency.p95Ms).toBeGreaterThanOrEqual(metrics.latency.p50Ms);
  });

  it('fails gate on zero-result rate, recall, and precision thresholds', () => {
    const base: GraphMetrics = {
      totalCases: 12,
      zeroResultRate: 0.11,
      zeroResultDenominator: 12,
      entityRecall: 0.89,
      entityRecallDenominator: 100,
      edgePrecision: 0.89,
      edgePrecisionDenominator: 100,
      identityPreserved: true,
      citationClosed: true,
      deterministicOrdering: true,
      latency: { samples: 12, p50Ms: 1, p95Ms: 2 },
      caseResults: [],
    };
    const verdict = evaluateGraphGate(base);
    const codes = verdict.failures.map((f) => f.code);
    expect(codes).toContain('ZERO_RESULT_RATE');
    expect(codes).toContain('ENTITY_RECALL');
    expect(codes).toContain('EDGE_PRECISION');

    expect(evaluateGraphGate({
      ...base,
      zeroResultRate: 0.1,
      entityRecall: 0.9,
      edgePrecision: 0.9,
    }).passed).toBe(true);
  });

  it('always fails on identity, closure, or determinism false', () => {
    const passing: GraphMetrics = {
      totalCases: 12,
      zeroResultRate: 0,
      zeroResultDenominator: 12,
      entityRecall: 1,
      entityRecallDenominator: 100,
      edgePrecision: 1,
      edgePrecisionDenominator: 100,
      identityPreserved: true,
      citationClosed: true,
      deterministicOrdering: true,
      latency: { samples: 12, p50Ms: 1, p95Ms: 2 },
      caseResults: [],
    };
    expect(evaluateGraphGate(passing).passed).toBe(true);

    for (const override of [
      { identityPreserved: false },
      { citationClosed: false },
      { deterministicOrdering: false },
    ]) {
      const verdict = evaluateGraphGate({ ...passing, ...override });
      expect(verdict.passed).toBe(false);
    }
  });

  it('opens no socket and reads no environment during evaluation', async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls++;
      throw new Error('network access forbidden');
    }) as typeof fetch;
    const envBefore = { ...process.env };

    try {
      await evaluateGraphReferenceCases(loadFixture());
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(fetchCalls).toBe(0);
    expect(process.env).toEqual(envBefore);
    expect(SNAPSHOT_ID).toBe('gsnap_24070001');
  });
});
