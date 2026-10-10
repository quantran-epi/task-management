import { describe, it, expect, vi } from 'vitest';
import {
  STATIC_TRAVERSAL_QUERIES,
  validateTraversalPlan,
  type ValidatedTraversalPlan,
} from '../src/retrieval/graphTraversal.js';
import {
  RELATION_TYPES,
  RETRIEVAL_ONTOLOGY_REGISTRY,
  type TraversalDirection,
} from '../src/graph/ontology.js';
import type { LogicalQueryPlan } from '../src/types/retrievalProtocol.js';
import {
  URN_PROCESS_60000006,
  URN_CONTAINER_60000006,
  URN_TABLE_FCL_CYCLE_COUNTER,
} from './fixtures/pilotGoldEntities.js';

describe('18-W0-02C: Static Bounded Cypher Templates & Plan Validation', () => {
  describe('STATIC_TRAVERSAL_QUERIES Catalog', () => {
    it('covers all 10 relation types across supported directions and depths up to ontology bounds', () => {
      const directions: TraversalDirection[] = ['OUTGOING', 'INCOMING', 'BOTH'];

      for (const rel of RELATION_TYPES) {
        const entry = RETRIEVAL_ONTOLOGY_REGISTRY[rel];
        expect(entry).toBeDefined();

        for (const dir of directions) {
          for (let hop = 1; hop <= entry.maxHops; hop++) {
            const key = `${rel}:${dir}:${hop}`;
            const cypher = STATIC_TRAVERSAL_QUERIES[key];
            expect(cypher).toBeDefined();
            expect(typeof cypher).toBe('string');
            expect(cypher.length).toBeGreaterThan(20);
          }
        }
      }
    });

    it('contains zero runtime string interpolations (${) across all templates', () => {
      for (const [key, cypher] of Object.entries(STATIC_TRAVERSAL_QUERIES)) {
        expect(cypher).not.toContain('${');
        expect(typeof key).toBe('string');
      }
    });

    it('contains no unrestricted MATCH path in any template', () => {
      for (const cypher of Object.values(STATIC_TRAVERSAL_QUERIES)) {
        // Must not have bare unrestricted MATCH path = (n)-[*]-(m)
        expect(cypher).not.toMatch(/MATCH\s+path\s*=\s*\([^)]*\)\s*-\s*\[\s*\*?\s*\]\s*->/i);
        expect(cypher).not.toMatch(/MATCH\s+path\s*=\s*\([^)]*\)\s*-\s*\[\s*\*?\s*\]\s*-\s*\(/i);
      }
    });

    it('enforces snapshot property on all nodes and relations in every template', () => {
      for (const cypher of Object.values(STATIC_TRAVERSAL_QUERIES)) {
        expect(cypher).toContain('graphSnapshotId: $snapshotId');
        expect(cypher).toContain('r.graphSnapshotId = $snapshotId');
        expect(cypher).toContain('n.graphSnapshotId = $snapshotId');
      }
    });

    it('enforces evidence classification allowlist parameter in every template', () => {
      for (const cypher of Object.values(STATIC_TRAVERSAL_QUERIES)) {
        expect(cypher).toContain('r.effectiveClassification IN $evidenceClasses');
      }
    });

    it('enforces simple-path node uniqueness in every template', () => {
      for (const cypher of Object.values(STATIC_TRAVERSAL_QUERIES)) {
        // Enforces simple path: ALL(n IN nodes(path) WHERE single(m IN nodes(path) WHERE m = n))
        expect(cypher).toContain('single(m IN nodes(path) WHERE m = n)');
      }
    });

    it('enforces in-query path and edge limit clauses ($pathLimit, $maxEdges) in every template', () => {
      for (const cypher of Object.values(STATIC_TRAVERSAL_QUERIES)) {
        expect(cypher).toContain('LIMIT $pathLimit');
        expect(cypher).toContain('LIMIT $maxEdges');
      }
    });
  });

  describe('validateTraversalPlan', () => {
    const allowedSeedSet = new Set([
      URN_PROCESS_60000006,
      URN_CONTAINER_60000006,
      URN_TABLE_FCL_CYCLE_COUNTER,
    ]);

    const createBasePlan = (): LogicalQueryPlan => ({
      planId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      queryIntent: 'FLOW_TRAVERSAL',
      seedUrns: [URN_PROCESS_60000006],
      traversalSteps: [
        {
          relationType: 'CONTAINS_STEP',
          direction: 'OUTGOING',
          maxHops: 1,
        },
      ],
      overallMaxDepth: 1,
      includeInferred: false,
      fulltextKeywords: ['credit'],
      semanticQuery: 'process flow',
    });

    it('accepts valid plan and returns ValidatedTraversalPlan with default OBSERVED and BUSINESS_APPROVED evidence classes', () => {
      const plan = createBasePlan();
      const validated = validateTraversalPlan(plan, allowedSeedSet);

      expect(validated.valid).toBe(true);
      if (validated.valid) {
        expect(validated.plan.seedUrns).toEqual([URN_PROCESS_60000006]);
        expect(validated.plan.evidenceClasses).toEqual(['OBSERVED', 'BUSINESS_APPROVED']);
        expect(validated.plan.clampedDepth).toBe(1);
        expect(validated.plan.steps.length).toBe(1);
        expect(validated.plan.steps[0]!.queryKey).toBe('CONTAINS_STEP:OUTGOING:1');
      }
    });

    it('includes INFERRED when includeInferred is true', () => {
      const plan = createBasePlan();
      plan.includeInferred = true;
      const validated = validateTraversalPlan(plan, allowedSeedSet);

      expect(validated.valid).toBe(true);
      if (validated.valid) {
        expect(validated.plan.evidenceClasses).toEqual([
          'OBSERVED',
          'BUSINESS_APPROVED',
          'INFERRED',
        ]);
      }
    });

    it('returns empty seeds indicator without errors when seedUrns is empty or has NO_GRAPH_SEED marker', () => {
      const plan = createBasePlan();
      (plan as any).seedUrns = [];
      const validated = validateTraversalPlan(plan, allowedSeedSet);

      expect(validated.valid).toBe(false);
      expect(validated.reason).toBe('NO_GRAPH_SEED');
    });

    it('rejects seed URNs not in allowedSeedSet', () => {
      const plan = createBasePlan();
      plan.seedUrns = ['urn:plannermate:smartvista:PRC_PROCESS:99999999' as any];
      const validated = validateTraversalPlan(plan, allowedSeedSet);

      expect(validated.valid).toBe(false);
      expect(validated.reason).toContain('Unallowlisted seed');
    });

    it('rejects more than 5 traversal steps', () => {
      const plan = createBasePlan();
      plan.traversalSteps = [
        { relationType: 'CONTAINS_STEP', direction: 'OUTGOING', maxHops: 1 },
        { relationType: 'PRECEDES', direction: 'OUTGOING', maxHops: 1 },
        { relationType: 'INVOKES', direction: 'OUTGOING', maxHops: 1 },
        { relationType: 'CALLS', direction: 'OUTGOING', maxHops: 1 },
        { relationType: 'READS_FROM', direction: 'OUTGOING', maxHops: 1 },
        { relationType: 'WRITES_TO', direction: 'OUTGOING', maxHops: 1 },
      ];
      const validated = validateTraversalPlan(plan, allowedSeedSet);

      expect(validated.valid).toBe(false);
      expect(validated.reason).toContain('exceeds maximum 5');
    });

    it('clamps overall depth > 3 to 3 and emits bounded clamp warning metadata', () => {
      const plan = createBasePlan();
      (plan as any).overallMaxDepth = 5;
      const validated = validateTraversalPlan(plan, allowedSeedSet);

      expect(validated.valid).toBe(true);
      if (validated.valid) {
        expect(validated.plan.clampedDepth).toBe(3);
        expect(validated.warnings).toContain('Overall depth 5 clamped to maximum 3');
      }
    });

    it('clamps step maxHops exceeding relation registry limit to registry limit and records warning', () => {
      const plan = createBasePlan();
      // CONTAINS_STEP registry maxHops is 1
      plan.traversalSteps = [
        { relationType: 'CONTAINS_STEP', direction: 'OUTGOING', maxHops: 3 },
      ];
      const validated = validateTraversalPlan(plan, allowedSeedSet);

      expect(validated.valid).toBe(true);
      if (validated.valid) {
        expect(validated.plan.steps[0]!.hops).toBe(1);
        expect(validated.plan.steps[0]!.queryKey).toBe('CONTAINS_STEP:OUTGOING:1');
        expect(validated.warnings.some((w) => w.includes('clamped to registry maximum 1'))).toBe(true);
      }
    });

    it('rejects unknown relation type', () => {
      const plan = createBasePlan();
      (plan.traversalSteps[0] as any).relationType = 'UNKNOWN_RELATION';
      const validated = validateTraversalPlan(plan, allowedSeedSet);

      expect(validated.valid).toBe(false);
      expect(validated.reason).toContain('Unknown relation type UNKNOWN_RELATION');
    });
  });
});
