import { z } from 'zod';
import { isValidCalendarDate } from '../utils/date';
import { isValidUuid } from '../utils/uuid';
import {
  ChatMessageGroundingSchema,
  type ChatMessageGrounding,
} from '../services/ai/groundedAnswerSchemas';
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

const isoDateTimeSchema = z.string().datetime({
  message: 'Must be a valid ISO 8601 datetime string',
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

export const BackupChatThreadRecordSchema = z
  .object({
    id: uuidSchema,
    scopeKey: z.string().min(1),
    scopeType: z.enum(['global', 'task', 'project', 'milestone', 'document']),
    entityId: uuidSchema.optional(),
    title: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .refine(
    (data) => {
      if (data.scopeType === 'document') {
        return Boolean(data.entityId);
      }
      return true;
    },
    {
      message: 'entityId is required for document-scoped chat threads',
      path: ['entityId'],
    }
  );

const FORBIDDEN_GROUNDING_KEYS = [
  'apiKey',
  'bearerToken',
  'systemPrompt',
  'rawModelResponse',
  'authorization',
] as const;

function findForbiddenKeyInObject(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') {
    return null;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findForbiddenKeyInObject(item);
      if (found) return found;
    }
    return null;
  }
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if ((FORBIDDEN_GROUNDING_KEYS as readonly string[]).includes(key)) {
      return key;
    }
    const nested = findForbiddenKeyInObject(value);
    if (nested) return nested;
  }
  return null;
}

export const BackupChatMessageRecordSchema = z
  .object({
    id: uuidSchema,
    threadId: uuidSchema,
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
    createdAt: z.string(),
    isContextBoundary: z.boolean().optional(),
    durationMs: z.number().optional(),
    tokenUsage: z
      .object({
        promptTokens: z.number().optional(),
        completionTokens: z.number().optional(),
        totalTokens: z.number().optional(),
      })
      .optional(),
    generatedFiles: z
      .array(
        z.object({
          id: z.string(),
          filename: z.string(),
          format: z.string(),
          sizeBytes: z.number(),
          slideCount: z.number().optional(),
          content: z.string().optional(),
        })
      )
      .optional(),
    grounding: z.unknown().optional() as z.ZodType<ChatMessageGrounding | undefined>,
  })
  .superRefine((msg, ctx) => {
    if (msg.grounding === undefined || msg.grounding === null) return;

    const forbiddenKey = findForbiddenKeyInObject(msg.grounding);
    if (forbiddenKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['grounding', forbiddenKey],
        message: `FORBIDDEN_FIELD: grounding must not contain secret or prompt field '${forbiddenKey}'`,
        params: { code: 'FORBIDDEN_FIELD' },
      });
      return;
    }

    if (typeof msg.grounding === 'object' && msg.grounding !== null) {
      const rawG = msg.grounding as Record<string, unknown>;
      if (Array.isArray(rawG.citations)) {
        if (rawG.citations.length > 20) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['grounding', 'citations'],
            message: 'GROUNDING_SIZE_EXCEEDED: citations count exceeds 20',
            params: { code: 'GROUNDING_SIZE_EXCEEDED' },
          });
        }
        rawG.citations.forEach((c: unknown, idx: number) => {
          if (c && typeof c === 'object' && typeof (c as any).citedExcerpt === 'string' && (c as any).citedExcerpt.length > 1200) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['grounding', 'citations', idx, 'citedExcerpt'],
              message: 'GROUNDING_SIZE_EXCEEDED: citation excerpt exceeds 1200 characters',
              params: { code: 'GROUNDING_SIZE_EXCEEDED' },
            });
          }
        });
      }
      if (Array.isArray(rawG.paths) && rawG.paths.length > 20) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['grounding', 'paths'],
          message: 'GROUNDING_SIZE_EXCEEDED: paths count exceeds 20',
          params: { code: 'GROUNDING_SIZE_EXCEEDED' },
        });
      }
      if (Array.isArray(rawG.conflicts) && rawG.conflicts.length > 10) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['grounding', 'conflicts'],
          message: 'GROUNDING_SIZE_EXCEEDED: conflicts count exceeds 10',
          params: { code: 'GROUNDING_SIZE_EXCEEDED' },
        });
      }
    }

    const parsedGrounding = ChatMessageGroundingSchema.safeParse(msg.grounding);
    if (!parsedGrounding.success) {
      parsedGrounding.error.issues.forEach((issue) => {
        ctx.addIssue({
          ...issue,
          path: ['grounding', ...issue.path],
        });
      });
    }
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
  preset: z
    .enum([
      'Chung',
      'TheoMoiTruong',
      'TheoModule',
      'TheoPhienBan',
      'BoSung',
      'TuyChinh',
    ])
    .optional(),
  scope: z
    .object({
      domain: z.string().min(1),
      environment: z.string().nullable(),
      version: z.string().nullable(),
    })
    .optional(),
  aliases: z.array(z.string()).optional(),
  relations: z
    .array(
      z.object({
        kind: z.enum(['EXTENDS', 'SUPPLEMENTS', 'SUPERSEDES']),
        targetSetId: uuidSchema,
      })
    )
    .optional(),
  isBase: z.boolean().optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const BackupPublishedDocumentRecordSchema = z.object({
  setId: uuidSchema,
  documentId: uuidSchema,
  lastKnownRemoteAt: isoDateTimeSchema,
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

export const BackupFrozenSubmittedDocumentSchema = z
  .object({
    documentId: uuidSchema,
    submittedContentHash: z.string().regex(/^[a-f0-9]{64}$/, 'Must be 64-character lowercase hex SHA-256 hash'),
  })
  .strict();

export const BackupPublishAttemptRecordSchema = z
  .object({
    id: uuidSchema,
    setId: uuidSchema,
    attemptKey: z.string().optional(),
    startedAt: isoDateTimeSchema,
    completedAt: isoDateTimeSchema.optional(),
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
    submittedDocuments: z
      .array(BackupFrozenSubmittedDocumentSchema)
      .refine(
        (items) => new Set(items.map((i) => i.documentId)).size === items.length,
        'Duplicate document IDs are not allowed in submittedDocuments'
      )
      .optional(),
  })
  .strict();

export const BackupDlpAuditRecordSchema = z.object({
  id: uuidSchema,
  setId: uuidSchema,
  attemptId: uuidSchema.optional(),
  ruleSetVersion: z.string().min(1),
  timestamp: isoDateTimeSchema,
  documentIds: z.array(uuidSchema),
  contentHashes: z.array(z.string().regex(/^[a-f0-9]{64}$/)),
  findingCountsByCategory: z.record(z.string(), z.number().int().nonnegative()),
  userAction: z.enum(['confirmed', 'cancelled', 'auto_passed']),
});

export const BackupKnowledgeLinkRecordSchema = z
  .object({
    id: uuidSchema,
    linkKey: z.string().min(1),
    taskMateEntityType: z.enum(['task', 'project', 'milestone']),
    taskMateEntityId: uuidSchema,
    setId: uuidSchema,
    urn: z.string().min(1).optional(),
    docId: uuidSchema.optional(),
    displayLabel: z.string().min(1),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .refine((data) => Boolean(data.urn || data.docId), {
    message: 'KnowledgeLink must contain at least one of urn or docId',
  });

export const BackupTelegramSettingsRecordSchema = z.object({
  id: z.literal('default'),
  botToken: z.string().optional().default(''),
  isEnabled: z.boolean(),
  autoStartOnLaunch: z.boolean(),
  defaultScope: z.enum(['full', 'knowledge_only', 'tasks_only', 'pure_llm']),
  maxHistoryTurns: z.number().int().min(0).max(100).optional(),
  updatedAt: z.string().optional(),
});

export const BackupTelegramWhitelistUserSchema = z.object({
  chatId: z.string().min(1),
  name: z.string(),
  status: z.enum(['active', 'blocked', 'pending']),
  dataScope: z.enum(['full', 'knowledge_only', 'tasks_only', 'pure_llm']),
  dailyLimit: z.number().int().nonnegative(),
  usedToday: z.number().int().nonnegative(),
  lastActiveDate: z.string(),
  isAdmin: z.boolean().optional(),
  maxHistoryTurns: z.number().int().min(0).max(100).optional(),
  sessionResetAt: z.string().optional(),
  overQuotaCommandsUsed: z.number().int().nonnegative().optional(),
  overQuotaAttempts: z.number().int().nonnegative().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});


