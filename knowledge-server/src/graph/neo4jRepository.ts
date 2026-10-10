import neo4j, { Driver, Session } from 'neo4j-driver';
import {
  ActiveGraphView,
  FactDetail,
  GraphCandidate,
  QuarantinedIdentifier,
  RelationType,
} from '../types/graphProtocol.js';
import { GraphRepository } from './graphRepository.js';

export interface Neo4jRepositoryOptions {
  uri: string;
  user?: string;
  password?: string;
  database?: string;
  driver?: Driver;
}

/**
 * Static parameterized Cypher query definitions per T-17-04.
 * Zero string interpolation or dynamic clauses to prevent Cypher injection.
 */
export const CYPHER_QUERIES = {
  CREATE_CONSTRAINTS: [
    `CREATE CONSTRAINT entity_instance_key IF NOT EXISTS FOR (e:Entity) REQUIRE e.instanceKey IS UNIQUE`,
    `CREATE CONSTRAINT fact_instance_key IF NOT EXISTS FOR (f:Fact) REQUIRE f.instanceKey IS UNIQUE`,
    `CREATE CONSTRAINT snapshot_id IF NOT EXISTS FOR (s:GraphSnapshot) REQUIRE s.graphSnapshotId IS UNIQUE`,
  ] as const,

  INSERT_GRAPH_SNAPSHOT: `
    MERGE (s:GraphSnapshot {graphSnapshotId: $graphSnapshotId})
    SET s.sourceSnapshotId = $sourceSnapshotId,
        s.setId = $setId,
        s.ontologyVersion = $ontologyVersion,
        s.normalizedProjectionHash = $normalizedProjectionHash,
        s.state = 'READY',
        s.createdAt = $createdAt
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

  ACTIVATE_CANDIDATE: `
    MERGE (set:GraphSet {setId: $setId})
    WITH set
    MATCH (candidate:GraphSnapshot {graphSnapshotId: $graphSnapshotId, setId: $setId, state: 'READY'})
    OPTIONAL MATCH (set)-[old:ACTIVE_GRAPH]->(previous:GraphSnapshot)
    DELETE old
    FOREACH (_ IN CASE WHEN previous IS NULL THEN [] ELSE [1] END |
      SET previous.state = 'SUPERSEDED'
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
           s.activatedAt AS activatedAt
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

export class Neo4jRepository implements GraphRepository {
  private driver: Driver;
  private database?: string;
  private ownDriver: boolean = false;
  private quarantinesBySnapshot = new Map<string, QuarantinedIdentifier[]>();

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
    } finally {
      await session.close();
    }
  }

  async writeCandidate(candidate: GraphCandidate): Promise<void> {
    const session = this.getSession();
    try {
      await session.executeWrite(async (tx) => {
        // 1. Insert snapshot record
        await tx.run(CYPHER_QUERIES.INSERT_GRAPH_SNAPSHOT, {
          graphSnapshotId: candidate.graphSnapshotId,
          sourceSnapshotId: candidate.sourceSnapshotId,
          setId: candidate.setId,
          ontologyVersion: candidate.ontologyVersion,
          normalizedProjectionHash: candidate.normalizedProjectionHash,
          createdAt: candidate.createdAt,
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

  async activateCandidate(setId: string, graphSnapshotId: string): Promise<void> {
    const session = this.getSession();
    try {
      await session.executeWrite(async (tx) => {
        const result = await tx.run(CYPHER_QUERIES.ACTIVATE_CANDIDATE, {
          setId,
          graphSnapshotId,
          activatedAt: new Date().toISOString(),
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
      return {
        setId: record.get('setId'),
        graphSnapshotId: record.get('graphSnapshotId'),
        sourceSnapshotId: record.get('sourceSnapshotId'),
        ontologyVersion: record.get('ontologyVersion'),
        normalizedProjectionHash: record.get('normalizedProjectionHash'),
        activatedAt: record.get('activatedAt'),
        nodeCount: 0,
        relationCount: 0,
        factCount: 0,
        conflictCount: 0,
        quarantineCount: 0,
        approvedFactCount: 0,
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
    return this.quarantinesBySnapshot.get(graphSnapshotId) || [];
  }
}
