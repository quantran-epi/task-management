import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GRAPH_REFERENCE_CATEGORIES,
  GraphReferenceFixtureSchema,
  type GraphReferenceCase,
} from '../fixtures/ai/graph-reference-fixture-schema';
import { RETRIEVAL_ONTOLOGY_REGISTRY } from '../../knowledge-server/src/graph/ontology';
import { NODE_KINDS, URN_REGEX } from '../../knowledge-server/src/types/graphProtocol';
import { validateOverallDepth } from '../../knowledge-server/src/retrieval/retrievalPlanDerivation';

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
