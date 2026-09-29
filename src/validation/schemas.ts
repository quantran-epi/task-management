import { z } from 'zod';
import { isValidCalendarDate } from '../utils/date';
import { isValidUuid } from '../utils/uuid';
import type {
  ProjectStatus,
  MilestoneStatus,
  TaskStatus,
  TaskPriority,
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

export const JIRA_KEY_REGEX = /^[A-Z][A-Z0-9]+-[0-9]+$/;
export const jiraKeySchema = z
  .string()
  .regex(JIRA_KEY_REGEX, 'Jira Key không hợp lệ (ví dụ: SHB-123)');

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

export const reminderDateSchema = calendarDateSchema;
export const reminderNoteSchema = z
  .string()
  .trim()
  .max(500, 'Ghi chú nhắc nhở tối đa 500 ký tự')
  .optional();

const uuidSchema = z
  .string()
  .refine(isValidUuid, {
    message: 'Must be a valid RFC 4122 v4 UUID',
  });

export const reminderTimeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const reminderItemSchema = z.object({
  id: uuidSchema,
  date: calendarDateSchema,
  time: z.string().regex(reminderTimeRegex, 'Giờ phải có định dạng HH:mm').optional(),
  note: z.string().trim().max(500, 'Ghi chú tối đa 500 ký tự').optional(),
});

export const remindersArraySchema = z
  .array(reminderItemSchema)
  .max(5, 'Tối đa 5 nhắc nhở cho mỗi mục')
  .optional();

const linkSchema = z
  .string()
  .min(1, 'Link must not be empty')
  .refine(
    (val) =>
      /^https?:\/\//i.test(val) || // HTTP/HTTPS URL
      /^file:\/\//i.test(val) || // file:// URI
      /^[A-Za-z]:\\/.test(val) || // Windows path: C:\...
      /^\//.test(val) || // Unix absolute path: /Users/...
      /^\\\\/.test(val), // UNC path: \\server\share
    { message: 'Liên kết phải là URL (http/https), đường dẫn thư mục, hoặc file URI.' }
  );

export const ProjectInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120, 'Name must be 120 characters or less'),
  description: z.string().optional(),
  deadline: calendarDateSchema.optional(),
  notes: z.string().optional(),
  status: z.enum(PROJECT_STATUSES).default('Open'),
  opsOwners: tagListSchema.optional(),
  businessAnalysts: tagListSchema.optional(),
  documentLinks: z.array(linkSchema).optional(),
  reminderDate: reminderDateSchema.optional(),
  reminderNote: reminderNoteSchema,
  reminders: remindersArraySchema,
});

export const ProjectUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().optional(),
  deadline: calendarDateSchema.optional(),
  notes: z.string().optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  opsOwners: tagListSchema.optional(),
  businessAnalysts: tagListSchema.optional(),
  documentLinks: z.array(linkSchema).optional(),
  reminderDate: reminderDateSchema.optional(),
  reminderNote: reminderNoteSchema,
  reminders: remindersArraySchema,
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
  reminderDate: reminderDateSchema.optional(),
  reminderNote: reminderNoteSchema,
  reminders: remindersArraySchema,
});

export const MilestoneUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().optional(),
  deadline: calendarDateSchema.optional(),
  notes: z.string().optional(),
  status: z.enum(MILESTONE_STATUSES).optional(),
  opsOwners: tagListSchema.optional(),
  businessAnalysts: tagListSchema.optional(),
  reminderDate: reminderDateSchema.optional(),
  reminderNote: reminderNoteSchema,
  reminders: remindersArraySchema,
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
  jiraKey: jiraKeySchema.optional(),
  opsOwners: tagListSchema.optional(),
  businessAnalysts: tagListSchema.optional(),
  documentLinks: z.array(linkSchema).optional(),
  reminderDate: reminderDateSchema.optional(),
  reminderNote: reminderNoteSchema,
  reminders: remindersArraySchema,
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
  jiraKey: jiraKeySchema.optional(),
  opsOwners: tagListSchema.optional(),
  businessAnalysts: tagListSchema.optional(),
  documentLinks: z.array(linkSchema).optional(),
  reminderDate: reminderDateSchema.optional(),
  reminderNote: reminderNoteSchema,
  reminders: remindersArraySchema,
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

export const WorkSessionInputSchema = z
  .object({
    taskId: uuidSchema,
    startTime: z.string().datetime({ message: 'startTime must be a valid ISO 8601 string' }),
    endTime: z.string().datetime({ message: 'endTime must be a valid ISO 8601 string' }).optional(),
    durationMinutes: z
      .number()
      .int()
      .min(1, 'Thời lượng tối thiểu 1 phút')
      .max(1440, 'Thời lượng tối đa 1440 phút (24h)'),
    note: z.string().trim().max(500, 'Ghi chú tối đa 500 ký tự').optional(),
  })
  .refine(
    (data) => {
      if (data.endTime) {
        return new Date(data.endTime).getTime() >= new Date(data.startTime).getTime();
      }
      return true;
    },
    {
      message: 'endTime must be greater than or equal to startTime',
      path: ['endTime'],
    }
  );

export type ProjectInput = z.input<typeof ProjectInputSchema>;
export type ProjectUpdate = z.input<typeof ProjectUpdateSchema>;
export type MilestoneInput = z.input<typeof MilestoneInputSchema>;
export type MilestoneUpdate = z.input<typeof MilestoneUpdateSchema>;
export type TaskInput = z.input<typeof TaskInputSchema>;
export type TaskUpdate = z.input<typeof TaskUpdateSchema>;
export type CapacityRuleInput = z.input<typeof CapacityRuleInputSchema>;
export type CapacityOverrideInput = z.input<typeof CapacityOverrideInputSchema>;
export type PlannedAllocationInput = z.input<typeof PlannedAllocationInputSchema>;
export type WorkSessionInput = z.input<typeof WorkSessionInputSchema>;


