import { randomUUID } from 'node:crypto';
import type { GraphRepository } from '../graph/graphRepository.js';
import { InMemoryGraphRepository } from '../graph/graphRepository.js';
import type { SnapshotStore } from '../indexing/snapshotStore.js';
import { extractDeterministicFacts } from '../graph/extraction.js';
import { mergeFactsDeterministicFirst } from '../graph/candidate.js';
import { ONTOLOGY_VERSION } from '../graph/ontology.js';
import type {
  GraphBuildStage,
  GraphState,
  GraphStatusDTO,
  FactsListDTO,
  FactEvidenceDetailDTO,
  QuarantineListDTO,
  RebuildAcceptedDTO,
  FactSummaryDTO,
  EvidenceRecordDTO,
  QuarantineItemDTO,
} from '../routes/graph.js';

export class GraphBuildInProgressError extends Error {
  readonly code = 'BUILD_IN_PROGRESS';
  constructor(message = 'Graph rebuild is already in progress for this document set.') {
    super(message);
    this.name = 'GraphBuildInProgressError';
  }
}

export interface GraphBuildServiceOptions {
  repository?: GraphRepository | undefined;
  snapshotStore?: SnapshotStore | undefined;
}

export class GraphBuildService {
  private inProgressSets = new Set<string>();
  private currentStages = new Map<string, GraphBuildStage>();
  private rebuildReplays = new Map<string, RebuildAcceptedDTO>(); // setId:rebuildKey -> DTO
  private activeGraphSnapshots = new Map<string, string>(); // setId -> graphSnapshotId
  private buildErrors = new Map<string, Error>(); // setId -> last error

  constructor(
    readonly repository: GraphRepository = new InMemoryGraphRepository(),
    readonly snapshotStore?: SnapshotStore | undefined
  ) {}

  isBuilding(setId: string): boolean {
    return this.inProgressSets.has(setId);
  }

  getCurrentStage(setId: string): GraphBuildStage | undefined {
    return this.currentStages.get(setId);
  }

  async triggerRebuild(setId: string, rebuildKey: string): Promise<RebuildAcceptedDTO> {
    const replayKey = `${setId}:${rebuildKey}`;
    const existing = this.rebuildReplays.get(replayKey);
    if (existing) {
      return existing;
    }

    if (this.inProgressSets.has(setId)) {
      throw new GraphBuildInProgressError(setId);
    }

    const candidateSnapshotId = randomUUID();
    const dto: RebuildAcceptedDTO = {
      setId,
      rebuildKey,
      status: 'ACCEPTED',
      candidateSnapshotId,
    };

    this.rebuildReplays.set(replayKey, dto);
    this.inProgressSets.add(setId);
    this.currentStages.set(setId, 'Preparing');
    this.buildErrors.delete(setId);

    // Run rebuild in background or await if invoked directly
    this.executeRebuild(setId, candidateSnapshotId).catch((err: unknown) => {
      this.buildErrors.set(setId, err instanceof Error ? err : new Error(String(err)));
    }).finally(() => {
      this.inProgressSets.delete(setId);
      this.currentStages.delete(setId);
    });

    return dto;
  }

  async executeRebuildSync(setId: string, candidateSnapshotId: string = randomUUID()): Promise<string> {
    if (this.inProgressSets.has(setId)) {
      throw new GraphBuildInProgressError(setId);
    }
    this.inProgressSets.add(setId);
    this.currentStages.set(setId, 'Preparing');
    this.buildErrors.delete(setId);

    try {
      await this.executeRebuild(setId, candidateSnapshotId);
      return candidateSnapshotId;
    } catch (err: unknown) {
      this.buildErrors.set(setId, err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      this.inProgressSets.delete(setId);
      this.currentStages.delete(setId);
    }
  }

  private async executeRebuild(setId: string, candidateSnapshotId: string): Promise<void> {
    if (!this.snapshotStore) {
      throw new Error('NO_SNAPSHOT_STORE');
    }

    // Stage a: Retrieve active published snapshot
    const sourceSnapshot = this.snapshotStore.getActiveSnapshot(setId);
    if (!sourceSnapshot) {
      throw new Error('NO_SOURCE_SNAPSHOT');
    }
    const frozenSourceSnapshotId = sourceSnapshot.snapshotId;

    // Stage b: Preparing
    this.currentStages.set(setId, 'Preparing');

    // Stage c: Structured extraction
    this.currentStages.set(setId, 'Structured extraction');
    const extractionResult = extractDeterministicFacts(sourceSnapshot);

    // Stage d: Prose extraction
    this.currentStages.set(setId, 'Prose extraction');
    // Bounded prose extraction placeholder for uncovered segments

    // Stage e: Validation
    this.currentStages.set(setId, 'Validation');
    const approvals = this.snapshotStore.getApprovals(setId);

    const candidate = mergeFactsDeterministicFirst({
      graphSnapshotId: candidateSnapshotId,
      sourceSnapshotId: frozenSourceSnapshotId,
      setId,
      ontologyVersion: ONTOLOGY_VERSION,
      nodes: extractionResult.nodes,
      deterministicFacts: extractionResult.facts,
      deterministicEvidence: extractionResult.evidence,
      approvals,
      quarantines: extractionResult.quarantines,
    });

    // Write candidate to repository with READY state
    await this.repository.writeCandidate(candidate);

    // Stage h: Stale-source guard
    const latestSnapshot = this.snapshotStore.getActiveSnapshot(setId);
    if (!latestSnapshot || latestSnapshot.snapshotId !== frozenSourceSnapshotId) {
      throw new Error('STALE_SOURCE_SNAPSHOT');
    }

    // Stage i: Activation - atomic pointer swap
    this.currentStages.set(setId, 'Activation');
    await this.repository.activateCandidate(setId, candidateSnapshotId);
    this.activeGraphSnapshots.set(setId, candidateSnapshotId);
  }

  private safeBuildError(error: Error): NonNullable<GraphStatusDTO['error']> {
    if (error.message === 'NO_SOURCE_SNAPSHOT') {
      return {
        code: 'NO_SOURCE_SNAPSHOT',
        message: 'Bộ tài liệu chưa có bản xuất bản hoàn chỉnh trên máy chủ.',
      };
    }
    if (error.message === 'STALE_SOURCE_SNAPSHOT') {
      return {
        code: 'STALE_SOURCE_SNAPSHOT',
        message: 'Bản xuất bản nguồn đã thay đổi trong khi xây dựng.',
      };
    }
    return {
      code: 'REBUILD_FAILED',
      message: 'Xây dựng đồ thị tri thức thất bại. Kiểm tra máy chủ rồi thử lại.',
    };
  }

  async getStatus(setId: string): Promise<GraphStatusDTO> {
    const isBuilding = this.inProgressSets.has(setId);
    const activeView = await this.repository.getActiveGraph(setId);

    if (isBuilding) {
      return {
        setId,
        state: 'Building',
        ...(activeView ? { activeGraphSnapshotId: activeView.graphSnapshotId } : {}),
        currentStage: this.currentStages.get(setId) || 'Preparing',
        nodeCount: activeView ? activeView.nodeCount : 0,
        factCount: activeView ? activeView.factCount : 0,
        evidenceCount: activeView ? activeView.relationCount : 0,
        conflictCount: activeView ? activeView.conflictCount : 0,
        quarantineCount: activeView ? activeView.quarantineCount : 0,
        ontologyVersion: ONTOLOGY_VERSION,
        rulesVersion: ONTOLOGY_VERSION,
        ...(activeView ? { activatedAt: activeView.activatedAt } : {}),
      };
    }

    const buildError = this.buildErrors.get(setId);
    if (buildError) {
      return {
        setId,
        state: 'Failed',
        ...(activeView ? { activeGraphSnapshotId: activeView.graphSnapshotId } : {}),
        nodeCount: activeView ? activeView.nodeCount : 0,
        factCount: activeView ? activeView.factCount : 0,
        evidenceCount: activeView ? activeView.relationCount : 0,
        conflictCount: activeView ? activeView.conflictCount : 0,
        quarantineCount: activeView ? activeView.quarantineCount : 0,
        ontologyVersion: activeView?.ontologyVersion ?? ONTOLOGY_VERSION,
        rulesVersion: activeView?.ontologyVersion ?? ONTOLOGY_VERSION,
        ...(activeView ? { activatedAt: activeView.activatedAt } : {}),
        error: this.safeBuildError(buildError),
      };
    }

    if (!activeView) {
      return {
        setId,
        state: 'Never built',
        nodeCount: 0,
        factCount: 0,
        evidenceCount: 0,
        conflictCount: 0,
        quarantineCount: 0,
        ontologyVersion: ONTOLOGY_VERSION,
        rulesVersion: ONTOLOGY_VERSION,
      };
    }

    const state: GraphState = activeView.conflictCount > 0 ? 'Active with warnings' : 'Active';

    return {
      setId,
      state,
      activeGraphSnapshotId: activeView.graphSnapshotId,
      nodeCount: activeView.nodeCount,
      factCount: activeView.factCount,
      evidenceCount: activeView.relationCount,
      conflictCount: activeView.conflictCount,
      quarantineCount: activeView.quarantineCount,
      ontologyVersion: activeView.ontologyVersion,
      rulesVersion: activeView.ontologyVersion,
      activatedAt: activeView.activatedAt,
    };
  }

  async getFacts(setId: string): Promise<FactsListDTO> {
    const activeView = await this.repository.getActiveGraph(setId);
    if (!activeView) {
      throw new Error('ACTIVE_GRAPH_NOT_FOUND');
    }

    const factDetails = await this.repository.getFacts(activeView.graphSnapshotId);

    const facts: FactSummaryDTO[] = factDetails.map((fd) => {
      const rel = fd.relation;
      const subjectParts = rel.subjectUrn.split(':');
      const subjectName = decodeURIComponent(subjectParts[4] || rel.subjectUrn);
      const subjectKind = subjectParts[3] || 'Entity';

      const objectParts = rel.objectUrn.split(':');
      const objectName = decodeURIComponent(objectParts[4] || rel.objectUrn);
      const objectKind = objectParts[3] || 'Entity';

      return {
        factKey: rel.factKey,
        subjectUrn: rel.subjectUrn,
        subjectName,
        subjectKind,
        relation: rel.relation,
        objectUrn: rel.objectUrn,
        objectName,
        objectKind,
        effectiveClassification: rel.effectiveClassification,
        evidenceCount: fd.evidence.length,
        hasConflict: rel.hasConflict,
        qualifiers: rel.qualifiers || {},
      };
    });

    return {
      setId,
      graphSnapshotId: activeView.graphSnapshotId,
      totalFacts: facts.length,
      facts,
    };
  }

  async getEvidence(setId: string, factKey: string): Promise<FactEvidenceDetailDTO> {
    const activeView = await this.repository.getActiveGraph(setId);
    if (!activeView) {
      throw new Error('ACTIVE_GRAPH_NOT_FOUND');
    }

    const factDetails = await this.repository.getFacts(activeView.graphSnapshotId);
    const detail = factDetails.find((fd) => fd.relation.factKey === factKey);
    if (!detail) {
      throw new Error('FACT_NOT_FOUND');
    }

    const occurrences: EvidenceRecordDTO[] = detail.evidence.map((ev) => {
      let conflictBranch: 'A' | 'B' | undefined;
      const conf = detail.conflicts[0];
      if (conf) {
        if (conf.factKeyA === factKey) conflictBranch = 'A';
        else if (conf.factKeyB === factKey) conflictBranch = 'B';
      }

      return {
        evidenceId: ev.evidenceId,
        documentId: ev.documentId,
        documentTitle: ev.documentTitle,
        headingPath: ev.sectionHeadingPath,
        startLine: ev.startLine,
        endLine: ev.endLine,
        startOffset: ev.startOffset,
        endOffset: ev.endOffset,
        method: ev.extractionMethod,
        classification: ev.classification,
        confidence: ev.confidence,
        quote: ev.rawSnippet,
        ...(ev.environment ? { environment: ev.environment } : {}),
        ...(conflictBranch ? { conflictBranch } : {}),
      };
    });

    return {
      setId,
      factKey,
      subjectUrn: detail.relation.subjectUrn,
      relation: detail.relation.relation,
      objectUrn: detail.relation.objectUrn,
      effectiveClassification: detail.relation.effectiveClassification,
      hasConflict: detail.relation.hasConflict,
      qualifiers: detail.relation.qualifiers || {},
      occurrences,
    };
  }

  async getQuarantines(setId: string): Promise<QuarantineListDTO> {
    const activeView = await this.repository.getActiveGraph(setId);
    if (!activeView) {
      throw new Error('ACTIVE_GRAPH_NOT_FOUND');
    }

    const list = await this.repository.getQuarantines(activeView.graphSnapshotId);
    const items: QuarantineItemDTO[] = list.map((q) => ({
      rawIdentifier: q.rawIdentifier,
      reason: q.reason,
      documentId: q.documentId,
      headingPath: q.sectionHeadingPath,
      startLine: q.startLine,
      endLine: q.endLine,
      method: q.extractionMethod,
      candidateMatches: q.possibleMatches,
    }));

    return {
      setId,
      graphSnapshotId: activeView.graphSnapshotId,
      totalQuarantines: items.length,
      quarantines: items,
    };
  }
}
