// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../../../src/db/index';
import {
  abortAllAssignmentControllers,
  createTeamRunCoordinator,
  EMPLOYEE_AMEND_REFUSAL,
  resolveTeamToolName,
  STOPPED_REPORT_COPY,
  type TeamRunCoordinator,
  type TurnRoster,
} from '../../../../src/services/ai/office/teamRunCoordinator';
import { TEAM_TOOL_DEFINITIONS } from '../../../../src/services/ai/office/teamTools';
import {
  createEmployee,
  createLead,
  createSkill,
  deleteEmployee,
} from '../../../../src/db/repositories/aiOfficeRepo';
import {
  isAgentInUse,
  isSkillInUse,
  reset,
} from '../../../../src/services/ai/office/liveUseRegistry';
import { createTeam, updateTeam } from '../../../../src/db/repositories/aiTeamRepo';
import {
  ensureTeamThread,
  listInterruptedAssignments,
  saveTeamMessage,
} from '../../../../src/db/repositories/teamTranscriptRepo';
import { getMessagesByThreadId } from '../../../../src/db/repositories/chatRepo';
import {
  createAssignment,
  openBatch,
} from '../../../../src/db/repositories/aiTeamRunRepo';
import { aiTurnManager } from '../../../../src/services/ai/aiTurnManager';
import { EMPLOYEE_READ_ONLY_ALLOWLIST } from '../../../../src/services/ai/chatTurnTools';
import { payloadHasMutationTool } from '../../../../src/services/ai/chatTurnTools';
import { isMutationTool, normalizeToolName } from '../../../../src/services/ai/aiTools';
import type { AiEmployee, AiLead, AiSkill, AiTeam } from '../../../../src/types/aiOffice';
import type { AiOrchestratorLoopOptions } from '../../../../src/services/ai/aiOrchestratorLoop';
import type { AiToolDefinition } from '../../../../src/services/ai/aiTools';
import type { ChatTurnRuntimeDeps } from '../../../../src/components/ai/runtime/chatTurnRuntime';

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

const LEAD_MODEL = 'lead-model';
const EMP_A_MODEL = 'emp-a-model';
const EMP_B_MODEL = 'emp-b-model';
const EMP_C_MODEL = 'emp-c-model';
const EMP_D_MODEL = 'emp-d-model';
const EMP_E_MODEL = 'emp-e-model';

const sleep = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

/** TS narrows a `let` assigned inside a callback to its initial value; a holder avoids that. */
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

/**
 * D-24: the lead runs TWICE per batch — the dispatch turn, then a synthesis turn opened by
 * `onBatchSettled`. A script that delegates must answer on the synthesis turn instead of
 * opening a second batch, or it would re-dispatch the whole roster.
 */
const SYNTHESIS_MARKER = 'Tổng hợp lại kết quả của lô';

const isSynthesisTurn = (options: AiOrchestratorLoopOptions): boolean =>
  String(options.messages.at(-1)?.content).includes(SYNTHESIS_MARKER);

/** The whole batch is over — synthesis included — once the phase is back to `ready`. */
const waitForReady = (coordinator: TeamRunCoordinator, timeoutMs = 5000): Promise<void> =>
  waitFor(() => coordinator.getState().phase === 'ready', timeoutMs);

interface HarnessOptions {
  scripts: Record<string, LoopScript>;
  teamPatch?: Partial<
    Pick<AiTeam, 'autoSplitEnabled' | 'autoApproveMutations' | 'budgetTokens' | 'concurrencyLimit'>
  >;
  /** D-03 seam: when true, the coordinator reads its roster from `harness.roster` per turn. */
  useSeam?: boolean;
  /** Extra roster members beyond A/B/C (each gets a distinct model `emp-<d|e>-model`). */
  extraEmployees?: number;
  /**
   * D-24: the lead runs twice per batch. This script runs on the SYNTHESIS turn instead of
   * `scripts[LEAD_MODEL]`, so a delegating lead script cannot open a second batch. Tests that
   * assert synthesis-prompt content pass their own.
   */
  synthesisScript?: LoopScript;
}

interface Harness {
  db: TaskPlannerDatabase;
  team: AiTeam;
  lead: AiLead;
  employees: AiEmployee[];
  skill: AiSkill;
  threadId: string;
  coordinator: TeamRunCoordinator;
  /** Mutable per-turn roster when `useSeam` is on; a test edits it between sends. */
  roster: TurnRoster;
}

async function createHarness(options: HarnessOptions): Promise<Harness> {
  const db = new TaskPlannerDatabase('TestTeamRunCoordinator_' + Math.random().toString(36).slice(2));
  await db.open();

  const skill = await createSkill(
    { name: 'Phân tích thanh toán', description: 'Quy trình đối soát', body: '# Quy trình\nBước 1.' },
    db
  );
  const lead = await createLead(
    { name: 'Minh', role: 'Trưởng nhóm', capability: 'Điều phối', persona: 'Bạn là Minh.', model: LEAD_MODEL },
    db
  );
  const employeeA = await createEmployee(
    {
      name: 'An',
      role: 'Chuyên viên',
      capability: 'Phân tích',
      persona: 'Bạn là An.',
      model: EMP_A_MODEL,
      skillId: skill.id,
    },
    db
  );
  const employeeB = await createEmployee(
    { name: 'Bình', role: 'Chuyên viên', capability: 'Kiểm thử', persona: 'Bạn là Bình.', model: EMP_B_MODEL },
    db
  );
  const employeeC = await createEmployee(
    { name: 'Chi', role: 'Chuyên viên', capability: 'Tài liệu', persona: 'Bạn là Chi.', model: EMP_C_MODEL },
    db
  );
  const employees = [employeeA, employeeB, employeeC];
  // Task 1 of 37-04 needs a batch larger than the limit; the extra members keep the three
  // canonical employees untouched so no existing test changes shape.
  const extraNames = ['Dũng', 'Em'];
  const extraModels = [EMP_D_MODEL, EMP_E_MODEL];
  for (let index = 0; index < (options.extraEmployees ?? 0); index += 1) {
    employees.push(
      await createEmployee(
        {
          name: extraNames[index] ?? `Phụ ${index}`,
          role: 'Chuyên viên',
          capability: 'Hỗ trợ',
          persona: `Bạn là ${extraNames[index] ?? `Phụ ${index}`}.`,
          model: extraModels[index] ?? `emp-extra-${index}-model`,
        },
        db
      )
    );
  }

  const team = await createTeam(
    {
      name: 'Nhóm Thanh Toán',
      leadId: lead.id,
      status: 'active',
      budgetTokens: options.teamPatch?.budgetTokens ?? 3000,
      ...(options.teamPatch?.autoSplitEnabled !== undefined
        ? { autoSplitEnabled: options.teamPatch.autoSplitEnabled }
        : {}),
      ...(options.teamPatch?.autoApproveMutations !== undefined
        ? { autoApproveMutations: options.teamPatch.autoApproveMutations }
        : {}),
      ...(options.teamPatch?.concurrencyLimit !== undefined
        ? { concurrencyLimit: options.teamPatch.concurrencyLimit }
        : {}),
      employeeIds: employees.map((row) => row.id),
    },
    db
  );
  const threadId = (await ensureTeamThread(team.id, db)).id;

  const createRuntimeDeps = (agentId: string): Partial<ChatTurnRuntimeDeps> => ({
    runLoop: ((loopOptions: AiOrchestratorLoopOptions) => {
      // D-24: the synthesis turn is a separate lead turn. Default it to a canned answer so a
      // delegating lead script cannot dispatch a second batch; tests that assert the
      // synthesis prompt pass `synthesisScript`.
      const script = isSynthesisTurn(loopOptions)
        ? options.synthesisScript ?? (async () => loopResult('Đã tổng hợp.'))
        : options.scripts[loopOptions.model];
      if (!script) throw new Error(`No script for model ${loopOptions.model} (agent ${agentId})`);
      return script(loopOptions);
    }) as unknown as ChatTurnRuntimeDeps['runLoop'],
  });

  const roster: TurnRoster = {
    teamRow: team,
    lead,
    employees,
    skills: [skill],
    memberAgentIds: employees.map((row) => row.id),
  };

  const coordinator = createTeamRunCoordinator({
    db,
    team,
    lead,
    employees,
    skills: [skill],
    threadId,
    model: LEAD_MODEL,
    endpoint: 'https://example.invalid/v1',
    apiKey: 'sk-test',
    createRuntimeDeps,
    // A fresh snapshot object per turn, so a later mutation of `roster` cannot reach a turn.
    ...(options.useSeam
      ? {
          loadRoster: async (): Promise<TurnRoster> => ({
            ...roster,
            employees: [...roster.employees],
            skills: [...roster.skills],
            memberAgentIds: [...roster.memberAgentIds],
          }),
        }
      : {}),
  });

  return { db, team, lead, employees, skill, threadId, coordinator, roster };
}

describe('teamRunCoordinator (AIO-TEAM-01..04, D-01..D-08, D-12..D-14, D-22)', () => {
  let harness: Harness | null = null;

  afterEach(async () => {
    aiTurnManager.abortAll();
    for (const turn of aiTurnManager.getAllTurns()) aiTurnManager.finishTurn(turn.id);
    if (harness) await harness.db.delete();
    harness = null;
  });

  describe('Task 1 — state machine, routing, payloads, turn registration', () => {
    it('routes a bare message to the lead and moves the phase to lead-thinking', async () => {
      const leadTurn = deferred();
      harness = await createHarness({
        scripts: {
          [LEAD_MODEL]: async () => {
            await leadTurn.promise;
            return loopResult('Xong.');
          },
        },
      });
      const { coordinator, lead } = harness;

      void coordinator.send('Xin chào');
      await waitFor(() => coordinator.getState().phase === 'lead-thinking');

      const state = coordinator.getState();
      expect(state.agents.find((row) => row.agentId === lead.id)?.status).toBe('running');
      leadTurn.release();
      await waitFor(() => coordinator.getState().agents.every((row) => row.status === 'done'));
    });

    it('routes a mention to that employee and does not start the lead', async () => {
      const started: string[] = [];
      harness = await createHarness({
        scripts: {
          [LEAD_MODEL]: async () => {
            started.push('lead');
            return loopResult('lead');
          },
          [EMP_A_MODEL]: async () => {
            started.push('emp-a');
            return loopResult('báo cáo');
          },
        },
      });
      const { coordinator, employees } = harness;

      await coordinator.send('@[An](agent:' + employees[0]!.id + ') kiểm tra giúp');

      expect(started).toEqual(['emp-a']);
      const state = coordinator.getState();
      expect(state.agents.find((row) => row.agentId === employees[0]!.id)?.status).toBe('done');
      expect(state.agents.find((row) => row.agentId === harness!.lead.id)).toBeUndefined();
    });

    it('falls back to the lead when the mention names an id outside the roster', async () => {
      const started: string[] = [];
      harness = await createHarness({
        scripts: {
          [LEAD_MODEL]: async () => {
            started.push('lead');
            return loopResult('lead');
          },
        },
      });

      await harness.coordinator.send('@[Ghost](agent:00000000-0000-4000-8000-000000000000) chào');

      expect(started).toEqual(['lead']);
    });

    it('exposes the snapshot shape and notifies subscribers until unsubscribed', async () => {
      harness = await createHarness({
        scripts: { [LEAD_MODEL]: async () => loopResult('Xong.') },
      });
      const { coordinator } = harness;

      const initial = coordinator.getState();
      expect(initial).toEqual({
        phase: 'idle',
        agents: [],
        pendingPlan: null,
        pendingApproval: null,
        pendingSteerMessageIds: [],
          pausedAgentId: null,
        pausedAgentName: null,
        lastPlan: null,
        lastPlanDecision: null,
      });

      let calls = 0;
      const unsubscribe = coordinator.subscribe(() => {
        calls += 1;
      });
      await coordinator.send('Xin chào');
      expect(calls).toBeGreaterThan(0);

      const before = calls;
      unsubscribe();
      await coordinator.send('Lần nữa');
      expect(calls).toBe(before);
    });

    it('registers namespaced team and per-agent turn ids', async () => {
      const leadTurn = deferred();
      harness = await createHarness({
        scripts: {
          [LEAD_MODEL]: async () => {
            await leadTurn.promise;
            return loopResult('Xong.');
          },
        },
      });
      const { coordinator, team, lead } = harness;

      void coordinator.send('Xin chào');
      await waitFor(() => coordinator.getState().phase === 'lead-thinking');

      expect(aiTurnManager.getTurn(`team:${team.id}`)).toBeDefined();
      expect(aiTurnManager.getTurn(`team:${team.id}:agent:${lead.id}`)).toBeDefined();
      expect(`team:${team.id}`).not.toBe(team.id);
      leadTurn.release();
      await waitFor(() => coordinator.getState().agents.every((row) => row.status === 'done'));
    });

    it('composes the lead payload from LEAD_TOOL_ALLOWLIST plus every team tool', async () => {
      let captured: any[] = [];
      harness = await createHarness({
        scripts: {
          [LEAD_MODEL]: async (options) => {
            captured = options.tools ?? [];
            return loopResult('Xong.');
          },
        },
      });

      await harness.coordinator.send('Xin chào');

      const names = captured.map((tool) => normalizeToolName(tool.function.name));
      for (const definition of TEAM_TOOL_DEFINITIONS) {
        expect(names).toContain(normalizeToolName(definition.function.name));
      }
      expect(names).toContain('delegate_batch');
      expect(captured.length).toBeGreaterThan(0);
    });

    it('composes the employee payload with no mutation tool and no delegate_batch', async () => {
      let captured: any[] = [];
      harness = await createHarness({
        scripts: {
          [EMP_A_MODEL]: async (options) => {
            captured = options.tools ?? [];
            return loopResult('báo cáo');
          },
        },
      });
      const { coordinator, employees } = harness;

      await coordinator.send('@[An](agent:' + employees[0]!.id + ') kiểm tra giúp');

      const names = captured.map((tool) => normalizeToolName(tool.function.name));
      expect(names).not.toContain('delegate_batch');
      expect(names.some((name) => isMutationTool(name))).toBe(false);
      expect(payloadHasMutationTool(captured)).toBe(false);
      expect(names).toContain('search_team_history');
    });

    it('starts each agent with its own model (AIO-EMP-01)', async () => {
      const models: string[] = [];
      harness = await createHarness({
        scripts: {
          [LEAD_MODEL]: async (options) => {
            models.push(options.model);
            return loopResult('Xong.');
          },
          [EMP_B_MODEL]: async (options) => {
            models.push(options.model);
            return loopResult('báo cáo');
          },
        },
      });
      const { coordinator, employees } = harness;

      await coordinator.send('Xin chào');
      await coordinator.send('@[Bình](agent:' + employees[1]!.id + ') kiểm tra');

      expect(models).toEqual([LEAD_MODEL, EMP_B_MODEL]);
    });

    it('has no React import', () => {
      const source = readFileSync(
        new URL('../../../../src/services/ai/office/teamRunCoordinator.ts', import.meta.url),
        'utf8'
      );
      expect(source).not.toMatch(/from ['"]react['"]/);
    });
  });

  describe('Task 2 — delegate_batch interception, plan park, concurrent batch', () => {
    const assignmentsFor = (employees: AiEmployee[]) =>
      employees.map((row, index) => ({ agentId: row.id, task: `Việc ${index + 1}` }));

    it('parks on the plan card and only runs the batch after approval', async () => {
      let toolResult: string | null = null;
      let harnessRef: Harness | null = null;
      const scripts: Record<string, LoopScript> = {
        [LEAD_MODEL]: async (options) => {
          if (isSynthesisTurn(options)) return loopResult('Đã tổng hợp.');
          toolResult = await options.executeToolFn!(
            'delegate_batch',
            { assignments: assignmentsFor(harnessRef!.employees) },
            harnessRef!.db,
            options.signal
          );
          return loopResult('Đã giao việc.');
        },
        [EMP_A_MODEL]: async () => loopResult('A xong'),
        [EMP_B_MODEL]: async () => loopResult('B xong'),
        [EMP_C_MODEL]: async () => loopResult('C xong'),
      };
      harness = await createHarness({ scripts });
      harnessRef = harness;
      const { coordinator } = harness;

      const sent = coordinator.send('Làm báo cáo');
      await waitFor(() => coordinator.getState().phase === 'awaiting-plan');

      const pending = coordinator.getState().pendingPlan;
      expect(pending?.assignments).toHaveLength(3);
      expect(pending?.assignments[0]?.agentName).toBe('An');
      expect(toolResult).toBeNull();

      coordinator.resolvePlan(true);
      await sent;
      await waitForReady(coordinator);

      expect(coordinator.getState().pendingPlan).toBeNull();
      // D-24: the tool result is an ACK, not settled results.
      const ack = JSON.parse(toolResult as unknown as string);
      expect(ack).toMatchObject({ dispatched: 3, status: 'dispatched' });
      expect(ack.agents).toHaveLength(3);

      await waitForReady(coordinator);
      const rows = await harness.db.aiTeamAssignments.toArray();
      expect(rows.map((row) => row.runStatus)).toEqual(['done', 'done', 'done']);
    });

    it('starts nothing when the plan is rejected', async () => {
      let toolResult: string | null = null;
      let harnessRef: Harness | null = null;
      const employeeStarts: string[] = [];
      const scripts: Record<string, LoopScript> = {
        [LEAD_MODEL]: async (options) => {
          toolResult = await options.executeToolFn!(
            'delegate_batch',
            { assignments: assignmentsFor(harnessRef!.employees) },
            harnessRef!.db,
            options.signal
          );
          return loopResult('Đã huỷ.');
        },
        [EMP_A_MODEL]: async () => {
          employeeStarts.push('a');
          return loopResult('A');
        },
      };
      harness = await createHarness({ scripts });
      harnessRef = harness;
      const { coordinator } = harness;

      const sent = coordinator.send('Làm báo cáo');
      await waitFor(() => coordinator.getState().phase === 'awaiting-plan');
      coordinator.resolvePlan(false);
      await sent;
      await waitForReady(coordinator);

      expect(employeeStarts).toEqual([]);
      expect(JSON.parse(toolResult as unknown as string).cancelled).toBe(true);
      expect(coordinator.getState().phase).toBe('ready');
    });

    it('skips the plan and starts the batch when the bypass toggle is on', async () => {
      let toolResult: string | null = null;
      let harnessRef: Harness | null = null;
      const scripts: Record<string, LoopScript> = {
        [LEAD_MODEL]: async (options) => {
          toolResult = await options.executeToolFn!(
            'delegate_batch',
            { assignments: assignmentsFor(harnessRef!.employees) },
            harnessRef!.db,
            options.signal
          );
          return loopResult('Xong.');
        },
        [EMP_A_MODEL]: async () => loopResult('A'),
        [EMP_B_MODEL]: async () => loopResult('B'),
        [EMP_C_MODEL]: async () => loopResult('C'),
      };
      harness = await createHarness({ scripts, teamPatch: { autoSplitEnabled: true } });
      harnessRef = harness;

      await harness.coordinator.send('Làm báo cáo');
      await waitForReady(harness.coordinator);

      const ack = JSON.parse(toolResult as unknown as string);
      expect(ack).toMatchObject({ dispatched: 3, status: 'dispatched' });
      expect(ack.agents).toHaveLength(3);
      expect(harness.coordinator.getState().pendingPlan).toBeNull();
    });

    it('runs three employee turns concurrently and settles all of them', async () => {
      let toolResult: string | null = null;
      let harnessRef: Harness | null = null;
      let startedCount = 0;
      const barrier = deferred();
      const employeeScript: LoopScript = async () => {
        startedCount += 1;
        if (startedCount === 3) barrier.release();
        await barrier.promise;
        return loopResult('báo cáo');
      };
      const scripts: Record<string, LoopScript> = {
        [LEAD_MODEL]: async (options) => {
          toolResult = await options.executeToolFn!(
            'delegate_batch',
            { assignments: assignmentsFor(harnessRef!.employees) },
            harnessRef!.db,
            options.signal
          );
          return loopResult('Xong.');
        },
        [EMP_A_MODEL]: employeeScript,
        [EMP_B_MODEL]: employeeScript,
        [EMP_C_MODEL]: employeeScript,
      };
      harness = await createHarness({ scripts, teamPatch: { autoSplitEnabled: true } });
      harnessRef = harness;

      await harness.coordinator.send('Làm báo cáo');
      await waitForReady(harness.coordinator);
      await waitForReady(harness.coordinator);

      expect(startedCount).toBe(3);
      expect(JSON.parse(toolResult as unknown as string)).toMatchObject({ dispatched: 3 });
      const rows = await harness.db.aiTeamAssignments.toArray();
      expect(rows).toHaveLength(3);
      expect(rows.every((row) => row.runStatus === 'done')).toBe(true);
    });

    it('keeps the batch pending while one agent is paused', async () => {
      let harnessRef: Harness | null = null;
      const scripts: Record<string, LoopScript> = {
        [LEAD_MODEL]: async (options) => {
          await options.executeToolFn!(
            'delegate_batch',
            { assignments: assignmentsFor(harnessRef!.employees) },
            harnessRef!.db,
            options.signal
          );
          return loopResult('Xong.');
        },
        [EMP_A_MODEL]: async (options) => {
          options.onUsage?.({ totalTokens: 700 });
          await options.beforeToolRound?.(1, options.signal);
          return loopResult('A xong');
        },
        [EMP_B_MODEL]: async () => loopResult('B xong'),
        [EMP_C_MODEL]: async () => loopResult('C xong'),
      };
      harness = await createHarness({ scripts, teamPatch: { autoSplitEnabled: true } });
      harnessRef = harness;
      const { coordinator, employees } = harness;

      void coordinator.send('Làm báo cáo');
      await waitFor(() => coordinator.getState().phase === 'awaiting-budget');
      await sleep(20);

      // D-24: the batch is still open — the settle handler is parked on the paused agent.
      expect(coordinator.getState().agents.find((row) => row.agentId === employees[0]!.id)?.status).toBe(
        'paused'
      );
      expect(coordinator.getState().agents.find((row) => row.agentId === employees[1]!.id)?.status).toBe(
        'done'
      );

      await coordinator.topUp({ kind: 'agent', agentId: employees[0]!.id }, 2000);
      await waitForReady(coordinator);

      const rows = await harness.db.aiTeamAssignments.toArray();
      expect(rows).toHaveLength(3);
      expect(rows.every((row) => row.runStatus === 'done')).toBe(true);
    });

    it('marks a stopped agent incomplete and leaves siblings running', async () => {
      let harnessRef: Harness | null = null;
      const others = deferred();
      const scripts: Record<string, LoopScript> = {
        [LEAD_MODEL]: async (options) => {
          await options.executeToolFn!(
            'delegate_batch',
            { assignments: assignmentsFor(harnessRef!.employees) },
            harnessRef!.db,
            options.signal
          );
          return loopResult('Xong.');
        },
        [EMP_A_MODEL]: async () => {
          await others.promise;
          return loopResult('A xong');
        },
        [EMP_B_MODEL]: async () => {
          await others.promise;
          return loopResult('B xong');
        },
        [EMP_C_MODEL]: async () => {
          await others.promise;
          return loopResult('C xong');
        },
      };
      harness = await createHarness({ scripts, teamPatch: { autoSplitEnabled: true } });
      harnessRef = harness;
      const { coordinator, employees } = harness;

      void coordinator.send('Làm báo cáo');
      await waitFor(
        () =>
          employees.every((row) =>
            coordinator.getState().agents.some((state) => state.agentId === row.id)
          )
      );
      coordinator.stopAgent(employees[0]!.id);
      others.release();
      await waitForReady(coordinator);

      const rows = await harness.db.aiTeamAssignments.toArray();
      const stopped = rows.find((row) => row.agentId === employees[0]!.id)!;
      expect(stopped).toMatchObject({ runStatus: 'stopped', incomplete: true });
      expect(rows.filter((row) => row.runStatus === 'done')).toHaveLength(2);
    });

    it('reports an errored agent with sanitized text only', async () => {
      let harnessRef: Harness | null = null;
      const scripts: Record<string, LoopScript> = {
        [LEAD_MODEL]: async (options) => {
          await options.executeToolFn!(
            'delegate_batch',
            { assignments: assignmentsFor(harnessRef!.employees) },
            harnessRef!.db,
            options.signal
          );
          return loopResult('Xong.');
        },
        [EMP_A_MODEL]: async () => {
          throw new Error('raw provider secret detail');
        },
        [EMP_B_MODEL]: async () => loopResult('B xong'),
        [EMP_C_MODEL]: async () => loopResult('C xong'),
      };
      harness = await createHarness({ scripts, teamPatch: { autoSplitEnabled: true } });
      harnessRef = harness;

      await harness.coordinator.send('Làm báo cáo');
      await waitForReady(harness.coordinator);
      await waitForReady(harness.coordinator);

      const rows = await harness.db.aiTeamAssignments.toArray();
      const errored = rows.find((row) => row.runStatus === 'error');
      expect(errored).toBeDefined();
      const report = await harness.db.chatMessages.get(errored!.reportMessageId!);
      expect(report!.content).not.toContain('raw provider secret detail');
    });

    it('lists every dispatched agent in the ack and names no unfinished work (D-14)', async () => {
      let toolResult: string | null = null;
      const synthesisPrompts: string[] = [];
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true },
        synthesisScript: async (options) => {
          synthesisPrompts.push(JSON.stringify(options.messages));
          return loopResult('Đã tổng hợp.');
        },
        scripts: {
          [LEAD_MODEL]: async (options) => {
            toolResult = await options.executeToolFn!(
              'delegate_batch',
              { assignments: assignmentsFor(harness!.employees) },
              harness!.db,
              options.signal
            );
            return loopResult('Xong.');
          },
          [EMP_A_MODEL]: async () => loopResult('A xong'),
          [EMP_B_MODEL]: async () => loopResult('B xong'),
          [EMP_C_MODEL]: async () => loopResult('C xong'),
        },
      });

      await harness.coordinator.send('Làm báo cáo');
      await waitForReady(harness.coordinator);
      await waitForReady(harness.coordinator);

      const ack = JSON.parse(toolResult as unknown as string);
      expect(ack.dispatched).toBe(3);
      expect(ack.agents.map((entry: any) => entry.agentId).sort()).toEqual(
        harness.employees.map((row) => row.id).sort()
      );
      // D-14: an all-done batch carries no unfinished marker into the synthesis prompt.
      expect(synthesisPrompts).toHaveLength(1);
      expect(synthesisPrompts[0]).not.toContain('Chưa hoàn tất');
    });

    it('returns a refused batch to the lead and starts no agent', async () => {
      let toolResult: string | null = null;
      const scripts: Record<string, LoopScript> = {
        [LEAD_MODEL]: async (options) => {
          toolResult = await options.executeToolFn!(
            'delegate_batch',
            { assignments: [{ agentId: 'not-in-roster', task: 'x' }] },
            harness!.db,
            options.signal
          );
          return loopResult('Xong.');
        },
      };
      harness = await createHarness({ scripts });
      const { coordinator, lead } = harness;

      await coordinator.send('Làm báo cáo');

      expect(JSON.parse(toolResult as unknown as string).refused).toBe(true);
      expect(coordinator.getState().agents.map((row) => row.agentId)).toEqual([lead.id]);
    });

    it('routes search_team_history through teamTools and never the MCP fall-through', async () => {
      let toolResult: string | null = null;
      harness = await createHarness({
        scripts: {
          [LEAD_MODEL]: async (options) => {
            toolResult = await options.executeToolFn!(
              'search_team_history',
              { query: 'thanh toán' },
              harness!.db,
              options.signal
            );
            return loopResult('Xong.');
          },
        },
      });
      await saveTeamMessage(
        {
          threadId: harness.threadId,
          role: 'assistant',
          content: 'Báo cáo luồng thanh toán đã xong.',
          agentId: harness.employees[0]!.id,
          agentName: 'An',
          agentKind: 'employee',
          messageKind: 'report',
        },
        harness.db
      );

      await harness.coordinator.send('Tìm lịch sử');

      expect(toolResult).not.toBeNull();
      expect(toolResult).not.toContain('Không rõ máy chủ MCP');
      const hits = JSON.parse(toolResult as unknown as string);
      expect(Array.isArray(hits)).toBe(true);
      expect(hits.length).toBeGreaterThan(0);
    });

    it('routes read_skill, list_linked_items and get_linked_context to teamTools', async () => {
      const captured = new Map<string, string>();
      harness = await createHarness({
        scripts: {
          [EMP_A_MODEL]: async (options) => {
            for (const [name, args] of [
              ['read_skill', {}],
              ['list_linked_items', {}],
              ['get_linked_context', { itemId: 'missing-item' }],
            ] as const) {
              captured.set(
                name,
                await options.executeToolFn!(name, args, harness!.db, options.signal)
              );
            }
            return loopResult('báo cáo');
          },
        },
      });
      const { coordinator, employees } = harness;

      await coordinator.send('@[An](agent:' + employees[0]!.id + ') kiểm tra');

      expect(JSON.parse(captured.get('read_skill') as string).body).toContain('Quy trình');
      expect(Array.isArray(JSON.parse(captured.get('list_linked_items') as string))).toBe(true);
      expect(JSON.parse(captured.get('get_linked_context') as string).code).toBe('ITEM_NOT_LINKED');
      for (const value of captured.values()) {
        expect(value).not.toContain('Không rõ máy chủ MCP');
      }
    });
  });

  describe('Task 3 — budget pause, usage accounting, tool resolution guard', () => {
    it('pauses one agent at 80% and leaves the sibling running', async () => {
      const sibling = deferred();
      harness = await createHarness({
        scripts: {
          [EMP_A_MODEL]: async (options) => {
            options.onUsage?.({ totalTokens: 700 });
            await options.beforeToolRound?.(1, options.signal);
            return loopResult('A xong');
          },
          [EMP_B_MODEL]: async () => {
            await sibling.promise;
            return loopResult('B xong');
          },
        },
      });
      const { coordinator, employees } = harness;

      void coordinator.send('@[An](agent:' + employees[0]!.id + ') việc A');
      void coordinator.send('@[Bình](agent:' + employees[1]!.id + ') việc B');
      await waitFor(() => coordinator.getState().phase === 'awaiting-budget');

      expect(coordinator.getState().agents.find((row) => row.agentId === employees[0]!.id)?.status).toBe(
        'paused'
      );
      expect(coordinator.getState().agents.find((row) => row.agentId === employees[1]!.id)?.status).toBe(
        'running'
      );
      sibling.release();
    });
    it('resumes the parked turn after a top-up and reaches a terminal state', async () => {
      harness = await createHarness({
        scripts: {
          [EMP_A_MODEL]: async (options) => {
            options.onUsage?.({ totalTokens: 700 });
            await options.beforeToolRound?.(1, options.signal);
            return loopResult('A xong');
          },
        },
      });
      const { coordinator, employees } = harness;

      const sent = coordinator.send('@[An](agent:' + employees[0]!.id + ') việc A');
      await waitFor(() => coordinator.getState().phase === 'awaiting-budget');

      await coordinator.topUp({ kind: 'agent', agentId: employees[0]!.id }, 2000);
      await sent;
      await waitForReady(coordinator);
      await waitFor(
        () => coordinator.getState().agents.find((row) => row.agentId === employees[0]!.id)?.status === 'done'
      );

      const stored = await harness.db.aiTeamMembers
        .where('teamId')
        .equals(harness.team.id)
        .toArray();
      const memberRow = stored.find((row) => row.agentId === employees[0]!.id);
      expect(memberRow?.usedTokens).toBeGreaterThan(0);
    });

    it('settles a stop while parked as stopped instead of hanging', async () => {
      harness = await createHarness({
        scripts: {
          [EMP_A_MODEL]: async (options) => {
            options.onUsage?.({ totalTokens: 700 });
            await options.beforeToolRound?.(1, options.signal);
            return loopResult('A xong');
          },
        },
      });
      const { coordinator, employees } = harness;

      const sent = coordinator.send('@[An](agent:' + employees[0]!.id + ') việc A');
      await waitFor(() => coordinator.getState().phase === 'awaiting-budget');
      coordinator.stopAgent(employees[0]!.id);
      await sent;

      const state = coordinator.getState().agents.find((row) => row.agentId === employees[0]!.id);
      expect(state?.status).toBe('stopped');
      expect(state?.incomplete).toBe(true);
    });

    it('parks the lead when the team budget crosses 80%', async () => {
      harness = await createHarness({
        scripts: {
          [LEAD_MODEL]: async (options) => {
            options.onUsage?.({ totalTokens: 2500 });
            await options.beforeToolRound?.(1, options.signal);
            return loopResult('Xong.');
          },
        },
      });
      const { coordinator, lead } = harness;

      const sent = coordinator.send('Xin chào');
      await waitFor(() => coordinator.getState().phase === 'awaiting-budget');
      expect(coordinator.getState().agents.find((row) => row.agentId === lead.id)?.status).toBe('paused');

      // The lead's own share is 750 of the 3 000 team budget, so both scopes crossed.
      // Each top-up opens one gate; the turn resumes only once both are open.
      await coordinator.topUp({ kind: 'agent', agentId: lead.id }, 5000);
      await sleep(20);
      expect(coordinator.getState().agents.find((row) => row.agentId === lead.id)?.status).toBe('paused');

      await coordinator.topUp({ kind: 'team' }, 5000);
      await sent;
      await waitFor(
        () => coordinator.getState().agents.find((row) => row.agentId === lead.id)?.status === 'done'
      );
    });

    it('resolves every advertised team tool name to a handler', () => {
      for (const definition of TEAM_TOOL_DEFINITIONS) {
        expect(resolveTeamToolName(definition.function.name)).not.toBe('unknown');
      }
      expect(resolveTeamToolName('delegate_batch')).toBe('coordinator');
      expect(resolveTeamToolName('search_team_history')).toBe('teamTools');
      expect(resolveTeamToolName('not_a_team_tool')).toBe('unknown');
    });

    it('accumulates a team top-up onto an edited total, not the construction snapshot', async () => {
      harness = await createHarness({ scripts: {} });
      const { coordinator, db, team } = harness;

      // Production order: the settings drawer persists the new total, then tells the
      // coordinator to adopt it.
      await updateTeam(team.id, { budgetTokens: 10000 }, db);
      coordinator.setTeamBudget(10000);
      await coordinator.topUp({ kind: 'team' }, 2000);

      const stored = await db.aiTeams.get(team.id);
      expect(stored?.budgetTokens).toBe(12000);
    });

    it('keeps the decided plan in the snapshot so the status line is observable', async () => {
      let harnessRef: Harness | null = null;
      harness = await createHarness({
        scripts: {
          [LEAD_MODEL]: async (options) => {
            await options.executeToolFn!(
              'delegate_batch',
              {
                assignments: harnessRef!.employees.map((row) => ({
                  agentId: row.id,
                  task: 'Việc',
                })),
              },
              harnessRef!.db,
              options.signal
            );
            return loopResult('Xong.');
          },
          [EMP_A_MODEL]: async () => loopResult('A xong'),
          [EMP_B_MODEL]: async () => loopResult('B xong'),
          [EMP_C_MODEL]: async () => loopResult('C xong'),
        },
      });
      harnessRef = harness;
      const { coordinator } = harness;

      const sent = coordinator.send('Làm báo cáo');
      await waitFor(() => coordinator.getState().phase === 'awaiting-plan');
      coordinator.resolvePlan(true);
      await sent;
      await waitForReady(coordinator);

      // The pending plan clears, but the decided one stays visible with its verdict.
      const state = coordinator.getState();
      expect(state.pendingPlan).toBeNull();
      expect(state.lastPlan?.assignments).toHaveLength(3);
      expect(state.lastPlanDecision).toBe('approved');
    });

    it('keeps delegate_batch out of the employee allowlist', () => {
      expect(EMPLOYEE_READ_ONLY_ALLOWLIST).not.toContain('delegate_batch');
      expect(EMPLOYEE_READ_ONLY_ALLOWLIST.some((name) => isMutationTool(name))).toBe(false);
    });

    it('counts usage on a second turn instead of treating it as already reported (CR-01)', async () => {
      harness = await createHarness({
        // A budget that does not park at 700, so both turns can run back to back instead of
        // the second submit being routed as a steer.
        teamPatch: { budgetTokens: 12000 },
        scripts: {
          [EMP_A_MODEL]: async (options) => {
            options.onUsage?.({ totalTokens: 700 });
            return loopResult('A xong');
          },
        },
      });
      const { coordinator, employees, db, team } = harness;

      await coordinator.send('@[An](agent:' + employees[0]!.id + ') việc 1');
      await coordinator.send('@[An](agent:' + employees[0]!.id + ') việc 2');

      const row = (await db.aiTeamMembers.where('teamId').equals(team.id).toArray()).find(
        (member) => member.agentId === employees[0]!.id
      );
      // Both turns report 700; a stale baseline would leave this at 700.
      expect(row?.usedTokens).toBe(1400);
    });

    it('releases the plan park on a global Stop so the lead turn does not hang (CR-03)', async () => {
      let harnessRef: Harness | null = null;
      harness = await createHarness({
        scripts: {
          [LEAD_MODEL]: async (options) => {
            await options.executeToolFn!(
              'delegate_batch',
              {
                assignments: harnessRef!.employees.map((row) => ({
                  agentId: row.id,
                  task: 'Việc',
                })),
              },
              harnessRef!.db,
              options.signal
            );
            return loopResult('Xong.');
          },
        },
      });
      harnessRef = harness;
      const { coordinator } = harness;

      const sent = coordinator.send('Làm báo cáo');
      await waitFor(() => coordinator.getState().phase === 'awaiting-plan');

      coordinator.abortAll();
      // The park must resolve; without the fix this await never settles.
      await sent;
      await waitForReady(coordinator);
      expect(coordinator.getState().phase).toBe('ready');
      expect(coordinator.getState().pendingPlan).toBeNull();
    });

    it('advertises mutation tools to the lead but never to an employee (CR-04)', async () => {
      let leadTools: readonly AiToolDefinition[] = [];
      let employeeTools: readonly AiToolDefinition[] = [];
      harness = await createHarness({
        scripts: {
          [LEAD_MODEL]: async (options) => {
            leadTools = options.tools ?? [];
            return loopResult('Xong.');
          },
          [EMP_A_MODEL]: async (options) => {
            employeeTools = options.tools ?? [];
            return loopResult('A xong');
          },
        },
      });
      const { coordinator, employees } = harness;

      await coordinator.send('Xin chào');
      await coordinator.send('@[An](agent:' + employees[0]!.id + ') việc A');

      expect(payloadHasMutationTool(leadTools)).toBe(true);
      expect(payloadHasMutationTool(employeeTools)).toBe(false);
    });

    it('hydrates the team total from persisted usage so a reactivated team is not reset (CR-05)', async () => {
      harness = await createHarness({
        scripts: {
          [LEAD_MODEL]: async (options) => {
            await options.beforeToolRound?.(2, options.signal);
            return loopResult('Xong.');
          },
        },
      });
      const { db, team, lead } = harness;
      // Pre-spend the team to 80% before the coordinator loads members.
      const members = await db.aiTeamMembers.where('teamId').equals(team.id).toArray();
      for (const member of members) {
        await db.aiTeamMembers.update(member.id, { usedTokens: 800 });
      }

      const { coordinator } = harness;
      void coordinator.send('Xin chào');
      await sleep(50);
      // Hydrated at 80%, the round boundary parks — without hydration the turn would
      // have completed with a fresh full budget.
      expect(coordinator.getState().agents.find((row) => row.agentId === lead.id)?.status).not.toBe(
        'done'
      );
    });

    it('names the parked agent in the snapshot so the UI tops up the right budget', async () => {
      harness = await createHarness({
        scripts: {
          [EMP_A_MODEL]: async (options) => {
            options.onUsage?.({ totalTokens: 700 });
            await options.beforeToolRound?.(1, options.signal);
            return loopResult('A xong');
          },
        },
      });
      const { coordinator, employees } = harness;

      const sent = coordinator.send('@[An](agent:' + employees[0]!.id + ') việc A');
      await waitFor(() => coordinator.getState().phase === 'awaiting-budget');

      expect(coordinator.getState().pausedAgentId).toBe(employees[0]!.id);
      expect(coordinator.getState().pausedAgentName).toBe('An');

      await coordinator.topUp({ kind: 'agent', agentId: employees[0]!.id }, 2000);
      await sent;
      await waitForReady(coordinator);
      expect(coordinator.getState().pausedAgentId).toBeNull();
      expect(coordinator.getState().pausedAgentName).toBeNull();
    });

    it('applies a toggle change to the live run without reconstructing the coordinator', async () => {
      let planParked = false;
      let harnessRef: Harness | null = null;
      harness = await createHarness({
        scripts: {
          [LEAD_MODEL]: async (options) => {
            await options.executeToolFn!(
              'delegate_batch',
              {
                assignments: harnessRef!.employees.map((row) => ({
                  agentId: row.id,
                  task: 'Việc',
                })),
              },
              harnessRef!.db,
              options.signal
            );
            return loopResult('Xong.');
          },
          [EMP_A_MODEL]: async () => loopResult('A xong'),
          [EMP_B_MODEL]: async () => loopResult('B xong'),
          [EMP_C_MODEL]: async () => loopResult('C xong'),
        },
      });
      harnessRef = harness;
      const { coordinator } = harness;

      // Auto-split off at construction: the batch parks on the plan card.
      const sent = coordinator.send('Làm báo cáo');
      await waitFor(() => coordinator.getState().phase === 'awaiting-plan');
      planParked = true;
      expect(planParked).toBe(true);

      // The sidebar switch flips auto-split on mid-run; the live run must see it.
      coordinator.setTeamSettings({ autoSplitEnabled: true });
      coordinator.resolvePlan(true);
      await sent;
      await waitForReady(coordinator);

      expect(coordinator.getState().phase).not.toBe('awaiting-plan');
    });

    it('feeds a settled batch report into the next batch prompt', async () => {
      const employeePrompts: string[] = [];
      let harnessRef: Harness | null = null;
      harness = await createHarness({
        scripts: {
          [LEAD_MODEL]: async (options) => {
            await options.executeToolFn!(
              'delegate_batch',
              {
                assignments: harnessRef!.employees.map((row) => ({
                  agentId: row.id,
                  task: 'Việc',
                })),
              },
              harnessRef!.db,
              options.signal
            );
            return loopResult('Xong.');
          },
          [EMP_A_MODEL]: async (options) => {
            employeePrompts.push(JSON.stringify(options.messages));
            return loopResult('BÁO-CÁO-A');
          },
          [EMP_B_MODEL]: async (options) => {
            employeePrompts.push(JSON.stringify(options.messages));
            return loopResult('BÁO-CÁO-B');
          },
          [EMP_C_MODEL]: async (options) => {
            employeePrompts.push(JSON.stringify(options.messages));
            return loopResult('BÁO-CÁO-C');
          },
        },
      });
      harnessRef = harness;
      const { coordinator, employees } = harness;

      // First batch settles, then a direct @mention starts a later turn for the same agent.
      const first = coordinator.send('Làm báo cáo');
      await waitFor(() => coordinator.getState().phase === 'awaiting-plan');
      coordinator.resolvePlan(true);
      await first;
      await waitFor(() => coordinator.getState().phase === 'ready');

      const beforeLater = employeePrompts.length;
      await coordinator.send('@[An](agent:' + employees[0]!.id + ') làm tiếp');
      await waitFor(() => coordinator.getState().phase === 'ready');

      // The later turn's prompt carries the earlier batch's peer reports as untrusted data.
      const laterPrompt = employeePrompts.slice(beforeLater).join('\n');
      expect(laterPrompt).toContain('BÁO-CÁO-B');
    });

    it('ignores an @mention of an employee outside the team roster', async () => {
      harness = await createHarness({
        scripts: {
          [LEAD_MODEL]: async () => loopResult('Lead xử lý.'),
        },
      });
      const { coordinator, employees, db, team, lead, skill, threadId } = harness;
      const outsider = employees[0]!;
      // Drop the member row so the employee is no longer on this team.
      await db.aiTeamMembers.where('agentId').equals(outsider.id).delete();

      // A fresh coordinator loads the trimmed roster.
      const rebuilt = createTeamRunCoordinator({
        db,
        team,
        lead,
        employees,
        skills: [skill],
        threadId,
        model: LEAD_MODEL,
        endpoint: 'https://example.invalid/v1',
        apiKey: 'sk-test',
      });
      await rebuilt.send('@[An](agent:' + outsider.id + ') việc riêng');

      // No employee turn starts; the message falls through to the lead instead.
      expect(
        rebuilt.getState().agents.some((row) => row.agentId === outsider.id)
      ).toBe(false);
      expect(coordinator).not.toBe(rebuilt);
    });
  });


  describe('Task 3 — per-turn roster snapshot (D-03, D-07, D-08, D-13)', () => {
    const systemText = (options: AiOrchestratorLoopOptions): string =>
      (options.messages ?? [])
        .filter((message) => message.role === 'system')
        .map((message) => String(message.content))
        .join('\n');

    /** A loop script that records the request and returns a fixed answer. */
    const recordingLoop =
      (record: (options: AiOrchestratorLoopOptions) => void, response = 'Xong.') =>
      (options: AiOrchestratorLoopOptions) => {
        record(options);
        return Promise.resolve(loopResult(response));
      };

    afterEach(() => {
      reset();
    });

    it('runs the second turn with a persona edited between sends', async () => {
      const prompts: string[] = [];
      harness = await createHarness({
        useSeam: true,
        scripts: {
          [LEAD_MODEL]: async (options) => {
            prompts.push(systemText(options));
            return loopResult('Xong.');
          },
        },
      });
      const { coordinator, roster, lead } = harness;

      await coordinator.send('Lượt một');
      roster.lead = { ...lead, persona: 'Bạn là Minh phiên bản mới.' };
      await coordinator.send('Lượt hai');

      expect(prompts[0]).toContain('Bạn là Minh.');
      expect(prompts[0]).not.toContain('phiên bản mới');
      expect(prompts[1]).toContain('Bạn là Minh phiên bản mới.');
    });

    it('uses the seam lead and model, never the construction-time option', async () => {
      const seen: Array<{ model: string; system: string }> = [];
      harness = await createHarness({ useSeam: true, scripts: {} });
      const otherLead = await createLead(
        {
          name: 'Hà',
          role: 'Trưởng nhóm khác',
          capability: 'Điều phối',
          persona: 'Bạn là Hà.',
          model: 'seam-lead-model',
        },
        harness.db
      );
      harness.roster.lead = otherLead;

      const coordinator = createTeamRunCoordinator({
        db: harness.db,
        team: harness.team,
        lead: harness.lead,
        employees: harness.employees,
        skills: [harness.skill],
        threadId: harness.threadId,
        model: LEAD_MODEL,
        endpoint: 'https://example.invalid/v1',
        apiKey: 'sk-test',
        createRuntimeDeps: () => ({
          runLoop: recordingLoop((options) => {
            seen.push({ model: options.model, system: systemText(options) });
          }) as unknown as ChatTurnRuntimeDeps['runLoop'],
        }),
        loadRoster: async () => harness!.roster,
      });

      await coordinator.send('Xin chào');

      expect(seen).toHaveLength(1);
      expect(seen[0]!.model).toBe('seam-lead-model');
      expect(seen[0]!.system).toContain('Bạn là Hà.');
      expect(seen[0]!.system).not.toContain('Bạn là Minh.');
    });

    it('freezes the roster for a turn parked on the plan card', async () => {
      const started: string[] = [];
      let harnessRef: Harness | null = null;
      harness = await createHarness({
        useSeam: true,
        scripts: {
          [LEAD_MODEL]: async (options) => {
            await options.executeToolFn!(
              'delegate_batch',
              {
                assignments: harnessRef!.employees.map((row) => ({
                  agentId: row.id,
                  task: 'Việc',
                })),
              },
              harnessRef!.db,
              options.signal
            );
            return loopResult('Xong.');
          },
          [EMP_A_MODEL]: async () => {
            started.push('a');
            return loopResult('A');
          },
          [EMP_B_MODEL]: async () => {
            started.push('b');
            return loopResult('B');
          },
          [EMP_C_MODEL]: async () => {
            started.push('c');
            return loopResult('C');
          },
        },
      });
      harnessRef = harness;
      const { coordinator, roster } = harness;

      const sent = coordinator.send('Làm báo cáo');
      await waitFor(() => coordinator.getState().phase === 'awaiting-plan');

      // The roster shrinks while the turn is parked; the running turn must not see it.
      roster.employees = roster.employees.slice(0, 1);
      coordinator.resolvePlan(true);
      await sent;
      await waitForReady(coordinator);

      expect(started.sort()).toEqual(['a', 'b', 'c']);
    });

    it('registers live use for the duration of a lead turn', async () => {
      const gate = deferred();
      harness = await createHarness({
        useSeam: true,
        scripts: {
          [LEAD_MODEL]: async () => {
            await gate.promise;
            return loopResult('Xong.');
          },
        },
      });
      const { coordinator, lead } = harness;

      void coordinator.send('Xin chào');
      await waitFor(() => isAgentInUse(lead.id));
      expect(isAgentInUse(lead.id)).toBe(true);

      gate.release();
      await waitFor(() => !isAgentInUse(lead.id));
      expect(isAgentInUse(lead.id)).toBe(false);
    });

    it('registers a mention turn target and its skill, and releases both on stop', async () => {
      const gate = deferred();
      harness = await createHarness({
        useSeam: true,
        scripts: {
          [EMP_A_MODEL]: async () => {
            await gate.promise;
            return loopResult('báo cáo');
          },
        },
      });
      const { coordinator, employees, skill } = harness;
      const employee = employees[0]!;

      const sent = coordinator.send('@[An](agent:' + employee.id + ') kiểm tra');
      await waitFor(() => isAgentInUse(employee.id));
      expect(isSkillInUse(skill.id)).toBe(true);

      coordinator.stopAgent(employee.id);
      gate.release();
      await sent;
      await waitForReady(coordinator);

      expect(isAgentInUse(employee.id)).toBe(false);
      expect(isSkillInUse(skill.id)).toBe(false);
    });

    it('refuses to delete a de-rostered agent whose turn is still running', async () => {
      const gate = deferred();
      harness = await createHarness({
        useSeam: true,
        scripts: {
          [EMP_A_MODEL]: async () => {
            await gate.promise;
            return loopResult('báo cáo');
          },
        },
      });
      const { coordinator, employees, roster, db } = harness;
      const employee = employees[0]!;

      const sent = coordinator.send('@[An](agent:' + employee.id + ') kiểm tra');
      await waitFor(() => isAgentInUse(employee.id));

      // De-rostered for the next turn, still running this one.
      roster.memberAgentIds = [];
      await db.aiTeamMembers.where('agentId').equals(employee.id).delete();

      const result = await deleteEmployee(employee.id, db);
      expect(result).toMatchObject({ deleted: false, code: 'IN_USE' });
      expect(await db.aiEmployees.get(employee.id)).toBeDefined();

      gate.release();
      await sent;
      await waitForReady(coordinator);
    });

    it('stops mentioning a de-rostered agent from the next turn', async () => {
      harness = await createHarness({ useSeam: true, scripts: {} });
      const { employees, roster, lead, db, team, skill, threadId } = harness;
      const employee = employees[0]!;
      const routed: string[] = [];
      const coordinatorWithRecorder = createTeamRunCoordinator({
        db,
        team,
        lead,
        employees,
        skills: [skill],
        threadId,
        model: LEAD_MODEL,
        endpoint: 'https://example.invalid/v1',
        apiKey: 'sk-test',
        createRuntimeDeps: (agentId) => ({
          runLoop: recordingLoop(() => {
            routed.push(agentId);
          }) as unknown as ChatTurnRuntimeDeps['runLoop'],
        }),
        loadRoster: async () => ({
          ...roster,
          employees: [...roster.employees],
          memberAgentIds: [...roster.memberAgentIds],
        }),
      });

      await coordinatorWithRecorder.send('@[An](agent:' + employee.id + ') việc một');
      expect(routed).toEqual([employee.id]);

      // The agent leaves the roster: the same mention now falls back to the lead.
      roster.memberAgentIds = [];
      routed.length = 0;
      await coordinatorWithRecorder.send('@[An](agent:' + employee.id + ') việc hai');

      expect(routed).toEqual([lead.id]);
    });

    it('never mentions a global employee that is not on this team', async () => {
      harness = await createHarness({
        useSeam: true,
        scripts: { [LEAD_MODEL]: async () => loopResult('Xong.') },
      });
      const { coordinator, employees, roster, lead, db } = harness;
      const outsider = await createEmployee(
        { name: 'Người Ngoài', role: 'x', capability: 'y', persona: 'z', model: EMP_A_MODEL },
        db
      );
      roster.employees = [...employees, outsider];

      await coordinator.send('@[Người Ngoài](agent:' + outsider.id + ') việc riêng');

      expect(coordinator.getState().agents.map((row) => row.agentId)).toEqual([lead.id]);
    });

    it('does nothing when the seam reports no lead (empty group, D-05)', async () => {
      harness = await createHarness({ useSeam: true, scripts: {} });
      const { coordinator, roster } = harness;
      roster.lead = undefined;
      roster.teamRow = { ...harness.team, leadId: undefined };

      // The submit was accepted (it is not `'blocked'`), it simply starts nothing.
      await expect(coordinator.send('Xin chào')).resolves.toBe('started');
      expect(coordinator.getState().agents).toEqual([]);
    });
  });

  describe('Ledger writes and report linking (D-09, D-22, D-23)', () => {
    const assignmentsFor = (employees: AiEmployee[]) =>
      employees.map((row, index) => ({ agentId: row.id, task: `Việc ${index + 1}` }));

    /** A lead script that delegates the whole roster, then answers. */
    const delegatingLead =
      (harnessRef: () => Harness): LoopScript =>
      async (options) => {
        await options.executeToolFn!(
          'delegate_batch',
          { assignments: assignmentsFor(harnessRef().employees) },
          harnessRef().db,
          options.signal
        );
        return loopResult('Xong.');
      };

    const rowsFor = async (harness: Harness) => ({
      batches: await harness.db.aiTeamBatches.toArray(),
      assignments: await harness.db.aiTeamAssignments.toArray(),
      messages: await harness.db.chatMessages
        .where('threadId')
        .equals(harness.threadId)
        .toArray(),
    });

    it('writes one batch row, one assignment per attempt, and links the report both ways', async () => {
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true },
        scripts: {
          [LEAD_MODEL]: delegatingLead(() => harness!),
          [EMP_A_MODEL]: async () => loopResult('A xong'),
        },
      });
      const current = harness;
      current.employees = current.employees.slice(0, 1);
      current.roster.employees = current.employees;

      await current.coordinator.send('Làm báo cáo');
      await waitForReady(current.coordinator);

      const { batches, assignments, messages } = await rowsFor(current);
      expect(batches).toHaveLength(1);
      expect(batches[0]).toMatchObject({ planDecision: 'auto', batchIndex: 1, leadId: current.lead.id });
      expect(batches[0]!.endedAt).toBeDefined();

      expect(assignments).toHaveLength(1);
      const attempt = assignments[0]!;
      expect(attempt).toMatchObject({
        runStatus: 'done',
        stopReason: 'none',
        attemptNo: 1,
        batchId: batches[0]!.id,
      });
      expect(attempt.startedAt).toBeDefined();
      expect(attempt.endedAt).toBeDefined();

      // The report row and the ledger row point at each other.
      const report = messages.find((row) => row.id === attempt.reportMessageId);
      expect(report).toBeDefined();
      expect(report).toMatchObject({
        messageKind: 'report',
        assignmentId: attempt.id,
        batchId: batches[0]!.id,
        attemptNo: 1,
        // The runtime stamped `running`; the terminal patch inside the same transaction
        // supersedes it, so no settled report ever renders as still running.
        runStatus: 'done',
        stopReason: 'none',
      });
      expect(report!.content).toBe('A xong');

      const instruction = messages.find((row) => row.messageKind === 'instruction');
      expect(attempt.instructionMessageId).toBe(instruction!.id);

      // Reachable through the SAME reader the transcript uses (`TeamWorkspace`).
      const transcript = await getMessagesByThreadId(current.threadId, current.db);
      expect(transcript.some((row) => row.id === attempt.reportMessageId)).toBe(true);
    });

    it('links nothing but status fields when the plan is rejected: batch row only', async () => {
      harness = await createHarness({
        scripts: { [LEAD_MODEL]: delegatingLead(() => harness!) },
      });
      const current = harness;

      const sent = current.coordinator.send('Làm báo cáo');
      await waitFor(() => current.coordinator.getState().phase === 'awaiting-plan');
      current.coordinator.resolvePlan(false);
      await sent;
      await waitForReady(current.coordinator);

      const { batches, assignments } = await rowsFor(current);
      expect(batches).toHaveLength(1);
      expect(batches[0]).toMatchObject({
        planDecision: 'rejected',
        // IN-09: a rejection is not a user abort — the decision field carries the fact.
        abortedBy: 'none',
        phaseAtEnd: 'ready',
      });
      expect(batches[0]!.endedAt).toBeDefined();
      expect(assignments).toEqual([]);
    });

    it('leaves a stopped attempt with one sanitized report row the transcript can read', async () => {
      const gate = deferred();
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true },
        scripts: {
          [LEAD_MODEL]: delegatingLead(() => harness!),
          [EMP_A_MODEL]: async () => {
            await gate.promise;
            return loopResult('A xong');
          },
        },
      });
      const current = harness;
      const first = current.employees[0]!;
      current.employees = [first];
      current.roster.employees = [first];

      const sent = current.coordinator.send('Làm báo cáo');
      // Wait for THIS employee's turn, not the lead's — the lead is also an agent entry.
      await waitFor(() =>
        current.coordinator
          .getState()
          .agents.some((row) => row.agentId === first.id && row.status === 'running')
      );
      current.coordinator.stopAgent(first.id);
      gate.release();
      await sent;
      await waitForReady(current.coordinator);

      const { assignments, messages } = await rowsFor(current);
      const attempt = assignments[0]!;
      // D-10: a per-agent Stop on a running assignment records `user-per-agent`; the stop
      // path now commits the transition itself instead of losing to the settle path.
      expect(attempt).toMatchObject({
        runStatus: 'stopped',
        stopReason: 'user-per-agent',
        incomplete: true,
      });
      const reports = messages.filter(
        (row) => row.assignmentId === attempt.id && row.messageKind === 'report'
      );
      expect(reports).toHaveLength(1);
      expect(reports[0]).toMatchObject({
        id: attempt.reportMessageId,
        runStatus: 'stopped',
        stopReason: attempt.stopReason,
        incomplete: true,
      });
      // The row exists and carries the terminal triple. Its content is either the runtime's
      // already-saved clean text (the `complete`-then-stopped race) or the fixed stopped
      // copy — never provider text and never a diagnostic string.
      expect(reports[0]!.content.length).toBeGreaterThan(0);
      expect(reports[0]!.content).not.toContain('Error:');
    });

    it('gives an errored attempt a report row with the sanitized string and no provider text', async () => {
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true },
        scripts: {
          [LEAD_MODEL]: delegatingLead(() => harness!),
          [EMP_A_MODEL]: async () => {
            throw new Error('raw provider secret detail');
          },
        },
      });
      const current = harness;
      current.employees = current.employees.slice(0, 1);
      current.roster.employees = current.employees;

      await current.coordinator.send('Làm báo cáo');
      await waitForReady(current.coordinator);

      const { assignments, messages } = await rowsFor(current);
      const attempt = assignments[0]!;
      expect(attempt).toMatchObject({ runStatus: 'error', stopReason: 'provider', incomplete: true });
      // D-17: the detail is bounded technical metadata, never the provider string.
      expect(attempt.diagnosticDetail).toBeTruthy();
      expect(attempt.diagnosticDetail!.length).toBeLessThanOrEqual(300);

      const reports = messages.filter(
        (row) => row.assignmentId === attempt.id && row.messageKind === 'report'
      );
      expect(reports).toHaveLength(1);
      expect(reports[0]!.runStatus).toBe('error');
      expect(reports[0]!.content).not.toContain('raw provider secret detail');
      for (const row of messages) {
        expect(row.content).not.toContain('raw provider secret detail');
      }
    });

    it('links exactly one report row per terminal attempt in a mixed batch', async () => {
      const gate = deferred();
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true },
        scripts: {
          [LEAD_MODEL]: delegatingLead(() => harness!),
          [EMP_A_MODEL]: async () => loopResult('A xong'),
          [EMP_B_MODEL]: async () => {
            await gate.promise;
            return loopResult('B xong');
          },
          [EMP_C_MODEL]: async () => {
            throw new Error('C hỏng');
          },
        },
      });
      const current = harness;

      const sent = current.coordinator.send('Làm báo cáo');
      // Wait for the STOP target to be running: A and C settle instantly, so any assertion
      // on them (or on a fixed "3 running" count) is racy.
      await waitFor(() =>
        current.coordinator
          .getState()
          .agents.some((r) => r.agentId === current.employees[1]!.id && r.status === 'running')
      );
      current.coordinator.stopAgent(current.employees[1]!.id);
      await waitFor(() => current.coordinator.getState().agents.some(r => r.status === 'stopped'));
      gate.release();
      await sent;
      await waitForReady(current.coordinator);

      const { assignments, messages } = await rowsFor(current);
      const byAgent = new Map(assignments.map((row) => [row.agentId, row]));
      expect(byAgent.get(current.employees[0]!.id)?.runStatus).toBe('done');
      expect(byAgent.get(current.employees[1]!.id)?.runStatus).toBe('stopped');
      expect(byAgent.get(current.employees[2]!.id)?.runStatus).toBe('error');

      for (const attempt of assignments) {
        const reports = messages.filter(
          (row) => row.assignmentId === attempt.id && row.messageKind === 'report'
        );
        expect(reports).toHaveLength(1);
        expect(reports[0]!.id).toBe(attempt.reportMessageId);
        expect(reports[0]!.runStatus).toBe(attempt.runStatus);
        expect(reports[0]!.incomplete).toBe(attempt.incomplete);
      }
    });

    it('resolves send() as started, steered or blocked and never as a dropped submit', async () => {
      const gate = deferred();
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true },
        scripts: {
          [LEAD_MODEL]: delegatingLead(() => harness!),
          [EMP_A_MODEL]: async () => {
            await gate.promise;
            return loopResult('A xong');
          },
        },
      });
      const current = harness;
      current.employees = current.employees.slice(0, 1);
      current.roster.employees = current.employees;

      const sent = current.coordinator.send('Làm báo cáo');
      await waitFor(() => current.coordinator.getState().phase === 'batch-running');
      // D-01/D-02: a live turn takes the message as a steer instead of refusing it.
      await expect(current.coordinator.send('chen ngang')).resolves.toBe('steered');

      gate.release();
      await sent;
      await waitForReady(current.coordinator);

      await expect(current.coordinator.send('lượt mới')).resolves.toBe('started');

      await current.coordinator.dispose();
      // Disposed: nothing about this state will change by waiting, so never requeue.
      await expect(current.coordinator.send('sau dispose')).resolves.toBe('blocked');
    });

    it('never writes an assignment status outside transitionAssignment', async () => {
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true },
        scripts: {
          [LEAD_MODEL]: delegatingLead(() => harness!),
          [EMP_A_MODEL]: async () => loopResult('A xong'),
        },
      });
      const current = harness;
      current.employees = current.employees.slice(0, 1);
      current.roster.employees = current.employees;

      const rawUpdate = vi.spyOn(current.db.aiTeamAssignments, 'update');
      const rawPut = vi.spyOn(current.db.aiTeamAssignments, 'put');
      await current.coordinator.send('Làm báo cáo');
      await waitForReady(current.coordinator);

      // Non-status fields (`reportMessageId`, `instructionMessageId`) may be written directly;
      // a `runStatus` patch may not.
      for (const call of rawUpdate.mock.calls) {
        const patch = call[1] as Record<string, unknown>;
        expect(patch).not.toHaveProperty('runStatus');
        expect(patch).not.toHaveProperty('stopReason');
        expect(patch).not.toHaveProperty('incomplete');
      }
      // `transitionAssignment` is the only `put` on this table (its own guarded write).
      expect(rawPut.mock.calls.length).toBeGreaterThan(0);

      const { assignments } = await rowsFor(current);
      expect(assignments[0]!.runStatus).toBe('done');
    });

    it('writes exactly one report row when two finalizeAttempt calls race from queued', async () => {
      harness = await createHarness({ scripts: {} });
      const current = harness;
      const batch = await openBatch(
        {
          teamId: current.team.id,
          threadId: current.threadId,
          batchIndex: 1,
          userRequest: 'x',
          leadId: current.lead.id,
          planSnapshot: { original: [] },
          planDecision: 'auto',
        },
        current.db
      );
      const attempt = await createAssignment(
        {
          batchId: batch.id,
          agentId: current.employees[0]!.id,
          agentName: current.employees[0]!.name,
          model: EMP_A_MODEL,
          task: 'Việc',
        },
        current.db
      );

      await Promise.all([
        current.coordinator.finalizeAttempt(
          attempt.id,
          'queued',
          'stopped',
          'user-abort',
          'Đã dừng.'
        ),
        current.coordinator.finalizeAttempt(
          attempt.id,
          'queued',
          'stopped',
          'user-abort',
          'Đã dừng.'
        ),
      ]);

      const reports = await current.db.chatMessages
        .where('threadId')
        .equals(current.threadId)
        .toArray();
      expect(reports.filter((row) => row.assignmentId === attempt.id)).toHaveLength(1);
      const stored = await current.db.aiTeamAssignments.get(attempt.id);
      expect(stored).toMatchObject({ runStatus: 'stopped', incomplete: true });
      expect(stored!.reportMessageId).toBeDefined();
    });
  });

  describe('Termination guarantees (D-16, AIO-RUNTIME-01)', () => {
    const assignmentsFor = (employees: AiEmployee[]) =>
      employees.map((row, index) => ({ agentId: row.id, task: `Việc ${index + 1}` }));

    const delegatingLead =
      (harnessRef: () => Harness): LoopScript =>
      async (options) => {
        await options.executeToolFn!(
          'delegate_batch',
          { assignments: assignmentsFor(harnessRef().employees) },
          harnessRef().db,
          options.signal
        );
        return loopResult('Xong.');
      };

    it('resolves the batch when one of three agents throws, and never stays in batch-running', async () => {
      const synthesisPrompts: string[] = [];
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true },
        synthesisScript: async (options) => {
          synthesisPrompts.push(JSON.stringify(options.messages));
          return loopResult('Đã tổng hợp.');
        },
        scripts: {
          [LEAD_MODEL]: delegatingLead(() => harness!),
          [EMP_A_MODEL]: async () => loopResult('A xong'),
          [EMP_B_MODEL]: async () => {
            throw new Error('B nổ');
          },
          [EMP_C_MODEL]: async () => loopResult('C xong'),
        },
      });
      const current = harness;

      await current.coordinator.send('Làm báo cáo');
      await waitForReady(current.coordinator);

      const rows = await current.db.aiTeamAssignments.toArray();
      expect(rows.map((row) => row.runStatus).sort()).toEqual(['done', 'done', 'error']);
      // D-14: the honest tail reaches the LEAD through the synthesis prompt, not the tool result.
      expect(synthesisPrompts).toHaveLength(1);
      expect(synthesisPrompts[0]).toContain(current.employees[1]!.name);
      expect(synthesisPrompts[0]).toContain('Chưa hoàn tất');
      expect(current.coordinator.getState().phase).not.toBe('batch-running');
    });

    it('still resolves the batch when a pre-start read throws for one agent', async () => {
      const repo = await import('../../../../src/db/repositories/teamTranscriptRepo');
      const original = repo.listRecentTurns;
      let calls = 0;
      const spy = vi
        .spyOn(repo, 'listRecentTurns')
        .mockImplementation(async (threadId, n, targetDb) => {
          calls += 1;
          // The first employee's pre-start read fails; the lead's and the siblings' do not.
          if (calls === 2) throw new Error('history hỏng');
          return original(threadId, n, targetDb);
        });

      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true },
        scripts: {
          [LEAD_MODEL]: delegatingLead(() => harness!),
          [EMP_A_MODEL]: async () => loopResult('A xong'),
          [EMP_B_MODEL]: async () => loopResult('B xong'),
          [EMP_C_MODEL]: async () => loopResult('C xong'),
        },
      });
      const current = harness;

      try {
        await current.coordinator.send('Làm báo cáo');
        await waitForReady(current.coordinator);
      } finally {
        spy.mockRestore();
      }

      expect(calls).toBeGreaterThan(1);
      const rows = await current.db.aiTeamAssignments.toArray();
      expect(rows.filter((row) => row.runStatus === 'error')).toHaveLength(1);
      expect(rows.filter((row) => row.runStatus === 'done').length).toBeGreaterThan(0);
      expect(current.coordinator.getState().phase).not.toBe('batch-running');
      // The deferred map drained: a second submit is accepted rather than reported busy.
      await expect(current.coordinator.send('Lượt nữa')).resolves.toBe('started');
    });

    it('keeps the thrown literal out of every stored message and in the ledger detail', async () => {
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true },
        scripts: {
          [LEAD_MODEL]: delegatingLead(() => harness!),
          [EMP_A_MODEL]: async () => {
            throw new Error('raw provider secret detail');
          },
        },
      });
      const current = harness;
      current.employees = current.employees.slice(0, 1);
      current.roster.employees = current.employees;

      await current.coordinator.send('Làm báo cáo');
      await waitForReady(current.coordinator);

      const assignment = (await current.db.aiTeamAssignments.toArray())[0]!;
      expect(assignment.runStatus).toBe('error');
      expect(assignment.stopReason).toBe('provider');
      expect(assignment.diagnosticDetail).toBeTruthy();

      const messages = await current.db.chatMessages
        .where('threadId')
        .equals(current.threadId)
        .toArray();
      for (const row of messages) {
        expect(row.content).not.toContain('raw provider secret detail');
      }
    });
  });

  describe('Team turn finishes so getActiveTurns() drains (D-19, AIO-RUNTIME-03)', () => {
    /** Above the manager's 800ms purge, so an unfinished turn would still show up. */
    const PURGE_WINDOW_MS = 1200;
    const drained = () => aiTurnManager.getActiveTurns().length === 0;

    const assignmentsFor = (employees: AiEmployee[]) =>
      employees.map((row, index) => ({ agentId: row.id, task: `Việc ${index + 1}` }));

    const delegatingLead =
      (harnessRef: () => Harness): LoopScript =>
      async (options) => {
        await options.executeToolFn!(
          'delegate_batch',
          { assignments: assignmentsFor(harnessRef().employees) },
          harnessRef().db,
          options.signal
        );
        return loopResult('Xong.');
      };

    it('keeps the team turn registered while the lead is parked, then drains it', async () => {
      const gate = deferred();
      harness = await createHarness({
        scripts: {
          [LEAD_MODEL]: async () => {
            await gate.promise;
            return loopResult('Xong.');
          },
        },
      });
      const { coordinator, team } = harness;

      const sent = coordinator.send('Xin chào');
      await waitFor(() => coordinator.getState().phase === 'lead-thinking');
      // Finishing too early would clear the status indicator mid-run.
      expect(aiTurnManager.getTurn(`team:${team.id}`)).toBeDefined();

      gate.release();
      await sent;
      await waitForReady(coordinator);
      await waitFor(drained, PURGE_WINDOW_MS + 2000);
      expect(aiTurnManager.getActiveTurns()).toHaveLength(0);
    });

    it('drains after a rejected plan', async () => {
      harness = await createHarness({
        scripts: { [LEAD_MODEL]: delegatingLead(() => harness!) },
      });
      const { coordinator } = harness;

      const sent = coordinator.send('Làm báo cáo');
      await waitFor(() => coordinator.getState().phase === 'awaiting-plan');
      coordinator.resolvePlan(false);
      await sent;
      await waitForReady(coordinator);

      await waitFor(drained, PURGE_WINDOW_MS + 2000);
      expect(aiTurnManager.getActiveTurns()).toHaveLength(0);
      expect(coordinator.getState().phase).toBe('ready');
    });

    it('drains after a completed batch and after abortAll mid-run', async () => {
      const gate = deferred();
      let harnessRef: Harness | null = null;
      const employeeScript: LoopScript = async () => {
        await gate.promise;
        return loopResult('báo cáo');
      };
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true },
        scripts: {
          [LEAD_MODEL]: delegatingLead(() => harnessRef!),
          [EMP_A_MODEL]: employeeScript,
          [EMP_B_MODEL]: employeeScript,
          [EMP_C_MODEL]: employeeScript,
        },
      });
      harnessRef = harness;
      const { coordinator, team } = harness;

      const sent = coordinator.send('Làm báo cáo');
      await waitFor(() => coordinator.getState().phase === 'batch-running');
      // A queued agent registers its turn only once admitted, so wait for the admission.
      const firstAgentTurn = `team:${team.id}:agent:${harness.employees[0]!.id}`;
      await waitFor(() => aiTurnManager.getTurn(firstAgentTurn) !== undefined);
      // Both the team turn and an agent turn are live at once and never collide.
      expect(aiTurnManager.getTurn(`team:${team.id}`)).toBeDefined();
      expect(`team:${team.id}`).not.toBe(`team:${team.id}:agent:${harness.employees[0]!.id}`);

      coordinator.abortAll();
      gate.release();
      await sent;
      await waitForReady(coordinator);

      await waitFor(drained, PURGE_WINDOW_MS + 2000);
      expect(aiTurnManager.getActiveTurns()).toHaveLength(0);
      expect(coordinator.getState().phase).toBe('ready');
    });
  });

  describe('Scheduler — one queue, plan order, every slot released (D-04, D-05, AIO-RUNTIME-05)', () => {
    const assignmentsFor = (employees: AiEmployee[]) =>
      employees.map((row, index) => ({ agentId: row.id, task: `Việc ${index + 1}` }));

    /** A lead script that delegates the whole roster, then answers. */
    const delegatingLead =
      (harnessRef: () => Harness): LoopScript =>
      async (options) => {
        await options.executeToolFn!(
          'delegate_batch',
          { assignments: assignmentsFor(harnessRef().employees) },
          harnessRef().db,
          options.signal
        );
        return loopResult('Xong.');
      };

    it('never runs more than the limit and still finishes all five assignments (limit 2)', async () => {
      const gates = new Map<string, ReturnType<typeof deferred>>();
      const runningSamples: number[] = [];
      let toolResult: string | null = null;
      let harnessRef: Harness | null = null;
      const scriptFor = (model: string): LoopScript => async () => {
        const gate = gates.get(model)!;
        await gate.promise;
        return loopResult(`báo cáo ${model}`);
      };
      const models = [EMP_A_MODEL, EMP_B_MODEL, EMP_C_MODEL, EMP_D_MODEL, EMP_E_MODEL];
      for (const model of models) gates.set(model, deferred());

      const scripts: Record<string, LoopScript> = {
        [LEAD_MODEL]: async (options) => {
          toolResult = await options.executeToolFn!(
            'delegate_batch',
            { assignments: assignmentsFor(harnessRef!.employees) },
            harnessRef!.db,
            options.signal
          );
          return loopResult('Xong.');
        },
      };
      for (const model of models) scripts[model] = scriptFor(model);

      harness = await createHarness({
        scripts,
        extraEmployees: 2,
        teamPatch: { autoSplitEnabled: true, concurrencyLimit: 2 },
      });
      harnessRef = harness;
      const current = harness;

      const employeeIds = new Set(current.employees.map((row) => row.id));
      const unsubscribe = current.coordinator.subscribe(() => {
        runningSamples.push(
          current.coordinator
            .getState()
            .agents.filter((row) => row.status === 'running' && employeeIds.has(row.agentId))
            .length
        );
      });
      const sent = current.coordinator.send('Làm báo cáo');
      await waitFor(() => current.coordinator.getRunningCount() === 2);

      for (const gate of gates.values()) gate.release();
      await sent;
      await waitForReady(current.coordinator);
      unsubscribe();

      expect(Math.max(...runningSamples)).toBe(2);
      // D-24: the tool result is an ack naming every dispatched agent, not settled results.
      const ack = JSON.parse(toolResult as unknown as string);
      expect(ack).toMatchObject({ dispatched: 5, status: 'dispatched' });
      expect(ack.agents).toHaveLength(5);

      const rows = await current.db.aiTeamAssignments.toArray();
      expect(rows).toHaveLength(5);
      expect(rows.every((row) => row.runStatus === 'done')).toBe(true);
      expect(current.coordinator.getRunningCount()).toBe(0);
    });

    it('admits in plan order at limit 1 (D-05)', async () => {
      const startOrder: string[] = [];
      const scripts: Record<string, LoopScript> = {
        [LEAD_MODEL]: delegatingLead(() => harness!),
        [EMP_A_MODEL]: async () => {
          startOrder.push('a');
          return loopResult('A');
        },
        [EMP_B_MODEL]: async () => {
          startOrder.push('b');
          return loopResult('B');
        },
        [EMP_C_MODEL]: async () => {
          startOrder.push('c');
          return loopResult('C');
        },
      };
      harness = await createHarness({
        scripts,
        teamPatch: { autoSplitEnabled: true, concurrencyLimit: 1 },
      });

      await harness.coordinator.send('Làm báo cáo');
      await waitForReady(harness.coordinator);

      expect(startOrder).toEqual(['a', 'b', 'c']);
    });

    it('leaves the third assignment queued and never starts its script while two run', async () => {
      const gates = new Map<string, ReturnType<typeof deferred>>([
        [EMP_A_MODEL, deferred()],
        [EMP_B_MODEL, deferred()],
        [EMP_C_MODEL, deferred()],
      ]);
      const started: string[] = [];
      const scriptFor = (model: string): LoopScript => async () => {
        started.push(model);
        await gates.get(model)!.promise;
        return loopResult('xong');
      };
      harness = await createHarness({
        scripts: {
          [LEAD_MODEL]: delegatingLead(() => harness!),
          [EMP_A_MODEL]: scriptFor(EMP_A_MODEL),
          [EMP_B_MODEL]: scriptFor(EMP_B_MODEL),
          [EMP_C_MODEL]: scriptFor(EMP_C_MODEL),
        },
        teamPatch: { autoSplitEnabled: true, concurrencyLimit: 2 },
      });
      const current = harness;

      const sent = current.coordinator.send('Làm báo cáo');
      await waitFor(() => current.coordinator.getRunningCount() === 2);
      await sleep(20);

      // Queued means nothing has started: no runtime, no started script.
      expect(started).toEqual([EMP_A_MODEL, EMP_B_MODEL]);
      const third = current.coordinator
        .getState()
        .agents.find((row) => row.agentId === current.employees[2]!.id);
      expect(third?.status).toBe('queued');

      for (const gate of gates.values()) gate.release();
      await sent;
      await waitForReady(current.coordinator);
      expect(current.coordinator.getRunningCount()).toBe(0);
    });

    it('releases the slot of a pre-start throw so the rest of the queue still runs', async () => {
      const repo = await import('../../../../src/db/repositories/teamTranscriptRepo');
      const original = repo.listRecentTurns;
      let calls = 0;
      const spy = vi
        .spyOn(repo, 'listRecentTurns')
        .mockImplementation(async (threadId, n, targetDb) => {
          calls += 1;
          // The first employee's pre-start read fails; the lead's and the siblings' do not.
          if (calls === 2) throw new Error('history hỏng');
          return original(threadId, n, targetDb);
        });

      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true, concurrencyLimit: 1 },
        scripts: {
          [LEAD_MODEL]: delegatingLead(() => harness!),
          [EMP_A_MODEL]: async () => loopResult('A xong'),
          [EMP_B_MODEL]: async () => loopResult('B xong'),
          [EMP_C_MODEL]: async () => loopResult('C xong'),
        },
      });
      const current = harness;

      try {
        await current.coordinator.send('Làm báo cáo');
        await waitForReady(current.coordinator);
      } finally {
        spy.mockRestore();
      }

      const rows = await current.db.aiTeamAssignments.toArray();
      expect(rows).toHaveLength(3);
      expect(rows.filter((row) => row.runStatus === 'error')).toHaveLength(1);
      expect(rows.filter((row) => row.runStatus === 'done')).toHaveLength(2);
      expect(current.coordinator.getRunningCount()).toBe(0);
      expect(current.coordinator.getState().phase).not.toBe('batch-running');
    });

    it('raises the limit mid-batch and admits the queued agent without rebuilding (D-04)', async () => {
      const gates = new Map<string, ReturnType<typeof deferred>>([
        [EMP_A_MODEL, deferred()],
        [EMP_B_MODEL, deferred()],
        [EMP_C_MODEL, deferred()],
      ]);
      const started: string[] = [];
      const scriptFor = (model: string): LoopScript => async () => {
        started.push(model);
        await gates.get(model)!.promise;
        return loopResult('xong');
      };
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true, concurrencyLimit: 1 },
        scripts: {
          [LEAD_MODEL]: delegatingLead(() => harness!),
          [EMP_A_MODEL]: scriptFor(EMP_A_MODEL),
          [EMP_B_MODEL]: scriptFor(EMP_B_MODEL),
          [EMP_C_MODEL]: scriptFor(EMP_C_MODEL),
        },
      });
      const current = harness;

      const sent = current.coordinator.send('Làm báo cáo');
      await waitFor(() => current.coordinator.getRunningCount() === 1);
      await sleep(20);
      expect(started).toEqual([EMP_A_MODEL]);

      current.coordinator.setTeamSettings({ concurrencyLimit: 3 });
      await waitFor(() => current.coordinator.getRunningCount() === 3);
      // Admission precedes the script call by the pre-start reads; wait for all three.
      await waitFor(() => started.length === 3);
      expect(started).toEqual([EMP_A_MODEL, EMP_B_MODEL, EMP_C_MODEL]);

      for (const gate of gates.values()) gate.release();
      await sent;
      await waitForReady(current.coordinator);
      expect(current.coordinator.getRunningCount()).toBe(0);
    });

    it('lowers the limit mid-batch: both keep running and nothing new starts (D-04)', async () => {
      const gates = new Map<string, ReturnType<typeof deferred>>([
        [EMP_A_MODEL, deferred()],
        [EMP_B_MODEL, deferred()],
        [EMP_C_MODEL, deferred()],
      ]);
      const started: string[] = [];
      const scriptFor = (model: string): LoopScript => async () => {
        started.push(model);
        await gates.get(model)!.promise;
        return loopResult('xong');
      };
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true, concurrencyLimit: 2 },
        scripts: {
          [LEAD_MODEL]: delegatingLead(() => harness!),
          [EMP_A_MODEL]: scriptFor(EMP_A_MODEL),
          [EMP_B_MODEL]: scriptFor(EMP_B_MODEL),
          [EMP_C_MODEL]: scriptFor(EMP_C_MODEL),
        },
      });
      const current = harness;

      const sent = current.coordinator.send('Làm báo cáo');
      await waitFor(() => current.coordinator.getRunningCount() === 2);

      current.coordinator.setTeamSettings({ concurrencyLimit: 1 });
      await sleep(30);

      // Preemption is not a thing: both admitted agents keep running, the third stays queued.
      expect(current.coordinator.getRunningCount()).toBe(2);
      expect(started).toEqual([EMP_A_MODEL, EMP_B_MODEL]);
      const third = current.coordinator
        .getState()
        .agents.find((row) => row.agentId === current.employees[2]!.id);
      expect(third?.status).toBe('queued');

      gates.get(EMP_A_MODEL)!.release();
      await sleep(30);
      // Still one slot in use above the new limit, so the third is still not admitted.
      expect(started).toEqual([EMP_A_MODEL, EMP_B_MODEL]);

      for (const gate of gates.values()) gate.release();
      await sent;
      await waitForReady(current.coordinator);
      expect(current.coordinator.getRunningCount()).toBe(0);
    });

    it('stops a QUEUED agent without invoking its script, and names it incomplete (D-10)', async () => {
      const gates = new Map<string, ReturnType<typeof deferred>>([
        [EMP_A_MODEL, deferred()],
        [EMP_B_MODEL, deferred()],
        [EMP_C_MODEL, deferred()],
      ]);
      const started: string[] = [];
      let toolResult: string | null = null;
      const scriptFor = (model: string): LoopScript => async () => {
        started.push(model);
        await gates.get(model)!.promise;
        return loopResult(`${model} xong`);
      };
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true, concurrencyLimit: 1 },
        scripts: {
          [LEAD_MODEL]: async (options) => {
            toolResult = await options.executeToolFn!(
              'delegate_batch',
              { assignments: assignmentsFor(harness!.employees) },
              harness!.db,
              options.signal
            );
            return loopResult('Xong.');
          },
          [EMP_A_MODEL]: scriptFor(EMP_A_MODEL),
          [EMP_B_MODEL]: scriptFor(EMP_B_MODEL),
          [EMP_C_MODEL]: scriptFor(EMP_C_MODEL),
        },
      });
      const current = harness;

      const sent = current.coordinator.send('Làm báo cáo');
      await waitFor(() => current.coordinator.getRunningCount() === 1);
      await sleep(20);
      // The queued target is the SECOND assignment; aborting its acquire must not hang.
      current.coordinator.stopAgent(current.employees[1]!.id);
      for (const gate of gates.values()) gate.release();
      await sent;
      await waitForReady(current.coordinator);

      expect(started).toEqual([EMP_A_MODEL, EMP_C_MODEL]);

      const rows = await current.db.aiTeamAssignments.toArray();
      const stopped = rows.find((row) => row.agentId === current.employees[1]!.id)!;
      // `stopped`, not `running`: proves the `from: 'queued'` call was the one that committed.
      expect(stopped).toMatchObject({
        runStatus: 'stopped',
        stopReason: 'user-per-agent',
        incomplete: true,
      });
      const rowsWithReport = await current.db.chatMessages
        .where('threadId')
        .equals(current.threadId)
        .toArray();
      const report = rowsWithReport.find(
        (row) => row.assignmentId === stopped.id && row.messageKind === 'report'
      );
      expect(report).toBeDefined();
      expect(report).toMatchObject({
        runStatus: 'stopped',
        stopReason: 'user-per-agent',
        incomplete: true,
      });

      // D-24: the ack names every dispatched agent; the outcome lives in the ledger.
      const ack = JSON.parse(toolResult as unknown as string);
      expect(ack).toMatchObject({ dispatched: 3, status: 'dispatched' });
      expect(ack.agents.map((row: any) => row.agentId)).toContain(current.employees[1]!.id);
    });

    it('abortAll settles every queued assignment and closes the batch as a user abort (D-11)', async () => {
      const gate = deferred();
      let toolResult: string | null = null;
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true, concurrencyLimit: 1 },
        scripts: {
          [LEAD_MODEL]: async (options) => {
            toolResult = await options.executeToolFn!(
              'delegate_batch',
              { assignments: assignmentsFor(harness!.employees) },
              harness!.db,
              options.signal
            );
            return loopResult('Xong.');
          },
          [EMP_A_MODEL]: async () => {
            await gate.promise;
            return loopResult('A xong');
          },
          [EMP_B_MODEL]: async () => loopResult('B xong'),
          [EMP_C_MODEL]: async () => loopResult('C xong'),
        },
      });
      const current = harness;

      const sent = current.coordinator.send('Làm báo cáo');
      await waitFor(() => current.coordinator.getRunningCount() === 1);

      current.coordinator.abortAll();
      gate.release();
      await sent;
      // D-24: the abort settles the ledger asynchronously, after the dispatch turn returned.
      await waitFor(() => current.coordinator.getRunningCount() === 0);
      await sleep(50);

      const rows = await current.db.aiTeamAssignments.toArray();
      expect(rows).toHaveLength(3);
      expect(
        rows.every((row) => row.runStatus === 'stopped' && row.incomplete === true)
      ).toBe(true);
      expect(rows.every((row) => row.stopReason === 'user-abort')).toBe(true);
      expect(current.coordinator.getRunningCount()).toBe(0);

      const batches = await current.db.aiTeamBatches.toArray();
      expect(batches).toHaveLength(1);
      expect(batches[0]!.abortedBy).toBe('user');
      expect(batches[0]!.endedAt).toBeDefined();
      expect(current.coordinator.getState().phase).toBe('ready');

      // D-24: the ack is not a result set; the ledger is the authority on what happened.
      const ack = JSON.parse(toolResult as unknown as string);
      expect(ack).toMatchObject({ dispatched: 3, status: 'dispatched' });
    });

    it('dispose mid-batch rejects the parked acquire and settles the queued assignment (limit 1)', async () => {
      const gate = deferred();
      let toolResult: string | null = null;
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true, concurrencyLimit: 1 },
        scripts: {
          [LEAD_MODEL]: async (options) => {
            toolResult = await options.executeToolFn!(
              'delegate_batch',
              { assignments: assignmentsFor(harness!.employees) },
              harness!.db,
              options.signal
            );
            return loopResult('Xong.');
          },
          [EMP_A_MODEL]: async () => {
            await gate.promise;
            return loopResult('A xong');
          },
          [EMP_B_MODEL]: async () => loopResult('B xong'),
          [EMP_C_MODEL]: async () => loopResult('C xong'),
        },
      });
      const current = harness;

      const sent = current.coordinator.send('Làm báo cáo');
      await waitFor(() => current.coordinator.getRunningCount() === 1);

      await current.coordinator.dispose();
      gate.release();
      // Must resolve: a parked acquire that outlives the dispose would hang here.
      await sent;
      await waitFor(() => current.coordinator.getRunningCount() === 0);
      await sleep(50);

      const rows = await current.db.aiTeamAssignments.toArray();
      expect(rows).toHaveLength(3);
      const queued = rows.filter((row) => row.agentId !== current.employees[0]!.id);
      expect(queued).toHaveLength(2);
      expect(
        queued.every((row) => row.runStatus === 'stopped' && row.incomplete === true)
      ).toBe(true);
      // D-24: the ack is not a result set; the ledger above is the authority.
      const ack = JSON.parse(toolResult as unknown as string);
      expect(ack).toMatchObject({ dispatched: 3, status: 'dispatched' });
      expect(current.coordinator.getRunningCount()).toBe(0);
      expect(current.coordinator.getState().phase).toBe('ready');
    });
  });

  describe('Retry — one assignment re-runs, its report is superseded, the batch re-synthesizes (D-12, D-13, D-23)', () => {
    const assignmentsFor = (employees: AiEmployee[]) =>
      employees.map((row, index) => ({ agentId: row.id, task: `Việc ${index + 1}` }));

    it('re-runs only the failed agent, appends attempt 2, and re-synthesizes the full batch', async () => {
      const invocations = new Map<string, number>();
      const synthesisPrompts: string[] = [];
      let bAttempts = 0;
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true, concurrencyLimit: 1 },
        synthesisScript: async (options) => {
          synthesisPrompts.push(
            options.messages
              .filter((message) => message.role === 'system')
              .map((message) => String(message.content))
              .join('\n')
          );
          return loopResult('Tổng hợp lần hai.');
        },
        scripts: {
          [LEAD_MODEL]: async (options) => {
            const result = await options.executeToolFn!(
              'delegate_batch',
              { assignments: assignmentsFor(harness!.employees) },
              harness!.db,
              options.signal
            );
            return loopResult(`Đã giao việc: ${result}`);
          },
          [EMP_A_MODEL]: async () => {
            invocations.set('a', (invocations.get('a') ?? 0) + 1);
            return loopResult('A xong lần một.');
          },
          [EMP_B_MODEL]: async () => {
            invocations.set('b', (invocations.get('b') ?? 0) + 1);
            bAttempts += 1;
            if (bAttempts === 1) throw new Error('B hỏng lần một');
            return loopResult('B xong lần hai.');
          },
          [EMP_C_MODEL]: async () => {
            invocations.set('c', (invocations.get('c') ?? 0) + 1);
            return loopResult('C xong lần một.');
          },
        },
      });
      const current = harness;

      await current.coordinator.send('Làm báo cáo');
      await waitForReady(current.coordinator);

      // D-24: the batch itself ends with one synthesis turn; A, C ran once each; B once (failed).
      expect(synthesisPrompts).toHaveLength(1);
      const batchRows = await current.db.aiTeamAssignments.toArray();
      const bFirst = batchRows.find(
        (row) => row.agentId === current.employees[1]!.id && row.attemptNo === 1
      )!;
      expect(bFirst.runStatus).toBe('error');
      // 37-03's insert path ran: an errored attempt owns a real report row.
      expect(bFirst.reportMessageId).toBeDefined();
      const firstReport = await current.db.chatMessages.get(bFirst.reportMessageId!);
      expect(firstReport).toBeDefined();

      await current.coordinator.retryAssignment(bFirst.id);

      const retryRows = (await current.db.aiTeamAssignments.toArray()).filter(
        (row) => row.agentId === current.employees[1]!.id
      );
      expect(retryRows.map((row) => row.attemptNo).sort()).toEqual([1, 2]);
      const bSecond = retryRows.find((row) => row.attemptNo === 2)!;
      expect(bSecond.retryOfAssignmentId).toBe(bFirst.id);
      expect(bSecond.runStatus).toBe('done');
      expect(bSecond.task).toBe(bFirst.task);

      // The prior row is never mutated (D-23).
      const bFirstAfter = await current.db.aiTeamAssignments.get(bFirst.id);
      expect(bFirstAfter).toMatchObject({ runStatus: 'error', attemptNo: 1 });
      expect(bFirstAfter!.retryOfAssignmentId).toBeUndefined();

      // Siblings were not re-run (T-37-23).
      expect(invocations.get('a')).toBe(1);
      expect(invocations.get('c')).toBe(1);
      expect(invocations.get('b')).toBe(2);

      // The old report points at the new one; both fields are written.
      const superseded = await current.db.chatMessages.get(bFirst.reportMessageId!);
      expect(superseded!.supersededByMessageId).toBe(bSecond.reportMessageId);
      expect(superseded!.supersededAt).toBeDefined();

      // D-12: the retry's synthesis turn carried the WHOLE batch, resolved from report rows.
      expect(synthesisPrompts).toHaveLength(2);
      expect(synthesisPrompts[1]).toContain('A xong lần một.');
      expect(synthesisPrompts[1]).toContain('C xong lần một.');
      expect(synthesisPrompts[1]).toContain('B xong lần hai.');
      expect(synthesisPrompts[1]).not.toContain('Không có báo cáo cho lần chạy này.');
      expect(current.coordinator.getRunningCount()).toBe(0);
    });

    it('holds exactly one scheduler slot during the retry and refuses a done assignment', async () => {
      const gate = deferred();
      let bAttempts = 0;
      const runningSamples: number[] = [];
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true },
        scripts: {
          [LEAD_MODEL]: async (options) => {
            // The re-synthesis turn must not delegate again (it is a synthesis-only pass).
            if (String(options.messages.at(-1)?.content).includes('Tổng hợp lại kết quả của lô')) {
              return loopResult('Tổng hợp lần hai.');
            }
            await options.executeToolFn!(
              'delegate_batch',
              { assignments: assignmentsFor(harness!.employees) },
              harness!.db,
              options.signal
            );
            return loopResult('Xong.');
          },
          [EMP_A_MODEL]: async () => loopResult('A xong'),
          [EMP_B_MODEL]: async () => {
            bAttempts += 1;
            if (bAttempts === 1) throw new Error('B hỏng');
            await gate.promise;
            return loopResult('B xong lần hai');
          },
          [EMP_C_MODEL]: async () => loopResult('C xong'),
        },
      });
      const current = harness;

      await current.coordinator.send('Làm báo cáo');
      await waitForReady(current.coordinator);
      const rows = await current.db.aiTeamAssignments.toArray();
      const bFirst = rows.find(
        (row) => row.agentId === current.employees[1]!.id && row.attemptNo === 1
      )!;
      const aFirst = rows.find(
        (row) => row.agentId === current.employees[0]!.id && row.attemptNo === 1
      )!;

      const retried = current.coordinator.retryAssignment(bFirst.id);
      await waitFor(() => current.coordinator.getRunningCount() === 1);
      runningSamples.push(current.coordinator.getRunningCount());
      // A second click on the SAME assignment while its retry runs is ignored.
      await current.coordinator.retryAssignment(bFirst.id);
      gate.release();
      await retried;

      // A retry of a `done` assignment is refused on a free phase and appends no row.
      await expect(current.coordinator.retryAssignment(aFirst.id)).rejects.toThrow();

      expect(runningSamples).toEqual([1]);
      expect(current.coordinator.getRunningCount()).toBe(0);
      const bRows = (await current.db.aiTeamAssignments.toArray()).filter(
        (row) => row.agentId === current.employees[1]!.id
      );
      expect(bRows).toHaveLength(2);
      const aRows = (await current.db.aiTeamAssignments.toArray()).filter(
        (row) => row.agentId === current.employees[0]!.id
      );
      expect(aRows).toHaveLength(1);
    });

    it('refuses a retry while the phase is busy', async () => {
      const gate = deferred();
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true },
        scripts: {
          [LEAD_MODEL]: async (options) => {
            await options.executeToolFn!(
              'delegate_batch',
              { assignments: assignmentsFor(harness!.employees) },
              harness!.db,
              options.signal
            );
            return loopResult('Xong.');
          },
          [EMP_A_MODEL]: async () => {
            await gate.promise;
            return loopResult('A xong');
          },
          [EMP_B_MODEL]: async () => loopResult('B xong'),
          [EMP_C_MODEL]: async () => loopResult('C xong'),
        },
      });
      const current = harness;
      const batch = await openBatch(
        {
          teamId: current.team.id,
          threadId: current.threadId,
          batchIndex: 9,
          userRequest: 'x',
          leadId: current.lead.id,
          planSnapshot: { original: [] },
          planDecision: 'auto',
        },
        current.db
      );
      const stopped = await createAssignment(
        {
          batchId: batch.id,
          agentId: current.employees[0]!.id,
          agentName: current.employees[0]!.name,
          model: EMP_A_MODEL,
          task: 'Việc cũ',
        },
        current.db
      );
      await current.db.aiTeamAssignments.update(stopped.id, {
        runStatus: 'stopped',
        stopReason: 'user-per-agent',
        incomplete: true,
        reportMessageId: 'missing-row',
      });

      const sent = current.coordinator.send('Làm báo cáo');
      await waitFor(() => current.coordinator.getState().phase === 'batch-running');

      await expect(current.coordinator.retryAssignment(stopped.id)).rejects.toThrow();
      gate.release();
      await sent;
      await waitForReady(current.coordinator);
    });

    it('leaves exactly one report row when the retry is stopped before it settles', async () => {
      const gate = deferred();
      let bAttempts = 0;
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true, concurrencyLimit: 1 },
        scripts: {
          [LEAD_MODEL]: async (options) => {
            if (String(options.messages.at(-1)?.content).includes('Tổng hợp lại kết quả của lô')) {
              return loopResult('Tổng hợp lần hai.');
            }
            await options.executeToolFn!(
              'delegate_batch',
              { assignments: assignmentsFor(harness!.employees) },
              harness!.db,
              options.signal
            );
            return loopResult('Xong.');
          },
          [EMP_A_MODEL]: async () => loopResult('A xong'),
          [EMP_B_MODEL]: async () => {
            bAttempts += 1;
            if (bAttempts === 1) throw new Error('B hỏng');
            await gate.promise;
            return loopResult('B xong lần hai');
          },
          [EMP_C_MODEL]: async () => loopResult('C xong'),
        },
      });
      const current = harness;
      await current.coordinator.send('Làm báo cáo');
      await waitForReady(current.coordinator);

      const bFirst = (await current.db.aiTeamAssignments.toArray()).find(
        (row) => row.agentId === current.employees[1]!.id && row.attemptNo === 1
      )!;

      const retried = current.coordinator.retryAssignment(bFirst.id);
      await waitFor(() => current.coordinator.getRunningCount() === 1);
      current.coordinator.stopAgent(current.employees[1]!.id);
      gate.release();
      await retried;

      const bRows = (await current.db.aiTeamAssignments.toArray()).filter(
        (row) => row.agentId === current.employees[1]!.id
      );
      const attempt2 = bRows.find((row) => row.attemptNo === 2)!;
      expect(attempt2.runStatus).toBe('stopped');
      expect(attempt2.incomplete).toBe(true);
      const reports = await current.db.chatMessages
        .where('threadId')
        .equals(current.threadId)
        .toArray();
      const attempt2Reports = reports.filter(
        (row) => row.assignmentId === attempt2.id && row.messageKind === 'report'
      );
      expect(attempt2Reports).toHaveLength(1);
      expect(attempt2Reports[0]!.runStatus).toBe('stopped');
      expect(attempt2Reports[0]!.incomplete).toBe(true);
      expect(current.coordinator.getRunningCount()).toBe(0);
    });

    it('refuses a retry whose agent has left the roster, and writes no attempt row', async () => {
      let bAttempts = 0;
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true },
        scripts: {
          [LEAD_MODEL]: async (options) => {
            await options.executeToolFn!(
              'delegate_batch',
              { assignments: assignmentsFor(harness!.employees) },
              harness!.db,
              options.signal
            );
            return loopResult('Xong.');
          },
          [EMP_A_MODEL]: async () => loopResult('A xong'),
          [EMP_B_MODEL]: async () => {
            bAttempts += 1;
            throw new Error('B hỏng');
          },
          [EMP_C_MODEL]: async () => loopResult('C xong'),
        },
      });
      const current = harness;
      await current.coordinator.send('Làm báo cáo');
      await waitForReady(current.coordinator);

      const bFirst = (await current.db.aiTeamAssignments.toArray()).find(
        (row) => row.agentId === current.employees[1]!.id && row.attemptNo === 1
      )!;
      expect(bFirst.runStatus).toBe('error');
      expect(bAttempts).toBe(1);

      const before = await current.db.aiTeamAssignments.count();
      // The coordinator's `roster.employees` is this SAME array (no `loadRoster` seam), so
      // removing the member here removes him from the roster the retry reads.
      current.employees.splice(1, 1);

      await expect(current.coordinator.retryAssignment(bFirst.id)).rejects.toThrow(
        'Nhân viên không còn trong nhóm'
      );

      expect(await current.db.aiTeamAssignments.count()).toBe(before);
      // WR-03: the refusal throws AFTER the phase claim, so the `finally` must still hold.
      expect(current.coordinator.getState().phase).toBe('ready');
      expect(current.coordinator.getRunningCount()).toBe(0);
      expect(bAttempts).toBe(1);
    });

    // WR-03: everything after the phase claim must be covered by one `finally`. Before this,
    // a throwing transcription write left `phase === 'batch-running'` — a BUSY phase — so
    // every later submit queued and the release effect never fired.
    it('restores ready when the retry throws after claiming the phase', async () => {
      let bAttempts = 0;
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true, concurrencyLimit: 1 },
        scripts: {
          [LEAD_MODEL]: async (options) => {
            if (String(options.messages.at(-1)?.content).includes('Tổng hợp lại kết quả của lô')) {
              return loopResult('Tổng hợp lần hai.');
            }
            await options.executeToolFn!(
              'delegate_batch',
              { assignments: assignmentsFor(harness!.employees) },
              harness!.db,
              options.signal
            );
            return loopResult('Xong.');
          },
          [EMP_A_MODEL]: async () => loopResult('A xong'),
          [EMP_B_MODEL]: async () => {
            bAttempts += 1;
            if (bAttempts === 1) throw new Error('B hỏng');
            return loopResult('B xong lần hai');
          },
          [EMP_C_MODEL]: async () => loopResult('C xong'),
        },
      });
      const current = harness;
      await current.coordinator.send('Làm báo cáo');
      await waitForReady(current.coordinator);

      const bFirst = (await current.db.aiTeamAssignments.toArray()).find(
        (row) => row.agentId === current.employees[1]!.id && row.attemptNo === 1
      )!;

      const repo = await import('../../../../src/db/repositories/teamTranscriptRepo');
      const spy = vi
        .spyOn(repo, 'supersedeTeamMessage')
        .mockRejectedValueOnce(new Error('transcript hỏng'));
      try {
        await expect(current.coordinator.retryAssignment(bFirst.id)).rejects.toThrow(
          'transcript hỏng'
        );
      } finally {
        spy.mockRestore();
      }

      expect(current.coordinator.getState().phase).toBe('ready');
      // The next submit starts a real turn instead of being queued behind a wedged phase.
      await expect(current.coordinator.send('Lượt nữa')).resolves.toBe('started');
    });

    // WR-04: the busy guard and the phase claim must be in the SAME tick. With awaits
    // between them two clicks passed the guard, both created attempts, and both ran a
    // synthesis — which then raced on the previous synthesis id.
    it('claims the phase synchronously so two same-tick retries cannot both run', async () => {
      let bAttempts = 0;
      let cAttempts = 0;
      let synthesisRuns = 0;
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true, concurrencyLimit: 2 },
        synthesisScript: async () => {
          synthesisRuns += 1;
          return loopResult('Tổng hợp lần hai.');
        },
        scripts: {
          [LEAD_MODEL]: async (options) => {
            await options.executeToolFn!(
              'delegate_batch',
              { assignments: assignmentsFor(harness!.employees) },
              harness!.db,
              options.signal
            );
            return loopResult('Xong.');
          },
          [EMP_A_MODEL]: async () => loopResult('A xong'),
          [EMP_B_MODEL]: async () => {
            bAttempts += 1;
            if (bAttempts === 1) throw new Error('B hỏng');
            return loopResult('B xong lần hai');
          },
          [EMP_C_MODEL]: async () => {
            cAttempts += 1;
            if (cAttempts === 1) throw new Error('C hỏng');
            return loopResult('C xong lần hai');
          },
        },
      });
      const current = harness;
      await current.coordinator.send('Làm báo cáo');
      await waitForReady(current.coordinator);

      const rows = await current.db.aiTeamAssignments.toArray();
      const bFirst = rows.find(
        (row) => row.agentId === current.employees[1]!.id && row.attemptNo === 1
      )!;
      const cFirst = rows.find(
        (row) => row.agentId === current.employees[2]!.id && row.attemptNo === 1
      )!;

      const results = await Promise.allSettled([
        current.coordinator.retryAssignment(bFirst.id),
        current.coordinator.retryAssignment(cFirst.id),
      ]);

      expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
      const refused = results.find((row) => row.status === 'rejected') as PromiseRejectedResult;
      expect(String(refused.reason)).toContain('Nhóm đang chạy');
      // Exactly one retry ran: one extra attempt row, one extra synthesis (the batch's own
      // synthesis turn already ran, so the count is 2).
      expect(synthesisRuns).toBe(2);
      const after = await current.db.aiTeamAssignments.toArray();
      expect(after.filter((row) => row.attemptNo === 2)).toHaveLength(1);
    });

    // WR-05: `lastSynthesisMessageId` is coordinator memory and `getOrCreateRun` builds a
    // fresh coordinator on every mount. Retrying after a remount therefore superseded
    // nothing, leaving two "current" syntheses — the D-12 violation.
    it('supersedes the previous synthesis after a remount (fresh coordinator)', async () => {
      let bAttempts = 0;
      const scripts: Record<string, LoopScript> = {
        [LEAD_MODEL]: async (options) => {
          if (String(options.messages.at(-1)?.content).includes('Tổng hợp lại kết quả của lô')) {
            return loopResult('Tổng hợp lần hai.');
          }
          await options.executeToolFn!(
            'delegate_batch',
            { assignments: assignmentsFor(harness!.employees) },
            harness!.db,
            options.signal
          );
          return loopResult('Xong lần một.');
        },
        [EMP_A_MODEL]: async () => loopResult('A xong'),
        [EMP_B_MODEL]: async () => {
          bAttempts += 1;
          if (bAttempts === 1) throw new Error('B hỏng');
          return loopResult('B xong lần hai.');
        },
        [EMP_C_MODEL]: async () => loopResult('C xong'),
      };
      harness = await createHarness({ teamPatch: { autoSplitEnabled: true }, scripts });
      const current = harness;

      await current.coordinator.send('Làm báo cáo');
      await waitForReady(current.coordinator);

      // D-24: the dispatch turn's answer and the batch's synthesis are both synthesis rows,
      // and the dispatch one is superseded — exactly one synthesis stays current.
      const batchSyntheses = (await current.db.chatMessages
        .where('threadId')
        .equals(current.threadId)
        .toArray()).filter((row) => row.messageKind === 'synthesis');
      expect(batchSyntheses).toHaveLength(2);
      const firstSynthesis = batchSyntheses.find(
        (row) => row.supersededByMessageId === undefined
      )!;
      expect(
        batchSyntheses.filter((row) => row.supersededByMessageId === undefined)
      ).toHaveLength(1);

      const bFirst = (await current.db.aiTeamAssignments.toArray()).find(
        (row) => row.agentId === current.employees[1]!.id && row.attemptNo === 1
      )!;

      // Remount: a NEW coordinator for the same team/thread, no memory of the first run.
      const remounted = createTeamRunCoordinator({
        db: current.db,
        team: current.team,
        lead: current.lead,
        employees: current.employees,
        skills: [current.skill],
        threadId: current.threadId,
        model: LEAD_MODEL,
        endpoint: 'https://example.invalid/v1',
        apiKey: 'sk-test',
        createRuntimeDeps: (agentId: string) => ({
          runLoop: ((loopOptions: AiOrchestratorLoopOptions) => {
            const script = scripts[loopOptions.model];
            if (!script) throw new Error(`No script for ${loopOptions.model} (${agentId})`);
            return script(loopOptions);
          }) as unknown as ChatTurnRuntimeDeps['runLoop'],
        }),
      });

      await remounted.retryAssignment(bFirst.id);

      const syntheses = (await current.db.chatMessages
        .where('threadId')
        .equals(current.threadId)
        .toArray()).filter((row) => row.messageKind === 'synthesis');
      // D-24: the batch ends with its own synthesis turn, so the retry's synthesis is the
      // third row — and exactly one synthesis stays current afterwards.
      const currentSyntheses = syntheses.filter(
        (row) => row.supersededByMessageId === undefined
      );
      expect(currentSyntheses).toHaveLength(1);
      const latest = currentSyntheses[0]!;
      expect(latest.id).not.toBe(firstSynthesis.id);
      const firstAfter = await current.db.chatMessages.get(firstSynthesis.id);
      expect(firstAfter!.supersededByMessageId).toBe(latest.id);
      expect(remounted.getState().phase).toBe('ready');
    });

    // WR-06: a throw inside the create/dispatch loop escaped `runBatch` as a tool error.
    // `startLeadTurn` only resets `ready` from the lead phases, so the coordinator stayed
    // in `batch-running`: every later submit queued forever and the batch row never ended.
    it('closes the batch and restores ready when createAssignment throws mid-loop', async () => {
      const repo = await import('../../../../src/db/repositories/aiTeamRunRepo');
      const original = repo.createAssignment;
      let calls = 0;
      const spy = vi.spyOn(repo, 'createAssignment').mockImplementation(async (input, targetDb) => {
        calls += 1;
        // The second assignment's insert fails after the first was created.
        if (calls === 2) throw new Error('ledger hỏng');
        return original(input, targetDb);
      });

      const started: string[] = [];
      let toolResult: string | null = null;
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true },
        scripts: {
          [LEAD_MODEL]: async (options) => {
            toolResult = await options.executeToolFn!(
              'delegate_batch',
              { assignments: assignmentsFor(harness!.employees) },
              harness!.db,
              options.signal
            );
            return loopResult('Xong.');
          },
          [EMP_A_MODEL]: async () => {
            started.push('a');
            return loopResult('A xong');
          },
          [EMP_B_MODEL]: async () => {
            started.push('b');
            return loopResult('B xong');
          },
          [EMP_C_MODEL]: async () => {
            started.push('c');
            return loopResult('C xong');
          },
        },
      });
      const current = harness;

      try {
        await current.coordinator.send('Làm báo cáo');
        await waitForReady(current.coordinator);
      } finally {
        spy.mockRestore();
      }

      // The lead got a refusal, not a thrown tool error.
      expect(JSON.parse(toolResult as unknown as string)).toMatchObject({ cancelled: true });
      expect(current.coordinator.getState().phase).toBe('ready');

      const batches = await current.db.aiTeamBatches.toArray();
      expect(batches).toHaveLength(1);
      expect(batches[0]!.endedAt).toBeDefined();
      expect(batches[0]!.abortedBy).toBe('none');
      // Whatever was dispatched before the throw still settled itself.
      expect(started).toEqual(['a']);
      // Its dispatch task is not awaited by this call, so it releases its slot on its own.
      await waitFor(() => current.coordinator.getRunningCount() === 0);
      // The next submit starts a real turn instead of queueing behind a wedged phase.
      await expect(current.coordinator.send('Lượt nữa')).resolves.toBe('started');
    });

    // WR-07: `stopAgent` writes its ledger entry from a detached async block, so attempt 1's
    // finalize can resolve AFTER attempt 2 registered. The unlink must not remove attempt 2's
    // entry — doing so saved attempt 2's report with no link fields and then read its `done`
    // as the missing-report error.
    it('keeps a newer attempt linked when an older attempt finalizes late', async () => {
      const gate = deferred();
      let bAttempts = 0;
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true, concurrencyLimit: 1 },
        scripts: {
          [LEAD_MODEL]: async (options) => {
            if (String(options.messages.at(-1)?.content).includes('Tổng hợp lại kết quả của lô')) {
              return loopResult('Tổng hợp lần hai.');
            }
            await options.executeToolFn!(
              'delegate_batch',
              { assignments: assignmentsFor(harness!.employees) },
              harness!.db,
              options.signal
            );
            return loopResult('Xong.');
          },
          [EMP_A_MODEL]: async () => loopResult('A xong'),
          [EMP_B_MODEL]: async () => {
            bAttempts += 1;
            if (bAttempts === 1) throw new Error('B hỏng');
            await gate.promise;
            return loopResult('B xong lần hai');
          },
          [EMP_C_MODEL]: async () => loopResult('C xong'),
        },
      });
      const current = harness;
      await current.coordinator.send('Làm báo cáo');
      await waitForReady(current.coordinator);

      const bFirst = (await current.db.aiTeamAssignments.toArray()).find(
        (row) => row.agentId === current.employees[1]!.id && row.attemptNo === 1
      )!;

      const retried = current.coordinator.retryAssignment(bFirst.id);
      // Attempt 2 is now RUNNING and registered as the active attempt for B.
      await waitFor(() => current.coordinator.getRunningCount() === 1);
      await waitFor(
        () =>
          current.coordinator.getState().agents.find(
            (row) => row.agentId === current.employees[1]!.id
          )?.status === 'running'
      );

      // The late finalize of attempt 1 loses the `from` guard but still returns its row.
      const late = await current.coordinator.finalizeAttempt(
        bFirst.id,
        'running',
        'stopped',
        'user-abort',
        STOPPED_REPORT_COPY
      );
      expect(late).not.toBeNull();

      gate.release();
      await retried;

      const attempt2 = (await current.db.aiTeamAssignments.toArray()).find(
        (row) => row.agentId === current.employees[1]!.id && row.attemptNo === 2
      )!;
      expect(attempt2.runStatus).toBe('done');
      expect(attempt2.reportMessageId).toBeDefined();
      const report = await current.db.chatMessages.get(attempt2.reportMessageId!);
      expect(report).toMatchObject({ content: 'B xong lần hai', runStatus: 'done' });
    });
  });

  describe('Dispose — a live run ends in bounded time (D-11, D-18)', () => {
    const assignmentsFor = (employees: AiEmployee[]) =>
      employees.map((row, index) => ({ agentId: row.id, task: `Việc ${index + 1}` }));

    it('resolves a send() parked on the plan card and leaves the phase ready', async () => {
      let harnessRef: Harness | null = null;
      harness = await createHarness({
        scripts: {
          [LEAD_MODEL]: async (options) => {
            await options.executeToolFn!(
              'delegate_batch',
              { assignments: assignmentsFor(harnessRef!.employees) },
              harnessRef!.db,
              options.signal
            );
            return loopResult('Xong.');
          },
        },
      });
      harnessRef = harness;
      const { coordinator } = harness;

      const sent = coordinator.send('Làm báo cáo');
      await waitFor(() => coordinator.getState().phase === 'awaiting-plan');

      await coordinator.dispose();
      await sent;
      await waitForReady(coordinator);

      const state = coordinator.getState();
      expect(state.phase).toBe('ready');
      expect(state.agents.every((row) => row.status !== 'running')).toBe(true);
      expect(state.pendingPlan).toBeNull();
    });

    it('leaves the phase ready when disposed mid-runBatch', async () => {
      let harnessRef: Harness | null = null;
      const gate = deferred();
      const employeeScript: LoopScript = async () => {
        await gate.promise;
        return loopResult('báo cáo');
      };
      harness = await createHarness({
        scripts: {
          [LEAD_MODEL]: async (options) => {
            await options.executeToolFn!(
              'delegate_batch',
              { assignments: assignmentsFor(harnessRef!.employees) },
              harnessRef!.db,
              options.signal
            );
            return loopResult('Xong.');
          },
          [EMP_A_MODEL]: employeeScript,
          [EMP_B_MODEL]: employeeScript,
          [EMP_C_MODEL]: employeeScript,
        },
        teamPatch: { autoSplitEnabled: true },
      });
      harnessRef = harness;
      const { coordinator, employees } = harness;

      const sent = coordinator.send('Làm báo cáo');
      await waitFor(
        () =>
          employees.filter((row) =>
            coordinator.getState().agents.some(
              (state) => state.agentId === row.id && state.status === 'running'
            )
          ).length === 3
      );

      await coordinator.dispose();
      gate.release();
      await sent;
      await waitForReady(coordinator);

      // The `lead-synthesizing` tail runs after `Promise.all(deferreds)`; a disposed
      // coordinator must never write it.
      expect(coordinator.getState().phase).toBe('ready');
    });

    it('starts no script when send() is called after dispose', async () => {
      const started: string[] = [];
      harness = await createHarness({
        scripts: {
          [LEAD_MODEL]: async () => {
            started.push('lead');
            return loopResult('Xong.');
          },
          [EMP_A_MODEL]: async () => {
            started.push('emp-a');
            return loopResult('báo cáo');
          },
        },
      });
      const { coordinator, employees } = harness;

      await coordinator.dispose();
      await coordinator.send('Xin chào');
      await coordinator.send('@[An](agent:' + employees[0]!.id + ') kiểm tra');

      expect(started).toEqual([]);
      expect(coordinator.getState().agents).toEqual([]);
    });

    it('is idempotent: a second dispose resolves and changes nothing', async () => {
      harness = await createHarness({
        scripts: { [LEAD_MODEL]: async () => loopResult('Xong.') },
      });
      const { coordinator, db, threadId } = harness;

      await coordinator.dispose();
      const afterFirst = await db.chatMessages.where('threadId').equals(threadId).count();
      await expect(coordinator.dispose()).resolves.toBeUndefined();

      expect(coordinator.getState().phase).toBe('ready');
      expect(await db.chatMessages.where('threadId').equals(threadId).count()).toBe(afterFirst);
    });

    it('refuses a batch run after dispose and starts no employee turn', async () => {
      const started: string[] = [];
      harness = await createHarness({
        scripts: {
          [EMP_A_MODEL]: async () => {
            started.push('emp-a');
            return loopResult('báo cáo');
          },
        },
      });
      const { coordinator } = harness;

      await coordinator.dispose();
      const result = await coordinator.runBatch([
        { agentId: harness.employees[0]!.id, task: 'Việc' },
      ]);

      expect(JSON.parse(result)).toMatchObject({ cancelled: true });
      expect(started).toEqual([]);
    });

    it('refuses a batch when dispose lands inside the delegate_batch validation (CR-02)', async () => {
      const gate = deferred();
      const teamTools = await import('../../../../src/services/ai/office/teamTools');
      const original = teamTools.executeTeamTool;
      const spy = vi.spyOn(teamTools, 'executeTeamTool').mockImplementation(async (name, args, ctx) => {
        if (normalizeToolName(name) === 'delegate_batch') await gate.promise;
        return original(name, args, ctx);
      });

      let toolResult: string | null = null;
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true },
        scripts: {
          [LEAD_MODEL]: async (options) => {
            toolResult = await options.executeToolFn!(
              'delegate_batch',
              { assignments: assignmentsFor(harness!.employees) },
              harness!.db,
              options.signal
            );
            return loopResult('Xong.');
          },
          [EMP_A_MODEL]: async () => loopResult('A xong'),
        },
      });
      const current = harness;

      try {
        const sent = current.coordinator.send('Làm báo cáo');
        await waitFor(() => toolResult === null && current.coordinator.getState().phase === 'lead-thinking');

        // The delete lands while the lead is still inside `delegate_batch`.
        await current.coordinator.dispose();
        gate.release();
        await sent;
        await waitForReady(current.coordinator);

        // No batch row, no attempt row, no runtime — and the lead got a refusal, not a hang.
        expect(await current.db.aiTeamBatches.count()).toBe(0);
        expect(await current.db.aiTeamAssignments.count()).toBe(0);
        expect(current.coordinator.getRunningCount()).toBe(0);
        // Only the lead (settled by dispose) — no employee ever registered a runtime.
        expect(
          current.coordinator.getState().agents.filter((row) => row.agentId !== current.lead.id)
        ).toEqual([]);
        expect(current.coordinator.getState().phase).toBe('ready');
        expect(JSON.parse(toolResult as unknown as string)).toMatchObject({ cancelled: true });
      } finally {
        spy.mockRestore();
      }
    });

    // IN-07: the dispatch catch used `userStopped.get(agentId) ?? 'user-abort'`, so a row
    // settled by a team delete recorded `user-abort` while the batch recorded
    // `team-deleted`. The ledger and the batch must agree.
    it('records team-deleted on the attempt rows when dispose tears the run down', async () => {
      const gate = deferred();
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true, concurrencyLimit: 1 },
        scripts: {
          [LEAD_MODEL]: async (options) => {
            await options.executeToolFn!(
              'delegate_batch',
              { assignments: assignmentsFor(harness!.employees) },
              harness!.db,
              options.signal
            );
            return loopResult('Xong.');
          },
          [EMP_A_MODEL]: async () => {
            await gate.promise;
            return loopResult('A xong');
          },
          [EMP_B_MODEL]: async () => loopResult('B xong'),
          [EMP_C_MODEL]: async () => loopResult('C xong'),
        },
      });
      const current = harness;

      const sent = current.coordinator.send('Làm báo cáo');
      await waitFor(() => current.coordinator.getRunningCount() === 1);

      await current.coordinator.dispose('team-deleted');
      gate.release();
      await sent;
      await waitForReady(current.coordinator);

      const rows = await current.db.aiTeamAssignments.toArray();
      expect(rows).toHaveLength(3);
      const queued = rows.filter((row) => row.agentId !== current.employees[0]!.id);
      expect(queued.every((row) => row.stopReason === 'team-deleted')).toBe(true);
      const batch = (await current.db.aiTeamBatches.toArray())[0]!;
      expect(batch.abortedBy).toBe('team-deleted');
      expect(batch.endedAt).toBeDefined();
    });

    it('records app-exit on the attempt rows when the app tears the run down', async () => {
      const gate = deferred();
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true, concurrencyLimit: 1 },
        scripts: {
          [LEAD_MODEL]: async (options) => {
            await options.executeToolFn!(
              'delegate_batch',
              { assignments: assignmentsFor(harness!.employees) },
              harness!.db,
              options.signal
            );
            return loopResult('Xong.');
          },
          [EMP_A_MODEL]: async () => {
            await gate.promise;
            return loopResult('A xong');
          },
          [EMP_B_MODEL]: async () => loopResult('B xong'),
          [EMP_C_MODEL]: async () => loopResult('C xong'),
        },
      });
      const current = harness;

      const sent = current.coordinator.send('Làm báo cáo');
      await waitFor(() => current.coordinator.getRunningCount() === 1);

      await current.coordinator.dispose('app-exit');
      gate.release();
      await sent;
      await waitForReady(current.coordinator);

      const batch = (await current.db.aiTeamBatches.toArray())[0]!;
      // `app-exit` has no assignment-level stop reason (D-22 union), so the exit fact lives
      // on the batch row and the attempts stay terminal as `user-abort`.
      expect(batch.abortedBy).toBe('app-exit');
      expect(batch.endedAt).toBeDefined();
      const queued = (await current.db.aiTeamAssignments.toArray()).filter(
        (row) => row.agentId !== current.employees[0]!.id
      );
      expect(queued.every((row) => row.runStatus === 'stopped')).toBe(true);
    });

    it('aborts every assignment controller and empties the map', () => {
      // 37-02 establishes the map and the abort-all loop; 37-04 wires the producers, so
      // here the loop is proven directly against a populated map.
      const first = new AbortController();
      const second = new AbortController();
      const controllers = new Map<string, AbortController>([
        ['assignment-1', first],
        ['assignment-2', second],
      ]);

      abortAllAssignmentControllers(controllers);

      expect(first.signal.aborted).toBe(true);
      expect(second.signal.aborted).toBe(true);
      expect(controllers.size).toBe(0);
    });
  });

  describe('D-24 event-driven batch', () => {
    const assignmentsFor = (employees: AiEmployee[]) =>
      employees.map((row, index) => ({ agentId: row.id, task: `Việc ${index + 1}` }));

    it('the leader turn ends while agents are still running', async () => {
      const employeeGate = deferred();
      let leadTurnFinished = false;
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true },
        scripts: {
          [LEAD_MODEL]: async (options) => {
            await options.executeToolFn!(
              'delegate_batch',
              { assignments: assignmentsFor(harness!.employees) },
              harness!.db,
              options.signal
            );
            leadTurnFinished = true;
            return loopResult('Đã giao việc.');
          },
          [EMP_A_MODEL]: async () => {
            await employeeGate.promise;
            return loopResult('A xong');
          },
          [EMP_B_MODEL]: async () => loopResult('B xong'),
          [EMP_C_MODEL]: async () => loopResult('C xong'),
        },
      });
      const current = harness;

      await current.coordinator.send('Làm báo cáo');

      // The dispatch turn returned, but the batch is still open and A has not settled.
      expect(leadTurnFinished).toBe(true);
      expect(current.coordinator.getState().phase).toBe('batch-running');
      expect(
        current.coordinator.getState().agents.find(
          (row) => row.agentId === current.employees[0]!.id
        )?.status
      ).toBe('running');

      employeeGate.release();
      await waitForReady(current.coordinator);
    });

    it('aborting the leader tool-call signal does not abort the batch', async () => {
      const employeeGate = deferred();
      const toolCallController = new AbortController();
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true },
        scripts: {
          [LEAD_MODEL]: async (options) => {
            await options.executeToolFn!(
              'delegate_batch',
              { assignments: assignmentsFor(harness!.employees) },
              harness!.db,
              toolCallController.signal
            );
            // The lead's turn is over: its own signal aborts. Under D-24 that must not
            // reach any agent.
            toolCallController.abort();
            return loopResult('Đã giao việc.');
          },
          [EMP_A_MODEL]: async () => {
            await employeeGate.promise;
            return loopResult('A xong');
          },
          [EMP_B_MODEL]: async () => {
            await employeeGate.promise;
            return loopResult('B xong');
          },
          [EMP_C_MODEL]: async () => {
            await employeeGate.promise;
            return loopResult('C xong');
          },
        },
      });
      const current = harness;

      await current.coordinator.send('Làm báo cáo');
      employeeGate.release();
      await waitForReady(current.coordinator);

      const rows = await current.db.aiTeamAssignments.toArray();
      expect(rows).toHaveLength(3);
      expect(rows.every((row) => row.runStatus === 'done')).toBe(true);
      expect(rows.some((row) => row.stopReason === 'user-abort')).toBe(false);
    });

    it('refuses a second batch while one is open', async () => {
      const employeeGate = deferred();
      const results: string[] = [];
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true },
        scripts: {
          [LEAD_MODEL]: async (options) => {
            results.push(
              await options.executeToolFn!(
                'delegate_batch',
                { assignments: assignmentsFor(harness!.employees) },
                harness!.db,
                options.signal
              )
            );
            results.push(
              await options.executeToolFn!(
                'delegate_batch',
                { assignments: assignmentsFor(harness!.employees) },
                harness!.db,
                options.signal
              )
            );
            return loopResult('Xong.');
          },
          [EMP_A_MODEL]: async () => {
            await employeeGate.promise;
            return loopResult('A xong');
          },
          [EMP_B_MODEL]: async () => {
            await employeeGate.promise;
            return loopResult('B xong');
          },
          [EMP_C_MODEL]: async () => {
            await employeeGate.promise;
            return loopResult('C xong');
          },
        },
      });
      const current = harness;

      await current.coordinator.send('Làm báo cáo');

      expect(results).toHaveLength(2);
      expect(JSON.parse(results[0]!).status).toBe('dispatched');
      expect(JSON.parse(results[1]!).cancelled).toBe(true);
      expect(await current.db.aiTeamBatches.count()).toBe(1);

      employeeGate.release();
      await waitForReady(current.coordinator);
    });

    it('keeps the team turn registered through batch-running and finishes it once', async () => {
      const employeeGate = deferred();
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true },
        scripts: {
          [LEAD_MODEL]: async (options) => {
            await options.executeToolFn!(
              'delegate_batch',
              { assignments: assignmentsFor(harness!.employees) },
              harness!.db,
              options.signal
            );
            return loopResult('Đã giao việc.');
          },
          [EMP_A_MODEL]: async () => {
            await employeeGate.promise;
            return loopResult('A xong');
          },
          [EMP_B_MODEL]: async () => loopResult('B xong'),
          [EMP_C_MODEL]: async () => loopResult('C xong'),
        },
      });
      const current = harness;
      const teamTurnId = `team:${current.team.id}`;

      await current.coordinator.send('Làm báo cáo');
      await waitFor(() => current.coordinator.getState().phase === 'batch-running');
      // The dispatch turn ended, yet the team turn must still be live.
      expect(aiTurnManager.getTurn(teamTurnId)).toBeDefined();
      expect(aiTurnManager.getActiveTurns().some((turn) => turn.id === teamTurnId)).toBe(true);

      employeeGate.release();
      await waitForReady(current.coordinator);
      await waitFor(
        () => !aiTurnManager.getActiveTurns().some((turn) => turn.id === teamTurnId),
        1200 + 2000
      );
    });

    it('counts tokens from both lead turns', async () => {
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true, budgetTokens: 100000 },
        synthesisScript: async (options) => {
          options.onUsage?.({ totalTokens: 400 });
          return loopResult('Đã tổng hợp.');
        },
        scripts: {
          [LEAD_MODEL]: async (options) => {
            options.onUsage?.({ totalTokens: 300 });
            await options.executeToolFn!(
              'delegate_batch',
              { assignments: assignmentsFor(harness!.employees) },
              harness!.db,
              options.signal
            );
            return loopResult('Đã giao việc.');
          },
          [EMP_A_MODEL]: async () => loopResult('A xong'),
          [EMP_B_MODEL]: async () => loopResult('B xong'),
          [EMP_C_MODEL]: async () => loopResult('C xong'),
        },
      });
      const current = harness;

      await current.coordinator.send('Làm báo cáo');
      await waitForReady(current.coordinator);

      const leadMember = (
        await current.db.aiTeamMembers.where('teamId').equals(current.team.id).toArray()
      ).find((row) => row.agentId === current.lead.id)!;
      // Both lead turns report; a per-agent baseline would lose the dispatch turn's 300.
      expect(leadMember.usedTokens).toBe(700);
    });
  });

  describe('steer delivery (37.1 D-01/D-02/D-16/D-17/D-28)', () => {
    const assignmentsFor = (employees: AiEmployee[]) =>
      employees.map((row, index) => ({ agentId: row.id, task: `Việc ${index + 1}` }));

    const steerRows = async (current: Harness) =>
      (
        await current.db.chatMessages.where('threadId').equals(current.threadId).toArray()
      ).filter((row) => row.messageKind === 'steer');

    const systemPromptOf = (options: AiOrchestratorLoopOptions): string =>
      options.messages
        .filter((message) => message.role === 'system')
        .map((message) => String(message.content))
        .join('\n');

    const lastTextOf = (options: AiOrchestratorLoopOptions): string =>
      String(options.messages.at(-1)?.content ?? '');

    it('a mid-batch message returns steered and starts a lead re-plan turn', async () => {
      const gate = deferred();
      const leadTexts: string[] = [];
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true },
        scripts: {
          [LEAD_MODEL]: async (options) => {
            leadTexts.push(lastTextOf(options));
            if (leadTexts.length === 1) {
              await options.executeToolFn!(
                'delegate_batch',
                { assignments: assignmentsFor(harness!.employees) },
                harness!.db,
                options.signal
              );
              return loopResult('Đã giao việc.');
            }
            return loopResult('Đã đọc chỉ đạo.');
          },
          [EMP_A_MODEL]: async () => {
            await gate.promise;
            return loopResult('A xong');
          },
          [EMP_B_MODEL]: async () => loopResult('B xong'),
          [EMP_C_MODEL]: async () => loopResult('C xong'),
        },
      });
      const current = harness;

      const sent = current.coordinator.send('Làm báo cáo');
      await waitFor(() => current.coordinator.getState().phase === 'batch-running');

      await expect(
        current.coordinator.send('đổi hướng sang kiểm thử')
      ).resolves.toBe('steered');

      const rows = await steerRows(current);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        role: 'user',
        messageKind: 'steer',
        content: 'đổi hướng sang kiểm thử',
      });
      // D-15: a user row, never an agent bubble.
      expect(rows[0]!.agentId).toBeUndefined();

      await waitFor(() => leadTexts.length === 2);
      expect(leadTexts[1]).toBe('đổi hướng sang kiểm thử');

      gate.release();
      await sent;
      await waitForReady(current.coordinator);
    });

    it('an @agent steer is NOT delivered until the leader calls deliver_steer', async () => {
      const gate = deferred();
      const injected: string[] = [];
      const deliveries: string[] = [];
      let steerId = '';
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true },
        scripts: {
          [LEAD_MODEL]: async (options) => {
            if (!lastTextOf(options).includes('@[')) {
              await options.executeToolFn!(
                'delegate_batch',
                { assignments: assignmentsFor(harness!.employees) },
                harness!.db,
                options.signal
              );
              return loopResult('Đã giao việc.');
            }
            // The steer turn: the id comes from the prompt, exactly as a real lead would.
            steerId = /id: ([0-9a-f-]{36})/.exec(systemPromptOf(options))?.[1] ?? '';
            deliveries.push(
              await options.executeToolFn!(
                'deliver_steer',
                { steerMessageId: steerId },
                harness!.db,
                options.signal
              )
            );
            return loopResult('Đã giao chỉ đạo.');
          },
          [EMP_A_MODEL]: async (options) => {
            await gate.promise;
            const messages = await options.beforeToolRound?.(2, options.signal);
            if (messages && messages.length > 0) injected.push(JSON.stringify(messages));
            return loopResult('A xong');
          },
          [EMP_B_MODEL]: async () => loopResult('B xong'),
          [EMP_C_MODEL]: async () => loopResult('C xong'),
        },
      });
      const current = harness;
      const target = current.employees[0]!;

      const sent = current.coordinator.send('Làm báo cáo');
      await waitFor(() => current.coordinator.getState().phase === 'batch-running');

      await expect(
        current.coordinator.send(`@[${target.name}](agent:${target.id}) đổi hướng`)
      ).resolves.toBe('steered');

      // D-28: the leader is the gate — nothing is written to the assignment yet.
      const beforeDelivery = await current.db.aiTeamAssignments.toArray();
      expect(beforeDelivery.every((row) => (row.steerMessageIds ?? []).length === 0)).toBe(true);

      await waitFor(() => deliveries.length === 1);
      expect(JSON.parse(deliveries[0]!)).toMatchObject({ delivered: true, agentId: target.id });

      gate.release();
      await sent;
      await waitForReady(current.coordinator);

      expect(injected).toHaveLength(1);
      expect(injected[0]).toContain('[Chỉ đạo từ người dùng]');
      expect(injected[0]).toContain('đổi hướng');
    });

    it('a held steer never reaches the agent', async () => {
      const gate = deferred();
      const injected: string[] = [];
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true },
        scripts: {
          [LEAD_MODEL]: async (options) => {
            if (!lastTextOf(options).includes('@[')) {
              await options.executeToolFn!(
                'delegate_batch',
                { assignments: assignmentsFor(harness!.employees) },
                harness!.db,
                options.signal
              );
              return loopResult('Đã giao việc.');
            }
            // D-18: the leader holds a problematic steer and never calls deliver_steer.
            return loopResult('Chỉ đạo này mâu thuẫn với việc đang chạy, bạn xác nhận giúp.');
          },
          [EMP_A_MODEL]: async (options) => {
            await gate.promise;
            const messages = await options.beforeToolRound?.(2, options.signal);
            if (messages && messages.length > 0) injected.push(JSON.stringify(messages));
            return loopResult('A xong');
          },
          [EMP_B_MODEL]: async () => loopResult('B xong'),
          [EMP_C_MODEL]: async () => loopResult('C xong'),
        },
      });
      const current = harness;
      const target = current.employees[0]!;

      const sent = current.coordinator.send('Làm báo cáo');
      await waitFor(() => current.coordinator.getState().phase === 'batch-running');
      await current.coordinator.send(`@[${target.name}](agent:${target.id}) đổi hướng`);
      await waitFor(() => current.coordinator.getState().pendingSteerMessageIds.length === 0);

      gate.release();
      await sent;
      await waitForReady(current.coordinator);

      expect(injected).toEqual([]);
      const rows = await current.db.aiTeamAssignments.toArray();
      expect(rows.every((row) => (row.steerMessageIds ?? []).length === 0)).toBe(true);
      // The row survives as the honest record of a held steer.
      expect(await steerRows(current)).toHaveLength(1);
    });

    it('a steer to a settled agent returns refused and writes no steerMessageIds', async () => {
      const gate = deferred();
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true },
        scripts: {
          [LEAD_MODEL]: async (options) => {
            if (lastTextOf(options) === 'Làm báo cáo') {
              await options.executeToolFn!(
                'delegate_batch',
                { assignments: assignmentsFor(harness!.employees) },
                harness!.db,
                options.signal
              );
              return loopResult('Đã giao việc.');
            }
            return loopResult('Nhân viên đã xong việc.');
          },
          [EMP_A_MODEL]: async () => loopResult('A xong'),
          [EMP_B_MODEL]: async () => {
            await gate.promise;
            return loopResult('B xong');
          },
          [EMP_C_MODEL]: async () => loopResult('C xong'),
        },
      });
      const current = harness;
      const settled = current.employees[0]!;

      const sent = current.coordinator.send('Làm báo cáo');
      await waitFor(() => current.coordinator.getState().phase === 'batch-running');
      await waitFor(
        () =>
          current.coordinator
            .getState()
            .agents.some((row) => row.agentId === settled.id && row.status === 'done')
      );

      await expect(
        current.coordinator.send(`@[${settled.name}](agent:${settled.id}) đổi hướng`)
      ).resolves.toBe('refused');

      const rows = await current.db.aiTeamAssignments.toArray();
      expect(rows.every((row) => (row.steerMessageIds ?? []).length === 0)).toBe(true);

      gate.release();
      await sent;
      await waitForReady(current.coordinator);
    });

    it('the leader reads an @agent steer too', async () => {
      const gate = deferred();
      const leadPrompts: string[] = [];
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true },
        scripts: {
          [LEAD_MODEL]: async (options) => {
            if (!lastTextOf(options).includes('@[')) {
              await options.executeToolFn!(
                'delegate_batch',
                { assignments: assignmentsFor(harness!.employees) },
                harness!.db,
                options.signal
              );
              return loopResult('Đã giao việc.');
            }
            leadPrompts.push(lastTextOf(options));
            return loopResult('Đã đọc.');
          },
          [EMP_A_MODEL]: async () => {
            await gate.promise;
            return loopResult('A xong');
          },
          [EMP_B_MODEL]: async () => loopResult('B xong'),
          [EMP_C_MODEL]: async () => loopResult('C xong'),
        },
      });
      const current = harness;
      const target = current.employees[0]!;

      const sent = current.coordinator.send('Làm báo cáo');
      await waitFor(() => current.coordinator.getState().phase === 'batch-running');
      await current.coordinator.send(`@[${target.name}](agent:${target.id}) đổi hướng`);
      await waitFor(() => leadPrompts.length === 1);

      // D-16: the group chat rule — the leader reads every message, mentions included.
      expect(leadPrompts[0]).toContain('đổi hướng');

      gate.release();
      await sent;
      await waitForReady(current.coordinator);
    });

    it('the lead prompt carries the pending steer id so deliver_steer is callable', async () => {
      const gate = deferred();
      let prompt = '';
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true },
        scripts: {
          [LEAD_MODEL]: async (options) => {
            if (!lastTextOf(options).includes('@[')) {
              await options.executeToolFn!(
                'delegate_batch',
                { assignments: assignmentsFor(harness!.employees) },
                harness!.db,
                options.signal
              );
              return loopResult('Đã giao việc.');
            }
            prompt = systemPromptOf(options);
            return loopResult('Đã đọc.');
          },
          [EMP_A_MODEL]: async () => {
            await gate.promise;
            return loopResult('A xong');
          },
          [EMP_B_MODEL]: async () => loopResult('B xong'),
          [EMP_C_MODEL]: async () => loopResult('C xong'),
        },
      });
      const current = harness;
      const target = current.employees[0]!;

      const sent = current.coordinator.send('Làm báo cáo');
      await waitFor(() => current.coordinator.getState().phase === 'batch-running');
      await current.coordinator.send(`@[${target.name}](agent:${target.id}) đổi hướng`);
      await waitFor(() => prompt.length > 0);

      const steer = (await steerRows(current))[0]!;
      expect(prompt).toContain('CHỈ ĐẠO CHỜ XỬ LÝ');
      expect(prompt).toContain(steer.id);
      expect(prompt).toContain('deliver_steer');
      // D-04: the ledger is what the leader reports from.
      expect(prompt).toContain('HIỆN TRẠNG LÔ ĐANG CHẠY');
      expect(prompt).toContain(target.name);

      gate.release();
      await sent;
      await waitForReady(current.coordinator);
    });

    it('clears the unread badge when the leader drains', async () => {
      const gate = deferred();
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true },
        scripts: {
          [LEAD_MODEL]: async (options) => {
            if (lastTextOf(options) === 'Làm báo cáo') {
              await options.executeToolFn!(
                'delegate_batch',
                { assignments: assignmentsFor(harness!.employees) },
                harness!.db,
                options.signal
              );
              return loopResult('Đã giao việc.');
            }
            return loopResult('Đã đọc.');
          },
          [EMP_A_MODEL]: async () => {
            await gate.promise;
            return loopResult('A xong');
          },
          [EMP_B_MODEL]: async () => loopResult('B xong'),
          [EMP_C_MODEL]: async () => loopResult('C xong'),
        },
      });
      const current = harness;

      const sent = current.coordinator.send('Làm báo cáo');
      await waitFor(() => current.coordinator.getState().phase === 'batch-running');

      await current.coordinator.send('chỉ đạo giữa lô');
      // D-03: the row is unread until the leader's re-plan turn reads it.
      expect(current.coordinator.getState().pendingSteerMessageIds).toHaveLength(1);
      await waitFor(() => current.coordinator.getState().pendingSteerMessageIds.length === 0);

      gate.release();
      await sent;
      await waitForReady(current.coordinator);
    });

    // CR-01: the steer turn used to clear the pending set BEFORE `start()`, which throws
    // TURN_IN_PROGRESS while the lead is parked on the plan card — the id was lost and the
    // running turn's drain saw nothing.
    it('keeps a steer pending while the lead is parked, then injects it at the next round', async () => {
      const injected: string[] = [];
      let harnessRef: Harness | null = null;
      harness = await createHarness({
        scripts: {
          [LEAD_MODEL]: async (options) => {
            if (!isSynthesisTurn(options) && lastTextOf(options) === 'Làm báo cáo') {
              await options.executeToolFn!(
                'delegate_batch',
                { assignments: assignmentsFor(harnessRef!.employees) },
                harnessRef!.db,
                options.signal
              );
              // The plan resolved; the running turn's next round boundary must drain.
              const messages = await options.beforeToolRound?.(2, options.signal);
              if (messages && messages.length > 0) injected.push(JSON.stringify(messages));
              return loopResult('Đã giao việc.');
            }
            return loopResult('Đã tổng hợp.');
          },
          [EMP_A_MODEL]: async () => loopResult('A xong'),
          [EMP_B_MODEL]: async () => loopResult('B xong'),
          [EMP_C_MODEL]: async () => loopResult('C xong'),
        },
      });
      harnessRef = harness;
      const current = harness;

      const sent = current.coordinator.send('Làm báo cáo');
      await waitFor(() => current.coordinator.getState().phase === 'awaiting-plan');

      // WR-02: the running turn's own live state, which the rollback must hand back intact.
      const leadId = current.lead.id;
      const before = current.coordinator.getState().agents.find((row) => row.agentId === leadId)!;
      expect(before.status).toBe('running');
      expect(aiTurnManager.getTurn(`team:${current.team.id}:agent:${leadId}`)).toBeDefined();

      await expect(current.coordinator.send('chỉ đạo khi đang chờ')).resolves.toBe('steered');
      // The lead runtime is live, so the steer turn cannot start — the id must stay pending.
      expect(current.coordinator.getState().pendingSteerMessageIds).toHaveLength(1);
      // WR-02: the rollback must not wipe the running turn's live state or finish its turn.
      const after = current.coordinator.getState().agents.find((row) => row.agentId === leadId)!;
      expect(after.status).toBe('running');
      expect(after.startedAt).toBe(before.startedAt);
      expect(aiTurnManager.getTurn(`team:${current.team.id}:agent:${leadId}`)).toBeDefined();

      current.coordinator.resolvePlan(true);
      await sent;
      await waitForReady(current.coordinator);

      expect(injected).toHaveLength(1);
      expect(injected[0]).toContain('chỉ đạo khi đang chờ');
      expect(current.coordinator.getState().pendingSteerMessageIds).toEqual([]);
    });

    // CR-01: a steer persisted while no batch is open carries no `batchId`, so the workspace
    // ledger query (scoped by the steer's `batchId`) could never see its delivery. The
    // delivery write must stamp the batch onto the steer row.
    it('stamps the batch onto a steer row that had none when it was persisted', async () => {
      const gate = deferred();
      const leadGate = deferred();
      let delivered: string | null = null;
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true },
        scripts: {
          [LEAD_MODEL]: async (options) => {
            if (lastTextOf(options) === 'Làm báo cáo') {
              // Hold the dispatch turn open so the steer is persisted while NO batch exists.
              await leadGate.promise;
              await options.executeToolFn!(
                'delegate_batch',
                { assignments: assignmentsFor(harness!.employees) },
                harness!.db,
                options.signal
              );
              return loopResult('Đã giao việc.');
            }
            // The steer turn: the id comes from the prompt, exactly as a real lead would.
            const steerId = /id: ([0-9a-f-]{36})/.exec(systemPromptOf(options))?.[1] ?? '';
            delivered = await options.executeToolFn!(
              'deliver_steer',
              { steerMessageId: steerId },
              harness!.db,
              options.signal
            );
            return loopResult('Đã giao chỉ đạo.');
          },
          [EMP_A_MODEL]: async () => {
            await gate.promise;
            return loopResult('A xong');
          },
          [EMP_B_MODEL]: async () => loopResult('B xong'),
          [EMP_C_MODEL]: async () => loopResult('C xong'),
        },
      });
      const current = harness;
      const target = current.employees[0]!;

      const sent = current.coordinator.send('Làm báo cáo');
      await waitFor(() => current.coordinator.getState().phase === 'lead-thinking');

      // The headline flow: the leader is still planning, so no batch row exists yet.
      await current.coordinator.send(`@[${target.name}](agent:${target.id}) làm thêm X`);
      const steer = (await steerRows(current))[0]!;
      expect(steer.batchId).toBeUndefined();

      // The dispatch turn ends, the batch opens, and the queued steer turn delivers the row.
      leadGate.release();
      await waitFor(() => delivered !== null);
      expect(JSON.parse(delivered!)).toMatchObject({ delivered: true, agentId: target.id });

      // The workspace derives delivery from the STEER's `batchId`, so it must now be set.
      const assignment = (await current.db.aiTeamAssignments.toArray()).find(
        (row) => row.agentId === target.id
      )!;
      const stamped = await current.db.chatMessages.get(steer.id);
      expect(stamped?.batchId).toBe(assignment.batchId);
      expect(assignment.steerMessageIds).toEqual([steer.id]);

      gate.release();
      await sent;
      await waitForReady(current.coordinator);
    });

    // WR-01: the steer turn renders the pending ids in its system prompt
    // (`[CHỈ ĐẠO CHỜ XỬ LÝ]`), so the round-1 drain must not append the same text again.
    it('injects a steer once per steer turn, not twice', async () => {
      const gate = deferred();
      const injected: string[] = [];
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true },
        scripts: {
          [LEAD_MODEL]: async (options) => {
            if (lastTextOf(options) === 'Làm báo cáo') {
              await options.executeToolFn!(
                'delegate_batch',
                { assignments: assignmentsFor(harness!.employees) },
                harness!.db,
                options.signal
              );
              return loopResult('Đã giao việc.');
            }
            // The steer turn's round boundary — must contribute nothing for the ids the
            // system prompt already rendered.
            const messages = await options.beforeToolRound?.(1, options.signal);
            if (messages && messages.length > 0) injected.push(JSON.stringify(messages));
            return loopResult('Đã đọc.');
          },
          [EMP_A_MODEL]: async () => {
            await gate.promise;
            return loopResult('A xong');
          },
          [EMP_B_MODEL]: async () => loopResult('B xong'),
          [EMP_C_MODEL]: async () => loopResult('C xong'),
        },
      });
      const current = harness;

      const sent = current.coordinator.send('Làm báo cáo');
      await waitFor(() => current.coordinator.getState().phase === 'batch-running');
      await current.coordinator.send('chỉ đạo giữa lô');
      await waitFor(() => current.coordinator.getState().pendingSteerMessageIds.length === 0);

      gate.release();
      await sent;
      await waitForReady(current.coordinator);

      expect(injected).toEqual([]);
    });

    // CR-04/CR-05: the ledger field is the durable "delivered" marker. The drain used to
    // clear it, which erased delivery AND made a concurrent `deliver_steer` lose its id.
    it('keeps the delivered ids on the ledger after the drain, and injects each once', async () => {
      const gate = deferred();
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true },
        scripts: {
          [LEAD_MODEL]: async (options) => {
            if (lastTextOf(options) === 'Làm báo cáo') {
              await options.executeToolFn!(
                'delegate_batch',
                { assignments: assignmentsFor(harness!.employees) },
                harness!.db,
                options.signal
              );
              return loopResult('Đã giao việc.');
            }
            return loopResult('Đã đọc.');
          },
          [EMP_A_MODEL]: async () => {
            await gate.promise;
            return loopResult('A xong');
          },
          [EMP_B_MODEL]: async () => loopResult('B xong'),
          [EMP_C_MODEL]: async () => loopResult('C xong'),
        },
      });
      const current = harness;
      const target = current.employees[1]!;

      const sent = current.coordinator.send('Làm báo cáo');
      await waitFor(() => current.coordinator.getState().phase === 'batch-running');

      const steerRow = await saveTeamMessage(
        {
          threadId: current.threadId,
          role: 'user',
          content: 'đổi hướng',
          messageKind: 'steer',
          targetAgentId: target.id,
        },
        current.db
      );
      const assignment = (await current.db.aiTeamAssignments.toArray()).find(
        (row) => row.agentId === target.id
      )!;
      await current.db.aiTeamAssignments.update(assignment.id, {
        steerMessageIds: [steerRow.id],
      });

      const first = await current.coordinator.drainSteerInbox(target.id, assignment.id);
      expect(first).toHaveLength(1);
      expect(first[0]!.content).toContain('đổi hướng');

      // The durable marker survives, so the badge stays "delivered" (D-14/D-25).
      const after = await current.db.aiTeamAssignments.get(assignment.id);
      expect(after?.steerMessageIds).toEqual([steerRow.id]);

      // A second boundary does not re-inject the same text.
      expect(await current.coordinator.drainSteerInbox(target.id, assignment.id)).toEqual([]);

      gate.release();
      await sent;
      await waitForReady(current.coordinator);
    });

    // WR-07: every other team tool enforces the cross-team read guard (T-34-07).
    it('refuses a steer row from another thread', async () => {
      const gate = deferred();
      let refusal = '';
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true },
        scripts: {
          [LEAD_MODEL]: async (options) => {
            await options.executeToolFn!(
              'delegate_batch',
              { assignments: assignmentsFor(harness!.employees) },
              harness!.db,
              options.signal
            );
            const foreign = await saveTeamMessage(
              {
                threadId: '00000000-0000-4000-8000-0000000000ff',
                role: 'user',
                content: 'chỉ đạo của nhóm khác',
                messageKind: 'steer',
                targetAgentId: harness!.employees[0]!.id,
              },
              harness!.db
            );
            refusal = await options.executeToolFn!(
              'deliver_steer',
              { steerMessageId: foreign.id },
              harness!.db,
              options.signal
            );
            return loopResult('Không giao được.');
          },
          [EMP_A_MODEL]: async () => {
            await gate.promise;
            return loopResult('A xong');
          },
          [EMP_B_MODEL]: async () => loopResult('B xong'),
          [EMP_C_MODEL]: async () => loopResult('C xong'),
        },
      });
      const current = harness;

      const sent = current.coordinator.send('Làm báo cáo');
      await waitFor(() => current.coordinator.getState().phase === 'batch-running');
      await waitFor(() => refusal.length > 0);

      expect(JSON.parse(refusal)).toMatchObject({ refused: true, code: 'TURN_NOT_IN_TEAM' });
      const rows = await current.db.aiTeamAssignments.toArray();
      expect(rows.every((row) => (row.steerMessageIds ?? []).length === 0)).toBe(true);

      gate.release();
      await sent;
      await waitForReady(current.coordinator);
    });
  });

  describe('amend_assignments (37.1 D-06/D-07/D-08/D-27)', () => {
    const assignmentsFor = (employees: AiEmployee[]) =>
      employees.map((row, index) => ({ agentId: row.id, task: `Việc ${index + 1}` }));

    const reportsFor = async (current: Harness, assignmentId: string) =>
      (
        await current.db.chatMessages.where('threadId').equals(current.threadId).toArray()
      ).filter((row) => row.assignmentId === assignmentId && row.messageKind === 'report');

    it('cancels queued assignments so their agents never start', async () => {
      const gate = deferred();
      const started: string[] = [];
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true, concurrencyLimit: 1 },
        scripts: {
          [LEAD_MODEL]: async (options) => {
            await options.executeToolFn!(
              'delegate_batch',
              { assignments: assignmentsFor(harness!.employees) },
              harness!.db,
              options.signal
            );
            const queued = (await harness!.db.aiTeamAssignments.toArray()).filter(
              (row) => row.runStatus === 'queued'
            );
            await options.executeToolFn!(
              'amend_assignments',
              {
                operations: queued.map((row) => ({
                  op: 'cancel',
                  assignmentId: row.id,
                  reason: 'không cần nữa',
                })),
              },
              harness!.db,
              options.signal
            );
            return loopResult('Đã huỷ hai việc.');
          },
          [EMP_A_MODEL]: async () => {
            started.push(EMP_A_MODEL);
            await gate.promise;
            return loopResult('A xong');
          },
          [EMP_B_MODEL]: async () => {
            started.push(EMP_B_MODEL);
            return loopResult('B xong');
          },
          [EMP_C_MODEL]: async () => {
            started.push(EMP_C_MODEL);
            return loopResult('C xong');
          },
        },
      });
      const current = harness;

      const sent = current.coordinator.send('Làm báo cáo');
      await waitFor(() => current.coordinator.getRunningCount() === 1);
      await sleep(30);
      gate.release();
      await sent;
      await waitForReady(current.coordinator);

      // The queued agents never started — only the one that already held the slot.
      expect(started).toEqual([EMP_A_MODEL]);
      expect(current.coordinator.getRunningCount()).toBe(0);

      for (const employee of current.employees.slice(1)) {
        const row = (await current.db.aiTeamAssignments.toArray()).find(
          (candidate) => candidate.agentId === employee.id
        )!;
        expect(row).toMatchObject({
          runStatus: 'stopped',
          stopReason: 'leader-amend',
          incomplete: true,
        });
        // T-37.1-22: the terminal writer inserted the report row, so no banner appears.
        expect(await reportsFor(current, row.id)).toHaveLength(1);
      }
      expect(await listInterruptedAssignments(current.threadId, current.db)).toEqual([]);
    });

    it('rewrites a queued assignment into a new attempt that actually runs', async () => {
      const gate = deferred();
      const instructions: string[] = [];
      const synthesisPrompts: string[] = [];
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true, concurrencyLimit: 1 },
        synthesisScript: async (options) => {
          synthesisPrompts.push(
            options.messages
              .filter((message) => message.role === 'system')
              .map((message) => String(message.content))
              .join('\n')
          );
          return loopResult('Đã tổng hợp.');
        },
        scripts: {
          [LEAD_MODEL]: async (options) => {
            await options.executeToolFn!(
              'delegate_batch',
              { assignments: assignmentsFor(harness!.employees) },
              harness!.db,
              options.signal
            );
            const rows = await harness!.db.aiTeamAssignments.toArray();
            const rewrite = rows.find(
              (row) => row.agentId === harness!.employees[1]!.id && row.runStatus === 'queued'
            )!;
            const cancel = rows.find(
              (row) => row.agentId === harness!.employees[2]!.id && row.runStatus === 'queued'
            )!;
            await options.executeToolFn!(
              'amend_assignments',
              {
                operations: [
                  { op: 'rewrite_task', assignmentId: rewrite.id, task: 'Việc mới cho B' },
                  { op: 'cancel', assignmentId: cancel.id },
                ],
              },
              harness!.db,
              options.signal
            );
            return loopResult('Đã sửa việc.');
          },
          [EMP_A_MODEL]: async () => {
            await gate.promise;
            return loopResult('A xong');
          },
          [EMP_B_MODEL]: async (options) => {
            instructions.push(String(options.messages.at(-1)?.content ?? ''));
            return loopResult('B xong việc mới');
          },
          [EMP_C_MODEL]: async () => loopResult('C xong'),
        },
      });
      const current = harness;
      const target = current.employees[1]!;

      const sent = current.coordinator.send('Làm báo cáo');
      await waitFor(() => current.coordinator.getRunningCount() === 1);
      await sleep(30);
      gate.release();
      await sent;
      await waitForReady(current.coordinator);

      const rows = (await current.db.aiTeamAssignments.toArray()).filter(
        (row) => row.agentId === target.id
      );
      expect(rows.map((row) => row.attemptNo).sort()).toEqual([1, 2]);
      const first = rows.find((row) => row.attemptNo === 1)!;
      const second = rows.find((row) => row.attemptNo === 2)!;
      expect(first).toMatchObject({ runStatus: 'skipped', stopReason: 'leader-amend' });
      expect(second).toMatchObject({ runStatus: 'done', task: 'Việc mới cho B' });
      expect(second.retryOfAssignmentId).toBe(first.id);
      // The replacement really ran, with the new task.
      expect(instructions).toEqual(['Việc mới cho B']);
      expect(synthesisPrompts[0]).toContain('B xong việc mới');
    });

    it('refuses a running assignment with no ledger write', async () => {
      const gate = deferred();
      let refusal = '';
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true, concurrencyLimit: 1 },
        scripts: {
          [LEAD_MODEL]: async (options) => {
            await options.executeToolFn!(
              'delegate_batch',
              { assignments: assignmentsFor(harness!.employees) },
              harness!.db,
              options.signal
            );
            const running = (await harness!.db.aiTeamAssignments.toArray()).find(
              (row) => row.runStatus === 'running'
            )!;
            refusal = await options.executeToolFn!(
              'amend_assignments',
              { operations: [{ op: 'cancel', assignmentId: running.id }] },
              harness!.db,
              options.signal
            );
            return loopResult('Không huỷ được.');
          },
          [EMP_A_MODEL]: async () => {
            await gate.promise;
            return loopResult('A xong');
          },
          [EMP_B_MODEL]: async () => loopResult('B xong'),
          [EMP_C_MODEL]: async () => loopResult('C xong'),
        },
      });
      const current = harness;

      const sent = current.coordinator.send('Làm báo cáo');
      await waitFor(() => current.coordinator.getRunningCount() === 1);
      await sleep(30);
      gate.release();
      await sent;
      await waitForReady(current.coordinator);

      expect(JSON.parse(refusal)).toMatchObject({ refused: true, code: 'NOT_QUEUED' });
      const running = (await current.db.aiTeamAssignments.toArray()).find(
        (row) => row.agentId === current.employees[0]!.id
      )!;
      expect(running).toMatchObject({ runStatus: 'done', stopReason: 'none' });
    });

    it('refuses an assignment id from another batch', async () => {
      const gate = deferred();
      let refusal = '';
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true, concurrencyLimit: 1 },
        scripts: {
          [LEAD_MODEL]: async (options) => {
            await options.executeToolFn!(
              'delegate_batch',
              { assignments: assignmentsFor(harness!.employees) },
              harness!.db,
              options.signal
            );
            // A row in a DIFFERENT batch must never be addressable from this one.
            const otherBatch = await openBatch(
              {
                teamId: harness!.team.id,
                threadId: harness!.threadId,
                batchIndex: 99,
                userRequest: 'lô khác',
                leadId: harness!.lead.id,
                planSnapshot: { original: [] },
                planDecision: 'auto',
              },
              harness!.db
            );
            const foreign = await createAssignment(
              {
                batchId: otherBatch.id,
                agentId: harness!.employees[1]!.id,
                agentName: 'Bình',
                model: EMP_B_MODEL,
                task: 'Việc của lô khác',
              },
              harness!.db
            );
            refusal = await options.executeToolFn!(
              'amend_assignments',
              { operations: [{ op: 'cancel', assignmentId: foreign.id }] },
              harness!.db,
              options.signal
            );
            return loopResult('Không thuộc lô này.');
          },
          [EMP_A_MODEL]: async () => {
            await gate.promise;
            return loopResult('A xong');
          },
          [EMP_B_MODEL]: async () => loopResult('B xong'),
          [EMP_C_MODEL]: async () => loopResult('C xong'),
        },
      });
      const current = harness;

      const sent = current.coordinator.send('Làm báo cáo');
      await waitFor(() => current.coordinator.getRunningCount() === 1);
      await sleep(30);
      gate.release();
      await sent;
      await waitForReady(current.coordinator);

      expect(JSON.parse(refusal)).toMatchObject({
        refused: true,
        code: 'ASSIGNMENT_NOT_IN_BATCH',
      });
      const foreign = (await current.db.aiTeamAssignments.toArray()).find(
        (row) => row.task === 'Việc của lô khác'
      )!;
      expect(foreign.runStatus).toBe('queued');
    });

    it('refuses an employee caller at tier-1 dispatch', async () => {
      let refusal = '';
      harness = await createHarness({
        scripts: {
          [EMP_A_MODEL]: async (options) => {
            refusal = await options.executeToolFn!(
              'amend_assignments',
              { operations: [{ op: 'cancel', assignmentId: 'anything' }] },
              harness!.db,
              options.signal
            );
            return loopResult('A xong');
          },
        },
      });
      const current = harness;

      await current.coordinator.send(
        `@[${current.employees[0]!.name}](agent:${current.employees[0]!.id}) kiểm tra`
      );

      expect(refusal).toBe(EMPLOYEE_AMEND_REFUSAL);
      expect(await current.db.aiTeamAssignments.count()).toBe(0);
    });

    // CR-02: the roster check used to live in the apply loop, so [cancel A, rewrite B] with a
    // de-rostered B cancelled A and THEN reported a total refusal.
    it('refuses the whole list before mutating when a rewrite target left the roster', async () => {
      const gate = deferred();
      let refusal = '';
      let cancelStatusAfterRefusal = '';
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true, concurrencyLimit: 1 },
        scripts: {
          [LEAD_MODEL]: async (options) => {
            await options.executeToolFn!(
              'delegate_batch',
              { assignments: assignmentsFor(harness!.employees) },
              harness!.db,
              options.signal
            );
            const rows = await harness!.db.aiTeamAssignments.toArray();
            const cancel = rows.find(
              (row) => row.agentId === harness!.employees[2]!.id && row.runStatus === 'queued'
            )!;
            // A queued row whose agent is no longer in the roster — the ledger state a
            // mid-batch de-roster leaves behind.
            const orphan = await createAssignment(
              {
                batchId: cancel.batchId,
                agentId: '00000000-0000-4000-8000-00000000dead',
                agentName: 'Đã rời nhóm',
                model: EMP_B_MODEL,
                task: 'Việc cũ',
              },
              harness!.db
            );
            refusal = await options.executeToolFn!(
              'amend_assignments',
              {
                operations: [
                  { op: 'cancel', assignmentId: cancel.id },
                  { op: 'rewrite_task', assignmentId: orphan.id, task: 'Việc mới' },
                ],
              },
              harness!.db,
              options.signal
            );
            // The fixture row is not dispatched, so settle it or the batch's ledger poll
            // would wait on a `queued` row nobody owns.
            await harness!.db.aiTeamAssignments.update(orphan.id, {
              runStatus: 'stopped',
              stopReason: 'leader-amend',
            });
            // Snapshot NOW: the batch keeps running after the refusal, so a later read would
            // show the cancel target's eventual terminal status instead of "not cancelled".
            cancelStatusAfterRefusal = (await harness!.db.aiTeamAssignments.get(cancel.id))!
              .runStatus;
            return loopResult('Không sửa được.');
          },
          [EMP_A_MODEL]: async () => {
            await gate.promise;
            return loopResult('A xong');
          },
          [EMP_B_MODEL]: async () => loopResult('B xong'),
          [EMP_C_MODEL]: async () => loopResult('C xong'),
        },
      });
      const current = harness;

      const sent = current.coordinator.send('Làm báo cáo');
      await waitFor(() => current.coordinator.getRunningCount() === 1);
      await sleep(30);
      gate.release();
      await sent;
      await waitForReady(current.coordinator);

      expect(JSON.parse(refusal)).toMatchObject({ refused: true, code: 'AGENT_NOT_IN_ROSTER' });
      // The cancel in the SAME list must not have been applied at refusal time.
      expect(cancelStatusAfterRefusal).toBe('queued');
    });

    // CR-03: a queued row can already hold delivered steers (D-28). Rewriting it silently
    // dropped them, so the rewrite is refused while any steer is undrained.
    it('refuses a rewrite while the queued row still holds an undrained steer', async () => {
      const gate = deferred();
      let refusal = '';
      harness = await createHarness({
        teamPatch: { autoSplitEnabled: true, concurrencyLimit: 1 },
        scripts: {
          [LEAD_MODEL]: async (options) => {
            await options.executeToolFn!(
              'delegate_batch',
              { assignments: assignmentsFor(harness!.employees) },
              harness!.db,
              options.signal
            );
            const rewrite = (await harness!.db.aiTeamAssignments.toArray()).find(
              (row) => row.agentId === harness!.employees[1]!.id && row.runStatus === 'queued'
            )!;
            const steerRow = await saveTeamMessage(
              {
                threadId: harness!.threadId,
                role: 'user',
                content: 'đổi hướng',
                messageKind: 'steer',
                targetAgentId: harness!.employees[1]!.id,
              },
              harness!.db
            );
            await harness!.db.aiTeamAssignments.update(rewrite.id, {
              steerMessageIds: [steerRow.id],
            });
            refusal = await options.executeToolFn!(
              'amend_assignments',
              { operations: [{ op: 'rewrite_task', assignmentId: rewrite.id, task: 'Việc mới' }] },
              harness!.db,
              options.signal
            );
            return loopResult('Không sửa được.');
          },
          [EMP_A_MODEL]: async () => {
            await gate.promise;
            return loopResult('A xong');
          },
          [EMP_B_MODEL]: async () => loopResult('B xong'),
          [EMP_C_MODEL]: async () => loopResult('C xong'),
        },
      });
      const current = harness;

      const sent = current.coordinator.send('Làm báo cáo');
      await waitFor(() => current.coordinator.getRunningCount() === 1);
      await sleep(30);
      gate.release();
      await sent;
      await waitForReady(current.coordinator);

      expect(JSON.parse(refusal)).toMatchObject({ refused: true, code: 'NOT_QUEUED' });
      const target = (await current.db.aiTeamAssignments.toArray()).filter(
        (row) => row.agentId === current.employees[1]!.id
      );
      // No replacement attempt was created.
      expect(target.map((row) => row.attemptNo)).toEqual([1]);
    });
  });
});
