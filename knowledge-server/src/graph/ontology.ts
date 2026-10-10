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
