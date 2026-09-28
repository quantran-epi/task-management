import { z } from 'zod';
import { isValidCalendarDate } from '../utils/date';
import { isValidUuid } from '../utils/uuid';
import type {
  ProjectStatus,
  MilestoneStatus,
  TaskStatus,
  TaskPriority,
  WorkType,
} from '../types/models';

export const WORK_TYPES = [
  'code',
  'document',
  'meeting',
  'support_testing',
  'investigate',
  'configuration',
  'review_code',
] as const;

export const workTypeSchema = z.enum(WORK_TYPES);

export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const tag of tags) {
    const trimmed = tag.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      result.push(trimmed);
    }
  }

  return result;
}

export const tagListSchema = z
  .array(z.string().trim().max(50, 'Tên thẻ tối đa 50 ký tự'))
  .max(10, 'Tối đa 10 thẻ cho mỗi trường')
  .transform(normalizeTags);

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
  opsOwners: tagListSchema.optional(),
  businessAnalysts: tagListSchema.optional(),
});

export const ProjectUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().optional(),
  deadline: calendarDateSchema.optional(),
  notes: z.string().optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  opsOwners: tagListSchema.optional(),
  businessAnalysts: tagListSchema.optional(),
});

export const MilestoneInputSchema = z.object({
  projectId: uuidSchema,
  name: z.string().trim().min(1, 'Name is required').max(120, 'Name must be 120 characters or less'),
  description: z.string().optional(),
  deadline: calendarDateSchema.optional(),
  notes: z.string().optional(),
  status: z.enum(MILESTONE_STATUSES).default('Open'),
  opsOwners: tagListSchema.optional(),
  businessAnalysts: tagListSchema.optional(),
});

export const MilestoneUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().optional(),
  deadline: calendarDateSchema.optional(),
  notes: z.string().optional(),
  status: z.enum(MILESTONE_STATUSES).optional(),
  opsOwners: tagListSchema.optional(),
  businessAnalysts: tagListSchema.optional(),
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
  workType: workTypeSchema.default('code'),
  opsOwners: tagListSchema.optional(),
  businessAnalysts: tagListSchema.optional(),
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
  workType: workTypeSchema.optional(),
  opsOwners: tagListSchema.optional(),
  businessAnalysts: tagListSchema.optional(),
  documentLinks: z.array(httpUrlSchema).optional(),
});

export const CapacityRuleInputSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  workMinutes: z.number().int().min(0).max(1440),
});

export const CapacityOverrideInputSchema = z.object({
  date: calendarDateSchema,
  workMinutes: z.number().int().min(0).max(1440),
  note: z.string().max(200, 'Note must be 200 characters or less').optional(),
});

export const PlannedAllocationInputSchema = z.object({
  taskId: uuidSchema,
  date: calendarDateSchema,
  allocatedMinutes: z.number().int().min(1).max(1440),
});

export type ProjectInput = z.input<typeof ProjectInputSchema>;
export type ProjectUpdate = z.input<typeof ProjectUpdateSchema>;
export type MilestoneInput = z.input<typeof MilestoneInputSchema>;
export type MilestoneUpdate = z.input<typeof MilestoneUpdateSchema>;
export type TaskInput = z.input<typeof TaskInputSchema>;
export type TaskUpdate = z.input<typeof TaskUpdateSchema>;
export type CapacityRuleInput = z.input<typeof CapacityRuleInputSchema>;
export type CapacityOverrideInput = z.input<typeof CapacityOverrideInputSchema>;
export type PlannedAllocationInput = z.input<typeof PlannedAllocationInputSchema>;

