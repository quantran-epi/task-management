import { describe, it, expect } from 'vitest';
import type { Task, Project, Milestone } from '../../src/types/models';
import {
  filterTasks,
  sortTasks,
  matchesHorizon,
  DEFAULT_TASK_FILTER_STATE,
  countActiveAdvancedFilters,
  type FilterContext,
} from '../../src/utils/filter';

const sampleTasks: Task[] = [
  {
    id: 't1',
    name: 'Prepare quarterly review',
    description: 'Compile department metrics and slides',
    notes: 'Need data from finance by Friday',
    status: 'Open',
    progress: 0,
    priority: 'High',
    estimateMinutes: 120,
    deadline: '2026-09-26', // Today
    createdAt: '2026-09-20T10:00:00Z',
    updatedAt: '2026-09-20T10:00:00Z',
  },
  {
    id: 't-pending',
    name: 'Await business input',
    status: 'Pending',
    progress: 0,
    priority: 'Medium',
    estimateMinutes: 45,
    createdAt: '2026-09-20T12:00:00Z',
    updatedAt: '2026-09-20T12:00:00Z',
  },
  {
    id: 't2',
    projectId: 'p1',
    milestoneId: 'm1',
    name: 'Fix critical auth vulnerability',
    description: 'Patch token verification leak',
    notes: 'Check refresh tokens too',
    status: 'In Progress',
    progress: 50,
    priority: 'Urgent',
    estimateMinutes: 240,
    deadline: '2026-09-24', // Overdue relative to 2026-09-26
    createdAt: '2026-09-21T10:00:00Z',
    updatedAt: '2026-09-21T10:00:00Z',
  },
  {
    id: 't3',
    projectId: 'p1',
    name: 'Update documentation website',
    description: 'Add API reference pages',
    notes: 'Markdown tables look broken',
    status: 'Resolved',
    progress: 90,
    priority: 'Medium',
    estimateMinutes: 60,
    deadline: '2026-09-27', // This week (Sunday)
    createdAt: '2026-09-22T10:00:00Z',
    updatedAt: '2026-09-22T10:00:00Z',
  },
  {
    id: 't4',
    projectId: 'p2',
    name: 'Database index optimization',
    description: 'Compound index on allocations',
    status: 'In Review',
    progress: 80,
    priority: 'Low',
    estimateMinutes: 90,
    deadline: '2026-10-15', // Next month
    createdAt: '2026-09-23T10:00:00Z',
    updatedAt: '2026-09-23T10:00:00Z',
  },
  {
    id: 't5',
    name: 'Old archived task',
    status: 'Done',
    progress: 100,
    priority: 'Low',
    estimateMinutes: 30,
    deadline: '2026-09-10',
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-10T10:00:00Z',
  },
  {
    id: 't6',
    name: 'Abandoned task',
    status: 'Cancelled',
    progress: 10,
    priority: 'Low',
    estimateMinutes: 15,
    createdAt: '2026-09-02T10:00:00Z',
    updatedAt: '2026-09-03T10:00:00Z',
  },
  {
    id: 't7',
    name: 'No deadline task',
    status: 'Open',
    progress: 0,
    priority: 'Urgent',
    estimateMinutes: 45,
    createdAt: '2026-09-24T10:00:00Z',
    updatedAt: '2026-09-24T10:00:00Z',
  },
];

const today = '2026-09-26'; // Saturday

describe('filterTasks', () => {
  it('filters case-insensitively across name, description, notes, and jiraKey per D-18, JIRA-04', () => {
    // Matches in name
    const matchName = filterTasks(sampleTasks, { ...DEFAULT_TASK_FILTER_STATE, search: 'Quarterly' }, today);
    expect(matchName.map((t) => t.id)).toEqual(['t1']);

    // Matches in description
    const matchDesc = filterTasks(sampleTasks, { ...DEFAULT_TASK_FILTER_STATE, search: 'PATCH TOKEN' }, today);
    expect(matchDesc.map((t) => t.id)).toEqual(['t2']);

    // Matches in notes
    const matchNotes = filterTasks(sampleTasks, { ...DEFAULT_TASK_FILTER_STATE, search: 'markdown tables' }, today);
    expect(matchNotes.map((t) => t.id)).toEqual(['t3']);

    // Matches in jiraKey (case-insensitive)
    const taskWithJira: Task = {
      ...sampleTasks[0]!,
      id: 't-jira',
      jiraKey: 'SHB-1234',
    };
    const matchJira = filterTasks(
      [...sampleTasks, taskWithJira],
      { ...DEFAULT_TASK_FILTER_STATE, search: 'shb-1234' },
      today
    );
    expect(matchJira.map((t) => t.id)).toEqual(['t-jira']);
  });

  it('filters by hierarchy scope (All, Projects, Standalone) and selected projectId per D-04', () => {
    // Standalone only
    const standalone = filterTasks(
      sampleTasks,
      { ...DEFAULT_TASK_FILTER_STATE, hierarchyScope: 'standalone' },
      today
    );
    expect(standalone.every((t) => t.projectId === undefined)).toBe(true);
    expect(standalone.map((t) => t.id)).toContain('t1');
    expect(standalone.map((t) => t.id)).toContain('t7');
    expect(standalone.map((t) => t.id)).not.toContain('t2');

    // Projects only
    const projects = filterTasks(
      sampleTasks,
      { ...DEFAULT_TASK_FILTER_STATE, hierarchyScope: 'projects' },
      today
    );
    expect(projects.every((t) => t.projectId !== undefined)).toBe(true);
    expect(projects.map((t) => t.id)).toEqual(['t2', 't3', 't4']);

    // Specific project p1
    const p1Tasks = filterTasks(
      sampleTasks,
      { ...DEFAULT_TASK_FILTER_STATE, hierarchyScope: 'projects', projectId: 'p1' },
      today
    );
    expect(p1Tasks.map((t) => t.id)).toEqual(['t2', 't3']);
  });

  it('filters by active status set and excludes Done/Cancelled unless includeClosed toggled per D-20', () => {
    // Default excludes Done (t5) and Cancelled (t6)
    const activeOnly = filterTasks(sampleTasks, DEFAULT_TASK_FILTER_STATE, today);
    expect(DEFAULT_TASK_FILTER_STATE.statuses).toEqual(['Open', 'Pending', 'In Progress', 'Resolved', 'In Review']);
    expect(activeOnly.map((t) => t.id)).toEqual(['t1', 't-pending', 't2', 't3', 't4', 't7']);
    expect(activeOnly.some((t) => t.status === 'Done' || t.status === 'Cancelled')).toBe(false);

    // With includeClosed = true
    const withClosed = filterTasks(
      sampleTasks,
      { ...DEFAULT_TASK_FILTER_STATE, includeClosed: true },
      today
    );
    expect(withClosed.map((t) => t.id)).toContain('t5');
    expect(withClosed.map((t) => t.id)).toContain('t6');

    // Explicit single status filter
    const inProgressOnly = filterTasks(
      sampleTasks,
      { ...DEFAULT_TASK_FILTER_STATE, statuses: ['In Progress'] },
      today
    );
    expect(inProgressOnly.map((t) => t.id)).toEqual(['t2']);
  });

  it('filters by priority set', () => {
    const urgentOnly = filterTasks(
      sampleTasks,
      { ...DEFAULT_TASK_FILTER_STATE, priorities: ['Urgent'] },
      today
    );
    expect(urgentOnly.map((t) => t.id)).toEqual(['t2', 't7']);
  });
});

describe('matchesHorizon', () => {
  it('correctly matches Overdue, Today, and This Week without timezone drift per D-17', () => {
    // Overdue: deadline < today
    expect(matchesHorizon('2026-09-24', 'overdue', today)).toBe(true);
    expect(matchesHorizon('2026-09-26', 'overdue', today)).toBe(false);
    expect(matchesHorizon('2026-09-27', 'overdue', today)).toBe(false);
    expect(matchesHorizon(undefined, 'overdue', today)).toBe(false);

    // Today: deadline === today
    expect(matchesHorizon('2026-09-26', 'today', today)).toBe(true);
    expect(matchesHorizon('2026-09-25', 'today', today)).toBe(false);
    expect(matchesHorizon('2026-09-27', 'today', today)).toBe(false);
    expect(matchesHorizon(undefined, 'today', today)).toBe(false);

    // This Week: deadline >= today && deadline <= endOfWeek (Sunday 2026-09-27 or Saturday 2026-09-26)
    expect(matchesHorizon('2026-09-26', 'this_week', today)).toBe(true);
    expect(matchesHorizon('2026-09-24', 'this_week', today)).toBe(false); // Past / overdue
    expect(matchesHorizon('2026-10-15', 'this_week', today)).toBe(false); // Far future
    expect(matchesHorizon(undefined, 'this_week', today)).toBe(false);

    // All horizon matches everything
    expect(matchesHorizon('2026-09-24', 'all', today)).toBe(true);
    expect(matchesHorizon(undefined, 'all', today)).toBe(true);
  });
});

describe('sortTasks', () => {
  it('defaults to Deadline ascending (nulls last) then Priority descending per D-19', () => {
    const sorted = sortTasks(sampleTasks);
    // Overdue t2 (2026-09-24) -> t5 (2026-09-10) -> wait, 2026-09-10 is earlier than 2026-09-24!
    // Earliest deadline first:
    // t5 (2026-09-10)
    // t2 (2026-09-24)
    // t1 (2026-09-26)
    // t3 (2026-09-27)
    // t4 (2026-10-15)
    // No deadline: t7 (Urgent, prio 4) comes before t6 (Low, prio 1)
    expect(sorted.map((t) => t.id)).toEqual(['t5', 't2', 't1', 't3', 't4', 't7', 't6']);
  });

  it('orders same deadline by Priority descending (Urgent -> High -> Medium -> Low)', () => {
    const sameDateTasks: Task[] = [
      { ...sampleTasks[0]!, id: 'low-task', priority: 'Low', deadline: '2026-09-26' },
      { ...sampleTasks[0]!, id: 'urgent-task', priority: 'Urgent', deadline: '2026-09-26' },
      { ...sampleTasks[0]!, id: 'high-task', priority: 'High', deadline: '2026-09-26' },
      { ...sampleTasks[0]!, id: 'medium-task', priority: 'Medium', deadline: '2026-09-26' },
    ];

    const sorted = sortTasks(sameDateTasks);
    expect(sorted.map((t) => t.id)).toEqual(['urgent-task', 'high-task', 'medium-task', 'low-task']);
  });
});

describe('Phase 10: countActiveAdvancedFilters (SRCH-03, D-04)', () => {
  it('returns 0 for default filter state', () => {
    expect(countActiveAdvancedFilters(DEFAULT_TASK_FILTER_STATE)).toBe(0);
  });

  it('counts each active advanced filter criterion correctly', () => {
    expect(
      countActiveAdvancedFilters({
        ...DEFAULT_TASK_FILTER_STATE,
        milestoneId: 'm1',
      })
    ).toBe(1);

    expect(
      countActiveAdvancedFilters({
        ...DEFAULT_TASK_FILTER_STATE,
        workTypes: ['code', 'review_code'],
      })
    ).toBe(1);

    expect(
      countActiveAdvancedFilters({
        ...DEFAULT_TASK_FILTER_STATE,
        opsOwners: ['John'],
      })
    ).toBe(1);

    expect(
      countActiveAdvancedFilters({
        ...DEFAULT_TASK_FILTER_STATE,
        businessAnalysts: ['Alice'],
      })
    ).toBe(1);

    expect(
      countActiveAdvancedFilters({
        ...DEFAULT_TASK_FILTER_STATE,
        executionDateRange: ['2026-09-01', '2026-09-30'],
      })
    ).toBe(1);

    expect(
      countActiveAdvancedFilters({
        ...DEFAULT_TASK_FILTER_STATE,
        deadlineRange: ['2026-09-01', '2026-09-30'],
      })
    ).toBe(1);

    expect(
      countActiveAdvancedFilters({
        ...DEFAULT_TASK_FILTER_STATE,
        jiraFilter: 'linked',
      })
    ).toBe(1);

    expect(
      countActiveAdvancedFilters({
        ...DEFAULT_TASK_FILTER_STATE,
        jiraFilter: 'unlinked',
      })
    ).toBe(1);

    expect(
      countActiveAdvancedFilters({
        ...DEFAULT_TASK_FILTER_STATE,
        jiraFilter: 'all',
      })
    ).toBe(0);

    expect(
      countActiveAdvancedFilters({
        ...DEFAULT_TASK_FILTER_STATE,
        milestoneId: 'm1',
        workTypes: ['code'],
        opsOwners: ['John'],
        businessAnalysts: ['Alice'],
        executionDateRange: ['2026-09-01', '2026-09-30'],
        deadlineRange: ['2026-09-01', '2026-09-30'],
        jiraFilter: 'linked',
      })
    ).toBe(7);
  });

  it('does not count empty arrays or empty date strings in ranges', () => {
    expect(
      countActiveAdvancedFilters({
        ...DEFAULT_TASK_FILTER_STATE,
        workTypes: [],
        opsOwners: [],
        businessAnalysts: [],
        executionDateRange: ['', '2026-09-30'] as [string, string],
        deadlineRange: ['2026-09-01', ''] as [string, string],
      })
    ).toBe(0);
  });
});

describe('Phase 10: Multi-Criteria filterTasks & FilterContext (SRCH-01, SRCH-02, SRCH-03)', () => {
  const project1: Project = {
    id: 'p1',
    name: 'Core Banking',
    status: 'In Progress',
    opsOwners: ['Ops-Project-Lead'],
    businessAnalysts: ['BA-Project-Lead'],
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  };

  const milestone1: Milestone = {
    id: 'm1',
    projectId: 'p1',
    name: 'Sprint 1',
    status: 'In Progress',
    opsOwners: ['Ops-Milestone-Specialist'],
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  };

  const projectMap = new Map<string, Project>([['p1', project1]]);
  const milestoneMap = new Map<string, Milestone>([['m1', milestone1]]);

  const tasksWithDomain: Task[] = [
    {
      id: 'task-code',
      name: 'Implement OAuth',
      status: 'In Progress',
      priority: 'High',
      progress: 40,
      estimateMinutes: 120,
      projectId: 'p1',
      milestoneId: 'm1',
      workType: 'code',
      opsOwners: ['Direct-Ops-User'],
      businessAnalysts: ['Direct-BA-User'],
      deadline: '2026-09-25',
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    },
    {
      id: 'task-doc',
      name: 'Write user manual',
      status: 'Open',
      priority: 'Medium',
      progress: 0,
      estimateMinutes: 60,
      projectId: 'p1',
      milestoneId: 'm1',
      workType: 'document',
      // No direct tags -> should inherit ops from milestone ('Ops-Milestone-Specialist') and ba from project ('BA-Project-Lead')
      deadline: '2026-09-28',
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    },
    {
      id: 'task-meeting',
      name: 'Sync with security team',
      status: 'Open',
      priority: 'Low',
      progress: 0,
      estimateMinutes: 30,
      projectId: 'p1',
      // No milestone -> direct child of project
      workType: 'meeting',
      // Should inherit ops and ba from project ('Ops-Project-Lead', 'BA-Project-Lead')
      deadline: '2026-10-05',
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    },
    {
      id: 'task-standalone',
      name: 'Personal research',
      status: 'Open',
      priority: 'Low',
      progress: 0,
      estimateMinutes: 45,
      // Standalone, no workType, no tags
      deadline: '2026-09-30',
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    },
  ];

  it('filters by deadlineRange [start, end] inclusive (SRCH-02, D-02)', () => {
    const context: FilterContext = { todayStr: '2026-09-26' };
    const res = filterTasks(
      tasksWithDomain,
      {
        ...DEFAULT_TASK_FILTER_STATE,
        deadlineRange: ['2026-09-25', '2026-09-28'],
      },
      context
    );

    expect(res.map((t) => t.id)).toEqual(['task-code', 'task-doc']);
  });

  it('filters by executionDateRange using executionTaskIds Set (SRCH-01, D-06)', () => {
    const context: FilterContext = {
      todayStr: '2026-09-26',
      executionTaskIds: new Set(['task-code', 'task-standalone']),
    };

    const res = filterTasks(
      tasksWithDomain,
      {
        ...DEFAULT_TASK_FILTER_STATE,
        executionDateRange: ['2026-09-20', '2026-09-25'],
      },
      context
    );

    expect(res.map((t) => t.id)).toEqual(['task-code', 'task-standalone']);
  });

  it('does not filter out tasks if executionDateRange is set but executionTaskIds is null/undefined (loading state)', () => {
    const context: FilterContext = {
      todayStr: '2026-09-26',
      executionTaskIds: null,
    };

    const res = filterTasks(
      tasksWithDomain,
      {
        ...DEFAULT_TASK_FILTER_STATE,
        executionDateRange: ['2026-09-20', '2026-09-25'],
      },
      context
    );

    expect(res.length).toBe(tasksWithDomain.length);
  });

  it('filters by workTypes array (SRCH-03)', () => {
    const context: FilterContext = { todayStr: '2026-09-26' };
    const res = filterTasks(
      tasksWithDomain,
      {
        ...DEFAULT_TASK_FILTER_STATE,
        workTypes: ['code', 'meeting'],
      },
      context
    );

    expect(res.map((t) => t.id)).toEqual(['task-code', 'task-meeting']);
  });

  it('filters by milestoneId (SRCH-03)', () => {
    const context: FilterContext = { todayStr: '2026-09-26' };
    const res = filterTasks(
      tasksWithDomain,
      {
        ...DEFAULT_TASK_FILTER_STATE,
        milestoneId: 'm1',
      },
      context
    );

    expect(res.map((t) => t.id)).toEqual(['task-code', 'task-doc']);
  });

  it('filters by opsOwners matching direct and inherited tags (SRCH-03, D-03)', () => {
    const context: FilterContext = {
      todayStr: '2026-09-26',
      projectMap,
      milestoneMap,
    };

    // 1. Direct tag match
    const directRes = filterTasks(
      tasksWithDomain,
      {
        ...DEFAULT_TASK_FILTER_STATE,
        opsOwners: ['direct-ops-user'], // Case-insensitive
      },
      context
    );
    expect(directRes.map((t) => t.id)).toEqual(['task-code']);

    // 2. Inherited from milestone
    const msRes = filterTasks(
      tasksWithDomain,
      {
        ...DEFAULT_TASK_FILTER_STATE,
        opsOwners: ['Ops-Milestone-Specialist'],
      },
      context
    );
    expect(msRes.map((t) => t.id)).toEqual(['task-doc']);

    // 3. Inherited from project
    const projRes = filterTasks(
      tasksWithDomain,
      {
        ...DEFAULT_TASK_FILTER_STATE,
        opsOwners: ['Ops-Project-Lead'],
      },
      context
    );
    expect(projRes.map((t) => t.id)).toEqual(['task-meeting']);
  });

  it('filters by businessAnalysts matching direct and inherited tags (SRCH-03, D-03)', () => {
    const context: FilterContext = {
      todayStr: '2026-09-26',
      projectMap,
      milestoneMap,
    };

    // Inherited from project on task-doc (milestone had no BAs, so falls back to project)
    // and task-meeting (direct child of project)
    const baRes = filterTasks(
      tasksWithDomain,
      {
        ...DEFAULT_TASK_FILTER_STATE,
        businessAnalysts: ['ba-project-lead'],
      },
      context
    );
    expect(baRes.map((t) => t.id)).toEqual(['task-doc', 'task-meeting']);
  });

  it('combines multiple criteria simultaneously with AND logic (SRCH-03)', () => {
    const context: FilterContext = {
      todayStr: '2026-09-26',
      projectMap,
      milestoneMap,
      executionTaskIds: new Set(['task-code', 'task-doc']),
    };

    const res = filterTasks(
      tasksWithDomain,
      {
        ...DEFAULT_TASK_FILTER_STATE,
        milestoneId: 'm1',
        workTypes: ['code'],
        executionDateRange: ['2026-09-01', '2026-09-30'],
        opsOwners: ['Direct-Ops-User'],
      },
      context
    );

    expect(res.map((t) => t.id)).toEqual(['task-code']);
  });

  it('filters by jiraFilter: all, linked, and unlinked (JIRA-04, D-13)', () => {
    const tasksWithJira: Task[] = [
      {
        ...sampleTasks[0]!,
        id: 't-with-jira-1',
        jiraKey: 'SHB-101',
      },
      {
        ...sampleTasks[1]!,
        id: 't-with-jira-2',
        jiraKey: 'SHB-102',
      },
      {
        ...sampleTasks[2]!,
        id: 't-without-jira',
        jiraKey: undefined,
      },
    ];

    // 'all' returns all eligible tasks
    const resAll = filterTasks(
      tasksWithJira,
      { ...DEFAULT_TASK_FILTER_STATE, jiraFilter: 'all' },
      today
    );
    expect(resAll.map((t) => t.id)).toEqual(['t-with-jira-1', 't-with-jira-2', 't-without-jira']);

    // 'linked' returns only tasks with jiraKey
    const resLinked = filterTasks(
      tasksWithJira,
      { ...DEFAULT_TASK_FILTER_STATE, jiraFilter: 'linked' },
      today
    );
    expect(resLinked.map((t) => t.id)).toEqual(['t-with-jira-1', 't-with-jira-2']);

    // 'unlinked' returns only tasks without jiraKey
    const resUnlinked = filterTasks(
      tasksWithJira,
      { ...DEFAULT_TASK_FILTER_STATE, jiraFilter: 'unlinked' },
      today
    );
    expect(resUnlinked.map((t) => t.id)).toEqual(['t-without-jira']);
  });
});

