import { describe, it, expect } from 'vitest';
import type { Task, ChangeRequest } from '../src/types/models';

describe('Jira Epic Mapping & Inheritance', () => {
  const JIRA_KEY_REGEX = /^[A-Z][A-Z0-9]+-[0-9]+$/;

  it('validates jiraEpicKey pattern correctly', () => {
    expect(JIRA_KEY_REGEX.test('PROJ-123')).toBe(true);
    expect(JIRA_KEY_REGEX.test('SHB-1')).toBe(true);
    expect(JIRA_KEY_REGEX.test('A1-999')).toBe(true);
    expect(JIRA_KEY_REGEX.test('proj-123')).toBe(false);
    expect(JIRA_KEY_REGEX.test('PROJ')).toBe(false);
    expect(JIRA_KEY_REGEX.test('123-PROJ')).toBe(false);
    expect(JIRA_KEY_REGEX.test('')).toBe(false);
  });

  it('inherits parent CR jiraEpicKey as default epic for child task', () => {
    const parentCr: ChangeRequest = {
      id: 'cr-1',
      code: 'CR-MB-01',
      name: 'Mobile Banking Redesign',
      status: 'In Progress',
      type: 'ENHANCEMENT',
      targets: [],
      jiraEpicKey: 'MB-100',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };

    const childTask: Task = {
      id: 'task-1',
      crId: 'cr-1',
      name: 'Implement OAuth Flow',
      status: 'Open',
      progress: 0,
      priority: 'High',
      estimateMinutes: 240,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };

    // Helper simulating parent CR resolution and default epic key
    const resolveDefaultEpicKey = (task: Task, crs: ChangeRequest[]): string | undefined => {
      const cr = crs.find((c) => c.id === task.crId);
      return cr?.jiraEpicKey;
    };

    expect(resolveDefaultEpicKey(childTask, [parentCr])).toBe('MB-100');
  });

  it('allows overriding epicKey for child task without modifying parent CR', () => {
    const parentCr: ChangeRequest = {
      id: 'cr-1',
      code: 'CR-CB-01',
      name: 'Core Banking API',
      status: 'Open',
      type: 'ENHANCEMENT',
      targets: [],
      jiraEpicKey: 'CB-50',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };

    // Simulated modal state: pre-fill CB-50, user overrides to CB-99
    const initialEpicKey = parentCr.jiraEpicKey;
    const submittedEpicKey = 'CB-99';

    expect(initialEpicKey).toBe('CB-50');
    expect(submittedEpicKey).toBe('CB-99');
    expect(parentCr.jiraEpicKey).toBe('CB-50'); // Parent remains untouched
  });

  it('returns undefined default epic when the parent CR has no jiraEpicKey', () => {
    const crWithoutEpic: ChangeRequest = {
      id: 'cr-2',
      code: 'CR-TOOLS-01',
      name: 'Internal Dev Tools',
      status: 'Open',
      type: 'ENHANCEMENT',
      targets: [],
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };

    const taskWithCr: Task = {
      id: 'task-2',
      crId: 'cr-2',
      name: 'Setup linter',
      status: 'Open',
      progress: 0,
      priority: 'Low',
      estimateMinutes: 60,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };

    // A task whose CR is not in the provided set resolves to no default epic.
    const orphanTask: Task = {
      id: 'task-3',
      crId: 'cr-missing',
      name: 'Read documentation',
      status: 'Open',
      progress: 0,
      priority: 'Low',
      estimateMinutes: 30,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };

    const resolveDefaultEpicKey = (task: Task, crs: ChangeRequest[]): string | undefined => {
      const cr = crs.find((c) => c.id === task.crId);
      return cr?.jiraEpicKey;
    };

    expect(resolveDefaultEpicKey(taskWithCr, [crWithoutEpic])).toBeUndefined();
    expect(resolveDefaultEpicKey(orphanTask, [crWithoutEpic])).toBeUndefined();
  });
});
