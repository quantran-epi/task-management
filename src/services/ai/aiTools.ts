import type { TaskPlannerDatabase } from '../../db';
import { APP_NAME } from '../../constants/app';
import type { Task, ChangeRequest, System, Note, ActiveTimer, ReminderItem } from '../../types/models';
import { NOTIFICATION_SETTINGS_KEY, DEFAULT_NOTIFICATION_SETTINGS } from '../../types/notifications';
import { getTodayDateString } from '../../utils/date';
import { getEffectiveDailyCapacity } from '../../utils/capacity';
import { inspectDateCapacity } from '../../utils/feasibility';
import { filterSessionsByPeriod, aggregateWorkTypeBreakdown } from '../../utils/analytics';
import { createTask, updateTask, reparentTask } from '../../db/repositories/taskRepo';
import { deleteTaskWithAllocations } from '../../db/repositories/cascadeRepo';
import {
  createChangeRequest,
  updateChangeRequest,
  getAllChangeRequests,
  deleteChangeRequest,
} from '../../db/repositories/changeRequestRepo';
import { getAllSystems } from '../../db/repositories/systemRepo';
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
import {
  createNote,
  updateNote,
  deleteNote,
  softDeleteNote,
  restoreNote,
  getTrashNotes,
  batchCreateNotes,
  addNoteAttachment,
  deleteNoteAttachment,
  getNoteWithAttachments,
} from '../../db/repositories/noteRepo';
import {
  linkEntitiesToDoc,
  unlinkEntityFromDoc,
  getBacklinksForDoc,
} from '../../db/repositories/documentLinkRepo';
import {
  createKnowledgeLink,
  deleteKnowledgeLink,
  getKnowledgeLinksForEntity,
} from '../../db/repositories/knowledgeLinkRepo';
import {
  dismissAlertToday,
  getDismissedAlerts,
  clearDismissedAlerts,
} from '../../db/repositories/notificationRepo';
import { detectReferencedEntities } from '../../utils/smartIngestion';
import { formatStandupSummary } from '../../utils/standup';
import {
  analyzeTaskInsight,
  analyzeChangeRequestInsight,
} from '../../utils/itemInsight';
import {
  getDistinctOpsOwners,
  getDistinctBusinessAnalysts,
} from '../../db/repositories/tagRepo';
import { spawnNextRecurringTask } from '../../utils/recurrence';
import { evaluateNotifications } from '../../utils/notifications';
import { rankBM25, extractRelevantSnippet } from '../../utils/bm25';
import { isTauriApp } from '../../utils/timerPopout';
import { exportContentAsFile, inferFormatFromFilename, type ExportFormat } from '../../utils/fileExport';
import { exportPresentationAsFile, type SlideData } from '../../utils/pptxExport';
import { executeDynamicFileScript } from '../../utils/dynamicFileSandbox';
import { generateImage } from './imageGenerationClient';
import { preparePatch, readPatchTarget } from './patchProposal';
import { executeKnowledgeRetrievalTool } from './knowledgeRetrievalTool';
import { getImageConfig, getImageApiKey } from './nineRouterTokenService';
import { redactApiKey } from './nineRouterClient';
import { executeOracleQuery, executeOracleDescribe } from './oracleSqlclService';
import {
  executeSshListDir,
  executeSshReadFile,
  executeSshGrepFiles,
} from './sshFsToolService';
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
        `Query or search tasks in ${APP_NAME}. Returns tasks enriched with creation/update dates, notes, CR/subsystem names, logged hours, recurring schedule, and checklists. Supports comprehensive filtering by dates (createdAt, createdAfter/Before, deadline, updatedAfter/Before), status, priority, workType, recurring state, CR, subsystem, or search keywords, with customizable sorting.`,
      parameters: {
        type: 'object',
        properties: {
          crId: {
            type: 'string',
            description: 'Optional Change Request UUID to filter tasks belonging to this CR.',
          },
          systemId: {
            type: 'string',
            description: 'Optional subsystem UUID to filter tasks belonging to this subsystem.',
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
      name: 'query_change_requests',
      description:
        `List or search Change Requests in ${APP_NAME}. Returns CR metadata, type, status, and targets (subsystems only).`,
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            description: 'Optional status: Open, Pending, In Progress, Done, Cancelled.',
          },
          type: {
            type: 'string',
            enum: ['NEW_FEATURE', 'ENHANCEMENT', 'BUGFIX'],
            description: 'Optional CR type filter.',
          },
          systemId: {
            type: 'string',
            description: 'Optional subsystem UUID to filter CRs targeting that subsystem.',
          },
          search: {
            type: 'string',
            description: 'Optional search keyword to match CR code, name, or description.',
          },
          limit: {
            type: 'number',
            description: 'Max number of change requests to return (default 20, max 50).',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_systems',
      description:
        `List or search systems and subsystems in ${APP_NAME}. Returns system metadata including code, type, and parentId.`,
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['LOGICAL_GROUP', 'SERVICE', 'SCHEMA', 'UI', 'WORKER'],
            description: 'Optional system type filter.',
          },
          search: {
            type: 'string',
            description: 'Optional search keyword to match system code or name.',
          },
          limit: {
            type: 'number',
            description: 'Max number of systems to return (default 20, max 50).',
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
        'Retrieve full detailed information about a specific task, change request, or system by its UUID, including linked parent names, logged work sessions summary, scheduled allocations, and sticky notes.',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['task', 'cr', 'system'],
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
        'Query actual worklog sessions and time spent. Can filter by taskId, crId, date range (startDate to endDate YYYY-MM-DD), search keywords in notes/taskName, or duration. Returns session details and total minutes logged.',
      parameters: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'Optional task UUID to filter worklogs for a specific task.',
          },
          crId: {
            type: 'string',
            description: 'Optional Change Request UUID to filter worklogs for tasks under this CR.',
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
          crId: {
            type: 'string',
            description: 'Optional Change Request UUID to filter analytics for a specific CR.',
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
        'Search or list notes and scratchpads. Can search text in title or body, filter by isPinned, filter by entityType (task, cr, system, or standalone), filter by created/updated dates, or sort results.',
      parameters: {
        type: 'object',
        properties: {
          search: {
            type: 'string',
            description: 'Optional keyword to search in note title or body markdown.',
          },
          entityType: {
            type: 'string',
            enum: ['task', 'cr', 'system', 'standalone'],
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
          type: {
            type: 'string',
            enum: ['quick_note', 'document', 'folder'],
            description: 'Optional filter by note type: quick_note, document, or folder.',
          },
          parentId: {
            type: 'string',
            description: 'Optional parent folder UUID (or "root" for top-level unnested items).',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional array of tags to filter notes having at least one of these tags.',
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
      name: 'query_trash_notes',
      description: 'List notes and documents currently in trash (soft-deleted), including deletion dates and titles.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Max number of trash notes to return (default 20, max 50).',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_distinct_tags',
      description: 'Discover all existing unique Ops Owners, Business Analysts, and note tags across the database to prevent inventing non-existent tags.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['all', 'opsOwners', 'businessAnalysts', 'noteTags'],
            description: 'Category of tags to retrieve (default: all).',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_item_insight',
      description: 'Run deep health analysis, risk calculation, estimate variance, and bottleneck diagnosis on a specific task or change request.',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['task', 'cr', 'system'],
            description: 'Entity type to analyze.',
          },
          id: {
            type: 'string',
            description: 'UUID of the entity.',
          },
        },
        required: ['type', 'id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_document_backlinks',
      description: 'Find all tasks, change requests, and notes that link to or reference a specific document in the knowledge base.',
      parameters: {
        type: 'object',
        properties: {
          documentId: {
            type: 'string',
            description: 'UUID of the document.',
          },
        },
        required: ['documentId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_standup_report',
      description: 'Generate standardized Vietnamese Markdown standup report grouping completed, in-progress, and pending tasks with CR names, deadlines, and inherited Ops/BA tags.',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Date for the standup in YYYY-MM-DD format (defaults to today).',
          },
          crId: {
            type: 'string',
            description: 'Optional Change Request UUID to restrict standup report to a single CR.',
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
        `List or filter recurring task templates in ${APP_NAME}, including frequency, repeat days of week, intervals, and recurrence end dates.`,
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            description: 'Optional task status filter: Open, Pending, In Progress, Resolved, In Review, Done, Cancelled.',
          },
          crId: {
            type: 'string',
            description: 'Optional Change Request UUID to filter recurring tasks for a specific CR.',
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
        `Create a new task in ${APP_NAME}. Can optionally specify CR, subsystem, priority, estimate, deadline, work type, notes, dates, owners, and checklist.`,
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Task title or name (required).' },
          description: { type: 'string', description: 'Optional detailed description.' },
          crId: { type: 'string', description: 'Change Request UUID (required).' },
          systemId: { type: 'string', description: 'Optional subsystem UUID; must be one of the CR targets.' },
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
          reminders: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                date: { type: 'string', description: 'Reminder date (YYYY-MM-DD).' },
                time: { type: 'string', description: 'Optional reminder time (HH:mm).' },
                note: { type: 'string', description: 'Optional reminder note.' },
              },
              required: ['date'],
            },
            description: 'Optional reminders list with dates and optional times.',
          },
          isRecurring: { type: 'boolean', description: 'Whether this task is a recurring template.' },
          recurrenceFrequency: {
            type: 'string',
            enum: ['daily', 'weekly', 'monthly'],
            description: 'Recurrence frequency: daily, weekly, monthly.',
          },
          recurrenceInterval: { type: 'number', description: 'Recurrence interval (e.g. 1 for every week, 2 for every 2 weeks).' },
          recurrenceDaysOfWeek: {
            type: 'array',
            items: { type: 'number' },
            description: 'Days of week to repeat (0=Sun, 1=Mon, ..., 6=Sat).',
          },
          recurrenceEndDate: { type: 'string', description: 'End date for recurrence (YYYY-MM-DD).' },
        },
        required: ['name', 'crId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_task',
      description:
        'Update fields of an existing task (status, priority, estimate, progress, dates, notes, owners, description, CR, subsystem, reminders, recurrence, tags).',
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
          tags: { type: 'array', items: { type: 'string' }, description: 'Tags list.' },
          crId: { type: 'string', description: 'Parent Change Request UUID (required).' },
          systemId: { type: 'string', description: 'Subsystem UUID (or null to unassign); must be one of the CR targets.' },
          workType: {
            type: 'string',
            enum: ['code', 'document', 'meeting', 'support_testing', 'investigate', 'configuration', 'review_code'],
          },
          jiraKey: { type: 'string', description: 'Jira issue key.' },
          reminders: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Optional existing reminder UUID.' },
                date: { type: 'string', description: 'Reminder date (YYYY-MM-DD).' },
                time: { type: 'string', description: 'Optional reminder time (HH:mm).' },
                note: { type: 'string', description: 'Optional reminder note.' },
              },
              required: ['date'],
            },
            description: 'Updated reminders array.',
          },
          isRecurring: { type: 'boolean', description: 'Whether this task is a recurring template.' },
          recurrenceFrequency: {
            type: 'string',
            enum: ['daily', 'weekly', 'monthly'],
            description: 'Recurrence frequency: daily, weekly, monthly.',
          },
          recurrenceInterval: { type: 'number', description: 'Recurrence interval (e.g. 1 for every week, 2 for every 2 weeks).' },
          recurrenceDaysOfWeek: {
            type: 'array',
            items: { type: 'number' },
            description: 'Days of week to repeat (0=Sun, 1=Mon, ..., 6=Sat).',
          },
          recurrenceEndDate: { type: 'string', description: 'End date for recurrence (YYYY-MM-DD).' },
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
      description: 'Move a task to a different Change Request or subsystem.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'UUID of the task to reparent.' },
          crId: { type: 'string', description: 'Target Change Request UUID (required).' },
          systemId: { type: 'string', description: 'Target subsystem UUID (or null to unassign); must be one of the CR targets.' },
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
      name: 'create_change_request',
      description: `Create a new Change Request in ${APP_NAME}. Targets accept subsystems only; a logical parent system is rejected.`,
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Human CR code (required), e.g. CR-2026-001.' },
          name: { type: 'string', description: 'Change Request name (required).' },
          type: {
            type: 'string',
            enum: ['NEW_FEATURE', 'ENHANCEMENT', 'BUGFIX'],
            description: 'CR type (defaults to ENHANCEMENT).',
          },
          status: {
            type: 'string',
            enum: ['Open', 'Pending', 'In Progress', 'Done', 'Cancelled'],
            description: 'Status (defaults to Open).',
          },
          description: { type: 'string', description: 'CR description.' },
          targets: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                systemId: { type: 'string', description: 'Subsystem UUID (required).' },
                featureBranch: { type: 'string', description: 'Optional per-target feature branch.' },
              },
              required: ['systemId'],
            },
            description: 'Subsystem targets. A logical parent is rejected.',
          },
        },
        required: ['code', 'name', 'type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_change_request',
      description: 'Update Change Request details, status, type, targets, owners, or description.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'UUID of the change request to update.' },
          code: { type: 'string', description: 'Updated CR code.' },
          name: { type: 'string', description: 'Updated CR name.' },
          description: { type: 'string', description: 'Updated description.' },
          status: {
            type: 'string',
            enum: ['Open', 'Pending', 'In Progress', 'Done', 'Cancelled'],
          },
          type: {
            type: 'string',
            enum: ['NEW_FEATURE', 'ENHANCEMENT', 'BUGFIX'],
          },
          targets: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                systemId: { type: 'string', description: 'Subsystem UUID (required).' },
                featureBranch: { type: 'string', description: 'Optional per-target feature branch.' },
              },
              required: ['systemId'],
            },
            description: 'Replacement subsystem targets. A logical parent is rejected.',
          },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_change_request',
      description: 'Delete a Change Request and cascade delete all child tasks and allocations.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'UUID of the change request to delete.' },
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
      description: 'Create a new note, document, or folder in knowledge base, optionally linked to a task, change request, or system.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Note or document title.' },
          body: { type: 'string', description: 'Note markdown content (required).' },
          type: {
            type: 'string',
            enum: ['quick_note', 'document', 'folder'],
            description: 'Item type: quick_note, document, or folder (defaults to document).',
          },
          parentId: { type: 'string', description: 'Optional parent folder UUID.' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags array.' },
          entityType: {
            type: 'string',
            enum: ['task', 'cr', 'system'],
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
      description: 'Update content, title, folder location, tags, slug, entity links, or pinned state of an existing note/document.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'UUID of the note to update.' },
          title: { type: 'string', description: 'Updated title.' },
          body: { type: 'string', description: 'Updated markdown body.' },
          type: {
            type: 'string',
            enum: ['quick_note', 'document', 'folder'],
            description: 'Updated item type.',
          },
          parentId: { type: 'string', description: 'Parent folder UUID (or null to move to root).' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Updated tags array.' },
          slug: { type: 'string', description: 'Updated URL/human readable slug.' },
          entityType: {
            type: 'string',
            enum: ['task', 'cr', 'system'],
            description: 'Optional entity type to link or re-bind note to.',
          },
          entityId: { type: 'string', description: 'UUID of entity to link or re-bind note to.' },
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
      description: 'Delete a note or document. By default moves to trash (soft delete). Set permanent: true to wipe permanently.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'UUID of the note to delete.' },
          permanent: {
            type: 'boolean',
            description: 'Whether to permanently delete (true) or move to trash (false, default).',
          },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'restore_note',
      description: 'Restore a soft-deleted note or document from the trash back to active status.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'UUID of the note to restore.' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'batch_create_notes',
      description: 'Create multiple notes, documents, or folders in bulk in one operation.',
      parameters: {
        type: 'object',
        properties: {
          notes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Note title.' },
                body: { type: 'string', description: 'Note markdown body (required).' },
                type: {
                  type: 'string',
                  enum: ['quick_note', 'document', 'folder'],
                  description: 'Note type (default: quick_note).',
                },
                parentId: { type: 'string', description: 'Optional parent folder UUID.' },
                tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags array.' },
                entityType: {
                  type: 'string',
                  enum: ['task', 'cr', 'system'],
                  description: 'Optional entity type to bind to.',
                },
                entityId: { type: 'string', description: 'Optional entity UUID to bind to.' },
                isPinned: { type: 'boolean', description: 'Whether note is pinned.' },
              },
              required: ['body'],
            },
            description: 'Array of note objects to create.',
          },
        },
        required: ['notes'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'manage_note_attachments',
      description: 'Manage image and file attachments on notes: add attachment (from file path, URL, or base64 data), delete an attachment, or list all attachments for a note.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['add', 'delete', 'list'],
            description: 'Action to perform: add, delete, or list attachments.',
          },
          noteId: {
            type: 'string',
            description: 'UUID of note (required for add and list actions).',
          },
          attachmentId: {
            type: 'string',
            description: 'UUID of attachment to remove (required for delete action).',
          },
          fileName: {
            type: 'string',
            description: 'Attachment file name (for add action, e.g. screenshot.png).',
          },
          mimeType: {
            type: 'string',
            enum: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
            description: 'Image MIME type (for add action, default image/png).',
          },
          filePath: {
            type: 'string',
            description: 'Local file path on disk to attach (for add action).',
          },
          data: {
            type: 'string',
            description: 'Base64 encoded file payload or data URL (for add action).',
          },
          caption: {
            type: 'string',
            description: 'Optional human-readable caption for the attachment.',
          },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'auto_link_document',
      description: 'Scan document content for task titles, CR codes, and Jira keys, and automatically link referenced entities.',
      parameters: {
        type: 'object',
        properties: {
          documentId: {
            type: 'string',
            description: 'UUID of the document to scan and link.',
          },
        },
        required: ['documentId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'batch_plan_allocations',
      description: 'Plan workload allocations for a task across multiple dates in a single call.',
      parameters: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'UUID of the task.',
          },
          allocations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                date: { type: 'string', description: 'Allocation date (YYYY-MM-DD).' },
                allocatedMinutes: { type: 'number', description: 'Minutes to allocate for that date.' },
              },
              required: ['date', 'allocatedMinutes'],
            },
            description: 'List of daily allocations to apply.',
          },
        },
        required: ['taskId', 'allocations'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'clear_allocations',
      description: 'Clear planned workload allocations in bulk by task ID, specific date, or date range.',
      parameters: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'Optional task UUID to clear allocations for.',
          },
          date: {
            type: 'string',
            description: 'Optional single date (YYYY-MM-DD) to clear.',
          },
          startDate: {
            type: 'string',
            description: 'Optional range start date (YYYY-MM-DD).',
          },
          endDate: {
            type: 'string',
            description: 'Optional range end date (YYYY-MM-DD).',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'clear_dismissed_alerts',
      description: 'Reset and un-dismiss all notification alerts that were muted today.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'batch_create_tasks',
      description: 'Create multiple tasks in bulk with name, estimate, priority, deadline, status, and work type.',
      parameters: {
        type: 'object',
        properties: {
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Task name (required).' },
                description: { type: 'string', description: 'Optional task description.' },
                crId: { type: 'string', description: 'Change Request UUID.' },
                systemId: { type: 'string', description: 'Optional subsystem UUID.' },
                status: {
                  type: 'string',
                  enum: ['Open', 'Pending', 'In Progress', 'Resolved', 'In Review', 'Done', 'Cancelled'],
                  description: 'Task status.',
                },
                priority: {
                  type: 'string',
                  enum: ['Low', 'Medium', 'High', 'Urgent'],
                  description: 'Task priority.',
                },
                estimateMinutes: { type: 'number', description: 'Estimated minutes.' },
                deadline: { type: 'string', description: 'Deadline (YYYY-MM-DD).' },
                workType: {
                  type: 'string',
                  enum: ['code', 'document', 'meeting', 'support_testing', 'investigate', 'configuration', 'review_code'],
                },
              },
              required: ['name'],
            },
            description: 'Array of task definitions to create.',
          },
        },
        required: ['tasks'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'batch_update_tasks',
      description: 'Update common fields (status, priority, progress, CR, or subsystem) across multiple tasks in one call.',
      parameters: {
        type: 'object',
        properties: {
          taskIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of task UUIDs to update.',
          },
          patch: {
            type: 'object',
            properties: {
              status: {
                type: 'string',
                enum: ['Open', 'Pending', 'In Progress', 'Resolved', 'In Review', 'Done', 'Cancelled'],
              },
              priority: {
                type: 'string',
                enum: ['Low', 'Medium', 'High', 'Urgent'],
              },
              progress: { type: 'number', description: 'Progress percentage (0-100).' },
              crId: { type: 'string', description: 'Change Request UUID to assign.' },
              systemId: { type: 'string', description: 'Subsystem UUID to assign.' },
            },
            description: 'Fields to update on all specified tasks.',
          },
        },
        required: ['taskIds', 'patch'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'spawn_recurring_task_instance',
      description: 'Manually trigger the spawning of the next occurrence instance of a recurring task template.',
      parameters: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'UUID of the recurring task template.',
          },
        },
        required: ['taskId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'manage_reminders',
      description:
        `Manage reminders on tasks or change requests: add a new reminder with date/time/note, remove an existing reminder, or list current reminders. ${APP_NAME} has full native reminder support with browser desktop notifications.`,
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['add', 'remove', 'list'],
            description: 'Action to perform: add, remove, or list.',
          },
          entityType: {
            type: 'string',
            enum: ['task', 'cr', 'system'],
            description: 'Type of entity owning the reminder.',
          },
          entityId: { type: 'string', description: 'UUID of the task or change request.' },
          date: { type: 'string', description: 'Reminder date (YYYY-MM-DD), required for add action.' },
          time: { type: 'string', description: 'Optional reminder time (HH:mm).' },
          note: { type: 'string', description: 'Optional reminder description or note.' },
          reminderId: { type: 'string', description: 'UUID of the reminder to remove, required for remove action.' },
        },
        required: ['action', 'entityType', 'entityId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'link_document',
      description: 'Create a bidirectional link between a knowledge base document and a task, change request, or system.',
      parameters: {
        type: 'object',
        properties: {
          documentId: { type: 'string', description: 'UUID of the document/note to link.' },
          entityType: {
            type: 'string',
            enum: ['task', 'cr', 'system'],
            description: 'Target entity type.',
          },
          entityId: { type: 'string', description: 'UUID of the target task, change request, or system.' },
        },
        required: ['documentId', 'entityType', 'entityId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'unlink_document',
      description: 'Remove bidirectional link between a knowledge base document and a task, change request, or system.',
      parameters: {
        type: 'object',
        properties: {
          documentId: { type: 'string', description: 'UUID of the document/note.' },
          entityType: {
            type: 'string',
            enum: ['task', 'cr', 'system'],
            description: 'Entity type.',
          },
          entityId: { type: 'string', description: 'UUID of the entity to unlink.' },
        },
        required: ['documentId', 'entityType', 'entityId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_notifications',
      description:
        `Query active notifications and alerts in ${APP_NAME} (overdue tasks, capacity overloads, due-soon deadlines, stale tasks, custom reminders, and timer alerts).`,
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['all', 'overdue', 'overload', 'due-soon', 'stale', 'reminder'],
            description: 'Optional category filter.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'dismiss_notification',
      description: 'Dismiss a dismissible notification alert (e.g. stale task or reminder alert) for today.',
      parameters: {
        type: 'object',
        properties: {
          alertKey: { type: 'string', description: 'The unique alert key/id (e.g. "reminder:task:123", "stale:task:456").' },
        },
        required: ['alertKey'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description:
        'Read a slice of a local file referenced in the conversation or attached to a task/CR. Returns line-numbered content (`cat -n` format), lines read, and whether the file was truncated. Use offset and limit to page through large files.',
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
      name: 'retrieve_knowledge',
      description:
        'Retrieve hybrid evidence (fulltext + vector + knowledge graph) from the published knowledge bundle. Returns excerpts with citation ids, entity names, graph paths, and warnings. Call repeatedly with short, focused queries (<=200 chars) as you investigate.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'Short focused query (<=200 chars): an entity name, an identifier, or a narrow topic phrase.',
          },
          setIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional document set UUIDs. Omit to search every published set.',
          },
          limit: {
            type: 'number',
            description: 'Max evidence items to return (default 20, max 50).',
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
        'Generate and prepare a downloadable file in specified format (Word .docx, Excel .xlsx, PowerPoint .pptx, Markdown .md, plain text .txt, or CSV .csv). You can provide structured text/markdown via "content", OR full JavaScript code via "script" executed directly in the browser sandbox with ExcelJS, docx, or pptxgen for advanced styling, formulas, custom tables, and formatting.',
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
            description: 'The full document text, report, markdown, or tabular data. Used by automatic parser.',
          },
          script: {
            type: 'string',
            description: 'Optional JavaScript code executed in client sandbox. Environment provides ExcelJS, docx, and pptxgen. Return workbook, doc, pptx, or Blob. Perfect for complex spreadsheets (formulas, merged cells, colors), styled Word docs, or custom slide decks.',
          },
          title: {
            type: 'string',
            description: 'Optional title or header for the document.',
          },
        },
        required: ['filename'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_pptx',
      description:
        'Generate and prepare a downloadable PowerPoint presentation (.pptx). CRITICAL: Provide complete slide definitions via "slides" array or full markdown text via "markdownContent". The file will be saved directly with this content.',
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
  {
    type: 'function',
    function: {
      name: 'link_taskmate_to_knowledge',
      description:
        'Link a TaskMate entity (task, change request, or system) to a knowledge entity (canonical graph URN or document UUID).',
      parameters: {
        type: 'object',
        properties: {
          taskMateEntityType: {
            type: 'string',
            enum: ['task', 'cr', 'system'],
            description: 'Type of the TaskMate entity to link.',
          },
          taskMateEntityId: {
            type: 'string',
            description: 'UUID of the TaskMate entity.',
          },
          setId: {
            type: 'string',
            description: 'UUID of the DocumentSet.',
          },
          urn: {
            type: 'string',
            description: 'Optional stable canonical graph URN (e.g. "urn:node:table:accounts").',
          },
          docId: {
            type: 'string',
            description: 'Optional stable document UUID from notes/documents.',
          },
          displayLabel: {
            type: 'string',
            description: 'Human-readable label for badges/pills.',
          },
        },
        required: ['taskMateEntityType', 'taskMateEntityId', 'setId', 'displayLabel'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'unlink_taskmate_knowledge',
      description:
        'Remove a link between a TaskMate entity and a knowledge entity by linkId or entity coordinates.',
      parameters: {
        type: 'object',
        properties: {
          linkId: {
            type: 'string',
            description: 'Optional UUID of the KnowledgeLink record to remove.',
          },
          taskMateEntityType: {
            type: 'string',
            enum: ['task', 'cr', 'system'],
            description: 'Optional entity type when removing by entity coordinates.',
          },
          taskMateEntityId: {
            type: 'string',
            description: 'Optional entity UUID when removing by entity coordinates.',
          },
          urn: {
            type: 'string',
            description: 'Optional target URN when removing by entity coordinates.',
          },
          docId: {
            type: 'string',
            description: 'Optional target docId when removing by entity coordinates.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_artifact',
      description:
        'Read the current Markdown of a note or skill: target, id, full current draft, base hash, and the stable section index. Read-only; call it before proposing any edit.',
      parameters: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            enum: ['note', 'skill'],
            description: 'Document kind to read.',
          },
          id: {
            type: 'string',
            description: 'noteId or skillId of the document.',
          },
        },
        required: ['target', 'id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'patch_artifact_section',
      description:
        'Propose an append or replace edit to one section of a note or skill. Returns a unified diff and the resulting Markdown; it never writes the editor — the user must approve the change. Requires the sectionId, exact expectedHeading, and baseHash returned by get_artifact.',
      parameters: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            enum: ['note', 'skill'],
            description: 'Document kind to patch.',
          },
          id: {
            type: 'string',
            description: 'noteId or skillId of the document.',
          },
          sectionId: {
            type: 'string',
            description: 'Dotted section id from get_artifact sectionIndex (e.g. "2.1").',
          },
          expectedHeading: {
            type: 'string',
            description: 'Exact heading text of that section, used to refuse drift.',
          },
          baseHash: {
            type: 'string',
            description: 'baseHash returned by the get_artifact call this edit is based on.',
          },
          operation: {
            type: 'string',
            enum: ['append', 'replace'],
            description: 'append adds lines at the end of the section body; replace swaps the body.',
          },
          newContent: {
            type: 'string',
            description: 'Markdown text to append or use as the replacement body (max 120 lines).',
          },
        },
        required: ['target', 'id', 'sectionId', 'expectedHeading', 'baseHash', 'operation', 'newContent'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'oracle_query',
      description:
        'Execute a read-only SQL query on the configured remote Oracle database via SQLcl over SSH. Strict read-only enforcement (SET TRANSACTION READ ONLY). Results formatted in JSON.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The SELECT or WITH SQL query to execute on Oracle DB.',
          },
          explain: {
            type: 'boolean',
            description: 'Optional. If true, generates and returns the EXPLAIN PLAN rather than executing the query.',
          },
          limit: {
            type: 'number',
            description: 'Optional max rows to return (default 100, max 1000).',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'oracle_describe',
      description:
        'Inspect Oracle database metadata: list tables/views, inspect columns, types, nullability, constraints, comments, or retrieve full table DDL.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['list_tables', 'describe_table', 'get_ddl'],
            description: 'Action: list_tables (summary of tables), describe_table (columns, types, constraints), get_ddl (full DDL).',
          },
          tableOrView: {
            type: 'string',
            description: 'Table or view name (required for describe_table and get_ddl).',
          },
          schema: {
            type: 'string',
            description: 'Optional schema or owner name.',
          },
          search: {
            type: 'string',
            description: 'Optional search keyword to filter table names for list_tables.',
          },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ssh_list_dir',
      description:
        'List files and directories on the remote host via configured SSH connection. Returns name, type (file/directory/symlink), size in bytes, and last modified timestamp. Directories sorted first.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Remote directory path to list (e.g. "/var/log", "/etc/nginx", or ".").',
          },
          showHidden: {
            type: 'boolean',
            description: 'Optional. If true, includes hidden files starting with dot "." (default false).',
          },
          limit: {
            type: 'number',
            description: 'Optional max entries to return (default 100, max 200).',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ssh_read_file',
      description:
        'Read a slice of lines from a remote text/code/log file over SSH. Refuses binary files. Returns numbered lines, total lines count, and pagination indicator to preserve AI context window.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Remote absolute path of the file to read.',
          },
          offset: {
            type: 'number',
            description: 'Optional 1-based line offset to start reading (default 1).',
          },
          limit: {
            type: 'number',
            description: 'Optional number of lines to read (default 100, max 500).',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ssh_grep_files',
      description:
        'Search for a string or regex pattern in remote files or directories using read-only grep over SSH. Ignores binary files. Returns matching file paths, line numbers, and contents.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Remote file or directory path to search.',
          },
          pattern: {
            type: 'string',
            description: 'Search string or regular expression.',
          },
          recursive: {
            type: 'boolean',
            description: 'Optional. If true, searches recursively in subdirectories (default false).',
          },
          caseSensitive: {
            type: 'boolean',
            description: 'Optional. True for case-sensitive search, false for case-insensitive (default true).',
          },
          limit: {
            type: 'number',
            description: 'Optional max matching lines to return (default 50, max 100).',
          },
        },
        required: ['path', 'pattern'],
      },
    },
  },
];

export interface ExecuteAiToolOptions {
  /**
   * WR-19: the CR a CR-scoped turn is bound to. Entity ids outside it are rejected so a
   * scoped turn cannot read or mutate another CR's data.
   */
  crScopeId?: string;
}

/** Tools whose first argument identifies a task; the task's `crId` must match the turn scope. */
const TASK_SCOPED_TOOLS = new Set([
  'update_task',
  'delete_task',
  'reparent_task',
  'update_task_checklist',
  'spawn_recurring_task_instance',
]);

async function assertCrScope(
  toolName: string,
  args: Record<string, any>,
  db: TaskPlannerDatabase,
  crScopeId: string
): Promise<void> {
  if (typeof args.crId === 'string' && args.crId !== crScopeId) {
    throw new Error('Công cụ chỉ được thao tác trên Change Request đang mở.');
  }
  if (!TASK_SCOPED_TOOLS.has(toolName)) return;
  const taskId = args.id ?? args.taskId;
  if (typeof taskId !== 'string') return;
  const task = await db.tasks.get(taskId);
  if (task && task.crId !== crScopeId) {
    throw new Error('Tác vụ không thuộc Change Request đang mở.');
  }
}

export async function executeAiTool(
  toolName: string,
  args: Record<string, any>,
  db: TaskPlannerDatabase,
  signal?: AbortSignal,
  options?: ExecuteAiToolOptions
): Promise<string> {
  const normalized = normalizeToolName(toolName);
  if (options?.crScopeId) {
    try {
      await assertCrScope(normalized, args, db, options.crScopeId);
    } catch (err) {
      return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
    }
  }
  try {
    switch (normalized) {
      case 'ssh_list_dir': {
        return await executeSshListDir(args as any, db);
      }

      case 'ssh_read_file': {
        return await executeSshReadFile(args as any, db);
      }

      case 'ssh_grep_files': {
        return await executeSshGrepFiles(args as any, db);
      }

      case 'oracle_query': {
        return await executeOracleQuery(args as any, db);
      }

      case 'oracle_describe': {
        return await executeOracleDescribe(args as any, db);
      }

      case 'get_artifact': {
        return JSON.stringify(await readPatchTarget(db, args));
      }

      case 'patch_artifact_section': {
        return JSON.stringify(await preparePatch(db, args));
      }

      case 'query_tasks': {
        if (!db.tasks) return JSON.stringify({ error: 'Tasks table unavailable' });
        let tasks = await db.tasks.toArray();
        const changeRequests = db.changeRequests ? await db.changeRequests.toArray() : [];
        const systems = db.systems ? await db.systems.toArray() : [];
        const workSessions = db.workSessions ? await db.workSessions.toArray() : [];

        const crMap = new Map<string, ChangeRequest>(changeRequests.map((c) => [c.id, c]));
        const systemMap = new Map<string, System>(systems.map((s) => [s.id, s]));
        const loggedMap = new Map<string, number>();
        for (const ws of workSessions) {
          loggedMap.set(ws.taskId, (loggedMap.get(ws.taskId) || 0) + (ws.durationMinutes || 0));
        }

        // Entity / Status / Priority / WorkType / Recurrence filters
        if (args.crId) {
          tasks = tasks.filter((t) => t.crId === args.crId);
        }
        if (args.systemId) {
          tasks = tasks.filter((t) => t.systemId === args.systemId);
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
          const c = crMap.get(t.crId);
          const s = t.systemId ? systemMap.get(t.systemId) : undefined;
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
            crId: t.crId ?? null,
            crCode: c?.code ?? null,
            crName: c?.name ?? null,
            systemId: t.systemId ?? null,
            systemName: s?.name ?? null,
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

      case 'query_change_requests': {
        const allChangeRequests = await getAllChangeRequests(db);
        const allTasks = db.tasks ? await db.tasks.toArray() : [];
        const workSessions = db.workSessions ? await db.workSessions.toArray() : [];

        const loggedMap = new Map<string, number>();
        for (const ws of workSessions) {
          loggedMap.set(ws.taskId, (loggedMap.get(ws.taskId) || 0) + (ws.durationMinutes || 0));
        }

        let changeRequests = allChangeRequests;
        if (args.status) {
          changeRequests = changeRequests.filter(
            (c) => c.status.toLowerCase() === String(args.status).toLowerCase()
          );
        }
        if (args.type) {
          changeRequests = changeRequests.filter(
            (c) => c.type.toLowerCase() === String(args.type).toLowerCase()
          );
        }
        if (args.systemId) {
          changeRequests = changeRequests.filter((c) =>
            c.targets.some((t) => t.systemId === args.systemId)
          );
        }
        if (args.search) {
          const q = String(args.search).toLowerCase();
          changeRequests = changeRequests.filter(
            (c) =>
              c.code.toLowerCase().includes(q) ||
              c.name.toLowerCase().includes(q) ||
              (c.description && c.description.toLowerCase().includes(q))
          );
        }

        changeRequests.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

        const limit = Math.min(Math.max(1, Number(args.limit) || 20), 50);
        const subset = changeRequests.slice(0, limit).map((c) => {
          const crTasks = allTasks.filter((t) => t.crId === c.id);
          let totalEstimate = 0;
          let totalLogged = 0;
          for (const t of crTasks) {
            totalEstimate += t.estimateMinutes || 0;
            totalLogged += loggedMap.get(t.id) || 0;
          }
          return {
            id: c.id,
            code: c.code,
            name: c.name,
            type: c.type,
            status: c.status,
            deadline: c.deadline ?? null,
            description: c.description ?? null,
            targets: c.targets.map((t) => ({
              systemId: t.systemId,
              featureBranch: t.featureBranch ?? null,
            })),
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
            taskCount: crTasks.length,
            openTaskCount: crTasks.filter(
              (t) => t.status !== 'Done' && t.status !== 'Cancelled'
            ).length,
            totalEstimateMinutes: totalEstimate,
            totalLoggedMinutes: totalLogged,
          };
        });

        return JSON.stringify({
          totalCount: changeRequests.length,
          returnedCount: subset.length,
          changeRequests: subset,
        });
      }

      case 'query_systems': {
        const allSystems = await getAllSystems(db);
        let systems = allSystems;
        if (args.type) {
          systems = systems.filter(
            (s) => s.type.toLowerCase() === String(args.type).toLowerCase()
          );
        }
        if (args.search) {
          const q = String(args.search).toLowerCase();
          systems = systems.filter(
            (s) => s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
          );
        }

        systems.sort((a, b) => a.code.localeCompare(b.code));

        const limit = Math.min(Math.max(1, Number(args.limit) || 20), 50);
        const subset = systems.slice(0, limit).map((s) => ({
          id: s.id,
          code: s.code,
          name: s.name,
          type: s.type,
          parentId: s.parentId,
          remoteRepoPath: s.remoteRepoPath ?? null,
        }));

        return JSON.stringify({
          totalCount: systems.length,
          returnedCount: subset.length,
          systems: subset,
        });
      }

      case 'get_item_details': {
        const { type, id } = args;
        if (!type || !id) {
          return JSON.stringify({ error: 'Missing required parameters: type, id' });
        }

        let item: Task | ChangeRequest | System | undefined;
        let stickyNotes: Note[] = [];

        if (type === 'task') {
          item = db.tasks ? await db.tasks.get(id) : undefined;
        } else if (type === 'cr') {
          item = db.changeRequests ? await db.changeRequests.get(id) : undefined;
        } else if (type === 'system') {
          item = db.systems ? await db.systems.get(id) : undefined;
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

        const attachmentCountMap = new Map<string, number>();
        if (db.noteAttachments) {
          try {
            const allAtt = await db.noteAttachments.toArray();
            for (const a of allAtt) {
              attachmentCountMap.set(a.noteId, (attachmentCountMap.get(a.noteId) || 0) + 1);
            }
          } catch {}
        }

        const formattedStickyNotes = stickyNotes.map((n) => ({
          id: n.id,
          title: n.title,
          body: n.body,
          isPinned: n.isPinned,
          attachmentsCount: attachmentCountMap.get(n.id) || 0,
        }));

        if (type === 'task') {
          const task = item as Task;
          const cr = task.crId && db.changeRequests ? await db.changeRequests.get(task.crId) : undefined;
          const system = task.systemId && db.systems ? await db.systems.get(task.systemId) : undefined;
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
            crCode: cr?.code ?? null,
            crName: cr?.name ?? null,
            systemName: system?.name ?? null,
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

        if (type === 'cr') {
          const cr = item as ChangeRequest;
          const allTasks = db.tasks ? (await db.tasks.toArray()).filter((t) => t.crId === id) : [];
          const workSessions = db.workSessions ? await db.workSessions.toArray() : [];
          const taskIds = new Set(allTasks.map((t) => t.id));
          const crSessions = workSessions.filter((ws) => taskIds.has(ws.taskId));

          let totalLoggedMinutes = 0;
          let totalEstimateMinutes = 0;
          for (const t of allTasks) totalEstimateMinutes += t.estimateMinutes || 0;
          for (const ws of crSessions) totalLoggedMinutes += ws.durationMinutes || 0;

          return JSON.stringify({
            type,
            item,
            targets: cr.targets.map((t) => ({
              systemId: t.systemId,
              featureBranch: t.featureBranch ?? null,
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

        if (type === 'system') {
          const system = item as System;
          const parent = system.parentId && db.systems ? await db.systems.get(system.parentId) : undefined;
          const allTasks = db.tasks ? (await db.tasks.toArray()).filter((t) => t.systemId === id) : [];
          const workSessions = db.workSessions ? await db.workSessions.toArray() : [];
          const taskIds = new Set(allTasks.map((t) => t.id));
          const systemSessions = workSessions.filter((ws) => taskIds.has(ws.taskId));

          let totalLoggedMinutes = 0;
          let totalEstimateMinutes = 0;
          for (const t of allTasks) totalEstimateMinutes += t.estimateMinutes || 0;
          for (const ws of systemSessions) totalLoggedMinutes += ws.durationMinutes || 0;

          return JSON.stringify({
            type,
            item,
            parentName: parent?.name ?? null,
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

        if (args.crId) {
          const crTaskIds = new Set(
            allTasks.filter((t) => t.crId === args.crId).map((t) => t.id)
          );
          sessions = sessions.filter((s) => crTaskIds.has(s.taskId));
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

        if (args.crId) {
          const crTaskIds = new Set(
            allTasks.filter((t) => t.crId === args.crId).map((t) => t.id)
          );
          sessions = sessions.filter((s) => crTaskIds.has(s.taskId));
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
        let notes = (await db.notes.toArray()).filter((n) => !n.deletedAt);
        const allTasks = db.tasks ? await db.tasks.toArray() : [];
        const allChangeRequests = db.changeRequests ? await db.changeRequests.toArray() : [];
        const allSystems = db.systems ? await db.systems.toArray() : [];

        const taskMap = new Map(allTasks.map((t) => [t.id, t.name]));
        const crMap = new Map(allChangeRequests.map((c) => [c.id, c.name]));
        const systemMap = new Map(allSystems.map((s) => [s.id, s.name]));

        if (args.type) {
          notes = notes.filter((n) => (n.type || 'quick_note') === args.type);
        }
        if (args.parentId !== undefined) {
          if (args.parentId === 'root' || args.parentId === null || args.parentId === '') {
            notes = notes.filter((n) => !n.parentId);
          } else {
            notes = notes.filter((n) => n.parentId === args.parentId);
          }
        }
        if (Array.isArray(args.tags) && args.tags.length > 0) {
          const filterTags = new Set(args.tags.map((t: string) => String(t).toLowerCase().trim()));
          notes = notes.filter((n) => n.tags?.some((t) => filterTags.has(t.toLowerCase().trim())));
        }
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

        const attachmentCountMap = new Map<string, number>();
        if (db.noteAttachments) {
          try {
            const allAtt = await db.noteAttachments.toArray();
            for (const a of allAtt) {
              attachmentCountMap.set(a.noteId, (attachmentCountMap.get(a.noteId) || 0) + 1);
            }
          } catch {}
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
          else if (n.entityType === 'cr' && n.entityId) entityName = crMap.get(n.entityId) ?? null;
          else if (n.entityType === 'system' && n.entityId) entityName = systemMap.get(n.entityId) ?? null;

          return {
            id: n.id,
            title: n.title ?? 'Untitled Note',
            type: n.type || 'quick_note',
            parentId: n.parentId ?? null,
            tags: n.tags || [],
            bodySnippet: n.body.length > 200 ? `${n.body.slice(0, 200)}...` : n.body,
            isPinned: n.isPinned,
            attachmentsCount: attachmentCountMap.get(n.id) || 0,
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

      case 'query_trash_notes': {
        const trash = await getTrashNotes(db);
        const limit = Math.min(Math.max(1, Number(args.limit) || 20), 50);
        const subset = trash.slice(0, limit).map((n) => ({
          id: n.id,
          title: n.title || 'Untitled Note',
          type: n.type || 'quick_note',
          deletedAt: n.deletedAt,
          bodySnippet: n.body.length > 200 ? `${n.body.slice(0, 200)}...` : n.body,
          tags: n.tags || [],
        }));
        return JSON.stringify({
          totalCount: trash.length,
          returnedCount: subset.length,
          notes: subset,
        });
      }

      case 'query_distinct_tags': {
        const [opsOwners, businessAnalysts, allNotes] = await Promise.all([
          getDistinctOpsOwners(db),
          getDistinctBusinessAnalysts(db),
          db.notes ? db.notes.toArray() : [],
        ]);
        const noteTagsSet = new Set<string>();
        for (const n of allNotes) {
          if (Array.isArray(n.tags)) {
            for (const tag of n.tags) {
              if (tag?.trim()) noteTagsSet.add(tag.trim());
            }
          }
        }
        const noteTags = Array.from(noteTagsSet).sort((a, b) => a.localeCompare(b));
        const category = args.category || 'all';
        if (category === 'opsOwners') return JSON.stringify({ opsOwners });
        if (category === 'businessAnalysts') return JSON.stringify({ businessAnalysts });
        if (category === 'noteTags') return JSON.stringify({ noteTags });
        return JSON.stringify({
          opsOwners,
          businessAnalysts,
          noteTags,
        });
      }

      case 'get_item_insight': {
        const { type, id } = args;
        if (!type || !id) return JSON.stringify({ error: 'type and id are required' });
        if (type === 'task') {
          const task = db.tasks ? await db.tasks.get(id) : null;
          if (!task) return JSON.stringify({ error: `Task not found: ${id}` });
          const allTasks = db.tasks ? await db.tasks.toArray() : [];
          const workSessions = db.workSessions
            ? (await db.workSessions.toArray()).filter((ws) => ws.taskId === id)
            : [];
          const allocations = db.plannedAllocations
            ? (await db.plannedAllocations.toArray()).filter((pa) => pa.taskId === id)
            : [];
          const notes = db.notes
            ? await db.notes.where('entityId').equals(id).filter((n) => n.entityType === 'task').toArray()
            : [];
          const analysis = analyzeTaskInsight(task, workSessions, allocations, allTasks, notes);
          return JSON.stringify({
            type: 'task',
            id: task.id,
            name: task.name,
            analysis,
          });
        } else if (type === 'cr') {
          const cr = db.changeRequests ? await db.changeRequests.get(id) : null;
          if (!cr) return JSON.stringify({ error: `ChangeRequest not found: ${id}` });
          const crTasks = db.tasks ? await db.tasks.where('crId').equals(id).toArray() : [];
          const targetSystems = db.systems
            ? (await db.systems.toArray()).filter((sys) => cr.targets.some((t) => t.systemId === sys.id))
            : [];
          const allWorkSessions = db.workSessions ? await db.workSessions.toArray() : [];
          const allAllocations = db.plannedAllocations ? await db.plannedAllocations.toArray() : [];
          const analysis = analyzeChangeRequestInsight(cr, crTasks, targetSystems, allWorkSessions, allAllocations);
          return JSON.stringify({
            type: 'cr',
            id: cr.id,
            name: cr.name,
            analysis,
          });
        } else if (type === 'system') {
          const system = db.systems ? await db.systems.get(id) : null;
          if (!system) return JSON.stringify({ error: `System not found: ${id}` });
          const systemTasks = db.tasks ? await db.tasks.where('systemId').equals(id).toArray() : [];
          const crIds = Array.from(new Set(systemTasks.map((t) => t.crId)));
          const allChangeRequests = db.changeRequests ? await db.changeRequests.toArray() : [];
          const crs = allChangeRequests.filter((c) => crIds.includes(c.id));
          return JSON.stringify({
            type: 'system',
            id: system.id,
            name: system.name,
            analysis: {
              subsystemCode: system.code,
              subsystemType: system.type,
              parentId: system.parentId,
              taskCount: systemTasks.length,
              openTaskCount: systemTasks.filter(
                (t) => t.status !== 'Done' && t.status !== 'Cancelled'
              ).length,
              totalEstimateMinutes: systemTasks.reduce((sum, t) => sum + (t.estimateMinutes || 0), 0),
              changeRequests: crs.map((c) => ({ id: c.id, code: c.code, name: c.name, status: c.status })),
            },
          });
        }
        return JSON.stringify({ error: `Invalid item type: ${type}` });
      }

      case 'get_document_backlinks': {
        if (!args.documentId) return JSON.stringify({ error: 'documentId parameter is required' });
        const doc = db.notes ? await db.notes.get(args.documentId) : null;
        if (!doc) return JSON.stringify({ error: `Document not found: ${args.documentId}` });
        const backlinks = await getBacklinksForDoc(args.documentId, db);
        return JSON.stringify({
          documentId: args.documentId,
          documentTitle: doc.title || 'Untitled Document',
          totalBacklinks: backlinks.tasks.length + backlinks.changeRequests.length + backlinks.referencingNotes.length,
          tasks: backlinks.tasks.map((t) => ({ id: t.id, name: t.name, status: t.status, priority: t.priority })),
          changeRequests: backlinks.changeRequests.map((c) => ({ id: c.id, code: c.code, name: c.name, status: c.status })),
          referencingNotes: backlinks.referencingNotes.map((n) => ({ id: n.id, title: n.title, type: n.type })),
        });
      }

      case 'generate_standup_report': {
        const allTasks = db.tasks ? await db.tasks.toArray() : [];
        const allChangeRequests = db.changeRequests ? await db.changeRequests.toArray() : [];
        const allSystems = db.systems ? await db.systems.toArray() : [];
        const crMap = new Map(allChangeRequests.map((c) => [c.id, c]));
        const systemMap = new Map(allSystems.map((s) => [s.id, s]));
        let tasks = allTasks;
        if (args.crId) {
          tasks = tasks.filter((t) => t.crId === args.crId);
        }
        const report = formatStandupSummary(tasks, {
          crMap,
          systemMap,
          todayStr: args.date || getTodayDateString(),
        });
        return JSON.stringify({
          date: args.date || getTodayDateString(),
          taskCount: tasks.length,
          markdownReport: report,
        });
      }

      case 'query_attention_items': {
        const todayStr = getTodayDateString();
        const horizonDays = Math.max(1, Number(args.horizonDays) || 7);
        const horizonEnd = dayjs(todayStr).add(horizonDays, 'day').format('YYYY-MM-DD');

        const allTasks = db.tasks ? await db.tasks.toArray() : [];
        const allChangeRequests = db.changeRequests ? await db.changeRequests.toArray() : [];
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

        // Upcoming CR deadlines
        for (const c of allChangeRequests) {
          if (c.status !== 'Done' && c.status !== 'Cancelled' && c.deadline) {
            if (c.deadline <= horizonEnd) {
              upcomingDeadlines.push({ type: 'cr', id: c.id, name: c.name, deadline: c.deadline });
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
        if (args.crId) {
          recurring = recurring.filter((t) => t.crId === args.crId);
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

        const reminderItems = Array.isArray(args.reminders)
          ? args.reminders.map((r: any) => ({
              id: crypto.randomUUID(),
              date: String(r.date),
              time: r.time ? String(r.time) : undefined,
              note: r.note ? String(r.note) : undefined,
            }))
          : undefined;

        const task = await createTask(
          {
            name: args.name,
            description: args.description,
            crId: args.crId,
            systemId: args.systemId,
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
            reminders: reminderItems,
            isRecurring: args.isRecurring !== undefined ? Boolean(args.isRecurring) : undefined,
            recurrenceFrequency: args.recurrenceFrequency,
            recurrenceInterval: args.recurrenceInterval !== undefined ? Number(args.recurrenceInterval) : undefined,
            recurrenceDaysOfWeek: Array.isArray(args.recurrenceDaysOfWeek) ? args.recurrenceDaysOfWeek : undefined,
            recurrenceEndDate: args.recurrenceEndDate,
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
        if (args.tags !== undefined) patch.opsOwners = args.tags;
        if (args.businessAnalysts !== undefined) patch.businessAnalysts = args.businessAnalysts;
        if (args.crId !== undefined) patch.crId = args.crId;
        // `null` means "unassign", but `TaskUpdateSchema.systemId` rejects null; `undefined`
        // with the key present is what `updateTask` reads as a clear.
        if (args.systemId !== undefined) patch.systemId = args.systemId === null ? undefined : args.systemId;
        if (args.workType !== undefined) patch.workType = args.workType;
        if (args.jiraKey !== undefined) patch.jiraKey = args.jiraKey;
        if (args.reminders !== undefined) {
          patch.reminders = Array.isArray(args.reminders)
            ? args.reminders.map((r: any) => ({
                id: r.id || crypto.randomUUID(),
                date: String(r.date),
                time: r.time ? String(r.time) : undefined,
                note: r.note ? String(r.note) : undefined,
              }))
            : [];
        }
        if (args.isRecurring !== undefined) patch.isRecurring = Boolean(args.isRecurring);
        if (args.recurrenceFrequency !== undefined) patch.recurrenceFrequency = args.recurrenceFrequency;
        if (args.recurrenceInterval !== undefined) patch.recurrenceInterval = Number(args.recurrenceInterval);
        if (args.recurrenceDaysOfWeek !== undefined) patch.recurrenceDaysOfWeek = args.recurrenceDaysOfWeek;
        if (args.recurrenceEndDate !== undefined) patch.recurrenceEndDate = args.recurrenceEndDate;

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
        if (!args.crId) return JSON.stringify({ error: 'crId is required' });
        await reparentTask(args.taskId, args.crId, args.systemId ?? undefined, db);
        return JSON.stringify({
          success: true,
          message: `Đã di chuyển tác vụ (${args.taskId}) sang CR/hệ thống con mới.`,
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

      case 'create_change_request': {
        const targets = Array.isArray(args.targets)
          ? args.targets.map((t: any) => ({
              systemId: String(t.systemId),
              featureBranch: t.featureBranch ? String(t.featureBranch) : undefined,
            }))
          : [];

        const cr = await createChangeRequest(
          {
            code: args.code,
            name: args.name,
            type: args.type,
            status: args.status || 'Open',
            description: args.description,
            targets,
          },
          db
        );
        return JSON.stringify({
          success: true,
          message: `Đã tạo Change Request "${cr.code}" thành công.`,
          changeRequest: { id: cr.id, code: cr.code, name: cr.name, status: cr.status },
        });
      }

      case 'update_change_request': {
        if (!args.id) return JSON.stringify({ error: 'Change Request ID is required' });
        const patch: any = {};
        if (args.code !== undefined) patch.code = args.code;
        if (args.name !== undefined) patch.name = args.name;
        if (args.description !== undefined) patch.description = args.description;
        if (args.status !== undefined) patch.status = args.status;
        if (args.type !== undefined) patch.type = args.type;
        if (args.targets !== undefined) {
          patch.targets = Array.isArray(args.targets)
            ? args.targets.map((t: any) => ({
                systemId: String(t.systemId),
                featureBranch: t.featureBranch ? String(t.featureBranch) : undefined,
              }))
            : [];
        }

        await updateChangeRequest(args.id, patch, db);
        return JSON.stringify({
          success: true,
          message: `Đã cập nhật Change Request (${args.id}) thành công.`,
          updatedFields: Object.keys(patch),
        });
      }

      case 'delete_change_request': {
        if (!args.id) return JSON.stringify({ error: 'Change Request ID is required' });
        await deleteChangeRequest(args.id, db);
        return JSON.stringify({
          success: true,
          message: `Đã xóa Change Request (${args.id}) và tất cả tác vụ con liên quan.`,
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
            type: args.type,
            parentId: args.parentId,
            tags: args.tags,
            entityType: args.entityType,
            entityId: args.entityId,
            isPinned: Boolean(args.isPinned),
          },
          db
        );
        return JSON.stringify({
          success: true,
          message: `Đã tạo ${args.type === 'folder' ? 'thư mục' : 'ghi chú/tài liệu'} thành công.`,
          noteId: note.id,
        });
      }

      case 'update_note': {
        if (!args.id) return JSON.stringify({ error: 'Note ID is required' });
        const patch: any = {};
        if (args.title !== undefined) patch.title = args.title;
        if (args.body !== undefined) patch.body = args.body;
        if (args.type !== undefined) patch.type = args.type;
        if (args.parentId !== undefined) patch.parentId = args.parentId || undefined;
        if (args.tags !== undefined) patch.tags = args.tags;
        if (args.slug !== undefined) patch.slug = args.slug;
        if (args.entityType !== undefined) patch.entityType = args.entityType || undefined;
        if (args.entityId !== undefined) patch.entityId = args.entityId || undefined;
        if (args.isPinned !== undefined) patch.isPinned = Boolean(args.isPinned);

        await updateNote(args.id, patch, db);
        return JSON.stringify({
          success: true,
          message: `Đã cập nhật ghi chú (${args.id}).`,
        });
      }

      case 'delete_note': {
        if (!args.id) return JSON.stringify({ error: 'Note ID is required' });
        if (args.permanent) {
          await deleteNote(args.id, db);
          return JSON.stringify({
            success: true,
            message: `Đã xóa vĩnh viễn ghi chú (${args.id}).`,
          });
        } else {
          await softDeleteNote(args.id, db);
          return JSON.stringify({
            success: true,
            message: `Đã chuyển ghi chú (${args.id}) vào thùng rác.`,
          });
        }
      }

      case 'restore_note': {
        if (!args.id) return JSON.stringify({ error: 'id is required' });
        const existing = db.notes ? await db.notes.get(args.id) : null;
        if (!existing) return JSON.stringify({ error: `Note not found: ${args.id}` });
        await restoreNote(args.id, db);
        return JSON.stringify({
          success: true,
          message: `Đã khôi phục ghi chú/tài liệu "${existing.title || args.id}" từ thùng rác thành công.`,
        });
      }

      case 'batch_create_notes': {
        if (!Array.isArray(args.notes) || args.notes.length === 0) {
          return JSON.stringify({ error: 'notes array is required' });
        }
        const created = await batchCreateNotes(args.notes, db);
        return JSON.stringify({
          success: true,
          message: `Đã tạo ${created.length} ghi chú/tài liệu thành công.`,
          count: created.length,
          createdIds: created.map((n) => n.id),
        });
      }

      case 'manage_note_attachments': {
        const { action, noteId, attachmentId } = args;
        if (!action || !['add', 'delete', 'list'].includes(action)) {
          return JSON.stringify({ error: 'action must be "add", "delete", or "list"' });
        }

        if (action === 'list') {
          if (!noteId) return JSON.stringify({ error: 'noteId is required for list action' });
          const res = await getNoteWithAttachments(noteId, db);
          if (!res) return JSON.stringify({ error: `Note not found: ${noteId}` });
          return JSON.stringify({
            noteId,
            noteTitle: res.note.title || 'Untitled Note',
            attachmentsCount: res.attachments.length,
            attachments: res.attachments.map((a) => ({
              id: a.id,
              fileName: a.fileName,
              mimeType: a.mimeType,
              sizeBytes: a.sizeBytes,
              caption: a.caption ?? null,
              filePath: a.filePath ?? null,
              createdAt: a.createdAt,
            })),
          });
        }

        if (action === 'delete') {
          if (!attachmentId) return JSON.stringify({ error: 'attachmentId is required for delete action' });
          await deleteNoteAttachment(attachmentId, db);
          return JSON.stringify({
            success: true,
            message: `Đã xóa file đính kèm (${attachmentId}) thành công.`,
          });
        }

        if (action === 'add') {
          if (!noteId) return JSON.stringify({ error: 'noteId is required for add action' });
          const note = db.notes ? await db.notes.get(noteId) : null;
          if (!note) return JSON.stringify({ error: `Note not found: ${noteId}` });

          const mimeType = args.mimeType || 'image/png';
          const fileName = args.fileName || (args.filePath ? String(args.filePath).split(/[/\\]/).pop() : 'attachment.png') || 'attachment.png';

          let blobData: Blob;
          if (args.data) {
            const raw = String(args.data).replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
            try {
              const byteCharacters = atob(raw);
              const byteNumbers = new Array(byteCharacters.length);
              for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
              }
              blobData = new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
            } catch {
              blobData = new Blob([raw], { type: mimeType });
            }
          } else if (args.filePath) {
            blobData = new Blob([args.filePath], { type: mimeType });
          } else {
            blobData = new Blob(['attachment'], { type: mimeType });
          }

          const attachment = await addNoteAttachment(
            {
              noteId,
              fileName,
              mimeType,
              sizeBytes: blobData.size || 1,
              data: blobData,
              caption: args.caption,
              filePath: args.filePath,
            },
            db
          );

          return JSON.stringify({
            success: true,
            message: `Đã đính kèm tệp "${fileName}" vào ghi chú "${note.title || noteId}" thành công.`,
            attachment: {
              id: attachment.id,
              fileName: attachment.fileName,
              mimeType: attachment.mimeType,
              sizeBytes: attachment.sizeBytes,
              caption: attachment.caption ?? null,
            },
          });
        }

        return JSON.stringify({ error: `Unsupported action: ${action}` });
      }

      case 'auto_link_document': {
        if (!args.documentId) return JSON.stringify({ error: 'documentId is required' });
        const doc = db.notes ? await db.notes.get(args.documentId) : null;
        if (!doc) return JSON.stringify({ error: `Document not found: ${args.documentId}` });
        const [allTasks, allChangeRequests, allSystems] = await Promise.all([
          db.tasks ? db.tasks.toArray() : [],
          db.changeRequests ? db.changeRequests.toArray() : [],
          db.systems ? db.systems.toArray() : [],
        ]);
        const detected = detectReferencedEntities(doc.body, allTasks, allChangeRequests, allSystems);
        if (detected.length === 0) {
          return JSON.stringify({
            success: true,
            message: 'Không phát hiện tác vụ hoặc CR nào trong tài liệu để liên kết.',
            linkedCount: 0,
            detected: [],
          });
        }
        await linkEntitiesToDoc(doc.id, doc.title || 'Tài liệu', detected, db);
        return JSON.stringify({
          success: true,
          message: `Đã tự động liên kết ${detected.length} thực thể với tài liệu "${doc.title || doc.id}".`,
          linkedCount: detected.length,
          detected,
        });
      }

      case 'batch_plan_allocations': {
        if (!args.taskId) return JSON.stringify({ error: 'taskId is required' });
        if (!Array.isArray(args.allocations) || args.allocations.length === 0) {
          return JSON.stringify({ error: 'allocations array of { date, allocatedMinutes } is required' });
        }
        const task = db.tasks ? await db.tasks.get(args.taskId) : null;
        if (!task) return JSON.stringify({ error: `Task not found: ${args.taskId}` });
        for (const alloc of args.allocations) {
          if (alloc.date && typeof alloc.allocatedMinutes === 'number') {
            await upsertAllocation(args.taskId, String(alloc.date), Number(alloc.allocatedMinutes), db);
          }
        }
        return JSON.stringify({
          success: true,
          message: `Đã phân bổ thành công ${args.allocations.length} ngày làm việc cho tác vụ "${task.name}".`,
          plannedCount: args.allocations.length,
        });
      }

      case 'clear_allocations': {
        if (!db.plannedAllocations) return JSON.stringify({ error: 'PlannedAllocations table unavailable' });
        let allocations = await db.plannedAllocations.toArray();
        if (args.taskId) {
          allocations = allocations.filter((a) => a.taskId === args.taskId);
        }
        if (args.date) {
          allocations = allocations.filter((a) => a.date === args.date);
        }
        if (args.startDate) {
          allocations = allocations.filter((a) => a.date >= args.startDate);
        }
        if (args.endDate) {
          allocations = allocations.filter((a) => a.date <= args.endDate);
        }
        const deletedCount = allocations.length;
        if (deletedCount > 0) {
          await db.plannedAllocations.bulkDelete(allocations.map((a) => a.id));
        }
        return JSON.stringify({
          success: true,
          message: `Đã xóa ${deletedCount} mục phân bổ kế hoạch.`,
          deletedCount,
        });
      }

      case 'clear_dismissed_alerts': {
        await clearDismissedAlerts(db);
        return JSON.stringify({
          success: true,
          message: 'Đã thiết lập lại toàn bộ thông báo đã ẩn hôm nay.',
        });
      }

      case 'batch_create_tasks': {
        if (!Array.isArray(args.tasks) || args.tasks.length === 0) {
          return JSON.stringify({ error: 'tasks array is required' });
        }
        const createdTasks: any[] = [];
        for (const taskInput of args.tasks) {
          const t = await createTask(taskInput, db);
          createdTasks.push({ id: t.id, name: t.name, status: t.status });
        }
        return JSON.stringify({
          success: true,
          message: `Đã tạo ${createdTasks.length} tác vụ mới thành công.`,
          count: createdTasks.length,
          tasks: createdTasks,
        });
      }

      case 'batch_update_tasks': {
        if (!Array.isArray(args.taskIds) || args.taskIds.length === 0) {
          return JSON.stringify({ error: 'taskIds array is required' });
        }
        if (!args.patch || typeof args.patch !== 'object') {
          return JSON.stringify({ error: 'patch object is required' });
        }
        let updatedCount = 0;
        for (const taskId of args.taskIds) {
          try {
            await updateTask(taskId, args.patch, db);
            updatedCount++;
          } catch {
            // Continue with others
          }
        }
        return JSON.stringify({
          success: true,
          message: `Đã cập nhật ${updatedCount}/${args.taskIds.length} tác vụ.`,
          updatedCount,
          totalRequested: args.taskIds.length,
        });
      }

      case 'spawn_recurring_task_instance': {
        if (!args.taskId) return JSON.stringify({ error: 'taskId is required' });
        const task = db.tasks ? await db.tasks.get(args.taskId) : null;
        if (!task) return JSON.stringify({ error: `Task not found: ${args.taskId}` });
        if (!task.isRecurring) {
          return JSON.stringify({ error: `Tác vụ "${task.name}" không phải là tác vụ định kỳ.` });
        }
        const spawned = await spawnNextRecurringTask(task, db);
        if (!spawned) {
          return JSON.stringify({
            success: false,
            message: `Không thể tạo phiên bản tiếp theo cho "${task.name}".`,
          });
        }
        return JSON.stringify({
          success: true,
          message: `Đã tạo phiên bản tiếp theo cho tác vụ định kỳ "${task.name}": "${spawned.name}" (Hạn: ${spawned.deadline || 'Không có'}).`,
          spawnedTaskId: spawned.id,
          deadline: spawned.deadline,
        });
      }

      case 'manage_reminders': {
        if (!args.action) return JSON.stringify({ error: 'action parameter (add, remove, or list) is required' });
        if (!args.entityType || !['task', 'cr'].includes(args.entityType)) {
          return JSON.stringify({ error: 'entityType must be "task" or "cr"' });
        }
        if (!args.entityId) return JSON.stringify({ error: 'entityId is required' });

        let entityName = '';
        let currentReminders: ReminderItem[] = [];

        if (args.entityType === 'task') {
          const task = await db.tasks.get(args.entityId);
          if (!task) return JSON.stringify({ error: `Không tìm thấy tác vụ: ${args.entityId}` });
          entityName = task.name;
          currentReminders = task.reminders || [];
        } else if (args.entityType === 'cr') {
          const cr = await db.changeRequests.get(args.entityId);
          if (!cr) return JSON.stringify({ error: `Không tìm thấy CR: ${args.entityId}` });
          entityName = cr.name;
          currentReminders = cr.reminders || [];
        }

        if (args.action === 'list') {
          return JSON.stringify({
            entityType: args.entityType,
            entityId: args.entityId,
            entityName,
            remindersCount: currentReminders.length,
            reminders: currentReminders,
          });
        }

        if (args.action === 'add') {
          if (!args.date) return JSON.stringify({ error: 'date (YYYY-MM-DD) is required for adding reminder' });
          const newReminder: ReminderItem = {
            id: crypto.randomUUID(),
            date: String(args.date),
            time: args.time ? String(args.time) : undefined,
            note: args.note ? String(args.note) : undefined,
          };
          const updated = [...currentReminders, newReminder];

          if (args.entityType === 'task') await updateTask(args.entityId, { reminders: updated }, db);
          else if (args.entityType === 'cr') await updateChangeRequest(args.entityId, { reminders: updated }, db);

          return JSON.stringify({
            success: true,
            message: `Đã thêm nhắc nhở cho "${entityName}" vào ngày ${newReminder.date}${newReminder.time ? ` lúc ${newReminder.time}` : ''}.`,
            reminder: newReminder,
          });
        }

        if (args.action === 'remove') {
          if (!args.reminderId) return JSON.stringify({ error: 'reminderId is required to remove a reminder' });
          const updated = currentReminders.filter((r) => r.id !== args.reminderId);
          if (updated.length === currentReminders.length) {
            return JSON.stringify({ error: `Không tìm thấy nhắc nhở với ID: ${args.reminderId}` });
          }

          if (args.entityType === 'task') await updateTask(args.entityId, { reminders: updated }, db);
          else if (args.entityType === 'cr') await updateChangeRequest(args.entityId, { reminders: updated }, db);

          return JSON.stringify({
            success: true,
            message: `Đã xóa nhắc nhở khỏi "${entityName}".`,
            remainingRemindersCount: updated.length,
          });
        }

        return JSON.stringify({ error: `Invalid action: ${args.action}` });
      }

      case 'link_document': {
        if (!args.documentId) return JSON.stringify({ error: 'documentId is required' });
        if (!args.entityId) return JSON.stringify({ error: 'entityId is required' });
        if (!args.entityType || !['task', 'cr', 'system'].includes(args.entityType)) {
          return JSON.stringify({ error: 'entityType must be "task", "cr", or "system"' });
        }

        const doc = await db.notes.get(args.documentId);
        if (!doc) return JSON.stringify({ error: `Không tìm thấy tài liệu: ${args.documentId}` });

        let entityTitle = 'Entity';
        if (args.entityType === 'task') {
          const t = await db.tasks.get(args.entityId);
          if (!t) return JSON.stringify({ error: `Không tìm thấy tác vụ: ${args.entityId}` });
          entityTitle = t.name;
        } else if (args.entityType === 'cr') {
          const c = await db.changeRequests.get(args.entityId);
          if (!c) return JSON.stringify({ error: `Không tìm thấy CR: ${args.entityId}` });
          entityTitle = c.name;
        } else if (args.entityType === 'system') {
          const sys = await db.systems.get(args.entityId);
          if (!sys) return JSON.stringify({ error: `Không tìm thấy hệ thống: ${args.entityId}` });
          entityTitle = sys.name;
        }

        await linkEntitiesToDoc(
          args.documentId,
          doc.title || 'Untitled Document',
          [{ id: args.entityId, type: args.entityType, title: entityTitle }],
          db
        );

        return JSON.stringify({
          success: true,
          message: `Đã liên kết tài liệu "${doc.title || 'Untitled'}" với ${args.entityType} "${entityTitle}".`,
        });
      }

      case 'unlink_document': {
        if (!args.documentId) return JSON.stringify({ error: 'documentId is required' });
        if (!args.entityId) return JSON.stringify({ error: 'entityId is required' });
        if (!args.entityType || !['task', 'cr', 'system'].includes(args.entityType)) {
          return JSON.stringify({ error: 'entityType must be "task", "cr", or "system"' });
        }

        await unlinkEntityFromDoc(args.documentId, args.entityType, args.entityId, db);
        return JSON.stringify({
          success: true,
          message: `Đã hủy liên kết giữa tài liệu (${args.documentId}) và ${args.entityType} (${args.entityId}).`,
        });
      }

      case 'link_taskmate_to_knowledge': {
        const { taskMateEntityType, taskMateEntityId, setId, urn, docId, displayLabel } = args;
        if (!taskMateEntityType || !taskMateEntityId || !setId || !displayLabel) {
          return JSON.stringify({
            error: 'Missing required parameters: taskMateEntityType, taskMateEntityId, setId, displayLabel',
          });
        }
        if (!urn && !docId) {
          return JSON.stringify({
            error: 'Must provide at least one of urn or docId to create a KnowledgeLink',
          });
        }

        const link = await createKnowledgeLink(
          {
            taskMateEntityType,
            taskMateEntityId,
            setId,
            urn,
            docId,
            displayLabel,
          },
          db
        );

        return JSON.stringify({
          success: true,
          message: `Đã liên kết tri thức "${displayLabel}" với ${taskMateEntityType} (${taskMateEntityId}).`,
          link,
        });
      }

      case 'unlink_taskmate_knowledge': {
        if (args.linkId) {
          await deleteKnowledgeLink(args.linkId, db);
          return JSON.stringify({
            success: true,
            message: `Đã gỡ bỏ liên kết tri thức (${args.linkId}).`,
          });
        }

        if (args.taskMateEntityType && args.taskMateEntityId) {
          const links = await getKnowledgeLinksForEntity(args.taskMateEntityType, args.taskMateEntityId, db);
          const target = links.filter((l) => {
            if (args.urn && l.urn === args.urn) return true;
            if (args.docId && l.docId === args.docId) return true;
            return false;
          });
          if (target.length > 0) {
            for (const t of target) {
              await deleteKnowledgeLink(t.id, db);
            }
            return JSON.stringify({
              success: true,
              message: `Đã gỡ bỏ ${target.length} liên kết tri thức khớp điều kiện.`,
            });
          }
          return JSON.stringify({
            error: 'Không tìm thấy liên kết tri thức phù hợp để gỡ bỏ',
          });
        }

        return JSON.stringify({
          error: 'Must provide either linkId or taskMateEntityType + taskMateEntityId',
        });
      }

      case 'query_notifications': {
        const tasks = db.tasks ? await db.tasks.toArray() : [];
        // `evaluateNotifications` reads `changeRequests` unconditionally to label each alert
        // with its CR code; omitting it throws on the `crMap` build.
        const changeRequests = db.changeRequests ? await db.changeRequests.toArray() : [];
        const rules = db.capacityRules ? await db.capacityRules.toArray() : [];
        const overrides = db.capacityOverrides ? await db.capacityOverrides.toArray() : [];
        const allocations = db.plannedAllocations ? await db.plannedAllocations.toArray() : [];
        const workSessions = db.workSessions ? await db.workSessions.toArray() : [];
        const dismissedMap = await getDismissedAlerts(db);
        const settingRecord = db.settings ? await db.settings.get(NOTIFICATION_SETTINGS_KEY) : null;
        const settings = (settingRecord?.value as any) ?? DEFAULT_NOTIFICATION_SETTINGS;

        const alerts = evaluateNotifications({
          tasks,
          changeRequests,
          rules,
          overrides,
          allocations,
          workSessions,
          dismissedMap,
          todayDate: getTodayDateString(),
          settings,
        });

        const category = args.category;
        const filtered = category && category !== 'all'
          ? alerts.filter((a) => a.category === category)
          : alerts;

        return JSON.stringify({
          totalCount: alerts.length,
          returnedCount: filtered.length,
          notifications: filtered.map((a) => ({
            id: a.id,
            category: a.category,
            title: a.title,
            subtitle: a.subtitle,
            date: a.date,
            tagLabel: a.tagLabel,
            tagColor: a.tagColor,
          })),
        });
      }

      case 'dismiss_notification': {
        if (!args.alertKey) return JSON.stringify({ error: 'alertKey is required' });
        try {
          await dismissAlertToday(args.alertKey, getTodayDateString(), db);
          return JSON.stringify({
            success: true,
            message: `Đã tạm ẩn cảnh báo "${args.alertKey}" cho ngày hôm nay.`,
          });
        } catch (err: any) {
          return JSON.stringify({
            error: `Không thể bỏ qua cảnh báo: ${err?.message || String(err)}`,
          });
        }
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

      case 'retrieve_knowledge': {
        return executeKnowledgeRetrievalTool(args, db, signal);
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
        if (!args.filename || (!args.content && !args.script)) {
          return JSON.stringify({ error: 'filename and either content or script are required' });
        }

        const format = (args.format as ExportFormat) || inferFormatFromFilename(String(args.filename));

        if (args.script) {
          try {
            const blob = await executeDynamicFileScript(String(args.script), format, String(args.filename));
            return JSON.stringify({
              success: true,
              message: `Đã thực thi mã động và tạo tệp "${args.filename}". Thẻ tải tệp đã sẵn sàng trong giao diện chat để người dùng chọn vị trí lưu.`,
              filename: String(args.filename),
              format,
              sizeBytes: blob.size,
              content: String(args.script),
            });
          } catch (scriptErr: any) {
            return JSON.stringify({
              error: `Lỗi thực thi mã tạo tệp động: ${scriptErr?.message || String(scriptErr)}`,
            });
          }
        }

        if (format === 'pptx') {
          const exportResult = await exportPresentationAsFile(
            String(args.content),
            String(args.filename),
            args.title ? { presentationTitle: String(args.title) } : undefined,
            false // Do not auto-download silently in background
          );
          return JSON.stringify({
            success: true,
            message: `Đã tạo tệp trình chiếu "${exportResult.filename}" (${exportResult.slideCount} slides). Thẻ tải tệp đã sẵn sàng trong giao diện chat để người dùng chọn vị trí lưu.`,
            filename: exportResult.filename,
            format: exportResult.format,
            slideCount: exportResult.slideCount,
            sizeBytes: exportResult.sizeBytes,
            content: String(args.content),
          });
        }

        const exportResult = await exportContentAsFile(
          String(args.content),
          String(args.filename),
          format,
          false // Do not auto-download silently in background
        );

        return JSON.stringify({
          success: true,
          message: `Đã tạo tệp "${exportResult.filename}". Thẻ tải tệp đã sẵn sàng trong giao diện chat để người dùng chọn vị trí lưu.`,
          filename: exportResult.filename,
          format: exportResult.format,
          sizeBytes: exportResult.sizeBytes,
          content: String(args.content),
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
          presentationTitle ? { presentationTitle } : undefined,
          false // Do not auto-download silently in background
        );

        let serializedPptxContent = '';
        if (typeof contentOrSlides === 'string') {
          serializedPptxContent = contentOrSlides;
        } else if (Array.isArray(contentOrSlides)) {
          const titlePrefix = presentationTitle ? `# ${presentationTitle}\n\n---\n\n` : '';
          const slidesBody = contentOrSlides
            .map((s) => {
              let text = s.layout === 'title' ? `# ${s.title || 'Presentation'}\n` : `## ${s.title || 'Slide'}\n`;
              if (s.subtitle) text += `### ${s.subtitle}\n`;
              if (s.bullets && s.bullets.length > 0) {
                text += s.bullets.map((b: string) => `- ${b}`).join('\n') + '\n';
              }
              if (s.notes) text += `Note: ${s.notes}\n`;
              return text.trim();
            })
            .join('\n\n---\n\n');
          serializedPptxContent = `${titlePrefix}${slidesBody}`;
        }

        return JSON.stringify({
          success: true,
          message: `Đã tạo bản trình chiếu PowerPoint "${exportResult.filename}" (${exportResult.slideCount} slides). Thẻ tải tệp đã sẵn sàng trong giao diện chat để người dùng chọn vị trí lưu.`,
          filename: exportResult.filename,
          format: exportResult.format,
          slideCount: exportResult.slideCount,
          sizeBytes: exportResult.sizeBytes,
          content: serializedPptxContent || 'Presentation',
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
            attachedDocTitle = doc.title ?? null;
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
    if (err?.name === 'AbortError' || signal?.aborted) throw err;
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
  'create_change_request',
  'update_change_request',
  'delete_change_request',
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
  'restore_note',
  'batch_create_notes',
  'manage_note_attachments',
  'auto_link_document',
  'batch_plan_allocations',
  'clear_allocations',
  'clear_dismissed_alerts',
  'batch_create_tasks',
  'batch_update_tasks',
  'spawn_recurring_task_instance',
  'manage_reminders',
  'link_document',
  'unlink_document',
  'link_taskmate_to_knowledge',
  'unlink_taskmate_knowledge',
  'dismiss_notification',
  'patch_artifact_section',
  // Runs model-supplied JavaScript in the page realm — never without explicit approval.
  'generate_file',
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

export function isMutationTool(toolName: string, args?: Record<string, any>): boolean {
  const normalized = normalizeToolName(toolName);
  if (normalized === 'manage_reminders' && args?.action === 'list') {
    return false;
  }
  if (normalized === 'manage_note_attachments' && args?.action === 'list') {
    return false;
  }
  return MUTATION_TOOLS.has(normalized);
}

/**
 * Filters available tools dynamically based on conversation intent and context.
 * For knowledge queries or technical schema lookups, personal operational/mutation tools
 * (create_task, timer, log_work_session, etc.) are pruned to save massive prompt tokens.
 */
export function pruneToolsForContext(
  allTools: AiToolDefinition[],
  options: {
    isKnowledgeContinuation?: boolean;
    isTaskMateQuery?: boolean;
    isMutationTurn?: boolean;
  }
): AiToolDefinition[] {
  if (options.isMutationTurn) {
    return allTools;
  }

  if (options.isKnowledgeContinuation) {
    // Keep MCP tools and knowledge/doc inspection tools, exclude heavy personal task manipulation
    return allTools.filter((t) => {
      const name = normalizeToolName(t.function.name);
      // Exclude personal task/CR/timer mutations and operations
      if (
        isMutationTool(name) ||
        name === 'start_timer' ||
        name === 'pause_timer' ||
        name === 'stop_and_log_timer' ||
        name === 'discard_timer' ||
        name === 'query_worklogs' ||
        name === 'get_daily_schedule' ||
        name === 'check_capacity_feasibility' ||
        name === 'get_day_insight' ||
        name === 'generate_standup_report'
      ) {
        return false;
      }
      return true;
    });
  }

  if (options.isTaskMateQuery) {
    // Querying personal tasks: exclude mutation tools
    return allTools.filter((t) => !isMutationTool(t.function.name));
  }

  return allTools;
}


export function formatFieldChanges(args: Record<string, any>, ignoredKeys: string[] = ['id', 'taskId']): string {
  const fieldLabels: Record<string, string> = {
    name: 'Tên',
    title: 'Tiêu đề',
    status: 'Trạng thái',
    priority: 'Ưu tiên',
    deadline: 'Hạn chót',
    estimateMinutes: 'Ước tính',
    body: 'Nội dung',
    description: 'Mô tả',
    notes: 'Ghi chú',
    workType: 'Loại công việc',
    allocatedMinutes: 'Phút phân bổ',
    durationMinutes: 'Thời lượng',
    date: 'Ngày',
    time: 'Giờ',
    isPinned: 'Ghim',
    tags: 'Nhãn',
    action: 'Hành động',
    itemTitle: 'Mục',
    isRecurring: 'Định kỳ',
    recurrenceFrequency: 'Tần suất lặp',
    actualStartDate: 'Ngày bắt đầu thực tế',
    actualEndDate: 'Ngày kết thúc thực tế',
    opsOwners: 'Ops Owners',
    businessAnalysts: 'Business Analysts',
  };

  const ignored = new Set(ignoredKeys);
  const parts: string[] = [];

  for (const [key, val] of Object.entries(args)) {
    if (ignored.has(key) || val === undefined) continue;
    const label = fieldLabels[key] || key;
    let formattedVal = '';
    if (typeof val === 'string') {
      formattedVal = key === 'deadline' || key === 'date' ? val : `"${val}"`;
    } else if (typeof val === 'number') {
      formattedVal = key === 'estimateMinutes' ? `${val}p` : key === 'allocatedMinutes' || key === 'durationMinutes' ? `${val} phút` : String(val);
    } else if (typeof val === 'boolean') {
      formattedVal = val ? 'Có' : 'Không';
    } else if (Array.isArray(val)) {
      formattedVal = val.length > 0 ? val.map((v) => (typeof v === 'object' && v?.text ? v.text : typeof v === 'object' && v?.name ? v.name : String(v))).join(', ') : 'Trống';
    } else if (val === null) {
      formattedVal = 'Xóa/Rỗng';
    } else {
      formattedVal = JSON.stringify(val);
    }
    parts.push(`${label}: ${formattedVal}`);
  }

  return parts.join(', ');
}

export function describeToolMutation(toolName: string, args: Record<string, any>): string {
  const normalized = normalizeToolName(toolName);
  const changes = formatFieldChanges(args);
  switch (normalized) {
    case 'create_task':
      return `Tạo tác vụ mới: "${args.name || 'Chưa đặt tên'}"${args.priority ? ` [Ưu tiên: ${args.priority}]` : ''}${args.estimateMinutes ? ` [Ước tính: ${args.estimateMinutes}p]` : ''}${args.deadline ? ` [Hạn: ${args.deadline}]` : ''}`;
    case 'update_task':
      return `Cập nhật tác vụ (${args.id}): ${changes || 'không có thay đổi'}`;
    case 'update_task_checklist':
      return `Cập nhật checklist tác vụ (${args.taskId}): ${changes || `hành động ${args.action}`}`;
    case 'reparent_task':
      return `Chuyển tác vụ (${args.taskId}) sang CR/hệ thống con mới: ${changes}`;
    case 'delete_task':
      return `Xóa vĩnh viễn tác vụ (${args.id}) cùng các kế hoạch liên quan`;
    case 'create_change_request':
      return `Tạo Change Request mới: "${args.code || args.name || 'Chưa đặt tên'}"${args.type ? ` [Loại: ${args.type}]` : ''}`;
    case 'update_change_request':
      return `Cập nhật Change Request (${args.id}): ${changes || 'không có thay đổi'}`;
    case 'delete_change_request':
      return `Xóa Change Request (${args.id}) và tất cả tác vụ con liên quan`;
    case 'plan_allocation':
      return `Lên lịch làm việc: ${args.allocatedMinutes} phút vào ngày ${args.date} cho tác vụ (${args.taskId})`;
    case 'delete_allocation':
      return `Xóa lịch làm việc ngày ${args.date} của tác vụ (${args.taskId})`;
    case 'log_work_session':
      return `Ghi nhận thời gian làm việc: ${args.durationMinutes} phút vào ngày ${args.date || 'hôm nay'} cho tác vụ (${args.taskId})`;
    case 'update_work_session':
      return `Cập nhật nhật ký công việc (${args.id}): ${changes || ''}`;
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
      return `Tạo ${args.type === 'folder' ? 'thư mục' : 'ghi chú/tài liệu'}: "${args.title || 'Mục mới'}"`;
    case 'update_note':
      return `Cập nhật ghi chú/tài liệu (${args.id}): ${changes || ''}`;
    case 'delete_note':
      return `Xóa ${args.permanent ? 'vĩnh viễn' : 'vào thùng rác'} ghi chú (${args.id})`;
    case 'restore_note':
      return `Khôi phục ghi chú/tài liệu (${args.id}) từ thùng rác`;
    case 'batch_create_notes':
      return `Tạo hàng loạt ${Array.isArray(args.notes) ? args.notes.length : ''} ghi chú/tài liệu`;
    case 'manage_note_attachments': {
      if (args.action === 'add') {
        return `Đính kèm tệp "${args.fileName || args.filePath || 'tệp'}" vào ghi chú (${args.noteId})`;
      }
      if (args.action === 'delete') {
        return `Xóa tệp đính kèm (${args.attachmentId})`;
      }
      return `Xem danh sách tệp đính kèm của ghi chú (${args.noteId})`;
    }
    case 'auto_link_document':
      return `Quét và tự động liên kết các thực thể trong tài liệu (${args.documentId})`;
    case 'batch_plan_allocations':
      return `Phân bổ ${Array.isArray(args.allocations) ? args.allocations.length : ''} ngày làm việc cho tác vụ (${args.taskId})`;
    case 'clear_allocations':
      return `Xóa phân bổ công việc${args.taskId ? ` cho tác vụ (${args.taskId})` : ''}${args.date ? ` ngày ${args.date}` : ''}`;
    case 'clear_dismissed_alerts':
      return `Thiết lập lại toàn bộ cảnh báo đã ẩn hôm nay`;
    case 'batch_create_tasks':
      return `Tạo hàng loạt ${Array.isArray(args.tasks) ? args.tasks.length : ''} tác vụ mới`;
    case 'batch_update_tasks':
      return `Cập nhật hàng loạt ${Array.isArray(args.taskIds) ? args.taskIds.length : ''} tác vụ`;
    case 'spawn_recurring_task_instance':
      return `Tạo phiên bản tiếp theo cho tác vụ định kỳ (${args.taskId})`;
    case 'manage_reminders': {
      if (args.action === 'add') {
        return `Thêm nhắc nhở ngày ${args.date || ''}${args.time ? ` lúc ${args.time}` : ''} cho ${args.entityType || 'mục'} (${args.entityId})`;
      }
      if (args.action === 'remove') {
        return `Xóa nhắc nhở (${args.reminderId}) khỏi ${args.entityType || 'mục'} (${args.entityId})`;
      }
      return `Quản lý nhắc nhở cho ${args.entityType || 'mục'} (${args.entityId})`;
    }
    case 'link_document':
      return `Liên kết tài liệu (${args.documentId}) với ${args.entityType} (${args.entityId})`;
    case 'unlink_document':
      return `Hủy liên kết tài liệu (${args.documentId}) khỏi ${args.entityType} (${args.entityId})`;
    case 'link_taskmate_to_knowledge':
      return `Liên kết tri thức "${args.displayLabel || args.urn || args.docId}" với ${args.taskMateEntityType || 'thực thể'} (${args.taskMateEntityId})`;
    case 'unlink_taskmate_knowledge':
      return `Hủy liên kết tri thức ${args.linkId ? `(${args.linkId})` : `khỏi ${args.taskMateEntityType} (${args.taskMateEntityId})`}`;
    case 'dismiss_notification':
      return `Tạm ẩn cảnh báo (${args.alertKey}) trong ngày hôm nay`;
    default:
      return `Thực hiện thao tác: ${toolName}`;
  }
}

/**
 * Enriches mutation description with resolved human-readable entity names from db
 * (tasks, change requests, systems, notes) and formatted field value diffs.
 */
export async function describeToolMutationWithContext(
  toolName: string,
  args: Record<string, any>,
  db?: TaskPlannerDatabase
): Promise<string> {
  const normalized = normalizeToolName(toolName);
  const fallback = describeToolMutation(toolName, args);
  if (!db) return fallback;

  try {
    switch (normalized) {
      case 'update_task': {
        const taskId = args.id || args.taskId;
        const task = db.tasks ? await db.tasks.get(taskId) : null;
        if (!task) return fallback;
        const changes = formatFieldChanges(args);
        return `Cập nhật tác vụ "${task.name}": ${changes || 'không có thay đổi'}`;
      }

      case 'delete_task': {
        const taskId = args.id || args.taskId;
        const task = db.tasks ? await db.tasks.get(taskId) : null;
        if (!task) return fallback;
        return `Xóa vĩnh viễn tác vụ "${task.name}" cùng các kế hoạch liên quan`;
      }

      case 'reparent_task': {
        const taskId = args.taskId || args.id;
        const task = db.tasks ? await db.tasks.get(taskId) : null;
        if (!task) return fallback;
        let dest = '';
        if (args.crId && db.changeRequests) {
          const cr = await db.changeRequests.get(args.crId);
          if (cr) dest += ` CR "${cr.code}"`;
        }
        if (args.systemId && db.systems) {
          const sys = await db.systems.get(args.systemId);
          if (sys) dest += ` hệ thống "${sys.name}"`;
        }
        return `Chuyển tác vụ "${task.name}" sang${dest || ' vị trí mới'}`;
      }

      case 'update_task_checklist': {
        const taskId = args.taskId || args.id;
        const task = db.tasks ? await db.tasks.get(taskId) : null;
        if (!task) return fallback;
        const changes = formatFieldChanges(args);
        return `Cập nhật checklist cho tác vụ "${task.name}": ${changes || `hành động ${args.action}`}`;
      }

      case 'update_change_request': {
        const cr = db.changeRequests ? await db.changeRequests.get(args.id) : null;
        if (!cr) return fallback;
        const changes = formatFieldChanges(args);
        return `Cập nhật Change Request "${cr.code}": ${changes || 'không có thay đổi'}`;
      }

      case 'delete_change_request': {
        const cr = db.changeRequests ? await db.changeRequests.get(args.id) : null;
        if (!cr) return fallback;
        return `Xóa Change Request "${cr.code}" và tất cả tác vụ con liên quan`;
      }

      case 'plan_allocation': {
        const task = db.tasks ? await db.tasks.get(args.taskId) : null;
        if (!task) return fallback;
        return `Lên lịch làm việc: ${args.allocatedMinutes} phút vào ngày ${args.date} cho tác vụ "${task.name}"`;
      }

      case 'delete_allocation': {
        const task = args.taskId && db.tasks ? await db.tasks.get(args.taskId) : null;
        if (!task) return fallback;
        return `Xóa lịch làm việc ngày ${args.date} của tác vụ "${task.name}"`;
      }

      case 'log_work_session': {
        const task = db.tasks ? await db.tasks.get(args.taskId) : null;
        if (!task) return fallback;
        return `Ghi nhận thời gian làm việc: ${args.durationMinutes} phút vào ngày ${args.date || 'hôm nay'} cho tác vụ "${task.name}"`;
      }

      case 'start_timer':
      case 'pause_timer':
      case 'stop_and_log_timer':
      case 'discard_timer': {
        const task = db.tasks ? await db.tasks.get(args.taskId) : null;
        if (!task) return fallback;
        const actionMap: Record<string, string> = {
          start_timer: 'Bắt đầu bộ đếm giờ cho tác vụ',
          pause_timer: 'Tạm dừng bộ đếm giờ của tác vụ',
          stop_and_log_timer: 'Dừng bộ đếm giờ và lưu vào nhật ký công việc cho tác vụ',
          discard_timer: 'Hủy bỏ bộ đếm giờ của tác vụ',
        };
        return `${actionMap[normalized]} "${task.name}"`;
      }

      case 'update_note': {
        const note = db.notes ? await db.notes.get(args.id) : null;
        if (!note) return fallback;
        const changes = formatFieldChanges(args);
        return `Cập nhật ghi chú/tài liệu "${note.title || 'Chưa đặt tên'}": ${changes || 'không có thay đổi'}`;
      }

      case 'delete_note': {
        const note = db.notes ? await db.notes.get(args.id) : null;
        if (!note) return fallback;
        return `Xóa ${args.permanent ? 'vĩnh viễn' : 'vào thùng rác'} ghi chú/tài liệu "${note.title || 'Chưa đặt tên'}"`;
      }

      case 'restore_note': {
        const note = db.notes ? await db.notes.get(args.id) : null;
        if (!note) return fallback;
        return `Khôi phục ghi chú/tài liệu "${note.title || 'Chưa đặt tên'}" từ thùng rác`;
      }

      case 'manage_note_attachments': {
        const note = args.noteId && db.notes ? await db.notes.get(args.noteId) : null;
        const noteName = note ? `ghi chú "${note.title || 'Chưa đặt tên'}"` : `ghi chú (${args.noteId})`;
        if (args.action === 'add') {
          return `Đính kèm tệp "${args.fileName || args.filePath || 'tệp'}" vào ${noteName}`;
        }
        if (args.action === 'delete') {
          return `Xóa tệp đính kèm (${args.attachmentId})`;
        }
        return `Xem danh sách tệp đính kèm của ${noteName}`;
      }

      case 'auto_link_document': {
        const doc = db.notes ? await db.notes.get(args.documentId) : null;
        if (!doc) return fallback;
        return `Quét và tự động liên kết các thực thể trong tài liệu "${doc.title || 'Chưa đặt tên'}"`;
      }

      case 'batch_plan_allocations': {
        const task = db.tasks ? await db.tasks.get(args.taskId) : null;
        const taskName = task ? `tác vụ "${task.name}"` : `tác vụ (${args.taskId})`;
        return `Phân bổ ${Array.isArray(args.allocations) ? args.allocations.length : ''} ngày làm việc cho ${taskName}`;
      }

      case 'spawn_recurring_task_instance': {
        const task = db.tasks ? await db.tasks.get(args.taskId) : null;
        const taskName = task ? `tác vụ "${task.name}"` : `tác vụ (${args.taskId})`;
        return `Tạo phiên bản tiếp theo cho tác vụ định kỳ ${taskName}`;
      }

      case 'manage_reminders': {
        let entityName = '';
        if (args.entityType === 'task' && db.tasks) {
          const t = await db.tasks.get(args.entityId);
          if (t) entityName = `tác vụ "${t.name}"`;
        } else if (args.entityType === 'cr' && db.changeRequests) {
          const c = await db.changeRequests.get(args.entityId);
          if (c) entityName = `CR "${c.code}"`;
        } else if (args.entityType === 'system' && db.systems) {
          const sys = await db.systems.get(args.entityId);
          if (sys) entityName = `hệ thống "${sys.name}"`;
        }
        if (!entityName) return fallback;

        if (args.action === 'add') {
          return `Thêm nhắc nhở ngày ${args.date || ''}${args.time ? ` lúc ${args.time}` : ''} cho ${entityName}`;
        }
        if (args.action === 'remove') {
          return `Xóa nhắc nhở khỏi ${entityName}`;
        }
        return `Quản lý nhắc nhở cho ${entityName}`;
      }

      case 'link_document': {
        const doc = db.notes ? await db.notes.get(args.documentId) : null;
        let entityName = '';
        if (args.entityType === 'task' && db.tasks) {
          const t = await db.tasks.get(args.entityId);
          if (t) entityName = `tác vụ "${t.name}"`;
        } else if (args.entityType === 'cr' && db.changeRequests) {
          const c = await db.changeRequests.get(args.entityId);
          if (c) entityName = `CR "${c.code}"`;
        } else if (args.entityType === 'system' && db.systems) {
          const sys = await db.systems.get(args.entityId);
          if (sys) entityName = `hệ thống "${sys.name}"`;
        }
        if (doc && entityName) {
          return `Liên kết tài liệu "${doc.title || 'Chưa đặt tên'}" với ${entityName}`;
        }
        return fallback;
      }

      case 'unlink_document': {
        const doc = db.notes ? await db.notes.get(args.documentId) : null;
        let entityName = '';
        if (args.entityType === 'task' && db.tasks) {
          const t = await db.tasks.get(args.entityId);
          if (t) entityName = `tác vụ "${t.name}"`;
        } else if (args.entityType === 'cr' && db.changeRequests) {
          const c = await db.changeRequests.get(args.entityId);
          if (c) entityName = `CR "${c.code}"`;
        } else if (args.entityType === 'system' && db.systems) {
          const sys = await db.systems.get(args.entityId);
          if (sys) entityName = `hệ thống "${sys.name}"`;
        }
        if (doc && entityName) {
          return `Hủy liên kết tài liệu "${doc.title || 'Chưa đặt tên'}" khỏi ${entityName}`;
        }
        return fallback;
      }

      case 'link_taskmate_to_knowledge': {
        let entityName = '';
        if (args.taskMateEntityType === 'task' && db.tasks) {
          const t = await db.tasks.get(args.taskMateEntityId);
          if (t) entityName = `tác vụ "${t.name}"`;
        } else if (args.taskMateEntityType === 'cr' && db.changeRequests) {
          const c = await db.changeRequests.get(args.taskMateEntityId);
          if (c) entityName = `CR "${c.code}"`;
        } else if (args.taskMateEntityType === 'system' && db.systems) {
          const sys = await db.systems.get(args.taskMateEntityId);
          if (sys) entityName = `hệ thống "${sys.name}"`;
        }
        return `Liên kết tri thức "${args.displayLabel || args.urn || args.docId}" với ${entityName || `${args.taskMateEntityType} (${args.taskMateEntityId})`}`;
      }

      case 'unlink_taskmate_knowledge': {
        let entityName = '';
        if (args.taskMateEntityType === 'task' && db.tasks) {
          const t = await db.tasks.get(args.taskMateEntityId);
          if (t) entityName = `tác vụ "${t.name}"`;
        } else if (args.taskMateEntityType === 'cr' && db.changeRequests) {
          const c = await db.changeRequests.get(args.taskMateEntityId);
          if (c) entityName = `CR "${c.code}"`;
        } else if (args.taskMateEntityType === 'system' && db.systems) {
          const sys = await db.systems.get(args.taskMateEntityId);
          if (sys) entityName = `hệ thống "${sys.name}"`;
        }
        return `Hủy liên kết tri thức khỏi ${entityName || `${args.taskMateEntityType || 'thực thể'} (${args.taskMateEntityId || args.linkId})`}`;
      }

      default:
        return fallback;
    }
  } catch {
    return fallback;
  }
}
