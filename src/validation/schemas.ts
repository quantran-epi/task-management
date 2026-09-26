import { z } from 'zod';
import { isValidCalendarDate } from '../utils/date';
import { isValidUuid } from '../utils/uuid';
import type {
  ProjectStatus,
  MilestoneStatus,
  TaskStatus,
  TaskPriority,
} from '../types/models';

export const PROJECT_STATUSES: [ProjectStatus, ...ProjectStatus[]] = [
  'Open',
  'In Progress',
  'Done',
  'Cancelled',
];

export const MILESTONE_STATUSES: [MilestoneStatus, ...MilestoneStatus[]] = [
  'Open',
  'In Progress',
  'Done',
  'Cancelled',
];

export const TASK_STATUSES: [TaskStatus, ...TaskStatus[]] = [
  'Open',
  'In Progress',
  'Resolved',
  'In Review',
  'Done',
  'Cancelled',
];

export const TASK_PRIORITIES: [TaskPriority, ...TaskPriority[]] = [
  'Low',
  'Medium',
  'High',
  'Urgent',
];

const calendarDateSchema = z
  .string()
  .refine(isValidCalendarDate, {
    message: 'Must be a valid calendar date in YYYY-MM-DD format',
  });

const uuidSchema = z
  .string()
  .refine(isValidUuid, {
    message: 'Must be a valid RFC 4122 v4 UUID',
  });

const httpUrlSchema = z
  .string()
  .url()
  .refine((url) => url.startsWith('http://') || url.startsWith('https://'), {
    message: 'URL must use http or https protocol',
  });

export const ProjectInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120, 'Name must be 120 characters or less'),
  description: z.string().optional(),
  deadline: calendarDateSchema.optional(),
  notes: z.string().optional(),
  status: z.enum(PROJECT_STATUSES).default('Open'),
});

export const ProjectUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().optional(),
  deadline: calendarDateSchema.optional(),
  notes: z.string().optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
});

export const MilestoneInputSchema = z.object({
  projectId: uuidSchema,
  name: z.string().trim().min(1, 'Name is required').max(120, 'Name must be 120 characters or less'),
  description: z.string().optional(),
  deadline: calendarDateSchema.optional(),
  notes: z.string().optional(),
  status: z.enum(MILESTONE_STATUSES).default('Open'),
});

export const MilestoneUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().optional(),
  deadline: calendarDateSchema.optional(),
  notes: z.string().optional(),
  status: z.enum(MILESTONE_STATUSES).optional(),
});

export const TaskInputSchema = z.object({
  projectId: uuidSchema.optional(),
  milestoneId: uuidSchema.optional(),
  name: z.string().trim().min(1, 'Name is required').max(120, 'Name must be 120 characters or less'),
  description: z.string().optional(),
  deadline: calendarDateSchema.optional(),
  notes: z.string().optional(),
  actualStartDate: calendarDateSchema.optional(),
  actualEndDate: calendarDateSchema.optional(),
  status: z.enum(TASK_STATUSES).default('Open'),
  progress: z.number().int().min(0).max(100).default(0),
  priority: z.enum(TASK_PRIORITIES).default('Medium'),
  estimateMinutes: z.number().int().min(0).max(6000).default(0),
  documentLinks: z.array(httpUrlSchema).optional(),
});

export const TaskUpdateSchema = z.object({
  projectId: uuidSchema.optional(),
  milestoneId: uuidSchema.optional(),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().optional(),
  deadline: calendarDateSchema.optional(),
  notes: z.string().optional(),
  actualStartDate: calendarDateSchema.optional(),
  actualEndDate: calendarDateSchema.optional(),
  status: z.enum(TASK_STATUSES).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  estimateMinutes: z.number().int().min(0).max(6000).optional(),
  documentLinks: z.array(httpUrlSchema).optional(),
});

export type ProjectInput = z.input<typeof ProjectInputSchema>;
export type ProjectUpdate = z.input<typeof ProjectUpdateSchema>;
export type MilestoneInput = z.input<typeof MilestoneInputSchema>;
export type MilestoneUpdate = z.input<typeof MilestoneUpdateSchema>;
export type TaskInput = z.input<typeof TaskInputSchema>;
export type TaskUpdate = z.input<typeof TaskUpdateSchema>;
