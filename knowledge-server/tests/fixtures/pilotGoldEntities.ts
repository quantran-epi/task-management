import { GraphNode, GraphRelation } from '../../src/types/graphProtocol.js';
import { buildUrn, buildFactKey } from '../../src/graph/identity.js';
import { ONTOLOGY_VERSION } from '../../src/graph/ontology.js';

/**
 * Frozen pilot gold entities from process 60000006 corpus.
 * Satisfies GRAPH-01, GRAPH-02, D-01 through D-10.
 */

// URN references
export const URN_PROCESS_60000006 = buildUrn('smartvista', 'PRC_PROCESS', '60000006');
export const URN_CONTAINER_60000005 = buildUrn('smartvista', 'PRC_CONTAINER', '60000005');
export const URN_CONTAINER_60000006 = buildUrn('smartvista', 'PRC_CONTAINER', '60000006');
export const URN_CONTAINER_60000007 = buildUrn('smartvista', 'PRC_CONTAINER', '60000007');
export const URN_CONTAINER_60000012 = buildUrn('smartvista', 'PRC_CONTAINER', '60000012');
export const URN_CONTAINER_60000017 = buildUrn('smartvista', 'PRC_CONTAINER', '60000017');

export const URN_SUBPROCESS_10000304 = buildUrn('smartvista', 'PRC_PROCESS', '10000304');
export const URN_SUBPROCESS_10000263 = buildUrn('smartvista', 'PRC_PROCESS', '10000263');
export const URN_SUBPROCESS_10000303 = buildUrn('smartvista', 'PRC_PROCESS', '10000303');

export const URN_PKG_FCL_CYCLE_COUNTER = buildUrn('plsql', 'PLSQL_PROCEDURE', 'MAIN1.FCL_PRC_CYCLE_COUNTER_PKG.PROCESS');
export const URN_PKG_CRD_BILLING = buildUrn('plsql', 'PLSQL_PROCEDURE', 'MAIN1.CRD_PRC_BILLING_PKG.PROCESS');
export const URN_PKG_OPR_PROCESS = buildUrn('plsql', 'PLSQL_PROCEDURE', 'MAIN1.OPR_API_PROCESS_PKG.PROCESS_OPERATIONS');

export const URN_TABLE_FCL_CYCLE_COUNTER = buildUrn('oracle', 'ORACLE_TABLE', 'MAIN1.FCL_CYCLE_COUNTER');
export const URN_TABLE_FCL_CREDIT_LINE = buildUrn('oracle', 'ORACLE_TABLE', 'MAIN1.FCL_CREDIT_LINE');
export const URN_TABLE_EVT_EVENT_OBJECT = buildUrn('oracle', 'ORACLE_TABLE', 'MAIN1.EVT_EVENT_OBJECT');
export const URN_TABLE_CRD_INVOICE = buildUrn('oracle', 'ORACLE_TABLE', 'MAIN1.CRD_INVOICE');
export const URN_TABLE_OPR_OPERATION = buildUrn('oracle', 'ORACLE_TABLE', 'MAIN1.OPR_OPERATION');

export const URN_CYTP_1003 = buildUrn('smartvista', 'CycleType', 'CYTP1003');
export const URN_CYTP_1002 = buildUrn('smartvista', 'CycleType', 'CYTP1002');
export const URN_CYTP_1016 = buildUrn('smartvista', 'CycleType', 'CYTP1016');

export const URN_STATUS_READY = buildUrn('smartvista', 'Status', 'READY');
export const URN_STATUS_FAILED = buildUrn('smartvista', 'Status', 'PRSR0003');

export const PILOT_GOLD_NODES: readonly GraphNode[] = [
  // 1. Root ScheduledProcess
  {
    urn: URN_PROCESS_60000006,
    kind: 'ScheduledProcess',
    canonicalName: 'SHB - Credit calculations',
    sourceSystem: 'smartvista',
    nativeType: 'PRC_PROCESS',
    normalizedKey: '60000006',
    properties: {
      isExternal: 0,
      isContainer: 1,
      instId: 1001,
      isParallel: 0,
    },
    aliases: ['Credit calculations container'],
  },
  // 2. Child container / step 10 (bind 60000005)
  {
    urn: URN_CONTAINER_60000005,
    kind: 'ProcessStep',
    canonicalName: 'Step 10 - Due date period cycle',
    sourceSystem: 'smartvista',
    nativeType: 'PRC_CONTAINER',
    normalizedKey: '60000005',
    properties: {
      execOrder: 10,
      isParallel: 1,
      parallelDegree: 4,
    },
    aliases: [],
  },
  // 3. Child container / step 20 (bind 60000006 - numeric collision with process 60000006)
  {
    urn: URN_CONTAINER_60000006,
    kind: 'ProcessStep',
    canonicalName: 'Step 20 - Grace period length cycle',
    sourceSystem: 'smartvista',
    nativeType: 'PRC_CONTAINER',
    normalizedKey: '60000006',
    properties: {
      execOrder: 20,
      isParallel: 1,
      parallelDegree: 4,
    },
    aliases: [],
  },
  // 4. Child container / step 30 (bind 60000007)
  {
    urn: URN_CONTAINER_60000007,
    kind: 'ProcessStep',
    canonicalName: 'Step 30 - Aging period cycle',
    sourceSystem: 'smartvista',
    nativeType: 'PRC_CONTAINER',
    normalizedKey: '60000007',
    properties: {
      execOrder: 30,
      isParallel: 1,
      parallelDegree: 4,
    },
    aliases: [],
  },
  // 5. Child container / step 200 (bind 60000012)
  {
    urn: URN_CONTAINER_60000012,
    kind: 'ProcessStep',
    canonicalName: 'Step 200 - Credits calculation',
    sourceSystem: 'smartvista',
    nativeType: 'PRC_CONTAINER',
    normalizedKey: '60000012',
    properties: {
      execOrder: 200,
      isParallel: 1,
      parallelDegree: 4,
    },
    aliases: [],
  },
  // 6. Child container / step 210 (bind 60000017)
  {
    urn: URN_CONTAINER_60000017,
    kind: 'ProcessStep',
    canonicalName: 'Step 210 - Operations processing',
    sourceSystem: 'smartvista',
    nativeType: 'PRC_CONTAINER',
    normalizedKey: '60000017',
    properties: {
      execOrder: 210,
      isParallel: 1,
      parallelDegree: 4,
    },
    aliases: [],
  },
  // 7. Sub-process 10000304
  {
    urn: URN_SUBPROCESS_10000304,
    kind: 'ScheduledProcess',
    canonicalName: 'Switch cycle',
    sourceSystem: 'smartvista',
    nativeType: 'PRC_PROCESS',
    normalizedKey: '10000304',
    properties: {
      isExternal: 0,
      isContainer: 0,
      procedureName: 'FCL_PRC_CYCLE_COUNTER_PKG.PROCESS',
    },
    aliases: ['Replant cycle counter'],
  },
  // 8. Sub-process 10000263
  {
    urn: URN_SUBPROCESS_10000263,
    kind: 'ScheduledProcess',
    canonicalName: 'Credits calculation child',
    sourceSystem: 'smartvista',
    nativeType: 'PRC_PROCESS',
    normalizedKey: '10000263',
    properties: {
      isExternal: 0,
      isContainer: 0,
      procedureName: 'CRD_PRC_BILLING_PKG.PROCESS',
    },
    aliases: [],
  },
  // 9. Sub-process 10000303
  {
    urn: URN_SUBPROCESS_10000303,
    kind: 'ScheduledProcess',
    canonicalName: 'Operations processing child',
    sourceSystem: 'smartvista',
    nativeType: 'PRC_PROCESS',
    normalizedKey: '10000303',
    properties: {
      isExternal: 0,
      isContainer: 0,
      procedureName: 'opr_api_process_pkg.process_operations',
    },
    aliases: [],
  },
  // 10. PL/SQL procedure component
  {
    urn: URN_PKG_FCL_CYCLE_COUNTER,
    kind: 'SoftwareComponent',
    canonicalName: 'MAIN1.FCL_PRC_CYCLE_COUNTER_PKG.PROCESS',
    sourceSystem: 'plsql',
    nativeType: 'PLSQL_PROCEDURE',
    normalizedKey: 'MAIN1.FCL_PRC_CYCLE_COUNTER_PKG.PROCESS',
    subkind: 'PLSQL_PROCEDURE',
    properties: {
      schema: 'MAIN1',
      package: 'FCL_PRC_CYCLE_COUNTER_PKG',
      procedure: 'PROCESS',
    },
    aliases: ['fcl_prc_cycle_counter_pkg.process'],
  },
  // 11. Oracle table FCL_CYCLE_COUNTER
  {
    urn: URN_TABLE_FCL_CYCLE_COUNTER,
    kind: 'DatabaseObject',
    canonicalName: 'MAIN1.FCL_CYCLE_COUNTER',
    sourceSystem: 'oracle',
    nativeType: 'ORACLE_TABLE',
    normalizedKey: 'MAIN1.FCL_CYCLE_COUNTER',
    subkind: 'ORACLE_TABLE',
    properties: {
      schema: 'MAIN1',
      tableName: 'FCL_CYCLE_COUNTER',
    },
    aliases: ['fcl_cycle_counter'],
  },
  // 12. Oracle table FCL_CREDIT_LINE
  {
    urn: URN_TABLE_FCL_CREDIT_LINE,
    kind: 'DatabaseObject',
    canonicalName: 'MAIN1.FCL_CREDIT_LINE',
    sourceSystem: 'oracle',
    nativeType: 'ORACLE_TABLE',
    normalizedKey: 'MAIN1.FCL_CREDIT_LINE',
    subkind: 'ORACLE_TABLE',
    properties: {
      schema: 'MAIN1',
      tableName: 'FCL_CREDIT_LINE',
    },
    aliases: ['fcl_credit_line'],
  },
  // 13. CycleType CYTP1002
  {
    urn: URN_CYTP_1002,
    kind: 'CycleType',
    canonicalName: 'CYTP1002 - Grace period length',
    sourceSystem: 'smartvista',
    nativeType: 'CycleType',
    normalizedKey: 'CYTP1002',
    properties: {
      cycleTypeCode: 'CYTP1002',
      description: 'Grace period length',
    },
    aliases: [],
  },
  // 14. Status PRSR0003
  {
    urn: URN_STATUS_FAILED,
    kind: 'Status',
    canonicalName: 'PRSR0003 - Failed',
    sourceSystem: 'smartvista',
    nativeType: 'Status',
    normalizedKey: 'PRSR0003',
    properties: {
      statusCode: 'PRSR0003',
      description: 'Failed mid-run',
    },
    aliases: ['Failed'],
  },
];

export const PILOT_GOLD_RELATIONS: readonly GraphRelation[] = [
  // 1. Process 60000006 CONTAINS_STEP container 60000005
  {
    factKey: buildFactKey({
      ontologyVersion: ONTOLOGY_VERSION,
      subjectUrn: URN_PROCESS_60000006,
      relation: 'CONTAINS_STEP',
      objectUrn: URN_CONTAINER_60000005,
    }),
    ontologyVersion: ONTOLOGY_VERSION,
    subjectUrn: URN_PROCESS_60000006,
    relation: 'CONTAINS_STEP',
    objectUrn: URN_CONTAINER_60000005,
    qualifiers: {},
    effectiveClassification: 'OBSERVED',
    hasConflict: false,
    sourceMissing: false,
  },
  // 2. Process 60000006 CONTAINS_STEP container 60000006 (distinct object despite numeric ID)
  {
    factKey: buildFactKey({
      ontologyVersion: ONTOLOGY_VERSION,
      subjectUrn: URN_PROCESS_60000006,
      relation: 'CONTAINS_STEP',
      objectUrn: URN_CONTAINER_60000006,
    }),
    ontologyVersion: ONTOLOGY_VERSION,
    subjectUrn: URN_PROCESS_60000006,
    relation: 'CONTAINS_STEP',
    objectUrn: URN_CONTAINER_60000006,
    qualifiers: {},
    effectiveClassification: 'OBSERVED',
    hasConflict: false,
    sourceMissing: false,
  },
  // 3. Container 60000005 PRECEDES container 60000006
  {
    factKey: buildFactKey({
      ontologyVersion: ONTOLOGY_VERSION,
      subjectUrn: URN_CONTAINER_60000005,
      relation: 'PRECEDES',
      objectUrn: URN_CONTAINER_60000006,
    }),
    ontologyVersion: ONTOLOGY_VERSION,
    subjectUrn: URN_CONTAINER_60000005,
    relation: 'PRECEDES',
    objectUrn: URN_CONTAINER_60000006,
    qualifiers: {},
    effectiveClassification: 'OBSERVED',
    hasConflict: false,
    sourceMissing: false,
  },
  // 4. Container 60000006 INVOKES subprocess 10000304
  {
    factKey: buildFactKey({
      ontologyVersion: ONTOLOGY_VERSION,
      subjectUrn: URN_CONTAINER_60000006,
      relation: 'INVOKES',
      objectUrn: URN_SUBPROCESS_10000304,
    }),
    ontologyVersion: ONTOLOGY_VERSION,
    subjectUrn: URN_CONTAINER_60000006,
    relation: 'INVOKES',
    objectUrn: URN_SUBPROCESS_10000304,
    qualifiers: {},
    effectiveClassification: 'OBSERVED',
    hasConflict: false,
    sourceMissing: false,
  },
  // 5. Container 60000006 USES_TYPE CYTP1002
  {
    factKey: buildFactKey({
      ontologyVersion: ONTOLOGY_VERSION,
      subjectUrn: URN_CONTAINER_60000006,
      relation: 'USES_TYPE',
      objectUrn: URN_CYTP_1002,
    }),
    ontologyVersion: ONTOLOGY_VERSION,
    subjectUrn: URN_CONTAINER_60000006,
    relation: 'USES_TYPE',
    objectUrn: URN_CYTP_1002,
    qualifiers: {},
    effectiveClassification: 'OBSERVED',
    hasConflict: false,
    sourceMissing: false,
  },
  // 6. Subprocess 10000304 CALLS PL/SQL package procedure
  {
    factKey: buildFactKey({
      ontologyVersion: ONTOLOGY_VERSION,
      subjectUrn: URN_SUBPROCESS_10000304,
      relation: 'CALLS',
      objectUrn: URN_PKG_FCL_CYCLE_COUNTER,
    }),
    ontologyVersion: ONTOLOGY_VERSION,
    subjectUrn: URN_SUBPROCESS_10000304,
    relation: 'CALLS',
    objectUrn: URN_PKG_FCL_CYCLE_COUNTER,
    qualifiers: {},
    effectiveClassification: 'OBSERVED',
    hasConflict: false,
    sourceMissing: false,
  },
  // 7. PL/SQL procedure READS_FROM table FCL_CYCLE_COUNTER (operation=READ)
  {
    factKey: buildFactKey({
      ontologyVersion: ONTOLOGY_VERSION,
      subjectUrn: URN_PKG_FCL_CYCLE_COUNTER,
      relation: 'READS_FROM',
      objectUrn: URN_TABLE_FCL_CYCLE_COUNTER,
      qualifiers: { operation: 'READ' },
    }),
    ontologyVersion: ONTOLOGY_VERSION,
    subjectUrn: URN_PKG_FCL_CYCLE_COUNTER,
    relation: 'READS_FROM',
    objectUrn: URN_TABLE_FCL_CYCLE_COUNTER,
    qualifiers: { operation: 'READ' },
    effectiveClassification: 'OBSERVED',
    hasConflict: false,
    sourceMissing: false,
  },
  // 8. PL/SQL procedure WRITES_TO table FCL_CYCLE_COUNTER (operation=UPDATE)
  {
    factKey: buildFactKey({
      ontologyVersion: ONTOLOGY_VERSION,
      subjectUrn: URN_PKG_FCL_CYCLE_COUNTER,
      relation: 'WRITES_TO',
      objectUrn: URN_TABLE_FCL_CYCLE_COUNTER,
      qualifiers: { operation: 'UPDATE' },
    }),
    ontologyVersion: ONTOLOGY_VERSION,
    subjectUrn: URN_PKG_FCL_CYCLE_COUNTER,
    relation: 'WRITES_TO',
    objectUrn: URN_TABLE_FCL_CYCLE_COUNTER,
    qualifiers: { operation: 'UPDATE' },
    effectiveClassification: 'OBSERVED',
    hasConflict: false,
    sourceMissing: false,
  },
];
