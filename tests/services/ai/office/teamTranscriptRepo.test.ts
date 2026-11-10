// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../../../src/db/index';
import {
  ensureTeamThread,
  saveTeamMessage,
  listRecentTurns,
  listAssignmentHistory,
  listInterruptedAssignments,
  getTeamTurn,
  buildTeamBm25Docs,
} from '../../../../src/db/repositories/teamTranscriptRepo';
import { ASSIGNMENT_HISTORY_CAP } from '../../../../src/types/aiOffice';
import {
  createEmployee,
  createLead,
  deleteEmployee,
  updateEmployee,
} from '../../../../src/db/repositories/aiOfficeRepo';
import { generateId } from '../../../../src/utils/uuid';
import { assignLeader } from '../../../../src/db/repositories/aiTeamRepo';
import { exportBackupPayload } from '../../../../src/services/backup/exportBackup';
import { restoreBackupPayload } from '../../../../src/services/backup/restoreBackup';

describe('teamTranscriptRepo (AIO-MEM-01, D-10, D-11, D-17, D-29, D-31)', () => {
  let db: TaskPlannerDatabase;
  let dbName: string;
  let teamId: string;
  let threadId: string;

  beforeEach(async () => {
    dbName = 'TestTeamTranscriptRepo_' + Math.random().toString(36).slice(2);
    db = new TaskPlannerDatabase(dbName);
    await db.open();

    teamId = generateId();
    const now = new Date().toISOString();
    await db.aiTeams.add({
      id: teamId,
      name: 'Nhóm Nghiên Cứu',
      leadId: generateId(),
      status: 'idle',
      budgetTokens: 0,
      createdAt: now,
      updatedAt: now,
    });

    threadId = (await ensureTeamThread(teamId, db)).id;
  });

  afterEach(async () => {
    await db.delete();
  });

  it('resolves the same team-scoped thread on every call', async () => {
    const first = await ensureTeamThread(teamId, db);
    const second = await ensureTeamThread(teamId, db);

    expect(second.id).toBe(first.id);
    expect(first.scopeType).toBe('team');
    expect(first.scopeKey).toBe(`team:${teamId}`);
    expect(first.title).toBe('Nhóm Nghiên Cứu');
    expect(await db.chatThreads.count()).toBe(1);
  });

  it('throws when the team does not exist', async () => {
    await expect(ensureTeamThread(generateId(), db)).rejects.toThrow();
  });

  it('persists all four attribution fields and bumps the thread updatedAt', async () => {
    const before = await db.chatThreads.get(threadId);
    const agentId = generateId();

    await new Promise((r) => setTimeout(r, 3));
    const message = await saveTeamMessage(
      {
        threadId,
        role: 'assistant',
        content: 'Báo cáo xong.',
        agentId,
        agentName: 'Lan',
        agentKind: 'employee',
        messageKind: 'report',
      },
      db
    );

    const stored = await db.chatMessages.get(message.id);
    expect(stored?.agentId).toBe(agentId);
    expect(stored?.agentName).toBe('Lan');
    expect(stored?.agentKind).toBe('employee');
    expect(stored?.messageKind).toBe('report');

    const after = await db.chatThreads.get(threadId);
    expect(after!.updatedAt > before!.updatedAt).toBe(true);
  });

  it('returns the last N turns in chronological order', async () => {
    for (let i = 0; i < 12; i += 1) {
      // Distinct milliseconds: same-ms rows tie-break on id, which is not insertion order.
      if (i > 0) await new Promise((r) => setTimeout(r, 2));
      await saveTeamMessage({ threadId, role: 'user', content: `Lượt ${i}` }, db);
    }

    const recent = await listRecentTurns(threadId, 10, db);
    expect(recent).toHaveLength(10);
    expect(recent.map((m) => m.content)).toEqual(
      Array.from({ length: 10 }, (_, i) => `Lượt ${i + 2}`)
    );
  });

  it('caps the assignment history per agent and returns it newest-first', async () => {
    const agentId = generateId();
    const otherAgentId = generateId();

    for (let i = 0; i < ASSIGNMENT_HISTORY_CAP + 5; i += 1) {
      if (i > 0) await new Promise((r) => setTimeout(r, 2));
      await saveTeamMessage(
        {
          threadId,
          role: 'assistant',
          content: `Việc ${i}`,
          agentId,
          agentName: 'Lan',
          agentKind: 'employee',
          messageKind: i % 2 === 0 ? 'instruction' : 'report',
        },
        db
      );
    }
    await saveTeamMessage(
      { threadId, role: 'assistant', content: 'Của người khác', agentId: otherAgentId, messageKind: 'report' },
      db
    );
    await saveTeamMessage(
      { threadId, role: 'assistant', content: 'Tổng hợp', agentId, messageKind: 'synthesis' },
      db
    );

    const history = await listAssignmentHistory(threadId, agentId, undefined, db);
    expect(history).toHaveLength(ASSIGNMENT_HISTORY_CAP);
    expect(history.every((m) => m.agentId === agentId)).toBe(true);
    expect(history.every((m) => m.messageKind === 'instruction' || m.messageKind === 'report')).toBe(
      true
    );
    expect(history[0]?.content).toBe(`Việc ${ASSIGNMENT_HISTORY_CAP + 4}`);
  });

  it('finds an instruction attributed to the lead when it targets this employee (CR-06)', async () => {
    const employeeId = generateId();
    const leadId = generateId();

    // Production shape: the instruction is displayed as the lead's, targeting the employee.
    await saveTeamMessage(
      {
        threadId,
        role: 'assistant',
        content: 'Việc được giao',
        agentId: leadId,
        agentName: 'Minh',
        agentKind: 'lead',
        messageKind: 'instruction',
        targetAgentId: employeeId,
      },
      db
    );
    await new Promise((r) => setTimeout(r, 2));
    await saveTeamMessage(
      {
        threadId,
        role: 'assistant',
        content: 'Báo cáo',
        agentId: employeeId,
        agentName: 'Lan',
        agentKind: 'employee',
        messageKind: 'report',
      },
      db
    );

    const history = await listAssignmentHistory(threadId, employeeId, undefined, db);
    expect(history.map((row) => row.content)).toEqual(['Báo cáo', 'Việc được giao']);
  });

  it('never returns a turn from another thread', async () => {
    const message = await saveTeamMessage(
      { threadId, role: 'assistant', content: 'Trong nhóm', agentId: generateId(), messageKind: 'report' },
      db
    );

    expect((await getTeamTurn(threadId, message.id, db))?.id).toBe(message.id);
    expect(await getTeamTurn(generateId(), message.id, db)).toBeUndefined();
    expect(await getTeamTurn(threadId, generateId(), db)).toBeUndefined();
  });

  it('keeps the stored agentName when the profile is renamed (D-17)', async () => {
    const agentId = generateId();
    const stored = await saveTeamMessage(
      {
        threadId,
        role: 'assistant',
        content: 'Báo cáo cũ.',
        agentId,
        agentName: 'Lan',
        agentKind: 'employee',
        messageKind: 'report',
      },
      db
    );

    // A rename is a profile write; the transcript row is never rewritten.
    const employee = await createEmployee(
      { name: 'Lan', role: 'Chuyên viên', capability: 'x', persona: 'y', model: 'm' },
      db
    );
    await updateEmployee(employee.id, { name: 'Lan Mới' }, db);

    expect((await db.chatMessages.get(stored.id))?.agentName).toBe('Lan');

    const fresh = await saveTeamMessage(
      {
        threadId,
        role: 'assistant',
        content: 'Báo cáo mới.',
        agentId: employee.id,
        agentName: 'Lan Mới',
        agentKind: 'employee',
        messageKind: 'report',
      },
      db
    );
    expect((await db.chatMessages.get(fresh.id))?.agentName).toBe('Lan Mới');
  });

  it('reads back a message whose employee was deleted, attribution intact (D-17)', async () => {
    const employee = await createEmployee(
      { name: 'Đã Xóa', role: 'Chuyên viên', capability: 'x', persona: 'y', model: 'm' },
      db
    );
    const stored = await saveTeamMessage(
      {
        threadId,
        role: 'assistant',
        content: 'Báo cáo của người đã xóa.',
        agentId: employee.id,
        agentName: 'Đã Xóa',
        agentKind: 'employee',
        messageKind: 'report',
      },
      db
    );

    expect(await deleteEmployee(employee.id, db)).toEqual({ deleted: true });

    const readBack = await db.chatMessages.get(stored.id);
    expect(readBack?.agentName).toBe('Đã Xóa');
    expect(readBack?.agentId).toBe(employee.id);

    const history = await listAssignmentHistory(threadId, employee.id, undefined, db);
    expect(history.map((row) => row.content)).toContain('Báo cáo của người đã xóa.');
  });

  it('projects rows into BM25 documents with agent name and message kind', async () => {    const agentMessage = await saveTeamMessage(
      {
        threadId,
        role: 'assistant',
        content: 'Tài liệu về thanh toán',
        agentId: generateId(),
        agentName: 'Lan',
        agentKind: 'employee',
        messageKind: 'report',
      },
      db
    );
    const userMessage = await saveTeamMessage(
      { threadId, role: 'user', content: 'Tìm giúp tôi' },
      db
    );

    const docs = await buildTeamBm25Docs(threadId, db);
    const agentDoc = docs.find((d) => d.id === agentMessage.id);
    const userDoc = docs.find((d) => d.id === userMessage.id);

    expect(agentDoc).toMatchObject({
      title: 'Lan',
      tags: ['report'],
      body: 'Tài liệu về thanh toán',
      updatedAt: agentMessage.createdAt,
    });
    expect(userDoc).toMatchObject({ title: 'Người dùng', tags: ['user'], body: 'Tìm giúp tôi' });
  });

  describe('listInterruptedAssignments (D-19)', () => {
    async function seedEmployee(name = 'Lan') {
      return createEmployee(
        { name, role: 'Chuyên viên', capability: 'x', persona: 'y', model: 'm' },
        db
      );
    }

    async function saveInstruction(agentId: string, task: string) {
      const leadId = generateId();
      return saveTeamMessage(
        {
          threadId,
          role: 'assistant',
          content: task,
          agentId: leadId,
          agentName: 'Minh',
          agentKind: 'lead',
          messageKind: 'instruction',
          targetAgentId: agentId,
        },
        db
      );
    }

    async function saveReport(agentId: string, content = 'Báo cáo') {
      return saveTeamMessage(
        {
          threadId,
          role: 'assistant',
          content,
          agentId,
          agentName: 'Lan',
          agentKind: 'employee',
          messageKind: 'report',
        },
        db
      );
    }

    it('reports nothing when an instruction has a later report from its agent', async () => {
      const employee = await seedEmployee();
      await saveInstruction(employee.id, 'Việc A');
      await new Promise((r) => setTimeout(r, 2));
      await saveReport(employee.id);

      expect(await listInterruptedAssignments(threadId, db)).toEqual([]);
    });

    it('reports an unanswered instruction with the agent name and task text', async () => {
      const employee = await seedEmployee('Lan');
      const instruction = await saveInstruction(employee.id, 'Việc chưa xong');

      expect(await listInterruptedAssignments(threadId, db)).toEqual([
        {
          agentId: employee.id,
          agentName: 'Lan',
          task: 'Việc chưa xong',
          createdAt: instruction.createdAt,
        },
      ]);
    });

    it('does not let a report older than the instruction satisfy it', async () => {
      const employee = await seedEmployee();
      await saveReport(employee.id, 'Báo cáo cũ');
      await new Promise((r) => setTimeout(r, 2));
      await saveInstruction(employee.id, 'Việc mới');

      const interrupted = await listInterruptedAssignments(threadId, db);
      expect(interrupted).toHaveLength(1);
      expect(interrupted[0]!.task).toBe('Việc mới');
    });

    it('still reports the unfinished turn after a real export → restore round-trip', async () => {
      // The backup validator requires the team's leadId to resolve to a lead member row.
      const lead = await createLead(
        { name: 'Minh', role: 'Lead', capability: 'x', persona: 'y', model: 'm' },
        db
      );
      await assignLeader(teamId, lead.id, db);

      const employee = await seedEmployee('Lan');
      await saveInstruction(employee.id, 'Việc bị gián đoạn');

      const envelope = await exportBackupPayload(db);
      const restoredName = 'TestTeamTranscriptRestored_' + Math.random().toString(36).slice(2);
      const restored = new TaskPlannerDatabase(restoredName);
      await restored.open();
      try {
        await restoreBackupPayload(envelope, restored);

        expect(await listInterruptedAssignments(threadId, restored)).toEqual([
          {
            agentId: employee.id,
            agentName: 'Lan',
            task: 'Việc bị gián đoạn',
            createdAt: expect.any(String),
          },
        ]);
      } finally {
        await restored.delete();
      }
    });

    it('writes nothing while reading', async () => {
      const employee = await seedEmployee();
      await saveInstruction(employee.id, 'Việc A');

      const messagesBefore = await db.chatMessages.count();
      const tabsBefore = await db.chatTabs.toArray();

      await listInterruptedAssignments(threadId, db);

      expect(await db.chatMessages.count()).toBe(messagesBefore);
      expect(await db.chatTabs.toArray()).toEqual(tabsBefore);
    });
  });
});
