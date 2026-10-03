import { describe, it, expect } from 'vitest';
import { executeAiTool, AI_DATABASE_TOOLS } from '../../src/services/ai/aiTools';

describe('aiTools', () => {
  const mockTasks = [
    {
      id: 'task-1',
      name: 'Write unit tests',
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
      reminders: [{ id: 'r1', date: '2026-10-03', note: 'Check tests' }],
    },
    {
      id: 'task-2',
      name: 'Deploy to production',
      status: 'Open',
      priority: 'Urgent',
      progress: 0,
      estimateMinutes: 120,
      projectId: 'proj-1',
      milestoneId: 'ms-2',
      workType: 'configuration',
      deadline: '2026-10-05',
      notes: 'Deployment checklist',
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
    },
  ];

  const mockProjects = [
    {
      id: 'proj-1',
      name: 'Banking Platform',
      status: 'In Progress',
      deadline: '2026-12-31',
      description: 'Main banking core',
    },
    {
      id: 'proj-2',
      name: 'Mobile App',
      status: 'Open',
      description: 'iOS and Android client',
    },
  ];

  const mockMilestones = [
    {
      id: 'ms-1',
      projectId: 'proj-1',
      name: 'Backend API',
      status: 'In Progress',
      deadline: '2026-10-10',
    },
    {
      id: 'ms-2',
      projectId: 'proj-1',
      name: 'Cloud Deploy',
      status: 'Open',
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
    },
    {
      id: 'ws-2',
      taskId: 'task-1',
      date: '2026-10-03',
      startTime: '14:00:00.000Z',
      endTime: '14:45:00.000Z',
      durationMinutes: 45,
      note: 'Fixed edge case in test runner',
    },
    {
      id: 'ws-3',
      taskId: 'task-3',
      date: '2026-10-01',
      durationMinutes: 30,
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

  it('declares all 14 comprehensive AI_DATABASE_TOOLS', () => {
    expect(AI_DATABASE_TOOLS.length).toBe(14);
    const names = AI_DATABASE_TOOLS.map((t) => t.function.name);
    expect(names).toEqual([
      'query_tasks',
      'query_projects',
      'query_milestones',
      'get_item_details',
      'query_worklogs',
      'get_active_timer',
      'get_daily_schedule',
      'check_capacity_feasibility',
      'get_day_insight',
      'get_analytics_summary',
      'query_notes',
      'query_attention_items',
      'query_recurring_tasks',
      'get_system_status',
    ]);
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
});
