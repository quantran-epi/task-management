import {
  NODE_KINDS,
  NodeKind,
  RELATION_TYPES,
  RelationType,
  SOFTWARE_COMPONENT_KINDS,
  DATABASE_OBJECT_KINDS,
} from '../types/graphProtocol.js';

export {
  NODE_KINDS,
  RELATION_TYPES,
  SOFTWARE_COMPONENT_KINDS,
  DATABASE_OBJECT_KINDS,
};
export type { NodeKind, RelationType };

/**
 * Locked ontology version per plan Task 1.
 */
export const ONTOLOGY_VERSION = '2026.10.1';

/**
 * Relation semantic qualifier allow-lists per D-15.
 * Only qualifiers in these allow-lists are permitted to affect factKey and relation semantics.
 */
export const RELATION_QUALIFIER_ALLOWLIST: Readonly<Record<RelationType, readonly string[]>> = Object.freeze({
  WRITES_TO: Object.freeze(['operation']),
  READS_FROM: Object.freeze(['operation']),
  PRECEDES: Object.freeze(['condition']),
  CONTAINS_STEP: Object.freeze([]),
  CALLS: Object.freeze([]),
  INVOKES: Object.freeze([]),
  EMITS: Object.freeze([]),
  CONSUMES: Object.freeze([]),
  USES_TYPE: Object.freeze([]),
  HAS_STATUS: Object.freeze([]),
});

/**
 * Controlled operations for WRITES_TO per Task 1 / D-15.
 */
export const WRITES_TO_OPERATIONS = [
  'INSERT',
  'UPDATE',
  'QUEUE',
  'DRAIN',
  'POST',
  'REPLANT',
  'MARK_PROCESSED',
] as const;

export type WritesToOperation = (typeof WRITES_TO_OPERATIONS)[number];

/**
 * Controlled operations for READS_FROM per Task 1 / D-15.
 */
export const READS_FROM_OPERATIONS = ['READ'] as const;

export type ReadsFromOperation = (typeof READS_FROM_OPERATIONS)[number];

/**
 * Relation semantics (D-12, D-18):
 * - 'ADDITIVE': Multiple edges between same subject and object are valid if qualifiers differ, or coexist if different statements.
 * - 'FUNCTIONAL': Single-valued relation where differing object targets indicate potential direct contradiction.
 */
export type RelationSemanticSlot = 'ADDITIVE' | 'FUNCTIONAL';

export const RELATION_SEMANTICS: Readonly<Record<RelationType, RelationSemanticSlot>> = Object.freeze({
  CONTAINS_STEP: 'ADDITIVE',
  PRECEDES: 'ADDITIVE',
  CALLS: 'ADDITIVE',
  INVOKES: 'ADDITIVE',
  READS_FROM: 'ADDITIVE',
  WRITES_TO: 'ADDITIVE',
  EMITS: 'ADDITIVE',
  CONSUMES: 'ADDITIVE',
  USES_TYPE: 'ADDITIVE',
  HAS_STATUS: 'FUNCTIONAL', // A step or entity usually has one active status transition in a given phase
});

/**
 * Traversal direction allowed in retrieval plans.
 */
export type TraversalDirection = 'OUTGOING' | 'INCOMING' | 'BOTH';

/**
 * Retrieval ontology registry entry describing traversal characteristics per relation.
 */
export interface RetrievalOntologyEntry {
  readonly relationType: RelationType;
  readonly allowedSourceKinds: readonly NodeKind[];
  readonly allowedTargetKinds: readonly NodeKind[];
  readonly defaultDirection: TraversalDirection;
  readonly maxHops: number;
  readonly semanticSlot: RelationSemanticSlot;
  readonly exampleIntents: readonly string[];
}

/**
 * Frozen corpus-general traversal endpoint/direction/depth registry for all ten relations (D-06, D-13, D-16).
 * Max hops: CONTAINS_STEP 1, PRECEDES 2, CALLS 3, INVOKES 2, READS_FROM/WRITES_TO 3,
 * EMITS/CONSUMES/USES_TYPE 2, HAS_STATUS 1.
 */
export const RETRIEVAL_ONTOLOGY_REGISTRY: Readonly<Record<RelationType, RetrievalOntologyEntry>> = Object.freeze({
  CONTAINS_STEP: Object.freeze({
    relationType: 'CONTAINS_STEP',
    allowedSourceKinds: Object.freeze(['ScheduledProcess'] as const),
    allowedTargetKinds: Object.freeze(['ProcessStep'] as const),
    defaultDirection: 'OUTGOING',
    maxHops: 1,
    semanticSlot: 'ADDITIVE',
    exampleIntents: Object.freeze(['quy trình chứa bước nào', 'which steps belong to process']),
  }),
  PRECEDES: Object.freeze({
    relationType: 'PRECEDES',
    allowedSourceKinds: Object.freeze(['ProcessStep'] as const),
    allowedTargetKinds: Object.freeze(['ProcessStep'] as const),
    defaultDirection: 'OUTGOING',
    maxHops: 2,
    semanticSlot: 'ADDITIVE',
    exampleIntents: Object.freeze(['bước nào chạy trước bước nào', 'what precedes this step']),
  }),
  CALLS: Object.freeze({
    relationType: 'CALLS',
    allowedSourceKinds: Object.freeze(['SoftwareComponent'] as const),
    allowedTargetKinds: Object.freeze(['SoftwareComponent'] as const),
    defaultDirection: 'OUTGOING',
    maxHops: 3,
    semanticSlot: 'ADDITIVE',
    exampleIntents: Object.freeze(['hàm nào gọi thủ tục nào', 'procedure call chain']),
  }),
  INVOKES: Object.freeze({
    relationType: 'INVOKES',
    allowedSourceKinds: Object.freeze(['ProcessStep'] as const),
    allowedTargetKinds: Object.freeze(['SoftwareComponent'] as const),
    defaultDirection: 'OUTGOING',
    maxHops: 2,
    semanticSlot: 'ADDITIVE',
    exampleIntents: Object.freeze(['bước nào kích hoạt mã nguồn nào', 'step invokes component']),
  }),
  READS_FROM: Object.freeze({
    relationType: 'READS_FROM',
    allowedSourceKinds: Object.freeze(['SoftwareComponent'] as const),
    allowedTargetKinds: Object.freeze(['DatabaseObject'] as const),
    defaultDirection: 'OUTGOING',
    maxHops: 3,
    semanticSlot: 'ADDITIVE',
    exampleIntents: Object.freeze(['thủ tục nào đọc bảng nào', 'who reads table']),
  }),
  WRITES_TO: Object.freeze({
    relationType: 'WRITES_TO',
    allowedSourceKinds: Object.freeze(['SoftwareComponent'] as const),
    allowedTargetKinds: Object.freeze(['DatabaseObject'] as const),
    defaultDirection: 'OUTGOING',
    maxHops: 3,
    semanticSlot: 'ADDITIVE',
    exampleIntents: Object.freeze(['thủ tục nào ghi vào bảng nào', 'who updates table']),
  }),
  EMITS: Object.freeze({
    relationType: 'EMITS',
    allowedSourceKinds: Object.freeze(['ProcessStep', 'SoftwareComponent'] as const),
    allowedTargetKinds: Object.freeze(['CycleType'] as const),
    defaultDirection: 'OUTGOING',
    maxHops: 2,
    semanticSlot: 'ADDITIVE',
    exampleIntents: Object.freeze(['bước nào sinh loại chu kỳ nào', 'step emits cycle']),
  }),
  CONSUMES: Object.freeze({
    relationType: 'CONSUMES',
    allowedSourceKinds: Object.freeze(['ProcessStep', 'SoftwareComponent'] as const),
    allowedTargetKinds: Object.freeze(['CycleType'] as const),
    defaultDirection: 'OUTGOING',
    maxHops: 2,
    semanticSlot: 'ADDITIVE',
    exampleIntents: Object.freeze(['bước nào tiêu thụ loại chu kỳ nào', 'step consumes cycle']),
  }),
  USES_TYPE: Object.freeze({
    relationType: 'USES_TYPE',
    allowedSourceKinds: Object.freeze(['SoftwareComponent', 'ProcessStep'] as const),
    allowedTargetKinds: Object.freeze(['CycleType'] as const),
    defaultDirection: 'OUTGOING',
    maxHops: 2,
    semanticSlot: 'ADDITIVE',
    exampleIntents: Object.freeze(['thành phần nào dùng loại chu kỳ nào', 'component uses cycle type']),
  }),
  HAS_STATUS: Object.freeze({
    relationType: 'HAS_STATUS',
    allowedSourceKinds: Object.freeze(['ProcessStep', 'SoftwareComponent'] as const),
    allowedTargetKinds: Object.freeze(['Status'] as const),
    defaultDirection: 'OUTGOING',
    maxHops: 1,
    semanticSlot: 'FUNCTIONAL',
    exampleIntents: Object.freeze(['trạng thái của bước', 'status transition']),
  }),
});

