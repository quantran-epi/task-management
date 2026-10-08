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
  remindersArraySchema,
  timerSegmentSchema,
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

const linkSchema = z
  .string()
  .min(1, 'Link must not be empty')
  .refine(
    (val) =>
      /^https?:\/\//i.test(val) ||
      /^file:\/\//i.test(val) ||
      /^[A-Za-z]:\\/.test(val) ||
      /^\//.test(val) ||
      /^\\\\/.test(val),
    { message: 'Link must be a URL, folder path, or file URI.' }
  );

export const BackupProjectRecordSchema = z.object({
  id: uuidSchema,
  name: z.string().trim().min(1, 'Name is required').max(120, 'Name must be 120 characters or less'),
  description: z.string().optional(),
  deadline: calendarDateSchema.optional(),
  notes: z.string().optional(),
  status: z.enum(PROJECT_STATUSES),
  jiraEpicKey: jiraKeySchema.optional(),
  opsOwners: tagListSchema.optional(),
  businessAnalysts: tagListSchema.optional(),
  documentLinks: z.array(linkSchema).optional(),
  reminderDate: reminderDateSchema.optional(),
  reminderNote: reminderNoteSchema,
  reminders: remindersArraySchema,
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
  reminders: remindersArraySchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const BackupTaskChecklistItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  done: z.boolean(),
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
  documentLinks: z.array(linkSchema).optional(),
  jiraKey: jiraKeySchema.optional(),
  reminderDate: reminderDateSchema.optional(),
  reminderNote: reminderNoteSchema,
  reminders: remindersArraySchema,
  checklist: z.array(BackupTaskChecklistItemSchema).optional(),
  isRecurring: z.boolean().optional(),
  recurrenceFrequency: z.enum(['daily', 'weekly', 'monthly']).optional(),
  recurrenceInterval: z.number().int().min(1).max(365).optional(),
  recurrenceDaysOfWeek: z.array(z.number().int().min(1).max(7)).optional(),
  recurrenceEndDate: calendarDateSchema.optional(),
  parentRecurringTaskId: uuidSchema.optional(),
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
    segments: z.array(timerSegmentSchema).optional(),
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

export const BackupNoteRecordSchema = z.object({
  id: uuidSchema,
  type: z.enum(['quick_note', 'document', 'folder']).optional(),
  parentId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  slug: z.string().optional(),
  entityType: z.enum(['task', 'project', 'milestone']).optional(),
  entityId: uuidSchema.optional(),
  title: z.string().trim().max(120, 'Title must be 120 characters or less').optional(),
  body: z.string().max(50000, 'Body must be 50000 characters or less'),
  isPinned: z.boolean(),
  deletedAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const BackupNoteAttachmentRecordSchema = z.object({
  id: uuidSchema,
  noteId: uuidSchema,
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  sizeBytes: z.number().int().min(0).max(50 * 1024 * 1024),
  data: z
    .string()
    .refine((val) => /^data:image\/(png|jpeg|gif|webp);base64,/i.test(val), {
      message: 'data must be a valid base64 image data URL',
    })
    .optional(),
  filePath: z.string().optional(),
  caption: z.string().max(250).optional(),
  createdAt: z.string(),
});

export const BackupChatThreadRecordSchema = z.object({
  id: uuidSchema,
  scopeKey: z.string().min(1),
  scopeType: z.enum(['global', 'task', 'project', 'milestone']),
  entityId: uuidSchema.optional(),
  title: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const BackupChatMessageRecordSchema = z.object({
  id: uuidSchema,
  threadId: uuidSchema,
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  createdAt: z.string(),
  isContextBoundary: z.boolean().optional(),
});

export const BackupActiveTimerRecordSchema = z.object({
  taskId: uuidSchema,
  status: z.enum(['running', 'paused']),
  startedAt: z.number(),
  accumulatedMs: z.number(),
  sessionStartTime: z.string(),
  segments: z.array(timerSegmentSchema).optional(),
});

export const BackupSettingRecordSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
});

export const BackupDocumentSetRecordSchema = z.object({
  id: uuidSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().optional(),
  documentIds: z.array(uuidSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const BackupPublishedDocumentRecordSchema = z.object({
  setId: uuidSchema,
  documentId: uuidSchema,
  lastKnownRemoteAt: z.string(),
  publishedContentHash: z.string().regex(/^[a-f0-9]{64}$/),
  activeSnapshotId: uuidSchema.optional(),
  activeAttemptId: uuidSchema.optional(),
  lastPrimaryState: z
    .enum([
      'Never published',
      'In sync',
      'Local changes',
      'Publishing',
      'Warning',
      'Failed',
    ])
    .optional(),
});

export const BackupPublishAttemptRecordSchema = z.object({
  id: uuidSchema,
  setId: uuidSchema,
  attemptKey: z.string().optional(),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  status: z.enum([
    'Never published',
    'In sync',
    'Local changes',
    'Publishing',
    'Warning',
    'Failed',
  ]),
  addedCount: z.number().int().nonnegative(),
  changedCount: z.number().int().nonnegative(),
  removedCount: z.number().int().nonnegative(),
  unchangedCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  errorCode: z.string().max(80).optional(),
  errorMessage: z.string().max(240).optional(),
});

export const BackupDlpAuditRecordSchema = z.object({
  id: uuidSchema,
  setId: uuidSchema,
  attemptId: uuidSchema.optional(),
  ruleSetVersion: z.string().min(1),
  timestamp: z.string(),
  documentIds: z.array(uuidSchema),
  contentHashes: z.array(z.string().regex(/^[a-f0-9]{64}$/)),
  findingCountsByCategory: z.record(z.string(), z.number().int().nonnegative()),
  userAction: z.enum(['confirmed', 'cancelled', 'auto_passed']),
});


