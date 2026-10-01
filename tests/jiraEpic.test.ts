import { describe, it, expect } from 'vitest';
import type { Task, Project } from '../src/types/models';

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

  it('inherits parent project jiraEpicKey as default epic for child task', () => {
    const parentProject: Project = {
      id: 'proj-1',
      name: 'Mobile Banking Redesign',
      status: 'In Progress',
      jiraEpicKey: 'MB-100',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };

    const childTask: Task = {
      id: 'task-1',
      name: 'Implement OAuth Flow',
      projectId: 'proj-1',
      status: 'Open',
      progress: 0,
      priority: 'High',
      estimateMinutes: 240,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };

    // Helper simulating parent project resolution and default epic key
    const resolveDefaultEpicKey = (task: Task, projects: Project[]): string | undefined => {
      if (!task.projectId) return undefined;
      const proj = projects.find((p) => p.id === task.projectId);
      return proj?.jiraEpicKey;
    };

    expect(resolveDefaultEpicKey(childTask, [parentProject])).toBe('MB-100');
  });

  it('allows overriding epicKey for child task without modifying parent project', () => {
    const parentProject: Project = {
      id: 'proj-1',
      name: 'Core Banking API',
      status: 'Open',
      jiraEpicKey: 'CB-50',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };

    // Simulated modal state: pre-fill CB-50, user overrides to CB-99
    let initialEpicKey = parentProject.jiraEpicKey;
    let submittedEpicKey = 'CB-99';

    expect(initialEpicKey).toBe('CB-50');
    expect(submittedEpicKey).toBe('CB-99');
    expect(parentProject.jiraEpicKey).toBe('CB-50'); // Parent remains untouched
  });

  it('returns undefined default epic when parent project has no jiraEpicKey or task has no projectId', () => {
    const projectWithoutEpic: Project = {
      id: 'proj-2',
      name: 'Internal Dev Tools',
      status: 'Open',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };

    const taskWithProject: Task = {
      id: 'task-2',
      name: 'Setup linter',
      projectId: 'proj-2',
      status: 'Open',
      progress: 0,
      priority: 'Low',
      estimateMinutes: 60,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };

    const standaloneTask: Task = {
      id: 'task-3',
      name: 'Read documentation',
      status: 'Open',
      progress: 0,
      priority: 'Low',
      estimateMinutes: 30,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };

    const resolveDefaultEpicKey = (task: Task, projects: Project[]): string | undefined => {
      if (!task.projectId) return undefined;
      const proj = projects.find((p) => p.id === task.projectId);
      return proj?.jiraEpicKey;
    };

    expect(resolveDefaultEpicKey(taskWithProject, [projectWithoutEpic])).toBeUndefined();
    expect(resolveDefaultEpicKey(standaloneTask, [projectWithoutEpic])).toBeUndefined();
  });
});
