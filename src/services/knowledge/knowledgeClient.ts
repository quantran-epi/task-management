import { z } from 'zod';
import type { TaskPlannerDatabase } from '../../db';
import {
  getCachedPublishAttempt,
  markPollingUncertain,
  reconcileRemoteAttempt,
} from '../../db/repositories/publishAttemptRepo';
import type {
  PublishAttemptCache,
  PublishedDocumentMetadata,
} from '../../types/models';
import { validateKnowledgeBaseUrl } from './knowledgeConfig';
import type {
  CachedActiveSnapshotManifest,
  FrozenPublishSnapshot,
} from './changePreview';

const uuid = z.string().uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const MetricsSchema = z
  .object({
    addedCount: z.number().int().nonnegative(),
    changedCount: z.number().int().nonnegative(),
    removedCount: z.number().int().nonnegative(),
    unchangedCount: z.number().int().nonnegative(),
    warningCount: z.number().int().nonnegative(),
    durationMs: z.number().int().nonnegative().optional(),
  })
  .strict();
const AttemptResponseSchema = z
  .object({
    attemptId: uuid,
    setId: uuid,
    status: z.enum(['Publishing', 'In sync', 'Warning', 'Failed']),
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().optional(),
    metrics: MetricsSchema,
    error: z
      .object({
        code: z.string().max(80),
        message: z.string().max(240),
        documentId: uuid.optional(),
        blockType: z.string().max(80).optional(),
        line: z.number().int().positive().optional(),
        column: z.number().int().positive().optional(),
        limit: z.number().int().positive().optional(),
      })
      .strict()
      .optional(),
    activeSnapshotId: uuid.optional(),
  })
  .strict();
const SnapshotResponseSchema = z
  .object({
    snapshotId: uuid,
    setId: uuid,
    chunkingPolicyVersion: z.string().min(1).max(80),
    documents: z.array(
      z
        .object({
          documentId: uuid,
          contentHash: hash,
          chunks: z.array(
            z
              .object({
                occurrenceId: uuid,
                contentHash: hash,
                chunkIndex: z.number().int().nonnegative(),
                headingPath: z.array(z.string()),
                startLine: z.number().int().positive(),
                endLine: z.number().int().positive(),
                startOffset: z.number().int().nonnegative(),
                endOffset: z.number().int().nonnegative(),
              })
              .strict()
          ),
        })
        .strict()
    ),
  })
  .strict();
const ErrorEnvelopeSchema = z
  .object({
    error: z
      .object({ code: z.string().max(80), message: z.string().max(240) })
      .strict(),
  })
  .strict();

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

export const GraphStatusResponseSchema = z
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
    error: z
      .object({
        code: z.string().max(80),
        message: z.string().max(240),
        details: z.string().max(400).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type GraphStatusResponse = z.infer<typeof GraphStatusResponseSchema>;

export const RebuildAcceptedResponseSchema = z
  .object({
    setId: uuid,
    rebuildKey: uuid,
    status: z.literal('ACCEPTED'),
    candidateSnapshotId: uuid,
  })
  .strict();
export type RebuildAcceptedResponse = z.infer<typeof RebuildAcceptedResponseSchema>;

export const FactSummarySchema = z
  .object({
    factKey: hash,
    subjectUrn: z.string().min(1),
    subjectName: z.string(),
    subjectKind: z.string(),
    relation: z.string(),
    objectUrn: z.string().min(1),
    objectName: z.string(),
    objectKind: z.string(),
    effectiveClassification: z.enum(['OBSERVED', 'INFERRED', 'BUSINESS_APPROVED']),
    evidenceCount: z.number().int().nonnegative(),
    hasConflict: z.boolean(),
    qualifiers: z.record(z.string(), z.string()),
  })
  .strict();
export type FactSummary = z.infer<typeof FactSummarySchema>;

export const FactsListResponseSchema = z
  .object({
    setId: uuid,
    graphSnapshotId: uuid,
    totalFacts: z.number().int().nonnegative(),
    facts: z.array(FactSummarySchema),
  })
  .strict();
export type FactsListResponse = z.infer<typeof FactsListResponseSchema>;

export const EvidenceRecordSchema = z
  .object({
    evidenceId: uuid,
    documentId: uuid,
    documentTitle: z.string(),
    headingPath: z.array(z.string()),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().nonnegative(),
    method: z.enum([
      'DETERMINISTIC_TABLE',
      'DETERMINISTIC_SQL',
      'DETERMINISTIC_CODE',
      'LLM_PROSE',
      'MANUAL_ASSERTION',
    ]),
    classification: z.enum(['OBSERVED', 'INFERRED', 'BUSINESS_APPROVED']),
    confidence: z.number().min(0).max(1),
    quote: z.string(),
    environment: z.string().optional(),
    conflictBranch: z.enum(['A', 'B']).optional(),
  })
  .strict();
export type EvidenceRecord = z.infer<typeof EvidenceRecordSchema>;

export const FactEvidenceDetailResponseSchema = z
  .object({
    setId: uuid,
    factKey: hash,
    subjectUrn: z.string().min(1),
    relation: z.string(),
    objectUrn: z.string().min(1),
    effectiveClassification: z.enum(['OBSERVED', 'INFERRED', 'BUSINESS_APPROVED']),
    hasConflict: z.boolean(),
    qualifiers: z.record(z.string(), z.string()),
    occurrences: z.array(EvidenceRecordSchema),
  })
  .strict();
export type FactEvidenceDetailResponse = z.infer<typeof FactEvidenceDetailResponseSchema>;

export const QuarantineItemSchema = z
  .object({
    rawIdentifier: z.string(),
    reason: z.string(),
    documentId: uuid,
    headingPath: z.array(z.string()),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    method: z.enum([
      'DETERMINISTIC_TABLE',
      'DETERMINISTIC_SQL',
      'DETERMINISTIC_CODE',
      'LLM_PROSE',
      'MANUAL_ASSERTION',
    ]),
    candidateMatches: z.array(z.string()),
  })
  .strict();
export type QuarantineItem = z.infer<typeof QuarantineItemSchema>;

export const QuarantineListResponseSchema = z
  .object({
    setId: uuid,
    graphSnapshotId: uuid,
    totalQuarantines: z.number().int().nonnegative(),
    quarantines: z.array(QuarantineItemSchema),
  })
  .strict();
export type QuarantineListResponse = z.infer<typeof QuarantineListResponseSchema>;

type AttemptResponse = z.infer<typeof AttemptResponseSchema>;

export type KnowledgeClientErrorCode =
  | 'NETWORK_ERROR'
  | 'INVALID_RESPONSE'
  | 'REMOTE_ERROR';

export class KnowledgeClientError extends Error {
  constructor(
    public readonly code: KnowledgeClientErrorCode,
    message: string,
    public readonly status?: number,
    public readonly serverCode?: string
  ) {
    super(message);
    this.name = 'KnowledgeClientError';
  }
}

export interface ReconcileAttemptPayload {
  attempt: PublishAttemptCache;
  publishedDocuments?: PublishedDocumentMetadata[];
}

export interface CreateKnowledgeClientOptions {
  baseUrl: string;
  token: string;
  fetcher?: typeof fetch;
  db?: TaskPlannerDatabase;
  reconcile?: (input: ReconcileAttemptPayload) => Promise<unknown> | unknown;
  markUncertain?: (attemptId: string, reason: string) => Promise<unknown> | unknown;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}

export interface PollAttemptOptions {
  signal?: AbortSignal;
  initialDelayMs?: number;
  maxDelayMs?: number;
}

export interface PollAttemptResult extends AttemptResponse {
  uncertain: boolean;
}

function redact(text: string, token: string): string {
  return token ? text.replaceAll(token, '***') : text;
}

function attemptCache(resource: AttemptResponse): PublishAttemptCache {
  return {
    id: resource.attemptId,
    setId: resource.setId,
    startedAt: resource.startedAt,
    ...(resource.completedAt ? { completedAt: resource.completedAt } : {}),
    ...(resource.metrics.durationMs !== undefined
      ? { durationMs: resource.metrics.durationMs }
      : {}),
    status: resource.status,
    addedCount: resource.metrics.addedCount,
    changedCount: resource.metrics.changedCount,
    removedCount: resource.metrics.removedCount,
    unchangedCount: resource.metrics.unchangedCount,
    warningCount: resource.metrics.warningCount,
    ...(resource.error?.code ? { errorCode: resource.error.code } : {}),
    ...(resource.error?.message ? { errorMessage: resource.error.message } : {}),
  };
}

function defaultSleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}

export function createKnowledgeClient(options: CreateKnowledgeClientOptions) {
  const baseUrl = validateKnowledgeBaseUrl(options.baseUrl).baseUrl;
  const fetcher = options.fetcher ?? fetch;
  const reconcile =
    options.reconcile ??
    ((input: ReconcileAttemptPayload) => reconcileRemoteAttempt(input, options.db));
  const markUncertain =
    options.markUncertain ??
    ((attemptId: string, reason: string) =>
      markPollingUncertain(attemptId, reason, options.db));
  const sleep = options.sleep ?? defaultSleep;

  async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    init: RequestInit = {}
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetcher(`${baseUrl}/api/v1${path}`, {
        ...init,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${options.token}`,
          ...init.headers,
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Network request failed';
      throw new KnowledgeClientError(
        'NETWORK_ERROR',
        redact(message, options.token).slice(0, 240)
      );
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new KnowledgeClientError(
        'INVALID_RESPONSE',
        'Knowledge server returned invalid JSON',
        response.status
      );
    }
    if (!response.ok) {
      const envelope = ErrorEnvelopeSchema.safeParse(json);
      throw new KnowledgeClientError(
        'REMOTE_ERROR',
        envelope.success ? envelope.data.error.message : 'Knowledge server request failed',
        response.status,
        envelope.success ? envelope.data.error.code : undefined
      );
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new KnowledgeClientError(
        'INVALID_RESPONSE',
        'Knowledge server returned an invalid response',
        response.status
      );
    }
    return parsed.data;
  }

  async function reconcileAttempt(resource: AttemptResponse) {
    if (resource.status === 'In sync') {
      if (!resource.activeSnapshotId) {
        throw new KnowledgeClientError(
          'INVALID_RESPONSE',
          'Terminal In sync response requires activeSnapshotId'
        );
      }

      // Load cached attempt to retrieve frozen submitted manifest
      let cached: PublishAttemptCache | undefined;
      if (options.db) {
        cached = await getCachedPublishAttempt(resource.attemptId, options.db);
      }

      const manifest = cached?.submittedDocuments;
      if (manifest) {
        if (cached && cached.setId !== resource.setId) {
          throw new KnowledgeClientError(
            'INVALID_RESPONSE',
            `Daemon response setId (${resource.setId}) does not match cached attempt setId (${cached.setId})`
          );
        }

        const terminalCompletedAt =
          resource.completedAt ?? new Date().toISOString();
        const publishedDocuments: PublishedDocumentMetadata[] = manifest.map(
          (doc) => ({
            setId: resource.setId,
            documentId: doc.documentId,
            lastKnownRemoteAt: terminalCompletedAt,
            publishedContentHash: doc.submittedContentHash,
            activeSnapshotId: resource.activeSnapshotId!,
            activeAttemptId: resource.attemptId,
            lastPrimaryState: 'In sync',
          })
        );

        await reconcile({
          attempt: attemptCache(resource),
          publishedDocuments,
        });
        return;
      }
    }

    await reconcile({ attempt: attemptCache(resource) });
  }

  async function getAttempt(attemptId: string, signal?: AbortSignal) {
    const resource = await request(
      `/attempts/${encodeURIComponent(attemptId)}`,
      AttemptResponseSchema,
      signal ? { signal } : {}
    );
    await reconcileAttempt(resource);
    return resource;
  }

  return {
    async getSnapshotManifest(
      setId: string,
      signal?: AbortSignal
    ): Promise<CachedActiveSnapshotManifest> {
      const manifest = await request(
        `/sets/${encodeURIComponent(setId)}/snapshot`,
        SnapshotResponseSchema,
        signal ? { signal } : {}
      );
      return {
        ...manifest,
        documents: manifest.documents.map((document) => ({
          ...document,
          title: '',
          chunks: document.chunks.map((chunk) => ({
            ...chunk,
            chunkKey: chunk.contentHash,
          })),
        })),
      };
    },

    async createPublishAttempt(
      snapshot: FrozenPublishSnapshot,
      attemptKey: string,
      signal?: AbortSignal
    ) {
      const resource = await request(
        `/sets/${encodeURIComponent(snapshot.setId)}/attempts`,
        AttemptResponseSchema,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Attempt-Key': attemptKey,
          },
          body: JSON.stringify({
            setName: snapshot.setName,
            documents: snapshot.documents.map(({ documentId, title, body, tags }) => ({
              documentId,
              title,
              body,
              tags: [...tags],
            })),
          }),
          ...(signal ? { signal } : {}),
        }
      );

      // Require response setId to match frozen snapshot.setId (T-16-23-01)
      if (resource.setId !== snapshot.setId) {
        throw new KnowledgeClientError(
          'INVALID_RESPONSE',
          `Knowledge server response setId (${resource.setId}) does not match snapshot setId (${snapshot.setId})`
        );
      }

      // Map snapshot documents in exact submitted order to content-free frozen manifest (D-06, D-08, D-10)
      const submittedDocuments = snapshot.documents.map((doc) => ({
        documentId: doc.documentId,
        submittedContentHash: doc.contentHash,
      }));

      // Reconcile into local cache with frozen manifest before returning accepted resource (D-08, D-10)
      await reconcile({
        attempt: {
          ...attemptCache(resource),
          attemptKey,
          submittedDocuments,
        },
      });

      return resource;
    },

    getAttempt,

    async pollAttempt(
      attemptId: string,
      pollOptions: PollAttemptOptions = {}
    ): Promise<PollAttemptResult> {
      const reason = 'Mất kết nối — chưa xác định kết quả';
      let delay = pollOptions.initialDelayMs ?? 1000;
      const maxDelay = pollOptions.maxDelayMs ?? 5000;
      let last: AttemptResponse | undefined;
      try {
        while (true) {
          if (pollOptions.signal?.aborted) {
            await markUncertain(attemptId, reason);
            return {
              ...(last ?? {
                attemptId,
                setId: '',
                status: 'Publishing' as const,
                startedAt: new Date(0).toISOString(),
                metrics: {
                  addedCount: 0,
                  changedCount: 0,
                  removedCount: 0,
                  unchangedCount: 0,
                  warningCount: 0,
                },
              }),
              status: 'Publishing',
              uncertain: true,
            };
          }
          last = await getAttempt(attemptId, pollOptions.signal);
          if (last.status !== 'Publishing') return { ...last, uncertain: false };
          await sleep(delay, pollOptions.signal);
          delay = Math.min(maxDelay, delay * 2);
        }
      } catch (error: unknown) {
        if (
          error instanceof KnowledgeClientError &&
          error.code !== 'NETWORK_ERROR' &&
          !pollOptions.signal?.aborted
        ) {
          throw error;
        }
        await markUncertain(attemptId, reason);
        return {
          ...(last ?? {
            attemptId,
            setId: '',
            status: 'Publishing' as const,
            startedAt: new Date(0).toISOString(),
            metrics: {
              addedCount: 0,
              changedCount: 0,
              removedCount: 0,
              unchangedCount: 0,
              warningCount: 0,
            },
          }),
          status: 'Publishing',
          uncertain: true,
        };
      }
    },

    async getGraphStatus(
      setId: string,
      signal?: AbortSignal
    ): Promise<GraphStatusResponse> {
      return request(
        `/sets/${encodeURIComponent(setId)}/graph/status`,
        GraphStatusResponseSchema,
        signal ? { signal } : {}
      );
    },

    async triggerGraphRebuild(
      setId: string,
      rebuildKey: string,
      signal?: AbortSignal
    ): Promise<RebuildAcceptedResponse> {
      return request(
        `/sets/${encodeURIComponent(setId)}/graph/rebuild`,
        RebuildAcceptedResponseSchema,
        {
          method: 'POST',
          headers: {
            'X-Rebuild-Key': rebuildKey,
          },
          ...(signal ? { signal } : {}),
        }
      );
    },

    async getGraphFacts(
      setId: string,
      signal?: AbortSignal
    ): Promise<FactsListResponse> {
      return request(
        `/sets/${encodeURIComponent(setId)}/graph/facts`,
        FactsListResponseSchema,
        signal ? { signal } : {}
      );
    },

    async getFactEvidence(
      setId: string,
      factKey: string,
      signal?: AbortSignal
    ): Promise<FactEvidenceDetailResponse> {
      return request(
        `/sets/${encodeURIComponent(setId)}/graph/facts/${encodeURIComponent(factKey)}/evidence`,
        FactEvidenceDetailResponseSchema,
        signal ? { signal } : {}
      );
    },

    async getGraphQuarantines(
      setId: string,
      signal?: AbortSignal
    ): Promise<QuarantineListResponse> {
      return request(
        `/sets/${encodeURIComponent(setId)}/graph/quarantine`,
        QuarantineListResponseSchema,
        signal ? { signal } : {}
      );
    },

    async pollGraphStatus(
      setId: string,
      pollOptions: PollAttemptOptions = {}
    ): Promise<GraphStatusResponse & { uncertain?: boolean }> {
      let delay = pollOptions.initialDelayMs ?? 1000;
      const maxDelay = pollOptions.maxDelayMs ?? 5000;
      let last: GraphStatusResponse | undefined;

      while (true) {
        if (pollOptions.signal?.aborted) {
          return {
            ...(last ?? {
              setId,
              state: 'Building' as const,
              nodeCount: 0,
              factCount: 0,
              evidenceCount: 0,
              conflictCount: 0,
              quarantineCount: 0,
              ontologyVersion: '2026.10.1',
              rulesVersion: '2026.10.1',
            }),
            uncertain: true,
          };
        }

        try {
          last = await request(
            `/sets/${encodeURIComponent(setId)}/graph/status`,
            GraphStatusResponseSchema,
            pollOptions.signal ? { signal: pollOptions.signal } : {}
          );
          if (last.state === 'Failed') return last;
          if (last.state !== 'Building') return last;
        } catch (error: unknown) {
          if (
            error instanceof KnowledgeClientError &&
            error.code !== 'NETWORK_ERROR' &&
            !pollOptions.signal?.aborted
          ) {
            throw error;
          }
          return {
            ...(last ?? {
              setId,
              state: 'Building' as const,
              nodeCount: 0,
              factCount: 0,
              evidenceCount: 0,
              conflictCount: 0,
              quarantineCount: 0,
              ontologyVersion: '2026.10.1',
              rulesVersion: '2026.10.1',
            }),
            uncertain: true,
          };
        }

        await sleep(delay, pollOptions.signal);
        delay = Math.min(maxDelay, delay * 2);
      }
    },
  };
}

export type KnowledgeClient = ReturnType<typeof createKnowledgeClient>;
