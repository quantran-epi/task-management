import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { GraphRepository, InMemoryGraphRepository } from '../graph/graphRepository.js';
import { AttemptService } from '../services/attemptService.js';
import { extractDeterministicFacts } from '../graph/extraction.js';
import { mergeFactsDeterministicFirst } from '../graph/candidate.js';
import { ONTOLOGY_VERSION } from '../graph/ontology.js';
import {
  UrnSchema,
  FactKeySchema,
  EvidenceClassificationSchema,
  ExtractionMethodSchema,
} from '../types/graphProtocol.js';
import { randomUUID } from 'node:crypto';

const uuid = z.string().uuid();
const SetParamsSchema = z.object({ setId: uuid }).strict();
const FactEvidenceParamsSchema = z.object({ setId: uuid, factKey: FactKeySchema }).strict();
const RebuildHeadersSchema = z.object({ 'x-rebuild-key': uuid }).passthrough();

/**
 * Graph build state and stage schemas per D-18, Pattern 7, UI Spec
 */
export const GraphStateSchema = z.enum([
  'Never built',
  'Building',
  'Active',
  'Active with warnings',
  'Failed',
]);
export type GraphState = z.infer<typeof GraphStateSchema>;

export const GraphBuildStageSchema = z.enum([
  'Preparing',
  'Structured extraction',
  'Prose extraction',
  'Validation',
  'Activation',
]);
export type GraphBuildStage = z.infer<typeof GraphBuildStageSchema>;

export const GraphStatusDTOSchema = z
  .object({
    setId: uuid,
    state: GraphStateSchema,
    activeGraphSnapshotId: uuid.optional(),
    currentStage: GraphBuildStageSchema.optional(),
    nodeCount: z.number().int().nonnegative(),
    factCount: z.number().int().nonnegative(),
    evidenceCount: z.number().int().nonnegative(),
    conflictCount: z.number().int().nonnegative(),
    quarantineCount: z.number().int().nonnegative(),
    ontologyVersion: z.string().min(1),
    rulesVersion: z.string().min(1),
    activatedAt: z.string().datetime().optional(),
  })
  .strict();
export type GraphStatusDTO = z.infer<typeof GraphStatusDTOSchema>;

export const FactSummaryDTOSchema = z
  .object({
    factKey: FactKeySchema,
    subjectUrn: UrnSchema,
    subjectName: z.string(),
    subjectKind: z.string(),
    relation: z.string(),
    objectUrn: UrnSchema,
    objectName: z.string(),
    objectKind: z.string(),
    effectiveClassification: EvidenceClassificationSchema,
    evidenceCount: z.number().int().nonnegative(),
    hasConflict: z.boolean(),
    qualifiers: z.record(z.string(), z.string()),
  })
  .strict();
export type FactSummaryDTO = z.infer<typeof FactSummaryDTOSchema>;

export const FactsListDTOSchema = z
  .object({
    setId: uuid,
    graphSnapshotId: uuid,
    totalFacts: z.number().int().nonnegative(),
    facts: z.array(FactSummaryDTOSchema),
  })
  .strict();
export type FactsListDTO = z.infer<typeof FactsListDTOSchema>;

export const EvidenceRecordDTOSchema = z
  .object({
    evidenceId: uuid,
    documentId: uuid,
    documentTitle: z.string(),
    headingPath: z.array(z.string()),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().nonnegative(),
    method: ExtractionMethodSchema,
    classification: EvidenceClassificationSchema,
    confidence: z.number().min(0).max(1),
    quote: z.string(),
    environment: z.string().optional(),
    conflictBranch: z.enum(['A', 'B']).optional(),
  })
  .strict();
export type EvidenceRecordDTO = z.infer<typeof EvidenceRecordDTOSchema>;

export const FactEvidenceDetailDTOSchema = z
  .object({
    setId: uuid,
    factKey: FactKeySchema,
    subjectUrn: UrnSchema,
    relation: z.string(),
    objectUrn: UrnSchema,
    effectiveClassification: EvidenceClassificationSchema,
    hasConflict: z.boolean(),
    qualifiers: z.record(z.string(), z.string()),
    occurrences: z.array(EvidenceRecordDTOSchema),
  })
  .strict();
export type FactEvidenceDetailDTO = z.infer<typeof FactEvidenceDetailDTOSchema>;

export const QuarantineItemDTOSchema = z
  .object({
    rawIdentifier: z.string(),
    reason: z.string(),
    documentId: uuid,
    headingPath: z.array(z.string()),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    method: ExtractionMethodSchema,
    candidateMatches: z.array(z.string()),
  })
  .strict();
export type QuarantineItemDTO = z.infer<typeof QuarantineItemDTOSchema>;

export const QuarantineListDTOSchema = z
  .object({
    setId: uuid,
    graphSnapshotId: uuid,
    totalQuarantines: z.number().int().nonnegative(),
    quarantines: z.array(QuarantineItemDTOSchema),
  })
  .strict();
export type QuarantineListDTO = z.infer<typeof QuarantineListDTOSchema>;

export const RebuildAcceptedDTOSchema = z
  .object({
    setId: uuid,
    rebuildKey: uuid,
    status: z.literal('ACCEPTED'),
    candidateSnapshotId: uuid,
  })
  .strict();
export type RebuildAcceptedDTO = z.infer<typeof RebuildAcceptedDTOSchema>;

export class GraphBuildInProgressError extends Error {
  readonly code = 'GRAPH_BUILD_IN_PROGRESS';
  constructor(readonly setId: string) {
    super('A graph rebuild is already in progress for this document set.');
    this.name = 'GraphBuildInProgressError';
  }
}

/**
 * Service orchestrating graph rebuilds and state tracking for document sets.
 */
export class GraphBuildService {
  private inProgressSets = new Set<string>();
  private currentStages = new Map<string, GraphBuildStage>();
  private rebuildReplays = new Map<string, RebuildAcceptedDTO>(); // setId:rebuildKey -> DTO
  private activeGraphSnapshots = new Map<string, string>(); // setId -> graphSnapshotId

  constructor(
    readonly repository: GraphRepository = new InMemoryGraphRepository(),
    readonly attemptService?: AttemptService
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

    // Run rebuild in background or synchronously if configured
    this.executeRebuild(setId, candidateSnapshotId).catch(() => {
      // Background build error captured, stage cleared
    }).finally(() => {
      this.inProgressSets.delete(setId);
      this.currentStages.delete(setId);
    });

    return dto;
  }

  private async executeRebuild(setId: string, candidateSnapshotId: string): Promise<void> {
    if (!this.attemptService) return;

    const sourceSnapshot = this.attemptService.getActiveSnapshot(setId);
    if (!sourceSnapshot) {
      throw new Error('NO_SOURCE_SNAPSHOT');
    }

    this.currentStages.set(setId, 'Structured extraction');
    const extractionResult = extractDeterministicFacts(sourceSnapshot);

    this.currentStages.set(setId, 'Validation');
    const candidate = mergeFactsDeterministicFirst({
      graphSnapshotId: candidateSnapshotId,
      sourceSnapshotId: sourceSnapshot.snapshotId,
      setId,
      ontologyVersion: ONTOLOGY_VERSION,
      nodes: extractionResult.nodes,
      deterministicFacts: extractionResult.facts,
      deterministicEvidence: extractionResult.evidence,
      quarantines: extractionResult.quarantines,
    });

    this.currentStages.set(setId, 'Activation');
    await this.repository.writeCandidate(candidate);
    await this.repository.activateCandidate(setId, candidateSnapshotId);
    this.activeGraphSnapshots.set(setId, candidateSnapshotId);
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
      // Derive canonical names from URNs
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
      // Determine if part of conflict branch A or B
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

function invalid(reply: FastifyReply) {
  return reply.code(400).send({
    error: { code: 'INVALID_REQUEST', message: 'Request could not be processed.' },
  });
}

export function registerGraphRoutes(app: FastifyInstance, buildService: GraphBuildService) {
  // 1. POST /api/v1/sets/:setId/graph/rebuild
  app.post('/api/v1/sets/:setId/graph/rebuild', async (request, reply) => {
    const params = SetParamsSchema.safeParse(request.params);
    const headers = RebuildHeadersSchema.safeParse(request.headers);
    if (!params.success || !headers.success) return invalid(reply);

    try {
      const result = await buildService.triggerRebuild(
        params.data.setId,
        headers.data['x-rebuild-key']
      );
      return reply.code(202).send(RebuildAcceptedDTOSchema.parse(result));
    } catch (err: unknown) {
      if (err instanceof GraphBuildInProgressError) {
        return reply.code(409).send({
          error: {
            code: err.code,
            message: 'A graph rebuild is already in progress for this document set.',
          },
        });
      }
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Request could not be processed.' },
      });
    }
  });

  // 2. GET /api/v1/sets/:setId/graph/status
  app.get('/api/v1/sets/:setId/graph/status', async (request, reply) => {
    const params = SetParamsSchema.safeParse(request.params);
    if (!params.success) return invalid(reply);

    const status = await buildService.getStatus(params.data.setId);
    return reply.code(200).send(GraphStatusDTOSchema.parse(status));
  });

  // 3. GET /api/v1/sets/:setId/graph/facts
  app.get('/api/v1/sets/:setId/graph/facts', async (request, reply) => {
    const params = SetParamsSchema.safeParse(request.params);
    if (!params.success) return invalid(reply);

    try {
      const facts = await buildService.getFacts(params.data.setId);
      return reply.code(200).send(FactsListDTOSchema.parse(facts));
    } catch (err: any) {
      if (err?.message === 'ACTIVE_GRAPH_NOT_FOUND') {
        return reply.code(404).send({
          error: { code: 'GRAPH_NOT_FOUND', message: 'No active graph for this document set.' },
        });
      }
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Request could not be processed.' },
      });
    }
  });

  // 4. GET /api/v1/sets/:setId/graph/facts/:factKey/evidence
  app.get('/api/v1/sets/:setId/graph/facts/:factKey/evidence', async (request, reply) => {
    const params = FactEvidenceParamsSchema.safeParse(request.params);
    if (!params.success) return invalid(reply);

    try {
      const evidence = await buildService.getEvidence(params.data.setId, params.data.factKey);
      return reply.code(200).send(FactEvidenceDetailDTOSchema.parse(evidence));
    } catch (err: any) {
      if (err?.message === 'ACTIVE_GRAPH_NOT_FOUND') {
        return reply.code(404).send({
          error: { code: 'GRAPH_NOT_FOUND', message: 'No active graph for this document set.' },
        });
      }
      if (err?.message === 'FACT_NOT_FOUND') {
        return reply.code(404).send({
          error: { code: 'FACT_NOT_FOUND', message: 'Fact not found in active graph.' },
        });
      }
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Request could not be processed.' },
      });
    }
  });

  // 5. GET /api/v1/sets/:setId/graph/quarantine
  app.get('/api/v1/sets/:setId/graph/quarantine', async (request, reply) => {
    const params = SetParamsSchema.safeParse(request.params);
    if (!params.success) return invalid(reply);

    try {
      const quarantines = await buildService.getQuarantines(params.data.setId);
      return reply.code(200).send(QuarantineListDTOSchema.parse(quarantines));
    } catch (err: any) {
      if (err?.message === 'ACTIVE_GRAPH_NOT_FOUND') {
        return reply.code(404).send({
          error: { code: 'GRAPH_NOT_FOUND', message: 'No active graph for this document set.' },
        });
      }
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Request could not be processed.' },
      });
    }
  });
}
