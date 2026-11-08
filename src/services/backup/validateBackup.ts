import { z } from 'zod';
import type {
  BackupEnvelope,
  BackupValidationResult,
  ValidationErrorDetail,
} from '../../types/backup';
import { APP_MARKER, CURRENT_SCHEMA_VERSION } from './exportBackup';
import {
  BackupTaskRecordSchema,
  BackupCapacityRuleRecordSchema,
  BackupCapacityOverrideRecordSchema,
  BackupPlannedAllocationRecordSchema,
  BackupWorkSessionRecordSchema,
  BackupNoteRecordSchema,
  BackupNoteAttachmentRecordSchema,
  BackupChatThreadRecordSchema,
  BackupChatMessageRecordSchema,
  BackupChatTabRecordSchema,
  BackupActiveTimerRecordSchema,
  BackupSettingRecordSchema,
  BackupDocumentSetRecordSchema,
  BackupPublishedDocumentRecordSchema,
  BackupPublishAttemptRecordSchema,
  BackupDlpAuditRecordSchema,
  BackupKnowledgeLinkRecordSchema,
  BackupTelegramSettingsRecordSchema,
  BackupTelegramWhitelistUserSchema,
  BackupSystemRecordSchema,
  BackupChangeRequestRecordSchema,
  assertNoLegacyTables,
  LEGACY_BACKUP_MESSAGE,
} from '../../validation/backupSchemas';


/**
 * Two-stage validation engine for backup payloads:
 * Stage 1: Envelope validation (app marker, schemaVersion, structure)
 * Stage 2: Schema validation of records across domain tables (tasks, capacityRules, capacityOverrides, plannedAllocations, and optionally workSessions)
 * Stage 3: Referential integrity checks (foreign keys: task, note, document set)
 */

export function validateBackupPayload(raw: unknown): BackupValidationResult {
  // D-49: reject a pre-31.2 payload at the envelope stage, before any table validation
  // and therefore before any write. Local data is untouched.
  try {
    assertNoLegacyTables(raw);
  } catch (err) {
    return {
      valid: false,
      errors: [
        {
          table: 'envelope',
          field: 'tables',
          message: err instanceof Error ? err.message : LEGACY_BACKUP_MESSAGE,
        },
      ],
    };
  }

  const errors: ValidationErrorDetail[] = [];

  // Stage 1: Basic object and envelope check
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      valid: false,
      errors: [
        {
          table: 'envelope',
          field: 'payload',
          message: 'Dữ liệu sao lưu phải là một đối tượng JSON hợp lệ',
        },
      ],
    };
  }

  const candidate = raw as Record<string, unknown>;

  if (candidate.app !== APP_MARKER) {
    errors.push({
      table: 'envelope',
      field: 'app',
      message: `Định danh ứng dụng không hợp lệ (yêu cầu '${APP_MARKER}')`,
    });
  }

  if (typeof candidate.schemaVersion !== 'number' || candidate.schemaVersion > CURRENT_SCHEMA_VERSION) {
    errors.push({
      table: 'envelope',
      field: 'schemaVersion',
      message: `Phiên bản sơ đồ (${String(candidate.schemaVersion)}) không tương thích (chỉ hỗ trợ phiên bản ${CURRENT_SCHEMA_VERSION})`,
    });
  } else if (candidate.schemaVersion < CURRENT_SCHEMA_VERSION) {
    // D-49: older envelopes are not normalized — they are rejected outright.
    errors.push({
      table: 'envelope',
      field: 'schemaVersion',
      message: LEGACY_BACKUP_MESSAGE,
    });
  }

  if (typeof candidate.exportedAt !== 'string' || Number.isNaN(Date.parse(candidate.exportedAt))) {
    errors.push({
      table: 'envelope',
      field: 'exportedAt',
      message: 'Thời gian xuất bản không phải chuỗi thời gian ISO hợp lệ',
    });
  }

  if (!candidate.tables || typeof candidate.tables !== 'object' || Array.isArray(candidate.tables)) {
    errors.push({
      table: 'envelope',
      field: 'tables',
      message: 'Phần dữ liệu các bảng (tables) bị thiếu hoặc không đúng định dạng',
    });
    return { valid: false, errors };
  }

  // If Stage 1 envelope errors exist, abort before table inspection
  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const rawTables = candidate.tables as Record<string, unknown>;

  // Stage 2: Validate records in 6 domain tables
  function validateTable<T>(
    tableName: string,
    schema: z.ZodSchema<T>,
    recordsUnknown: unknown
  ): T[] {
    if (!Array.isArray(recordsUnknown)) {
      errors.push({
        table: tableName,
        field: 'table',
        message: `Dữ liệu bảng ${tableName} phải là một mảng`,
      });
      return [];
    }

    const validRecords: T[] = [];
    recordsUnknown.forEach((rec, idx) => {
      const parsed = schema.safeParse(rec);
      if (!parsed.success) {
        parsed.error.issues.forEach((issue) => {
          const recId = rec && typeof rec === 'object' && 'id' in rec ? String((rec as any).id) : `index_${idx}`;
          errors.push({
            table: tableName,
            recordId: recId,
            field: issue.path.join('.') || 'record',
            message: issue.message,
          });
        });
      } else {
        validRecords.push(parsed.data);
      }
    });

    return validRecords;
  }

  const tasks = validateTable('tasks', BackupTaskRecordSchema, rawTables.tasks ?? []);
  const capacityRules = validateTable('capacityRules', BackupCapacityRuleRecordSchema, rawTables.capacityRules ?? []);
  const capacityOverrides = validateTable('capacityOverrides', BackupCapacityOverrideRecordSchema, rawTables.capacityOverrides ?? []);
  const plannedAllocations = validateTable('plannedAllocations', BackupPlannedAllocationRecordSchema, rawTables.plannedAllocations ?? []);
  const workSessions = rawTables.workSessions !== undefined
    ? validateTable('workSessions', BackupWorkSessionRecordSchema, rawTables.workSessions)
    : undefined;
  const notes = rawTables.notes !== undefined
    ? validateTable('notes', BackupNoteRecordSchema, rawTables.notes)
    : undefined;
  const noteAttachments = rawTables.noteAttachments !== undefined
    ? validateTable('noteAttachments', BackupNoteAttachmentRecordSchema, rawTables.noteAttachments)
    : undefined;
  const chatThreads = rawTables.chatThreads !== undefined
    ? validateTable('chatThreads', BackupChatThreadRecordSchema, rawTables.chatThreads)
    : undefined;
  const chatMessages = rawTables.chatMessages !== undefined
    ? validateTable('chatMessages', BackupChatMessageRecordSchema, rawTables.chatMessages)
    : undefined;
  const chatTabs = rawTables.chatTabs !== undefined
    ? validateTable('chatTabs', BackupChatTabRecordSchema, rawTables.chatTabs)
    : undefined;
  const activeTimers = rawTables.activeTimers !== undefined
    ? validateTable('activeTimers', BackupActiveTimerRecordSchema, rawTables.activeTimers)
    : undefined;
  const settings = rawTables.settings !== undefined
    ? validateTable('settings', BackupSettingRecordSchema, rawTables.settings)
    : undefined;
  const documentSets = rawTables.documentSets !== undefined
    ? validateTable('documentSets', BackupDocumentSetRecordSchema, rawTables.documentSets)
    : undefined;
  const publishedDocuments = rawTables.publishedDocuments !== undefined
    ? validateTable('publishedDocuments', BackupPublishedDocumentRecordSchema, rawTables.publishedDocuments)
    : undefined;
  const publishAttempts = rawTables.publishAttempts !== undefined
    ? validateTable('publishAttempts', BackupPublishAttemptRecordSchema, rawTables.publishAttempts)
    : undefined;
  const dlpAudits = rawTables.dlpAudits !== undefined
    ? validateTable('dlpAudits', BackupDlpAuditRecordSchema, rawTables.dlpAudits)
    : undefined;
  const knowledgeLinks = rawTables.knowledgeLinks !== undefined
    ? validateTable('knowledgeLinks', BackupKnowledgeLinkRecordSchema, rawTables.knowledgeLinks)
    : undefined;
  const telegramSettings = rawTables.telegramSettings !== undefined
    ? validateTable('telegramSettings', BackupTelegramSettingsRecordSchema, rawTables.telegramSettings)
    : undefined;
  const telegramWhitelist = rawTables.telegramWhitelist !== undefined
    ? validateTable('telegramWhitelist', BackupTelegramWhitelistUserSchema, rawTables.telegramWhitelist)
    : undefined;
  const systems = rawTables.systems !== undefined
    ? validateTable('systems', BackupSystemRecordSchema, rawTables.systems)
    : undefined;
  const changeRequests = rawTables.changeRequests !== undefined
    ? validateTable('changeRequests', BackupChangeRequestRecordSchema, rawTables.changeRequests)
    : undefined;

  // If schema validation errors occurred, stop before referential checks
  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Stage 3: Referential integrity checks
  const taskIds = new Set(tasks.map((t) => t.id));
  const threadIds = new Set((chatThreads || []).map((thread) => thread.id));
  const threadById = new Map((chatThreads || []).map((thread) => [thread.id, thread]));
  const recovery = { missingSources: [] as Array<{ id: string; title: string; version?: number; hash?: string }>, blockedTabs: [] as Array<{ tabId: string; threadId: string; step: string; missingSourceIds: string[] }> };

  // Check plannedAllocations refer to existing task
  plannedAllocations.forEach((pa) => {
    if (!taskIds.has(pa.taskId)) {
      errors.push({
        table: 'plannedAllocations',
        recordId: pa.id,
        field: 'taskId',
        message: `PlannedAllocation references taskId "${pa.taskId}" not found in tasks`,
      });
    }
  });

  // Check workSessions refer to existing task
  if (workSessions) {
    workSessions.forEach((ws) => {
      if (!taskIds.has(ws.taskId)) {
        errors.push({
          table: 'workSessions',
          recordId: ws.id,
          field: 'taskId',
          message: `WorkSession references taskId "${ws.taskId}" not found in tasks`,
        });
      }
    });
  }

  // Check notes refer to existing entity if specified
  const noteIds = new Set((notes || []).map((n) => n.id));
  const crIds = changeRequests ? new Set(changeRequests.map((cr) => cr.id)) : undefined;
  const systemIds = systems ? new Set(systems.map((s) => s.id)) : undefined;
  if (notes) {
    notes.forEach((n) => {
      if (n.entityType && n.entityId) {
        if (n.entityType === 'task' && !taskIds.has(n.entityId)) {
          errors.push({
            table: 'notes',
            recordId: n.id,
            field: 'entityId',
            message: `Note references taskId "${n.entityId}" not found in tasks`,
          });
        } else if (n.entityType === 'cr' && crIds && !crIds.has(n.entityId)) {
          errors.push({
            table: 'notes',
            recordId: n.id,
            field: 'entityId',
            message: `Note references crId "${n.entityId}" not found in changeRequests`,
          });
        } else if (n.entityType === 'system' && systemIds && !systemIds.has(n.entityId)) {
          errors.push({
            table: 'notes',
            recordId: n.id,
            field: 'entityId',
            message: `Note references systemId "${n.entityId}" not found in systems`,
          });
        }
      }
    });
  }

  // Check noteAttachments refer to existing note
  if (noteAttachments) {
    noteAttachments.forEach((na) => {
      if (!noteIds.has(na.noteId)) {
        errors.push({
          table: 'noteAttachments',
          recordId: na.id,
          field: 'noteId',
          message: `NoteAttachment references noteId "${na.noteId}" not found in notes`,
        });
      }
    });
  }

  // Validate knowledge-table references only when both sides are present.
  const documentSetIds = new Set((documentSets || []).map((set) => set.id));
  if (documentSets) {
    documentSets.forEach((set) => {
      set.documentIds.forEach((documentId) => {
        if (!noteIds.has(documentId)) {
          errors.push({
            table: 'documentSets',
            recordId: set.id,
            field: 'documentIds',
            message: `DocumentSet references documentId "${documentId}" not found in notes`,
          });
        }
      });
    });
  }
  if (publishedDocuments) {
    publishedDocuments.forEach((published) => {
      if (!documentSetIds.has(published.setId)) {
        errors.push({
          table: 'publishedDocuments',
          recordId: `${published.setId}:${published.documentId}`,
          field: 'setId',
          message: `PublishedDocument references setId "${published.setId}" not found in documentSets`,
        });
      }
    });
  }
  if (publishAttempts) {
    publishAttempts.forEach((attempt) => {
      if (!documentSetIds.has(attempt.setId)) {
        errors.push({
          table: 'publishAttempts',
          recordId: attempt.id,
          field: 'setId',
          message: `PublishAttempt references setId "${attempt.setId}" not found in documentSets`,
        });
      }
    });
  }
  if (dlpAudits) {
    dlpAudits.forEach((audit) => {
      if (!documentSetIds.has(audit.setId)) {
        errors.push({
          table: 'dlpAudits',
          recordId: audit.id,
          field: 'setId',
          message: `DlpAudit references setId "${audit.setId}" not found in documentSets`,
        });
      }
    });
  }

  // Check document-scoped chatThreads refer to existing note
  if (chatThreads) {
    chatThreads.forEach((ct) => {
      if (ct.scopeType === 'document' && ct.entityId && !noteIds.has(ct.entityId)) {
        errors.push({
          table: 'chatThreads',
          recordId: ct.id,
          field: 'entityId',
          message: `ChatThread references documentId "${ct.entityId}" not found in notes`,
        });
      }
    });
  }

  if (chatTabs && chatThreads) {
    const activeByScope = new Map<string, string>();
    const sdlcByScope = new Set<string>();
    const tabIdsSeen = new Set<string>();
    chatTabs.forEach((tab) => {
      if (tabIdsSeen.has(tab.id)) errors.push({ table: 'chatTabs', recordId: tab.id, field: 'id', message: 'Duplicate ChatTab id' });
      tabIdsSeen.add(tab.id);
      const thread = threadById.get(tab.threadId);
      if (!thread) {
        errors.push({ table: 'chatTabs', recordId: tab.id, field: 'threadId', message: `ChatTab references threadId "${tab.threadId}" not found in chatThreads` });
      } else {
        const expectedScope = thread.scopeType === 'cr' && thread.scopeKey.endsWith(':sdlc')
          ? thread.scopeKey.slice(0, -5)
          : thread.scopeKey.includes(':chat:')
            ? thread.scopeKey.slice(0, thread.scopeKey.indexOf(':chat:'))
            : thread.scopeKey;
        if (tab.scopeKey !== expectedScope && tab.scopeKey !== thread.scopeKey) {
          errors.push({ table: 'chatTabs', recordId: tab.id, field: 'scopeKey', message: 'ChatTab scope does not match chat thread' });
        }
        if (thread.scopeType === 'cr' && thread.entityId && tab.scopeKey === `cr:${thread.entityId}` && tab.type === 'sdlc') {
          if (sdlcByScope.has(tab.scopeKey)) errors.push({ table: 'chatTabs', recordId: tab.id, field: 'type', message: 'Duplicate SDLC tab for CR scope' });
          sdlcByScope.add(tab.scopeKey);
        }
      }
      if (tab.active) {
        if (activeByScope.has(tab.scopeKey)) errors.push({ table: 'chatTabs', recordId: tab.id, field: 'active', message: 'Multiple active tabs for scope' });
        activeByScope.set(tab.scopeKey, tab.id);
      }
      const workflow = tab.workflowState;
      if (workflow) {
        const missingIds: string[] = [];
        // Only the artifact-ref slots carry `noteId`; `branchSnapshots` and `crSummary` do not.
        const artifactRefs = [
          workflow.artifacts.pl01,
          workflow.artifacts.pl02,
          workflow.artifacts.solution,
          workflow.artifacts.codeGuide,
          workflow.artifacts.changePack,
          workflow.artifacts.pl03b,
          workflow.artifacts.pl07,
          workflow.artifacts.cab,
        ];
        for (const artifact of artifactRefs) {
          if (!artifact || !artifact.noteId) continue;
          if (!noteIds.has(artifact.noteId)) {
            missingIds.push(artifact.noteId);
            if (!recovery.missingSources.some((source) => source.id === artifact.noteId)) {
              recovery.missingSources.push({
                id: artifact.noteId,
                title: artifact.title,
                version: artifact.version,
                hash: artifact.hash,
              });
            }
          }
        }
        if (missingIds.length > 0) {
          recovery.blockedTabs.push({
            tabId: tab.id,
            threadId: tab.threadId,
            step: workflow.currentStep,
            missingSourceIds: [...new Set(missingIds)],
          });
          tab.workflowState = {
            ...workflow,
            checkpoint: {
              requestId: workflow.checkpoint?.requestId ?? tab.checkpoint?.requestId ?? tab.id,
              step: workflow.currentStep,
              status: 'interrupted',
              startedAt: workflow.checkpoint?.startedAt ?? tab.updatedAt,
            },
          };
        }
      }
    });
  }

  // Check chatMessages refer to existing thread and wizard identity
  if (chatMessages && chatThreads) {
    chatMessages.forEach((cm) => {
      if (!threadIds.has(cm.threadId)) {
        errors.push({
          table: 'chatMessages',
          recordId: cm.id,
          field: 'threadId',
          message: `ChatMessage references threadId "${cm.threadId}" not found in chatThreads`,
        });
      }
      if (cm.wizard) {
        const thread = threadById.get(cm.threadId);
        // The wizard snapshot's identity field is a ChangeRequest id, so the thread must be CR-scoped.
        if (!thread || thread.scopeType !== 'cr' || thread.entityId !== cm.wizard.changeRequestId || thread.id !== cm.wizard.threadId) {
          errors.push({
            table: 'chatMessages',
            recordId: cm.id,
            field: 'wizard',
            message: 'Wizard snapshot CR/thread identity does not match chat thread',
          });
        }
        if (crIds && !crIds.has(cm.wizard.changeRequestId)) {
          errors.push({
            table: 'chatMessages',
            recordId: cm.id,
            field: 'wizard.changeRequestId',
            message: `Wizard references crId "${cm.wizard.changeRequestId}" not found in changeRequests`,
          });
        }
        if (cm.wizard.artifactId && !noteIds.has(cm.wizard.artifactId)) {
          errors.push({
            table: 'chatMessages',
            recordId: cm.id,
            field: 'wizard.artifactId',
            message: `Wizard references artifactId "${cm.wizard.artifactId}" not found in notes`,
          });
        }
      }
    });
  }

  if (notes) {
    notes.forEach((note) => {
      // `sdlcArtifact.changeRequestId` carries the CR id the artifact belongs to.
      if (note.sdlcArtifact && crIds && !crIds.has(note.sdlcArtifact.changeRequestId)) {
        errors.push({
          table: 'notes',
          recordId: note.id,
          field: 'sdlcArtifact.changeRequestId',
          message: `Artifact references crId "${note.sdlcArtifact.changeRequestId}" not found in changeRequests`,
        });
      }
      if (note.sdlcArtifact && !threadIds.has(note.sdlcArtifact.threadId)) {
        errors.push({
          table: 'notes',
          recordId: note.id,
          field: 'sdlcArtifact.threadId',
          message: `Artifact references threadId "${note.sdlcArtifact.threadId}" not found in chatThreads`,
        });
      }
      if (note.sdlcArtifact) {
        note.sdlcArtifact.sourceArtifactIds.forEach((sourceId) => {
          if (!noteIds.has(sourceId)) {
            errors.push({
              table: 'notes',
              recordId: note.id,
              field: 'sdlcArtifact.sourceArtifactIds',
              message: `Artifact references sourceArtifactId "${sourceId}" not found in notes`,
            });
          }
        });
      }
    });
  }

  if (documentSets) {
    const sdlcCrIds = new Set<string>();
    documentSets.forEach((set) => {
      if (!set.sdlc) return;
      if (crIds && !crIds.has(set.sdlc.changeRequestId)) {
        errors.push({
          table: 'documentSets',
          recordId: set.id,
          field: 'sdlc.changeRequestId',
          message: `SDLC set references crId "${set.sdlc.changeRequestId}" not found in changeRequests`,
        });
      }
      if (sdlcCrIds.has(set.sdlc.changeRequestId)) {
        errors.push({
          table: 'documentSets',
          recordId: set.id,
          field: 'sdlc',
          message: `Duplicate SDLC mapping for crId "${set.sdlc.changeRequestId}"`,
        });
      }
      sdlcCrIds.add(set.sdlc.changeRequestId);
    });
  }

  // Check chatMessages refer to existing thread
  if (chatMessages && chatThreads) {
    chatMessages.forEach((cm) => {
      if (!threadIds.has(cm.threadId)) {
        errors.push({
          table: 'chatMessages',
          recordId: cm.id,
          field: 'threadId',
          message: `ChatMessage references threadId "${cm.threadId}" not found in chatThreads`,
        });
      }
    });
  }

  // Stage 4: CR/system invariants (D-24/D-25/D-26). `replaceTables` bulk-adds, so the
  // repository guards never run on import — the payload itself must be checked.
  const systemById = new Map((systems ?? []).map((s) => [s.id, s]));
  const crById = new Map((changeRequests ?? []).map((cr) => [cr.id, cr]));
  if (systems) {
    for (const system of systems) {
      if (system.type === 'LOGICAL_GROUP') {
        if (system.parentId) {
          errors.push({ table: 'systems', recordId: system.id, field: 'parentId', message: 'Parent system cannot have a parent' });
        }
        if (system.sshConfigId !== undefined || system.remoteRepoPath !== undefined || system.defaultBaseBranch !== undefined) {
          errors.push({ table: 'systems', recordId: system.id, field: 'type', message: 'Parent system cannot carry SSH/repo fields' });
        }
      } else if (system.parentId) {
        const parent = systemById.get(system.parentId);
        if (!parent || parent.type !== 'LOGICAL_GROUP') {
          errors.push({ table: 'systems', recordId: system.id, field: 'parentId', message: 'Subsystem parent must be a logical group' });
        }
      }
    }
  }
  for (const cr of changeRequests ?? []) {
    for (const target of cr.targets) {
      const system = systemById.get(target.systemId);
      if (!system) {
        errors.push({ table: 'changeRequests', recordId: cr.id, field: 'targets', message: `Unknown systemId "${target.systemId}"` });
      } else if (system.type === 'LOGICAL_GROUP') {
        errors.push({ table: 'changeRequests', recordId: cr.id, field: 'targets', message: 'Parent system cannot be a CR target' });
      }
    }
  }
  for (const task of tasks) {
    const cr = crById.get(task.crId);
    if (!cr) {
      errors.push({ table: 'tasks', recordId: task.id, field: 'crId', message: `Task references crId "${task.crId}" not found in changeRequests` });
    } else if (task.systemId && !cr.targets.some((target) => target.systemId === task.systemId)) {
      errors.push({ table: 'tasks', recordId: task.id, field: 'systemId', message: 'systemId is not a target of the task CR' });
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Normalization for schemaVersion 1 (backfill Banking IT domain fields per D-16)
  if (candidate.schemaVersion === 1) {
    tasks.forEach((t) => {
      if (!t.opsOwners) t.opsOwners = [];
      if (!t.businessAnalysts) t.businessAnalysts = [];
      if (!t.workType) t.workType = 'code';
    });
  }

  const validEnvelope: BackupEnvelope = {
    app: APP_MARKER,
    schemaVersion: candidate.schemaVersion as number,
    exportedAt: candidate.exportedAt as string,
    tables: {
      tasks: tasks as BackupEnvelope['tables']['tasks'],
      capacityRules: capacityRules as BackupEnvelope['tables']['capacityRules'],
      capacityOverrides: capacityOverrides as BackupEnvelope['tables']['capacityOverrides'],
      plannedAllocations: plannedAllocations as BackupEnvelope['tables']['plannedAllocations'],
      ...(workSessions !== undefined ? { workSessions } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(noteAttachments !== undefined ? { noteAttachments } : {}),
      ...(chatThreads !== undefined ? { chatThreads } : {}),
      ...(chatMessages !== undefined ? { chatMessages } : {}),
      ...(chatTabs !== undefined ? { chatTabs } : {}),
      ...(activeTimers !== undefined ? { activeTimers } : {}),
      ...(settings !== undefined ? { settings } : {}),
      ...(documentSets !== undefined ? { documentSets } : {}),
      ...(publishedDocuments !== undefined ? { publishedDocuments } : {}),
      ...(publishAttempts !== undefined ? { publishAttempts } : {}),
      ...(dlpAudits !== undefined ? { dlpAudits } : {}),
      ...(knowledgeLinks !== undefined ? { knowledgeLinks } : {}),
      ...(telegramSettings !== undefined ? { telegramSettings } : {}),
      ...(telegramWhitelist !== undefined ? { telegramWhitelist } : {}),
      ...(systems !== undefined ? { systems: systems as NonNullable<BackupEnvelope['tables']['systems']> } : {}),
      ...(changeRequests !== undefined ? { changeRequests: changeRequests as NonNullable<BackupEnvelope['tables']['changeRequests']> } : {}),
    },
    counts: {
      tasks: tasks.length,
      capacityRules: capacityRules.length,
      capacityOverrides: capacityOverrides.length,
      plannedAllocations: plannedAllocations.length,
      ...(workSessions !== undefined ? { workSessions: workSessions.length } : {}),
      ...(notes !== undefined ? { notes: notes.length } : {}),
      ...(noteAttachments !== undefined ? { noteAttachments: noteAttachments.length } : {}),
      ...(chatThreads !== undefined ? { chatThreads: chatThreads.length } : {}),
      ...(chatMessages !== undefined ? { chatMessages: chatMessages.length } : {}),
      ...(chatTabs !== undefined ? { chatTabs: chatTabs.length } : {}),
      ...(activeTimers !== undefined ? { activeTimers: activeTimers.length } : {}),
      ...(settings !== undefined ? { settings: settings.length } : {}),
      ...(documentSets !== undefined ? { documentSets: documentSets.length } : {}),
      ...(publishedDocuments !== undefined ? { publishedDocuments: publishedDocuments.length } : {}),
      ...(publishAttempts !== undefined ? { publishAttempts: publishAttempts.length } : {}),
      ...(dlpAudits !== undefined ? { dlpAudits: dlpAudits.length } : {}),
      ...(knowledgeLinks !== undefined ? { knowledgeLinks: knowledgeLinks.length } : {}),
      ...(telegramSettings !== undefined ? { telegramSettings: telegramSettings.length } : {}),
      ...(telegramWhitelist !== undefined ? { telegramWhitelist: telegramWhitelist.length } : {}),
      ...(systems !== undefined ? { systems: systems.length } : {}),
      ...(changeRequests !== undefined ? { changeRequests: changeRequests.length } : {}),
    },
  };


  return {
    valid: true,
    envelope: validEnvelope,
    errors: [],
    ...(recovery.missingSources.length > 0 ? { recovery } : {}),
  };
}
