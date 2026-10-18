import { randomUUID } from 'node:crypto';
import type { GraphRepository } from '../graph/graphRepository.js';
import { InMemoryGraphRepository } from '../graph/graphRepository.js';
import type { SnapshotStore } from '../indexing/snapshotStore.js';
import { extractDeterministicFacts } from '../graph/extraction.js';
import { mergeFactsDeterministicFirst } from '../graph/candidate.js';
import { ONTOLOGY_VERSION } from '../graph/ontology.js';
import { collectUncoveredProse, extractProseCandidatesOnce } from '../ai/proseExtraction.js';
import type { EmbeddingProvider } from '../retrieval/contracts.js';
import type {
  FactAssertion,
  GraphEvidenceRecord,
  QuarantinedIdentifier,
} from '../types/graphProtocol.js';
import type {
  GraphBuildStage,
  GraphState,
  GraphStatusDTO,
  CandidateStatus,
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

export class GraphCASConflictError extends Error {
  readonly code = 'CAS_CONFLICT';
  constructor(message = 'Active snapshot pointer does not match expected prior snapshot.') {
    super(message);
    this.name = 'GraphCASConflictError';
  }
}

export class GraphRollbackError extends Error {
  readonly code: 'NO_PRIOR_SNAPSHOT' | 'ROLLBACK_EXPIRED';
  constructor(code: 'NO_PRIOR_SNAPSHOT' | 'ROLLBACK_EXPIRED', message: string) {
    super(message);
    this.name = 'GraphRollbackError';
    this.code = code;
  }
}

/**
 * Optional LLM config for bounded prose extraction (Bug 3 cause B). When absent, the
 * prose stage is a safe no-op and the build stays fully deterministic.
 */
export interface ProseExtractionConfig {
  endpoint: string;
  model: string;
  apiKey?: string | undefined;
  fetchFn?: typeof fetch | undefined;
}

export interface GraphBuildServiceOptions {
  repository?: GraphRepository | undefined;
  snapshotStore?: SnapshotStore | undefined;
  embeddingProvider?: EmbeddingProvider | undefined;
  proseExtraction?: ProseExtractionConfig | undefined;
  productionMode?: boolean | undefined;
  rollbackGracePeriodMs?: number | undefined;
}

export class GraphBuildService {
  private inProgressSets = new Set<string>();
  private currentStages = new Map<string, GraphBuildStage>();
  private rebuildReplays = new Map<string, RebuildAcceptedDTO>(); // setId:rebuildKey -> DTO
  private activeGraphSnapshots = new Map<string, string>(); // setId -> graphSnapshotId
  private candidateBySet = new Map<string, { candidateSnapshotId: string; status: CandidateStatus }>();
  private rollbackPointers = new Map<string, { priorSnapshotId?: string | undefined; rollbackExpiresAt?: string | undefined }>();
  private buildErrors = new Map<string, Error>(); // setId -> last error
  readonly repository: GraphRepository;
  readonly snapshotStore?: SnapshotStore | undefined;
  readonly embeddingProvider?: EmbeddingProvider | undefined;
  readonly proseExtraction?: ProseExtractionConfig | undefined;
  readonly rollbackGracePeriodMs: number;

  constructor(
    repositoryOrOptions?: GraphRepository | GraphBuildServiceOptions,
    snapshotStore?: SnapshotStore | undefined,
    options?: GraphBuildServiceOptions
  ) {
    if (repositoryOrOptions && typeof (repositoryOrOptions as any).writeCandidate === 'function') {
      this.repository = repositoryOrOptions as GraphRepository;
      this.snapshotStore = snapshotStore ?? options?.snapshotStore;
      this.embeddingProvider = options?.embeddingProvider;
      this.proseExtraction = options?.proseExtraction;
      this.rollbackGracePeriodMs = options?.rollbackGracePeriodMs ?? 600000;
    } else {
      const opts = (repositoryOrOptions as GraphBuildServiceOptions) || {};
      if (opts.productionMode) {
        if (!opts.repository) {
          throw new Error('GraphBuildService requires explicit repository in production mode.');
        }
        if (!opts.snapshotStore) {
          throw new Error('GraphBuildService requires explicit snapshotStore in production mode.');
        }
      }
      this.repository = opts.repository ?? new InMemoryGraphRepository();
      this.snapshotStore = opts.snapshotStore;
      this.embeddingProvider = opts.embeddingProvider;
      this.proseExtraction = opts.proseExtraction;
      this.rollbackGracePeriodMs = opts.rollbackGracePeriodMs ?? 600000;
    }
  }

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
      console.error('[GRAPH_BUILD_FATAL]', err);
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
      await this.prepareCandidate(setId, candidateSnapshotId);
      await this.activateCandidate(setId, candidateSnapshotId);
      return candidateSnapshotId;
    } catch (err: unknown) {
      this.buildErrors.set(setId, err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      this.inProgressSets.delete(setId);
      this.currentStages.delete(setId);
    }
  }

  async prepareCandidate(
    setId: string,
    candidateSnapshotId: string = randomUUID()
  ): Promise<string> {
    if (!this.snapshotStore) {
      throw new Error('NO_SNAPSHOT_STORE');
    }

    // Stage a: Retrieve active published snapshot
    const sourceSnapshot = this.snapshotStore.getActiveSnapshot(setId);
    if (!sourceSnapshot) {
      throw new Error('NO_SOURCE_SNAPSHOT');
    }
    const frozenSourceSnapshotId = sourceSnapshot.snapshotId;

    this.candidateBySet.set(setId, {
      candidateSnapshotId,
      status: 'PREPARING',
    });

    try {
      // Stage b: Preparing
      this.currentStages.set(setId, 'Preparing');

      // Stage c: Structured extraction
      this.currentStages.set(setId, 'Structured extraction');
      const extractionResult = extractDeterministicFacts(sourceSnapshot);

      // Stage d: Prose extraction (Bug 3 cause B)
      this.currentStages.set(setId, 'Prose extraction');
      let inferredFacts: FactAssertion[] = [];
      let inferredEvidence: GraphEvidenceRecord[] = [];
      const proseQuarantines: QuarantinedIdentifier[] = [];

      if (this.proseExtraction && this.proseExtraction.endpoint) {
        try {
          const segments = collectUncoveredProse(sourceSnapshot, extractionResult.consumedRanges);
          if (segments.length > 0) {
            const proseResult = await extractProseCandidatesOnce({
              endpoint: this.proseExtraction.endpoint,
              model: this.proseExtraction.model,
              ...(this.proseExtraction.apiKey ? { apiKey: this.proseExtraction.apiKey } : {}),
              segments,
              resolvedEndpoints: extractionResult.nodes,
              ...(this.proseExtraction.fetchFn ? { fetchFn: this.proseExtraction.fetchFn } : {}),
            });
            inferredFacts = proseResult.facts;
            inferredEvidence = proseResult.evidence;
            proseQuarantines.push(...proseResult.quarantines);
          }
        } catch (proseErr) {
          // eslint-disable-next-line no-console
          console.warn(
            '[PROSE_EXTRACTION_FALLBACK] Error during prose extraction; falling back to deterministic only:',
            proseErr
          );
        }
      }

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
        inferredFacts,
        inferredEvidence,
        approvals,
        quarantines: [...extractionResult.quarantines, ...proseQuarantines],
      });

      // Write candidate to repository with READY state
      await this.repository.writeCandidate(candidate);

      // Stage f: Build retrieval generation (chunks, fulltext index, vector index) before activation
      this.currentStages.set(setId, 'Retrieval generation');
      await this.repository.buildRetrievalGeneration(
        candidate,
        sourceSnapshot,
        this.embeddingProvider
      );

      // Stage g: Validate candidate & retrieval generation readiness
      const isValidCandidate = await this.validateCandidate(setId, candidateSnapshotId);
      if (!isValidCandidate) {
        throw new Error('RETRIEVAL_GENERATION_INVALID: Candidate generation failed validation');
      }

      // Stage h: Stale-source guard
      const latestSnapshot = this.snapshotStore.getActiveSnapshot(setId);
      if (!latestSnapshot || latestSnapshot.snapshotId !== frozenSourceSnapshotId) {
        throw new Error('STALE_SOURCE_SNAPSHOT');
      }

      this.candidateBySet.set(setId, {
        candidateSnapshotId,
        status: 'READY',
      });

      return candidateSnapshotId;
    } catch (err: unknown) {
      this.candidateBySet.set(setId, {
        candidateSnapshotId,
        status: 'FAILED',
      });
      throw err;
    }
  }

  async validateCandidate(_setId: string, candidateSnapshotId: string): Promise<boolean> {
    const isValidGeneration = await this.repository.validateRetrievalGeneration(candidateSnapshotId);
    return isValidGeneration;
  }

  async activateCandidate(
    setId: string,
    candidateSnapshotId: string,
    expectedPriorSnapshotId?: string
  ): Promise<void> {
    const currentActive = await this.repository.getActiveGraph(setId);
    const actualPriorSnapshotId = currentActive?.graphSnapshotId;

    if (expectedPriorSnapshotId !== undefined) {
      if (actualPriorSnapshotId !== expectedPriorSnapshotId) {
        throw new GraphCASConflictError(
          `CAS_CONFLICT: Active snapshot pointer ${actualPriorSnapshotId ?? 'none'} does not match expected prior snapshot ${expectedPriorSnapshotId}`
        );
      }
    }

    this.currentStages.set(setId, 'Activation');
    await this.repository.activateCandidate(setId, candidateSnapshotId);
    this.activeGraphSnapshots.set(setId, candidateSnapshotId);

    const candidateRecord = this.candidateBySet.get(setId);
    if (candidateRecord?.candidateSnapshotId === candidateSnapshotId) {
      this.candidateBySet.delete(setId);
    }

    const now = Date.now();
    const rollbackExpiresAt = actualPriorSnapshotId
      ? new Date(now + this.rollbackGracePeriodMs).toISOString()
      : undefined;

    this.rollbackPointers.set(setId, {
      priorSnapshotId: actualPriorSnapshotId,
      rollbackExpiresAt,
    });
  }

  async rollbackCandidate(setId: string): Promise<void> {
    const rollbackInfo = this.rollbackPointers.get(setId);
    if (!rollbackInfo || !rollbackInfo.priorSnapshotId) {
      throw new GraphRollbackError(
        'NO_PRIOR_SNAPSHOT',
        `NO_PRIOR_SNAPSHOT: No prior active snapshot recorded for document set ${setId}.`
      );
    }

    const now = Date.now();
    if (!rollbackInfo.rollbackExpiresAt || new Date(rollbackInfo.rollbackExpiresAt).getTime() <= now) {
      throw new GraphRollbackError(
        'ROLLBACK_EXPIRED',
        `ROLLBACK_EXPIRED: Rollback grace period has expired for document set ${setId}.`
      );
    }

    const priorSnapshotId = rollbackInfo.priorSnapshotId;

    // Atomically swap active pointer back to priorSnapshotId
    this.currentStages.set(setId, 'Activation');
    await this.repository.activateCandidate(setId, priorSnapshotId);
    this.activeGraphSnapshots.set(setId, priorSnapshotId);

    // Clear rollback window to prevent duplicate rollbacks or reset state
    this.rollbackPointers.delete(setId);

    // Structured audit logging per D-15 / BUILD-03
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        event: '[PUBLISH]',
        action: 'ROLLBACK',
        setId,
        restoredSnapshotId: priorSnapshotId,
        timestamp: new Date().toISOString(),
      })
    );
  }

  async cleanupExpiredSnapshots(setId: string): Promise<number> {
    const rollbackInfo = this.rollbackPointers.get(setId);
    const now = Date.now();

    // If a rollback window is still active for this set, do not clean up
    if (
      rollbackInfo?.rollbackExpiresAt &&
      new Date(rollbackInfo.rollbackExpiresAt).getTime() > now
    ) {
      return 0;
    }

    return await this.repository.cleanupSupersededGenerations(now, this.rollbackGracePeriodMs);
  }

  private async executeRebuild(setId: string, candidateSnapshotId: string): Promise<void> {
    // Public rebuild is phase 1 only. Operator verifies READY candidate before the
    // separate CAS activation endpoint changes the live pointer.
    await this.prepareCandidate(setId, candidateSnapshotId);
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
      details: error.message ? error.message.slice(0, 400) : undefined,
    };
  }

  async getStatus(setId: string): Promise<GraphStatusDTO> {
    const isBuilding = this.inProgressSets.has(setId);
    const activeView = await this.repository.getActiveGraph(setId);
    const candidateInfo = this.candidateBySet.get(setId);
    const rollbackInfo = this.rollbackPointers.get(setId);

    const now = Date.now();
    const canRollback = Boolean(
      rollbackInfo?.priorSnapshotId &&
        rollbackInfo.rollbackExpiresAt &&
        new Date(rollbackInfo.rollbackExpiresAt).getTime() > now
    );

    const candidateSnapshotId = candidateInfo?.candidateSnapshotId;
    const candidateStatus = candidateInfo?.status;
    const priorSnapshotId = rollbackInfo?.priorSnapshotId;
    const rollbackExpiresAt = rollbackInfo?.rollbackExpiresAt;

    if (isBuilding) {
      return {
        setId,
        state: 'Building',
        ...(activeView ? { activeGraphSnapshotId: activeView.graphSnapshotId } : {}),
        currentStage: this.currentStages.get(setId) || 'Preparing',
        nodeCount: activeView ? activeView.nodeCount : 0,
        factCount: activeView ? activeView.factCount : 0,
        evidenceCount: activeView ? activeView.evidenceCount : 0,
        conflictCount: activeView ? activeView.conflictCount : 0,
        quarantineCount: activeView ? activeView.quarantineCount : 0,
        ontologyVersion: ONTOLOGY_VERSION,
        rulesVersion: ONTOLOGY_VERSION,
        ...(activeView ? { activatedAt: activeView.activatedAt } : {}),
        ...(candidateSnapshotId ? { candidateSnapshotId } : {}),
        ...(candidateStatus ? { candidateStatus } : {}),
        ...(priorSnapshotId ? { priorSnapshotId } : {}),
        ...(rollbackExpiresAt ? { rollbackExpiresAt } : {}),
        canRollback,
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
        evidenceCount: activeView ? activeView.evidenceCount : 0,
        conflictCount: activeView ? activeView.conflictCount : 0,
        quarantineCount: activeView ? activeView.quarantineCount : 0,
        ontologyVersion: activeView?.ontologyVersion ?? ONTOLOGY_VERSION,
        rulesVersion: activeView?.ontologyVersion ?? ONTOLOGY_VERSION,
        ...(activeView ? { activatedAt: activeView.activatedAt } : {}),
        ...(candidateSnapshotId ? { candidateSnapshotId } : {}),
        ...(candidateStatus ? { candidateStatus } : {}),
        ...(priorSnapshotId ? { priorSnapshotId } : {}),
        ...(rollbackExpiresAt ? { rollbackExpiresAt } : {}),
        canRollback,
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
        ...(candidateSnapshotId ? { candidateSnapshotId } : {}),
        ...(candidateStatus ? { candidateStatus } : {}),
        ...(priorSnapshotId ? { priorSnapshotId } : {}),
        ...(rollbackExpiresAt ? { rollbackExpiresAt } : {}),
        canRollback,
      };
    }

    const state: GraphState = activeView.conflictCount > 0 ? 'Active with warnings' : 'Active';

    return {
      setId,
      state,
      activeGraphSnapshotId: activeView.graphSnapshotId,
      nodeCount: activeView.nodeCount,
      factCount: activeView.factCount,
      evidenceCount: activeView.evidenceCount,
      conflictCount: activeView.conflictCount,
      quarantineCount: activeView.quarantineCount,
      ontologyVersion: activeView.ontologyVersion,
      rulesVersion: activeView.ontologyVersion,
      activatedAt: activeView.activatedAt,
      ...(candidateSnapshotId ? { candidateSnapshotId } : {}),
      ...(candidateStatus ? { candidateStatus } : {}),
      ...(priorSnapshotId ? { priorSnapshotId } : {}),
      ...(rollbackExpiresAt ? { rollbackExpiresAt } : {}),
      canRollback,
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

  async purgeSet(setId: string): Promise<boolean> {
    this.inProgressSets.delete(setId);
    this.currentStages.delete(setId);
    this.activeGraphSnapshots.delete(setId);
    this.candidateBySet.delete(setId);
    this.rollbackPointers.delete(setId);
    this.buildErrors.delete(setId);

    for (const key of this.rebuildReplays.keys()) {
      if (key.startsWith(`${setId}:`)) {
        this.rebuildReplays.delete(key);
      }
    }

    if (this.repository.purgeSet) {
      return await this.repository.purgeSet(setId);
    }
    return false;
  }
}
