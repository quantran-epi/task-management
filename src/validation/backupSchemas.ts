import { z } from 'zod';
import { isValidCalendarDate } from '../utils/date';
import { isValidUuid } from '../utils/uuid';
import {
  PROJECT_STATUSES,
  MILESTONE_STATUSES,
  TASK_STATUSES,
  TASK_PRIORITIES,
  tagListSchema,
  workTypeSchema,
  jiraKeySchema,
  reminderDateSchema,
  reminderNoteSchema,
} from './schemas';

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

export const BackupProjectRecordSchema = z.object({
  id: uuidSchema,
  name: z.string().trim().min(1, 'Name is required').max(120, 'Name must be 120 characters or less'),
  description: z.string().optional(),
  deadline: calendarDateSchema.optional(),
  notes: z.string().optional(),
  status: z.enum(PROJECT_STATUSES),
  opsOwners: tagListSchema.optional(),
  businessAnalysts: tagListSchema.optional(),
  documentLinks: z.array(httpUrlSchema).optional(),
  reminderDate: reminderDateSchema.optional(),
  reminderNote: reminderNoteSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const BackupMilestoneRecordSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  name: z.string().trim().min(1, 'Name is required').max(120, 'Name must be 120 characters or less'),
  description: z.string().optional(),
  deadline: calendarDateSchema.optional(),
  notes: z.string().optional(),
  status: z.enum(MILESTONE_STATUSES),
  opsOwners: tagListSchema.optional(),
  businessAnalysts: tagListSchema.optional(),
  reminderDate: reminderDateSchema.optional(),
  reminderNote: reminderNoteSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const BackupTaskRecordSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema.optional(),
  milestoneId: uuidSchema.optional(),
  name: z.string().trim().min(1, 'Name is required').max(120, 'Name must be 120 characters or less'),
  description: z.string().optional(),
  deadline: calendarDateSchema.optional(),
  notes: z.string().optional(),
  actualStartDate: calendarDateSchema.optional(),
  actualEndDate: calendarDateSchema.optional(),
  status: z.enum(TASK_STATUSES),
  progress: z.number().int().min(0).max(100),
  priority: z.enum(TASK_PRIORITIES),
  estimateMinutes: z.number().int().min(0).max(6000),
  workType: workTypeSchema.optional(),
  opsOwners: tagListSchema.optional(),
  businessAnalysts: tagListSchema.optional(),
  documentLinks: z.array(httpUrlSchema).optional(),
  jiraKey: jiraKeySchema.optional(),
  reminderDate: reminderDateSchema.optional(),
  reminderNote: reminderNoteSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const BackupCapacityRuleRecordSchema = z.object({
  id: uuidSchema,
  dayOfWeek: z.number().int().min(0).max(6),
  workMinutes: z.number().int().min(0).max(1440),
});

export const BackupCapacityOverrideRecordSchema = z.object({
  id: uuidSchema,
  date: calendarDateSchema,
  workMinutes: z.number().int().min(0).max(1440),
  note: z.string().max(200, 'Note must be 200 characters or less').optional(),
});

export const BackupPlannedAllocationRecordSchema = z.object({
  id: uuidSchema,
  taskId: uuidSchema,
  date: calendarDateSchema,
  allocatedMinutes: z.number().int().min(1).max(1440),
});

export const BackupWorkSessionRecordSchema = z
  .object({
    id: uuidSchema,
    taskId: uuidSchema,
    startTime: z.string().datetime({ message: 'startTime must be a valid ISO 8601 string' }),
    endTime: z.string().datetime({ message: 'endTime must be a valid ISO 8601 string' }).optional(),
    date: calendarDateSchema,
    durationMinutes: z.number().int().min(1).max(1440),
    note: z.string().trim().max(500, 'Note must be 500 characters or less').optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
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

