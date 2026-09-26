import { describe, it, expect } from 'vitest';
import type { Task } from '../../src/types/models';
import {
  filterTasks,
  sortTasks,
  matchesHorizon,
  DEFAULT_TASK_FILTER_STATE,
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
  it('filters case-insensitively across name, description, and notes per D-18', () => {
    // Matches in name
    const matchName = filterTasks(sampleTasks, { ...DEFAULT_TASK_FILTER_STATE, search: 'Quarterly' }, today);
    expect(matchName.map((t) => t.id)).toEqual(['t1']);

    // Matches in description
    const matchDesc = filterTasks(sampleTasks, { ...DEFAULT_TASK_FILTER_STATE, search: 'PATCH TOKEN' }, today);
    expect(matchDesc.map((t) => t.id)).toEqual(['t2']);

    // Matches in notes
    const matchNotes = filterTasks(sampleTasks, { ...DEFAULT_TASK_FILTER_STATE, search: 'markdown tables' }, today);
    expect(matchNotes.map((t) => t.id)).toEqual(['t3']);
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
    expect(activeOnly.map((t) => t.id)).toEqual(['t1', 't2', 't3', 't4', 't7']);
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
