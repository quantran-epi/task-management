// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../../../src/db/index';
import {
  createTeamRunCoordinator,
  type TeamRunCoordinator,
} from '../../../../src/services/ai/office/teamRunCoordinator';
import { createEmployee, createLead } from '../../../../src/db/repositories/aiOfficeRepo';
import { createTeam, deleteTeam } from '../../../../src/db/repositories/aiTeamRepo';
import { ensureTeamThread } from '../../../../src/db/repositories/teamTranscriptRepo';
import { disposeRun, getOrCreateRun } from '../../../../src/services/ai/office/teamRunManager';
import { aiTurnManager } from '../../../../src/services/ai/aiTurnManager';
import { getCursor } from '../../../../src/services/ai/office/teamEventLog';
import type { AiEmployee, AiTeam } from '../../../../src/types/aiOffice';
import type { AiOrchestratorLoopOptions } from '../../../../src/services/ai/aiOrchestratorLoop';
import type { ChatTurnRuntimeDeps } from '../../../../src/components/ai/runtime/chatTurnRuntime';

/**
 * Roadmap SC5 / 37-06: a delete that lands MID-RUN. The unit suites prove each half
 * separately (`dispose` against a real coordinator; explorer call order against a stub), so
 * this is the only test that runs a REAL coordinator through `disposeRun` + `deleteTeam`
 * while a batch is in flight, then asserts post-delete write silence and turn drain.
 */

type LoopScript = (options: AiOrchestratorLoopOptions) => Promise<unknown>;

const loopResult = (fullResponse: string) => ({
  fullResponse,
  cleanResponse: fullResponse,
  messages: [],
  tokenUsage: {},
  generatedFiles: [],
  truncated: false,
  loopLimitReached: false,
});

const sleep = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

function deferred(): { promise: Promise<void>; release: () => void } {
  const box: { release: () => void } = { release: () => {} };
  const promise = new Promise<void>((resolve) => {
    box.release = resolve;
  });
  return { promise, release: () => box.release() };
}

async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error('waitFor timeout');
    await sleep(5);
  }
}

/** Above the manager's 800ms purge, same idiom as the coordinator suite. */
const PURGE_WINDOW_MS = 1200;

const LEAD_MODEL = 'lead-model';
const EMP_MODELS = ['emp-a-model', 'emp-b-model', 'emp-c-model'];

describe('delete a team mid-run through disposeRun + deleteTeam (SC5, D-18)', () => {
  let db: TaskPlannerDatabase | null = null;

  afterEach(async () => {
    aiTurnManager.abortAll();
    for (const turn of aiTurnManager.getAllTurns()) aiTurnManager.finishTurn(turn.id);
    if (db) await db.delete();
    db = null;
  });

  it('drains every turn and writes nothing after the delete resolves', async () => {
    const gate = deferred();
    const startedModels: string[] = [];

    db = new TaskPlannerDatabase('TestDisposeMidRun_' + Math.random().toString(36).slice(2));
    await db.open();

    const lead = await createLead(
      {
        name: 'Minh',
        role: 'Trưởng nhóm',
        capability: 'Điều phối',
        persona: 'Bạn là Minh.',
        model: LEAD_MODEL,
      },
      db
    );
    const employees: AiEmployee[] = [];
    for (let index = 0; index < EMP_MODELS.length; index += 1) {
      employees.push(
        await createEmployee(
          {
            name: `Nhân viên ${index + 1}`,
            role: 'Chuyên viên',
            capability: 'Hỗ trợ',
            persona: `Bạn là nhân viên ${index + 1}.`,
            model: EMP_MODELS[index]!,
          },
          db
        )
      );
    }
    const team: AiTeam = await createTeam(
      {
        name: 'Nhóm cần xoá giữa lượt',
        status: 'active',
        budgetTokens: 3000,
        autoSplitEnabled: true,
        concurrencyLimit: 1,
        leadId: lead.id,
        employeeIds: employees.map((row) => row.id),
      },
      db
    );
    const threadId = (await ensureTeamThread(team.id, db)).id;

    const scripts: Record<string, LoopScript> = {
      [LEAD_MODEL]: async (options) => {
        await options.executeToolFn!(
          'delegate_batch',
          {
            assignments: employees.map((row, index) => ({
              agentId: row.id,
              task: `Việc ${index + 1}`,
            })),
          },
          db!,
          options.signal
        );
        return loopResult('Xong.');
      },
    };
    for (const model of EMP_MODELS) {
      scripts[model] = async () => {
        startedModels.push(model);
        await gate.promise;
        return loopResult(`báo cáo ${model}`);
      };
    }

    const createRuntimeDeps = (agentId: string): Partial<ChatTurnRuntimeDeps> => ({
      runLoop: ((loopOptions: AiOrchestratorLoopOptions) => {
        const script = scripts[loopOptions.model];
        if (!script) throw new Error(`No script for model ${loopOptions.model} (agent ${agentId})`);
        return script(loopOptions);
      }) as unknown as ChatTurnRuntimeDeps['runLoop'],
    });

    // The PRODUCTION path: the manager owns the coordinator, exactly as the explorer uses it.
    const coordinator: TeamRunCoordinator = await getOrCreateRun(db, team.id, threadId, () =>
      createTeamRunCoordinator({
        db: db!,
        team,
        lead,
        employees,
        skills: [],
        threadId,
        model: LEAD_MODEL,
        endpoint: 'https://example.invalid/v1',
        apiKey: 'sk-test',
        createRuntimeDeps,
      })
    );

    // Limit 1: one admitted, two queued in plan order. The create/dispatch loop awaits per
    // assignment, so the row count is the honest "all three dispatched" signal.
    const sent = coordinator.send('Làm báo cáo');
    await waitFor(() => coordinator.getRunningCount() === 1);
    await waitFor(() => startedModels.length === 1);
    await (async () => {
      const startedAt = Date.now();
      while ((await db!.aiTeamAssignments.count()) < 3) {
        if (Date.now() - startedAt > 3000) throw new Error('ledger did not reach three rows');
        await sleep(5);
      }
    })();
    expect(startedModels).toEqual([EMP_MODELS[0]]);
    const statuses = coordinator.getState().agents.map((row) => row.status);
    expect(statuses.filter((status) => status === 'queued')).toHaveLength(2);

    // The explorer's real delete sequence (AiOfficeExplorer.handleDeleteTeam).
    await disposeRun(db, team.id);
    await deleteTeam(team.id, db);
    const deletedAt = new Date().toISOString();

    // CR-01: the ledger died with the team; the thread's messages went with the thread.
    expect(await db.aiTeamAssignments.count()).toBe(0);
    expect(await db.aiTeamBatches.count()).toBe(0);
    expect(await db.chatMessages.where('threadId').equals(threadId).count()).toBe(0);

    // Releasing the held turn afterwards must not resurrect anything.
    gate.release();
    await sent;
    await sleep(50);

    const messagesAfter = await db.chatMessages.where('threadId').equals(threadId).toArray();
    expect(messagesAfter).toHaveLength(0);
    expect(messagesAfter.filter((row) => row.createdAt >= deletedAt)).toHaveLength(0);
    expect(await db.aiTeamAssignments.count()).toBe(0);
    expect(await db.aiTeamBatches.count()).toBe(0);
    // The queued agents never got admitted either — a slot was never handed to a dead run.
    expect(startedModels).toEqual([EMP_MODELS[0]]);

    // D-19/AIO-RUNTIME-03: every registered turn drains within the manager purge window.
    await waitFor(() => aiTurnManager.getActiveTurns().length === 0, PURGE_WINDOW_MS + 2000);
    expect(aiTurnManager.getActiveTurns()).toHaveLength(0);
  }, 20000);
});

describe('delete a team while a steer is in flight (SC5)', () => {
  let db: TaskPlannerDatabase | null = null;

  afterEach(async () => {
    aiTurnManager.abortAll();
    for (const turn of aiTurnManager.getAllTurns()) aiTurnManager.finishTurn(turn.id);
    if (db) await db.delete();
    db = null;
  });

  /** Shared fixture: a real coordinator with one employee parked on a gate. */
  async function setup() {
    const gate = deferred();
    const steerTurnGate = deferred();
    const startedModels: string[] = [];
    /** Proves the steer turn was really in flight when the teardown landed. */
    const steerTurnStarted = { count: 0 };

    db = new TaskPlannerDatabase('TestDisposeSteer_' + Math.random().toString(36).slice(2));
    await db.open();

    const lead = await createLead(
      {
        name: 'Minh',
        role: 'Trưởng nhóm',
        capability: 'Điều phối',
        persona: 'Bạn là Minh.',
        model: LEAD_MODEL,
      },
      db
    );
    const employees: AiEmployee[] = [];
    for (let index = 0; index < EMP_MODELS.length; index += 1) {
      employees.push(
        await createEmployee(
          {
            name: `Nhân viên ${index + 1}`,
            role: 'Chuyên viên',
            capability: 'Hỗ trợ',
            persona: `Bạn là nhân viên ${index + 1}.`,
            model: EMP_MODELS[index]!,
          },
          db
        )
      );
    }
    const team: AiTeam = await createTeam(
      {
        name: 'Nhóm xoá giữa chỉ đạo',
        status: 'active',
        budgetTokens: 3000,
        autoSplitEnabled: true,
        concurrencyLimit: 3,
        leadId: lead.id,
        employeeIds: employees.map((row) => row.id),
      },
      db
    );
    const threadId = (await ensureTeamThread(team.id, db)).id;

    const scripts: Record<string, LoopScript> = {
      [LEAD_MODEL]: async (options) => {
        const last = String(options.messages.at(-1)?.content ?? '');
        if (last === 'Làm báo cáo') {
          await options.executeToolFn!(
            'delegate_batch',
            {
              assignments: employees.map((row, index) => ({
                agentId: row.id,
                task: `Việc ${index + 1}`,
              })),
            },
            db!,
            options.signal
          );
          return loopResult('Xong.');
        }
        // The steer turn: park so the teardown lands while it is in flight.
        steerTurnStarted.count += 1;
        await steerTurnGate.promise;
        return loopResult('Đã đọc chỉ đạo.');
      },
    };
    for (const model of EMP_MODELS) {
      scripts[model] = async () => {
        startedModels.push(model);
        await gate.promise;
        return loopResult(`báo cáo ${model}`);
      };
    }

    const createRuntimeDeps = (agentId: string): Partial<ChatTurnRuntimeDeps> => ({
      runLoop: ((loopOptions: AiOrchestratorLoopOptions) => {
        const script = scripts[loopOptions.model];
        if (!script) throw new Error(`No script for model ${loopOptions.model} (agent ${agentId})`);
        return script(loopOptions);
      }) as unknown as ChatTurnRuntimeDeps['runLoop'],
    });

    const coordinator: TeamRunCoordinator = await getOrCreateRun(db, team.id, threadId, () =>
      createTeamRunCoordinator({
        db: db!,
        team,
        lead,
        employees,
        skills: [],
        threadId,
        model: LEAD_MODEL,
        endpoint: 'https://example.invalid/v1',
        apiKey: 'sk-test',
        createRuntimeDeps,
      })
    );

    return {
      gate,
      steerTurnGate,
      startedModels,
      steerTurnStarted,
      coordinator,
      team,
      threadId,
      employees,
    };
  }

  it('an in-flight steer turn leaves no active turns', async () => {
    const { gate, steerTurnGate, steerTurnStarted, coordinator, team } = await setup();

    const sent = coordinator.send('Làm báo cáo');
    await waitFor(() => coordinator.getState().phase === 'batch-running');
    await waitFor(() => coordinator.getState().agents.filter((r) => r.status === 'running').length === 3);

    // Not awaited: the composer is fire-and-forget, and this turn parks on the gate so the
    // teardown can land while it is genuinely in flight.
    const steered = coordinator.send('chỉ đạo giữa lô');
    await waitFor(() => steerTurnStarted.count === 1);

    await disposeRun(db!, team.id);
    await deleteTeam(team.id, db!);

    gate.release();
    steerTurnGate.release();
    await sent;
    await steered;

    await waitFor(() => aiTurnManager.getActiveTurns().length === 0, PURGE_WINDOW_MS + 2000);
    expect(aiTurnManager.getActiveTurns()).toHaveLength(0);
  }, 20000);

  it('no row is written after deletedAt', async () => {
    const { gate, steerTurnGate, coordinator, team, threadId } = await setup();

    let teamMessageCount = 0;
    const stopWatching = setInterval(() => {
      void db!.teamMessages.count().then((n) => {
        teamMessageCount = n;
      });
    }, 5);

    const sent = coordinator.send('Làm báo cáo');
    await waitFor(() => coordinator.getState().phase === 'batch-running');
    await waitFor(() => coordinator.getState().agents.filter((r) => r.status === 'running').length === 3);
    const steered = coordinator.send('chỉ đạo giữa lô');
    // The message is in the log; the coordinator's own drain owns the read.
    await waitFor(() => teamMessageCount > 0);
    clearInterval(stopWatching);

    // Asserted BEFORE `deleteTeam`: that call empties both tables, so a post-delete
    // assertion would pass trivially.
    const cutoff = new Date().toISOString();
    await disposeRun(db!, team.id);
    await sleep(50);

    const messages = await db!.chatMessages.where('threadId').equals(threadId).toArray();
    expect(messages.filter((row) => row.createdAt > cutoff)).toHaveLength(0);

    const assignments = await db!.aiTeamAssignments.toArray();
    for (const row of assignments) {
      // `AiTeamAssignment` has no `createdAt`/`updatedAt` — asserting either is vacuous.
      expect(row.queuedAt > cutoff).toBe(false);
      if (row.startedAt !== undefined) expect(row.startedAt > cutoff).toBe(false);
      if (row.endedAt !== undefined) expect(row.endedAt > cutoff).toBe(false);
    }

    gate.release();
    steerTurnGate.release();
    await sent;
    await steered;
    await deleteTeam(team.id, db!);
    await waitFor(() => aiTurnManager.getActiveTurns().length === 0, PURGE_WINDOW_MS + 2000);
  }, 20000);

  // AIO-STEER-05 / SC5: after a teardown the drain must consume nothing, so a message the
  // agent never read stays unread in the log. The cursor is the only read receipt now.
  it('a post-dispose drain consumes no message and advances no cursor', async () => {
    const { gate, steerTurnGate, coordinator, team, employees } = await setup();

    const sent = coordinator.send('Làm báo cáo');
    await waitFor(() => coordinator.getState().phase === 'batch-running');
    await waitFor(() => coordinator.getState().agents.filter((r) => r.status === 'running').length === 3);

    const target = employees[0]!;
    const steered = coordinator.send(`@[${target.name}](agent:${target.id}) đổi hướng`);

    // `disposeRun` ONLY — `deleteTeam` would empty the table and make the assertion vacuous.
    await disposeRun(db!, team.id);

    const cursorBefore = await getCursor(team.id, target.id, db!);
    const injected = await coordinator.drainInbox(target.id);
    expect(injected).toEqual([]);
    const cursorAfter = await getCursor(team.id, target.id, db!);
    expect(cursorAfter.lastSeq).toBe(cursorBefore.lastSeq);

    gate.release();
    steerTurnGate.release();
    await sent;
    await steered;
    await waitFor(() => aiTurnManager.getActiveTurns().length === 0, PURGE_WINDOW_MS + 2000);
  }, 20000);
});
