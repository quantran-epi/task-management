import { describe, expect, it } from 'vitest';
import {
  deriveAllRelationSteps,
  deriveSeedPlan,
  directionForSeedKind,
  validateOverallDepth,
  validateStepAgainstRegistry,
  PLAN_VALIDATION_REASON_CODES,
  type LooseTraversalStepCandidate,
} from '../src/retrieval/retrievalPlanDerivation.js';
import { RETRIEVAL_ONTOLOGY_REGISTRY } from '../src/graph/ontology.js';
import {
  LogicalQueryPlanSchema,
  MODEL_DEPTH_INPUT_CAP,
  REASON_CODES,
  type ClarificationCandidate,
  type LogicalQueryPlan,
} from '../src/types/retrievalProtocol.js';

const URN_DB_OBJECT = 'urn:plannermate:oracle:ORACLE_TABLE:MAIN1.EVT_EVENT';
const URN_PROCESS = 'urn:plannermate:smartvista:PRC_PROCESS:60000006';

const dbSeed: ClarificationCandidate = {
  urn: URN_DB_OBJECT,
  canonicalName: 'MAIN1.EVT_EVENT',
  kind: 'DatabaseObject',
};

const processSeed: ClarificationCandidate = {
  urn: URN_PROCESS,
  canonicalName: 'SHB - Credit calculations',
  kind: 'ScheduledProcess',
};

function buildPlan(overrides?: Partial<LogicalQueryPlan>): unknown {
  return {
    planId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    queryIntent: 'LOOKUP',
    seedUrns: [URN_DB_OBJECT],
    traversalSteps: [],
    overallMaxDepth: 1,
    includeInferred: false,
    fulltextKeywords: ['EVT_EVENT'],
    semanticQuery: 'EVT_EVENT lookup',
    ...overrides,
  };
}

describe('24-01: registry-derived retrieval plan derivation', () => {
  describe('REASON_CODES extension', () => {
    it('carries all stable Phase 24 codes alongside the eight original codes', () => {
      for (const code of [
        'INVALID_RELATION',
        'INVALID_DIRECTION',
        'INVALID_ENDPOINT_KIND',
        'HOP_LIMIT_EXCEEDED',
        'SEED_NOT_FOUND',
        'PLAN_REJECTED',
        'SEED_FOUND_NO_RELATION',
        'FALLBACK_ONE_HOP',
        'MISSING_SUPPORTING_CHUNK',
      ]) {
        expect(REASON_CODES).toContain(code);
      }
      expect(REASON_CODES).toHaveLength(17);
    });
  });

  describe('deriveAllRelationSteps', () => {
    it('derives exactly inbound READS_FROM and inbound WRITES_TO for DatabaseObject, never BOTH', () => {
      const steps = deriveAllRelationSteps('DatabaseObject', 1);

      expect(steps).toHaveLength(2);
      expect(steps).toEqual([
        { relationType: 'READS_FROM', direction: 'INCOMING', maxHops: 1, targetKind: 'SoftwareComponent' },
        { relationType: 'WRITES_TO', direction: 'INCOMING', maxHops: 1, targetKind: 'SoftwareComponent' },
      ]);
      expect(steps.every((step) => step.direction !== 'BOTH')).toBe(true);
    });

    it('derives exactly CONTAINS_STEP OUTGOING for ScheduledProcess', () => {
      expect(deriveAllRelationSteps('ScheduledProcess', 1)).toEqual([
        { relationType: 'CONTAINS_STEP', direction: 'OUTGOING', maxHops: 1, targetKind: 'ProcessStep' },
      ]);
    });

    it('derives the complete SoftwareComponent relation set in registry order', () => {
      const steps = deriveAllRelationSteps('SoftwareComponent', 3);

      expect(steps.map((step) => `${step.relationType}:${step.direction}`)).toEqual([
        'CALLS:BOTH',
        'INVOKES:INCOMING',
        'READS_FROM:OUTGOING',
        'WRITES_TO:OUTGOING',
        'EMITS:OUTGOING',
        'CONSUMES:OUTGOING',
        'USES_TYPE:OUTGOING',
        'HAS_STATUS:OUTGOING',
      ]);
      expect(steps.find((s) => s.relationType === 'CALLS')?.maxHops).toBe(3);
      expect(steps.find((s) => s.relationType === 'INVOKES')?.maxHops).toBe(2);
    });

    it('uses BOTH only for PRECEDES with ProcessStep and CALLS with SoftwareComponent', () => {
      const bothSteps = new Set<string>();
      for (const kind of [
        'ScheduledProcess',
        'ProcessStep',
        'SoftwareComponent',
        'DatabaseObject',
        'CycleType',
        'Status',
        'SourceDocument',
      ] as const) {
        for (const step of deriveAllRelationSteps(kind, 3)) {
          if (step.direction === 'BOTH') bothSteps.add(`${kind}:${step.relationType}`);
        }
      }

      expect([...bothSteps].sort()).toEqual(['ProcessStep:PRECEDES', 'SoftwareComponent:CALLS']);
    });
  });

  describe('directionForSeedKind', () => {
    it('returns OUTGOING, INCOMING, BOTH, and null per endpoint membership', () => {
      expect(directionForSeedKind(RETRIEVAL_ONTOLOGY_REGISTRY.CONTAINS_STEP, 'ScheduledProcess')).toBe('OUTGOING');
      expect(directionForSeedKind(RETRIEVAL_ONTOLOGY_REGISTRY.WRITES_TO, 'DatabaseObject')).toBe('INCOMING');
      expect(directionForSeedKind(RETRIEVAL_ONTOLOGY_REGISTRY.CALLS, 'SoftwareComponent')).toBe('BOTH');
      expect(directionForSeedKind(RETRIEVAL_ONTOLOGY_REGISTRY.WRITES_TO, 'ScheduledProcess')).toBeNull();
    });
  });

  describe('deriveSeedPlan', () => {
    it('produces distinct per-seed plans with no cross-seed URN leakage', () => {
      const dbPlan = deriveSeedPlan(dbSeed, { maxDepth: 1, allowAllRelations: true });
      const processPlan = deriveSeedPlan(processSeed, { maxDepth: 1, allowAllRelations: true });

      expect(dbPlan.seedUrn).toBe(URN_DB_OBJECT);
      expect(processPlan.seedUrn).toBe(URN_PROCESS);
      expect(dbPlan.steps.map((s) => s.relationType).sort()).toEqual(['READS_FROM', 'WRITES_TO']);
      expect(processPlan.steps.map((s) => s.relationType)).toEqual(['CONTAINS_STEP']);
      expect(dbPlan.steps.every((s) => s.seedUrn === URN_DB_OBJECT)).toBe(true);
      expect(processPlan.steps.every((s) => s.seedUrn === URN_PROCESS)).toBe(true);
    });

    it('filters to selectedRelations and falls back to all safe one-hop relations when empty', () => {
      const selected = deriveSeedPlan(dbSeed, {
        maxDepth: 1,
        selectedRelations: ['WRITES_TO', 'NOT_A_RELATION'],
      });
      expect(selected.steps.map((s) => s.relationType)).toEqual(['WRITES_TO']);

      const emptySelection = deriveSeedPlan(dbSeed, {
        maxDepth: 1,
        selectedRelations: ['NOT_A_RELATION'],
        applySafeFallback: true,
      });
      expect(emptySelection.steps.map((s) => s.relationType)).toEqual(['READS_FROM', 'WRITES_TO']);
    });
  });

  describe('validateStepAgainstRegistry', () => {
    it('returns null for every derived valid step', () => {
      for (const step of deriveAllRelationSteps('DatabaseObject', 3)) {
        expect(
          validateStepAgainstRegistry(step as LooseTraversalStepCandidate, 'DatabaseObject')
        ).toBeNull();
      }
      for (const step of deriveAllRelationSteps('SoftwareComponent', 3)) {
        expect(
          validateStepAgainstRegistry(step as LooseTraversalStepCandidate, 'SoftwareComponent')
        ).toBeNull();
      }
    });

    it('returns stable codes for unknown relation, bad direction, bad endpoint, and over-hop steps', () => {
      expect(
        validateStepAgainstRegistry({ relationType: 'NOT_A_RELATION' }, 'DatabaseObject')
      ).toBe('INVALID_RELATION');

      expect(
        validateStepAgainstRegistry(
          { relationType: 'CONTAINS_STEP', direction: 'BOTH' },
          'ScheduledProcess'
        )
      ).toBe('INVALID_DIRECTION');

      expect(
        validateStepAgainstRegistry(
          { relationType: 'WRITES_TO', direction: 'INCOMING', targetKind: 'ScheduledProcess' },
          'DatabaseObject'
        )
      ).toBe('INVALID_ENDPOINT_KIND');

      expect(
        validateStepAgainstRegistry(
          { relationType: 'CONTAINS_STEP', direction: 'OUTGOING', maxHops: 2 },
          'ScheduledProcess'
        )
      ).toBe('HOP_LIMIT_EXCEEDED');

      expect(
        validateStepAgainstRegistry(
          { relationType: 'READS_FROM', direction: 'INCOMING', maxHops: 4 },
          'DatabaseObject'
        )
      ).toBe('HOP_LIMIT_EXCEEDED');
    });

    it('emits only members of PLAN_VALIDATION_REASON_CODES', () => {
      const codes = [
        validateStepAgainstRegistry({ relationType: 'NOT_A_RELATION' }, 'DatabaseObject'),
        validateStepAgainstRegistry({ relationType: 'CALLS', direction: 'INCOMING' }, 'DatabaseObject'),
        validateStepAgainstRegistry({ relationType: 'WRITES_TO', targetKind: 'Status' }, 'SoftwareComponent'),
        validateStepAgainstRegistry({ relationType: 'CALLS', direction: 'BOTH', maxHops: 4 }, 'SoftwareComponent'),
      ];
      for (const code of codes) {
        expect(code).not.toBeNull();
        expect(PLAN_VALIDATION_REASON_CODES).toContain(code as never);
      }
    });
  });

  describe('depth schema boundary vs semantic depth boundary', () => {
    it('parses integer depths 1..10 for overallMaxDepth and step maxHops', () => {
      expect(MODEL_DEPTH_INPUT_CAP).toBe(10);

      for (let depth = 1; depth <= MODEL_DEPTH_INPUT_CAP; depth++) {
        const plan = LogicalQueryPlanSchema.safeParse(
          buildPlan({
            overallMaxDepth: depth,
            traversalSteps: [
              {
                relationType: 'CALLS',
                direction: 'BOTH',
                maxHops: depth,
                targetKind: 'SoftwareComponent',
              },
            ],
          })
        );
        expect(plan.success, `depth ${depth} should parse`).toBe(true);
      }
    });

    it('rejects depth 11 and below 1 at schema parsing', () => {
      expect(LogicalQueryPlanSchema.safeParse(buildPlan({ overallMaxDepth: 11 })).success).toBe(false);
      expect(LogicalQueryPlanSchema.safeParse(buildPlan({ overallMaxDepth: 0 })).success).toBe(false);
      expect(
        LogicalQueryPlanSchema.safeParse(
          buildPlan({
            traversalSteps: [{ relationType: 'CALLS', direction: 'BOTH', maxHops: 11 }],
          })
        ).success
      ).toBe(false);
    });

    it('accepts semantic depth 1..3 and rejects 4..10 with HOP_LIMIT_EXCEEDED', () => {
      expect(validateOverallDepth(1)).toBeNull();
      expect(validateOverallDepth(3)).toBeNull();
      for (const depth of [4, 5, 10]) {
        expect(validateOverallDepth(depth)).toBe('HOP_LIMIT_EXCEEDED');
      }
    });

    it('reaches HOP_LIMIT_EXCEEDED after a real parse for depths 5 and 10', () => {
      for (const depth of [5, 10]) {
        const parsed = LogicalQueryPlanSchema.safeParse(buildPlan({ overallMaxDepth: depth }));
        expect(parsed.success).toBe(true);
        if (parsed.success) {
          expect(validateOverallDepth(parsed.data.overallMaxDepth)).toBe('HOP_LIMIT_EXCEEDED');
        }
      }

      const tooDeep = LogicalQueryPlanSchema.safeParse(buildPlan({ overallMaxDepth: 11 }));
      expect(tooDeep.success).toBe(false);
    });
  });
});
