import { createProjectionId } from '../indexing/chunkHasher.js';
import {
  projectIncrementally,
  type ProjectionDocumentInput,
  type ProjectionSummary,
} from '../indexing/incrementalProjector.js';
import { SnapshotStore, type SnapshotCandidate } from '../indexing/snapshotStore.js';
import { OversizedAtomicBlockError } from '../parser/sectionChunker.js';
import type { PublishAttemptRequest } from '../types/protocol.js';

export type AttemptStatus = 'Publishing' | 'In sync' | 'Failed';

interface StoredAttempt {
  attemptId: string;
  attemptKey: string;
  setId: string;
  candidateId: string;
  status: AttemptStatus;
  startedAt: string;
  completedAt?: string | undefined;
  input: Readonly<PublishAttemptRequest>;
  metrics: Readonly<ProjectionSummary>;
  error?: SnapshotCandidate['error'] | undefined;
  activeSnapshotId?: string | undefined;
}

export type AttemptResource = Omit<StoredAttempt, 'input'>;

export interface AttemptServiceHooks {
  beforeProject?: (() => Promise<void>) | undefined;
  beforeDocument?: ((document: Readonly<ProjectionDocumentInput>) => void) | undefined;
}

const EMPTY_METRICS: ProjectionSummary = {
  documentsAdded: 0,
  documentsChanged: 0,
  documentsRemoved: 0,
  documentsUnchanged: 0,
  chunksAdded: 0,
  chunksChanged: 0,
  chunksRemoved: 0,
  chunksUnchanged: 0,
  mutations: 0,
};

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

function immutableCopy<T>(value: T): Readonly<T> {
  return deepFreeze(structuredClone(value));
}

function safeError(error: unknown, documentId?: string): NonNullable<SnapshotCandidate['error']> {
  if (error instanceof OversizedAtomicBlockError) {
    return immutableCopy({
      code: error.code,
      message: 'Atomic Markdown block exceeds safe limit.',
      documentId: error.documentId,
      line: error.line,
      column: error.column,
      remedy: 'Split the source block and publish again.',
    });
  }
  return immutableCopy({
    code: 'DOCUMENT_PROJECTION_FAILED',
    message: 'Document projection failed.',
    ...(documentId ? { documentId } : {}),
    remedy: 'Review the indicated document and publish again.',
  });
}

export class SetPublishInProgressError extends Error {
  readonly code = 'SET_PUBLISH_IN_PROGRESS';

  constructor(readonly setId: string) {
    super('A publish attempt is already active for this document set.');
    this.name = 'SetPublishInProgressError';
  }
}

export class AttemptService {
  readonly #attempts = new Map<string, StoredAttempt>();
  readonly #attemptIdByKey = new Map<string, string>();
  readonly #activeAttemptBySet = new Map<string, string>();
  readonly #completionByAttempt = new Map<string, Promise<void>>();

  constructor(
    readonly store = new SnapshotStore(),
    readonly hooks: AttemptServiceHooks = {}
  ) {}

  accept(setId: string, attemptKey: string, payload: PublishAttemptRequest): AttemptResource {
    const key = `${setId}:${attemptKey}`;
    const replayId = this.#attemptIdByKey.get(key);
    if (replayId) return this.#response(this.#requireAttempt(replayId));
    if (this.#activeAttemptBySet.has(setId)) throw new SetPublishInProgressError(setId);

    const attemptId = createProjectionId();
    const candidateId = createProjectionId();
    const attempt: StoredAttempt = {
      attemptId,
      attemptKey,
      setId,
      candidateId,
      status: 'Publishing',
      startedAt: new Date().toISOString(),
      input: immutableCopy(payload),
      metrics: immutableCopy(EMPTY_METRICS),
    };
    this.#attempts.set(attemptId, attempt);
    this.#attemptIdByKey.set(key, attemptId);
    this.#activeAttemptBySet.set(setId, attemptId);
    this.store.createCandidate(candidateId, attemptId, setId);
    const completion = Promise.resolve()
      .then(() => this.hooks.beforeProject?.())
      .then(() => this.#process(attempt))
      .catch((error: unknown) => this.#fail(attempt, error))
      .finally(() => this.#activeAttemptBySet.delete(setId));
    this.#completionByAttempt.set(attemptId, completion);
    return this.#response(attempt);
  }

  getAttempt(attemptId: string): AttemptResource | null {
    const attempt = this.#attempts.get(attemptId);
    return attempt ? this.#response(attempt) : null;
  }

  listAttempts(): AttemptResource[] {
    return [...this.#attempts.values()].map((attempt) => this.#response(attempt));
  }

  getActiveSnapshot(setId: string) {
    return this.store.getActiveSnapshot(setId);
  }

  getAcceptedInput(attemptId: string): Readonly<PublishAttemptRequest> {
    return this.#requireAttempt(attemptId).input;
  }

  waitForAttempt(attemptId: string): Promise<void> {
    const completion = this.#completionByAttempt.get(attemptId);
    if (!completion) throw new Error(`Unknown attempt: ${attemptId}`);
    return completion;
  }

  #process(attempt: StoredAttempt): void {
    const documents: ProjectionDocumentInput[] = [];
    for (const document of attempt.input.documents) {
      const projectionInput: ProjectionDocumentInput = {
        documentId: document.documentId,
        title: document.title,
        body: document.body,
        ...(document.tags ? { tags: document.tags } : {}),
      };
      this.hooks.beforeDocument?.(projectionInput);
      documents.push(projectionInput);
    }
    const result = projectIncrementally({
      setId: attempt.setId,
      documents,
      activeSnapshot: this.store.getActiveSnapshot(attempt.setId),
      snapshotId: createProjectionId(),
    });
    this.store.completeCandidate(attempt.candidateId, result.candidate);
    const active = this.store.promoteCandidate(attempt.candidateId);
    attempt.metrics = immutableCopy(result.summary);
    attempt.activeSnapshotId = active.snapshotId;
    attempt.status = 'In sync';
    attempt.completedAt = new Date().toISOString();
  }

  #fail(attempt: StoredAttempt, error: unknown): void {
    const documentId =
      typeof error === 'object' && error && 'documentId' in error && typeof error.documentId === 'string'
        ? error.documentId
        : undefined;
    const safe = safeError(error, documentId);
    this.store.failCandidate(attempt.candidateId, safe);
    attempt.status = 'Failed';
    attempt.error = safe;
    attempt.completedAt = new Date().toISOString();
  }

  #response(attempt: StoredAttempt): AttemptResource {
    const { input: _input, ...response } = attempt;
    return structuredClone(response);
  }

  #requireAttempt(attemptId: string): StoredAttempt {
    const attempt = this.#attempts.get(attemptId);
    if (!attempt) throw new Error(`Unknown attempt: ${attemptId}`);
    return attempt;
  }
}
