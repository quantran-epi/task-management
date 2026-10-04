import { describe, it, expect, vi } from 'vitest';
import {
  executeAiTool,
  AI_DATABASE_TOOLS,
  isMutationTool,
  describeToolMutation,
  normalizeToolName,
} from '../../src/services/ai/aiTools';

describe('aiTools', () => {
  const mockTasks = [
    {
      id: 'task-1',
      name: 'Write unit tests',
      description: 'Core unit test coverage',
      status: 'In Progress',
      priority: 'High',
      progress: 50,
      estimateMinutes: 60,
      projectId: 'proj-1',
      milestoneId: 'ms-1',
      workType: 'code',
      deadline: '2026-10-01', // overdue relative to 2026-10-03
      checklist: [{ id: 'c1', text: 'Step 1', done: true }],
      notes: 'Some task notes',
      isRecurring: true,
      recurrenceFrequency: 'weekly',
      reminders: [{ id: 'r1', date: '2026-10-10', note: 'Check tests' }],
      createdAt: '2026-10-01T08:00:00.000Z',
      updatedAt: '2026-10-02T08:00:00.000Z',
    },
    {
      id: 'task-2',
      name: 'Deploy to production',
      description: 'Release v1.0',
      status: 'Open',
      priority: 'Urgent',
      progress: 0,
      estimateMinutes: 120,
      projectId: 'proj-1',
      milestoneId: 'ms-2',
      workType: 'configuration',
      deadline: '2026-10-05',
      notes: 'Deployment checklist',
      createdAt: '2026-10-03T09:00:00.000Z',
      updatedAt: '2026-10-03T09:00:00.000Z',
    },
    {
      id: 'task-3',
      name: 'Clean up backlog',
      status: 'Done',
      priority: 'Low',
      progress: 100,
      estimateMinutes: 30,
      projectId: 'proj-2',
      workType: 'document',
      createdAt: '2026-09-25T10:00:00.000Z',
      updatedAt: '2026-09-26T10:00:00.000Z',
    },
  ];

  const mockProjects = [
    {
      id: 'proj-1',
      name: 'Banking Platform',
      status: 'In Progress',
      deadline: '2026-12-31',
      description: 'Main banking core',
      notes: 'Banking notes',
      jiraEpicKey: 'BANK-EPIC-1',
      opsOwners: ['OpsTeam'],
      businessAnalysts: ['BA1'],
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-02T00:00:00.000Z',
    },
    {
      id: 'proj-2',
      name: 'Mobile App',
      status: 'Open',
      description: 'iOS and Android client',
      createdAt: '2026-09-10T00:00:00.000Z',
      updatedAt: '2026-09-10T00:00:00.000Z',
    },
  ];

  const mockMilestones = [
    {
      id: 'ms-1',
      projectId: 'proj-1',
      name: 'Backend API',
      status: 'In Progress',
      deadline: '2026-10-10',
      createdAt: '2026-09-05T00:00:00.000Z',
      updatedAt: '2026-09-05T00:00:00.000Z',
    },
    {
      id: 'ms-2',
      projectId: 'proj-1',
      name: 'Cloud Deploy',
      status: 'Open',
      createdAt: '2026-09-15T00:00:00.000Z',
      updatedAt: '2026-09-15T00:00:00.000Z',
    },
  ];

  const mockWorkSessions = [
    {
      id: 'ws-1',
      taskId: 'task-1',
      date: '2026-10-02',
      startTime: '09:00:00.000Z',
      endTime: '10:30:00.000Z',
      durationMinutes: 90,
      note: 'Wrote core test suites',
      createdAt: '2026-10-02T10:30:00.000Z',
    },
    {
      id: 'ws-2',
      taskId: 'task-1',
      date: '2026-10-03',
      startTime: '14:00:00.000Z',
      endTime: '14:45:00.000Z',
      durationMinutes: 45,
      note: 'Fixed edge case in test runner',
      createdAt: '2026-10-03T14:45:00.000Z',
    },
    {
      id: 'ws-3',
      taskId: 'task-3',
      date: '2026-10-01',
      durationMinutes: 30,
      createdAt: '2026-10-01T10:00:00.000Z',
    },
  ];

  const mockPlannedAllocations = [
    {
      id: 'pa-1',
      taskId: 'task-1',
      date: '2026-10-03',
      allocatedMinutes: 120,
    },
    {
      id: 'pa-2',
      taskId: 'task-2',
      date: '2026-10-04',
      allocatedMinutes: 180,
    },
  ];

  const mockCapacityRules = [
    { id: 'cr-1', dayOfWeek: 1, workMinutes: 480 },
    { id: 'cr-2', dayOfWeek: 2, workMinutes: 480 },
    { id: 'cr-3', dayOfWeek: 3, workMinutes: 480 },
    { id: 'cr-4', dayOfWeek: 4, workMinutes: 480 },
    { id: 'cr-5', dayOfWeek: 5, workMinutes: 480 },
    { id: 'cr-6', dayOfWeek: 6, workMinutes: 0 },
    { id: 'cr-0', dayOfWeek: 0, workMinutes: 0 },
  ];

  const mockCapacityOverrides = [
    { id: 'co-1', date: '2026-10-03', workMinutes: 240, note: 'Half day' },
  ];

  const mockActiveTimers = [
    {
      taskId: 'task-1',
      status: 'running',
      startedAt: Date.now() - 15 * 60 * 1000,
      accumulatedMs: 15 * 60 * 1000,
      sessionStartTime: '2026-10-03T15:00:00.000Z',
      segments: [
        {
          startTime: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        },
      ],
    },
  ];

  const mockNotes = [
    {
      id: 'n-1',
      title: 'API Spec Draft',
      body: 'Swagger endpoints for auth service',
      isPinned: true,
      entityType: 'task',
      entityId: 'task-1',
      createdAt: '2026-10-01T10:00:00.000Z',
    },
    {
      id: 'n-2',
      title: 'Scratchpad Idea',
      body: 'Consider implementing local vector embeddings',
      isPinned: false,
      entityType: undefined,
      entityId: undefined,
      createdAt: '2026-10-02T10:00:00.000Z',
    },
  ];

  const mockSettings = [
    { key: 'github_auto_sync_enabled', value: true },
    { key: 'last_synced_at', value: '2026-10-03T08:00:00.000Z' },
    { key: 'github_owner', value: 'user' },
    { key: 'github_repo', value: 'task-planner' },
    { key: 'jira_api_token', value: 'secret-token-must-not-leak' },
  ];

  const mockBackupMetadata = [
    {
      id: 'b-1',
      timestamp: '2026-10-02T18:00:00.000Z',
      appVersion: '1.2.0',
      recordCount: 154,
    },
  ];

  const mockDb: any = {
    tasks: {
      toArray: async () => mockTasks,
      get: async (id: string) => mockTasks.find((t) => t.id === id),
    },
    projects: {
      toArray: async () => mockProjects,
      get: async (id: string) => mockProjects.find((p) => p.id === id),
    },
    milestones: {
      toArray: async () => mockMilestones,
      get: async (id: string) => mockMilestones.find((m) => m.id === id),
    },
    workSessions: {
      toArray: async () => mockWorkSessions,
    },
    plannedAllocations: {
      toArray: async () => mockPlannedAllocations,
    },
    capacityRules: {
      toArray: async () => mockCapacityRules,
    },
    capacityOverrides: {
      toArray: async () => mockCapacityOverrides,
    },
    activeTimers: {
      toArray: async () => mockActiveTimers,
    },
    notes: {
      toArray: async () => mockNotes,
      where: (field: string) => ({
        equals: (val: string) => ({
          filter: (fn: (n: any) => boolean) => ({
            toArray: async () => mockNotes.filter((n: any) => n[field] === val && fn(n)),
          }),
        }),
      }),
    },
    settings: {
      toArray: async () => mockSettings,
      get: async (key: string) => mockSettings.find((s) => s.key === key)?.value,
    },
    backupMetadata: {
      toArray: async () => mockBackupMetadata,
    },
  };

  it('declares comprehensive query and mutation AI_DATABASE_TOOLS', () => {
    expect(AI_DATABASE_TOOLS.length).toBe(41);
    const names = AI_DATABASE_TOOLS.map((t) => t.function.name);
    // Includes standard read tools
    expect(names).toContain('read_file');
    expect(names).toContain('query_tasks');
    expect(names).toContain('query_projects');
    expect(names).toContain('query_milestones');
    expect(names).toContain('get_item_details');
    expect(names).toContain('query_worklogs');
    expect(names).toContain('get_active_timer');
    expect(names).toContain('get_daily_schedule');
    expect(names).toContain('check_capacity_feasibility');
    expect(names).toContain('get_day_insight');
    expect(names).toContain('get_analytics_summary');
    expect(names).toContain('query_notes');
    expect(names).toContain('query_attention_items');
    expect(names).toContain('query_recurring_tasks');
    expect(names).toContain('get_system_status');

    // Includes full mutation action tools
    expect(names).toContain('create_task');
    expect(names).toContain('update_task');
    expect(names).toContain('update_task_checklist');
    expect(names).toContain('reparent_task');
    expect(names).toContain('delete_task');
    expect(names).toContain('create_project');
    expect(names).toContain('update_project');
    expect(names).toContain('delete_project');
    expect(names).toContain('create_milestone');
    expect(names).toContain('update_milestone');
    expect(names).toContain('delete_milestone');
    expect(names).toContain('plan_allocation');
    expect(names).toContain('delete_allocation');
    expect(names).toContain('log_work_session');
    expect(names).toContain('update_work_session');
    expect(names).toContain('delete_work_session');
    expect(names).toContain('start_timer');
    expect(names).toContain('pause_timer');
    expect(names).toContain('stop_and_log_timer');
    expect(names).toContain('discard_timer');
    expect(names).toContain('update_capacity_rule');
    expect(names).toContain('set_capacity_override');
    expect(names).toContain('remove_capacity_override');
    expect(names).toContain('create_note');
    expect(names).toContain('update_note');
    expect(names).toContain('delete_note');
  });

  describe('isMutationTool, normalizeToolName, and describeToolMutation', () => {
    it('normalizes tool names with proxy / cloaking suffixes and prefixes', () => {
      expect(normalizeToolName('create_task_ide')).toBe('create_task');
      expect(normalizeToolName('query_tasks_ide')).toBe('query_tasks');
      expect(normalizeToolName('proxy_delete_project')).toBe('delete_project');
      expect(normalizeToolName('create_task_cc')).toBe('create_task');
    });

    it('correctly identifies mutation tools versus read-only query tools even when cloaked', () => {
      expect(isMutationTool('create_task')).toBe(true);
      expect(isMutationTool('create_task_ide')).toBe(true);
      expect(isMutationTool('delete_project_ide')).toBe(true);
      expect(isMutationTool('start_timer_ide')).toBe(true);
      expect(isMutationTool('plan_allocation')).toBe(true);
      expect(isMutationTool('query_tasks')).toBe(false);
      expect(isMutationTool('query_tasks_ide')).toBe(false);
      expect(isMutationTool('get_daily_schedule')).toBe(false);
      expect(isMutationTool('get_system_status')).toBe(false);
    });

    it('generates readable Vietnamese description of mutations with cloaked names', () => {
      const taskDesc = describeToolMutation('create_task_ide', {
        name: 'Fix Auth bug',
        priority: 'High',
        estimateMinutes: 60,
      });
      expect(taskDesc).toContain('Fix Auth bug');
      expect(taskDesc).toContain('High');
      expect(taskDesc).toContain('60p');

      const allocDesc = describeToolMutation('plan_allocation', {
        taskId: 't-1',
        date: '2026-10-04',
        allocatedMinutes: 90,
      });
      expect(allocDesc).toContain('90 phút');
      expect(allocDesc).toContain('2026-10-04');
    });
  });

  describe('query_tasks (enriched)', () => {
    it('returns enriched tasks with resolved names, logged minutes, and recurring status', async () => {
      const resJson = await executeAiTool('query_tasks', { projectId: 'proj-1' }, mockDb);
      const res = JSON.parse(resJson);
      expect(res.totalCount).toBe(2);
      const t1 = res.tasks.find((t: any) => t.id === 'task-1');
      expect(t1.projectName).toBe('Banking Platform');
      expect(t1.milestoneName).toBe('Backend API');
      expect(t1.totalLoggedMinutes).toBe(135); // 90 + 45
      expect(t1.isRecurring).toBe(true);
      expect(t1.recurrenceFrequency).toBe('weekly');
      expect(t1.remindersCount).toBe(1);
    });
  });

  describe('query_projects (enriched)', () => {
    it('returns project with aggregated task counts, estimate minutes, and logged minutes', async () => {
      const resJson = await executeAiTool('query_projects', {}, mockDb);
      const res = JSON.parse(resJson);
      const p1 = res.projects.find((p: any) => p.id === 'proj-1');
      expect(p1.taskCount).toBe(2);
      expect(p1.totalEstimateMinutes).toBe(180); // 60 + 120
      expect(p1.totalLoggedMinutes).toBe(135); // 135 on task-1
    });
  });

  describe('query_milestones (enriched)', () => {
    it('returns milestone with resolved project name and logged minutes', async () => {
      const resJson = await executeAiTool('query_milestones', { projectId: 'proj-1' }, mockDb);
      const res = JSON.parse(resJson);
      const m1 = res.milestones.find((m: any) => m.id === 'ms-1');
      expect(m1.projectName).toBe('Banking Platform');
      expect(m1.totalLoggedMinutes).toBe(135);
    });
  });

  describe('get_item_details (enriched)', () => {
    it('returns task with workSessionsSummary and plannedAllocations', async () => {
      const resJson = await executeAiTool('get_item_details', { type: 'task', id: 'task-1' }, mockDb);
      const res = JSON.parse(resJson);
      expect(res.projectName).toBe('Banking Platform');
      expect(res.milestoneName).toBe('Backend API');
      expect(res.workSessionsSummary.totalLoggedMinutes).toBe(135);
      expect(res.workSessionsSummary.sessionCount).toBe(2);
      expect(res.plannedAllocations.length).toBe(1);
      expect(res.plannedAllocations[0].allocatedMinutes).toBe(120);
      expect(res.stickyNotes.length).toBe(1);
    });
  });

  describe('query_worklogs', () => {
    it('queries worklogs by taskId and aggregates total logged minutes', async () => {
      const resJson = await executeAiTool('query_worklogs', { taskId: 'task-1' }, mockDb);
      const res = JSON.parse(resJson);
      expect(res.totalCount).toBe(2);
      expect(res.totalLoggedMinutes).toBe(135);
      expect(res.sessions[0].taskName).toBe('Write unit tests');
    });

    it('filters worklogs by date range', async () => {
      const resJson = await executeAiTool(
        'query_worklogs',
        { startDate: '2026-10-03', endDate: '2026-10-03' },
        mockDb
      );
      const res = JSON.parse(resJson);
      expect(res.totalCount).toBe(1);
      expect(res.sessions[0].id).toBe('ws-2');
      expect(res.sessions[0].durationMinutes).toBe(45);
    });
  });

  describe('get_active_timer', () => {
    it('returns active running timer details', async () => {
      const resJson = await executeAiTool('get_active_timer', {}, mockDb);
      const res = JSON.parse(resJson);
      expect(res.hasActiveTimer).toBe(true);
      expect(res.taskId).toBe('task-1');
      expect(res.taskName).toBe('Write unit tests');
      expect(res.status).toBe('running');
      expect(res.isCurrentlyRunning).toBe(true);
      expect(res.accumulatedMinutes).toBeGreaterThanOrEqual(14);
    });

    it('handles no active timer gracefully', async () => {
      const emptyDb = { ...mockDb, activeTimers: { toArray: async () => [] } };
      const resJson = await executeAiTool('get_active_timer', {}, emptyDb);
      const res = JSON.parse(resJson);
      expect(res.hasActiveTimer).toBe(false);
    });
  });

  describe('get_daily_schedule', () => {
    it('returns schedule for date with capacity and planned tasks', async () => {
      const resJson = await executeAiTool('get_daily_schedule', { date: '2026-10-03' }, mockDb);
      const res = JSON.parse(resJson);
      expect(res.daysCount).toBe(1);
      const day = res.schedule[0];
      expect(day.date).toBe('2026-10-03');
      expect(day.capacityMinutes).toBe(240); // from override co-1
      expect(day.totalPlannedMinutes).toBe(120);
      expect(day.netRemainingMinutes).toBe(120);
      expect(day.status).toBe('available');
      expect(day.tasks.length).toBe(1);
      expect(day.tasks[0].taskName).toBe('Write unit tests');
    });
  });

  describe('check_capacity_feasibility', () => {
    it('evaluates feasibility when request fits within remaining capacity', async () => {
      const resJson = await executeAiTool(
        'check_capacity_feasibility',
        { date: '2026-10-03', requiredMinutes: 60 },
        mockDb
      );
      const res = JSON.parse(resJson);
      expect(res.dailyCapacityMinutes).toBe(240);
      expect(res.existingPlannedMinutes).toBe(120);
      expect(res.remainingCapacityAfterRequest).toBe(60);
      expect(res.isFeasible).toBe(true);
    });

    it('flags unfeasible when request causes overload', async () => {
      const resJson = await executeAiTool(
        'check_capacity_feasibility',
        { date: '2026-10-03', requiredMinutes: 200 },
        mockDb
      );
      const res = JSON.parse(resJson);
      expect(res.remainingCapacityAfterRequest).toBe(-80);
      expect(res.isFeasible).toBe(false);
    });
  });

  describe('get_day_insight', () => {
    it('compares planned vs actual minutes per task for date', async () => {
      const resJson = await executeAiTool('get_day_insight', { date: '2026-10-03' }, mockDb);
      const res = JSON.parse(resJson);
      expect(res.date).toBe('2026-10-03');
      expect(res.totalPlannedMinutes).toBe(120);
      expect(res.rows.length).toBe(1);
      expect(res.rows[0].taskName).toBe('Write unit tests');
      expect(res.rows[0].plannedMinutes).toBe(120);
      expect(res.rows[0].actualMinutes).toBeGreaterThanOrEqual(45);
    });
  });

  describe('get_analytics_summary', () => {
    it('aggregates worklog statistics and estimation bias', async () => {
      const resJson = await executeAiTool('get_analytics_summary', { period: 'all' }, mockDb);
      const res = JSON.parse(resJson);
      expect(res.totalLoggedMinutes).toBe(165); // 90 + 45 + 30
      expect(res.workTypeBreakdown.length).toBeGreaterThan(0);
      expect(res.estimationBias).toBeDefined();
    });
  });

  describe('query_notes', () => {
    it('searches notes by keyword in title or body', async () => {
      const resJson = await executeAiTool('query_notes', { search: 'Swagger' }, mockDb);
      const res = JSON.parse(resJson);
      expect(res.totalCount).toBe(1);
      expect(res.notes[0].title).toBe('API Spec Draft');
      expect(res.notes[0].entityName).toBe('Write unit tests');
    });

    it('filters standalone notes', async () => {
      const resJson = await executeAiTool('query_notes', { entityType: 'standalone' }, mockDb);
      const res = JSON.parse(resJson);
      expect(res.totalCount).toBe(1);
      expect(res.notes[0].title).toBe('Scratchpad Idea');
    });
  });

  describe('query_attention_items', () => {
    it('returns overdue tasks and active reminders', async () => {
      const resJson = await executeAiTool('query_attention_items', { horizonDays: 7 }, mockDb);
      const res = JSON.parse(resJson);
      expect(res.overdueTasksCount).toBeGreaterThanOrEqual(1);
      expect(res.overdueTasks.some((t: any) => t.id === 'task-1')).toBe(true);
      expect(res.activeReminders.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('query_recurring_tasks', () => {
    it('lists recurring task configurations', async () => {
      const resJson = await executeAiTool('query_recurring_tasks', {}, mockDb);
      const res = JSON.parse(resJson);
      expect(res.totalCount).toBe(1);
      expect(res.recurringTasks[0].id).toBe('task-1');
      expect(res.recurringTasks[0].recurrenceFrequency).toBe('weekly');
    });
  });

  describe('get_system_status', () => {
    it('returns backup and sync status while redacting secrets', async () => {
      const resJson = await executeAiTool('get_system_status', {}, mockDb);
      const res = JSON.parse(resJson);
      expect(res.backup.hasBackup).toBe(true);
      expect(res.backup.recordCount).toBe(154);
      expect(res.githubSync.enabled).toBe(true);
      expect(res.githubSync.targetRepo).toBe('user/task-planner');
      // Redaction verification: tokens must never be present
      expect(resJson).not.toContain('secret-token-must-not-leak');
    });
  });

  describe('update_task_checklist tool definition and execution', () => {
    it('defines checklistItems rather than reserved items property to prevent Google/Gemini schema collision', () => {
      const tool = AI_DATABASE_TOOLS.find((t) => t.function.name === 'update_task_checklist');
      expect(tool).toBeDefined();
      const props = tool!.function.parameters.properties;
      expect(props.checklistItems).toBeDefined();
      expect(props.items).toBeUndefined(); // Must NOT define "items" directly on object schema
    });

    it('handles adding checklist items via checklistItems or items', async () => {
      const mockTask = {
        id: 't-chk',
        name: 'Task with checklist',
        status: 'Open',
        priority: 'Medium',
        progress: 0,
        workType: 'code',
        checklist: [],
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      };
      const testDb: any = {
        tasks: {
          get: vi.fn().mockResolvedValue(mockTask),
          put: vi.fn().mockResolvedValue('t-chk'),
        },
      };

      const res = await executeAiTool(
        'update_task_checklist',
        { taskId: 't-chk', action: 'add', checklistItems: ['Item 1', 'Item 2'] },
        testDb
      );
      const parsed = JSON.parse(res);
      expect(parsed.success).toBe(true);
      expect(parsed.totalChecklistItems).toBe(2);
    });
  });

  describe('comprehensive full-field query and sorting support', () => {
    it('supports query_tasks filtering by exact createdAt, createdAfter, and createdBefore', async () => {
      // Exact date YYYY-MM-DD
      const exactRes = JSON.parse(
        await executeAiTool('query_tasks', { createdAt: '2026-10-01' }, mockDb)
      );
      expect(exactRes.totalCount).toBe(1);
      expect(exactRes.tasks[0].id).toBe('task-1');
      expect(exactRes.tasks[0].createdAt).toBe('2026-10-01T08:00:00.000Z');
      expect(exactRes.tasks[0].updatedAt).toBe('2026-10-02T08:00:00.000Z');
      expect(exactRes.tasks[0].notes).toBe('Some task notes');
      expect(exactRes.tasks[0].description).toBe('Core unit test coverage');

      // createdAfter
      const afterRes = JSON.parse(
        await executeAiTool('query_tasks', { createdAfter: '2026-10-02' }, mockDb)
      );
      expect(afterRes.totalCount).toBe(1);
      expect(afterRes.tasks[0].id).toBe('task-2');

      // createdBefore
      const beforeRes = JSON.parse(
        await executeAiTool('query_tasks', { createdBefore: '2026-09-30' }, mockDb)
      );
      expect(beforeRes.totalCount).toBe(1);
      expect(beforeRes.tasks[0].id).toBe('task-3');
    });

    it('supports query_tasks filtering by deadline, workType, isRecurring, and hasDeadline', async () => {
      // deadlineBefore
      const dlRes = JSON.parse(
        await executeAiTool('query_tasks', { deadlineBefore: '2026-10-02' }, mockDb)
      );
      expect(dlRes.totalCount).toBe(1);
      expect(dlRes.tasks[0].id).toBe('task-1');

      // hasDeadline: false
      const noDlRes = JSON.parse(
        await executeAiTool('query_tasks', { hasDeadline: false }, mockDb)
      );
      expect(noDlRes.totalCount).toBe(1);
      expect(noDlRes.tasks[0].id).toBe('task-3');

      // workType
      const wtRes = JSON.parse(
        await executeAiTool('query_tasks', { workType: 'configuration' }, mockDb)
      );
      expect(wtRes.totalCount).toBe(1);
      expect(wtRes.tasks[0].id).toBe('task-2');

      // isRecurring
      const recRes = JSON.parse(
        await executeAiTool('query_tasks', { isRecurring: true }, mockDb)
      );
      expect(recRes.totalCount).toBe(1);
      expect(recRes.tasks[0].id).toBe('task-1');
    });

    it('supports query_tasks sorting by createdAt and priority', async () => {
      // Sort createdAt asc -> task-3 (Sept 25) first
      const ascRes = JSON.parse(
        await executeAiTool('query_tasks', { sortBy: 'createdAt', sortOrder: 'asc' }, mockDb)
      );
      expect(ascRes.tasks[0].id).toBe('task-3');
      expect(ascRes.tasks[2].id).toBe('task-2');

      // Sort priority desc -> task-2 (Urgent) first, then task-1 (High), then task-3 (Low)
      const prioRes = JSON.parse(
        await executeAiTool('query_tasks', { sortBy: 'priority', sortOrder: 'desc' }, mockDb)
      );
      expect(prioRes.tasks[0].id).toBe('task-2');
      expect(prioRes.tasks[1].id).toBe('task-1');
      expect(prioRes.tasks[2].id).toBe('task-3');
    });

    it('supports query_projects filtering and returning all metadata fields', async () => {
      const res = JSON.parse(
        await executeAiTool('query_projects', { createdAfter: '2026-09-05' }, mockDb)
      );
      expect(res.totalCount).toBe(1);
      expect(res.projects[0].id).toBe('proj-2');

      const allRes = JSON.parse(
        await executeAiTool('query_projects', { jiraEpicKey: 'BANK' }, mockDb)
      );
      expect(allRes.totalCount).toBe(1);
      const p1 = allRes.projects[0];
      expect(p1.id).toBe('proj-1');
      expect(p1.createdAt).toBe('2026-09-01T00:00:00.000Z');
      expect(p1.updatedAt).toBe('2026-09-02T00:00:00.000Z');
      expect(p1.notes).toBe('Banking notes');
      expect(p1.opsOwners).toContain('OpsTeam');
      expect(p1.businessAnalysts).toContain('BA1');
    });

    it('supports query_milestones filtering by deadline and returning dates & notes', async () => {
      const res = JSON.parse(
        await executeAiTool('query_milestones', { deadlineBefore: '2026-10-12' }, mockDb)
      );
      expect(res.totalCount).toBe(1);
      const m1 = res.milestones[0];
      expect(m1.id).toBe('ms-1');
      expect(m1.createdAt).toBe('2026-09-05T00:00:00.000Z');
    });

    it('supports query_worklogs search and minDuration with createdAt in output', async () => {
      const res = JSON.parse(
        await executeAiTool('query_worklogs', { search: 'test runner' }, mockDb)
      );
      expect(res.totalCount).toBe(1);
      expect(res.sessions[0].id).toBe('ws-2');
      expect(res.sessions[0].createdAt).toBe('2026-10-03T14:45:00.000Z');

      const durRes = JSON.parse(
        await executeAiTool('query_worklogs', { minDuration: 50 }, mockDb)
      );
      expect(durRes.totalCount).toBe(1);
      expect(durRes.sessions[0].id).toBe('ws-1');
    });

    it('supports query_notes date filtering and custom sorting', async () => {
      const res = JSON.parse(
        await executeAiTool('query_notes', { createdAfter: '2026-10-02' }, mockDb)
      );
      expect(res.totalCount).toBe(1);
      expect(res.notes[0].id).toBe('n-2');

      const sortRes = JSON.parse(
        await executeAiTool('query_notes', { sortBy: 'title', sortOrder: 'asc' }, mockDb)
      );
      // Pinned note still prioritized, but check title sort
      expect(sortRes.notes[0].title).toBe('API Spec Draft');
    });

    it('supports query_recurring_tasks filtering by status/frequency and returning all fields', async () => {
      const res = JSON.parse(
        await executeAiTool('query_recurring_tasks', { recurrenceFrequency: 'weekly' }, mockDb)
      );
      expect(res.totalCount).toBe(1);
      const r1 = res.recurringTasks[0];
      expect(r1.id).toBe('task-1');
      expect(r1.workType).toBe('code');
      expect(r1.estimateMinutes).toBe(60);
      expect(r1.createdAt).toBe('2026-10-01T08:00:00.000Z');
    });

    it('passes new parameters to mutation tools', async () => {
      const mockTaskDb: any = {
        tasks: {
          add: vi.fn().mockResolvedValue('new-t-id'),
          get: vi.fn().mockResolvedValue({ id: 'existing-t', name: 'Task', status: 'Open', priority: 'Medium', progress: 0, estimateMinutes: 0 }),
          put: vi.fn().mockResolvedValue('existing-t'),
        },
      };

      // create_task with full fields
      const createRes = JSON.parse(
        await executeAiTool(
          'create_task',
          {
            name: 'New Feature',
            notes: 'Implementation notes',
            actualStartDate: '2026-10-04',
            actualEndDate: '2026-10-05',
            opsOwners: ['Ops1'],
            businessAnalysts: ['BA1'],
          },
          mockTaskDb
        )
      );
      expect(createRes.success).toBe(true);

      // update_task with full fields
      const updateRes = JSON.parse(
        await executeAiTool(
          'update_task',
          {
            id: 'existing-t',
            notes: 'Updated notes',
            actualStartDate: '2026-10-04',
            actualEndDate: '2026-10-05',
            opsOwners: ['Ops2'],
            businessAnalysts: ['BA2'],
          },
          mockTaskDb
        )
      );
      expect(updateRes.success).toBe(true);
      expect(updateRes.updatedFields).toContain('notes');
      expect(updateRes.updatedFields).toContain('actualStartDate');
      expect(updateRes.updatedFields).toContain('opsOwners');
      expect(updateRes.updatedFields).toContain('businessAnalysts');
    });
  });

  describe('search_knowledge_base and get_document_details', () => {
    const mockKnowledgeNotes = [
      {
        id: 'doc-1',
        type: 'document',
        title: 'Core Banking Architecture & Ledger',
        tags: ['architecture', 'banking'],
        body: '# Core Banking\nThis document describes the double-entry accounting ledger system.\n## Transaction Processing\nAll transactions require balanced credits and debits.',
        isPinned: false,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      },
      {
        id: 'doc-2',
        type: 'document',
        title: 'Deployment & CI/CD Runbook',
        tags: ['devops', 'deployment'],
        body: '# Deployment Runbook\nSteps to deploy release artifacts to production Kubernetes cluster.\nRun `kubectl apply -f release.yaml`.',
        isPinned: false,
        createdAt: '2026-10-02T00:00:00Z',
        updatedAt: '2026-10-02T00:00:00Z',
      },
      {
        id: 'doc-deleted',
        type: 'document',
        title: 'Old Banking Notes (Deleted)',
        tags: ['banking'],
        body: 'Deleted secret ledger notes',
        deletedAt: '2026-10-03T00:00:00Z',
        isPinned: false,
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-10-03T00:00:00Z',
      },
    ];

    const mockKnowledgeAttachments = [
      {
        id: 'att-1',
        noteId: 'doc-1',
        fileName: 'architecture-diagram.png',
        mimeType: 'image/png',
        sizeBytes: 10240,
        createdAt: '2026-10-01T00:00:00Z',
        data: new Blob(['test'], { type: 'image/png' }),
      },
    ];

    const mockKnowledgeDb: any = {
      notes: {
        filter: (fn: any) => ({
          toArray: async () => mockKnowledgeNotes.filter(fn),
        }),
        get: async (id: string) => mockKnowledgeNotes.find((n) => n.id === id) || null,
      },
      noteAttachments: {
        where: (field: string) => ({
          equals: (val: any) => ({
            toArray: async () => mockKnowledgeAttachments.filter((a: any) => a[field] === val),
          }),
        }),
      },
    };

    it('registers search_knowledge_base and get_document_details in AI_DATABASE_TOOLS', () => {
      const searchTool = AI_DATABASE_TOOLS.find((t) => t.function.name === 'search_knowledge_base');
      expect(searchTool).toBeDefined();
      expect(searchTool?.function.parameters.properties.query).toBeDefined();
      expect(searchTool?.function.parameters.properties.tags).toBeDefined();
      expect(searchTool?.function.parameters.properties.limit).toBeDefined();

      const detailsTool = AI_DATABASE_TOOLS.find((t) => t.function.name === 'get_document_details');
      expect(detailsTool).toBeDefined();
      expect(detailsTool?.function.parameters.properties.documentId).toBeDefined();
    });

    it('searches knowledge base with BM25, filters soft-deleted docs, and supports tag filtering', async () => {
      // Search query matching doc-1
      const resJson = await executeAiTool(
        'search_knowledge_base',
        { query: 'double-entry ledger', limit: 5 },
        mockKnowledgeDb
      );
      const res = JSON.parse(resJson);
      expect(res.totalHits).toBeGreaterThanOrEqual(1);
      expect(res.results[0].id).toBe('doc-1');
      expect(res.results[0].title).toBe('Core Banking Architecture & Ledger');
      expect(res.results[0].snippet).toBeDefined();
      expect(res.results[0].snippet.length).toBeLessThanOrEqual(1500);

      // Verify soft-deleted doc is never returned
      const deletedCheckJson = await executeAiTool(
        'search_knowledge_base',
        { query: 'Deleted secret ledger' },
        mockKnowledgeDb
      );
      const deletedCheck = JSON.parse(deletedCheckJson);
      const hasDeleted = deletedCheck.results.some((r: any) => r.id === 'doc-deleted');
      expect(hasDeleted).toBe(false);

      // Tag filter
      const tagFilteredJson = await executeAiTool(
        'search_knowledge_base',
        { query: 'Runbook', tags: ['architecture'] },
        mockKnowledgeDb
      );
      const tagFiltered = JSON.parse(tagFilteredJson);
      // Runbook has devops tag, not architecture
      expect(tagFiltered.results.length).toBe(0);
    });

    it('gets document details including attachment IDs and body', async () => {
      const resJson = await executeAiTool(
        'get_document_details',
        { documentId: 'doc-1' },
        mockKnowledgeDb
      );
      const res = JSON.parse(resJson);
      expect(res.id).toBe('doc-1');
      expect(res.title).toBe('Core Banking Architecture & Ledger');
      expect(res.body).toContain('double-entry accounting');
      expect(res.attachments).toEqual([
        {
          id: 'att-1',
          fileName: 'architecture-diagram.png',
          mimeType: 'image/png',
          sizeBytes: 10240,
        },
      ]);
    });

    it('returns error for soft-deleted or non-existent document in get_document_details', async () => {
      const deletedRes = JSON.parse(
        await executeAiTool('get_document_details', { documentId: 'doc-deleted' }, mockKnowledgeDb)
      );
      expect(deletedRes.error).toBeDefined();

      const notFoundRes = JSON.parse(
        await executeAiTool('get_document_details', { documentId: 'doc-nonexistent' }, mockKnowledgeDb)
      );
      expect(notFoundRes.error).toBeDefined();
    });
  });
});
