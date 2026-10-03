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
      checklist: [{ id: 'c1', text: 'Step 1', done: true }],
      notes: 'Some task notes',
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
    },
    {
      id: 'ms-2',
      projectId: 'proj-1',
      name: 'Cloud Deploy',
      status: 'Open',
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
    notes: {
      where: () => ({
        equals: () => ({
          filter: () => ({
            toArray: async () => [
              { id: 'n1', title: 'Note 1', body: 'Body 1', isPinned: true },
            ],
          }),
        }),
      }),
    },
  };

  it('declares AI_DATABASE_TOOLS with required schemas', () => {
    expect(AI_DATABASE_TOOLS.length).toBeGreaterThanOrEqual(4);
    const names = AI_DATABASE_TOOLS.map((t) => t.function.name);
    expect(names).toContain('query_tasks');
    expect(names).toContain('query_projects');
    expect(names).toContain('query_milestones');
    expect(names).toContain('get_item_details');
  });

  describe('query_tasks', () => {
    it('filters tasks by projectId and status correctly', async () => {
      const resJson = await executeAiTool('query_tasks', { projectId: 'proj-1' }, mockDb);
      const res = JSON.parse(resJson);
      expect(res.totalCount).toBe(2);
      expect(res.tasks.map((t: any) => t.id)).toEqual(['task-1', 'task-2']);

      const filteredJson = await executeAiTool(
        'query_tasks',
        { projectId: 'proj-1', status: 'In Progress' },
        mockDb
      );
      const filtered = JSON.parse(filteredJson);
      expect(filtered.totalCount).toBe(1);
      expect(filtered.tasks[0].name).toBe('Write unit tests');
    });

    it('searches tasks by keyword in name or notes', async () => {
      const resJson = await executeAiTool('query_tasks', { search: 'deploy' }, mockDb);
      const res = JSON.parse(resJson);
      expect(res.totalCount).toBe(1);
      expect(res.tasks[0].id).toBe('task-2');
    });
  });

  describe('query_projects', () => {
    it('returns projects with task and milestone counts', async () => {
      const resJson = await executeAiTool('query_projects', {}, mockDb);
      const res = JSON.parse(resJson);
      expect(res.totalCount).toBe(2);
      const proj1 = res.projects.find((p: any) => p.id === 'proj-1');
      expect(proj1.taskCount).toBe(2);
      expect(proj1.milestoneCount).toBe(2);
      expect(proj1.openTaskCount).toBe(2);
    });
  });

  describe('query_milestones', () => {
    it('filters milestones by projectId', async () => {
      const resJson = await executeAiTool('query_milestones', { projectId: 'proj-1' }, mockDb);
      const res = JSON.parse(resJson);
      expect(res.totalCount).toBe(2);
      expect(res.milestones[0].name).toBe('Backend API');
    });
  });

  describe('get_item_details', () => {
    it('retrieves full task details with sticky notes', async () => {
      const resJson = await executeAiTool('get_item_details', { type: 'task', id: 'task-1' }, mockDb);
      const res = JSON.parse(resJson);
      expect(res.type).toBe('task');
      expect(res.item.name).toBe('Write unit tests');
      expect(res.stickyNotes.length).toBe(1);
      expect(res.stickyNotes[0].title).toBe('Note 1');
    });

    it('returns error when item not found', async () => {
      const resJson = await executeAiTool('get_item_details', { type: 'task', id: 'non-existent' }, mockDb);
      const res = JSON.parse(resJson);
      expect(res.error).toContain('Not found');
    });
  });
});
