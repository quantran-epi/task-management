import neo4j, { Driver, Session } from 'neo4j-driver';
import { randomUUID } from 'node:crypto';
import {
  ActiveGraphView,
  FactDetail,
  GraphCandidate,
  QuarantinedIdentifier,
  RelationType,
  RetrievalGenerationMetadata,
  PinnedRetrievalSnapshot,
  NodeKind,
  EvidenceClassification,
  Urn,
} from '../types/graphProtocol.js';
import type {
  ChunkItem,
  EntityItem,
  EdgeItem,
  ClarificationCandidate,
  EmbeddingProviderMetadata,
} from '../types/retrievalProtocol.js';
import type { ProjectionSnapshot } from '../indexing/incrementalProjector.js';
import type {
  EmbeddingProvider,
  GraphTraversalCriteria,
  GraphTraversalPathRecord,
  GraphTraversalResult,
  OperationOptions,
} from '../retrieval/contracts.js';
import {
  STATIC_TRAVERSAL_QUERIES,
} from '../retrieval/graphTraversal.js';
import {
  GraphRepository,
  deriveGenerationToken,
  RETRIEVAL_GENERATION_GRACE_MS,
} from './graphRepository.js';

export interface Neo4jRepositoryOptions {
  uri: string;
  user?: string | undefined;
  password?: string | undefined;
  database?: string | undefined;
  driver?: Driver | undefined;
}

export const DEFAULT_RETRIEVAL_BATCH_SIZE = 32;

export function getRetrievalBatchSize(): number {
  const envVal = process.env.RETRIEVAL_BATCH_SIZE;
  if (!envVal) return DEFAULT_RETRIEVAL_BATCH_SIZE;
  const parsed = parseInt(envVal, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return DEFAULT_RETRIEVAL_BATCH_SIZE;
  return Math.max(10, Math.min(100, parsed));
}

/**
 * Static parameterized Cypher query definitions per T-17-04 & T-18-02.
 * Zero string interpolation or dynamic clauses to prevent Cypher injection.
 */
export const CYPHER_QUERIES = {
  CREATE_CONSTRAINTS: [
    `CREATE CONSTRAINT entity_instance_key IF NOT EXISTS FOR (e:Entity) REQUIRE e.instanceKey IS UNIQUE`,
    `CREATE CONSTRAINT fact_instance_key IF NOT EXISTS FOR (f:Fact) REQUIRE f.instanceKey IS UNIQUE`,
    `CREATE CONSTRAINT snapshot_id IF NOT EXISTS FOR (s:GraphSnapshot) REQUIRE s.graphSnapshotId IS UNIQUE`,
    `CREATE CONSTRAINT chunk_instance_key IF NOT EXISTS FOR (c:Chunk) REQUIRE c.instanceKey IS UNIQUE`,
  ] as const,

  CREATE_INDEXES: [
    `CREATE INDEX idx_snapshot_entity_urn IF NOT EXISTS FOR (e:Entity) ON (e.graphSnapshotId, e.urn)`,
    `CREATE INDEX idx_snapshot_chunk_id IF NOT EXISTS FOR (c:Chunk) ON (c.graphSnapshotId, c.chunkId)`,
    `CREATE INDEX idx_snapshot_fact_key IF NOT EXISTS FOR (f:Fact) ON (f.graphSnapshotId, f.factKey)`,
    `CREATE INDEX idx_entity_name IF NOT EXISTS FOR (e:Entity) ON (e.graphSnapshotId, e.canonicalName)`,
    `CREATE INDEX idx_entity_normalized IF NOT EXISTS FOR (e:Entity) ON (e.graphSnapshotId, e.normalizedKey)`,
    `CREATE INDEX idx_chunk_doc_range IF NOT EXISTS FOR (c:Chunk) ON (c.graphSnapshotId, c.documentId, c.lineStart, c.lineEnd)`,
  ] as const,

  INSERT_GRAPH_SNAPSHOT: `
    MERGE (s:GraphSnapshot {graphSnapshotId: $graphSnapshotId})
    SET s.sourceSnapshotId = $sourceSnapshotId,
        s.setId = $setId,
        s.ontologyVersion = $ontologyVersion,
        s.normalizedProjectionHash = $normalizedProjectionHash,
        s.state = 'READY',
        s.createdAt = $createdAt,
        s.nodeCount = $nodeCount,
        s.relationCount = $relationCount,
        s.factCount = $factCount,
        s.conflictCount = $conflictCount,
        s.quarantineCount = $quarantineCount,
        s.approvedFactCount = $approvedFactCount,
        s.quarantinesJson = $quarantinesJson
  `,

  UNWIND_INSERT_NODES: `
    UNWIND $rows AS row
    MERGE (e:Entity {instanceKey: row.instanceKey})
    SET e.urn = row.urn,
        e.kind = row.kind,
        e.canonicalName = row.canonicalName,
        e.sourceSystem = row.sourceSystem,
        e.nativeType = row.nativeType,
        e.normalizedKey = row.normalizedKey,
        e.subkind = row.subkind,
        e.propertiesJson = row.propertiesJson,
        e.aliases = row.aliases,
        e.graphSnapshotId = $graphSnapshotId
  `,

  UNWIND_INSERT_FACTS: `
    UNWIND $rows AS row
    MERGE (f:Fact {instanceKey: row.instanceKey})
    SET f.factKey = row.factKey,
        f.ontologyVersion = row.ontologyVersion,
        f.subjectUrn = row.subjectUrn,
        f.relation = row.relation,
        f.objectUrn = row.objectUrn,
        f.qualifiersJson = row.qualifiersJson,
        f.effectiveClassification = row.effectiveClassification,
        f.hasConflict = row.hasConflict,
        f.sourceMissing = row.sourceMissing,
        f.graphSnapshotId = $graphSnapshotId
  `,

  UNWIND_INSERT_EVIDENCE: `
    UNWIND $rows AS row
    MERGE (ev:Evidence {evidenceId: row.evidenceId})
    SET ev.factKey = row.factKey,
        ev.documentId = row.documentId,
        ev.documentTitle = row.documentTitle,
        ev.sectionHeadingPath = row.sectionHeadingPath,
        ev.startLine = row.startLine,
        ev.endLine = row.endLine,
        ev.startOffset = row.startOffset,
        ev.endOffset = row.endOffset,
        ev.rawSnippet = row.rawSnippet,
        ev.extractionMethod = row.extractionMethod,
        ev.classification = row.classification,
        ev.confidence = row.confidence,
        ev.observedAt = row.observedAt,
        ev.environment = row.environment,
        ev.graphSnapshotId = $graphSnapshotId
    WITH ev, row
    MATCH (f:Fact {instanceKey: row.factInstanceKey})
    MERGE (ev)-[:EVIDENCE_FOR]->(f)
  `,

  UNWIND_INSERT_CONFLICTS: `
    UNWIND $rows AS row
    MERGE (c:Conflict {conflictId: row.conflictId})
    SET c.factKeyA = row.factKeyA,
        c.factKeyB = row.factKeyB,
        c.subjectUrn = row.subjectUrn,
        c.relation = row.relation,
        c.conflictType = row.conflictType,
        c.detectedAt = row.detectedAt,
        c.resolved = row.resolved,
        c.graphSnapshotId = $graphSnapshotId
    WITH c, row
    MATCH (fa:Fact {instanceKey: row.factInstanceKeyA})
    MATCH (fb:Fact {instanceKey: row.factInstanceKeyB})
    MERGE (fa)-[:CONFLICTS_WITH]->(c)
    MERGE (fb)-[:CONFLICTS_WITH]->(c)
  `,

  UNWIND_INSERT_CHUNKS: `
    UNWIND $rows AS row
    MERGE (c:Chunk {instanceKey: row.instanceKey})
    SET c.chunkKey = row.chunkKey,
        c.chunkId = row.chunkId,
        c.documentId = row.documentId,
        c.documentTitle = row.documentTitle,
        c.publishedContentHash = row.publishedContentHash,
        c.headingPath = row.headingPath,
        c.startLine = row.startLine,
        c.endLine = row.endLine,
        c.startOffset = row.startOffset,
        c.endOffset = row.endOffset,
        c.text = row.text,
        c.embedding = row.embedding,
        c.graphSnapshotId = $graphSnapshotId
  `,

  LINK_FACT_CHUNK_SUPPORT: `
    UNWIND $rows AS row
    MATCH (f:Fact {graphSnapshotId: $graphSnapshotId, factKey: row.factKey})
    MATCH (c:Chunk {graphSnapshotId: $graphSnapshotId, chunkKey: row.chunkKey})
    MERGE (f)-[r:SUPPORTED_BY {graphSnapshotId: $graphSnapshotId}]->(c)
    SET r.chunkId = row.chunkId
  `,

  UPDATE_RETRIEVAL_GENERATION_METADATA: `
    MATCH (s:GraphSnapshot {graphSnapshotId: $graphSnapshotId})
    SET s.fulltextIndexName = $fulltextIndexName,
        s.vectorIndexName = $vectorIndexName,
        s.embeddingMetadataJson = $embeddingMetadataJson,
        s.chunkCount = $chunkCount,
        s.evidenceCount = $evidenceCount,
        s.hasVectors = $hasVectors,
        s.retrievalBuiltAt = $retrievalBuiltAt
  `,

  VALIDATE_CITATION_CLOSURE: `
    MATCH (s:GraphSnapshot {graphSnapshotId: $graphSnapshotId})
    OPTIONAL MATCH (f:Fact {graphSnapshotId: $graphSnapshotId})
    WHERE coalesce(f.sourceMissing, false) = false
    WITH s, collect(f) AS facts
    UNWIND CASE WHEN size(facts) = 0 THEN [null] ELSE facts END AS fact
    OPTIONAL MATCH (fact)-[support:SUPPORTED_BY]->(chunk:Chunk)
    WITH s, facts,
         count(DISTINCT support) AS supportCount,
         count(DISTINCT CASE
           WHEN support.graphSnapshotId = $graphSnapshotId
            AND chunk.graphSnapshotId = $graphSnapshotId
           THEN fact END) AS closedFactCount,
         count(DISTINCT CASE
           WHEN support IS NOT NULL AND (
             support.graphSnapshotId <> $graphSnapshotId OR
             chunk IS NULL OR
             chunk.graphSnapshotId <> $graphSnapshotId
           ) THEN support END) AS invalidSupportCount
    RETURN size([f IN facts WHERE f IS NOT NULL]) AS eligibleFactCount,
           closedFactCount,
           supportCount,
           invalidSupportCount
  `,

  ACTIVATE_CANDIDATE: `
    MERGE (set:GraphSet {setId: $setId})
    WITH set
    MATCH (candidate:GraphSnapshot {graphSnapshotId: $graphSnapshotId, setId: $setId})
    WHERE candidate.state IN ['READY', 'SUPERSEDED']
    OPTIONAL MATCH (set)-[old:ACTIVE_GRAPH]->(previous:GraphSnapshot)
    DELETE old
    FOREACH (_ IN CASE WHEN previous IS NULL THEN [] ELSE [1] END |
      SET previous.state = 'SUPERSEDED',
          previous.supersededAt = $activatedAtEpoch
    )
    MERGE (set)-[:ACTIVE_GRAPH]->(candidate)
    SET candidate.state = 'ACTIVE',
        candidate.activatedAt = $activatedAt
    RETURN candidate.graphSnapshotId AS id
  `,

  GET_ACTIVE_GRAPH: `
    MATCH (set:GraphSet {setId: $setId})-[:ACTIVE_GRAPH]->(s:GraphSnapshot {state: 'ACTIVE'})
    RETURN s.setId AS setId,
           s.graphSnapshotId AS graphSnapshotId,
           s.sourceSnapshotId AS sourceSnapshotId,
           s.ontologyVersion AS ontologyVersion,
           s.normalizedProjectionHash AS normalizedProjectionHash,
           s.activatedAt AS activatedAt,
           s.fulltextIndexName AS fulltextIndexName,
           s.vectorIndexName AS vectorIndexName,
           s.embeddingMetadataJson AS embeddingMetadataJson,
           s.chunkCount AS chunkCount,
           s.hasVectors AS hasVectors,
           s.retrievalBuiltAt AS retrievalBuiltAt,
           s.nodeCount AS nodeCount,
           s.relationCount AS relationCount,
           s.factCount AS factCount,
           s.conflictCount AS conflictCount,
           s.quarantineCount AS quarantineCount,
           s.approvedFactCount AS approvedFactCount,
           s.evidenceCount AS evidenceCount
  `,

  GET_QUARANTINES_BY_SNAPSHOT: `
    MATCH (s:GraphSnapshot {graphSnapshotId: $graphSnapshotId})
    RETURN s.quarantinesJson AS quarantinesJson
  `,

  GET_FACTS_BY_SNAPSHOT: `
    MATCH (f:Fact {graphSnapshotId: $graphSnapshotId})
    OPTIONAL MATCH (s:Entity {graphSnapshotId: $graphSnapshotId, urn: f.subjectUrn})
    OPTIONAL MATCH (o:Entity {graphSnapshotId: $graphSnapshotId, urn: f.objectUrn})
    OPTIONAL MATCH (ev:Evidence {graphSnapshotId: $graphSnapshotId})-[:EVIDENCE_FOR]->(f)
    RETURN f.factKey AS factKey,
           f.ontologyVersion AS ontologyVersion,
           f.subjectUrn AS subjectUrn,
           f.relation AS relation,
           f.objectUrn AS objectUrn,
           f.qualifiersJson AS qualifiersJson,
           f.effectiveClassification AS effectiveClassification,
           f.hasConflict AS hasConflict,
           f.sourceMissing AS sourceMissing,
           coalesce(s.canonicalName, f.subjectUrn) AS subjectCanonicalName,
           coalesce(s.kind, 'Entity') AS subjectKind,
           coalesce(o.canonicalName, f.objectUrn) AS objectCanonicalName,
           coalesce(o.kind, 'Entity') AS objectKind,
           collect(ev) AS evidenceRecords
  `,

  AWAIT_INDEX: `CALL db.awaitIndex($indexName, 120)`,

  SHOW_INDEX_BY_NAME: `
    SHOW INDEXES
    YIELD name, state, populationPercent
    WHERE name = $indexName
    RETURN name, state, populationPercent
  `,

  QUERY_CHUNK_FULLTEXT: `
    CALL db.index.fulltext.queryNodes($indexName, $luceneQuery)
    YIELD node, score
    WHERE node.graphSnapshotId = $snapshotId
    RETURN node.chunkKey AS chunkKey,
           node.documentId AS sourceDocumentId,
           node.documentTitle AS sourceDocumentTitle,
           node.publishedContentHash AS publishedContentHash,
           node.headingPath AS headingPath,
           node.startLine AS lineStart,
           node.endLine AS lineEnd,
           node.text AS rawSnippet,
           score
    ORDER BY score DESC
    LIMIT $limit
  `,

  QUERY_CHUNK_VECTOR: `
    CALL db.index.vector.queryNodes($indexName, $limit, $queryEmbedding)
    YIELD node, score
    WHERE node.graphSnapshotId = $snapshotId
    RETURN node.chunkKey AS chunkKey,
           node.documentId AS sourceDocumentId,
           node.documentTitle AS sourceDocumentTitle,
           node.publishedContentHash AS publishedContentHash,
           node.headingPath AS headingPath,
           node.startLine AS lineStart,
           node.endLine AS lineEnd,
           node.text AS rawSnippet,
           score
    ORDER BY score DESC
    LIMIT $limit
  `,

  QUERY_CHUNKS_BY_DOCUMENT: `
    MATCH (c:Chunk)
    WHERE c.graphSnapshotId = $snapshotId
      AND c.documentId IN $documentIds
    RETURN c.chunkKey AS chunkKey,
           c.documentId AS sourceDocumentId,
           c.documentTitle AS sourceDocumentTitle,
           c.publishedContentHash AS publishedContentHash,
           c.headingPath AS headingPath,
           c.startLine AS lineStart,
           c.endLine AS lineEnd,
           c.text AS rawSnippet,
           1.0 AS score
    ORDER BY c.documentId, c.startLine
    LIMIT $limit
  `,

  RECORD_LEASE: `
    MATCH (s:GraphSnapshot {graphSnapshotId: $graphSnapshotId})
    MERGE (l:RetrievalLease {leaseId: $leaseId})
    SET l.graphSnapshotId = $graphSnapshotId,
        l.setId = $setId,
        l.acquiredAt = $acquiredAt
    MERGE (s)-[:HELD_BY_LEASE]->(l)
  `,

  RELEASE_LEASE: `
    MATCH (l:RetrievalLease {leaseId: $leaseId})
    DETACH DELETE l
  `,

  FIND_SUPERSEDED_FOR_CLEANUP: `
    MATCH (s:GraphSnapshot {state: 'SUPERSEDED'})
    WHERE s.supersededAt <= $cutoffEpoch
      AND NOT (s)-[:HELD_BY_LEASE]->(:RetrievalLease)
    RETURN s.graphSnapshotId AS graphSnapshotId,
           s.fulltextIndexName AS fulltextIndexName,
           s.vectorIndexName AS vectorIndexName
  `,

  DELETE_GENERATION_DATA: `
    MATCH (c:Chunk {graphSnapshotId: $graphSnapshotId})
    DETACH DELETE c
    WITH 1 AS dummy
    MATCH (s:GraphSnapshot {graphSnapshotId: $graphSnapshotId})
    SET s.state = 'DELETED'
  `,

  GET_GENERATION_META_BY_SNAPSHOT: `
    MATCH (s:GraphSnapshot {graphSnapshotId: $snapshotId})
    RETURN s.embeddingMetadataJson AS embeddingMetadataJson, s.hasVectors AS hasVectors
  `,

  RESOLVE_ENTITIES: `
    UNWIND $tokens AS token
    MATCH (e:Entity {graphSnapshotId: $snapshotId})
    WHERE e.urn = token
       OR e.normalizedKey = token
       OR toLower(e.canonicalName) CONTAINS toLower(token)
       OR any(a IN e.aliases WHERE toLower(a) CONTAINS toLower(token))
    RETURN DISTINCT e.urn AS urn, e.canonicalName AS canonicalName, e.kind AS kind
    LIMIT 25
  `,
} as const;

/**
 * Static relation-specific Cypher query templates per D-02 and T-17-04.
 * Static mapping prevents dynamic Cypher string concatenation.
 */
export const STATIC_RELATION_WRITERS: Record<RelationType, string> = {
  CONTAINS_STEP: `
    UNWIND $rows AS row
    MATCH (s:Entity {instanceKey: row.subjectInstanceKey})
    MATCH (o:Entity {instanceKey: row.objectInstanceKey})
    MERGE (s)-[r:CONTAINS_STEP {edgeInstanceKey: row.edgeInstanceKey}]->(o)
    SET r.factKey = row.factKey,
        r.graphSnapshotId = $graphSnapshotId,
        r.defaultTraversable = row.defaultTraversable
  `,
  PRECEDES: `
    UNWIND $rows AS row
    MATCH (s:Entity {instanceKey: row.subjectInstanceKey})
    MATCH (o:Entity {instanceKey: row.objectInstanceKey})
    MERGE (s)-[r:PRECEDES {edgeInstanceKey: row.edgeInstanceKey}]->(o)
    SET r.factKey = row.factKey,
        r.graphSnapshotId = $graphSnapshotId,
        r.defaultTraversable = row.defaultTraversable
  `,
  CALLS: `
    UNWIND $rows AS row
    MATCH (s:Entity {instanceKey: row.subjectInstanceKey})
    MATCH (o:Entity {instanceKey: row.objectInstanceKey})
    MERGE (s)-[r:CALLS {edgeInstanceKey: row.edgeInstanceKey}]->(o)
    SET r.factKey = row.factKey,
        r.graphSnapshotId = $graphSnapshotId,
        r.defaultTraversable = row.defaultTraversable
  `,
  INVOKES: `
    UNWIND $rows AS row
    MATCH (s:Entity {instanceKey: row.subjectInstanceKey})
    MATCH (o:Entity {instanceKey: row.objectInstanceKey})
    MERGE (s)-[r:INVOKES {edgeInstanceKey: row.edgeInstanceKey}]->(o)
    SET r.factKey = row.factKey,
        r.graphSnapshotId = $graphSnapshotId,
        r.defaultTraversable = row.defaultTraversable
  `,
  READS_FROM: `
    UNWIND $rows AS row
    MATCH (s:Entity {instanceKey: row.subjectInstanceKey})
    MATCH (o:Entity {instanceKey: row.objectInstanceKey})
    MERGE (s)-[r:READS_FROM {edgeInstanceKey: row.edgeInstanceKey}]->(o)
    SET r.factKey = row.factKey,
        r.graphSnapshotId = $graphSnapshotId,
        r.defaultTraversable = row.defaultTraversable
  `,
  WRITES_TO: `
    UNWIND $rows AS row
    MATCH (s:Entity {instanceKey: row.subjectInstanceKey})
    MATCH (o:Entity {instanceKey: row.objectInstanceKey})
    MERGE (s)-[r:WRITES_TO {edgeInstanceKey: row.edgeInstanceKey}]->(o)
    SET r.factKey = row.factKey,
        r.graphSnapshotId = $graphSnapshotId,
        r.defaultTraversable = row.defaultTraversable
  `,
  EMITS: `
    UNWIND $rows AS row
    MATCH (s:Entity {instanceKey: row.subjectInstanceKey})
    MATCH (o:Entity {instanceKey: row.objectInstanceKey})
    MERGE (s)-[r:EMITS {edgeInstanceKey: row.edgeInstanceKey}]->(o)
    SET r.factKey = row.factKey,
        r.graphSnapshotId = $graphSnapshotId,
        r.defaultTraversable = row.defaultTraversable
  `,
  CONSUMES: `
    UNWIND $rows AS row
    MATCH (s:Entity {instanceKey: row.subjectInstanceKey})
    MATCH (o:Entity {instanceKey: row.objectInstanceKey})
    MERGE (s)-[r:CONSUMES {edgeInstanceKey: row.edgeInstanceKey}]->(o)
    SET r.factKey = row.factKey,
        r.graphSnapshotId = $graphSnapshotId,
        r.defaultTraversable = row.defaultTraversable
  `,
  USES_TYPE: `
    UNWIND $rows AS row
    MATCH (s:Entity {instanceKey: row.subjectInstanceKey})
    MATCH (o:Entity {instanceKey: row.objectInstanceKey})
    MERGE (s)-[r:USES_TYPE {edgeInstanceKey: row.edgeInstanceKey}]->(o)
    SET r.factKey = row.factKey,
        r.graphSnapshotId = $graphSnapshotId,
        r.defaultTraversable = row.defaultTraversable
  `,
  HAS_STATUS: `
    UNWIND $rows AS row
    MATCH (s:Entity {instanceKey: row.subjectInstanceKey})
    MATCH (o:Entity {instanceKey: row.objectInstanceKey})
    MERGE (s)-[r:HAS_STATUS {edgeInstanceKey: row.edgeInstanceKey}]->(o)
    SET r.factKey = row.factKey,
        r.graphSnapshotId = $graphSnapshotId,
        r.defaultTraversable = row.defaultTraversable
  `,
};

/**
 * Escapes Lucene special query characters per Lucene 9 syntax.
 */
export function escapeLuceneSpecialChars(str: string): string {
  // + - && || ! ( ) { } [ ] ^ " ~ * ? : \ /
  return str.replace(/([+\-!(){}[\]^"~*?:\\/&|])/g, '\\$1');
}

/**
 * Convert Neo4j Integer or raw number to JS number safely.
 * Returns 0 for null/undefined to preserve historical zero-default behavior.
 */
export function toSafeInt(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  if (typeof v?.toNumber === 'function') return v.toNumber();
  return Number(v) || 0;
}

export class Neo4jRepository implements GraphRepository {
  private driver: Driver;
  private database: string | undefined;
  private ownDriver: boolean = false;
  private quarantinesBySnapshot = new Map<string, QuarantinedIdentifier[]>();
  private localGenerationMetadata = new Map<string, RetrievalGenerationMetadata>();

  constructor(options: Neo4jRepositoryOptions) {
    this.database = options.database;
    if (options.driver) {
      this.driver = options.driver;
    } else {
      const auth =
        options.user && options.password
          ? neo4j.auth.basic(options.user, options.password)
          : undefined;
      this.driver = neo4j.driver(options.uri, auth);
      this.ownDriver = true;
    }
  }

  async close(): Promise<void> {
    if (this.ownDriver) {
      await this.driver.close();
    }
  }

  private getSession(): Session {
    return this.driver.session(this.database ? { database: this.database } : undefined);
  }

  async initializeSchemaConstraints(): Promise<void> {
    const session = this.getSession();
    try {
      for (const query of CYPHER_QUERIES.CREATE_CONSTRAINTS) {
        await session.run(query);
      }
      for (const query of CYPHER_QUERIES.CREATE_INDEXES) {
        await session.run(query);
      }
    } finally {
      await session.close();
    }
  }

  async writeCandidate(candidate: GraphCandidate): Promise<void> {
    const session = this.getSession();
    try {
      const approvedFactCount = candidate.relations.filter(
        (r) => r.effectiveClassification === 'BUSINESS_APPROVED'
      ).length;
      const quarantinesJson = JSON.stringify(candidate.quarantines || []);

      await session.executeWrite(async (tx) => {
        // 1. Insert snapshot record with real counts and durable quarantines
        await tx.run(CYPHER_QUERIES.INSERT_GRAPH_SNAPSHOT, {
          graphSnapshotId: candidate.graphSnapshotId,
          sourceSnapshotId: candidate.sourceSnapshotId,
          setId: candidate.setId,
          ontologyVersion: candidate.ontologyVersion,
          normalizedProjectionHash: candidate.normalizedProjectionHash,
          createdAt: candidate.createdAt,
          nodeCount: candidate.nodes.length,
          relationCount: candidate.relations.length,
          factCount: candidate.relations.length,
          conflictCount: candidate.conflicts.length,
          quarantineCount: (candidate.quarantines || []).length,
          approvedFactCount,
          quarantinesJson,
        });

        // 2. Unwind insert nodes
        if (candidate.nodes.length > 0) {
          const nodeRows = candidate.nodes.map((n) => ({
            instanceKey: `${candidate.graphSnapshotId}:${n.urn}`,
            urn: n.urn,
            kind: n.kind,
            canonicalName: n.canonicalName,
            sourceSystem: n.sourceSystem,
            nativeType: n.nativeType,
            normalizedKey: n.normalizedKey,
            subkind: n.subkind || null,
            propertiesJson: JSON.stringify(n.properties || {}),
            aliases: n.aliases || [],
          }));

          await tx.run(CYPHER_QUERIES.UNWIND_INSERT_NODES, {
            graphSnapshotId: candidate.graphSnapshotId,
            rows: nodeRows,
          });
        }

        // 3. Unwind insert facts
        if (candidate.relations.length > 0) {
          const factRows = candidate.relations.map((r) => ({
            instanceKey: `${candidate.graphSnapshotId}:${r.factKey}`,
            factKey: r.factKey,
            ontologyVersion: r.ontologyVersion,
            subjectUrn: r.subjectUrn,
            relation: r.relation,
            objectUrn: r.objectUrn,
            qualifiersJson: JSON.stringify(r.qualifiers || {}),
            effectiveClassification: r.effectiveClassification,
            hasConflict: r.hasConflict,
            sourceMissing: r.sourceMissing,
          }));

          await tx.run(CYPHER_QUERIES.UNWIND_INSERT_FACTS, {
            graphSnapshotId: candidate.graphSnapshotId,
            rows: factRows,
          });
        }

        // 4. Unwind insert domain relationships per relation type
        const relationsByType = new Map<string, typeof candidate.relations>();
        for (const rel of candidate.relations) {
          const list = relationsByType.get(rel.relation) || [];
          list.push(rel);
          relationsByType.set(rel.relation, list);
        }

        for (const [relType, list] of relationsByType.entries()) {
          const query = STATIC_RELATION_WRITERS[relType as RelationType];
          if (!query) continue;

          const rows = list.map((r) => ({
            subjectInstanceKey: `${candidate.graphSnapshotId}:${r.subjectUrn}`,
            objectInstanceKey: `${candidate.graphSnapshotId}:${r.objectUrn}`,
            edgeInstanceKey: `${candidate.graphSnapshotId}:${r.factKey}`,
            factKey: r.factKey,
            defaultTraversable: !r.hasConflict,
          }));

          await tx.run(query, {
            graphSnapshotId: candidate.graphSnapshotId,
            rows,
          });
        }

        // 5. Unwind insert evidence
        if (candidate.evidence.length > 0) {
          const evidenceRows = candidate.evidence.map((ev) => ({
            evidenceId: ev.evidenceId,
            factKey: ev.factKey,
            factInstanceKey: `${candidate.graphSnapshotId}:${ev.factKey}`,
            documentId: ev.documentId,
            documentTitle: ev.documentTitle,
            sectionHeadingPath: ev.sectionHeadingPath,
            startLine: ev.startLine,
            endLine: ev.endLine,
            startOffset: ev.startOffset,
            endOffset: ev.endOffset,
            rawSnippet: ev.rawSnippet,
            extractionMethod: ev.extractionMethod,
            classification: ev.classification,
            confidence: ev.confidence,
            observedAt: ev.observedAt,
            environment: ev.environment || null,
          }));

          await tx.run(CYPHER_QUERIES.UNWIND_INSERT_EVIDENCE, {
            graphSnapshotId: candidate.graphSnapshotId,
            rows: evidenceRows,
          });
        }

        // 6. Unwind insert conflicts
        if (candidate.conflicts.length > 0) {
          const conflictRows = candidate.conflicts.map((c) => ({
            conflictId: c.conflictId,
            factKeyA: c.factKeyA,
            factKeyB: c.factKeyB,
            factInstanceKeyA: `${candidate.graphSnapshotId}:${c.factKeyA}`,
            factInstanceKeyB: `${candidate.graphSnapshotId}:${c.factKeyB}`,
            subjectUrn: c.subjectUrn,
            relation: c.relation,
            conflictType: c.conflictType,
            detectedAt: c.detectedAt,
            resolved: c.resolved,
          }));

          await tx.run(CYPHER_QUERIES.UNWIND_INSERT_CONFLICTS, {
            graphSnapshotId: candidate.graphSnapshotId,
            rows: conflictRows,
          });
        }
      });

      this.quarantinesBySnapshot.set(candidate.graphSnapshotId, candidate.quarantines);
    } finally {
      await session.close();
    }
  }

  async buildRetrievalGeneration(
    candidate: GraphCandidate,
    sourceSnapshot: ProjectionSnapshot,
    embeddingProvider?: EmbeddingProvider | undefined
  ): Promise<RetrievalGenerationMetadata> {
    const token = deriveGenerationToken(candidate.graphSnapshotId);
    if (!/^[a-f0-9]{16}$/.test(token)) {
      throw new Error(`SECURITY_VIOLATION: Invalid generation token digest ${token}`);
    }

    const snapshotLabel = `ChunkSnapshot_${token}`;
    const fulltextIndexName = `chunk_fulltext_${token}`;
    const vectorIndexName = `chunk_vector_${token}`;

    const allChunks: Array<{
      instanceKey: string;
      chunkKey: string;
      chunkId: string;
      documentId: string;
      documentTitle: string;
      publishedContentHash: string;
      headingPath: string[];
      startLine: number;
      endLine: number;
      startOffset: number;
      endOffset: number;
      text: string;
    }> = [];

    for (const doc of sourceSnapshot.documents) {
      for (const c of doc.chunks) {
        allChunks.push({
          instanceKey: `${candidate.graphSnapshotId}:${c.occurrenceId}`,
          chunkKey: c.occurrenceId,
          chunkId: c.occurrenceId,
          documentId: doc.documentId,
          documentTitle: doc.title,
          publishedContentHash: doc.contentHash,
          headingPath: [...c.headingPath],
          startLine: c.startLine,
          endLine: c.endLine,
          startOffset: c.startOffset,
          endOffset: c.endOffset,
          text: c.rawContent,
        });
      }
    }

    const embeddingMetadata = embeddingProvider?.describe();
    const hasVectors = Boolean(embeddingProvider && allChunks.length > 0);
    const batchSize = getRetrievalBatchSize();
    const session = this.getSession();

    try {
      // 1. Process and insert chunks in bounded streaming batches
      for (let i = 0; i < allChunks.length; i += batchSize) {
        const batchSlice = allChunks.slice(i, i + batchSize);
        let batchRows: Array<{
          instanceKey: string;
          chunkKey: string;
          chunkId: string;
          documentId: string;
          documentTitle: string;
          publishedContentHash: string;
          headingPath: string[];
          startLine: number;
          endLine: number;
          startOffset: number;
          endOffset: number;
          text: string;
          embedding: number[] | null;
        }>;

        if (embeddingProvider) {
          const texts = batchSlice.map((c) => c.text);
          const vectors = await embeddingProvider.embedDocuments(texts);
          if (vectors.length !== batchSlice.length) {
            throw new Error('EMBEDDING_COUNT_MISMATCH: Batch length mismatch');
          }
          const expectedDim = embeddingMetadata?.dimensions;
          batchRows = batchSlice.map((c, idx) => {
            const vec = vectors[idx]!;
            if (expectedDim && vec.length !== expectedDim) {
              throw new Error(`DIMENSION_MISMATCH: Expected ${expectedDim}, got ${vec.length}`);
            }
            return {
              ...c,
              embedding: vec,
            };
          });
        } else {
          batchRows = batchSlice.map((c) => ({
            ...c,
            embedding: null,
          }));
        }

        // Insert batch and link evidence overlap immediately to Neo4j
        await session.executeWrite(async (tx) => {
          await tx.run(CYPHER_QUERIES.UNWIND_INSERT_CHUNKS, {
            graphSnapshotId: candidate.graphSnapshotId,
            rows: batchRows,
          });

          // Attach generation-specific snapshot label to isolate index
          await tx.run(
            `MATCH (c:Chunk {graphSnapshotId: $graphSnapshotId}) SET c:\`${snapshotLabel}\``,
            { graphSnapshotId: candidate.graphSnapshotId }
          );

          // Link facts only to same-document chunks whose source coordinates overlap.
          const supportByKey = new Map<string, { factKey: string; chunkKey: string; chunkId: string }>();
          for (const ev of candidate.evidence) {
            for (const chunk of batchRows) {
              if (chunk.documentId !== ev.documentId) continue;
              const lineOverlap = ev.startLine <= chunk.endLine && ev.endLine >= chunk.startLine;
              const hasOffsets =
                ev.startOffset !== undefined &&
                ev.endOffset !== undefined &&
                chunk.startOffset !== undefined &&
                chunk.endOffset !== undefined;
              const offsetOverlap = hasOffsets
                ? ev.startOffset! < chunk.endOffset && ev.endOffset! > chunk.startOffset
                : false;
              if (!lineOverlap && !offsetOverlap) continue;
              supportByKey.set(`${ev.factKey}\u0000${chunk.chunkKey}`, {
                factKey: ev.factKey,
                chunkKey: chunk.chunkKey,
                chunkId: chunk.chunkId,
              });
            }
          }
          const supportRows = [...supportByKey.values()];

          if (supportRows.length > 0) {
            await tx.run(CYPHER_QUERIES.LINK_FACT_CHUNK_SUPPORT, {
              graphSnapshotId: candidate.graphSnapshotId,
              rows: supportRows,
            });
          }
        });

        // Yield event loop between batches for GC and Fastify responsiveness
        await new Promise((resolve) => setImmediate(resolve));
      }

      // 2. Create fulltext index with standard-folding
      await session.run(`
        CREATE FULLTEXT INDEX \`${fulltextIndexName}\` IF NOT EXISTS
        FOR (c:\`${snapshotLabel}\`) ON EACH [c.text]
        OPTIONS { indexConfig: {
          \`fulltext.analyzer\`: 'standard-folding'
        }}
      `);

      // 3. Create vector index if vectors are enabled
      if (hasVectors && embeddingMetadata) {
        await session.run(`
          CREATE VECTOR INDEX \`${vectorIndexName}\` IF NOT EXISTS
          FOR (c:\`${snapshotLabel}\`)
          ON c.embedding
          OPTIONS { indexConfig: {
            \`vector.dimensions\`: ${embeddingMetadata.dimensions},
            \`vector.similarity_function\`: 'cosine'
          }}
        `);
      }

      // 4. Await indexes and verify ONLINE
      await session.run(CYPHER_QUERIES.AWAIT_INDEX, { indexName: fulltextIndexName });
      if (hasVectors) {
        await session.run(CYPHER_QUERIES.AWAIT_INDEX, { indexName: vectorIndexName });
      }

      // 5. Update generation metadata on snapshot node
      const metadata: RetrievalGenerationMetadata = {
        graphSnapshotId: candidate.graphSnapshotId,
        sourceSnapshotId: candidate.sourceSnapshotId,
        fulltextIndexName,
        vectorIndexName,
        embeddingMetadata,
        chunkCount: allChunks.length,
        hasVectors,
        builtAt: new Date().toISOString(),
      };

      await session.run(CYPHER_QUERIES.UPDATE_RETRIEVAL_GENERATION_METADATA, {
        graphSnapshotId: candidate.graphSnapshotId,
        fulltextIndexName,
        vectorIndexName,
        embeddingMetadataJson: JSON.stringify(embeddingMetadata || {}),
        chunkCount: allChunks.length,
        evidenceCount: new Set(candidate.evidence.map((evidence) => evidence.factKey)).size,
        hasVectors,
        retrievalBuiltAt: metadata.builtAt,
      });

      this.localGenerationMetadata.set(candidate.graphSnapshotId, metadata);
      return metadata;
    } finally {
      await session.close();
    }
  }

  async validateRetrievalGeneration(graphSnapshotId: string): Promise<boolean> {
    const meta = this.localGenerationMetadata.get(graphSnapshotId);
    if (!meta) return false;

    const session = this.getSession();
    try {
      // Validate fulltext index is ONLINE
      const ftRes = await session.run(CYPHER_QUERIES.SHOW_INDEX_BY_NAME, {
        indexName: meta.fulltextIndexName,
      });
      if (ftRes.records.length === 0 || ftRes.records[0]!.get('state') !== 'ONLINE') {
        return false;
      }

      // Validate vector index is ONLINE if enabled
      if (meta.hasVectors) {
        const vecRes = await session.run(CYPHER_QUERIES.SHOW_INDEX_BY_NAME, {
          indexName: meta.vectorIndexName,
        });
        if (vecRes.records.length === 0 || vecRes.records[0]!.get('state') !== 'ONLINE') {
          return false;
        }
      }

      const closureRes = await session.run(CYPHER_QUERIES.VALIDATE_CITATION_CLOSURE, {
        graphSnapshotId,
      });
      if (closureRes.records.length !== 1) return false;
      const closure = closureRes.records[0]!;
      const eligibleFactCount = toSafeInt(closure.get('eligibleFactCount'));
      const closedFactCount = toSafeInt(closure.get('closedFactCount'));
      const invalidSupportCount = toSafeInt(closure.get('invalidSupportCount'));
      return eligibleFactCount === closedFactCount && invalidSupportCount === 0;
    } catch {
      return false;
    } finally {
      await session.close();
    }
  }

  async activateCandidate(setId: string, graphSnapshotId: string): Promise<void> {
    const session = this.getSession();
    try {
      await session.executeWrite(async (tx) => {
        const result = await tx.run(CYPHER_QUERIES.ACTIVATE_CANDIDATE, {
          setId,
          graphSnapshotId,
          activatedAt: new Date().toISOString(),
          activatedAtEpoch: Date.now(),
        });
        if (result.records.length !== 1) {
          throw new Error('GRAPH_CANDIDATE_NOT_READY');
        }
      });
    } finally {
      await session.close();
    }
  }

  async getActiveGraph(setId: string): Promise<ActiveGraphView | null> {
    const session = this.getSession();
    try {
      const res = await session.run(CYPHER_QUERIES.GET_ACTIVE_GRAPH, { setId });
      if (res.records.length === 0) return null;

      const record = res.records[0]!;
      const graphSnapshotId = record.get('graphSnapshotId');
      const embeddingMetadataJson = record.get('embeddingMetadataJson');
      const embeddingMetadata = embeddingMetadataJson ? JSON.parse(embeddingMetadataJson) : undefined;

      const retrievalGeneration: RetrievalGenerationMetadata | undefined = record.get('fulltextIndexName')
        ? {
            graphSnapshotId,
            sourceSnapshotId: record.get('sourceSnapshotId'),
            fulltextIndexName: record.get('fulltextIndexName'),
            vectorIndexName: record.get('vectorIndexName'),
            embeddingMetadata,
            chunkCount: record.get('chunkCount')?.toNumber ? record.get('chunkCount').toNumber() : (record.get('chunkCount') || 0),
            hasVectors: !!record.get('hasVectors'),
            builtAt: record.get('retrievalBuiltAt') || record.get('activatedAt'),
          }
        : this.localGenerationMetadata.get(graphSnapshotId);

      return {
        setId: record.get('setId'),
        graphSnapshotId,
        sourceSnapshotId: record.get('sourceSnapshotId'),
        ontologyVersion: record.get('ontologyVersion'),
        normalizedProjectionHash: record.get('normalizedProjectionHash'),
        activatedAt: record.get('activatedAt'),
        nodeCount: toSafeInt(record.get('nodeCount')),
        relationCount: toSafeInt(record.get('relationCount')),
        factCount: toSafeInt(record.get('factCount')),
        conflictCount: toSafeInt(record.get('conflictCount')),
        quarantineCount: toSafeInt(record.get('quarantineCount')),
        approvedFactCount: toSafeInt(record.get('approvedFactCount')),
        evidenceCount: toSafeInt(record.get('evidenceCount')),
        retrievalGeneration,
      };
    } finally {
      await session.close();
    }
  }

  async getFacts(graphSnapshotId: string): Promise<FactDetail[]> {
    const session = this.getSession();
    try {
      const res = await session.run(CYPHER_QUERIES.GET_FACTS_BY_SNAPSHOT, { graphSnapshotId });
      return res.records.map((rec) => {
        const qualifiers = JSON.parse(rec.get('qualifiersJson') || '{}');
        const evidenceRecordsRaw: any[] = rec.get('evidenceRecords') || [];

        return {
          relation: {
            factKey: rec.get('factKey'),
            ontologyVersion: rec.get('ontologyVersion'),
            subjectUrn: rec.get('subjectUrn'),
            relation: rec.get('relation'),
            objectUrn: rec.get('objectUrn'),
            qualifiers,
            effectiveClassification: rec.get('effectiveClassification'),
            hasConflict: rec.get('hasConflict'),
            sourceMissing: rec.get('sourceMissing'),
          },
          evidence: evidenceRecordsRaw.map((e) => ({
            evidenceId: e.properties.evidenceId,
            factKey: e.properties.factKey,
            documentId: e.properties.documentId,
            documentTitle: e.properties.documentTitle,
            sectionHeadingPath: e.properties.sectionHeadingPath,
            startLine: e.properties.startLine?.toNumber ? e.properties.startLine.toNumber() : e.properties.startLine,
            endLine: e.properties.endLine?.toNumber ? e.properties.endLine.toNumber() : e.properties.endLine,
            startOffset: e.properties.startOffset?.toNumber ? e.properties.startOffset.toNumber() : e.properties.startOffset,
            endOffset: e.properties.endOffset?.toNumber ? e.properties.endOffset.toNumber() : e.properties.endOffset,
            rawSnippet: e.properties.rawSnippet,
            extractionMethod: e.properties.extractionMethod,
            classification: e.properties.classification,
            confidence: e.properties.confidence,
            observedAt: e.properties.observedAt,
            environment: e.properties.environment || undefined,
          })),
          conflicts: [],
          approvals: [],
          subjectCanonicalName: rec.get('subjectCanonicalName'),
          subjectKind: rec.get('subjectKind'),
          objectCanonicalName: rec.get('objectCanonicalName'),
          objectKind: rec.get('objectKind'),
        };
      });
    } finally {
      await session.close();
    }
  }

  async getQuarantines(graphSnapshotId: string): Promise<QuarantinedIdentifier[]> {
    const session = this.getSession();
    try {
      const res = await session.run(CYPHER_QUERIES.GET_QUARANTINES_BY_SNAPSHOT, {
        graphSnapshotId,
      });
      if (res.records.length === 0) {
        // Fallback to in-memory cache for parity with pre-19.1 behavior
        return this.quarantinesBySnapshot.get(graphSnapshotId) || [];
      }
      const json = res.records[0]!.get('quarantinesJson');
      if (!json) return [];
      try {
        const parsed = JSON.parse(json);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    } finally {
      await session.close();
    }
  }

  async acquirePinnedSnapshot(setId: string): Promise<PinnedRetrievalSnapshot | null> {
    const active = await this.getActiveGraph(setId);
    if (!active || !active.retrievalGeneration) {
      return null;
    }

    const leaseId = randomUUID();
    const session = this.getSession();
    try {
      await session.run(CYPHER_QUERIES.RECORD_LEASE, {
        graphSnapshotId: active.graphSnapshotId,
        leaseId,
        setId,
        acquiredAt: new Date().toISOString(),
      });
    } finally {
      await session.close();
    }

    return {
      leaseId,
      snapshotId: active.graphSnapshotId,
      setId,
      generation: active.retrievalGeneration,
      acquiredAt: new Date().toISOString(),
      release: () => this.releasePinnedSnapshot(leaseId),
    };
  }

  async releasePinnedSnapshot(leaseId: string): Promise<void> {
    const session = this.getSession();
    try {
      await session.run(CYPHER_QUERIES.RELEASE_LEASE, { leaseId });
    } finally {
      await session.close();
    }
  }

  async queryFullText(snapshotId: string, query: string, limit: number): Promise<ChunkItem[]> {
    const meta = this.localGenerationMetadata.get(snapshotId);
    const token = deriveGenerationToken(snapshotId);
    const indexName = meta?.fulltextIndexName || `chunk_fulltext_${token}`;
    const luceneQuery = escapeLuceneSpecialChars(query);

    const session = this.getSession();
    try {
      const res = await session.run(CYPHER_QUERIES.QUERY_CHUNK_FULLTEXT, {
        indexName,
        luceneQuery,
        snapshotId,
        limit: neo4j.int(limit),
      });

      return res.records.map((r) => ({
        type: 'chunk',
        id: r.get('chunkKey'),
        score: r.get('score'),
        modalitiesContributed: ['fulltext'],
        sourceDocumentId: r.get('sourceDocumentId'),
        sourceDocumentTitle: r.get('sourceDocumentTitle'),
        sectionAnchor: (r.get('headingPath') || []).join(' > '),
        lineStart: r.get('lineStart')?.toNumber ? r.get('lineStart').toNumber() : r.get('lineStart'),
        lineEnd: r.get('lineEnd')?.toNumber ? r.get('lineEnd').toNumber() : r.get('lineEnd'),
        rawSnippet: r.get('rawSnippet'),
        publishedContentHash: r.get('publishedContentHash'),
        snapshotId,
        hasConflict: false,
      }));
    } finally {
      await session.close();
    }
  }

  async queryVector(snapshotId: string, queryVector: readonly number[], limit: number): Promise<ChunkItem[]> {
    const meta = this.localGenerationMetadata.get(snapshotId);
    const token = deriveGenerationToken(snapshotId);
    const indexName = meta?.vectorIndexName || `chunk_vector_${token}`;

    const session = this.getSession();
    try {
      const res = await session.run(CYPHER_QUERIES.QUERY_CHUNK_VECTOR, {
        indexName,
        limit: neo4j.int(limit),
        queryEmbedding: [...queryVector],
        snapshotId,
      });

      return res.records.map((r) => ({
        type: 'chunk',
        id: r.get('chunkKey'),
        score: r.get('score'),
        modalitiesContributed: ['vector'],
        sourceDocumentId: r.get('sourceDocumentId'),
        sourceDocumentTitle: r.get('sourceDocumentTitle'),
        sectionAnchor: (r.get('headingPath') || []).join(' > '),
        lineStart: r.get('lineStart')?.toNumber ? r.get('lineStart').toNumber() : r.get('lineStart'),
        lineEnd: r.get('lineEnd')?.toNumber ? r.get('lineEnd').toNumber() : r.get('lineEnd'),
        rawSnippet: r.get('rawSnippet'),
        publishedContentHash: r.get('publishedContentHash'),
        snapshotId,
        hasConflict: false,
      }));
    } finally {
      await session.close();
    }
  }

  async queryChunksByDocument(
    snapshotId: string,
    documentIds: readonly string[],
    limit: number
  ): Promise<ChunkItem[]> {
    if (documentIds.length === 0) return [];
    const session = this.getSession();
    try {
      const res = await session.run(CYPHER_QUERIES.QUERY_CHUNKS_BY_DOCUMENT, {
        snapshotId,
        documentIds: [...documentIds],
        limit: neo4j.int(limit),
      });

      return res.records.map((r) => ({
        type: 'chunk',
        id: r.get('chunkKey'),
        score: r.get('score'),
        modalitiesContributed: ['graph'],
        sourceDocumentId: r.get('sourceDocumentId'),
        sourceDocumentTitle: r.get('sourceDocumentTitle'),
        sectionAnchor: (r.get('headingPath') || []).join(' > '),
        lineStart: r.get('lineStart')?.toNumber ? r.get('lineStart').toNumber() : r.get('lineStart'),
        lineEnd: r.get('lineEnd')?.toNumber ? r.get('lineEnd').toNumber() : r.get('lineEnd'),
        rawSnippet: r.get('rawSnippet'),
        publishedContentHash: r.get('publishedContentHash'),
        snapshotId,
        hasConflict: false,
      }));
    } finally {
      await session.close();
    }
  }

  async cleanupSupersededGenerations(now: number = Date.now()): Promise<number> {
    const cutoffEpoch = now - RETRIEVAL_GENERATION_GRACE_MS;
    const session = this.getSession();
    let cleaned = 0;

    try {
      const candidates = await session.run(CYPHER_QUERIES.FIND_SUPERSEDED_FOR_CLEANUP, {
        cutoffEpoch,
      });

      for (const rec of candidates.records) {
        const graphSnapshotId = rec.get('graphSnapshotId');
        const ftIndex = rec.get('fulltextIndexName');
        const vecIndex = rec.get('vectorIndexName');

        // Drop indexes safely
        if (ftIndex) {
          try {
            await session.run(`DROP INDEX \`${ftIndex}\` IF EXISTS`);
          } catch {
            // Ignore if index missing
          }
        }
        if (vecIndex) {
          try {
            await session.run(`DROP INDEX \`${vecIndex}\` IF EXISTS`);
          } catch {
            // Ignore if index missing
          }
        }

        // Detach delete generation chunks and mark snapshot DELETED
        await session.run(CYPHER_QUERIES.DELETE_GENERATION_DATA, { graphSnapshotId });
        this.localGenerationMetadata.delete(graphSnapshotId);
        cleaned++;
      }

      return cleaned;
    } finally {
      await session.close();
    }
  }

  /**
   * D-09: Confirms the pinned snapshot's embedding generation matches the query provider.
   * Dimension mismatch => vector modality must degrade (MODEL_INDEX_MISMATCH).
   * ponytail: compares dimensions only; add provider/model/revision match when
   *   multiple e5 variants coexist in one deployment.
   */
  async validateVectorIndexMetadata(
    snapshotId: string,
    metadata: EmbeddingProviderMetadata
  ): Promise<boolean> {
    const cached = this.localGenerationMetadata.get(snapshotId)?.embeddingMetadata;
    if (cached) {
      return cached.dimensions === metadata.dimensions;
    }

    const session = this.getSession();
    try {
      const res = await session.run(CYPHER_QUERIES.GET_GENERATION_META_BY_SNAPSHOT, { snapshotId });
      if (res.records.length === 0) return false;
      const json = res.records[0]!.get('embeddingMetadataJson');
      const hasVectors = res.records[0]!.get('hasVectors');
      if (!hasVectors || !json) return false;
      try {
        const parsed = JSON.parse(json) as Partial<EmbeddingProviderMetadata>;
        return parsed.dimensions === metadata.dimensions;
      } catch {
        return false;
      }
    } finally {
      await session.close();
    }
  }

  /**
   * D-04/D-05: Resolves raw query tokens to candidate entities in the pinned snapshot.
   * Enables clarification when a token maps to multiple entities.
   */
  async resolveEntities(
    snapshotId: string,
    queryTokens: readonly string[],
    options?: OperationOptions
  ): Promise<ClarificationCandidate[]> {
    if (options?.signal?.aborted) throw new Error('Entity resolution aborted');
    if (queryTokens.length === 0) return [];

    const session = this.getSession();
    const onAbort = () => {
      session.close().catch(() => {});
    };
    if (options?.signal) {
      options.signal.addEventListener('abort', onAbort, { once: true });
    }
    try {
      const res = await session.run(CYPHER_QUERIES.RESOLVE_ENTITIES, {
        snapshotId,
        tokens: [...queryTokens],
      });
      return res.records.map((r) => ({
        urn: r.get('urn'),
        canonicalName: r.get('canonicalName'),
        kind: r.get('kind') as NodeKind,
      }));
    } finally {
      if (options?.signal) {
        options.signal.removeEventListener('abort', onAbort);
      }
      await session.close();
    }
  }

  /**
   * Plan-driven multi-hop traversal matching LogicalQueryPlan.traversalSteps.
   * Uses static per-step Cypher and composes only complete connected paths.
   */
  async traverse(
    snapshotId: string,
    criteria: GraphTraversalCriteria,
    options?: OperationOptions
  ): Promise<GraphTraversalResult> {
    if (options?.signal?.aborted) throw new Error('Graph traversal aborted');
    if (criteria.seedUrns.length === 0) {
      return { chunks: [], entities: [], edges: [], paths: [], truncated: false };
    }

    const steps = criteria.plan.traversalSteps.length > 0
      ? criteria.plan.traversalSteps
      : [{ relationType: 'CONTAINS_STEP' as RelationType, direction: 'OUTGOING' as const, maxHops: 1 }];
    if (steps.length > criteria.plan.overallMaxDepth) {
      return { chunks: [], entities: [], edges: [], paths: [], truncated: false };
    }

    type RawNode = {
      urn: Urn;
      canonicalName?: string;
      kind?: NodeKind;
      firstSeenInDoc?: string;
    };
    type RawChunk = {
      chunkId: string;
      sourceDocumentId: string;
      sourceDocumentTitle: string;
      publishedContentHash: string;
      headingPath?: string[];
      lineStart: number | { toNumber(): number };
      lineEnd: number | { toNumber(): number };
      rawSnippet: string;
    };
    type RawEdge = {
      factKey: string;
      subjectUrn: Urn;
      relationType: RelationType;
      objectUrn: Urn;
      evidenceClass: EvidenceClassification;
      hasConflict?: boolean;
      supportingChunks: RawChunk[];
      graphSnapshotId: string;
    };
    type PartialPath = { nodes: RawNode[]; edges: RawEdge[] };
    const toRawEdge = (edge: any): RawEdge => ({
      ...edge,
      supportingChunks: Array.isArray(edge.supportingChunks) ? edge.supportingChunks : [],
    });

    const session = this.getSession();
    const onAbort = () => {
      session.close().catch(() => {});
    };
    if (options?.signal) {
      options.signal.addEventListener('abort', onAbort, { once: true });
    }
    const evidenceClasses = criteria.evidenceClasses.length > 0
      ? [...criteria.evidenceClasses]
      : ['OBSERVED', 'BUSINESS_APPROVED'];
    let frontier: PartialPath[] = criteria.seedUrns.map((urn) => ({ nodes: [{ urn }], edges: [] }));
    let isTruncated = false;

    try {
      for (const step of steps) {
        if (options?.signal?.aborted) throw new Error('Graph traversal aborted');
        const query = STATIC_TRAVERSAL_QUERIES[`${step.relationType}:${step.direction}:${step.maxHops}`];
        if (!query) return { chunks: [], entities: [], edges: [], paths: [], truncated: false };

        const activeSeeds = [...new Set(frontier.map((path) => path.nodes.at(-1)?.urn).filter(Boolean))];
        if (activeSeeds.length === 0) break;
        const res = await session.run(query, {
          snapshotId,
          seedUrns: activeSeeds,
          evidenceClasses,
          pathLimit: neo4j.int(51),
          maxEdges: neo4j.int(criteria.limitEdges),
        });

        const records = [...res.records];

        const segmentsBySeed = new Map<string, PartialPath[]>();
        for (const record of records) {
          const nodes = (record.get('pathNodes') as RawNode[] | null) ?? [];
          const edges = ((record.get('pathEdges') as any[] | null) ?? []).map(toRawEdge);
          // A path record with no edges carries no relation segment; the seed itself
          // is preserved separately via resolveEntities below.
          if (nodes.length !== edges.length + 1 || edges.length < 1) continue;
          if (step.targetKind) {
            const target = nodes.at(-1);
            if (target?.kind !== step.targetKind) continue;
          }
          if (
            edges.some(
              (edge) =>
                edge.graphSnapshotId !== snapshotId ||
                edge.supportingChunks.length === 0 ||
                !evidenceClasses.includes(edge.evidenceClass)
            )
          ) continue;
          const seedUrn = nodes[0]?.urn;
          if (!seedUrn) continue;
          const segments = segmentsBySeed.get(seedUrn) ?? [];
          segments.push({ nodes, edges });
          segmentsBySeed.set(seedUrn, segments);
        }

        const next = new Map<string, PartialPath>();
        const completed = new Map<string, PartialPath>();
        for (const partial of frontier) {
          const endpoint = partial.nodes.at(-1)?.urn;
          if (!endpoint) continue;
          const candidateSegments = (segmentsBySeed.get(endpoint) ?? []).filter((segment) => {
            const visited = new Set(partial.nodes.map((node) => node.urn));
            return !segment.nodes.slice(1).some((node) => visited.has(node.urn));
          });

          if (candidateSegments.length === 0 && partial.edges.length > 0) {
            const key = JSON.stringify([
              partial.nodes.map((node) => node.urn),
              partial.edges.map((edge) => edge.factKey),
            ]);
            completed.set(key, partial);
            continue;
          }

          for (const segment of candidateSegments) {
            const nodes = partial.edges.length === 0
              ? segment.nodes
              : [...partial.nodes, ...segment.nodes.slice(1)];
            const edges = [...partial.edges, ...segment.edges];
            if (edges.length > criteria.plan.overallMaxDepth) continue;
            const key = JSON.stringify([
              nodes.map((node) => node.urn),
              edges.map((edge) => edge.factKey),
            ]);
            next.set(key, { nodes, edges });
          }
        }

        const combined = new Map([...completed.entries(), ...next.entries()]);
        const sorted = [...combined.entries()].sort(([a], [b]) => a.localeCompare(b));
        if (sorted.length > 50) isTruncated = true;
        frontier = sorted.slice(0, 50).map(([, path]) => path);
        if (next.size === 0 && frontier.length > 0) break;
        if (frontier.length === 0) break;
      }

      // Seeds are resolved independently of path completion so a seed with zero
      // matching edges still reaches the response (D-01, T-24-05). Relation
      // selection stays planning-owned; no ad-hoc compensation runs here.
      const seedCandidates = await this.resolveEntities(
        snapshotId,
        [...new Set(criteria.seedUrns)],
        options
      );
      const seedByUrn = new Map(seedCandidates.map((candidate) => [candidate.urn, candidate]));

      const entityByUrn = new Map<string, EntityItem>();
      const edgeByKey = new Map<string, EdgeItem>();
      const chunkById = new Map<string, ChunkItem>();
      const pathRecords: GraphTraversalPathRecord[] = [];

      for (const path of frontier) {
        const newNodeCount = path.nodes.filter((node) => !entityByUrn.has(node.urn)).length;
        const newEdgeCount = path.edges.filter((edge) => !edgeByKey.has(edge.factKey)).length;
        if (
          entityByUrn.size + newNodeCount > criteria.limitNodes ||
          edgeByKey.size + newEdgeCount > criteria.limitEdges
        ) {
          isTruncated = true;
          continue;
        }

        for (const node of path.nodes) {
          if (!entityByUrn.has(node.urn)) {
            const seed = seedByUrn.get(node.urn);
            const kind = node.kind ?? seed?.kind;
            if (!kind) continue;
            entityByUrn.set(node.urn, {
              type: 'entity',
              id: node.urn,
              score: 1,
              modalitiesContributed: ['graph'],
              urn: node.urn,
              canonicalName: node.canonicalName || seed?.canonicalName || node.urn,
              kind,
              snapshotId,
              ...(node.firstSeenInDoc ? { firstSeenInDoc: node.firstSeenInDoc } : {}),
              hasConflict: false,
            });
          }
        }

        for (const edge of path.edges) {
          const supportingChunkIds = edge.supportingChunks.map((chunk) => chunk.chunkId);
          if (!edgeByKey.has(edge.factKey)) {
            edgeByKey.set(edge.factKey, {
              type: 'edge',
              id: edge.factKey,
              score: 1,
              modalitiesContributed: ['graph'],
              factKey: edge.factKey,
              sourceUrn: edge.subjectUrn,
              relationType: edge.relationType,
              targetUrn: edge.objectUrn,
              evidenceClass: edge.evidenceClass,
              supportingChunkIds,
              snapshotId,
              hasConflict: Boolean(edge.hasConflict),
            });
          }
          for (const chunk of edge.supportingChunks) {
            if (!chunkById.has(chunk.chunkId)) {
              chunkById.set(chunk.chunkId, {
                type: 'chunk',
                id: chunk.chunkId,
                score: 1,
                modalitiesContributed: ['graph'],
                sourceDocumentId: chunk.sourceDocumentId,
                sourceDocumentTitle: chunk.sourceDocumentTitle,
                sectionAnchor: (chunk.headingPath ?? []).join(' > '),
                lineStart: toSafeInt(chunk.lineStart),
                lineEnd: toSafeInt(chunk.lineEnd),
                rawSnippet: chunk.rawSnippet,
                publishedContentHash: chunk.publishedContentHash,
                snapshotId,
                hasConflict: Boolean(edge.hasConflict),
              });
            }
          }
        }

        pathRecords.push({
          nodeUrns: path.nodes.map((node) => node.urn),
          edgeFactKeys: path.edges.map((edge) => edge.factKey),
          hopClassifications: path.edges.map((edge) => edge.evidenceClass),
          hopSupportingChunkIds: path.edges.map((edge) => edge.supportingChunks.map((chunk) => chunk.chunkId)),
          edgeSnapshotIds: path.edges.map((edge) => edge.graphSnapshotId),
          hasConflict: path.edges.some((edge) => Boolean(edge.hasConflict)),
        });
      }

      // Seeds always survive, even when every path from them was empty or dropped.
      const seedEntities: EntityItem[] = [];
      for (const urn of criteria.seedUrns) {
        const seed = seedByUrn.get(urn);
        if (!seed) continue;
        let entity = entityByUrn.get(seed.urn);
        if (!entity) {
          if (entityByUrn.size >= criteria.limitNodes) {
            isTruncated = true;
            continue;
          }
          entity = {
            type: 'entity',
            id: seed.urn,
            score: 1,
            modalitiesContributed: ['graph'],
            urn: seed.urn,
            canonicalName: seed.canonicalName,
            kind: seed.kind,
            snapshotId,
            hasConflict: false,
          };
          entityByUrn.set(seed.urn, entity);
        }
        seedEntities.push(entity);
      }

      const result = {
        chunks: [...chunkById.values()],
        entities: [...entityByUrn.values()],
        seedEntities,
        edges: [...edgeByKey.values()],
        paths: pathRecords,
        truncated: isTruncated,
      };
      return isTruncated ? { ...result, truncationReason: 'RESULT_LIMIT_REACHED' } : result;
    } finally {
      if (options?.signal) {
        options.signal.removeEventListener('abort', onAbort);
      }
      await session.close();
    }
  }

  async purgeSet(setId: string): Promise<boolean> {
    const session = this.getSession();
    try {
      // Find snapshots for set to drop their fulltext/vector indexes
      const res = await session.run(
        `MATCH (s:GraphSnapshot {setId: $setId})
         RETURN s.graphSnapshotId AS graphSnapshotId,
                s.fulltextIndexName AS fulltextIndexName,
                s.vectorIndexName AS vectorIndexName`,
        { setId }
      );

      const snapshotIds: string[] = [];
      for (const rec of res.records) {
        const graphSnapshotId = rec.get('graphSnapshotId');
        if (graphSnapshotId) {
          snapshotIds.push(graphSnapshotId);
        }
        const ftIndex = rec.get('fulltextIndexName');
        const vecIndex = rec.get('vectorIndexName');
        if (ftIndex) {
          try {
            await session.run(`DROP INDEX \`${ftIndex}\` IF EXISTS`);
          } catch {
            // Ignore missing index
          }
        }
        if (vecIndex) {
          try {
            await session.run(`DROP INDEX \`${vecIndex}\` IF EXISTS`);
          } catch {
            // Ignore missing index
          }
        }
        if (graphSnapshotId) {
          this.localGenerationMetadata.delete(graphSnapshotId);
        }
      }

      const setRes = await session.run(
        `MATCH (set:GraphSet {setId: $setId}) RETURN set.setId AS setId`,
        { setId }
      );
      const leaseRes = await session.run(
        `MATCH (l:RetrievalLease {setId: $setId}) RETURN count(l) AS leaseCount`,
        { setId }
      );
      const rawLeaseCount = leaseRes.records[0]?.get('leaseCount');
      const leaseCount = typeof rawLeaseCount?.toNumber === 'function'
        ? rawLeaseCount.toNumber()
        : Number(rawLeaseCount ?? 0);

      const hadData = snapshotIds.length > 0 || setRes.records.length > 0 || leaseCount > 0;

      // Detach and delete without Cartesian product (separate scoped deletes per node type)
      await session.executeWrite(async (tx) => {
        if (snapshotIds.length > 0) {
          await tx.run(
            `MATCH (ev:Evidence) WHERE ev.graphSnapshotId IN $snapshotIds DETACH DELETE ev`,
            { snapshotIds }
          );
          await tx.run(
            `MATCH (co:Conflict) WHERE co.graphSnapshotId IN $snapshotIds DETACH DELETE co`,
            { snapshotIds }
          );
          await tx.run(
            `MATCH (f:Fact) WHERE f.graphSnapshotId IN $snapshotIds DETACH DELETE f`,
            { snapshotIds }
          );
          await tx.run(
            `MATCH (e:Entity) WHERE e.graphSnapshotId IN $snapshotIds DETACH DELETE e`,
            { snapshotIds }
          );
          await tx.run(
            `MATCH (c:Chunk) WHERE c.graphSnapshotId IN $snapshotIds DETACH DELETE c`,
            { snapshotIds }
          );
          await tx.run(
            `MATCH (s:GraphSnapshot) WHERE s.graphSnapshotId IN $snapshotIds DETACH DELETE s`,
            { snapshotIds }
          );
        }

        await tx.run(
          `MATCH (l:RetrievalLease {setId: $setId}) DETACH DELETE l`,
          { setId }
        );
        await tx.run(
          `MATCH (s:GraphSnapshot {setId: $setId}) DETACH DELETE s`,
          { setId }
        );
        await tx.run(
          `MATCH (set:GraphSet {setId: $setId}) DETACH DELETE set`,
          { setId }
        );
      });

      return hadData;
    } finally {
      await session.close();
    }
  }
}
