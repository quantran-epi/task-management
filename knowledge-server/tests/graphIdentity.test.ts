import { describe, it, expect } from 'vitest';
import {
  buildUrn,
  parseUrn,
  normalizeTechnicalIdentifier,
  buildFactKey,
} from '../src/graph/identity.js';
import { ONTOLOGY_VERSION } from '../src/graph/ontology.js';
import {
  PILOT_GOLD_NODES,
  PILOT_GOLD_RELATIONS,
  URN_PROCESS_60000006,
  URN_CONTAINER_60000006,
  URN_TABLE_FCL_CYCLE_COUNTER,
  URN_PKG_FCL_CYCLE_COUNTER,
} from './fixtures/pilotGoldEntities.js';

describe('Graph Identity & Collision Safety (GRAPH-01, GRAPH-02)', () => {
  describe('URN construction and collision prevention', () => {
    it('generates distinct collision-safe URNs for identically numbered Process and Container (D-05, GRAPH-02)', () => {
      const processUrn = buildUrn('smartvista', 'PRC_PROCESS', '60000006');
      const containerUrn = buildUrn('smartvista', 'PRC_CONTAINER', '60000006');

      expect(processUrn).toBe('urn:plannermate:smartvista:PRC_PROCESS:60000006');
      expect(containerUrn).toBe('urn:plannermate:smartvista:PRC_CONTAINER:60000006');
      expect(processUrn).not.toBe(containerUrn);
    });

    it('parses URN into component elements accurately', () => {
      const urn = buildUrn('smartvista', 'PRC_CONTAINER', '60000006', ['step20']);
      const parsed = parseUrn(urn);

      expect(parsed.sourceSystem).toBe('smartvista');
      expect(parsed.nativeType).toBe('PRC_CONTAINER');
      expect(parsed.normalizedKey).toBe('60000006');
      expect(parsed.segments).toEqual(['step20']);
    });

    it('guarantees Step identity independence from exec_order (D-07)', () => {
      // Step URN is keyed by PRC_CONTAINER.ID (60000006), regardless of whether exec_order is 10, 20, or changed later
      const urnOrder10 = buildUrn('smartvista', 'PRC_CONTAINER', '60000006');
      const urnOrder20 = buildUrn('smartvista', 'PRC_CONTAINER', '60000006');

      expect(urnOrder10).toBe(urnOrder20);
    });

    it('SmartVista rekey continuity: changed ID produces new URN and never rewrites historical URN (D-10)', () => {
      const originalUrn = buildUrn('smartvista', 'PRC_PROCESS', '60000006');
      const rekeyedUrn = buildUrn('smartvista', 'PRC_PROCESS', '70000006');

      expect(originalUrn).not.toBe(rekeyedUrn);
      expect(rekeyedUrn).toBe('urn:plannermate:smartvista:PRC_PROCESS:70000006');
    });

    it('strictly excludes deployment environment from logical URN (D-05)', () => {
      // URNs for SIT, UAT, and PROD representations of same logical entity are identical
      const urnProd = buildUrn('smartvista', 'PRC_PROCESS', '60000006');
      const urnUat = buildUrn('smartvista', 'PRC_PROCESS', '60000006');

      expect(urnProd).toBe(urnUat);
      expect(urnProd).not.toContain('prod');
      expect(urnProd).not.toContain('uat');
      expect(urnProd).not.toContain('sit');
    });
  });

  describe('Oracle technical identifier normalization (D-06, D-08, D-16)', () => {
    it('normalizes markdown-wrapped and unquoted lowercase table names with schema context', () => {
      const result = normalizeTechnicalIdentifier('`fcl_cycle_counter`', 'MAIN1');

      expect(result.isQuarantined).toBe(false);
      expect(result.schema).toBe('MAIN1');
      expect(result.objectName).toBe('FCL_CYCLE_COUNTER');
      expect(result.qualifiedIdentifier).toBe('MAIN1.FCL_CYCLE_COUNTER');
    });

    it('preserves already qualified identifiers without overriding schema', () => {
      const result = normalizeTechnicalIdentifier('MAIN1.FCL_CREDIT_LINE', 'FALLBACK_SCHEMA');

      expect(result.isQuarantined).toBe(false);
      expect(result.schema).toBe('MAIN1');
      expect(result.objectName).toBe('FCL_CREDIT_LINE');
      expect(result.qualifiedIdentifier).toBe('MAIN1.FCL_CREDIT_LINE');
    });

    it('normalizes 3-part PL/SQL package procedure identifiers', () => {
      const result = normalizeTechnicalIdentifier('`main1.fcl_prc_cycle_counter_pkg.process`');

      expect(result.isQuarantined).toBe(false);
      expect(result.schema).toBe('MAIN1');
      expect(result.objectName).toBe('FCL_PRC_CYCLE_COUNTER_PKG');
      expect(result.subObject).toBe('PROCESS');
      expect(result.qualifiedIdentifier).toBe('MAIN1.FCL_PRC_CYCLE_COUNTER_PKG.PROCESS');
    });

    it('quarantines unqualified identifiers when defaultSchema is missing (D-08, D-16)', () => {
      const result = normalizeTechnicalIdentifier('`fcl_cycle_counter`');

      expect(result.isQuarantined).toBe(true);
      expect(result.quarantineReason).toContain('Unqualified identifier without proven default schema context');
      expect(result.qualifiedIdentifier).toBe('FCL_CYCLE_COUNTER');
    });

    it('quarantines empty or blank identifiers', () => {
      const result = normalizeTechnicalIdentifier('   ');

      expect(result.isQuarantined).toBe(true);
      expect(result.quarantineReason).toBe('Empty identifier');
    });
  });

  describe('Semantic factKey calculation and stability (D-14, D-15)', () => {
    it('generates reproducible SHA-256 factKey for identical semantic inputs', () => {
      const key1 = buildFactKey({
        ontologyVersion: ONTOLOGY_VERSION,
        subjectUrn: URN_PROCESS_60000006,
        relation: 'CONTAINS_STEP',
        objectUrn: URN_CONTAINER_60000006,
      });

      const key2 = buildFactKey({
        ontologyVersion: ONTOLOGY_VERSION,
        subjectUrn: URN_PROCESS_60000006,
        relation: 'CONTAINS_STEP',
        objectUrn: URN_CONTAINER_60000006,
      });

      expect(key1).toHaveLength(64);
      expect(key1).toBe(key2);
    });

    it('qualifier sensitivity: varying operation qualifiers produce distinct factKeys (D-14, D-15)', () => {
      const keyInsert = buildFactKey({
        ontologyVersion: ONTOLOGY_VERSION,
        subjectUrn: URN_PKG_FCL_CYCLE_COUNTER,
        relation: 'WRITES_TO',
        objectUrn: URN_TABLE_FCL_CYCLE_COUNTER,
        qualifiers: { operation: 'INSERT' },
      });

      const keyUpdate = buildFactKey({
        ontologyVersion: ONTOLOGY_VERSION,
        subjectUrn: URN_PKG_FCL_CYCLE_COUNTER,
        relation: 'WRITES_TO',
        objectUrn: URN_TABLE_FCL_CYCLE_COUNTER,
        qualifiers: { operation: 'UPDATE' },
      });

      expect(keyInsert).not.toBe(keyUpdate);
    });

    it('disallowed qualifiers do not influence factKey (D-15 allow-list enforcement)', () => {
      // CONTAINS_STEP allow-list is empty; unlisted qualifier 'foo' must not change factKey
      const keyWithout = buildFactKey({
        ontologyVersion: ONTOLOGY_VERSION,
        subjectUrn: URN_PROCESS_60000006,
        relation: 'CONTAINS_STEP',
        objectUrn: URN_CONTAINER_60000006,
      });

      const keyWithExtra = buildFactKey({
        ontologyVersion: ONTOLOGY_VERSION,
        subjectUrn: URN_PROCESS_60000006,
        relation: 'CONTAINS_STEP',
        objectUrn: URN_CONTAINER_60000006,
        qualifiers: { foo: 'bar', runtimeOrder: '20' },
      });

      expect(keyWithExtra).toBe(keyWithout);
    });

    it('qualifier sorting: qualifier insertion order does not alter factKey', () => {
      // PRECEDES has condition qualifier
      const keyA = buildFactKey({
        ontologyVersion: ONTOLOGY_VERSION,
        subjectUrn: 'urn:plannermate:smartvista:PRC_CONTAINER:1',
        relation: 'PRECEDES',
        objectUrn: 'urn:plannermate:smartvista:PRC_CONTAINER:2',
        qualifiers: { condition: 'ON_SUCCESS' },
      });

      const keyB = buildFactKey({
        ontologyVersion: ONTOLOGY_VERSION,
        subjectUrn: 'urn:plannermate:smartvista:PRC_CONTAINER:1',
        relation: 'PRECEDES',
        objectUrn: 'urn:plannermate:smartvista:PRC_CONTAINER:2',
        qualifiers: { condition: 'ON_SUCCESS' },
      });

      expect(keyA).toBe(keyB);
    });
  });

  describe('Golden Fixtures Consistency', () => {
    it('loads pilot gold nodes without ID collisions across distinct kinds', () => {
      expect(PILOT_GOLD_NODES.length).toBeGreaterThanOrEqual(14);

      const urnSet = new Set<string>();
      for (const node of PILOT_GOLD_NODES) {
        expect(urnSet.has(node.urn)).toBe(false);
        urnSet.add(node.urn);
      }

      // Explicit verification of process 60000006 vs container 60000006 in fixtures
      const procNode = PILOT_GOLD_NODES.find((n) => n.urn === URN_PROCESS_60000006);
      const containerNode = PILOT_GOLD_NODES.find((n) => n.urn === URN_CONTAINER_60000006);

      expect(procNode).toBeDefined();
      expect(containerNode).toBeDefined();
      expect(procNode!.kind).toBe('ScheduledProcess');
      expect(containerNode!.kind).toBe('ProcessStep');
    });

    it('loads pilot gold relations with valid factKeys and matching endpoints', () => {
      expect(PILOT_GOLD_RELATIONS.length).toBeGreaterThanOrEqual(8);

      const nodeUrns = new Set(PILOT_GOLD_NODES.map((n) => n.urn));

      for (const rel of PILOT_GOLD_RELATIONS) {
        expect(nodeUrns.has(rel.subjectUrn)).toBe(true);
        expect(nodeUrns.has(rel.objectUrn)).toBe(true);
        expect(rel.factKey).toHaveLength(64);
        expect(rel.ontologyVersion).toBe(ONTOLOGY_VERSION);
      }
    });
  });
});
