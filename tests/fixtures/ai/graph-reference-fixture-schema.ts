import { z } from 'zod';
import {
  EvidenceClassificationSchema,
  NodeKindSchema,
  RelationTypeSchema,
  Sha256HexSchema,
  UrnSchema,
} from '../../../knowledge-server/src/types/graphProtocol';
import {
  QueryIntentSchema,
  ReasonCodeSchema,
  RETRIEVAL_OUTCOMES,
} from '../../../knowledge-server/src/types/retrievalProtocol';

/**
 * D-21 categories. Every committed graph reference case must belong to one.
 */
export const GRAPH_REFERENCE_CATEGORIES = [
  'direct_lookup',
  'read_write_relation',
  'seed_only',
  'nonexistent_entity',
  'mixed_kinds',
  'multiple_relations',
  'multi_hop_flow_impact',
] as const;

export const GraphReferenceCategorySchema = z.enum(GRAPH_REFERENCE_CATEGORIES);
export type GraphReferenceCategory = z.infer<typeof GraphReferenceCategorySchema>;

export const GraphReferenceNodeSchema = z
  .strictObject({
    urn: UrnSchema,
    kind: NodeKindSchema,
    canonicalName: z.string().min(1).max(200),
  });

export const GraphReferenceEdgeSchema = z
  .strictObject({
    factKey: Sha256HexSchema,
    subjectUrn: UrnSchema,
    relation: RelationTypeSchema,
    objectUrn: UrnSchema,
    evidenceClass: EvidenceClassificationSchema,
    supportingChunkIds: z.array(z.string().min(1)).min(1),
  });

export const GraphReferenceChunkSchema = z
  .strictObject({
    id: z.string().min(1),
    documentId: z.string().uuid(),
    documentTitle: z.string().min(1).max(400),
    sectionAnchor: z.string(),
    lineStart: z.number().int().positive(),
    lineEnd: z.number().int().positive(),
    publishedContentHash: z.string().regex(/^[0-9a-f]{64}$/),
    rawSnippet: z.string(),
  });

export const GraphReferenceSeedSchema = z
  .strictObject({
    urn: UrnSchema,
    kind: NodeKindSchema,
  });

/**
 * Expected evidence identity. Counts are derived from these lists, never from
 * gateway array order, so identity is compared as a set and ordering is compared
 * separately.
 */
export const GraphReferenceExpectedSchema = z
  .strictObject({
    outcome: z.enum(RETRIEVAL_OUTCOMES),
    reasonCode: ReasonCodeSchema.optional(),
    entityUrns: z.array(UrnSchema),
    edgeFactKeys: z.array(Sha256HexSchema),
    relations: z.array(RelationTypeSchema),
    maxHops: z.number().int().min(1).max(10),
    minPathCount: z.number().int().nonnegative(),
    maxPathCount: z.number().int().nonnegative().optional(),
  });

export const GraphReferenceCaseSchema = z
  .strictObject({
    id: z.string().regex(/^GRF-[0-9]{2}$/),
    category: GraphReferenceCategorySchema,
    language: z.enum(['vi', 'en']),
    query: z.string().min(1).max(4000),
    intent: QueryIntentSchema,
    seeds: z.array(GraphReferenceSeedSchema).min(1).max(5),
    maxDepth: z.number().int().min(1).max(10),
    selectedRelations: z.array(RelationTypeSchema).min(1).optional(),
    nodes: z.array(GraphReferenceNodeSchema),
    edges: z.array(GraphReferenceEdgeSchema),
    chunks: z.array(GraphReferenceChunkSchema),
    expected: GraphReferenceExpectedSchema,
  })
  .superRefine((testCase, ctx) => {
    const nodeKinds = new Map(testCase.nodes.map((node) => [node.urn, node.kind]));
    for (const seed of testCase.seeds) {
      if (!nodeKinds.has(seed.urn) && testCase.expected.reasonCode !== 'SEED_NOT_FOUND') {
        // A resolvable seed must exist in the case corpus.
        if (testCase.category !== 'nonexistent_entity') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['seeds'],
            message: 'Seed must be present in case nodes unless the case tests a nonexistent entity',
          });
        }
      }
    }
    for (const edge of testCase.edges) {
      if (!nodeKinds.has(edge.subjectUrn) || !nodeKinds.has(edge.objectUrn)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['edges'],
          message: 'Edge endpoints must be declared in case nodes',
        });
      }
    }
  });

export type GraphReferenceCase = z.infer<typeof GraphReferenceCaseSchema>;

export const GraphReferenceFixtureSchema = z.array(GraphReferenceCaseSchema).min(12);

export type GraphReferenceFixture = z.infer<typeof GraphReferenceFixtureSchema>;
