import { z } from 'zod';
import { EvidenceChunkSchema } from './protocol.js';

/**
 * URN pattern per D-05:
 * urn:plannermate:<sourceSystem>:<nativeType>:<normalizedKey>[:<optionalSegments>...]
 */
export const URN_REGEX = /^urn:plannermate:[a-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_.~%:-]+$/;

export const UrnSchema = z
  .string()
  .regex(URN_REGEX, 'Must be valid PlannerMate URN (urn:plannermate:<sourceSystem>:<nativeType>:<normalizedKey>)');

export type Urn = z.infer<typeof UrnSchema>;

/**
 * SHA-256 Hex string schema (64 lowercase/uppercase hex chars).
 */
export const Sha256HexSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{64}$/, 'Must be 64-character hex SHA-256 hash');

export const FactKeySchema = Sha256HexSchema;
export type FactKey = z.infer<typeof FactKeySchema>;

/**
 * D-01: Locked node kinds.
 */
export const NODE_KINDS = [
  'ScheduledProcess',
  'ProcessStep',
  'SoftwareComponent',
  'DatabaseObject',
  'CycleType',
  'Status',
  'SourceDocument',
] as const;

export const NodeKindSchema = z.enum(NODE_KINDS);
export type NodeKind = z.infer<typeof NodeKindSchema>;

/**
 * Controlled subkinds for SoftwareComponent and DatabaseObject (D-01).
 */
export const SOFTWARE_COMPONENT_KINDS = ['PLSQL_PROCEDURE', 'JAVA_CLASS'] as const;
export const SoftwareComponentKindSchema = z.enum(SOFTWARE_COMPONENT_KINDS);
export type SoftwareComponentKind = z.infer<typeof SoftwareComponentKindSchema>;

export const DATABASE_OBJECT_KINDS = [
  'ORACLE_TABLE',
  'ORACLE_VIEW',
  'ORACLE_SEQUENCE',
] as const;
export const DatabaseObjectKindSchema = z.enum(DATABASE_OBJECT_KINDS);
export type DatabaseObjectKind = z.infer<typeof DatabaseObjectKindSchema>;

/**
 * D-02: Controlled core relation types.
 */
export const RELATION_TYPES = [
  'CONTAINS_STEP',
  'PRECEDES',
  'CALLS',
  'INVOKES',
  'READS_FROM',
  'WRITES_TO',
  'EMITS',
  'CONSUMES',
  'USES_TYPE',
  'HAS_STATUS',
] as const;

export const RelationTypeSchema = z.enum(RELATION_TYPES);
export type RelationType = z.infer<typeof RelationTypeSchema>;

/**
 * D-17: Evidence classification schema.
 */
export const EVIDENCE_CLASSIFICATIONS = [
  'OBSERVED',
  'INFERRED',
  'BUSINESS_APPROVED',
] as const;

export const EvidenceClassificationSchema = z.enum(EVIDENCE_CLASSIFICATIONS);
export type EvidenceClassification = z.infer<typeof EvidenceClassificationSchema>;

/**
 * Extraction method schema.
 */
export const EXTRACTION_METHODS = [
  'DETERMINISTIC_TABLE',
  'DETERMINISTIC_SQL',
  'DETERMINISTIC_CODE',
  'LLM_PROSE',
  'MANUAL_ASSERTION',
] as const;

export const ExtractionMethodSchema = z.enum(EXTRACTION_METHODS);
export type ExtractionMethod = z.infer<typeof ExtractionMethodSchema>;

/**
 * Evidence record schema.
 * Represents single source citation/occurrence linked to a semantic fact (D-04, D-14, D-17).
 */
export const GraphEvidenceRecordSchema = z
  .object({
    evidenceId: z.string().uuid(),
    factKey: FactKeySchema,
    documentId: z.string().uuid(),
    documentTitle: z.string().min(1),
    sectionHeadingPath: z.array(z.string()),
    chunkIndex: z.number().int().nonnegative().optional(),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().nonnegative(),
    rawSnippet: z.string(),
    extractionMethod: ExtractionMethodSchema,
    classification: EvidenceClassificationSchema,
    confidence: z.number().min(0).max(1),
    observedAt: z.string().datetime(),
    environment: z.string().optional(), // SIT, UAT, PROD (evidence metadata per D-05)
  })
  .strict();

export type GraphEvidenceRecord = z.infer<typeof GraphEvidenceRecordSchema>;

/**
 * Quarantined identifier record per D-08, D-16.
 */
export const QuarantinedIdentifierSchema = z
  .object({
    rawIdentifier: z.string(),
    reason: z.string(),
    documentId: z.string().uuid(),
    sectionHeadingPath: z.array(z.string()),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    extractionMethod: ExtractionMethodSchema,
    possibleMatches: z.array(z.string()),
  })
  .strict();

export type QuarantinedIdentifier = z.infer<typeof QuarantinedIdentifierSchema>;

/**
 * Conflict record per D-12, D-18.
 */
export const GraphConflictRecordSchema = z
  .object({
    conflictId: z.string().uuid(),
    factKeyA: FactKeySchema,
    factKeyB: FactKeySchema,
    subjectUrn: UrnSchema,
    relation: RelationTypeSchema,
    conflictType: z.literal('DIRECT_CONTRADICTION'),
    evidenceA: GraphEvidenceRecordSchema,
    evidenceB: GraphEvidenceRecordSchema,
    detectedAt: z.string().datetime(),
    resolved: z.boolean(),
  })
  .strict();

export type GraphConflictRecord = z.infer<typeof GraphConflictRecordSchema>;

/**
 * Approval record per D-19.
 */
export const GraphApprovalRecordSchema = z
  .object({
    factKey: FactKeySchema,
    approverName: z.string().min(1),
    approvedAt: z.string().datetime(),
    rationale: z.string().optional(),
    ontologyVersion: z.string().min(1),
  })
  .strict();

export type GraphApprovalRecord = z.infer<typeof GraphApprovalRecordSchema>;

/**
 * Graph node structure.
 */
export const GraphNodeSchema = z
  .object({
    urn: UrnSchema,
    kind: NodeKindSchema,
    canonicalName: z.string().min(1),
    sourceSystem: z.string().min(1),
    nativeType: z.string().min(1),
    normalizedKey: z.string().min(1),
    subkind: z.string().optional(),
    properties: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])),
    aliases: z.array(z.string()).default([]),
  })
  .strict();

export type GraphNode = z.infer<typeof GraphNodeSchema>;

/**
 * Direct semantic graph relation (domain edge) per D-04, D-14, D-15.
 */
export const GraphRelationSchema = z
  .object({
    factKey: FactKeySchema,
    ontologyVersion: z.string().min(1),
    subjectUrn: UrnSchema,
    relation: RelationTypeSchema,
    objectUrn: UrnSchema,
    qualifiers: z.record(z.string(), z.string()).default({}),
    effectiveClassification: EvidenceClassificationSchema,
    hasConflict: z.boolean().default(false),
    sourceMissing: z.boolean().default(false), // D-20
  })
  .strict();

export type GraphRelation = z.infer<typeof GraphRelationSchema>;

/**
 * Resolved Node alias for extraction and graph candidate processing.
 */
export type ResolvedNode = GraphNode;

/**
 * Semantic fact assertion (domain edge assertion without occurrence binding).
 */
export const FactAssertionSchema = z
  .object({
    factKey: FactKeySchema,
    ontologyVersion: z.string().min(1),
    subjectUrn: UrnSchema,
    relation: RelationTypeSchema,
    objectUrn: UrnSchema,
    qualifiers: z.record(z.string(), z.string()).default({}),
    classification: EvidenceClassificationSchema,
  })
  .strict();

export type FactAssertion = z.infer<typeof FactAssertionSchema>;

/**
 * Source Range representation for consumed character ranges.
 */
export const SourceRangeSchema = z
  .object({
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().nonnegative(),
    startLine: z.number().int().positive().optional(),
    endLine: z.number().int().positive().optional(),
  })
  .strict();

export type SourceRange = z.infer<typeof SourceRangeSchema>;

/**
 * Deterministic extraction result contract.
 */
export interface DeterministicExtractionResult {
  nodes: ResolvedNode[];
  facts: FactAssertion[];
  evidence: GraphEvidenceRecord[];
  quarantines: QuarantinedIdentifier[];
  consumedRanges: Map<string, SourceRange[]>;
}

/**
 * Prose Segment for uncovered text extraction.
 */
export const ProseSegmentSchema = z
  .object({
    segmentId: z.string().min(1),
    documentId: z.string().uuid(),
    documentTitle: z.string().min(1),
    sectionHeadingPath: z.array(z.string()),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().nonnegative(),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    text: z.string(),
  })
  .strict();

export type ProseSegment = z.infer<typeof ProseSegmentSchema>;

/**
 * Fact detail view combining semantic relation and supporting evidence records.
 */
export interface FactDetail {
  relation: GraphRelation;
  evidence: GraphEvidenceRecord[];
  conflicts: GraphConflictRecord[];
  approvals: GraphApprovalRecord[];
}

/**
 * Complete Graph Candidate assembled before atomic projection write.
 */
export interface GraphCandidate {
  graphSnapshotId: string;
  sourceSnapshotId: string;
  setId: string;
  ontologyVersion: string;
  normalizedProjectionHash: string;
  nodes: GraphNode[];
  relations: GraphRelation[];
  evidence: GraphEvidenceRecord[];
  conflicts: GraphConflictRecord[];
  approvals: GraphApprovalRecord[];
  quarantines: QuarantinedIdentifier[];
  createdAt: string;
}

/**
 * Active graph view anchored through set pointer.
 */
export interface ActiveGraphView {
  setId: string;
  graphSnapshotId: string;
  sourceSnapshotId: string;
  ontologyVersion: string;
  normalizedProjectionHash: string;
  activatedAt: string;
  nodeCount: number;
  relationCount: number;
  factCount: number;
  conflictCount: number;
  quarantineCount: number;
  approvedFactCount: number;
}
