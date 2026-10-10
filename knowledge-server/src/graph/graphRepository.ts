import {
  ActiveGraphView,
  FactDetail,
  GraphCandidate,
  QuarantinedIdentifier,
} from '../types/graphProtocol.js';

/**
 * Graph Repository contract defining operations against the projected graph.
 */
export interface GraphRepository {
  /**
   * Writes candidate graph nodes, facts, evidence occurrences, conflicts, and quarantines in isolation.
   */
  writeCandidate(candidate: GraphCandidate): Promise<void>;

  /**
   * Atomically switches the set's active graph pointer to the specified graph snapshot.
   */
  activateCandidate(setId: string, graphSnapshotId: string): Promise<void>;

  /**
   * Retrieves the current active graph metadata for a document set.
   */
  getActiveGraph(setId: string): Promise<ActiveGraphView | null>;

  /**
   * Retrieves all projected facts and their provenance details for a given graph snapshot.
   */
  getFacts(graphSnapshotId: string): Promise<FactDetail[]>;

  /**
   * Retrieves all quarantined identifiers captured during extraction for a given graph snapshot.
   */
  getQuarantines(graphSnapshotId: string): Promise<QuarantinedIdentifier[]>;
}

/**
 * In-memory Graph Repository for fast offline unit tests without requiring live Neo4j daemon.
 */
export class InMemoryGraphRepository implements GraphRepository {
  private candidates = new Map<string, GraphCandidate>();
  private activeGraphPointers = new Map<string, string>(); // setId -> graphSnapshotId
  private activeViews = new Map<string, ActiveGraphView>(); // setId -> ActiveGraphView

  async writeCandidate(candidate: GraphCandidate): Promise<void> {
    this.candidates.set(candidate.graphSnapshotId, candidate);
  }

  async activateCandidate(setId: string, graphSnapshotId: string): Promise<void> {
    const candidate = this.candidates.get(graphSnapshotId);
    if (!candidate) {
      throw new Error(`Candidate ${graphSnapshotId} not found`);
    }
    if (candidate.setId !== setId) {
      throw new Error(`Candidate setId ${candidate.setId} does not match target ${setId}`);
    }

    this.activeGraphPointers.set(setId, graphSnapshotId);

    const approvedCount = candidate.relations.filter(
      (r) => r.effectiveClassification === 'BUSINESS_APPROVED'
    ).length;

    const view: ActiveGraphView = {
      setId,
      graphSnapshotId,
      sourceSnapshotId: candidate.sourceSnapshotId,
      ontologyVersion: candidate.ontologyVersion,
      normalizedProjectionHash: candidate.normalizedProjectionHash,
      activatedAt: new Date().toISOString(),
      nodeCount: candidate.nodes.length,
      relationCount: candidate.relations.length,
      factCount: candidate.relations.length,
      conflictCount: candidate.conflicts.length,
      quarantineCount: candidate.quarantines.length,
      approvedFactCount: approvedCount,
    };

    this.activeViews.set(setId, view);
  }

  async getActiveGraph(setId: string): Promise<ActiveGraphView | null> {
    return this.activeViews.get(setId) || null;
  }

  async getFacts(graphSnapshotId: string): Promise<FactDetail[]> {
    const candidate = this.candidates.get(graphSnapshotId);
    if (!candidate) return [];

    const evidenceByFactKey = new Map<string, typeof candidate.evidence>();
    for (const ev of candidate.evidence) {
      const list = evidenceByFactKey.get(ev.factKey) || [];
      list.push(ev);
      evidenceByFactKey.set(ev.factKey, list);
    }

    const conflictsByFactKey = new Map<string, typeof candidate.conflicts>();
    for (const conf of candidate.conflicts) {
      const listA = conflictsByFactKey.get(conf.factKeyA) || [];
      listA.push(conf);
      conflictsByFactKey.set(conf.factKeyA, listA);

      const listB = conflictsByFactKey.get(conf.factKeyB) || [];
      listB.push(conf);
      conflictsByFactKey.set(conf.factKeyB, listB);
    }

    const approvalsByFactKey = new Map<string, typeof candidate.approvals>();
    for (const app of candidate.approvals) {
      const list = approvalsByFactKey.get(app.factKey) || [];
      list.push(app);
      approvalsByFactKey.set(app.factKey, list);
    }

    return candidate.relations.map((relation) => ({
      relation,
      evidence: evidenceByFactKey.get(relation.factKey) || [],
      conflicts: conflictsByFactKey.get(relation.factKey) || [],
      approvals: approvalsByFactKey.get(relation.factKey) || [],
    }));
  }

  async getQuarantines(graphSnapshotId: string): Promise<QuarantinedIdentifier[]> {
    const candidate = this.candidates.get(graphSnapshotId);
    return candidate ? [...candidate.quarantines] : [];
  }
}
