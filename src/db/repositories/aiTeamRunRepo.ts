import { db as defaultDb, type TaskPlannerDatabase } from '../index';
import type {
  AiTeamAssignment,
  AiTeamAssignmentRunStatus,
  AiTeamBatch,
  AiTeamPlanSnapshot,
  AiTeamBatchPlanDecision,
  AiTeamBatchAbortedBy,
  TeamRunPhase,
} from '../../types/aiOffice';
import { generateId } from '../../utils/uuid';

/**
 * Run ledger (Phase 37, D-22/D-23/D-25, AIO-RUNTIME-05, AIO-GROUP-04).
 *
 * Two append-only stores: a batch row per `delegate_batch` call and one assignment row per
 * *attempt*. D-23: a retry appends a new row — the previous attempt is never mutated, so the
 * history (what failed, tokens per attempt, which result is final) stays complete.
 *
 * D-09: `transitionAssignment` is the ONLY writer of `runStatus`. It re-reads the row inside
 * one `rw` transaction and writes only when the stored status still matches `from`; a lost
 * race returns `null` and leaves the row byte-identical. Everything else (scheduler, retry,
 * abort, teardown) routes through it — never `table.update()` on assignment status.
 */

/** Renders in the UI, so the message never interpolates the id. */
const MISSING_BATCH_MESSAGE = 'Không tìm thấy lô chạy.';

export interface OpenBatchInput {
  teamId: string;
  threadId: string;
  batchIndex: number;
  userRequest: string;
  leadId: string;
  planSnapshot: AiTeamPlanSnapshot;
  planDecision: AiTeamBatchPlanDecision;
}

export interface CloseBatchPatch {
  phaseAtEnd?: TeamRunPhase | undefined;
  abortedBy: AiTeamBatchAbortedBy;
}

export interface CreateAssignmentInput {
  batchId: string;
  agentId: string;
  agentName: string;
  skillId?: string | undefined;
  skillVersion?: number | undefined;
  model: string;
  task: string;
  retryOfAssignmentId?: string | undefined;
  dependsOn?: string[] | undefined;
}

export async function openBatch(
  input: OpenBatchInput,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiTeamBatch> {
  const row: AiTeamBatch = {
    id: generateId(),
    teamId: input.teamId,
    threadId: input.threadId,
    batchIndex: input.batchIndex,
    userRequest: input.userRequest,
    leadId: input.leadId,
    planSnapshot: input.planSnapshot,
    planDecision: input.planDecision,
    startedAt: new Date().toISOString(),
    abortedBy: 'none',
  };
  await db.aiTeamBatches.add(row);
  return row;
}

/** Idempotent: a second close returns the stored row and keeps the first `endedAt`. */
export async function closeBatch(
  id: string,
  patch: CloseBatchPatch,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiTeamBatch> {
  return db.transaction('rw', [db.aiTeamBatches], async () => {
    const existing = await db.aiTeamBatches.get(id);
    if (!existing) throw new Error(MISSING_BATCH_MESSAGE);
    if (existing.endedAt !== undefined) return existing;

    const updated: AiTeamBatch = {
      ...existing,
      endedAt: new Date().toISOString(),
      abortedBy: patch.abortedBy,
    };
    if (patch.phaseAtEnd !== undefined) updated.phaseAtEnd = patch.phaseAtEnd;
    await db.aiTeamBatches.put(updated);
    return updated;
  });
}

export async function getBatch(
  id: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiTeamBatch | undefined> {
  return db.aiTeamBatches.get(id);
}

/**
 * D-23: `attemptNo` is allocated inside the insert transaction, so two concurrent retries
 * of the same root can never take the same number. The root id is the attempt-1 row.
 */
export async function createAssignment(
  input: CreateAssignmentInput,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiTeamAssignment> {
  return db.transaction('rw', [db.aiTeamAssignments, db.aiTeamBatches], async () => {
    const batch = await db.aiTeamBatches.get(input.batchId);
    if (!batch) throw new Error(MISSING_BATCH_MESSAGE);

    const id = generateId();

    let attemptNo = 1;
    if (input.retryOfAssignmentId !== undefined) {
      const previous = await db.aiTeamAssignments.get(input.retryOfAssignmentId);
      const rootOfPrevious = previous?.retryOfAssignmentId ?? input.retryOfAssignmentId;
      const siblings = await db.aiTeamAssignments
        .where('batchId')
        .equals(input.batchId)
        .toArray();
      const chain = siblings.filter(
        (row) => row.id === rootOfPrevious || row.retryOfAssignmentId === rootOfPrevious
      );
      const highest = chain.reduce((max, row) => Math.max(max, row.attemptNo), 0);
      attemptNo = highest + 1;
    }

    const row: AiTeamAssignment = {
      id,
      batchId: input.batchId,
      agentId: input.agentId,
      agentName: input.agentName,
      model: input.model,
      task: input.task,
      runStatus: 'queued',
      stopReason: 'none',
      attemptNo,
      incomplete: false,
      queuedAt: new Date().toISOString(),
    };
    if (input.skillId !== undefined) row.skillId = input.skillId;
    if (input.skillVersion !== undefined) row.skillVersion = input.skillVersion;
    if (input.retryOfAssignmentId !== undefined) {
      row.retryOfAssignmentId = input.retryOfAssignmentId;
    }
    if (input.dependsOn !== undefined) row.dependsOn = input.dependsOn;

    await db.aiTeamAssignments.add(row);
    return row;
  });
}

/**
 * D-09: the single write path for `runStatus`.
 *
 * A missing row or a mismatched `from` returns `null` and writes nothing — the caller
 * branches on it. Never throws on a lost race.
 */
export async function transitionAssignment(
  id: string,
  from: AiTeamAssignmentRunStatus,
  to: AiTeamAssignmentRunStatus,
  patch: Partial<AiTeamAssignment> = {},
  db: TaskPlannerDatabase = defaultDb
): Promise<AiTeamAssignment | null> {
  return db.transaction('rw', [db.aiTeamAssignments], async () => {
    const existing = await db.aiTeamAssignments.get(id);
    if (!existing || existing.runStatus !== from) return null;

    const updated: AiTeamAssignment = { ...existing, ...patch, runStatus: to };
    await db.aiTeamAssignments.put(updated);
    return updated;
  });
}

export async function getAssignment(
  id: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiTeamAssignment | undefined> {
  return db.aiTeamAssignments.get(id);
}

/** Stable FIFO read: queue order is plan order (D-05). */
export async function listBatchAssignments(
  batchId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiTeamAssignment[]> {
  const rows = await db.aiTeamAssignments.where('batchId').equals(batchId).toArray();
  return rows.sort((a, b) => {
    if (a.queuedAt !== b.queuedAt) return a.queuedAt < b.queuedAt ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}

/** D-13: the retry surface — only `stopped`/`error` attempts are re-runnable. */
export async function listRetryableAssignments(
  batchId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<AiTeamAssignment[]> {
  const rows = await listBatchAssignments(batchId, db);
  return rows.filter((row) => row.runStatus === 'stopped' || row.runStatus === 'error');
}
