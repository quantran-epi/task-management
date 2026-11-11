// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import {
  openBatch,
  closeBatch,
  createAssignment,
  transitionAssignment,
  getAssignment,
  listBatchAssignments,
} from '../../src/db/repositories/aiTeamRunRepo';
import type { AiTeamBatch } from '../../src/types/aiOffice';

const TEAM_ID = '11111111-1111-4111-8111-111111111111';
const LEAD_ID = '22222222-2222-4222-8222-222222222222';
const AGENT_ID = '33333333-3333-4333-8333-333333333333';

describe('aiTeamRunRepo (Phase 37, D-09, D-22, D-23, D-25)', () => {
  let db: TaskPlannerDatabase;
  let batch: AiTeamBatch;

  beforeEach(async () => {
    db = new TaskPlannerDatabase('TestAiTeamRunRepo_' + Math.random().toString(36).slice(2));
    await db.open();
    batch = await openBatch(
      {
        teamId: TEAM_ID,
        threadId: 'thread-1',
        batchIndex: 1,
        userRequest: 'Ship the feature',
        leadId: LEAD_ID,
        planSnapshot: { original: [{ agentId: AGENT_ID, agentName: 'E1', task: 'Write tests' }] },
        planDecision: 'auto',
      },
      db
    );
  });

  afterEach(async () => {
    await db.delete();
  });

  function assignmentInput(overrides: Record<string, unknown> = {}) {
    return {
      batchId: batch.id,
      agentId: AGENT_ID,
      agentName: 'E1',
      model: 'claude-haiku-4',
      task: 'Write tests',
      ...overrides,
    };
  }

  it('opens a batch with no end and abortedBy none', async () => {
    expect(batch.endedAt).toBeUndefined();
    expect(batch.abortedBy).toBe('none');
    expect(batch.planDecision).toBe('auto');
    expect(batch.planSnapshot.original).toHaveLength(1);
  });

  it('numbers a root as attempt 1 and its retry as attempt 2', async () => {
    const first = await createAssignment(assignmentInput(), db);
    const retry = await createAssignment(
      assignmentInput({ retryOfAssignmentId: first.id }),
      db
    );

    expect([first.attemptNo, retry.attemptNo]).toEqual([1, 2]);
    expect(retry.retryOfAssignmentId).toBe(first.id);
    expect(first.runStatus).toBe('queued');
  });

  it('allocates distinct attempt numbers for two concurrent retries', async () => {
    const first = await createAssignment(assignmentInput(), db);

    const [a, b] = await Promise.all([
      createAssignment(assignmentInput({ retryOfAssignmentId: first.id }), db),
      createAssignment(assignmentInput({ retryOfAssignmentId: first.id }), db),
    ]);

    const attemptNos = [first.attemptNo, a.attemptNo, b.attemptNo];
    expect(new Set(attemptNos).size).toBe(attemptNos.length);
    expect(attemptNos.filter((n) => n > 1).sort()).toEqual([2, 3]);
  });

  it('keeps the previous attempt row untouched when a retry is appended', async () => {
    const first = await createAssignment(assignmentInput(), db);
    await transitionAssignment(first.id, 'queued', 'error', { stopReason: 'provider' }, db);
    const before = await getAssignment(first.id, db);

    await createAssignment(assignmentInput({ retryOfAssignmentId: first.id }), db);

    expect(await getAssignment(first.id, db)).toEqual(before);
  });

  it('returns null and writes nothing when the from status does not match', async () => {
    const row = await createAssignment(assignmentInput(), db);
    const before = await getAssignment(row.id, db);

    const result = await transitionAssignment(row.id, 'running', 'done', {}, db);

    expect(result).toBeNull();
    expect(await getAssignment(row.id, db)).toEqual(before);
  });

  it('writes the target status plus the patch on a matching transition', async () => {
    const row = await createAssignment(assignmentInput(), db);

    const updated = await transitionAssignment(
      row.id,
      'queued',
      'running',
      { startedAt: '2026-11-11T01:00:00.000Z' },
      db
    );

    expect(updated?.runStatus).toBe('running');
    expect(updated?.startedAt).toBe('2026-11-11T01:00:00.000Z');
    expect((await getAssignment(row.id, db))?.runStatus).toBe('running');
  });

  it('returns null from a transition on a missing id', async () => {
    expect(await transitionAssignment('nope', 'queued', 'running', {}, db)).toBeNull();
  });

  it('keeps the first endedAt on a second close', async () => {
    const closed = await closeBatch(batch.id, { abortedBy: 'user', phaseAtEnd: 'ready' }, db);
    expect(closed.abortedBy).toBe('user');
    expect(closed.phaseAtEnd).toBe('ready');

    const again = await closeBatch(batch.id, { abortedBy: 'team-deleted' }, db);

    expect(again.endedAt).toBe(closed.endedAt);
    expect(again.abortedBy).toBe('user');
    expect(await db.aiTeamBatches.count()).toBe(1);
  });

  it('rejects an assignment whose batch does not exist', async () => {
    await expect(
      createAssignment(assignmentInput({ batchId: 'no-such-batch' }), db)
    ).rejects.toThrow('Không tìm thấy lô chạy.');
  });

  it('lists assignments FIFO in plan order', async () => {
    const a = await createAssignment(assignmentInput({ agentName: 'E1' }), db);
    const b = await createAssignment(assignmentInput({ agentName: 'E2' }), db);
    const c = await createAssignment(assignmentInput({ agentName: 'E3' }), db);

    await transitionAssignment(b.id, 'queued', 'error', {}, db);
    await transitionAssignment(c.id, 'queued', 'stopped', {}, db);

    // Same-millisecond `queuedAt` makes the FIFO tie-break the row id; assert the stable
    // order the function guarantees rather than the insertion order.
    const listed = await listBatchAssignments(batch.id, db);
    const expectedOrder = [a, b, c].sort((x, y) =>
      x.queuedAt === y.queuedAt ? x.id.localeCompare(y.id) : x.queuedAt < y.queuedAt ? -1 : 1
    );
    expect(listed.map((row) => row.id)).toEqual(expectedOrder.map((row) => row.id));
  });
});
