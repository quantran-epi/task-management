// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import {
  createProject,
  updateProject,
  getProject,
  getAllProjects,
  deleteProjectDirect,
} from '../../src/db/repositories/projectRepo';
import {
  createMilestone,
  updateMilestone,
  getMilestone,
  getMilestonesByProject,
} from '../../src/db/repositories/milestoneRepo';
import {
  createTask,
  updateTask,
  getTask,
  getTasksByProject,
  getTasksByMilestone,
  getAllTasks,
  updateTaskStatus,
  updateTaskProgress,
} from '../../src/db/repositories/taskRepo';
import {
  ProjectInputSchema,
  MilestoneInputSchema,
  TaskInputSchema,
} from '../../src/validation/schemas';

describe('Project, Milestone & Task Repositories & Schemas (WORK-01, WORK-02, WORK-03, TASK-02, TASK-04)', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestReposDB_' + Math.random().toString(36).slice(2));
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  describe('Project Schema & Repo', () => {
    it('validates project input schema', () => {
      // Empty name should fail
      expect(() => ProjectInputSchema.parse({ name: '' })).toThrow();
      // Valid input
      const valid = ProjectInputSchema.parse({
        name: 'Launch Website',
        deadline: '2026-10-01',
        description: 'Product launch site',
        status: 'In Progress',
      });
      expect(valid.name).toBe('Launch Website');
      expect(valid.status).toBe('In Progress');
    });

    it('creates project with generated UUID and valid defaults', async () => {
      const project = await createProject(
        {
          name: 'Core Architecture',
          deadline: '2026-12-31',
        },
        testDb
      );

      expect(project.id).toBeDefined();
      expect(project.name).toBe('Core Architecture');
      expect(project.status).toBe('Open');
      expect(project.deadline).toBe('2026-12-31');
      expect(project.createdAt).toBeDefined();
      expect(project.updatedAt).toBeDefined();

      const fetched = await getProject(project.id, testDb);
      expect(fetched?.id).toBe(project.id);
      expect(fetched?.name).toBe('Core Architecture');
    });

    it('rejects invalid deadline format when creating project', async () => {
      await expect(
        createProject(
          {
            name: 'Bad Date Project',
            deadline: '2026/12/31',
          },
          testDb
        )
      ).rejects.toThrow();
    });

    it('updates project fields and refreshes updatedAt', async () => {
      const project = await createProject({ name: 'Alpha' }, testDb);
      const originalUpdatedAt = project.updatedAt;

      // Small delay to ensure timestamp diff
      await new Promise((r) => setTimeout(r, 5));

      const updated = await updateProject(
        project.id,
        {
          name: 'Alpha v2',
          status: 'In Progress',
        },
        testDb
      );

      expect(updated.name).toBe('Alpha v2');
      expect(updated.status).toBe('In Progress');
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(originalUpdatedAt).getTime()
      );
    });

    it('gets all projects', async () => {
      await createProject({ name: 'P1' }, testDb);
      await createProject({ name: 'P2' }, testDb);

      const all = await getAllProjects(testDb);
      expect(all).toHaveLength(2);
    });

    it('supports direct project deletion', async () => {
      const p = await createProject({ name: 'To Delete' }, testDb);
      await deleteProjectDirect(p.id, testDb);
      expect(await getProject(p.id, testDb)).toBeUndefined();
    });
  });

  describe('Milestone Schema & Repo', () => {
    it('validates milestone input schema', () => {
      expect(() => MilestoneInputSchema.parse({ name: '' })).toThrow();
      expect(() => MilestoneInputSchema.parse({ name: 'M1', projectId: 'not-a-uuid' })).toThrow();
    });

    it('creates milestone linked to project with generated UUID', async () => {
      const project = await createProject({ name: 'Main Project' }, testDb);
      const milestone = await createMilestone(
        {
          projectId: project.id,
          name: 'Milestone 1: Beta',
          deadline: '2026-11-15',
          status: 'Open',
        },
        testDb
      );

      expect(milestone.id).toBeDefined();
      expect(milestone.projectId).toBe(project.id);
      expect(milestone.name).toBe('Milestone 1: Beta');
      expect(milestone.status).toBe('Open');

      const fetched = await getMilestone(milestone.id, testDb);
      expect(fetched?.name).toBe('Milestone 1: Beta');

      const byProj = await getMilestonesByProject(project.id, testDb);
      expect(byProj).toHaveLength(1);
      expect(byProj[0]?.id).toBe(milestone.id);
    });

    it('updates milestone status and details', async () => {
      const project = await createProject({ name: 'P' }, testDb);
      const m = await createMilestone({ projectId: project.id, name: 'M' }, testDb);

      const updated = await updateMilestone(
        m.id,
        {
          name: 'M Finished',
          status: 'Done',
        },
        testDb
      );

      expect(updated.status).toBe('Done');
      expect(updated.name).toBe('M Finished');
    });
  });

  describe('Task Schema & Repo (WORK-03, TASK-02, TASK-04, D-15)', () => {
    it('validates task input schema with defaults', () => {
      const parsed = TaskInputSchema.parse({ name: 'Quick Task' });
      expect(parsed.name).toBe('Quick Task');
      expect(parsed.status).toBe('Open');
      expect(parsed.progress).toBe(0);
      expect(parsed.priority).toBe('Medium');
      expect(parsed.estimateMinutes).toBe(0);
    });

    it('rejects invalid document links', () => {
      expect(() =>
        TaskInputSchema.parse({
          name: 'Task',
          documentLinks: ['ftp://bad-link.com'],
        })
      ).toThrow();

      expect(() =>
        TaskInputSchema.parse({
          name: 'Task',
          documentLinks: ['not-a-url'],
        })
      ).toThrow();

      const valid = TaskInputSchema.parse({
        name: 'Task',
        documentLinks: ['https://example.com/spec', 'http://localhost:3000'],
      });
      expect(valid.documentLinks).toHaveLength(2);
    });

    it('creates standalone task (no projectId / milestoneId) per WORK-03', async () => {
      const task = await createTask({ name: 'Standalone Task' }, testDb);
      expect(task.id).toBeDefined();
      expect(task.projectId).toBeUndefined();
      expect(task.milestoneId).toBeUndefined();
      expect(task.status).toBe('Open');

      const fetched = await getTask(task.id, testDb);
      expect(fetched?.name).toBe('Standalone Task');
    });

    it('creates project-level task (projectId only) per WORK-03', async () => {
      const project = await createProject({ name: 'Proj' }, testDb);
      const task = await createTask({ name: 'Proj Task', projectId: project.id }, testDb);
      expect(task.projectId).toBe(project.id);
      expect(task.milestoneId).toBeUndefined();

      const byProj = await getTasksByProject(project.id, testDb);
      expect(byProj).toHaveLength(1);
      expect(byProj[0]?.id).toBe(task.id);
    });

    it('creates milestone-level task (projectId + milestoneId) per WORK-03', async () => {
      const project = await createProject({ name: 'Proj' }, testDb);
      const milestone = await createMilestone({ projectId: project.id, name: 'MS' }, testDb);
      const task = await createTask(
        {
          name: 'MS Task',
          projectId: project.id,
          milestoneId: milestone.id,
        },
        testDb
      );

      expect(task.projectId).toBe(project.id);
      expect(task.milestoneId).toBe(milestone.id);

      const byMs = await getTasksByMilestone(milestone.id, testDb);
      expect(byMs).toHaveLength(1);
      expect(byMs[0]?.id).toBe(task.id);
    });

    it('updates task status across all 6 valid statuses per TASK-03', async () => {
      const task = await createTask({ name: 'Status Workflow' }, testDb);
      const statuses = ['In Progress', 'Resolved', 'In Review', 'Done', 'Cancelled', 'Open'] as const;

      for (const st of statuses) {
        const updated = await updateTaskStatus(task.id, st, testDb);
        expect(updated.status).toBe(st);
      }
    });

    it('preserves soft cancelled task in DB per D-15', async () => {
      const task = await createTask({ name: 'Cancelled Task' }, testDb);
      await updateTaskStatus(task.id, 'Cancelled', testDb);

      const fetched = await getTask(task.id, testDb);
      expect(fetched).toBeDefined();
      expect(fetched?.status).toBe('Cancelled');
      expect(fetched?.id).toBe(task.id);
    });

    it('updates task progress integer clamped between 0 and 100', async () => {
      const task = await createTask({ name: 'Progress Task' }, testDb);
      const updated50 = await updateTaskProgress(task.id, 50, testDb);
      expect(updated50.progress).toBe(50);

      await expect(updateTaskProgress(task.id, -10, testDb)).rejects.toThrow();
      await expect(updateTaskProgress(task.id, 110, testDb)).rejects.toThrow();
    });

    it('updates general task fields and fetches all tasks', async () => {
      const task = await createTask({ name: 'Original' }, testDb);
      const updated = await updateTask(
        task.id,
        {
          name: 'Renamed',
          description: 'Added details',
          priority: 'Urgent',
          estimateMinutes: 180,
        },
        testDb
      );

      expect(updated.name).toBe('Renamed');
      expect(updated.description).toBe('Added details');
      expect(updated.priority).toBe('Urgent');
      expect(updated.estimateMinutes).toBe(180);

      const all = await getAllTasks(testDb);
      expect(all.length).toBeGreaterThanOrEqual(1);
    });
  });
});
