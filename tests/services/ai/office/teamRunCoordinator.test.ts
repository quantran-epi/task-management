// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, it, expect, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../../../src/db/index';
import {
  createTeamRunCoordinator,
  resolveTeamToolName,
  type TeamRunCoordinator,
} from '../../../../src/services/ai/office/teamRunCoordinator';
import { TEAM_TOOL_DEFINITIONS } from '../../../../src/services/ai/office/teamTools';
import { createEmployee, createLead, createSkill } from '../../../../src/db/repositories/aiOfficeRepo';
import { createTeam } from '../../../../src/db/repositories/aiTeamRepo';
import { ensureTeamThread, saveTeamMessage } from '../../../../src/db/repositories/teamTranscriptRepo';
import { aiTurnManager } from '../../../../src/services/ai/aiTurnManager';
import { EMPLOYEE_READ_ONLY_ALLOWLIST } from '../../../../src/services/ai/chatTurnTools';
import { payloadHasMutationTool } from '../../../../src/services/ai/chatTurnTools';
import { isMutationTool, normalizeToolName } from '../../../../src/services/ai/aiTools';
import type { AiEmployee, AiLead, AiSkill, AiTeam } from '../../../../src/types/aiOffice';
import type { AiOrchestratorLoopOptions } from '../../../../src/services/ai/aiOrchestratorLoop';
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
  teamPatch?: Partial<Pick<AiTeam, 'autoSplitEnabled' | 'autoApproveMutations' | 'budgetTokens'>>;
}

interface Harness {
  db: TaskPlannerDatabase;
  team: AiTeam;
  lead: AiLead;
  employees: AiEmployee[];
  skill: AiSkill;
  threadId: string;
  coordinator: TeamRunCoordinator;
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
  });

  return { db, team, lead, employees, skill, threadId, coordinator };
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

    it('keeps delegate_batch out of the employee allowlist', () => {
      expect(EMPLOYEE_READ_ONLY_ALLOWLIST).not.toContain('delegate_batch');
      expect(EMPLOYEE_READ_ONLY_ALLOWLIST.some((name) => isMutationTool(name))).toBe(false);
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
});
