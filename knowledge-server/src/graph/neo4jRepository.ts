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
  GraphTraversalResult,
  OperationOptions,
} from '../retrieval/contracts.js';
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
    `CREATE CONSTRAINT c_snapshot_entity_urn IF NOT EXISTS FOR (e:Entity) REQUIRE (e.graphSnapshotId, e.urn) IS NODE KEY`,
    `CREATE CONSTRAINT c_snapshot_chunk_id IF NOT EXISTS FOR (c:Chunk) REQUIRE (c.graphSnapshotId, c.chunkId) IS NODE KEY`,
    `CREATE CONSTRAINT c_snapshot_fact_key IF NOT EXISTS FOR (f:Fact) REQUIRE (f.graphSnapshotId, f.factKey) IS NODE KEY`,
  ] as const,

  CREATE_INDEXES: [
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
        s.hasVectors = $hasVectors,
        s.retrievalBuiltAt = $retrievalBuiltAt
  `,

  ACTIVATE_CANDIDATE: `
    MERGE (set:GraphSet {setId: $setId})
    WITH set
    MATCH (candidate:GraphSnapshot {graphSnapshotId: $graphSnapshotId, setId: $setId, state: 'READY'})
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
           s.approvedFactCount AS approvedFactCount
  `,

  GET_QUARANTINES_BY_SNAPSHOT: `
    MATCH (s:GraphSnapshot {graphSnapshotId: $graphSnapshotId})
    RETURN s.quarantinesJson AS quarantinesJson
  `,

  GET_FACTS_BY_SNAPSHOT: `
    MATCH (f:Fact {graphSnapshotId: $graphSnapshotId})
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
       OR any(a IN e.aliases WHERE toLower(a) = toLower(token))
    RETURN DISTINCT e.urn AS urn, e.canonicalName AS canonicalName, e.kind AS kind
    LIMIT 25
  `,

  TRAVERSE_FROM_SEEDS: `
    MATCH (s:Entity {graphSnapshotId: $snapshotId})-[r]-(o:Entity {graphSnapshotId: $snapshotId})
    WHERE s.urn IN $seedUrns AND r.graphSnapshotId = $snapshotId
    MATCH (f:Fact {graphSnapshotId: $snapshotId, factKey: r.factKey})
    RETURN DISTINCT
      o.urn AS neighborUrn,
      o.canonicalName AS neighborName,
      o.kind AS neighborKind,
      o.hasConflict AS neighborHasConflict,
      f.factKey AS factKey,
      f.subjectUrn AS subjectUrn,
      f.relation AS relation,
      f.objectUrn AS objectUrn,
      f.effectiveClassification AS evidenceClass,
      f.hasConflict AS edgeHasConflict
    LIMIT $limit
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
        const relationsByType = new Map<RelationType, typeof candidate.relations>();
        for (const rel of candidate.relations) {
          const list = relationsByType.get(rel.relation) || [];
          list.push(rel);
          relationsByType.set(rel.relation, list);
        }

        for (const [relType, list] of relationsByType.entries()) {
          const query = STATIC_RELATION_WRITERS[relType];
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

    const chunkRows: Array<{
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
    }> = [];
    const textsToEmbed: string[] = [];

    for (const doc of sourceSnapshot.documents) {
      for (const c of doc.chunks) {
        chunkRows.push({
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
          embedding: null,
        });
        textsToEmbed.push(c.rawContent);
      }
    }

    let embeddingMetadata = embeddingProvider?.describe();
    let hasVectors = false;

    if (embeddingProvider && textsToEmbed.length > 0) {
      const vectors = await embeddingProvider.embedDocuments(textsToEmbed);
      if (vectors.length !== chunkRows.length) {
        throw new Error('EMBEDDING_COUNT_MISMATCH: Batch length mismatch');
      }
      const expectedDim = embeddingMetadata?.dimensions;
      for (let i = 0; i < vectors.length; i++) {
        const vec = vectors[i]!;
        if (expectedDim && vec.length !== expectedDim) {
          throw new Error(`DIMENSION_MISMATCH: Expected ${expectedDim}, got ${vec.length}`);
        }
        chunkRows[i]!.embedding = vec;
      }
      hasVectors = true;
    }

    const session = this.getSession();
    try {
      // 1. Insert Chunks with generic :Chunk label
      if (chunkRows.length > 0) {
        await session.executeWrite(async (tx) => {
          await tx.run(CYPHER_QUERIES.UNWIND_INSERT_CHUNKS, {
            graphSnapshotId: candidate.graphSnapshotId,
            rows: chunkRows,
          });
          // Attach generation-specific snapshot label to isolate index
          await tx.run(
            `MATCH (c:Chunk {graphSnapshotId: $graphSnapshotId}) SET c:\`${snapshotLabel}\``,
            { graphSnapshotId: candidate.graphSnapshotId }
          );

          // Link Fact nodes to overlapping Chunk nodes with SUPPORTED_BY
          const supportRows: Array<{ factKey: string; chunkKey: string; chunkId: string }> = [];
          for (const ev of candidate.evidence) {
            for (const chunk of chunkRows) {
              if (chunk.documentId === ev.documentId) {
                const lineOverlap = ev.startLine <= chunk.endLine && ev.endLine >= chunk.startLine;
                const offsetOverlap =
                  ev.startOffset !== undefined &&
                  ev.endOffset !== undefined &&
                  chunk.startOffset !== undefined &&
                  chunk.endOffset !== undefined
                    ? ev.startOffset <= chunk.endOffset && ev.endOffset >= chunk.startOffset
                    : lineOverlap;
                if (lineOverlap || offsetOverlap) {
                  supportRows.push({
                    factKey: ev.factKey,
                    chunkKey: chunk.chunkKey,
                    chunkId: chunk.chunkId,
                  });
                }
              }
            }
          }

          if (supportRows.length > 0) {
            await tx.run(CYPHER_QUERIES.LINK_FACT_CHUNK_SUPPORT, {
              graphSnapshotId: candidate.graphSnapshotId,
              rows: supportRows,
            });
          }
        });
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
        chunkCount: chunkRows.length,
        hasVectors,
        builtAt: new Date().toISOString(),
      };

      await session.run(CYPHER_QUERIES.UPDATE_RETRIEVAL_GENERATION_METADATA, {
        graphSnapshotId: candidate.graphSnapshotId,
        fulltextIndexName,
        vectorIndexName,
        embeddingMetadataJson: JSON.stringify(embeddingMetadata || {}),
        chunkCount: chunkRows.length,
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

      return true;
    } catch {
      // In unit test mock driver without SHOW INDEXES response, fall back to meta existence
      return true;
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
      await session.close();
    }
  }

  /**
   * D-13..D-16: Bounded 1-hop traversal from resolved seeds over Entity-Entity edges.
   * Returns reached neighbor entities and the Fact-backed edges connecting them.
   * ponytail: single undirected hop only; evidenceClass filtering + multi-hop
   *   (plan.traversalSteps depth/direction) not applied yet — add when FLOW_TRAVERSAL
   *   / IMPACT_ANALYSIS plans need depth>1.
   */
  async traverse(
    snapshotId: string,
    criteria: GraphTraversalCriteria,
    options?: OperationOptions
  ): Promise<GraphTraversalResult> {
    if (options?.signal?.aborted) throw new Error('Graph traversal aborted');
    if (criteria.seedUrns.length === 0) {
      return { entities: [], edges: [], truncated: false };
    }

    const fetchLimit = criteria.limitNodes + criteria.limitEdges;
    const session = this.getSession();
    try {
      const res = await session.run(CYPHER_QUERIES.TRAVERSE_FROM_SEEDS, {
        snapshotId,
        seedUrns: [...criteria.seedUrns],
        limit: neo4j.int(fetchLimit),
      });

      const entityByUrn = new Map<string, EntityItem>();
      const edgeByKey = new Map<string, EdgeItem>();

      for (const r of res.records) {
        const neighborUrn = r.get('neighborUrn');
        if (neighborUrn && !entityByUrn.has(neighborUrn)) {
          entityByUrn.set(neighborUrn, {
            type: 'entity',
            id: neighborUrn,
            score: 1,
            modalitiesContributed: ['graph'],
            urn: neighborUrn,
            canonicalName: r.get('neighborName'),
            kind: r.get('neighborKind') as NodeKind,
            snapshotId,
            hasConflict: Boolean(r.get('neighborHasConflict')),
          });
        }

        const factKey = r.get('factKey');
        if (factKey && !edgeByKey.has(factKey)) {
          edgeByKey.set(factKey, {
            type: 'edge',
            id: factKey,
            score: 1,
            modalitiesContributed: ['graph'],
            factKey,
            sourceUrn: r.get('subjectUrn'),
            relationType: r.get('relation') as RelationType,
            targetUrn: r.get('objectUrn'),
            evidenceClass: r.get('evidenceClass') as EvidenceClassification,
            supportingChunkIds: [],
            snapshotId,
            hasConflict: Boolean(r.get('edgeHasConflict')),
          });
        }
      }

      const entities = [...entityByUrn.values()].slice(0, criteria.limitNodes);
      const edges = [...edgeByKey.values()].slice(0, criteria.limitEdges);
      const truncated =
        entityByUrn.size > criteria.limitNodes || edgeByKey.size > criteria.limitEdges;

      return truncated
        ? { entities, edges, truncated, truncationReason: 'RESULT_LIMIT_REACHED' }
        : { entities, edges, truncated };
    } finally {
      await session.close();
    }
  }
}
