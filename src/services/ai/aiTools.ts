import type { TaskPlannerDatabase } from '../../db';
import type { Task, Project, Milestone, Note } from '../../types/models';
import { getTodayDateString } from '../../utils/date';
import { getEffectiveDailyCapacity } from '../../utils/capacity';
import { inspectDateCapacity } from '../../utils/feasibility';
import { filterSessionsByPeriod, aggregateWorkTypeBreakdown } from '../../utils/analytics';
import dayjs from 'dayjs';

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
        'Query or search tasks in Task Planner. Returns tasks enriched with project/milestone names, logged hours, recurring schedule, and checklists. Can filter by projectId, milestoneId, status, priority, or search keywords.',
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
            description: 'Optional search keyword to match task name, description, notes, or jiraKey.',
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
        'List or search all projects in Task Planner. Returns project metadata, statuses, milestone counts, total task counts, and total logged minutes.',
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
            description: 'Max number of projects to return (default 20, max 50).',
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
        'List or search milestones in Task Planner. Returns milestone metadata, parent project name, task counts, and deadlines.',
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
            description: 'Optional search keyword to match milestone name or description.',
          },
          limit: {
            type: 'number',
            description: 'Max number of milestones to return (default 20, max 50).',
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
        'Retrieve full detailed information about a specific task, project, or milestone by its UUID, including linked parent names, logged work sessions summary, scheduled allocations, and sticky notes.',
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
  {
    type: 'function',
    function: {
      name: 'query_worklogs',
      description:
        'Query actual worklog sessions and time spent. Can filter by taskId, projectId, or date range (startDate to endDate YYYY-MM-DD). Returns session details and total minutes logged.',
      parameters: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'Optional task UUID to filter worklogs for a specific task.',
          },
          projectId: {
            type: 'string',
            description: 'Optional project UUID to filter worklogs for tasks under this project.',
          },
          startDate: {
            type: 'string',
            description: 'Optional start date filter (YYYY-MM-DD inclusive).',
          },
          endDate: {
            type: 'string',
            description: 'Optional end date filter (YYYY-MM-DD inclusive).',
          },
          limit: {
            type: 'number',
            description: 'Max number of worklog sessions to return (default 30, max 100).',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_active_timer',
      description:
        'Check whether a timer is currently active (running or paused) in the app, which task is being timed, started time, and elapsed minutes.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_daily_schedule',
      description:
        'Get the planned workload schedule and capacity for a specific date or date range. Shows planned tasks with allocated minutes, total planned time, daily capacity limit, and overload status.',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Target date in YYYY-MM-DD format (defaults to current date if omitted).',
          },
          endDate: {
            type: 'string',
            description: 'Optional end date in YYYY-MM-DD format to retrieve a multi-day schedule range.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_capacity_feasibility',
      description:
        'Evaluate whether an additional workload (in minutes) can feasibly fit into a specific date without exceeding daily capacity limits.',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Target date in YYYY-MM-DD format.',
          },
          requiredMinutes: {
            type: 'number',
            description: 'Required time in minutes to check against available capacity.',
          },
          taskId: {
            type: 'string',
            description: 'Optional task UUID to exclude its current allocation from load calculation.',
          },
        },
        required: ['date', 'requiredMinutes'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_day_insight',
      description:
        'Compare planned allocations against actual logged time per task for a given day (Daily Review). Includes running timer live minutes and planned vs actual variance.',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Target date in YYYY-MM-DD format.',
          },
        },
        required: ['date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_analytics_summary',
      description:
        'Retrieve productivity and estimation accuracy analytics over a time horizon. Computes total actual logged time, estimate vs actual accuracy ratio, estimation bias (under/over-estimating), and work type breakdown.',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            enum: ['7d', '14d', '30d', 'all'],
            description: 'Time window for analytics (default 14d).',
          },
          projectId: {
            type: 'string',
            description: 'Optional project UUID to filter analytics for a specific project.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_notes',
      description:
        'Search or list notes and scratchpads. Can search text in title or body, filter by isPinned, or filter by entityType (task, project, milestone, or standalone).',
      parameters: {
        type: 'object',
        properties: {
          search: {
            type: 'string',
            description: 'Optional keyword to search in note title or body markdown.',
          },
          entityType: {
            type: 'string',
            enum: ['task', 'project', 'milestone', 'standalone'],
            description: 'Filter by entity type (use "standalone" for notes not linked to any entity).',
          },
          entityId: {
            type: 'string',
            description: 'Optional entity UUID to filter notes linked to a specific item.',
          },
          isPinned: {
            type: 'boolean',
            description: 'Optional boolean filter for pinned notes.',
          },
          limit: {
            type: 'number',
            description: 'Max number of notes to return (default 20, max 50).',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_attention_items',
      description:
        'Get prioritized items needing attention: overdue tasks, tasks due today, scheduled tasks for today, upcoming deadlines within horizon, and active reminders.',
      parameters: {
        type: 'object',
        properties: {
          horizonDays: {
            type: 'number',
            description: 'Number of upcoming days to inspect for deadlines and reminders (default 7).',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_recurring_tasks',
      description:
        'List all recurring task templates in Task Planner, including frequency, repeat days of week, intervals, and recurrence end dates.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_system_status',
      description:
        'Check app system status: last backup metadata, GitHub auto-sync status, and SQLite persistence status. (Sensitive credentials and tokens are redacted).',
      parameters: {
        type: 'object',
        properties: {},
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
        const projects = db.projects ? await db.projects.toArray() : [];
        const milestones = db.milestones ? await db.milestones.toArray() : [];
        const workSessions = db.workSessions ? await db.workSessions.toArray() : [];

        const projectMap = new Map<string, Project>(projects.map((p) => [p.id, p]));
        const milestoneMap = new Map<string, Milestone>(milestones.map((m) => [m.id, m]));
        const loggedMap = new Map<string, number>();
        for (const ws of workSessions) {
          loggedMap.set(ws.taskId, (loggedMap.get(ws.taskId) || 0) + (ws.durationMinutes || 0));
        }

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
        const subset = tasks.slice(0, limit).map((t) => {
          const p = t.projectId ? projectMap.get(t.projectId) : undefined;
          const m = t.milestoneId ? milestoneMap.get(t.milestoneId) : undefined;
          return {
            id: t.id,
            name: t.name,
            status: t.status,
            priority: t.priority,
            progress: t.progress,
            deadline: t.deadline ?? null,
            actualStartDate: t.actualStartDate ?? null,
            actualEndDate: t.actualEndDate ?? null,
            estimateMinutes: t.estimateMinutes,
            totalLoggedMinutes: loggedMap.get(t.id) || 0,
            jiraKey: t.jiraKey ?? null,
            workType: t.workType ?? null,
            projectId: t.projectId ?? null,
            projectName: p?.name ?? null,
            milestoneId: t.milestoneId ?? null,
            milestoneName: m?.name ?? null,
            checklistCount: t.checklist?.length ?? 0,
            checklistDoneCount: t.checklist?.filter((c) => c.done).length ?? 0,
            isRecurring: Boolean(t.isRecurring),
            recurrenceFrequency: t.recurrenceFrequency ?? null,
            remindersCount: t.reminders?.length ?? 0,
            opsOwners: t.opsOwners ?? [],
            businessAnalysts: t.businessAnalysts ?? [],
          };
        });

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
        const workSessions = db.workSessions ? await db.workSessions.toArray() : [];

        const loggedMap = new Map<string, number>();
        for (const ws of workSessions) {
          loggedMap.set(ws.taskId, (loggedMap.get(ws.taskId) || 0) + (ws.durationMinutes || 0));
        }

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
          let totalEstimate = 0;
          let totalLogged = 0;
          for (const t of pTasks) {
            totalEstimate += t.estimateMinutes || 0;
            totalLogged += loggedMap.get(t.id) || 0;
          }
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
            totalEstimateMinutes: totalEstimate,
            totalLoggedMinutes: totalLogged,
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
        const allProjects = db.projects ? await db.projects.toArray() : [];
        const workSessions = db.workSessions ? await db.workSessions.toArray() : [];

        const projectMap = new Map<string, Project>(allProjects.map((p) => [p.id, p]));
        const loggedMap = new Map<string, number>();
        for (const ws of workSessions) {
          loggedMap.set(ws.taskId, (loggedMap.get(ws.taskId) || 0) + (ws.durationMinutes || 0));
        }

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
          const p = projectMap.get(m.projectId);
          let totalEstimate = 0;
          let totalLogged = 0;
          for (const t of mTasks) {
            totalEstimate += t.estimateMinutes || 0;
            totalLogged += loggedMap.get(t.id) || 0;
          }
          return {
            id: m.id,
            name: m.name,
            projectId: m.projectId,
            projectName: p?.name ?? null,
            status: m.status,
            deadline: m.deadline ?? null,
            description: m.description ?? null,
            taskCount: mTasks.length,
            openTaskCount: mTasks.filter(
              (t) => t.status !== 'Done' && t.status !== 'Cancelled'
            ).length,
            totalEstimateMinutes: totalEstimate,
            totalLoggedMinutes: totalLogged,
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

        const formattedStickyNotes = stickyNotes.map((n) => ({
          id: n.id,
          title: n.title,
          body: n.body,
          isPinned: n.isPinned,
        }));

        if (type === 'task') {
          const task = item as Task;
          const project = task.projectId && db.projects ? await db.projects.get(task.projectId) : undefined;
          const milestone = task.milestoneId && db.milestones ? await db.milestones.get(task.milestoneId) : undefined;
          const taskSessions = db.workSessions
            ? (await db.workSessions.toArray()).filter((ws) => ws.taskId === id)
            : [];
          const taskAllocations = db.plannedAllocations
            ? (await db.plannedAllocations.toArray()).filter((pa) => pa.taskId === id)
            : [];

          let totalLoggedMinutes = 0;
          let lastSessionDate: string | null = null;
          for (const s of taskSessions) {
            totalLoggedMinutes += s.durationMinutes || 0;
            if (!lastSessionDate || s.date > lastSessionDate) {
              lastSessionDate = s.date;
            }
          }

          return JSON.stringify({
            type,
            item,
            projectName: project?.name ?? null,
            milestoneName: milestone?.name ?? null,
            workSessionsSummary: {
              totalLoggedMinutes,
              totalLoggedHours: (totalLoggedMinutes / 60).toFixed(1),
              sessionCount: taskSessions.length,
              lastSessionDate,
            },
            plannedAllocations: taskAllocations.map((pa) => ({
              date: pa.date,
              allocatedMinutes: pa.allocatedMinutes,
            })),
            stickyNotes: formattedStickyNotes,
          });
        }

        if (type === 'project') {
          const allTasks = db.tasks ? (await db.tasks.toArray()).filter((t) => t.projectId === id) : [];
          const allMilestones = db.milestones
            ? (await db.milestones.toArray()).filter((m) => m.projectId === id)
            : [];
          const workSessions = db.workSessions ? await db.workSessions.toArray() : [];
          const taskIds = new Set(allTasks.map((t) => t.id));
          const projectSessions = workSessions.filter((ws) => taskIds.has(ws.taskId));

          let totalLoggedMinutes = 0;
          let totalEstimateMinutes = 0;
          for (const t of allTasks) totalEstimateMinutes += t.estimateMinutes || 0;
          for (const ws of projectSessions) totalLoggedMinutes += ws.durationMinutes || 0;

          return JSON.stringify({
            type,
            item,
            milestones: allMilestones.map((m) => ({
              id: m.id,
              name: m.name,
              status: m.status,
              deadline: m.deadline ?? null,
            })),
            tasksSummary: {
              total: allTasks.length,
              open: allTasks.filter((t) => t.status === 'Open' || t.status === 'Pending').length,
              inProgress: allTasks.filter((t) => t.status === 'In Progress').length,
              done: allTasks.filter((t) => t.status === 'Done').length,
              totalEstimateMinutes,
              totalLoggedMinutes,
            },
            stickyNotes: formattedStickyNotes,
          });
        }

        if (type === 'milestone') {
          const milestone = item as Milestone;
          const project = milestone.projectId && db.projects ? await db.projects.get(milestone.projectId) : undefined;
          const allTasks = db.tasks ? (await db.tasks.toArray()).filter((t) => t.milestoneId === id) : [];
          const workSessions = db.workSessions ? await db.workSessions.toArray() : [];
          const taskIds = new Set(allTasks.map((t) => t.id));
          const milestoneSessions = workSessions.filter((ws) => taskIds.has(ws.taskId));

          let totalLoggedMinutes = 0;
          let totalEstimateMinutes = 0;
          for (const t of allTasks) totalEstimateMinutes += t.estimateMinutes || 0;
          for (const ws of milestoneSessions) totalLoggedMinutes += ws.durationMinutes || 0;

          return JSON.stringify({
            type,
            item,
            projectName: project?.name ?? null,
            tasksSummary: {
              total: allTasks.length,
              open: allTasks.filter((t) => t.status === 'Open' || t.status === 'Pending').length,
              inProgress: allTasks.filter((t) => t.status === 'In Progress').length,
              done: allTasks.filter((t) => t.status === 'Done').length,
              totalEstimateMinutes,
              totalLoggedMinutes,
            },
            stickyNotes: formattedStickyNotes,
          });
        }

        return JSON.stringify({
          type,
          item,
          stickyNotes: formattedStickyNotes,
        });
      }

      case 'query_worklogs': {
        if (!db.workSessions) return JSON.stringify({ error: 'WorkSessions table unavailable' });
        let sessions = await db.workSessions.toArray();
        const allTasks = db.tasks ? await db.tasks.toArray() : [];
        const taskMap = new Map<string, Task>(allTasks.map((t) => [t.id, t]));

        if (args.projectId) {
          const projectTaskIds = new Set(
            allTasks.filter((t) => t.projectId === args.projectId).map((t) => t.id)
          );
          sessions = sessions.filter((s) => projectTaskIds.has(s.taskId));
        }
        if (args.taskId) {
          sessions = sessions.filter((s) => s.taskId === args.taskId);
        }
        if (args.startDate) {
          sessions = sessions.filter((s) => s.date >= args.startDate);
        }
        if (args.endDate) {
          sessions = sessions.filter((s) => s.date <= args.endDate);
        }

        // Sort descending by date, then startTime
        sessions.sort((a, b) => {
          if (a.date !== b.date) return b.date.localeCompare(a.date);
          return (b.startTime || '').localeCompare(a.startTime || '');
        });

        const totalCount = sessions.length;
        let totalLoggedMinutes = 0;
        for (const s of sessions) {
          totalLoggedMinutes += s.durationMinutes || 0;
        }

        const limit = Math.min(Math.max(1, Number(args.limit) || 30), 100);
        const subset = sessions.slice(0, limit).map((s) => ({
          id: s.id,
          taskId: s.taskId,
          taskName: taskMap.get(s.taskId)?.name ?? 'Unknown Task',
          date: s.date,
          durationMinutes: s.durationMinutes,
          startTime: s.startTime,
          endTime: s.endTime ?? null,
          note: s.note ?? null,
        }));

        return JSON.stringify({
          totalCount,
          totalLoggedMinutes,
          totalLoggedHours: (totalLoggedMinutes / 60).toFixed(1),
          returnedCount: subset.length,
          sessions: subset,
        });
      }

      case 'get_active_timer': {
        if (!db.activeTimers) return JSON.stringify({ error: 'ActiveTimers table unavailable' });
        const timers = await db.activeTimers.toArray();
        const activeTimer = timers.find((t) => t.status === 'running' || t.status === 'paused');

        if (!activeTimer) {
          return JSON.stringify({
            hasActiveTimer: false,
            message: 'No timer is currently active.',
          });
        }

        const task = db.tasks ? await db.tasks.get(activeTimer.taskId) : undefined;

        // Calculate live elapsed ms
        let liveElapsedMs = activeTimer.accumulatedMs || 0;
        if (activeTimer.status === 'running' && activeTimer.segments && activeTimer.segments.length > 0) {
          const lastSeg = activeTimer.segments[activeTimer.segments.length - 1];
          if (lastSeg && !lastSeg.endTime) {
            const segStart = new Date(lastSeg.startTime).getTime();
            liveElapsedMs += Math.max(0, Date.now() - segStart);
          }
        }
        const accumulatedMinutes = Math.floor(liveElapsedMs / 60000);

        return JSON.stringify({
          hasActiveTimer: true,
          taskId: activeTimer.taskId,
          taskName: task?.name ?? 'Unknown Task',
          status: activeTimer.status,
          isCurrentlyRunning: activeTimer.status === 'running',
          sessionStartTime: activeTimer.sessionStartTime,
          accumulatedMinutes,
          accumulatedHours: (accumulatedMinutes / 60).toFixed(1),
          segmentsCount: activeTimer.segments?.length ?? 0,
        });
      }

      case 'get_daily_schedule': {
        if (!db.plannedAllocations) return JSON.stringify({ error: 'PlannedAllocations table unavailable' });
        const todayStr = getTodayDateString();
        const startDate = args.date || todayStr;
        const endDate = args.endDate || startDate;

        const allAllocations = await db.plannedAllocations.toArray();
        const allTasks = db.tasks ? await db.tasks.toArray() : [];
        const taskMap = new Map<string, Task>(allTasks.map((t) => [t.id, t]));
        const rules = db.capacityRules ? await db.capacityRules.toArray() : [];
        const overrides = db.capacityOverrides ? await db.capacityOverrides.toArray() : [];

        // Build list of dates
        const days: Array<{
          date: string;
          capacityMinutes: number;
          totalPlannedMinutes: number;
          netRemainingMinutes: number;
          status: string;
          tasks: Array<{
            taskId: string;
            taskName: string;
            allocatedMinutes: number;
            status: string;
            priority: string;
          }>;
        }> = [];

        let cur = dayjs(startDate);
        const end = dayjs(endDate);
        const MAX_DAYS = 31;
        let dayCount = 0;

        while ((cur.isBefore(end) || cur.isSame(end, 'day')) && dayCount < MAX_DAYS) {
          const dStr = cur.format('YYYY-MM-DD');
          const dayAllocs = allAllocations.filter((a) => a.date === dStr);
          const capacityMinutes = getEffectiveDailyCapacity(dStr, rules, overrides);

          let totalPlannedMinutes = 0;
          const plannedTasks = dayAllocs.map((a) => {
            totalPlannedMinutes += a.allocatedMinutes || 0;
            const t = taskMap.get(a.taskId);
            return {
              taskId: a.taskId,
              taskName: t?.name ?? 'Unknown Task',
              allocatedMinutes: a.allocatedMinutes,
              status: t?.status ?? 'Unknown',
              priority: t?.priority ?? 'Medium',
            };
          });

          const netRemainingMinutes = capacityMinutes - totalPlannedMinutes;
          let status = 'available';
          if (capacityMinutes === 0) status = 'non-working';
          else if (totalPlannedMinutes > capacityMinutes) status = 'overloaded';
          else if (netRemainingMinutes === 0) status = 'full';

          days.push({
            date: dStr,
            capacityMinutes,
            totalPlannedMinutes,
            netRemainingMinutes,
            status,
            tasks: plannedTasks,
          });

          cur = cur.add(1, 'day');
          dayCount++;
        }

        return JSON.stringify({
          startDate,
          endDate,
          daysCount: days.length,
          schedule: days,
        });
      }

      case 'check_capacity_feasibility': {
        const { date, requiredMinutes, taskId } = args;
        if (!date || typeof requiredMinutes !== 'number') {
          return JSON.stringify({ error: 'Missing required parameters: date (YYYY-MM-DD), requiredMinutes (number)' });
        }

        const todayStr = getTodayDateString();
        const allAllocations = db.plannedAllocations ? await db.plannedAllocations.toArray() : [];
        const rules = db.capacityRules ? await db.capacityRules.toArray() : [];
        const overrides = db.capacityOverrides ? await db.capacityOverrides.toArray() : [];

        const dayAllocations = allAllocations.filter(
          (a) => a.date === date && (!taskId || a.taskId !== taskId)
        );
        let existingPlannedMinutes = 0;
        for (const a of dayAllocations) {
          existingPlannedMinutes += a.allocatedMinutes || 0;
        }

        const inspection = inspectDateCapacity(
          date,
          todayStr,
          taskId || 'preview',
          rules,
          overrides,
          existingPlannedMinutes
        );

        const dailyCapacityMinutes = inspection.capacityMinutes;
        const totalAfterRequest = existingPlannedMinutes + requiredMinutes;
        const remainingCapacityAfterRequest = dailyCapacityMinutes - totalAfterRequest;
        const isFeasible = dailyCapacityMinutes > 0 && remainingCapacityAfterRequest >= 0;

        return JSON.stringify({
          date,
          dailyCapacityMinutes,
          existingPlannedMinutes,
          requiredMinutes,
          totalAfterRequest,
          remainingCapacityAfterRequest,
          isFeasible,
          status: inspection.status,
        });
      }

      case 'get_day_insight': {
        const targetDate = args.date;
        if (!targetDate) {
          return JSON.stringify({ error: 'Missing required parameter: date (YYYY-MM-DD)' });
        }

        const allocations = db.plannedAllocations
          ? (await db.plannedAllocations.toArray()).filter((a) => a.date === targetDate)
          : [];
        const sessions = db.workSessions
          ? (await db.workSessions.toArray()).filter((s) => s.date === targetDate)
          : [];
        const allTasks = db.tasks ? await db.tasks.toArray() : [];
        const taskMap = new Map<string, Task>(allTasks.map((t) => [t.id, t]));
        const rules = db.capacityRules ? await db.capacityRules.toArray() : [];
        const overrides = db.capacityOverrides ? await db.capacityOverrides.toArray() : [];
        const capacityMinutes = getEffectiveDailyCapacity(targetDate, rules, overrides);

        // Check running timer live minutes
        const activeTimers = db.activeTimers ? await db.activeTimers.toArray() : [];
        const runningTimer = activeTimers.find(
          (t) => t.status === 'running' && t.sessionStartTime?.startsWith(targetDate)
        );
        let runningTaskId: string | null = null;
        let runningMinutes = 0;
        if (runningTimer && runningTimer.segments) {
          runningTaskId = runningTimer.taskId;
          const lastSeg = runningTimer.segments[runningTimer.segments.length - 1];
          if (lastSeg && !lastSeg.endTime) {
            const segStart = new Date(lastSeg.startTime).getTime();
            const liveMs = (runningTimer.accumulatedMs || 0) + Math.max(0, Date.now() - segStart);
            runningMinutes = Math.floor(liveMs / 60000);
          }
        }

        // Aggregate unique task IDs from planned and actual
        const involvedTaskIds = new Set<string>();
        for (const a of allocations) involvedTaskIds.add(a.taskId);
        for (const s of sessions) involvedTaskIds.add(s.taskId);
        if (runningTaskId) involvedTaskIds.add(runningTaskId);

        let totalPlannedMinutes = 0;
        let totalActualMinutes = 0;

        const rows = Array.from(involvedTaskIds).map((tId) => {
          const t = taskMap.get(tId);
          const planned = allocations.filter((a) => a.taskId === tId).reduce((sum, a) => sum + (a.allocatedMinutes || 0), 0);
          let actual = sessions.filter((s) => s.taskId === tId).reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
          const isRunning = runningTaskId === tId;
          if (isRunning) {
            actual = Math.max(actual, runningMinutes);
          }

          totalPlannedMinutes += planned;
          totalActualMinutes += actual;

          return {
            taskId: tId,
            taskName: t?.name ?? 'Unknown Task',
            plannedMinutes: planned,
            actualMinutes: actual,
            deltaMinutes: actual - planned,
            isRunning,
          };
        });

        return JSON.stringify({
          date: targetDate,
          capacityMinutes,
          totalPlannedMinutes,
          totalActualMinutes,
          deltaMinutes: totalActualMinutes - totalPlannedMinutes,
          tasksCount: rows.length,
          rows,
        });
      }

      case 'get_analytics_summary': {
        if (!db.workSessions) return JSON.stringify({ error: 'WorkSessions table unavailable' });
        const period = args.period || '14d';
        let sessions = await db.workSessions.toArray();
        const allTasks = db.tasks ? await db.tasks.toArray() : [];

        if (args.projectId) {
          const projectTaskIds = new Set(
            allTasks.filter((t) => t.projectId === args.projectId).map((t) => t.id)
          );
          sessions = sessions.filter((s) => projectTaskIds.has(s.taskId));
        }

        const filteredSessions = filterSessionsByPeriod(sessions, period as any);
        let totalLoggedMinutes = 0;
        for (const s of filteredSessions) totalLoggedMinutes += s.durationMinutes || 0;

        // Work type breakdown (tasks, sessions)
        const workTypeBreakdown = aggregateWorkTypeBreakdown(allTasks, filteredSessions);

        // Estimate vs Actual for completed or active tasks
        const sessionTaskIds = new Set(filteredSessions.map((s) => s.taskId));
        const relevantTasks = allTasks.filter((t) => sessionTaskIds.has(t.id));

        let totalEstimatedForTracked = 0;
        for (const t of relevantTasks) {
          totalEstimatedForTracked += t.estimateMinutes || 0;
        }

        let estimationBias = 'balanced';
        if (totalEstimatedForTracked > 0) {
          const ratio = totalLoggedMinutes / totalEstimatedForTracked;
          if (ratio > 1.2) estimationBias = 'underestimating'; // spent much more than estimated
          else if (ratio < 0.8) estimationBias = 'overestimating'; // spent much less than estimated
        }

        return JSON.stringify({
          period,
          totalSessionsCount: filteredSessions.length,
          totalLoggedMinutes,
          totalLoggedHours: (totalLoggedMinutes / 60).toFixed(1),
          totalEstimatedMinutesForTrackedTasks: totalEstimatedForTracked,
          estimationBias,
          workTypeBreakdown: workTypeBreakdown.map((item) => ({
            type: item.type,
            minutes: item.minutes,
            hours: item.hours,
          })),
        });
      }

      case 'query_notes': {
        if (!db.notes) return JSON.stringify({ error: 'Notes table unavailable' });
        let notes = await db.notes.toArray();
        const allTasks = db.tasks ? await db.tasks.toArray() : [];
        const allProjects = db.projects ? await db.projects.toArray() : [];
        const allMilestones = db.milestones ? await db.milestones.toArray() : [];

        const taskMap = new Map(allTasks.map((t) => [t.id, t.name]));
        const projectMap = new Map(allProjects.map((p) => [p.id, p.name]));
        const milestoneMap = new Map(allMilestones.map((m) => [m.id, m.name]));

        if (args.entityType) {
          if (args.entityType === 'standalone') {
            notes = notes.filter((n) => !n.entityId || !n.entityType);
          } else {
            notes = notes.filter((n) => n.entityType === args.entityType);
          }
        }
        if (args.entityId) {
          notes = notes.filter((n) => n.entityId === args.entityId);
        }
        if (typeof args.isPinned === 'boolean') {
          notes = notes.filter((n) => Boolean(n.isPinned) === args.isPinned);
        }
        if (args.search) {
          const q = String(args.search).toLowerCase();
          notes = notes.filter(
            (n) =>
              (n.title && n.title.toLowerCase().includes(q)) ||
              (n.body && n.body.toLowerCase().includes(q))
          );
        }

        // Sort pinned first, then newest
        notes.sort((a, b) => {
          if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
          return (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '');
        });

        const totalCount = notes.length;
        const limit = Math.min(Math.max(1, Number(args.limit) || 20), 50);
        const subset = notes.slice(0, limit).map((n) => {
          let entityName: string | null = null;
          if (n.entityType === 'task' && n.entityId) entityName = taskMap.get(n.entityId) ?? null;
          else if (n.entityType === 'project' && n.entityId) entityName = projectMap.get(n.entityId) ?? null;
          else if (n.entityType === 'milestone' && n.entityId) entityName = milestoneMap.get(n.entityId) ?? null;

          return {
            id: n.id,
            title: n.title ?? 'Untitled Note',
            bodySnippet: n.body.length > 200 ? `${n.body.slice(0, 200)}...` : n.body,
            isPinned: n.isPinned,
            entityType: n.entityType ?? 'standalone',
            entityId: n.entityId ?? null,
            entityName,
            createdAt: n.createdAt,
            updatedAt: n.updatedAt,
          };
        });

        return JSON.stringify({
          totalCount,
          returnedCount: subset.length,
          notes: subset,
        });
      }

      case 'query_attention_items': {
        const todayStr = getTodayDateString();
        const horizonDays = Math.max(1, Number(args.horizonDays) || 7);
        const horizonEnd = dayjs(todayStr).add(horizonDays, 'day').format('YYYY-MM-DD');

        const allTasks = db.tasks ? await db.tasks.toArray() : [];
        const allProjects = db.projects ? await db.projects.toArray() : [];
        const allMilestones = db.milestones ? await db.milestones.toArray() : [];
        const allAllocations = db.plannedAllocations ? await db.plannedAllocations.toArray() : [];

        const activeTasks = allTasks.filter((t) => t.status !== 'Done' && t.status !== 'Cancelled');
        const overdueTasks: any[] = [];
        const dueTodayTasks: any[] = [];
        const scheduledTodayTasks: any[] = [];
        const upcomingDeadlines: any[] = [];
        const activeReminders: any[] = [];

        // Check scheduled today
        const todayTaskIds = new Set(allAllocations.filter((a) => a.date === todayStr).map((a) => a.taskId));

        for (const t of activeTasks) {
          if (todayTaskIds.has(t.id)) {
            scheduledTodayTasks.push({ id: t.id, name: t.name, status: t.status, priority: t.priority });
          }

          if (t.deadline) {
            if (t.deadline < todayStr) {
              const daysOverdue = dayjs(todayStr).diff(dayjs(t.deadline), 'day');
              overdueTasks.push({ id: t.id, name: t.name, deadline: t.deadline, daysOverdue, priority: t.priority });
            } else if (t.deadline === todayStr) {
              dueTodayTasks.push({ id: t.id, name: t.name, priority: t.priority });
            } else if (t.deadline <= horizonEnd) {
              upcomingDeadlines.push({ type: 'task', id: t.id, name: t.name, deadline: t.deadline, priority: t.priority });
            }
          }

          // Reminders
          if (t.reminders && t.reminders.length > 0) {
            for (const r of t.reminders) {
              if (r.date >= todayStr && r.date <= horizonEnd) {
                activeReminders.push({ entityType: 'task', entityName: t.name, date: r.date, time: r.time ?? null, note: r.note ?? null });
              }
            }
          }
        }

        // Upcoming project deadlines
        for (const p of allProjects) {
          if (p.status !== 'Done' && p.status !== 'Cancelled' && p.deadline) {
            if (p.deadline <= horizonEnd) {
              upcomingDeadlines.push({ type: 'project', id: p.id, name: p.name, deadline: p.deadline });
            }
          }
        }

        // Upcoming milestone deadlines
        for (const m of allMilestones) {
          if (m.status !== 'Done' && m.status !== 'Cancelled' && m.deadline) {
            if (m.deadline <= horizonEnd) {
              upcomingDeadlines.push({ type: 'milestone', id: m.id, name: m.name, deadline: m.deadline });
            }
          }
        }

        // Sort overdue descending by daysOverdue
        overdueTasks.sort((a, b) => b.daysOverdue - a.daysOverdue);

        return JSON.stringify({
          today: todayStr,
          horizonDays,
          overdueTasksCount: overdueTasks.length,
          overdueTasks,
          dueTodayTasksCount: dueTodayTasks.length,
          dueTodayTasks,
          scheduledTodayTasksCount: scheduledTodayTasks.length,
          scheduledTodayTasks,
          upcomingDeadlines,
          activeReminders,
        });
      }

      case 'query_recurring_tasks': {
        if (!db.tasks) return JSON.stringify({ error: 'Tasks table unavailable' });
        const allTasks = await db.tasks.toArray();
        const recurring = allTasks.filter((t) => t.isRecurring);

        return JSON.stringify({
          totalCount: recurring.length,
          recurringTasks: recurring.map((t) => ({
            id: t.id,
            name: t.name,
            status: t.status,
            priority: t.priority,
            recurrenceFrequency: t.recurrenceFrequency,
            recurrenceInterval: t.recurrenceInterval ?? 1,
            recurrenceDaysOfWeek: t.recurrenceDaysOfWeek ?? [],
            recurrenceEndDate: t.recurrenceEndDate ?? null,
            parentRecurringTaskId: t.parentRecurringTaskId ?? null,
          })),
        });
      }

      case 'get_system_status': {
        const backupMeta = db.backupMetadata ? await db.backupMetadata.toArray() : [];
        const settings = db.settings ? await db.settings.toArray() : [];
        const settingsMap = new Map<string, any>(settings.map((s) => [s.key, s.value]));

        // Sort backup metadata newest first
        backupMeta.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
        const latestBackup = backupMeta[0];

        // Safe projection without exposing tokens/passwords
        return JSON.stringify({
          backup: {
            hasBackup: Boolean(latestBackup),
            lastBackupTimestamp: latestBackup?.timestamp ?? null,
            appVersion: latestBackup?.appVersion ?? null,
            recordCount: latestBackup?.recordCount ?? null,
          },
          githubSync: {
            enabled: Boolean(settingsMap.get('github_auto_sync_enabled')),
            lastSyncedAt: settingsMap.get('last_synced_at') ?? null,
            autoSyncState: settingsMap.get('github_auto_sync_state') ?? 'idle',
            lastError: settingsMap.get('github_auto_sync_last_error') ?? null,
            targetRepo: settingsMap.get('github_repo')
              ? `${settingsMap.get('github_owner') || 'unknown'}/${settingsMap.get('github_repo')}`
              : null,
          },
          sqlitePersistence: {
            enabled: Boolean(settingsMap.get('tauri_sqlite_enabled')),
            lastFlushAt: settingsMap.get('tauri_sqlite_last_flush_at') ?? null,
          },
        });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (err: any) {
    return JSON.stringify({ error: `Tool execution failed: ${err?.message || String(err)}` });
  }
}
