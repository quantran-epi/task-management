import { z } from 'zod';
import { isValidCalendarDate } from '../utils/date';
import { isValidUuid } from '../utils/uuid';
import { AiSkillVersionStatusSchema } from './aiOfficeSchemas';
import {
  ChatMessageGroundingSchema,
  type ChatMessageGrounding,
} from '../services/ai/groundedAnswerSchemas';
import {
  TASK_STATUSES,
  TASK_PRIORITIES,
  SYSTEM_TYPES,
  CR_TYPES,
  CR_STATUSES,
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

export const BackupTaskChecklistItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  done: z.boolean(),
});

export const BackupTaskRecordSchema = z.object({
  id: uuidSchema,
  crId: uuidSchema,
  systemId: uuidSchema.optional(),
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
  type: z.enum(['quick_note', 'document', 'folder', 'diagram']).optional(),
  parentId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  slug: z.string().optional(),
  entityType: z.enum(['task', 'cr', 'system']).optional(),
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
    scopeType: z.enum(['global', 'task', 'cr', 'system', 'document', 'team']),
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

const FORBIDDEN_BACKUP_KEYS = new Set([
  'apiKey', 'apikey', 'bearerToken', 'token', 'accessToken', 'refreshToken',
  'passphrase', 'password', 'secret', 'pat', 'endpointCredential', 'authorization',
  'systemPrompt', 'prompt', 'rawModelResponse', 'rawToolResponse', 'partialBuffer',
  'streamingText', 'error', 'stack', 'diagnostics', 'runtime', 'attachments',
]);

function findForbiddenBackupKey(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findForbiddenBackupKey(item);
      if (found) return found;
    }
    return null;
  }
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lower = key.toLowerCase();
    if (FORBIDDEN_BACKUP_KEYS.has(key) || FORBIDDEN_BACKUP_KEYS.has(lower) || /(^|_)(api[_-]?key|bearer[_-]?token|access[_-]?token|refresh[_-]?token|passphrase|password|secret|pat|prompt|partial|raw.*response|stack|diagnostic|error)(_|$)/i.test(key)) {
      return key;
    }
    const nested = findForbiddenBackupKey(value);
    if (nested) return nested;
  }
  return null;
}

const backupConfigValueSchema = z.union([z.string().max(200), z.boolean(), z.number().finite()]);
const backupTabConfigSchema = z.strictObject({
  model: z.string().max(200).optional(),
  analysisMode: z.boolean().optional(),
  mcpEnabled: z.boolean().optional(),
  knowledgeEnabled: z.boolean().optional(),
  promptContextOptions: z.record(z.string(), backupConfigValueSchema).optional(),
});

export const BackupChatTabRecordSchema = z
  .strictObject({
    id: uuidSchema,
    threadId: uuidSchema,
    scopeKey: z.string().min(1),
    type: z.enum(['chat']),
    title: z.string().trim().min(1).max(200),
    order: z.number().int().nonnegative(),
    active: z.boolean().optional(),
    status: z.enum(['idle', 'processing', 'interrupted', 'error', 'stale', 'complete']).optional(),
    checkpoint: z.strictObject({
      requestId: uuidSchema,
      step: z.string().min(1).optional(),
      startedAt: z.string(),
      status: z.enum(['interrupted', 'error']).optional(),
    }).optional(),
    config: backupTabConfigSchema.optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .superRefine((tab, ctx) => {
    const forbiddenKey = findForbiddenBackupKey(tab);
    if (forbiddenKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [forbiddenKey],
        message: `FORBIDDEN_FIELD: backup tab contains forbidden field '${forbiddenKey}'`,
        params: { code: 'FORBIDDEN_FIELD' },
      });
    }
  });

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
    // WR-10: cache tokens are charged as input (D-09), so a plain `z.object` here would
    // silently STRIP them on restore. Declared optional so a pre-38 row still validates.
    tokenUsage: z
      .object({
        promptTokens: z.number().optional(),
        completionTokens: z.number().optional(),
        totalTokens: z.number().optional(),
        cacheReadTokens: z.number().optional(),
        cacheCreationTokens: z.number().optional(),
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
    // Phase 34 D-31: AI Office attribution. Declared explicitly — this is a plain z.object,
    // so an undeclared key is silently stripped and restored messages render unattributed.
    agentId: uuidSchema.optional(),
    agentName: z.string().max(60).optional(),
    agentKind: z.enum(['lead', 'employee']).optional(),
    // `steer` is retained ONLY so a pre-37.1 backup still restores; nothing writes it now.
  messageKind: z.enum(['instruction', 'report', 'synthesis', 'plan', 'steer']).optional(),
    // Phase 36 D-14/D-18: HISTORICAL assignee attribution. Never live-validated — a backup
    // taken after deleting the employee must still import.
    targetAgentId: uuidSchema.optional(),
    // Phase 37 D-22/D-24: ledger links. Declared explicitly for the same reason as the block
    // above — this is a plain z.object, so an undeclared key is silently stripped and a
    // restored report loses its assignment link. Historical: never live-validated.
    batchId: uuidSchema.optional(),
    assignmentId: uuidSchema.optional(),
    attemptNo: z.number().int().positive().optional(),
    runStatus: z
      .enum(['queued', 'running', 'done', 'stopped', 'error', 'skipped', 'blocked', 'needs-input'])
      .optional(),
    stopReason: z
      .enum([
        'user-per-agent',
        'user-abort',
        'team-deleted',
        'provider',
        'tool-limit',
        'budget-pause',
        'leader-amend',
        'none',
      ])
      .optional(),
    incomplete: z.boolean().optional(),
    supersededByMessageId: uuidSchema.optional(),
    supersededAt: z.string().optional(),
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

    // Size bounds live in `ChatMessageGroundingSchema` alone (500 citations, 16000-char
    // excerpt, 50 paths, 20 conflicts). Duplicating them here at tighter values made the
    // app's own export unrestorable: a grounding the app can persist failed import.
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
  presentationRevision: z.number().int().nonnegative().optional(),
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
    taskMateEntityType: z.enum(['task', 'cr', 'system']),
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
  aiModel: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// Phase 31.1: Backup schemas for System and ChangeRequest (ENT-SYS-01, ENT-CR-01)
export const BackupSystemRecordSchema = z.object({
  id: uuidSchema,
  name: z.string().trim().min(1, 'Name is required').max(120, 'Name must be 120 characters or less'),
  code: z.string().trim().min(1, 'Code is required').max(64, 'Code must be 64 characters or less'),
  parentId: z.string().nullable(),
  type: z.enum(SYSTEM_TYPES),
  description: z.string().optional(),
  sshConfigId: uuidSchema.optional(),
  remoteRepoPath: z.string().optional(),
  defaultBaseBranch: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const BackupChangeRequestRecordSchema = z.object({
  id: uuidSchema,
  name: z.string().trim().min(1, 'Name is required').max(120, 'Name must be 120 characters or less'),
  code: z.string().trim().min(1, 'Code is required').max(64, 'Code must be 64 characters or less'),
  description: z.string().optional(),
  deadline: calendarDateSchema.optional(),
  status: z.enum(CR_STATUSES),
  type: z.enum(CR_TYPES),
  targets: z.array(
    z.object({
      systemId: uuidSchema,
      featureBranch: z.string().optional(),
    })
  ),
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

// Phase 34: AI Office backup schemas (AIO-BACKUP-01). `strictObject` mirrors
// `BackupChatTabRecordSchema`: an undeclared key such as `systemPrompt` is rejected
// rather than silently stripped (T-34-28). Free text is limited to `persona` and `body`,
// neither of which collides with FORBIDDEN_BACKUP_KEYS.
const aiNameSchema = z.string().trim().min(1, 'Name is required').max(60, 'Name must be 60 characters or less');
const aiRoleSchema = z.string().trim().min(1, 'Role is required').max(60, 'Role must be 60 characters or less');
const aiCapabilitySchema = z
  .string()
  .trim()
  .min(1, 'Capability is required')
  .max(300, 'Capability must be 300 characters or less');
const aiSkillDescriptionSchema = z
  .string()
  .trim()
  .min(1, 'Description is required')
  .max(300, 'Description must be 300 characters or less');
const aiPersonaSchema = z.string().trim().min(1, 'Persona is required');
const aiModelSchema = z.string().trim().min(1, 'Model is required');
const aiTokensSchema = z.number().int().nonnegative('Token count must be zero or greater');

export const BackupAiEmployeeRecordSchema = z.strictObject({
  id: uuidSchema,
  name: aiNameSchema,
  role: aiRoleSchema,
  capability: aiCapabilitySchema,
  persona: aiPersonaSchema,
  model: aiModelSchema,
  skillId: uuidSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const BackupAiLeadRecordSchema = z.strictObject({
  id: uuidSchema,
  name: aiNameSchema,
  role: aiRoleSchema,
  capability: aiCapabilitySchema,
  persona: aiPersonaSchema,
  model: aiModelSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const BackupAiSkillRecordSchema = z.strictObject({
  id: uuidSchema,
  name: aiNameSchema,
  description: aiSkillDescriptionSchema,
  body: z.string().trim().min(1, 'Body is required'),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const BackupAiTeamRecordSchema = z.strictObject({
  id: uuidSchema,
  name: aiNameSchema,
  /** D-05: an empty group has no leader. D-09: the lock timestamp round-trips verbatim. */
  leadId: uuidSchema.optional(),
  leaderLockedAt: z.string().optional(),
  status: z.enum(['active', 'idle']),
  budgetTokens: aiTokensSchema,
  autoSplitEnabled: z.boolean().optional(),
  autoApproveMutations: z.boolean().optional(),
  /** Phase 37 D-03/D-02: per-team run concurrency. Absent means the default; range 1-12. */
  concurrencyLimit: z.number().int().min(1).max(12).optional(),
  /**
   * Phase 38 D-04/D-05: per-team override of the single warn threshold percentage.
   * Absent means the global default; the 1-100 band mirrors `warnThresholdPctSchema`.
   */
  budgetWarnThresholdPct: z.number().int().min(1).max(100).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const BackupAiTeamMemberRecordSchema = z.strictObject({
  id: uuidSchema,
  teamId: uuidSchema,
  agentId: uuidSchema,
  role: z.enum(['lead', 'employee']),
  budgetTokens: aiTokensSchema,
  usedTokens: aiTokensSchema,
  /** Phase 38 D-23: split usage. Optional so a pre-38 export still restores. */
  inputTokens: aiTokensSchema.optional(),
  outputTokens: aiTokensSchema.optional(),
  /** D-10/D-24: true when the counters came from the local tokenizer, not the provider. */
  usageEstimated: z.boolean().optional(),
});

export const BackupAiTeamLinkRecordSchema = z.strictObject({
  id: uuidSchema,
  teamId: uuidSchema,
  itemType: z.enum(['cr', 'task', 'system', 'note', 'document']),
  itemId: uuidSchema,
  createdAt: z.string(),
});

/** Phase 36 (D-16, D-22): a stored revision round-trips verbatim — `status` is never normalized. */
export const BackupAiSkillVersionRecordSchema = z
  .strictObject({
    id: uuidSchema,
    skillId: uuidSchema,
    /**
     * Phase 39 D-14: a pending row omits the number entirely (it is assigned at approval).
     * Optional so a pre-39 export still restores; `positive()` stays, so `0` is still refused.
     */
    version: z.number().int().positive().optional(),
    /** Phase 39 D-15: `0` is a legal baseline, so `nonnegative()`. Optional for the same reason. */
    baseVersion: z.number().int().nonnegative().optional(),
    status: AiSkillVersionStatusSchema,
    name: aiNameSchema,
    description: aiSkillDescriptionSchema,
    body: z.string().trim().min(1, 'Body is required'),
    evidence: z.string().max(2000, 'Evidence must be at most 2000 characters').optional(),
    createdAt: z.string(),
    decidedAt: z.string().optional(),
  })
  /**
   * WR-05: the number and the status are one invariant, so they are checked together. An
   * approved row without a number would restart numbering at 1 and mint a second v1; a
   * non-approved row with a number is the pre-39 shape that made `max(approved) + 1` collide.
   */
  .superRefine((row, ctx) => {
    if (row.status === 'approved' && row.version === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['version'],
        message: 'An approved skill version must carry a version number',
      });
    }
    if (row.status !== 'approved' && row.version !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['version'],
        message: 'Only an approved skill version may carry a version number',
      });
    }
  });

/**
 * Phase 37 (D-22, D-24, D-26): the run ledger.
 *
 * `strictObject` throughout: an undeclared key is rejected rather than silently stripped.
 * `diagnosticDetail` (D-17) is deliberately absent — the export projection removes it before
 * the row ever reaches the envelope, and a hand-crafted payload carrying it is refused here.
 */
const aiTeamPlanEntrySchema = z.strictObject({
  agentId: uuidSchema,
  /** Snapshot at plan time (D-25) — the roster may change before a retry. */
  agentName: aiNameSchema,
  task: z.string(),
});

export const BackupAiTeamBatchRecordSchema = z.strictObject({
  id: uuidSchema,
  teamId: uuidSchema,
  threadId: uuidSchema,
  batchIndex: z.number().int().nonnegative(),
  userRequest: z.string(),
  leadId: uuidSchema,
  planSnapshot: z.strictObject({
    original: z.array(aiTeamPlanEntrySchema),
    edited: z.array(aiTeamPlanEntrySchema).optional(),
  }),
  planDecision: z.enum(['approved', 'rejected', 'auto']),
  startedAt: z.string(),
  endedAt: z.string().optional(),
  phaseAtEnd: z
    .enum([
      'idle',
      'ready',
      'lead-thinking',
      'awaiting-plan',
      'batch-running',
      'awaiting-budget',
      'awaiting-mutation-approval',
      'lead-synthesizing',
    ])
    .optional(),
  abortedBy: z.enum(['user', 'team-deleted', 'app-exit', 'none']),
});

export const BackupAiTeamAssignmentRecordSchema = z.strictObject({
  id: uuidSchema,
  batchId: uuidSchema,
  agentId: uuidSchema,
  /** Snapshot (D-25) — never live-validated against the current roster. */
  agentName: aiNameSchema,
  skillId: uuidSchema.optional(),
  skillVersion: z.number().int().positive().optional(),
  model: aiModelSchema,
  task: z.string(),
  // D-24: `blocked` and `needs-input` are legal stored states even before their flows ship.
  runStatus: z.enum([
    'queued',
    'running',
    'done',
    'stopped',
    'error',
    'skipped',
    'blocked',
    'needs-input',
  ]),
  stopReason: z.enum([
    'user-per-agent',
    'user-abort',
    'team-deleted',
    'provider',
    'tool-limit',
    'budget-pause',
    'leader-amend',
    'none',
  ]),
  attemptNo: z.number().int().positive(),
  retryOfAssignmentId: uuidSchema.optional(),
  incomplete: z.boolean(),
  queuedAt: z.string(),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  instructionMessageId: uuidSchema.optional(),
  reportMessageId: uuidSchema.optional(),
  // Retained ONLY so a pre-37.1 backup restores; the field is no longer written or read.
  steerMessageIds: z.array(uuidSchema).optional(),
  tokenUsage: z
    .object({
      promptTokens: z.number().optional(),
      completionTokens: z.number().optional(),
      totalTokens: z.number().optional(),
      // WR-10: same strip hazard as the chat-message sub-schema above.
      cacheReadTokens: z.number().optional(),
      cacheCreationTokens: z.number().optional(),
    })
    .optional(),
  /**
   * Phase 38 D-23: the post-38 split-usage columns on the attempt row. `tokenUsage` above is
   * retained only so a pre-38 backup restores; these three are what phase 38 writes.
   */
  inputTokens: aiTokensSchema.optional(),
  outputTokens: aiTokensSchema.optional(),
  usageEstimated: z.boolean().optional(),
  toolCallCount: z.number().int().nonnegative().optional(),
  /** D-24 handoff: upstream assignments that must finish first. */
  dependsOn: z.array(uuidSchema).optional(),
});

/**
 * 37.1 R1/WR-07: the team message log. `seq` is per team and monotonic; `to` is the routing
 * list and must never be empty (invariant L1). `replyToId` is optional so a backup taken
 * before R14 still restores.
 */
export const BackupTeamMessageRecordSchema = z.strictObject({
  id: uuidSchema,
  teamId: uuidSchema,
  seq: z.number().int().positive(),
  from: z.string().min(1),
  to: z.array(z.string().min(1)).min(1),
  content: z.string(),
  kind: z.enum(['chat', 'instruction', 'report', 'synthesis']),
  assignmentId: uuidSchema.optional(),
  deliversMessageId: uuidSchema.optional(),
  replyToId: uuidSchema.optional(),
  createdAt: z.string(),
});

export const BackupTeamReadCursorRecordSchema = z.strictObject({
  id: z.string().min(1),
  teamId: uuidSchema,
  participantId: z.string().min(1),
  lastSeq: z.number().int().nonnegative(),
  updatedAt: z.string(),
});

/**
 * D-49: the current backup envelope contract.
 *
 * CR-01: phase 38 added only OPTIONAL columns (`AiTeam.budgetWarnThresholdPct`, the
 * `AiTeamMember`/`AiTeamAssignment` split-usage trio), so a v13 payload validates against
 * these schemas unchanged. Bumping the literal would send every pre-38 backup down
 * `validateBackup`'s `schemaVersion < CURRENT` branch and make it unrestorable for nothing.
 * A bump is only warranted when a field becomes required or its meaning changes — and then
 * it needs a `13 → N` normalization step, not an outright reject.
 */
export const BACKUP_SCHEMA_VERSION = 13 as const;

export const BackupEnvelopeSchema = z.object({
  app: z.literal('personal-task-planner'),
  schemaVersion: z.literal(BACKUP_SCHEMA_VERSION),
  exportedAt: z.string(),
  tables: z.record(z.string(), z.array(z.unknown())),
  counts: z.record(z.string(), z.number()),
});

export const LEGACY_BACKUP_MESSAGE =
  'Backup phiên bản cũ không còn được hỗ trợ (chứa projects/milestones). Dữ liệu local không bị thay đổi.';

/**
 * D-49 envelope-stage gate: a payload carrying a `projects` or `milestones` table is a
 * pre-31.2 backup. Reject it before any per-table validation so no row can be mapped
 * into the new model and no local write can happen.
 */
export function assertNoLegacyTables(raw: unknown): void {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
  const tables = (raw as Record<string, unknown>).tables;
  if (!tables || typeof tables !== 'object' || Array.isArray(tables)) return;
  const candidate = tables as Record<string, unknown>;
  if ('projects' in candidate || 'milestones' in candidate) {
    throw new Error(LEGACY_BACKUP_MESSAGE);
  }
}



