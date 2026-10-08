import { z } from 'zod';
import type { TaskPlannerDatabase } from '../../db';
import {
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
        line: z.number().int().positive().optional(),
        column: z.number().int().positive().optional(),
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

type AttemptResponse = z.infer<typeof AttemptResponseSchema>;

export type KnowledgeClientErrorCode =
  | 'NETWORK_ERROR'
  | 'INVALID_RESPONSE'
  | 'REMOTE_ERROR';

export class KnowledgeClientError extends Error {
  constructor(
    public readonly code: KnowledgeClientErrorCode,
    message: string,
    public readonly status?: number
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
        response.status
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
      await reconcileAttempt(resource);
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
  };
}

export type KnowledgeClient = ReturnType<typeof createKnowledgeClient>;
