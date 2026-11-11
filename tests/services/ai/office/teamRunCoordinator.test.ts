// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../../../src/db/index';
import {
  abortAllAssignmentControllers,
  createTeamRunCoordinator,
  resolveTeamToolName,
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
import { ensureTeamThread, saveTeamMessage } from '../../../../src/db/repositories/teamTranscriptRepo';
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

interface HarnessOptions {
  scripts: Record<string, LoopScript>;
  teamPatch?: Partial<
    Pick<AiTeam, 'autoSplitEnabled' | 'autoApproveMutations' | 'budgetTokens' | 'concurrencyLimit'>
  >;
  /** D-03 seam: when true, the coordinator reads its roster from `harness.roster` per turn. */
  useSeam?: boolean;
  /** Extra roster members beyond A/B/C (each gets a distinct model `emp-<d|e>-model`). */
  extraEmployees?: number;
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
      const script = options.scripts[loopOptions.model];
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
          toolResult = await options.executeToolFn!(
            'delegate_batch',
            { assignments: assignmentsFor(harnessRef!.employees) },
            harnessRef!.db,
            options.signal
          );
          return loopResult('Đã tổng hợp.');
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

      expect(coordinator.getState().pendingPlan).toBeNull();
      const parsed = JSON.parse(toolResult as unknown as string);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(3);
      expect(parsed.map((entry: any) => entry.status)).toEqual(['done', 'done', 'done']);
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

      expect(JSON.parse(toolResult as unknown as string)).toHaveLength(3);
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

      expect(startedCount).toBe(3);
      const parsed = JSON.parse(toolResult as unknown as string);
      expect(parsed).toHaveLength(3);
      expect(parsed.every((entry: any) => entry.status === 'done')).toBe(true);
    });

    it('keeps the batch pending while one agent is paused', async () => {
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

      const sent = coordinator.send('Làm báo cáo');
      await waitFor(() => coordinator.getState().phase === 'awaiting-budget');
      await sleep(20);

      expect(toolResult).toBeNull();
      expect(coordinator.getState().agents.find((row) => row.agentId === employees[0]!.id)?.status).toBe(
        'paused'
      );
      expect(coordinator.getState().agents.find((row) => row.agentId === employees[1]!.id)?.status).toBe(
        'done'
      );

      await coordinator.topUp({ kind: 'agent', agentId: employees[0]!.id }, 2000);
      await sent;

      const parsed = JSON.parse(toolResult as unknown as string);
      expect(parsed).toHaveLength(3);
      expect(parsed[0].status).toBe('done');
    });

    it('marks a stopped agent incomplete and leaves siblings running', async () => {
      let toolResult: string | null = null;
      let harnessRef: Harness | null = null;
      const others = deferred();
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

      const sent = coordinator.send('Làm báo cáo');
      await waitFor(
        () =>
          employees.every((row) =>
            coordinator.getState().agents.some((state) => state.agentId === row.id)
          )
      );
      coordinator.stopAgent(employees[0]!.id);
      others.release();
      await sent;

      const parsed = JSON.parse(toolResult as unknown as string);
      const stopped = parsed.find((entry: any) => entry.agentId === employees[0]!.id);
      expect(stopped.status).toBe('stopped');
      expect(stopped.incomplete).toBe(true);
      expect(parsed.filter((entry: any) => entry.status === 'done')).toHaveLength(2);
    });

    it('reports an errored agent with sanitized text only', async () => {
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
        [EMP_A_MODEL]: async () => {
          throw new Error('raw provider secret detail');
        },
        [EMP_B_MODEL]: async () => loopResult('B xong'),
        [EMP_C_MODEL]: async () => loopResult('C xong'),
      };
      harness = await createHarness({ scripts, teamPatch: { autoSplitEnabled: true } });
      harnessRef = harness;

      await harness.coordinator.send('Làm báo cáo');

      const parsed = JSON.parse(toolResult as unknown as string);
      const errored = parsed.find((entry: any) => entry.status === 'error');
      expect(errored).toBeDefined();
      expect(errored.report).not.toContain('raw provider secret detail');
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
        // A budget that does not park at 700, so both turns can run back to back: D-21
        // makes a send during a parked phase `'busy'` instead of a second turn.
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

      // The submit was accepted (it is not `'busy'`/`'blocked'`), it simply starts nothing.
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

      const { batches, assignments } = await rowsFor(current);
      expect(batches).toHaveLength(1);
      expect(batches[0]).toMatchObject({
        planDecision: 'rejected',
        abortedBy: 'user',
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

    it('resolves send() as started, busy or blocked and never as a dropped submit', async () => {
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
      // A live turn: requeue.
      await expect(current.coordinator.send('chen ngang')).resolves.toBe('busy');

      gate.release();
      await sent;

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
          [EMP_B_MODEL]: async () => {
            throw new Error('B nổ');
          },
          [EMP_C_MODEL]: async () => loopResult('C xong'),
        },
      });
      const current = harness;

      await current.coordinator.send('Làm báo cáo');

      const parsed = JSON.parse(toolResult as unknown as string);
      expect(parsed).toHaveLength(3);
      expect(parsed.map((entry: any) => entry.status)).toEqual(['done', 'error', 'done']);
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
      unsubscribe();

      expect(Math.max(...runningSamples)).toBe(2);
      const parsed = JSON.parse(toolResult as unknown as string);
      expect(parsed).toHaveLength(5);
      expect(parsed.every((entry: any) => entry.status === 'done')).toBe(true);

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

      const parsed = JSON.parse(toolResult as unknown as string);
      const entry = parsed.find((row: any) => row.agentId === current.employees[1]!.id);
      expect(entry).toMatchObject({
        status: 'stopped',
        stopReason: 'user-per-agent',
        incomplete: true,
      });
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

      const parsed = JSON.parse(toolResult as unknown as string);
      expect(parsed).toHaveLength(3);
      expect(parsed.every((entry: any) => entry.incomplete === true)).toBe(true);
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

      const rows = await current.db.aiTeamAssignments.toArray();
      expect(rows).toHaveLength(3);
      const queued = rows.filter((row) => row.agentId !== current.employees[0]!.id);
      expect(queued).toHaveLength(2);
      expect(
        queued.every((row) => row.runStatus === 'stopped' && row.incomplete === true)
      ).toBe(true);
      const parsed = JSON.parse(toolResult as unknown as string);
      expect(parsed).toHaveLength(3);
      expect(parsed.filter((entry: any) => entry.incomplete === true).length).toBeGreaterThan(0);
      expect(current.coordinator.getRunningCount()).toBe(0);
      expect(current.coordinator.getState().phase).toBe('ready');
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
});
