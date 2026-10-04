import type { TaskPlannerDatabase } from '../../db';
import type { Task, Project, Milestone, Note, ActiveTimer } from '../../types/models';
import { getTodayDateString } from '../../utils/date';
import { getEffectiveDailyCapacity } from '../../utils/capacity';
import { inspectDateCapacity } from '../../utils/feasibility';
import { filterSessionsByPeriod, aggregateWorkTypeBreakdown } from '../../utils/analytics';
import { createTask, updateTask, reparentTask } from '../../db/repositories/taskRepo';
import {
  deleteTaskWithAllocations,
  deleteProjectWithCascade,
  deleteMilestoneWithCascade,
} from '../../db/repositories/cascadeRepo';
import { createProject, updateProject } from '../../db/repositories/projectRepo';
import { createMilestone, updateMilestone } from '../../db/repositories/milestoneRepo';
import { upsertAllocation, deleteAllocation } from '../../db/repositories/allocationRepo';
import {
  createWorkSession,
  updateWorkSession,
  deleteWorkSession,
} from '../../db/repositories/workSessionRepo';
import {
  updateCapacityRule,
  setCapacityOverride,
  removeCapacityOverride,
} from '../../db/repositories/capacityRepo';
import { createNote, updateNote, deleteNote } from '../../db/repositories/noteRepo';
import { rankBM25, extractRelevantSnippet } from '../../utils/bm25';
import { isTauriApp } from '../../utils/timerPopout';
import { exportContentAsFile, inferFormatFromFilename, type ExportFormat } from '../../utils/fileExport';
import { exportPresentationAsFile, type SlideData } from '../../utils/pptxExport';
import { generateImage } from './imageGenerationClient';
import { getImageConfig, getImageApiKey } from './nineRouterTokenService';
import { redactApiKey } from './nineRouterClient';
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
        'Query or search tasks in PlannerMate. Returns tasks enriched with creation/update dates, notes, project/milestone names, logged hours, recurring schedule, and checklists. Supports comprehensive filtering by dates (createdAt, createdAfter/Before, deadline, updatedAfter/Before), status, priority, workType, recurring state, project, milestone, or search keywords, with customizable sorting.',
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
          createdAt: {
            type: 'string',
            description: 'Optional exact creation date (YYYY-MM-DD or ISO string prefix) to filter tasks created on that day.',
          },
          createdAfter: {
            type: 'string',
            description: 'Optional filter for tasks created on or after this date (YYYY-MM-DD).',
          },
          createdBefore: {
            type: 'string',
            description: 'Optional filter for tasks created on or before this date (YYYY-MM-DD).',
          },
          updatedAfter: {
            type: 'string',
            description: 'Optional filter for tasks updated on or after this date (YYYY-MM-DD).',
          },
          updatedBefore: {
            type: 'string',
            description: 'Optional filter for tasks updated on or before this date (YYYY-MM-DD).',
          },
          deadline: {
            type: 'string',
            description: 'Optional exact deadline date in YYYY-MM-DD format.',
          },
          deadlineBefore: {
            type: 'string',
            description: 'Optional filter for tasks with deadline on or before this date (YYYY-MM-DD).',
          },
          deadlineAfter: {
            type: 'string',
            description: 'Optional filter for tasks with deadline on or after this date (YYYY-MM-DD).',
          },
          hasDeadline: {
            type: 'boolean',
            description: 'Optional filter: true for tasks having a deadline, false for tasks without deadline.',
          },
          workType: {
            type: 'string',
            enum: ['code', 'document', 'meeting', 'support_testing', 'investigate', 'configuration', 'review_code'],
            description: 'Optional workType filter.',
          },
          isRecurring: {
            type: 'boolean',
            description: 'Optional boolean filter for recurring tasks.',
          },
          sortBy: {
            type: 'string',
            enum: ['createdAt', 'updatedAt', 'deadline', 'priority', 'estimateMinutes', 'name'],
            description: 'Sort field (default: createdAt).',
          },
          sortOrder: {
            type: 'string',
            enum: ['asc', 'desc'],
            description: 'Sort direction (default: desc for createdAt/updatedAt/priority/estimateMinutes; asc for deadline/name).',
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
        'List or search all projects in PlannerMate. Returns project metadata, statuses, milestone counts, total task counts, dates, notes, and total logged minutes.',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            description: 'Optional status: Open, Pending, In Progress, Done, Cancelled.',
          },
          search: {
            type: 'string',
            description: 'Optional search keyword to match project name, description, or notes.',
          },
          createdAfter: {
            type: 'string',
            description: 'Optional filter for projects created on or after this date (YYYY-MM-DD).',
          },
          createdBefore: {
            type: 'string',
            description: 'Optional filter for projects created on or before this date (YYYY-MM-DD).',
          },
          deadlineBefore: {
            type: 'string',
            description: 'Optional filter for projects with deadline on or before this date (YYYY-MM-DD).',
          },
          deadlineAfter: {
            type: 'string',
            description: 'Optional filter for projects with deadline on or after this date (YYYY-MM-DD).',
          },
          jiraEpicKey: {
            type: 'string',
            description: 'Optional filter by Jira Epic key.',
          },
          sortBy: {
            type: 'string',
            enum: ['createdAt', 'updatedAt', 'deadline', 'name'],
            description: 'Sort field (default: createdAt).',
          },
          sortOrder: {
            type: 'string',
            enum: ['asc', 'desc'],
            description: 'Sort direction (default: desc for createdAt/updatedAt; asc for deadline/name).',
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
        'List or search milestones in PlannerMate. Returns milestone metadata, parent project name, task counts, dates, notes, and deadlines.',
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
            description: 'Optional search keyword to match milestone name, description, or notes.',
          },
          createdAfter: {
            type: 'string',
            description: 'Optional filter for milestones created on or after this date (YYYY-MM-DD).',
          },
          createdBefore: {
            type: 'string',
            description: 'Optional filter for milestones created on or before this date (YYYY-MM-DD).',
          },
          deadlineBefore: {
            type: 'string',
            description: 'Optional filter for milestones with deadline on or before this date (YYYY-MM-DD).',
          },
          deadlineAfter: {
            type: 'string',
            description: 'Optional filter for milestones with deadline on or after this date (YYYY-MM-DD).',
          },
          sortBy: {
            type: 'string',
            enum: ['createdAt', 'updatedAt', 'deadline', 'name'],
            description: 'Sort field (default: createdAt).',
          },
          sortOrder: {
            type: 'string',
            enum: ['asc', 'desc'],
            description: 'Sort direction (default: desc for createdAt/updatedAt; asc for deadline/name).',
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
        'Query actual worklog sessions and time spent. Can filter by taskId, projectId, date range (startDate to endDate YYYY-MM-DD), search keywords in notes/taskName, or duration. Returns session details and total minutes logged.',
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
          search: {
            type: 'string',
            description: 'Optional search keyword to match work session notes or task name.',
          },
          minDuration: {
            type: 'number',
            description: 'Optional minimum duration in minutes.',
          },
          maxDuration: {
            type: 'number',
            description: 'Optional maximum duration in minutes.',
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
        'Search or list notes and scratchpads. Can search text in title or body, filter by isPinned, filter by entityType (task, project, milestone, or standalone), filter by created/updated dates, or sort results.',
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
          createdAfter: {
            type: 'string',
            description: 'Optional filter for notes created on or after this date (YYYY-MM-DD).',
          },
          createdBefore: {
            type: 'string',
            description: 'Optional filter for notes created on or before this date (YYYY-MM-DD).',
          },
          updatedAfter: {
            type: 'string',
            description: 'Optional filter for notes updated on or after this date (YYYY-MM-DD).',
          },
          updatedBefore: {
            type: 'string',
            description: 'Optional filter for notes updated on or before this date (YYYY-MM-DD).',
          },
          sortBy: {
            type: 'string',
            enum: ['createdAt', 'updatedAt', 'title'],
            description: 'Sort field (default: updatedAt).',
          },
          sortOrder: {
            type: 'string',
            enum: ['asc', 'desc'],
            description: 'Sort direction (default: desc for updatedAt/createdAt; asc for title).',
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
        'List or filter recurring task templates in PlannerMate, including frequency, repeat days of week, intervals, and recurrence end dates.',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            description: 'Optional task status filter: Open, Pending, In Progress, Resolved, In Review, Done, Cancelled.',
          },
          projectId: {
            type: 'string',
            description: 'Optional project UUID to filter recurring tasks for a specific project.',
          },
          recurrenceFrequency: {
            type: 'string',
            enum: ['daily', 'weekly', 'monthly'],
            description: 'Optional recurrence frequency filter: daily, weekly, monthly.',
          },
          search: {
            type: 'string',
            description: 'Optional search keyword to match task name, description, notes, or jiraKey.',
          },
          limit: {
            type: 'number',
            description: 'Max number of recurring tasks to return (default 25, max 50).',
          },
        },
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
  // --- MUTATION TOOLS (Action execution requires user confirmation) ---
  {
    type: 'function',
    function: {
      name: 'create_task',
      description:
        'Create a new task in PlannerMate. Can optionally specify project, milestone, priority, estimate, deadline, work type, notes, dates, owners, and checklist.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Task title or name (required).' },
          description: { type: 'string', description: 'Optional detailed description.' },
          projectId: { type: 'string', description: 'Optional project UUID.' },
          milestoneId: { type: 'string', description: 'Optional milestone UUID.' },
          status: {
            type: 'string',
            enum: ['Open', 'Pending', 'In Progress', 'Resolved', 'In Review', 'Done', 'Cancelled'],
            description: 'Task status (defaults to Open).',
          },
          priority: {
            type: 'string',
            enum: ['Low', 'Medium', 'High', 'Urgent'],
            description: 'Task priority (defaults to Medium).',
          },
          estimateMinutes: { type: 'number', description: 'Estimated duration in minutes (e.g. 60).' },
          deadline: { type: 'string', description: 'Deadline in YYYY-MM-DD format.' },
          notes: { type: 'string', description: 'Optional task notes.' },
          actualStartDate: { type: 'string', description: 'Actual start date in YYYY-MM-DD format.' },
          actualEndDate: { type: 'string', description: 'Actual end date in YYYY-MM-DD format.' },
          opsOwners: { type: 'array', items: { type: 'string' }, description: 'Optional Operations Owners.' },
          businessAnalysts: { type: 'array', items: { type: 'string' }, description: 'Optional Business Analysts.' },
          workType: {
            type: 'string',
            enum: ['code', 'document', 'meeting', 'support_testing', 'investigate', 'configuration', 'review_code'],
            description: 'Type of work (defaults to code).',
          },
          tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags list.' },
          jiraKey: { type: 'string', description: 'Optional Jira issue key (e.g. PROJ-123).' },
          checklist: { type: 'array', items: { type: 'string' }, description: 'Optional checklist item titles.' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_task',
      description:
        'Update fields of an existing task (status, priority, estimate, progress, dates, notes, owners, description, project, milestone).',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'UUID of the task to update (required).' },
          name: { type: 'string', description: 'New task name.' },
          description: { type: 'string', description: 'New description.' },
          status: {
            type: 'string',
            enum: ['Open', 'Pending', 'In Progress', 'Resolved', 'In Review', 'Done', 'Cancelled'],
            description: 'Updated status.',
          },
          priority: {
            type: 'string',
            enum: ['Low', 'Medium', 'High', 'Urgent'],
            description: 'Updated priority.',
          },
          progress: { type: 'number', description: 'Progress percentage (0 - 100).' },
          estimateMinutes: { type: 'number', description: 'Estimated minutes.' },
          deadline: { type: 'string', description: 'Deadline in YYYY-MM-DD format.' },
          notes: { type: 'string', description: 'Task notes.' },
          actualStartDate: { type: 'string', description: 'Actual start date in YYYY-MM-DD format.' },
          actualEndDate: { type: 'string', description: 'Actual end date in YYYY-MM-DD format.' },
          opsOwners: { type: 'array', items: { type: 'string' }, description: 'Operations Owners.' },
          businessAnalysts: { type: 'array', items: { type: 'string' }, description: 'Business Analysts.' },
          projectId: { type: 'string', description: 'Parent project UUID (or null to unassign).' },
          milestoneId: { type: 'string', description: 'Parent milestone UUID (or null to unassign).' },
          workType: {
            type: 'string',
            enum: ['code', 'document', 'meeting', 'support_testing', 'investigate', 'configuration', 'review_code'],
          },
          jiraKey: { type: 'string', description: 'Jira issue key.' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_task_checklist',
      description:
        'Modify task checklist items: add new items, toggle done/undone status, remove an item, or replace entire checklist.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'UUID of the task.' },
          action: {
            type: 'string',
            enum: ['add', 'toggle', 'remove', 'replace_all'],
            description: 'Action to perform on the checklist.',
          },
          checklistItems: {
            type: 'array',
            items: { type: 'string' },
            description: 'Item titles for "add" or "replace_all" actions.',
          },
          itemId: {
            type: 'string',
            description: 'Specific checklist item UUID for "toggle" or "remove" actions.',
          },
        },
        required: ['taskId', 'action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reparent_task',
      description: 'Move a task to a different project or milestone.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'UUID of the task to reparent.' },
          projectId: { type: 'string', description: 'Target project UUID (or null to unassign).' },
          milestoneId: { type: 'string', description: 'Target milestone UUID (or null to unassign).' },
        },
        required: ['taskId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_task',
      description: 'Delete a task and its planned allocations permanently.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'UUID of the task to delete.' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_project',
      description: 'Create a new project in PlannerMate.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Project name (required).' },
          description: { type: 'string', description: 'Project description.' },
          status: {
            type: 'string',
            enum: ['Open', 'Pending', 'In Progress', 'Done', 'Cancelled'],
            description: 'Status (defaults to Open).',
          },
          deadline: { type: 'string', description: 'Target date / deadline in YYYY-MM-DD format.' },
          notes: { type: 'string', description: 'Project notes.' },
          jiraEpicKey: { type: 'string', description: 'Optional Jira Epic key (e.g. PROJ-EPIC-1).' },
          opsOwners: { type: 'array', items: { type: 'string' }, description: 'Optional Operations Owners.' },
          businessAnalysts: { type: 'array', items: { type: 'string' }, description: 'Optional Business Analysts.' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_project',
      description: 'Update project details, status, deadline, notes, owners, or description.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'UUID of the project to update.' },
          name: { type: 'string', description: 'Updated project name.' },
          description: { type: 'string', description: 'Updated description.' },
          status: {
            type: 'string',
            enum: ['Open', 'Pending', 'In Progress', 'Done', 'Cancelled'],
          },
          deadline: { type: 'string', description: 'Deadline in YYYY-MM-DD format.' },
          notes: { type: 'string', description: 'Updated notes.' },
          jiraEpicKey: { type: 'string', description: 'Updated Jira Epic key.' },
          opsOwners: { type: 'array', items: { type: 'string' }, description: 'Operations Owners.' },
          businessAnalysts: { type: 'array', items: { type: 'string' }, description: 'Business Analysts.' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_project',
      description: 'Delete a project and cascade delete all child milestones, tasks, and allocations.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'UUID of the project to delete.' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_milestone',
      description: 'Create a new milestone under an existing project.',
      parameters: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'Parent project UUID (required).' },
          name: { type: 'string', description: 'Milestone name (required).' },
          description: { type: 'string', description: 'Milestone description.' },
          status: {
            type: 'string',
            enum: ['Open', 'Pending', 'In Progress', 'Done', 'Cancelled'],
            description: 'Status (defaults to Open).',
          },
          deadline: { type: 'string', description: 'Target date in YYYY-MM-DD format.' },
          notes: { type: 'string', description: 'Optional milestone notes.' },
          opsOwners: { type: 'array', items: { type: 'string' }, description: 'Optional Operations Owners.' },
          businessAnalysts: { type: 'array', items: { type: 'string' }, description: 'Optional Business Analysts.' },
        },
        required: ['projectId', 'name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_milestone',
      description: 'Update milestone name, description, status, deadline, notes, or owners.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'UUID of the milestone to update.' },
          name: { type: 'string', description: 'New milestone name.' },
          description: { type: 'string', description: 'New description.' },
          status: {
            type: 'string',
            enum: ['Open', 'Pending', 'In Progress', 'Done', 'Cancelled'],
          },
          deadline: { type: 'string', description: 'Deadline in YYYY-MM-DD format.' },
          notes: { type: 'string', description: 'Updated notes.' },
          opsOwners: { type: 'array', items: { type: 'string' }, description: 'Operations Owners.' },
          businessAnalysts: { type: 'array', items: { type: 'string' }, description: 'Business Analysts.' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_milestone',
      description: 'Delete a milestone and cascade delete its child tasks and allocations.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'UUID of the milestone to delete.' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'plan_allocation',
      description: 'Schedule a workload allocation for a task on a specific calendar date.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'UUID of the task.' },
          date: { type: 'string', description: 'Target date in YYYY-MM-DD format.' },
          allocatedMinutes: { type: 'number', description: 'Allocated time in minutes (1 - 1440).' },
        },
        required: ['taskId', 'date', 'allocatedMinutes'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_allocation',
      description: 'Remove scheduled workload allocation for a task on a date.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'UUID of the task.' },
          date: { type: 'string', description: 'Target date in YYYY-MM-DD format.' },
        },
        required: ['taskId', 'date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'log_work_session',
      description: 'Log actual time spent working on a task into work session history.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'UUID of the task.' },
          durationMinutes: { type: 'number', description: 'Actual work duration in minutes (>= 1).' },
          date: { type: 'string', description: 'Date of session (YYYY-MM-DD, defaults to today).' },
          notes: { type: 'string', description: 'Optional work summary or notes.' },
        },
        required: ['taskId', 'durationMinutes'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_work_session',
      description: 'Update duration, date, or notes of an existing work session.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'UUID of the work session.' },
          durationMinutes: { type: 'number', description: 'New duration in minutes.' },
          date: { type: 'string', description: 'New date in YYYY-MM-DD format.' },
          notes: { type: 'string', description: 'Updated notes.' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_work_session',
      description: 'Delete a logged work session permanently.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'UUID of the work session to delete.' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'start_timer',
      description: 'Start live timer tracking for a task.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'UUID of the task to time.' },
        },
        required: ['taskId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pause_timer',
      description: 'Pause a currently running timer for a task.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'UUID of the task whose timer should be paused.' },
        },
        required: ['taskId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'stop_and_log_timer',
      description: 'Stop the active timer for a task, compute elapsed duration, and record a work session log.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'UUID of the task.' },
          notes: { type: 'string', description: 'Optional notes for the logged session.' },
        },
        required: ['taskId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'discard_timer',
      description: 'Cancel and discard an active timer without saving any work session.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'UUID of the task whose timer to discard.' },
        },
        required: ['taskId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_capacity_rule',
      description: 'Update standard daily working capacity rule for a day of week (0=Sunday, 1=Monday, ..., 6=Saturday).',
      parameters: {
        type: 'object',
        properties: {
          dayOfWeek: { type: 'number', description: 'Day of week: 0 to 6.' },
          capacityMinutes: { type: 'number', description: 'Daily capacity in minutes.' },
          isWorkDay: { type: 'boolean', description: 'Whether this day is a designated work day.' },
        },
        required: ['dayOfWeek', 'capacityMinutes'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_capacity_override',
      description: 'Set a specific capacity override for a date (e.g. for leave or overtime).',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Date in YYYY-MM-DD format.' },
          capacityMinutes: { type: 'number', description: 'Capacity in minutes for that date.' },
          reason: { type: 'string', description: 'Reason for override (e.g. Vacation, Holiday).' },
        },
        required: ['date', 'capacityMinutes'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_capacity_override',
      description: 'Remove custom capacity override for a date, reverting back to the standard weekly rule.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Date in YYYY-MM-DD format.' },
        },
        required: ['date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_note',
      description: 'Create a new note or scratchpad, optionally linked to a task, project, or milestone.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Note title.' },
          body: { type: 'string', description: 'Note markdown content (required).' },
          entityType: {
            type: 'string',
            enum: ['task', 'project', 'milestone'],
            description: 'Optional entity type to link note to.',
          },
          entityId: { type: 'string', description: 'UUID of entity to link note to.' },
          isPinned: { type: 'boolean', description: 'Whether note should be pinned.' },
        },
        required: ['body'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_note',
      description: 'Update content, title, or pinned state of an existing note.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'UUID of the note to update.' },
          title: { type: 'string', description: 'Updated title.' },
          body: { type: 'string', description: 'Updated markdown body.' },
          isPinned: { type: 'boolean', description: 'Updated pinned state.' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_note',
      description: 'Delete a note permanently.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'UUID of the note to delete.' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description:
        'Read a slice of a local file referenced in the conversation or attached to a task/project. Returns line-numbered content (`cat -n` format), lines read, and whether the file was truncated. Use offset and limit to page through large files.',
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'The local path of the file to read (supports absolute paths, relative paths, and ~).',
          },
          offset: {
            type: 'number',
            description: 'The line number to start reading from (1-based, default: 1).',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of lines to read (default: 500, max: 2000).',
          },
        },
        required: ['filePath'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_knowledge_base',
      description:
        'Search offline knowledge base documents using lexical BM25 ranking. Supports query keywords, optional tag filtering, and returns relevant snippet extracts.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search keywords, topic, or question to find in documents.',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional array of tags to filter documents.',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of documents to return (default 5, max 10).',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_document_details',
      description:
        'Retrieve full content, tags, metadata, and attachment IDs of a document from the knowledge base by document UUID.',
      parameters: {
        type: 'object',
        properties: {
          documentId: {
            type: 'string',
            description: 'UUID of the document/note to inspect.',
          },
        },
        required: ['documentId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_file',
      description:
        'Generate and trigger immediate browser download of a file in specified format (Markdown .md, plain text .txt, Word .docx, Excel .xlsx, CSV .csv, or PowerPoint .pptx). Useful when the user asks to export or save a document, report, table, summary, or spreadsheet to a file.',
      parameters: {
        type: 'object',
        properties: {
          filename: {
            type: 'string',
            description: 'Name of the file to create (e.g. "report.docx", "tasks.xlsx", "presentation.pptx", "notes.md", "data.csv").',
          },
          format: {
            type: 'string',
            enum: ['md', 'txt', 'docx', 'xlsx', 'csv', 'pptx'],
            description: 'Optional format: md, txt, docx, xlsx, csv, or pptx. If omitted, inferred from filename extension.',
          },
          content: {
            type: 'string',
            description: 'The full document content, report, markdown text, or tabular data to include in the file.',
          },
          title: {
            type: 'string',
            description: 'Optional title or header for the document.',
          },
        },
        required: ['filename', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_pptx',
      description:
        'Generate and trigger immediate browser download of a PowerPoint presentation (.pptx). Accepts markdown content or structured slides with titles, bullet points, and speaker notes.',
      parameters: {
        type: 'object',
        properties: {
          filename: {
            type: 'string',
            description: 'Name of the presentation file (e.g. "q3-roadmap.pptx").',
          },
          presentationTitle: {
            type: 'string',
            description: 'Title for the presentation cover slide.',
          },
          slides: {
            type: 'array',
            description: 'Array of structured slides.',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Slide title' },
                subtitle: { type: 'string', description: 'Slide subtitle or topic' },
                bullets: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Bullet points on the slide',
                },
                notes: { type: 'string', description: 'Speaker notes for the presenter' },
                layout: {
                  type: 'string',
                  enum: ['title', 'content', 'section'],
                  description: 'Slide layout style',
                },
              },
            },
          },
          markdownContent: {
            type: 'string',
            description: 'Alternative raw markdown text with # titles, ## slides, and bullet lists to convert into slides.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_image',
      description:
        'Generate an image based on a descriptive text prompt using an OpenAI-compatible image model (e.g. DALL-E 3, Flux, Stable Diffusion). Returns the generated image data URL and markdown embed to display directly in the conversation.',
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Detailed description of the image to generate.',
          },
          size: {
            type: 'string',
            enum: ['1024x1024', '512x512', '256x256'],
            description: 'Image dimensions (default: 1024x1024).',
          },
          style: {
            type: 'string',
            enum: ['vivid', 'natural'],
            description: 'Style of image: vivid or natural (for DALL-E 3).',
          },
          saveToDocId: {
            type: 'string',
            description: 'Optional document UUID to attach this generated image to in the knowledge base.',
          },
        },
        required: ['prompt'],
      },
    },
  },
];

export async function executeAiTool(
  toolName: string,
  args: Record<string, any>,
  db: TaskPlannerDatabase
): Promise<string> {
  const normalized = normalizeToolName(toolName);
  try {
    switch (normalized) {
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

        // Entity / Status / Priority / WorkType / Recurrence filters
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
        if (args.workType) {
          tasks = tasks.filter(
            (t) => t.workType?.toLowerCase() === String(args.workType).toLowerCase()
          );
        }
        if (typeof args.isRecurring === 'boolean') {
          tasks = tasks.filter((t) => Boolean(t.isRecurring) === args.isRecurring);
        }
        if (typeof args.hasDeadline === 'boolean') {
          tasks = tasks.filter((t) => (args.hasDeadline ? Boolean(t.deadline) : !t.deadline));
        }

        // Date filters
        if (args.createdAt) {
          const target = String(args.createdAt).slice(0, 10);
          tasks = tasks.filter((t) => (t.createdAt || '').slice(0, 10) === target);
        }
        if (args.createdAfter) {
          const boundary = String(args.createdAfter).slice(0, 10);
          tasks = tasks.filter((t) => (t.createdAt || '').slice(0, 10) >= boundary);
        }
        if (args.createdBefore) {
          const boundary = String(args.createdBefore).slice(0, 10);
          tasks = tasks.filter((t) => (t.createdAt || '').slice(0, 10) <= boundary);
        }
        if (args.updatedAfter) {
          const boundary = String(args.updatedAfter).slice(0, 10);
          tasks = tasks.filter((t) => (t.updatedAt || '').slice(0, 10) >= boundary);
        }
        if (args.updatedBefore) {
          const boundary = String(args.updatedBefore).slice(0, 10);
          tasks = tasks.filter((t) => (t.updatedAt || '').slice(0, 10) <= boundary);
        }
        if (args.deadline) {
          tasks = tasks.filter((t) => t.deadline === args.deadline);
        }
        if (args.deadlineBefore) {
          tasks = tasks.filter((t) => t.deadline && t.deadline <= args.deadlineBefore);
        }
        if (args.deadlineAfter) {
          tasks = tasks.filter((t) => t.deadline && t.deadline >= args.deadlineAfter);
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

        // Sorting
        const sortBy = args.sortBy || 'createdAt';
        const sortOrder = args.sortOrder || (sortBy === 'deadline' || sortBy === 'name' ? 'asc' : 'desc');
        const isAsc = sortOrder.toLowerCase() === 'asc';

        tasks.sort((a, b) => {
          let cmp = 0;
          if (sortBy === 'createdAt') {
            cmp = (a.createdAt || '').localeCompare(b.createdAt || '');
          } else if (sortBy === 'updatedAt') {
            cmp = (a.updatedAt || '').localeCompare(b.updatedAt || '');
          } else if (sortBy === 'deadline') {
            if (!a.deadline && !b.deadline) cmp = 0;
            else if (!a.deadline) return 1;
            else if (!b.deadline) return -1;
            else cmp = a.deadline.localeCompare(b.deadline);
          } else if (sortBy === 'priority') {
            const weights: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 };
            const wa = weights[a.priority.toLowerCase()] || 0;
            const wb = weights[b.priority.toLowerCase()] || 0;
            cmp = wa - wb;
          } else if (sortBy === 'estimateMinutes') {
            cmp = (a.estimateMinutes || 0) - (b.estimateMinutes || 0);
          } else if (sortBy === 'name') {
            cmp = a.name.localeCompare(b.name);
          }
          return isAsc ? cmp : -cmp;
        });

        const totalCount = tasks.length;
        const limit = Math.min(Math.max(1, Number(args.limit) || 25), 50);
        const subset = tasks.slice(0, limit).map((t) => {
          const p = t.projectId ? projectMap.get(t.projectId) : undefined;
          const m = t.milestoneId ? milestoneMap.get(t.milestoneId) : undefined;
          return {
            id: t.id,
            name: t.name,
            description: t.description ?? null,
            notes: t.notes ?? null,
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
            reminderDate: t.reminderDate ?? null,
            reminderNote: t.reminderNote ?? null,
            remindersCount: t.reminders?.length ?? 0,
            opsOwners: t.opsOwners ?? [],
            businessAnalysts: t.businessAnalysts ?? [],
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
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
        if (args.createdAfter) {
          const boundary = String(args.createdAfter).slice(0, 10);
          projects = projects.filter((p) => (p.createdAt || '').slice(0, 10) >= boundary);
        }
        if (args.createdBefore) {
          const boundary = String(args.createdBefore).slice(0, 10);
          projects = projects.filter((p) => (p.createdAt || '').slice(0, 10) <= boundary);
        }
        if (args.deadlineBefore) {
          projects = projects.filter((p) => p.deadline && p.deadline <= args.deadlineBefore);
        }
        if (args.deadlineAfter) {
          projects = projects.filter((p) => p.deadline && p.deadline >= args.deadlineAfter);
        }
        if (args.jiraEpicKey) {
          const q = String(args.jiraEpicKey).toLowerCase();
          projects = projects.filter((p) => p.jiraEpicKey && p.jiraEpicKey.toLowerCase().includes(q));
        }
        if (args.search) {
          const q = String(args.search).toLowerCase();
          projects = projects.filter(
            (p) =>
              p.name.toLowerCase().includes(q) ||
              (p.description && p.description.toLowerCase().includes(q)) ||
              (p.notes && p.notes.toLowerCase().includes(q)) ||
              (p.jiraEpicKey && p.jiraEpicKey.toLowerCase().includes(q))
          );
        }

        // Sorting
        const sortBy = args.sortBy || 'createdAt';
        const sortOrder = args.sortOrder || (sortBy === 'deadline' || sortBy === 'name' ? 'asc' : 'desc');
        const isAsc = sortOrder.toLowerCase() === 'asc';

        projects.sort((a, b) => {
          let cmp = 0;
          if (sortBy === 'createdAt') {
            cmp = (a.createdAt || '').localeCompare(b.createdAt || '');
          } else if (sortBy === 'updatedAt') {
            cmp = (a.updatedAt || '').localeCompare(b.updatedAt || '');
          } else if (sortBy === 'deadline') {
            if (!a.deadline && !b.deadline) cmp = 0;
            else if (!a.deadline) return 1;
            else if (!b.deadline) return -1;
            else cmp = a.deadline.localeCompare(b.deadline);
          } else if (sortBy === 'name') {
            cmp = a.name.localeCompare(b.name);
          }
          return isAsc ? cmp : -cmp;
        });

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
            notes: p.notes ?? null,
            opsOwners: p.opsOwners ?? [],
            businessAnalysts: p.businessAnalysts ?? [],
            reminderDate: p.reminderDate ?? null,
            reminderNote: p.reminderNote ?? null,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
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
        if (args.createdAfter) {
          const boundary = String(args.createdAfter).slice(0, 10);
          milestones = milestones.filter((m) => (m.createdAt || '').slice(0, 10) >= boundary);
        }
        if (args.createdBefore) {
          const boundary = String(args.createdBefore).slice(0, 10);
          milestones = milestones.filter((m) => (m.createdAt || '').slice(0, 10) <= boundary);
        }
        if (args.deadlineBefore) {
          milestones = milestones.filter((m) => m.deadline && m.deadline <= args.deadlineBefore);
        }
        if (args.deadlineAfter) {
          milestones = milestones.filter((m) => m.deadline && m.deadline >= args.deadlineAfter);
        }
        if (args.search) {
          const q = String(args.search).toLowerCase();
          milestones = milestones.filter(
            (m) =>
              m.name.toLowerCase().includes(q) ||
              (m.description && m.description.toLowerCase().includes(q)) ||
              (m.notes && m.notes.toLowerCase().includes(q))
          );
        }

        // Sorting
        const sortBy = args.sortBy || 'createdAt';
        const sortOrder = args.sortOrder || (sortBy === 'deadline' || sortBy === 'name' ? 'asc' : 'desc');
        const isAsc = sortOrder.toLowerCase() === 'asc';

        milestones.sort((a, b) => {
          let cmp = 0;
          if (sortBy === 'createdAt') {
            cmp = (a.createdAt || '').localeCompare(b.createdAt || '');
          } else if (sortBy === 'updatedAt') {
            cmp = (a.updatedAt || '').localeCompare(b.updatedAt || '');
          } else if (sortBy === 'deadline') {
            if (!a.deadline && !b.deadline) cmp = 0;
            else if (!a.deadline) return 1;
            else if (!b.deadline) return -1;
            else cmp = a.deadline.localeCompare(b.deadline);
          } else if (sortBy === 'name') {
            cmp = a.name.localeCompare(b.name);
          }
          return isAsc ? cmp : -cmp;
        });

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
            notes: m.notes ?? null,
            opsOwners: m.opsOwners ?? [],
            businessAnalysts: m.businessAnalysts ?? [],
            reminderDate: m.reminderDate ?? null,
            reminderNote: m.reminderNote ?? null,
            createdAt: m.createdAt,
            updatedAt: m.updatedAt,
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
        if (args.search) {
          const q = String(args.search).toLowerCase();
          sessions = sessions.filter((s) => {
            const taskName = taskMap.get(s.taskId)?.name?.toLowerCase() || '';
            const note = s.note?.toLowerCase() || '';
            return taskName.includes(q) || note.includes(q);
          });
        }
        if (typeof args.minDuration === 'number') {
          sessions = sessions.filter((s) => (s.durationMinutes || 0) >= args.minDuration);
        }
        if (typeof args.maxDuration === 'number') {
          sessions = sessions.filter((s) => (s.durationMinutes || 0) <= args.maxDuration);
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
          createdAt: s.createdAt,
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
        if (args.createdAfter) {
          const boundary = String(args.createdAfter).slice(0, 10);
          notes = notes.filter((n) => (n.createdAt || '').slice(0, 10) >= boundary);
        }
        if (args.createdBefore) {
          const boundary = String(args.createdBefore).slice(0, 10);
          notes = notes.filter((n) => (n.createdAt || '').slice(0, 10) <= boundary);
        }
        if (args.updatedAfter) {
          const boundary = String(args.updatedAfter).slice(0, 10);
          notes = notes.filter((n) => (n.updatedAt || '').slice(0, 10) >= boundary);
        }
        if (args.updatedBefore) {
          const boundary = String(args.updatedBefore).slice(0, 10);
          notes = notes.filter((n) => (n.updatedAt || '').slice(0, 10) <= boundary);
        }
        if (args.search) {
          const q = String(args.search).toLowerCase();
          notes = notes.filter(
            (n) =>
              (n.title && n.title.toLowerCase().includes(q)) ||
              (n.body && n.body.toLowerCase().includes(q))
          );
        }

        // Sorting: pinned first, then by field
        const sortBy = args.sortBy || 'updatedAt';
        const sortOrder = args.sortOrder || (sortBy === 'title' ? 'asc' : 'desc');
        const isAsc = sortOrder.toLowerCase() === 'asc';

        notes.sort((a, b) => {
          if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
          let cmp = 0;
          if (sortBy === 'createdAt') {
            cmp = (a.createdAt || '').localeCompare(b.createdAt || '');
          } else if (sortBy === 'updatedAt') {
            cmp = (a.updatedAt || '').localeCompare(b.updatedAt || '');
          } else if (sortBy === 'title') {
            cmp = (a.title || '').localeCompare(b.title || '');
          }
          return isAsc ? cmp : -cmp;
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
        let recurring = (await db.tasks.toArray()).filter((t) => t.isRecurring);

        if (args.status) {
          recurring = recurring.filter(
            (t) => t.status.toLowerCase() === String(args.status).toLowerCase()
          );
        }
        if (args.projectId) {
          recurring = recurring.filter((t) => t.projectId === args.projectId);
        }
        if (args.recurrenceFrequency) {
          recurring = recurring.filter(
            (t) => t.recurrenceFrequency?.toLowerCase() === String(args.recurrenceFrequency).toLowerCase()
          );
        }
        if (args.search) {
          const q = String(args.search).toLowerCase();
          recurring = recurring.filter(
            (t) =>
              t.name.toLowerCase().includes(q) ||
              (t.description && t.description.toLowerCase().includes(q)) ||
              (t.notes && t.notes.toLowerCase().includes(q)) ||
              (t.jiraKey && t.jiraKey.toLowerCase().includes(q))
          );
        }

        const limit = Math.min(Math.max(1, Number(args.limit) || 25), 50);
        const subset = recurring.slice(0, limit);

        return JSON.stringify({
          totalCount: recurring.length,
          returnedCount: subset.length,
          recurringTasks: subset.map((t) => ({
            id: t.id,
            name: t.name,
            description: t.description ?? null,
            notes: t.notes ?? null,
            status: t.status,
            priority: t.priority,
            estimateMinutes: t.estimateMinutes,
            deadline: t.deadline ?? null,
            workType: t.workType ?? null,
            recurrenceFrequency: t.recurrenceFrequency ?? null,
            recurrenceInterval: t.recurrenceInterval ?? 1,
            recurrenceDaysOfWeek: t.recurrenceDaysOfWeek ?? [],
            recurrenceEndDate: t.recurrenceEndDate ?? null,
            parentRecurringTaskId: t.parentRecurringTaskId ?? null,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
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

      case 'read_file': {
        const rawPath = args.filePath || args.file_path || args.path;
        if (!rawPath || typeof rawPath !== 'string') {
          return JSON.stringify({ error: 'filePath parameter is required.' });
        }
        const offset = typeof args.offset === 'number' ? Math.max(1, Math.floor(args.offset)) : 1;
        const limit =
          typeof args.limit === 'number' ? Math.min(2000, Math.max(1, Math.floor(args.limit))) : 500;

        try {
          if (!isTauriApp()) {
            return JSON.stringify({
              error:
                'Local file reading is only supported in Tauri desktop app due to browser security sandbox.',
              filePath: rawPath,
            });
          }

          const api = await import('@tauri-apps/api/core');
          const result = await api.invoke<any>('read_local_file_slice', {
            filePath: rawPath,
            offset,
            limit,
          });

          return JSON.stringify({
            filePath: result.filePath,
            offset: result.offset,
            linesRead: result.linesRead,
            totalLinesEstimated: result.totalLinesEst,
            truncated: result.truncated,
            isBinary: result.isBinary,
            content: result.content,
            note: result.isBinary
              ? 'This is a binary file; text contents cannot be displayed.'
              : result.truncated
              ? `Showing lines ${result.offset} to ${result.offset + result.linesRead - 1}. Truncated. To read next chunk, call read_file with offset: ${result.offset + result.linesRead}.`
              : `Showing lines ${result.offset} to ${result.offset + result.linesRead - 1}. End of file.`,
          });
        } catch (err: any) {
          return JSON.stringify({
            error: `Failed to read file '${rawPath}': ${err?.message || String(err)}`,
            filePath: rawPath,
          });
        }
      }

      // --- MUTATION IMPLEMENTATIONS ---
      case 'create_task': {
        const checklistItems = Array.isArray(args.checklist)
          ? args.checklist.map((itemText: string) => ({
              id: crypto.randomUUID(),
              text: String(itemText),
              done: false,
            }))
          : undefined;

        const task = await createTask(
          {
            name: args.name,
            description: args.description,
            projectId: args.projectId,
            milestoneId: args.milestoneId,
            status: args.status || 'Open',
            priority: args.priority || 'Medium',
            estimateMinutes: typeof args.estimateMinutes === 'number' ? args.estimateMinutes : 0,
            deadline: args.deadline,
            notes: args.notes,
            actualStartDate: args.actualStartDate,
            actualEndDate: args.actualEndDate,
            workType: args.workType || 'code',
            opsOwners: args.opsOwners || args.tags,
            businessAnalysts: args.businessAnalysts,
            jiraKey: args.jiraKey,
            checklist: checklistItems,
          },
          db
        );
        return JSON.stringify({
          success: true,
          message: `Đã tạo tác vụ "${task.name}" thành công.`,
          task: { id: task.id, name: task.name, status: task.status, priority: task.priority },
        });
      }

      case 'update_task': {
        if (!args.id) return JSON.stringify({ error: 'Task ID is required' });
        const patch: any = {};
        if (args.name !== undefined) patch.name = args.name;
        if (args.description !== undefined) patch.description = args.description;
        if (args.status !== undefined) patch.status = args.status;
        if (args.priority !== undefined) patch.priority = args.priority;
        if (args.progress !== undefined) patch.progress = Number(args.progress);
        if (args.estimateMinutes !== undefined) patch.estimateMinutes = Number(args.estimateMinutes);
        if (args.deadline !== undefined) patch.deadline = args.deadline;
        if (args.notes !== undefined) patch.notes = args.notes;
        if (args.actualStartDate !== undefined) patch.actualStartDate = args.actualStartDate;
        if (args.actualEndDate !== undefined) patch.actualEndDate = args.actualEndDate;
        if (args.opsOwners !== undefined) patch.opsOwners = args.opsOwners;
        if (args.businessAnalysts !== undefined) patch.businessAnalysts = args.businessAnalysts;
        if (args.projectId !== undefined) patch.projectId = args.projectId;
        if (args.milestoneId !== undefined) patch.milestoneId = args.milestoneId;
        if (args.workType !== undefined) patch.workType = args.workType;
        if (args.jiraKey !== undefined) patch.jiraKey = args.jiraKey;

        await updateTask(args.id, patch, db);
        return JSON.stringify({
          success: true,
          message: `Đã cập nhật tác vụ (${args.id}) thành công.`,
          updatedFields: Object.keys(patch),
        });
      }

      case 'update_task_checklist': {
        if (!args.taskId) return JSON.stringify({ error: 'taskId is required' });
        const task = await db.tasks.get(args.taskId);
        if (!task) return JSON.stringify({ error: `Không tìm thấy tác vụ: ${args.taskId}` });
        const checklist = [...(task.checklist || [])];

        if (args.action === 'add') {
          const rawItems = args.checklistItems ?? args.items;
          const itemsToAdd = Array.isArray(rawItems) ? rawItems : [args.item || 'Mục mới'];
          for (const it of itemsToAdd) {
            checklist.push({ id: crypto.randomUUID(), text: String(it), done: false });
          }
        } else if (args.action === 'toggle') {
          const item = checklist.find((c) => c.id === args.itemId || c.text === args.itemId);
          if (item) item.done = !item.done;
        } else if (args.action === 'remove') {
          const idx = checklist.findIndex((c) => c.id === args.itemId || c.text === args.itemId);
          if (idx !== -1) checklist.splice(idx, 1);
        } else if (args.action === 'replace_all') {
          checklist.length = 0;
          const rawItems = args.checklistItems ?? args.items;
          if (Array.isArray(rawItems)) {
            for (const it of rawItems) {
              checklist.push({ id: crypto.randomUUID(), text: String(it), done: false });
            }
          }
        }

        await updateTask(task.id, { checklist }, db);
        return JSON.stringify({
          success: true,
          message: `Đã cập nhật checklist của tác vụ "${task.name}".`,
          totalChecklistItems: checklist.length,
        });
      }

      case 'reparent_task': {
        if (!args.taskId) return JSON.stringify({ error: 'taskId is required' });
        await reparentTask(args.taskId, args.projectId ?? null, args.milestoneId ?? null, db);
        return JSON.stringify({
          success: true,
          message: `Đã di chuyển tác vụ (${args.taskId}) sang dự án/mốc mới.`,
        });
      }

      case 'delete_task': {
        if (!args.id) return JSON.stringify({ error: 'Task ID is required' });
        await deleteTaskWithAllocations(args.id, db);
        return JSON.stringify({
          success: true,
          message: `Đã xóa tác vụ (${args.id}) và các phân bổ kế hoạch liên quan.`,
        });
      }

      case 'create_project': {
        const project = await createProject(
          {
            name: args.name,
            description: args.description,
            status: args.status || 'Open',
            deadline: args.deadline,
            notes: args.notes,
            jiraEpicKey: args.jiraEpicKey,
            opsOwners: args.opsOwners,
            businessAnalysts: args.businessAnalysts,
          },
          db
        );
        return JSON.stringify({
          success: true,
          message: `Đã tạo dự án "${project.name}" thành công.`,
          project: { id: project.id, name: project.name, status: project.status },
        });
      }

      case 'update_project': {
        if (!args.id) return JSON.stringify({ error: 'Project ID is required' });
        const patch: any = {};
        if (args.name !== undefined) patch.name = args.name;
        if (args.description !== undefined) patch.description = args.description;
        if (args.status !== undefined) patch.status = args.status;
        if (args.deadline !== undefined) patch.deadline = args.deadline;
        if (args.notes !== undefined) patch.notes = args.notes;
        if (args.jiraEpicKey !== undefined) patch.jiraEpicKey = args.jiraEpicKey;
        if (args.opsOwners !== undefined) patch.opsOwners = args.opsOwners;
        if (args.businessAnalysts !== undefined) patch.businessAnalysts = args.businessAnalysts;

        await updateProject(args.id, patch, db);
        return JSON.stringify({
          success: true,
          message: `Đã cập nhật dự án (${args.id}) thành công.`,
          updatedFields: Object.keys(patch),
        });
      }

      case 'delete_project': {
        if (!args.id) return JSON.stringify({ error: 'Project ID is required' });
        await deleteProjectWithCascade(args.id, 'cascade', db);
        return JSON.stringify({
          success: true,
          message: `Đã xóa dự án (${args.id}) và tất cả mốc, tác vụ con liên quan.`,
        });
      }

      case 'create_milestone': {
        const milestone = await createMilestone(
          {
            projectId: args.projectId,
            name: args.name,
            description: args.description,
            status: args.status || 'Open',
            deadline: args.deadline,
            notes: args.notes,
            opsOwners: args.opsOwners,
            businessAnalysts: args.businessAnalysts,
          },
          db
        );
        return JSON.stringify({
          success: true,
          message: `Đã tạo mốc "${milestone.name}" thành công.`,
          milestone: { id: milestone.id, name: milestone.name, status: milestone.status },
        });
      }

      case 'update_milestone': {
        if (!args.id) return JSON.stringify({ error: 'Milestone ID is required' });
        const patch: any = {};
        if (args.name !== undefined) patch.name = args.name;
        if (args.description !== undefined) patch.description = args.description;
        if (args.status !== undefined) patch.status = args.status;
        if (args.deadline !== undefined) patch.deadline = args.deadline;
        if (args.notes !== undefined) patch.notes = args.notes;
        if (args.opsOwners !== undefined) patch.opsOwners = args.opsOwners;
        if (args.businessAnalysts !== undefined) patch.businessAnalysts = args.businessAnalysts;

        await updateMilestone(args.id, patch, db);
        return JSON.stringify({
          success: true,
          message: `Đã cập nhật mốc (${args.id}) thành công.`,
          updatedFields: Object.keys(patch),
        });
      }

      case 'delete_milestone': {
        if (!args.id) return JSON.stringify({ error: 'Milestone ID is required' });
        await deleteMilestoneWithCascade(args.id, 'cascade', db);
        return JSON.stringify({
          success: true,
          message: `Đã xóa mốc (${args.id}) và tất cả tác vụ con liên quan.`,
        });
      }

      case 'plan_allocation': {
        if (!args.taskId || !args.date || typeof args.allocatedMinutes !== 'number') {
          return JSON.stringify({ error: 'taskId, date, and allocatedMinutes are required' });
        }
        const allocation = await upsertAllocation(args.taskId, args.date, Number(args.allocatedMinutes), db);
        return JSON.stringify({
          success: true,
          message: `Đã lên lịch phân bổ ${args.allocatedMinutes} phút ngày ${args.date}.`,
          allocation,
        });
      }

      case 'delete_allocation': {
        if (args.id) {
          await deleteAllocation(args.id, db);
          return JSON.stringify({
            success: true,
            message: `Đã xóa phân bổ kế hoạch (${args.id}).`,
          });
        }
        if (!args.taskId || !args.date) {
          return JSON.stringify({ error: 'taskId and date are required' });
        }
        const existing = await db.plannedAllocations
          .where('taskId')
          .equals(args.taskId)
          .filter((a) => a.date === args.date)
          .first();
        if (existing) {
          await deleteAllocation(existing.id, db);
        }
        return JSON.stringify({
          success: true,
          message: `Đã xóa phân bổ kế hoạch ngày ${args.date}.`,
        });
      }

      case 'log_work_session': {
        if (!args.taskId || typeof args.durationMinutes !== 'number') {
          return JSON.stringify({ error: 'taskId and durationMinutes are required' });
        }
        const targetDate = args.date || getTodayDateString();
        const startTime = dayjs(targetDate).hour(9).minute(0).toISOString();
        const endTime = dayjs(startTime).add(Number(args.durationMinutes), 'minute').toISOString();
        const session = await createWorkSession(
          {
            taskId: args.taskId,
            startTime,
            endTime,
            durationMinutes: Math.max(1, Number(args.durationMinutes)),
            note: args.notes || args.note,
          },
          db
        );
        return JSON.stringify({
          success: true,
          message: `Đã ghi nhận ${args.durationMinutes} phút vào nhật ký công việc.`,
          sessionId: session.id,
        });
      }

      case 'update_work_session': {
        if (!args.id) return JSON.stringify({ error: 'Session ID is required' });
        const patch: any = {};
        if (args.durationMinutes !== undefined) patch.durationMinutes = Number(args.durationMinutes);
        if (args.notes !== undefined) patch.note = args.notes;
        if (args.date !== undefined) {
          patch.date = args.date;
          patch.startTime = dayjs(args.date).hour(9).minute(0).toISOString();
        }
        await updateWorkSession(args.id, patch, db);
        return JSON.stringify({
          success: true,
          message: `Đã cập nhật phiên làm việc (${args.id}).`,
        });
      }

      case 'delete_work_session': {
        if (!args.id) return JSON.stringify({ error: 'Session ID is required' });
        await deleteWorkSession(args.id, db);
        return JSON.stringify({
          success: true,
          message: `Đã xóa phiên làm việc (${args.id}).`,
        });
      }

      case 'start_timer': {
        if (!args.taskId) return JSON.stringify({ error: 'taskId is required' });
        const task = await db.tasks.get(args.taskId);
        if (!task) return JSON.stringify({ error: `Không tìm thấy tác vụ: ${args.taskId}` });

        const nowMs = Date.now();
        const nowIso = new Date(nowMs).toISOString();
        const existing = await db.activeTimers.get(args.taskId);

        if (existing) {
          if (existing.status === 'running') {
            return JSON.stringify({
              success: true,
              message: `Bộ đếm giờ cho "${task.name}" đang chạy rồi.`,
            });
          }
          const updatedSegments = [...(existing.segments || []), { startTime: nowIso }];
          const updated: ActiveTimer = {
            ...existing,
            status: 'running',
            startedAt: nowMs,
            segments: updatedSegments,
          };
          await db.activeTimers.put(updated);
          return JSON.stringify({
            success: true,
            message: `Đã tiếp tục bộ đếm giờ cho "${task.name}".`,
          });
        }

        const newTimer: ActiveTimer = {
          taskId: args.taskId,
          status: 'running',
          startedAt: nowMs,
          accumulatedMs: 0,
          sessionStartTime: nowIso,
          segments: [{ startTime: nowIso }],
        };
        await db.activeTimers.put(newTimer);
        return JSON.stringify({
          success: true,
          message: `Đã bắt đầu bộ đếm giờ cho "${task.name}".`,
        });
      }

      case 'pause_timer': {
        if (!args.taskId) return JSON.stringify({ error: 'taskId is required' });
        const existing = await db.activeTimers.get(args.taskId);
        if (!existing || existing.status !== 'running') {
          return JSON.stringify({ error: `Không có bộ đếm đang chạy cho tác vụ: ${args.taskId}` });
        }
        const nowMs = Date.now();
        const nowIso = new Date(nowMs).toISOString();
        const delta = Math.max(0, nowMs - existing.startedAt);
        const updatedSegments = [...(existing.segments || [])];
        if (updatedSegments.length > 0 && !updatedSegments[updatedSegments.length - 1]?.endTime) {
          updatedSegments[updatedSegments.length - 1] = {
            ...updatedSegments[updatedSegments.length - 1]!,
            endTime: nowIso,
          };
        }
        const updated: ActiveTimer = {
          ...existing,
          status: 'paused',
          accumulatedMs: (existing.accumulatedMs || 0) + delta,
          startedAt: nowMs,
          segments: updatedSegments,
        };
        await db.activeTimers.put(updated);
        return JSON.stringify({
          success: true,
          message: `Đã tạm dừng bộ đếm giờ cho tác vụ (${args.taskId}).`,
        });
      }

      case 'stop_and_log_timer': {
        if (!args.taskId) return JSON.stringify({ error: 'taskId is required' });
        const existing = await db.activeTimers.get(args.taskId);
        if (!existing) {
          return JSON.stringify({ error: `Không tìm thấy bộ đếm hoạt động cho tác vụ: ${args.taskId}` });
        }
        const nowMs = Date.now();
        const nowIso = new Date(nowMs).toISOString();
        let totalMs = existing.accumulatedMs || 0;
        if (existing.status === 'running') {
          totalMs += Math.max(0, nowMs - existing.startedAt);
        }
        const durationMinutes = Math.max(1, Math.round(totalMs / 60000));
        const session = await createWorkSession(
          {
            taskId: existing.taskId,
            startTime: existing.sessionStartTime || nowIso,
            endTime: nowIso,
            durationMinutes,
            segments: existing.segments,
            note: args.notes || args.note || 'AI Auto-logged Work Session',
          },
          db
        );
        await db.activeTimers.delete(existing.taskId);
        return JSON.stringify({
          success: true,
          message: `Đã dừng bộ đếm giờ và ghi nhận ${durationMinutes} phút vào nhật ký.`,
          durationMinutes,
          sessionId: session.id,
        });
      }

      case 'discard_timer': {
        if (!args.taskId) return JSON.stringify({ error: 'taskId is required' });
        await db.activeTimers.delete(args.taskId);
        return JSON.stringify({
          success: true,
          message: `Đã hủy bỏ bộ đếm giờ của tác vụ (${args.taskId}).`,
        });
      }

      case 'update_capacity_rule': {
        await updateCapacityRule(Number(args.dayOfWeek), Number(args.capacityMinutes), db);
        return JSON.stringify({
          success: true,
          message: `Đã cập nhật quy tắc năng lực thứ ${args.dayOfWeek}: ${args.capacityMinutes} phút.`,
        });
      }

      case 'set_capacity_override': {
        await setCapacityOverride(args.date, Number(args.capacityMinutes), args.reason, db);
        return JSON.stringify({
          success: true,
          message: `Đã đặt năng lực ngày ${args.date}: ${args.capacityMinutes} phút.`,
        });
      }

      case 'remove_capacity_override': {
        await removeCapacityOverride(args.date, db);
        return JSON.stringify({
          success: true,
          message: `Đã xóa tùy chỉnh năng lực ngày ${args.date}.`,
        });
      }

      case 'create_note': {
        const note = await createNote(
          {
            title: args.title,
            body: args.body,
            entityType: args.entityType,
            entityId: args.entityId,
            isPinned: Boolean(args.isPinned),
          },
          db
        );
        return JSON.stringify({
          success: true,
          message: `Đã tạo ghi chú thành công.`,
          noteId: note.id,
        });
      }

      case 'update_note': {
        if (!args.id) return JSON.stringify({ error: 'Note ID is required' });
        const patch: any = {};
        if (args.title !== undefined) patch.title = args.title;
        if (args.body !== undefined) patch.body = args.body;
        if (args.isPinned !== undefined) patch.isPinned = Boolean(args.isPinned);

        await updateNote(args.id, patch, db);
        return JSON.stringify({
          success: true,
          message: `Đã cập nhật ghi chú (${args.id}).`,
        });
      }

      case 'delete_note': {
        if (!args.id) return JSON.stringify({ error: 'Note ID is required' });
        await deleteNote(args.id, db);
        return JSON.stringify({
          success: true,
          message: `Đã xóa ghi chú (${args.id}).`,
        });
      }

      case 'search_knowledge_base': {
        if (!db.notes) return JSON.stringify({ error: 'Notes table unavailable' });
        if (!args.query || typeof args.query !== 'string') {
          return JSON.stringify({ error: 'query string parameter is required' });
        }

        let docs = await db.notes
          .filter((n: Note) => !n.deletedAt && (n.type === 'document' || !n.type))
          .toArray();

        // Optional tags filter
        if (Array.isArray(args.tags) && args.tags.length > 0) {
          const filterTags = new Set((args.tags as string[]).map((t) => t.toLowerCase().trim()));
          docs = docs.filter((d: Note) =>
            d.tags?.some((t) => filterTags.has(t.toLowerCase().trim()))
          );
        }

        const limit = Math.min(Math.max(1, Number(args.limit) || 5), 10);
        const bm25Docs = docs.map((d: Note) => ({
          id: d.id,
          title: d.title || '',
          tags: d.tags || [],
          body: d.body || '',
          updatedAt: d.updatedAt,
        }));

        const scoredResults = rankBM25(args.query, bm25Docs, { limit });
        const results = scoredResults.map((sr) => ({
          id: sr.doc.id,
          title: sr.doc.title,
          tags: sr.doc.tags,
          score: Math.round(sr.score * 100) / 100,
          snippet: extractRelevantSnippet(sr.doc.body, args.query, 1500),
          updatedAt: sr.doc.updatedAt,
        }));

        return JSON.stringify({
          totalHits: scoredResults.length,
          returned: results.length,
          results,
        });
      }

      case 'get_document_details': {
        if (!db.notes) return JSON.stringify({ error: 'Notes table unavailable' });
        if (!args.documentId) {
          return JSON.stringify({ error: 'documentId parameter is required' });
        }

        const doc = await db.notes.get(args.documentId);
        if (!doc || doc.deletedAt) {
          return JSON.stringify({ error: `Document not found or has been deleted: ${args.documentId}` });
        }

        let attachments: Array<{ id: string; fileName: string; mimeType: string; sizeBytes: number }> = [];
        if (db.noteAttachments) {
          const rawAttachments = await db.noteAttachments.where('noteId').equals(doc.id).toArray();
          attachments = rawAttachments.map((a: any) => ({
            id: a.id,
            fileName: a.fileName,
            mimeType: a.mimeType,
            sizeBytes: a.sizeBytes,
          }));
        }

        return JSON.stringify({
          id: doc.id,
          title: doc.title || 'Untitled Document',
          type: doc.type || 'document',
          tags: doc.tags || [],
          slug: doc.slug,
          body: doc.body || '',
          attachments,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        });
      }

      case 'generate_file': {
        if (!args.filename || !args.content) {
          return JSON.stringify({ error: 'filename and content are required' });
        }

        const format = (args.format as ExportFormat) || inferFormatFromFilename(String(args.filename));
        if (format === 'pptx') {
          const exportResult = await exportPresentationAsFile(
            String(args.content),
            String(args.filename),
            args.title ? { presentationTitle: String(args.title) } : undefined
          );
          return JSON.stringify({
            success: true,
            message: `Đã tạo và tải xuống bản trình chiếu "${exportResult.filename}" (${exportResult.slideCount} slides) thành công.`,
            filename: exportResult.filename,
            format: exportResult.format,
            slideCount: exportResult.slideCount,
            sizeBytes: exportResult.sizeBytes,
          });
        }

        const exportResult = exportContentAsFile(
          String(args.content),
          String(args.filename),
          format
        );

        return JSON.stringify({
          success: true,
          message: `Đã tạo và tải xuống tệp "${exportResult.filename}" thành công.`,
          filename: exportResult.filename,
          format: exportResult.format,
          sizeBytes: exportResult.sizeBytes,
        });
      }

      case 'generate_pptx': {
        const filename = args.filename ? String(args.filename) : 'presentation.pptx';
        const presentationTitle = args.presentationTitle ? String(args.presentationTitle) : undefined;
        let contentOrSlides: string | SlideData[] = '';

        if (Array.isArray(args.slides) && args.slides.length > 0) {
          contentOrSlides = args.slides as SlideData[];
        } else if (args.markdownContent) {
          contentOrSlides = String(args.markdownContent);
        } else if (args.content) {
          contentOrSlides = String(args.content);
        } else {
          return JSON.stringify({ error: 'Either slides array or markdownContent/content is required' });
        }

        const exportResult = await exportPresentationAsFile(
          contentOrSlides,
          filename,
          presentationTitle ? { presentationTitle } : undefined
        );

        return JSON.stringify({
          success: true,
          message: `Đã tạo và tải xuống bản trình chiếu PowerPoint "${exportResult.filename}" (${exportResult.slideCount} slides) thành công.`,
          filename: exportResult.filename,
          format: exportResult.format,
          slideCount: exportResult.slideCount,
          sizeBytes: exportResult.sizeBytes,
        });
      }

      case 'generate_image': {
        if (!args.prompt || typeof args.prompt !== 'string') {
          return JSON.stringify({ error: 'prompt is required' });
        }

        const config = await getImageConfig(db);
        const apiKey = await getImageApiKey(db);

        const result = await generateImage({
          prompt: args.prompt,
          endpoint: config.endpoint,
          apiKey: apiKey || '',
          model: config.defaultModel,
          size: args.size || '1024x1024',
          style: args.style,
          responseFormat: 'b64_json',
        });

        const imageSrc = result.dataUrl || result.url;
        if (!imageSrc) {
          return JSON.stringify({ error: 'Không nhận được dữ liệu hình ảnh' });
        }

        // If saveToDocId provided and noteAttachments table available, persist attachment
        let attachedDocTitle: string | null = null;
        if (args.saveToDocId && db.noteAttachments && db.notes) {
          const doc = await db.notes.get(args.saveToDocId);
          if (doc) {
            attachedDocTitle = doc.title;
            const attachmentId = crypto.randomUUID();
            let blobData: Blob;
            if (result.b64Json) {
              const byteCharacters = atob(result.b64Json);
              const byteNumbers = new Array(byteCharacters.length);
              for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
              }
              const byteArray = new Uint8Array(byteNumbers);
              blobData = new Blob([byteArray], { type: 'image/png' });
            } else {
              blobData = new Blob([imageSrc], { type: 'image/png' });
            }

            await db.noteAttachments.put({
              id: attachmentId,
              noteId: doc.id,
              fileName: `ai-gen-${Date.now()}.png`,
              mimeType: 'image/png',
              sizeBytes: blobData.size,
              data: blobData,
              createdAt: new Date().toISOString(),
            });
          }
        }

        const markdownEmbed = `![${result.revisedPrompt || args.prompt}](${imageSrc})`;

        return JSON.stringify({
          success: true,
          message: `Đã tạo hình ảnh thành công bằng mô hình ${result.model}.${attachedDocTitle ? ` Đã đính kèm vào tài liệu "${attachedDocTitle}".` : ''}`,
          prompt: args.prompt,
          revisedPrompt: result.revisedPrompt,
          model: result.model,
          imageUrl: imageSrc,
          markdown: markdownEmbed,
        });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (err: any) {
    let msg = err?.message || String(err);
    if (normalized === 'generate_image') {
      try {
        const key = await getImageApiKey(db);
        msg = redactApiKey(msg, key);
      } catch {
        // ignore
      }
    }
    return JSON.stringify({ error: `Tool execution failed: ${msg}` });
  }
}

const MUTATION_TOOLS = new Set([
  'create_task',
  'update_task',
  'update_task_checklist',
  'reparent_task',
  'delete_task',
  'create_project',
  'update_project',
  'delete_project',
  'create_milestone',
  'update_milestone',
  'delete_milestone',
  'plan_allocation',
  'delete_allocation',
  'log_work_session',
  'update_work_session',
  'delete_work_session',
  'start_timer',
  'pause_timer',
  'stop_and_log_timer',
  'discard_timer',
  'update_capacity_rule',
  'set_capacity_override',
  'remove_capacity_override',
  'create_note',
  'update_note',
  'delete_note',
]);

/**
 * Normalizes tool names by stripping provider or proxy cloaking wrappers
 * (such as 9router Antigravity / Claude suffix `_ide`, `_cc`, `_tool` or `proxy_` prefix).
 */
export function normalizeToolName(toolName: string): string {
  if (!toolName) return '';
  let name = toolName.trim();
  name = name.replace(/(_ide|_cc|_tool)$/, '');
  name = name.replace(/^(proxy_|tool_)/, '');
  return name;
}

export function isMutationTool(toolName: string): boolean {
  const normalized = normalizeToolName(toolName);
  return MUTATION_TOOLS.has(normalized);
}

export function describeToolMutation(toolName: string, args: Record<string, any>): string {
  const normalized = normalizeToolName(toolName);
  switch (normalized) {
    case 'create_task':
      return `Tạo tác vụ mới: "${args.name || 'Chưa đặt tên'}"${args.priority ? ` [Ưu tiên: ${args.priority}]` : ''}${args.estimateMinutes ? ` [Ước tính: ${args.estimateMinutes}p]` : ''}${args.deadline ? ` [Hạn: ${args.deadline}]` : ''}`;
    case 'update_task':
      return `Cập nhật tác vụ (${args.id}): ${Object.keys(args).filter((k) => k !== 'id').join(', ')}`;
    case 'update_task_checklist':
      return `Cập nhật checklist tác vụ (${args.taskId}): hành động ${args.action}`;
    case 'reparent_task':
      return `Chuyển tác vụ (${args.taskId}) sang dự án/mốc mới`;
    case 'delete_task':
      return `Xóa vĩnh viễn tác vụ (${args.id}) cùng các kế hoạch liên quan`;
    case 'create_project':
      return `Tạo dự án mới: "${args.name || 'Chưa đặt tên'}"${args.deadline ? ` [Hạn: ${args.deadline}]` : ''}`;
    case 'update_project':
      return `Cập nhật dự án (${args.id}): ${Object.keys(args).filter((k) => k !== 'id').join(', ')}`;
    case 'delete_project':
      return `Xóa dự án (${args.id}) và tất cả mốc, tác vụ con liên quan`;
    case 'create_milestone':
      return `Tạo mốc mới: "${args.name || 'Chưa đặt tên'}"${args.deadline ? ` [Hạn: ${args.deadline}]` : ''}`;
    case 'update_milestone':
      return `Cập nhật mốc (${args.id}): ${Object.keys(args).filter((k) => k !== 'id').join(', ')}`;
    case 'delete_milestone':
      return `Xóa mốc (${args.id}) và tất cả tác vụ con liên quan`;
    case 'plan_allocation':
      return `Lên lịch làm việc: ${args.allocatedMinutes} phút vào ngày ${args.date} cho tác vụ (${args.taskId})`;
    case 'delete_allocation':
      return `Xóa lịch làm việc ngày ${args.date} của tác vụ (${args.taskId})`;
    case 'log_work_session':
      return `Ghi nhận thời gian làm việc: ${args.durationMinutes} phút vào ngày ${args.date || 'hôm nay'} cho tác vụ (${args.taskId})`;
    case 'update_work_session':
      return `Cập nhật nhật ký công việc (${args.id})`;
    case 'delete_work_session':
      return `Xóa phiên làm việc (${args.id})`;
    case 'start_timer':
      return `Bắt đầu bộ đếm giờ cho tác vụ (${args.taskId})`;
    case 'pause_timer':
      return `Tạm dừng bộ đếm giờ của tác vụ (${args.taskId})`;
    case 'stop_and_log_timer':
      return `Dừng bộ đếm giờ và lưu vào nhật ký công việc cho tác vụ (${args.taskId})`;
    case 'discard_timer':
      return `Hủy bỏ bộ đếm giờ của tác vụ (${args.taskId}) không lưu lại`;
    case 'update_capacity_rule':
      return `Cập nhật năng lực làm việc thứ ${args.dayOfWeek}: ${args.capacityMinutes} phút`;
    case 'set_capacity_override':
      return `Đặt ngoại lệ năng lực ngày ${args.date}: ${args.capacityMinutes} phút`;
    case 'remove_capacity_override':
      return `Xóa ngoại lệ năng lực ngày ${args.date}`;
    case 'create_note':
      return `Tạo ghi chú mới: "${args.title || 'Ghi chú'}"`;
    case 'update_note':
      return `Cập nhật ghi chú (${args.id})`;
    case 'delete_note':
      return `Xóa vĩnh viễn ghi chú (${args.id})`;
    default:
      return `Thực hiện thao tác: ${toolName}`;
  }
}
