import type { TaskPlannerDatabase } from '../../db';
import type { Task, Project, Milestone, Note } from '../../types/models';

export interface AiToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

export const AI_DATABASE_TOOLS: AiToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'query_tasks',
      description:
        'Query or search tasks in Task Planner. Can filter by projectId, milestoneId, status, priority, or search keywords.',
      parameters: {
        type: 'object',
        properties: {
          projectId: {
            type: 'string',
            description: 'Optional project UUID to filter tasks belonging to this project.',
          },
          milestoneId: {
            type: 'string',
            description: 'Optional milestone UUID to filter tasks belonging to this milestone.',
          },
          status: {
            type: 'string',
            description:
              'Optional task status: Open, Pending, In Progress, Resolved, In Review, Done, Cancelled.',
          },
          priority: {
            type: 'string',
            description: 'Optional priority: Low, Medium, High, Urgent.',
          },
          search: {
            type: 'string',
            description: 'Optional search keyword to match task name, description, or notes.',
          },
          limit: {
            type: 'number',
            description: 'Max number of tasks to return (default 25, max 50).',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_projects',
      description:
        'List or search all projects in Task Planner. Returns project metadata, statuses, and counts.',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            description: 'Optional status: Open, Pending, In Progress, Done, Cancelled.',
          },
          search: {
            type: 'string',
            description: 'Optional search keyword to match project name or description.',
          },
          limit: {
            type: 'number',
            description: 'Max number of projects to return (default 20).',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_milestones',
      description:
        'List or search milestones in Task Planner. Can filter by projectId or search keywords.',
      parameters: {
        type: 'object',
        properties: {
          projectId: {
            type: 'string',
            description: 'Optional project UUID to filter milestones for a specific project.',
          },
          status: {
            type: 'string',
            description: 'Optional status: Open, Pending, In Progress, Done, Cancelled.',
          },
          search: {
            type: 'string',
            description: 'Optional search keyword to match milestone name.',
          },
          limit: {
            type: 'number',
            description: 'Max number of milestones to return (default 20).',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_item_details',
      description:
        'Retrieve full detailed information about a specific task, project, or milestone by its ID.',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['task', 'project', 'milestone'],
            description: 'The entity type to fetch.',
          },
          id: {
            type: 'string',
            description: 'The UUID of the entity.',
          },
        },
        required: ['type', 'id'],
      },
    },
  },
];

export async function executeAiTool(
  toolName: string,
  args: Record<string, any>,
  db: TaskPlannerDatabase
): Promise<string> {
  try {
    switch (toolName) {
      case 'query_tasks': {
        if (!db.tasks) return JSON.stringify({ error: 'Tasks table unavailable' });
        let tasks = await db.tasks.toArray();

        if (args.projectId) {
          tasks = tasks.filter((t) => t.projectId === args.projectId);
        }
        if (args.milestoneId) {
          tasks = tasks.filter((t) => t.milestoneId === args.milestoneId);
        }
        if (args.status) {
          tasks = tasks.filter(
            (t) => t.status.toLowerCase() === String(args.status).toLowerCase()
          );
        }
        if (args.priority) {
          tasks = tasks.filter(
            (t) => t.priority.toLowerCase() === String(args.priority).toLowerCase()
          );
        }
        if (args.search) {
          const q = String(args.search).toLowerCase();
          tasks = tasks.filter(
            (t) =>
              t.name.toLowerCase().includes(q) ||
              (t.description && t.description.toLowerCase().includes(q)) ||
              (t.notes && t.notes.toLowerCase().includes(q)) ||
              (t.jiraKey && t.jiraKey.toLowerCase().includes(q))
          );
        }

        const totalCount = tasks.length;
        const limit = Math.min(Math.max(1, Number(args.limit) || 25), 50);
        const subset = tasks.slice(0, limit).map((t) => ({
          id: t.id,
          name: t.name,
          status: t.status,
          priority: t.priority,
          progress: t.progress,
          deadline: t.deadline ?? null,
          estimateMinutes: t.estimateMinutes,
          jiraKey: t.jiraKey ?? null,
          workType: t.workType ?? null,
          projectId: t.projectId ?? null,
          milestoneId: t.milestoneId ?? null,
          checklistCount: t.checklist?.length ?? 0,
          checklistDoneCount: t.checklist?.filter((c) => c.done).length ?? 0,
        }));

        return JSON.stringify({
          totalCount,
          returnedCount: subset.length,
          tasks: subset,
        });
      }

      case 'query_projects': {
        if (!db.projects) return JSON.stringify({ error: 'Projects table unavailable' });
        let projects = await db.projects.toArray();
        const allTasks = db.tasks ? await db.tasks.toArray() : [];
        const allMilestones = db.milestones ? await db.milestones.toArray() : [];

        if (args.status) {
          projects = projects.filter(
            (p) => p.status.toLowerCase() === String(args.status).toLowerCase()
          );
        }
        if (args.search) {
          const q = String(args.search).toLowerCase();
          projects = projects.filter(
            (p) =>
              p.name.toLowerCase().includes(q) ||
              (p.description && p.description.toLowerCase().includes(q))
          );
        }

        const limit = Math.min(Math.max(1, Number(args.limit) || 20), 50);
        const subset = projects.slice(0, limit).map((p) => {
          const pTasks = allTasks.filter((t) => t.projectId === p.id);
          const pMilestones = allMilestones.filter((m) => m.projectId === p.id);
          return {
            id: p.id,
            name: p.name,
            status: p.status,
            deadline: p.deadline ?? null,
            jiraEpicKey: p.jiraEpicKey ?? null,
            description: p.description ?? null,
            taskCount: pTasks.length,
            openTaskCount: pTasks.filter(
              (t) => t.status !== 'Done' && t.status !== 'Cancelled'
            ).length,
            milestoneCount: pMilestones.length,
          };
        });

        return JSON.stringify({
          totalCount: projects.length,
          returnedCount: subset.length,
          projects: subset,
        });
      }

      case 'query_milestones': {
        if (!db.milestones) return JSON.stringify({ error: 'Milestones table unavailable' });
        let milestones = await db.milestones.toArray();
        const allTasks = db.tasks ? await db.tasks.toArray() : [];

        if (args.projectId) {
          milestones = milestones.filter((m) => m.projectId === args.projectId);
        }
        if (args.status) {
          milestones = milestones.filter(
            (m) => m.status.toLowerCase() === String(args.status).toLowerCase()
          );
        }
        if (args.search) {
          const q = String(args.search).toLowerCase();
          milestones = milestones.filter(
            (m) =>
              m.name.toLowerCase().includes(q) ||
              (m.description && m.description.toLowerCase().includes(q))
          );
        }

        const limit = Math.min(Math.max(1, Number(args.limit) || 20), 50);
        const subset = milestones.slice(0, limit).map((m) => {
          const mTasks = allTasks.filter((t) => t.milestoneId === m.id);
          return {
            id: m.id,
            name: m.name,
            projectId: m.projectId,
            status: m.status,
            deadline: m.deadline ?? null,
            description: m.description ?? null,
            taskCount: mTasks.length,
            openTaskCount: mTasks.filter(
              (t) => t.status !== 'Done' && t.status !== 'Cancelled'
            ).length,
          };
        });

        return JSON.stringify({
          totalCount: milestones.length,
          returnedCount: subset.length,
          milestones: subset,
        });
      }

      case 'get_item_details': {
        const { type, id } = args;
        if (!type || !id) {
          return JSON.stringify({ error: 'Missing required parameters: type, id' });
        }

        let item: Task | Project | Milestone | undefined;
        let stickyNotes: Note[] = [];

        if (type === 'task') {
          item = db.tasks ? await db.tasks.get(id) : undefined;
        } else if (type === 'project') {
          item = db.projects ? await db.projects.get(id) : undefined;
        } else if (type === 'milestone') {
          item = db.milestones ? await db.milestones.get(id) : undefined;
        }

        if (!item) {
          return JSON.stringify({ error: `Not found: ${type} with id "${id}"` });
        }

        if (db.notes) {
          try {
            stickyNotes = await db.notes
              .where('entityId')
              .equals(id)
              .filter((n) => n.entityType === type)
              .toArray();
          } catch {}
        }

        return JSON.stringify({
          type,
          item,
          stickyNotes: stickyNotes.map((n) => ({
            id: n.id,
            title: n.title,
            body: n.body,
            isPinned: n.isPinned,
          })),
        });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (err: any) {
    return JSON.stringify({ error: `Tool execution failed: ${err?.message || String(err)}` });
  }
}
