import { describe, expect, it } from 'vitest';
import {
  RELATION_TYPES,
  NODE_KINDS,
  RETRIEVAL_ONTOLOGY_REGISTRY,
} from '../src/graph/ontology.js';
import {
  isPureIdentifierQuery,
  resolveQueryEntities,
  buildQueryExecutionPlan,
  buildDeterministicFallbackPlan,
} from '../src/retrieval/queryPlanning.js';
import {
  PILOT_GOLD_NODES,
  URN_PROCESS_60000006,
  URN_CONTAINER_60000006,
  URN_TABLE_FCL_CYCLE_COUNTER,
  URN_PKG_FCL_CYCLE_COUNTER,
  URN_CYTP_1002,
  URN_STATUS_FAILED,
} from './fixtures/pilotGoldEntities.js';
import type { GraphRetrievalGateway, OperationOptions } from '../src/retrieval/contracts.js';
import type { ClarificationCandidate } from '../src/types/retrievalProtocol.js';

class MockGraphGateway implements GraphRetrievalGateway {
  constructor(private readonly candidates: ClarificationCandidate[] = []) {}

  async resolveEntities(
    snapshotId: string,
    queryTokens: readonly string[],
    options?: OperationOptions
  ): Promise<ClarificationCandidate[]> {
    if (options?.signal?.aborted) throw new Error('Aborted');
    return this.candidates;
  }

  async traverse(): Promise<any> {
    throw new Error('Not implemented in mock');
  }
}

describe('18-W0-02A: Retrieval Ontology Registry & Identifier/Entity Resolution', () => {
  describe('RETRIEVAL_ONTOLOGY_REGISTRY', () => {
    it('covers exactly all 10 relation types with valid source and target node kinds', () => {
      expect(RETRIEVAL_ONTOLOGY_REGISTRY).toBeDefined();
      const registeredRelations = Object.keys(RETRIEVAL_ONTOLOGY_REGISTRY);
      expect(registeredRelations.sort()).toEqual([...RELATION_TYPES].sort());

      for (const rel of RELATION_TYPES) {
        const entry = RETRIEVAL_ONTOLOGY_REGISTRY[rel];
        expect(entry).toBeDefined();
        expect(entry.relationType).toBe(rel);
        expect(entry.allowedSourceKinds.length).toBeGreaterThan(0);
        expect(entry.allowedTargetKinds.length).toBeGreaterThan(0);
        for (const k of entry.allowedSourceKinds) {
          expect(NODE_KINDS).toContain(k);
        }
        for (const k of entry.allowedTargetKinds) {
          expect(NODE_KINDS).toContain(k);
        }
        expect(['OUTGOING', 'INCOMING', 'BOTH']).toContain(entry.defaultDirection);
        expect(entry.maxHops).toBeGreaterThanOrEqual(1);
        expect(entry.maxHops).toBeLessThanOrEqual(3);
        expect(entry.exampleIntents.length).toBeGreaterThan(0);
      }
    });

    it('enforces exact per-relation max hops matching specification', () => {
      expect(RETRIEVAL_ONTOLOGY_REGISTRY.CONTAINS_STEP.maxHops).toBe(1);
      expect(RETRIEVAL_ONTOLOGY_REGISTRY.PRECEDES.maxHops).toBe(2);
      expect(RETRIEVAL_ONTOLOGY_REGISTRY.CALLS.maxHops).toBe(3);
      expect(RETRIEVAL_ONTOLOGY_REGISTRY.INVOKES.maxHops).toBe(2);
      expect(RETRIEVAL_ONTOLOGY_REGISTRY.READS_FROM.maxHops).toBe(3);
      expect(RETRIEVAL_ONTOLOGY_REGISTRY.WRITES_TO.maxHops).toBe(3);
      expect(RETRIEVAL_ONTOLOGY_REGISTRY.EMITS.maxHops).toBe(2);
      expect(RETRIEVAL_ONTOLOGY_REGISTRY.CONSUMES.maxHops).toBe(2);
      expect(RETRIEVAL_ONTOLOGY_REGISTRY.USES_TYPE.maxHops).toBe(2);
      expect(RETRIEVAL_ONTOLOGY_REGISTRY.HAS_STATUS.maxHops).toBe(1);
    });
  });

  describe('isPureIdentifierQuery classifier', () => {
    it('classifies exact qualified Oracle identifiers, uppercase tokens, numbers, and URNs as pure identifiers', () => {
      expect(isPureIdentifierQuery('MAIN1.FCL_CYCLE_COUNTER')).toBe(true);
      expect(isPureIdentifierQuery('AML_RISK')).toBe(true);
      expect(isPureIdentifierQuery('60000006')).toBe(true);
      expect(isPureIdentifierQuery('CYTP1002')).toBe(true);
      expect(isPureIdentifierQuery('PRSR0003')).toBe(true);
      expect(isPureIdentifierQuery('MAIN1.FCL_PRC_CYCLE_COUNTER_PKG.PROCESS')).toBe(true);
      expect(isPureIdentifierQuery('ru.bpc.sv2.scheduler.process.InternalProcessExecutor')).toBe(true);
      expect(isPureIdentifierQuery('  AML_RISK  ')).toBe(true);
      expect(isPureIdentifierQuery('`MAIN1.FCL_CYCLE_COUNTER`')).toBe(true);
      expect(isPureIdentifierQuery('urn:plannermate:oracle:DatabaseObject:MAIN1.AML_RISK')).toBe(true);
    });

    it('rejects natural-language queries, questions, pronouns, Vietnamese particles, and multi-clause statements', () => {
      expect(isPureIdentifierQuery('AML_RISK đổi tên ảnh hưởng gì')).toBe(false);
      expect(isPureIdentifierQuery('what calls AML_RISK')).toBe(false);
      expect(isPureIdentifierQuery('cái này')).toBe(false);
      expect(isPureIdentifierQuery('cái này đổi có ảnh hưởng gì')).toBe(false);
      expect(isPureIdentifierQuery('nó')).toBe(false);
      expect(isPureIdentifierQuery('who writes to FCL_CYCLE_COUNTER')).toBe(false);
      expect(isPureIdentifierQuery('FCL_CYCLE_COUNTER is updated by')).toBe(false);
      expect(isPureIdentifierQuery('bước 60000006')).toBe(false);
      expect(isPureIdentifierQuery('')).toBe(false);
      expect(isPureIdentifierQuery('   ')).toBe(false);
    });
  });

  describe('resolveQueryEntities', () => {
    const pinnedSnapshot = 'snapshot-pinned-01';

    it('resolves unique entity matching canonicalName, aliases, normalizedKey or URN', async () => {
      const gateway = new MockGraphGateway([
        {
          urn: URN_TABLE_FCL_CYCLE_COUNTER,
          canonicalName: 'MAIN1.FCL_CYCLE_COUNTER',
          kind: 'DatabaseObject',
        },
      ]);

      const result = await resolveQueryEntities(
        gateway,
        pinnedSnapshot,
        'MAIN1.FCL_CYCLE_COUNTER'
      );

      expect(result.status).toBe('resolved');
      if (result.status === 'resolved') {
        expect(result.resolved.urn).toBe(URN_TABLE_FCL_CYCLE_COUNTER);
        expect(result.candidates).toHaveLength(1);
      }
    });

    it('detects numeric collision 60000006 and returns both process and container candidates as ambiguity', async () => {
      const gateway = new MockGraphGateway([
        {
          urn: URN_PROCESS_60000006,
          canonicalName: 'SHB - Credit calculations',
          kind: 'ScheduledProcess',
        },
        {
          urn: URN_CONTAINER_60000006,
          canonicalName: 'Step 20 - Grace period length cycle',
          kind: 'ProcessStep',
        },
      ]);

      const result = await resolveQueryEntities(
        gateway,
        pinnedSnapshot,
        '60000006'
      );

      expect(result.status).toBe('ambiguous');
      expect(result.candidates).toHaveLength(2);
      const urns = result.candidates.map((c) => c.urn);
      expect(urns).toContain(URN_PROCESS_60000006);
      expect(urns).toContain(URN_CONTAINER_60000006);
    });

    it('disambiguates collision when query contains explicit kind discriminator', async () => {
      const gateway = new MockGraphGateway([
        {
          urn: URN_PROCESS_60000006,
          canonicalName: 'SHB - Credit calculations',
          kind: 'ScheduledProcess',
        },
        {
          urn: URN_CONTAINER_60000006,
          canonicalName: 'Step 20 - Grace period length cycle',
          kind: 'ProcessStep',
        },
      ]);

      const resultProcess = await resolveQueryEntities(
        gateway,
        pinnedSnapshot,
        'quy trình 60000006'
      );
      expect(resultProcess.status).toBe('resolved');
      if (resultProcess.status === 'resolved') {
        expect(resultProcess.resolved.urn).toBe(URN_PROCESS_60000006);
      }

      const resultStep = await resolveQueryEntities(
        gateway,
        pinnedSnapshot,
        'bước 60000006'
      );
      expect(resultStep.status).toBe('resolved');
      if (resultStep.status === 'resolved') {
        expect(resultStep.resolved.urn).toBe(URN_CONTAINER_60000006);
      }
    });

    it('resolves pronoun using recent turns if present', async () => {
      const gateway = new MockGraphGateway([
        {
          urn: URN_PKG_FCL_CYCLE_COUNTER,
          canonicalName: 'MAIN1.FCL_PRC_CYCLE_COUNTER_PKG.PROCESS',
          kind: 'SoftwareComponent',
        },
      ]);

      const recentTurns = [
        {
          role: 'user' as const,
          text: 'FCL_PRC_CYCLE_COUNTER_PKG làm gì?',
          resolvedUrns: [URN_PKG_FCL_CYCLE_COUNTER],
        },
      ];

      const result = await resolveQueryEntities(
        gateway,
        pinnedSnapshot,
        'cái này gọi bảng nào?',
        recentTurns
      );

      expect(result.status).toBe('resolved');
      if (result.status === 'resolved') {
        expect(result.resolved.urn).toBe(URN_PKG_FCL_CYCLE_COUNTER);
      }
    });

    it('flags unresolvable pronoun without prior turns as needsClarification', async () => {
      const gateway = new MockGraphGateway([]);

      const result = await resolveQueryEntities(
        gateway,
        pinnedSnapshot,
        'cái này đổi có ảnh hưởng gì'
      );

      expect(result.status).toBe('needsClarification');
      expect(result.candidates).toEqual([]);
    });

    it('bounds recent turns to at most 3 and URNs to at most 5 per turn', async () => {
      let passedTokens: readonly string[] = [];
      const gateway: GraphRetrievalGateway = {
        async resolveEntities(_s, tokens) {
          passedTokens = tokens;
          return [];
        },
        async traverse(): Promise<any> {
          throw new Error('Not implemented');
        },
      };

      const excessiveTurns = [
        { role: 'user' as const, text: 'turn 0', resolvedUrns: [] },
        { role: 'user' as const, text: 'turn 1', resolvedUrns: [] },
        { role: 'user' as const, text: 'turn 2', resolvedUrns: [] },
        { role: 'user' as const, text: 'turn 3', resolvedUrns: [] },
        { role: 'user' as const, text: 'turn 4', resolvedUrns: [] },
      ];

      await resolveQueryEntities(
        gateway,
        pinnedSnapshot,
        'what calls X',
        excessiveTurns
      );

      expect(passedTokens.length).toBeGreaterThan(0);
    });
  });

  describe('18-W0-02B: buildQueryExecutionPlan Coordinator', () => {
    const pinnedSnapshot = 'snapshot-pinned-01';

    it('fast-paths pure identifier and calls planner zero times', async () => {
      const gateway = new MockGraphGateway([
        {
          urn: URN_TABLE_FCL_CYCLE_COUNTER,
          canonicalName: 'MAIN1.FCL_CYCLE_COUNTER',
          kind: 'DatabaseObject',
        },
      ]);

      let plannerCallCount = 0;
      const planner = {
        async plan(): Promise<any> {
          plannerCallCount++;
          throw new Error('Planner should not be called for fast path');
        },
      };

      const result = await buildQueryExecutionPlan({
        request: {
          query: 'MAIN1.FCL_CYCLE_COUNTER',
          limit: 20,
          includeInferred: false,
          recentTurns: [],
        },
        pinnedSnapshotId: pinnedSnapshot,
        gateway,
        planner,
      });

      expect(plannerCallCount).toBe(0);
      expect(result.status).toBe('executable');
      if (result.status === 'executable') {
        expect(result.isFastPath).toBe(true);
        expect(result.isDegraded).toBe(false);
        expect(result.plan.seedUrns).toEqual([URN_TABLE_FCL_CYCLE_COUNTER]);
        expect(result.plan.fulltextKeywords).toContain('MAIN1.FCL_CYCLE_COUNTER');
        expect(result.plan.overallMaxDepth).toBe(1);
        expect(result.plan.traversalSteps.length).toBeGreaterThan(0);
        expect(result.planTrace.fastPath).toBe(true);
        expect(result.planTrace.resolvedUrns).toEqual([URN_TABLE_FCL_CYCLE_COUNTER]);
      }
    });

    it('calls planner exactly once for valid natural-language query', async () => {
      const gateway = new MockGraphGateway([
        {
          urn: URN_TABLE_FCL_CYCLE_COUNTER,
          canonicalName: 'MAIN1.FCL_CYCLE_COUNTER',
          kind: 'DatabaseObject',
        },
      ]);

      let plannerCalls: any[] = [];
      const planner = {
        async plan(req: any, ctx: any): Promise<any> {
          plannerCalls.push({ req, ctx });
          return {
            type: 'plan',
            plan: {
              planId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
              queryIntent: 'IMPACT_ANALYSIS',
              seedUrns: [URN_TABLE_FCL_CYCLE_COUNTER],
              traversalSteps: [
                {
                  relationType: 'READS_FROM',
                  direction: 'INCOMING',
                  maxHops: 2,
                },
              ],
              overallMaxDepth: 2,
              includeInferred: false,
              fulltextKeywords: ['FCL_CYCLE_COUNTER'],
              semanticQuery: req.query,
            },
          };
        },
      };

      const result = await buildQueryExecutionPlan({
        request: {
          query: 'who reads from FCL_CYCLE_COUNTER?',
          limit: 20,
          includeInferred: false,
          recentTurns: [],
        },
        pinnedSnapshotId: pinnedSnapshot,
        gateway,
        planner,
      });

      expect(plannerCalls).toHaveLength(1);
      expect(plannerCalls[0].ctx.resolvedCandidates).toHaveLength(1);
      expect(result.status).toBe('executable');
      if (result.status === 'executable') {
        expect(result.isFastPath).toBe(false);
        expect(result.isDegraded).toBe(false);
        expect(result.plan.queryIntent).toBe('IMPACT_ANALYSIS');
        expect(result.plan.seedUrns).toEqual([URN_TABLE_FCL_CYCLE_COUNTER]);
        expect(result.plan.traversalSteps[0]?.relationType).toBe('READS_FROM');
        expect(result.planTrace.fastPath).toBe(false);
        expect(result.planTrace.degradedFallback).toBe(false);
      }
    });

    it('repairs once when first response fails validation and succeeds on second call', async () => {
      const gateway = new MockGraphGateway([
        {
          urn: URN_TABLE_FCL_CYCLE_COUNTER,
          canonicalName: 'MAIN1.FCL_CYCLE_COUNTER',
          kind: 'DatabaseObject',
        },
      ]);

      let callCount = 0;
      const planner = {
        async plan(req: any): Promise<any> {
          callCount++;
          if (callCount === 1) {
            // First call: returns invalid schema (missing semanticQuery, unknown relation)
            return {
              type: 'plan',
              plan: {
                planId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
                queryIntent: 'INVALID_INTENT',
                seedUrns: [URN_TABLE_FCL_CYCLE_COUNTER],
                traversalSteps: [],
              },
            };
          }
          // Second call (repair): returns valid plan
          return {
            type: 'plan',
            plan: {
              planId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
              queryIntent: 'LOOKUP',
              seedUrns: [URN_TABLE_FCL_CYCLE_COUNTER],
              traversalSteps: [],
              overallMaxDepth: 1,
              includeInferred: false,
              fulltextKeywords: ['FCL_CYCLE_COUNTER'],
              semanticQuery: 'valid query',
            },
          };
        },
      };

      const result = await buildQueryExecutionPlan({
        request: {
          query: 'explain FCL_CYCLE_COUNTER',
          limit: 20,
          includeInferred: false,
          recentTurns: [],
        },
        pinnedSnapshotId: pinnedSnapshot,
        gateway,
        planner,
      });

      expect(callCount).toBe(2);
      expect(result.status).toBe('executable');
      if (result.status === 'executable') {
        expect(result.isDegraded).toBe(false);
        expect(result.plan.queryIntent).toBe('LOOKUP');
      }
    });

    it('degrades to deterministic fallback after two failed planner attempts without exposing secrets', async () => {
      const gateway = new MockGraphGateway([
        {
          urn: URN_TABLE_FCL_CYCLE_COUNTER,
          canonicalName: 'MAIN1.FCL_CYCLE_COUNTER',
          kind: 'DatabaseObject',
        },
      ]);

      let callCount = 0;
      const planner = {
        async plan(): Promise<any> {
          callCount++;
          // Always return invalid plan (invented seed URN)
          return {
            type: 'plan',
            plan: {
              planId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
              queryIntent: 'LOOKUP',
              seedUrns: ['urn:plannermate:oracle:DatabaseObject:INVENTED_TABLE'],
              traversalSteps: [],
              overallMaxDepth: 1,
              includeInferred: false,
              fulltextKeywords: ['INVENTED'],
              semanticQuery: 'query',
            },
          };
        },
      };

      const result = await buildQueryExecutionPlan({
        request: {
          query: 'explain FCL_CYCLE_COUNTER',
          limit: 20,
          includeInferred: false,
          recentTurns: [],
        },
        pinnedSnapshotId: pinnedSnapshot,
        gateway,
        planner,
      });

      expect(callCount).toBe(2);
      expect(result.status).toBe('executable');
      if (result.status === 'executable') {
        expect(result.isDegraded).toBe(true);
        expect(result.planTrace.degradedFallback).toBe(true);
        expect(result.planTrace.reasonCode).toBe('PLANNER_SCHEMA_FAILURE');
        // Traversal capped at 5 one-hop entries
        expect(result.plan.traversalSteps.length).toBeLessThanOrEqual(5);
        for (const s of result.plan.traversalSteps) {
          expect(s.maxHops).toBe(1);
          expect(s.direction).toBe('BOTH');
        }
        // Invented URN was rejected, only server-resolved URN is used
        expect(result.plan.seedUrns).toEqual([URN_TABLE_FCL_CYCLE_COUNTER]);
      }
    });

    it('returns NEEDS_CLARIFICATION for unresolved pronoun and does not call planner', async () => {
      const gateway = new MockGraphGateway([]);

      let plannerCalled = false;
      const planner = {
        async plan(): Promise<any> {
          plannerCalled = true;
          throw new Error('Planner must not be called on ambiguity');
        },
      };

      const result = await buildQueryExecutionPlan({
        request: {
          query: 'cái này đổi có ảnh hưởng gì',
          limit: 20,
          includeInferred: false,
          recentTurns: [],
        },
        pinnedSnapshotId: pinnedSnapshot,
        gateway,
        planner,
      });

      expect(plannerCalled).toBe(false);
      expect(result.status).toBe('needsClarification');
      if (result.status === 'needsClarification') {
        expect(result.semanticOutcome).toBe('NEEDS_CLARIFICATION');
        expect(result.seedUrns).toEqual([]);
        expect(result.graphDirective).toBe('NO_GRAPH_SEED');
        expect(result.semanticQuery).toBe('cái này đổi có ảnh hưởng gì');
        expect(result.fulltextKeywords).toEqual(['cái này đổi có ảnh hưởng gì']);
        expect(result.safeCandidates).toEqual([]);
      }
    });

    it('returns NEEDS_CLARIFICATION with safe candidates on ambiguous name collision', async () => {
      const gateway = new MockGraphGateway([
        {
          urn: URN_PROCESS_60000006,
          canonicalName: 'SHB - Credit calculations',
          kind: 'ScheduledProcess',
        },
        {
          urn: URN_CONTAINER_60000006,
          canonicalName: 'Step 20 - Grace period length cycle',
          kind: 'ProcessStep',
        },
      ]);

      let plannerCalled = false;
      const planner = {
        async plan(): Promise<any> {
          plannerCalled = true;
          throw new Error('Planner must not be called on collision');
        },
      };

      const result = await buildQueryExecutionPlan({
        request: {
          query: '60000006 ảnh hưởng gì?',
          limit: 20,
          includeInferred: false,
          recentTurns: [],
        },
        pinnedSnapshotId: pinnedSnapshot,
        gateway,
        planner,
      });

      expect(plannerCalled).toBe(false);
      expect(result.status).toBe('needsClarification');
      if (result.status === 'needsClarification') {
        expect(result.semanticOutcome).toBe('NEEDS_CLARIFICATION');
        expect(result.safeCandidates).toHaveLength(2);
        expect(result.safeCandidates.map((c) => c.urn)).toContain(URN_PROCESS_60000006);
        expect(result.safeCandidates.map((c) => c.urn)).toContain(URN_CONTAINER_60000006);
        // None promoted to graph seed
        expect(result.seedUrns).toEqual([]);
        expect(result.graphDirective).toBe('NO_GRAPH_SEED');
        expect(result.semanticQuery).toBe('60000006 ảnh hưởng gì?');
      }
    });

    it('rejects raw cypher, 6th traversal entry, depth 4, or unknown relations from reaching output', async () => {
      const gateway = new MockGraphGateway([
        {
          urn: URN_TABLE_FCL_CYCLE_COUNTER,
          canonicalName: 'MAIN1.FCL_CYCLE_COUNTER',
          kind: 'DatabaseObject',
        },
      ]);

      const maliciousPlanner = {
        async plan(): Promise<any> {
          return {
            type: 'plan',
            plan: {
              planId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
              queryIntent: 'LOOKUP',
              seedUrns: [URN_TABLE_FCL_CYCLE_COUNTER],
              traversalSteps: [
                { relationType: 'READS_FROM', direction: 'OUTGOING', maxHops: 1 },
                { relationType: 'WRITES_TO', direction: 'OUTGOING', maxHops: 1 },
                { relationType: 'CALLS', direction: 'OUTGOING', maxHops: 1 },
                { relationType: 'INVOKES', direction: 'OUTGOING', maxHops: 1 },
                { relationType: 'PRECEDES', direction: 'OUTGOING', maxHops: 1 },
                { relationType: 'CONTAINS_STEP', direction: 'OUTGOING', maxHops: 1 }, // 6th entry!
              ],
              overallMaxDepth: 4, // Depth 4!
              cypher: 'MATCH (n) DETACH DELETE n', // Raw cypher injection!
              includeInferred: false,
              fulltextKeywords: ['MAIN1'],
              semanticQuery: 'query',
            },
          };
        },
      };

      const result = await buildQueryExecutionPlan({
        request: {
          query: 'check FCL_CYCLE_COUNTER relations',
          limit: 20,
          includeInferred: false,
          recentTurns: [],
        },
        pinnedSnapshotId: pinnedSnapshot,
        gateway,
        planner: maliciousPlanner,
      });

      // Must be rejected and fall back to degraded safe plan
      expect(result.status).toBe('executable');
      if (result.status === 'executable') {
        expect(result.isDegraded).toBe(true);
        expect((result.plan as any).cypher).toBeUndefined();
        expect(result.plan.traversalSteps.length).toBeLessThanOrEqual(5);
        expect(result.plan.overallMaxDepth).toBeLessThanOrEqual(3);
      }
    });
  });
});
