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
  getDistinctOpsOwners,
  getDistinctBusinessAnalysts,
} from '../../src/db/repositories/tagRepo';
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

    it('creates and updates project with opsOwners and businessAnalysts', async () => {
      const project = await createProject(
        {
          name: 'Banking Project',
          opsOwners: ['ops-infra', 'ops-db'],
          businessAnalysts: ['ba-alice'],
        },
        testDb
      );

      expect(project.opsOwners).toEqual(['ops-infra', 'ops-db']);
      expect(project.businessAnalysts).toEqual(['ba-alice']);

      const fetched = await getProject(project.id, testDb);
      expect(fetched?.opsOwners).toEqual(['ops-infra', 'ops-db']);
      expect(fetched?.businessAnalysts).toEqual(['ba-alice']);

      const updated = await updateProject(
        project.id,
        {
          opsOwners: ['ops-security'],
          businessAnalysts: ['ba-bob', 'ba-carol'],
        },
        testDb
      );

      expect(updated.opsOwners).toEqual(['ops-security']);
      expect(updated.businessAnalysts).toEqual(['ba-bob', 'ba-carol']);
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

    it('creates and updates milestone with opsOwners and businessAnalysts', async () => {
      const project = await createProject({ name: 'P' }, testDb);
      const m = await createMilestone(
        {
          projectId: project.id,
          name: 'Milestone Banking',
          opsOwners: ['ops-lead'],
          businessAnalysts: ['ba-dan'],
        },
        testDb
      );

      expect(m.opsOwners).toEqual(['ops-lead']);
      expect(m.businessAnalysts).toEqual(['ba-dan']);

      const updated = await updateMilestone(
        m.id,
        {
          opsOwners: ['ops-platform'],
          businessAnalysts: ['ba-erin'],
        },
        testDb
      );

      expect(updated.opsOwners).toEqual(['ops-platform']);
      expect(updated.businessAnalysts).toEqual(['ba-erin']);
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

    it('clears optional task detail fields when explicitly patched as undefined', async () => {
      const task = await createTask(
        {
          name: 'Clear me',
          deadline: '2026-10-02',
          notes: 'remove this',
          actualStartDate: '2026-10-01',
          actualEndDate: '2026-10-02',
          documentLinks: ['https://example.com/spec'],
          opsOwners: ['ops-one'],
          businessAnalysts: ['ba-one'],
        },
        testDb
      );

      const updated = await updateTask(
        task.id,
        {
          deadline: undefined,
          notes: undefined,
          actualStartDate: undefined,
          actualEndDate: undefined,
          documentLinks: undefined,
          opsOwners: undefined,
          businessAnalysts: undefined,
        },
        testDb
      );

      expect(updated.deadline).toBeUndefined();
      expect(updated.notes).toBeUndefined();
      expect(updated.actualStartDate).toBeUndefined();
      expect(updated.actualEndDate).toBeUndefined();
      expect(updated.documentLinks).toBeUndefined();
      expect(updated.opsOwners).toBeUndefined();
      expect(updated.businessAnalysts).toBeUndefined();
      expect(await getTask(task.id, testDb)).toMatchObject(updated);
    });

    it('creates task with default workType "code" and updates workType, opsOwners, businessAnalysts', async () => {
      const task = await createTask({ name: 'Banking Task' }, testDb);
      expect(task.workType).toBe('code');
      expect(task.opsOwners).toBeUndefined();
      expect(task.businessAnalysts).toBeUndefined();

      const taskWithFields = await createTask(
        {
          name: 'Explicit Fields Task',
          workType: 'investigate',
          opsOwners: ['ops-infra'],
          businessAnalysts: ['ba-frank'],
        },
        testDb
      );
      expect(taskWithFields.workType).toBe('investigate');
      expect(taskWithFields.opsOwners).toEqual(['ops-infra']);
      expect(taskWithFields.businessAnalysts).toEqual(['ba-frank']);

      const updated = await updateTask(
        taskWithFields.id,
        {
          workType: 'review_code',
          opsOwners: ['ops-core'],
          businessAnalysts: ['ba-grace'],
        },
        testDb
      );
      expect(updated.workType).toBe('review_code');
      expect(updated.opsOwners).toEqual(['ops-core']);
      expect(updated.businessAnalysts).toEqual(['ba-grace']);
    });
  });

  describe('Tag Repository (getDistinctOpsOwners, getDistinctBusinessAnalysts)', () => {
    it('returns empty array when no tags are present', async () => {
      const ops = await getDistinctOpsOwners(testDb);
      const bas = await getDistinctBusinessAnalysts(testDb);

      expect(ops).toEqual([]);
      expect(bas).toEqual([]);
    });

    it('queries distinct Ops Owners across projects, milestones, and tasks using multi-entry index and sorts alphabetically', async () => {
      const project = await createProject(
        {
          name: 'Project P',
          opsOwners: ['Ops-Beta', 'Ops-Alpha'],
        },
        testDb
      );

      const milestone = await createMilestone(
        {
          projectId: project.id,
          name: 'Milestone M',
          opsOwners: ['Ops-Gamma', 'Ops-Beta'],
        },
        testDb
      );

      await createTask(
        {
          name: 'Task T',
          projectId: project.id,
          milestoneId: milestone.id,
          opsOwners: ['Ops-Delta', 'Ops-Alpha'],
        },
        testDb
      );

      const distinct = await getDistinctOpsOwners(testDb);
      expect(distinct).toEqual(['Ops-Alpha', 'Ops-Beta', 'Ops-Delta', 'Ops-Gamma']);
    });

    it('queries distinct Business Analysts across projects, milestones, and tasks using multi-entry index and sorts alphabetically', async () => {
      const project = await createProject(
        {
          name: 'Project P2',
          businessAnalysts: ['BA-Zoe', 'BA-Alex'],
        },
        testDb
      );

      await createMilestone(
        {
          projectId: project.id,
          name: 'Milestone M2',
          businessAnalysts: ['BA-Bob', 'BA-Alex'],
        },
        testDb
      );

      await createTask(
        {
          name: 'Task T2',
          businessAnalysts: ['BA-Charlie'],
        },
        testDb
      );

      const distinct = await getDistinctBusinessAnalysts(testDb);
      expect(distinct).toEqual(['BA-Alex', 'BA-Bob', 'BA-Charlie', 'BA-Zoe']);
    });

    it('falls back to in-memory tag extraction when uniqueKeys cursor throws (WebKit bug #319640)', async () => {
      await createProject(
        {
          name: 'Project Fallback',
          opsOwners: ['Ops-FB'],
          businessAnalysts: ['BA-FB'],
        },
        testDb
      );

      // Mock uniqueKeys on tasks to simulate WebKit UnknownError
      const spyOps = vi.spyOn(testDb.projects.orderBy('opsOwners'), 'uniqueKeys').mockRejectedValue(
        new Error('UnknownError: Unable to open cursor')
      );

      const ops = await getDistinctOpsOwners(testDb);
      expect(ops).toContain('Ops-FB');

      spyOps.mockRestore();

      const spyBA = vi.spyOn(testDb.projects.orderBy('businessAnalysts'), 'uniqueKeys').mockRejectedValue(
        new Error('UnknownError: Unable to open cursor')
      );

      const bas = await getDistinctBusinessAnalysts(testDb);
      expect(bas).toContain('BA-FB');

      spyBA.mockRestore();
    });
  });
});
