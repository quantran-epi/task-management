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
  BackupAiEmployeeRecordSchema,
  BackupAiLeadRecordSchema,
  BackupAiSkillRecordSchema,
  BackupAiTeamRecordSchema,
  BackupAiTeamMemberRecordSchema,
  BackupAiTeamLinkRecordSchema,
  BackupAiSkillVersionRecordSchema,
  BackupAiTeamBatchRecordSchema,
  BackupAiTeamAssignmentRecordSchema,
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
    ? validateTable('chatMessages', BackupChatMessageRecordSchema, rawTables.chatMessages)?.map(
        (row) => {
          // 37.1 §1.1: `messageKind: 'steer'` no longer exists. A pre-37.1 backup still
          // restores — the row is an ordinary user message now, so it keeps its content and
          // loses only the label nothing reads.
          if (row.messageKind !== 'steer') return row;
          const { messageKind: _steer, ...rest } = row;
          return { ...rest, messageKind: 'instruction' as const };
        }
      ) as NonNullable<BackupEnvelope['tables']['chatMessages']> | undefined
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
  const aiEmployees = rawTables.aiEmployees !== undefined
    ? validateTable('aiEmployees', BackupAiEmployeeRecordSchema, rawTables.aiEmployees)
    : undefined;
  const aiLeads = rawTables.aiLeads !== undefined
    ? validateTable('aiLeads', BackupAiLeadRecordSchema, rawTables.aiLeads)
    : undefined;
  const aiSkills = rawTables.aiSkills !== undefined
    ? validateTable('aiSkills', BackupAiSkillRecordSchema, rawTables.aiSkills)
    : undefined;
  const aiTeams = rawTables.aiTeams !== undefined
    ? validateTable('aiTeams', BackupAiTeamRecordSchema, rawTables.aiTeams)
    : undefined;
  const aiTeamMembers = rawTables.aiTeamMembers !== undefined
    ? validateTable('aiTeamMembers', BackupAiTeamMemberRecordSchema, rawTables.aiTeamMembers)
    : undefined;
  const aiTeamLinks = rawTables.aiTeamLinks !== undefined
    ? validateTable('aiTeamLinks', BackupAiTeamLinkRecordSchema, rawTables.aiTeamLinks)
    : undefined;
  const aiSkillVersions = rawTables.aiSkillVersions !== undefined
    ? validateTable('aiSkillVersions', BackupAiSkillVersionRecordSchema, rawTables.aiSkillVersions)
    : undefined;
  const aiTeamBatches = rawTables.aiTeamBatches !== undefined
    ? validateTable('aiTeamBatches', BackupAiTeamBatchRecordSchema, rawTables.aiTeamBatches)
    : undefined;
  const aiTeamAssignments = rawTables.aiTeamAssignments !== undefined
    ? validateTable('aiTeamAssignments', BackupAiTeamAssignmentRecordSchema, rawTables.aiTeamAssignments)
    : undefined;

  // If schema validation errors occurred, stop before referential checks
  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Stage 3: Referential integrity checks
  const taskIds = new Set(tasks.map((t) => t.id));
  const threadIds = new Set((chatThreads || []).map((thread) => thread.id));
  const threadById = new Map((chatThreads || []).map((thread) => [thread.id, thread]));

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
    const tabIdsSeen = new Set<string>();
    chatTabs.forEach((tab) => {
      if (tabIdsSeen.has(tab.id)) errors.push({ table: 'chatTabs', recordId: tab.id, field: 'id', message: 'Duplicate ChatTab id' });
      tabIdsSeen.add(tab.id);
      const thread = threadById.get(tab.threadId);
      if (!thread) {
        errors.push({ table: 'chatTabs', recordId: tab.id, field: 'threadId', message: `ChatTab references threadId "${tab.threadId}" not found in chatThreads` });
      } else {
        const expectedScope = thread.scopeKey.includes(':chat:')
          ? thread.scopeKey.slice(0, thread.scopeKey.indexOf(':chat:'))
          : thread.scopeKey;
        if (tab.scopeKey !== expectedScope && tab.scopeKey !== thread.scopeKey) {
          errors.push({ table: 'chatTabs', recordId: tab.id, field: 'scopeKey', message: 'ChatTab scope does not match chat thread' });
        }
      }
      if (tab.active) {
        if (activeByScope.has(tab.scopeKey)) errors.push({ table: 'chatTabs', recordId: tab.id, field: 'active', message: 'Multiple active tabs for scope' });
        activeByScope.set(tab.scopeKey, tab.id);
      }
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

  // Stage 5: AI Office referential integrity (T-34-31, T-36-07). `replaceTables` bulk-adds, so
  // the repository guards never run on import — the payload itself must be checked.
  //
  // HISTORICAL vs LIVE (D-14/D-18): `chatMessages.targetAgentId`, `agentId` and `agentName` are
  // attribution recorded at write time. They are deliberately NOT live-validated — a backup
  // taken after deleting an employee must still import. Do not "fix" this gap.
  const aiTeamIds = new Set((aiTeams ?? []).map((team) => team.id));
  const aiLeadIds = new Set((aiLeads ?? []).map((lead) => lead.id));
  const aiEmployeeIds = new Set((aiEmployees ?? []).map((employee) => employee.id));
  const aiSkillIds = new Set((aiSkills ?? []).map((skill) => skill.id));
  const membersByTeam = new Map<string, typeof aiTeamMembers>();
  for (const member of aiTeamMembers ?? []) {
    const bucket = membersByTeam.get(member.teamId) ?? [];
    bucket.push(member);
    membersByTeam.set(member.teamId, bucket);
  }
  const teamById = new Map((aiTeams ?? []).map((team) => [team.id, team]));

  for (const team of aiTeams ?? []) {
    // D-05: an empty group has no leader; only a present leadId is a live reference.
    if (team.leadId !== undefined && !aiLeadIds.has(team.leadId)) {
      errors.push({ table: 'aiTeams', recordId: team.id, field: 'leadId', message: `AiTeam references leadId "${team.leadId}" not found in aiLeads` });
    }
    // Pitfall 5: both sources of truth must agree — both absent or both present.
    const leadRows = (membersByTeam.get(team.id) ?? []).filter((row) => row.role === 'lead');
    if (team.leadId === undefined) {
      if (leadRows.length > 0) {
        errors.push({ table: 'aiTeams', recordId: team.id, field: 'leadId', message: 'AiTeam has a lead member row but no leadId' });
      }
    } else if (!leadRows.some((row) => row.agentId === team.leadId)) {
      errors.push({ table: 'aiTeams', recordId: team.id, field: 'leadId', message: `AiTeam leadId "${team.leadId}" has no matching lead member row` });
    }
    if (team.leaderLockedAt !== undefined && team.leadId === undefined) {
      errors.push({ table: 'aiTeams', recordId: team.id, field: 'leaderLockedAt', message: 'AiTeam is leader-locked but has no leadId' });
    }
  }
  for (const member of aiTeamMembers ?? []) {
    if (!aiTeamIds.has(member.teamId)) {
      errors.push({ table: 'aiTeamMembers', recordId: member.id, field: 'teamId', message: `AiTeamMember references teamId "${member.teamId}" not found in aiTeams` });
      continue;
    }
    if (member.role === 'lead') {
      const team = teamById.get(member.teamId);
      if (team?.leadId !== member.agentId) {
        errors.push({ table: 'aiTeamMembers', recordId: member.id, field: 'agentId', message: `Lead member "${member.agentId}" does not match the team leadId` });
      }
    } else if (!aiEmployeeIds.has(member.agentId) && !aiLeadIds.has(member.agentId)) {
      errors.push({ table: 'aiTeamMembers', recordId: member.id, field: 'agentId', message: `AiTeamMember references agentId "${member.agentId}" not found in aiEmployees or aiLeads` });
    }
  }
  for (const link of aiTeamLinks ?? []) {
    if (!aiTeamIds.has(link.teamId)) {
      errors.push({ table: 'aiTeamLinks', recordId: link.id, field: 'teamId', message: `AiTeamLink references teamId "${link.teamId}" not found in aiTeams` });
    }
  }
  for (const employee of aiEmployees ?? []) {
    if (employee.skillId && !aiSkillIds.has(employee.skillId)) {
      errors.push({ table: 'aiEmployees', recordId: employee.id, field: 'skillId', message: `AiEmployee references skillId "${employee.skillId}" not found in aiSkills` });
    }
  }
  const seenVersions = new Set<string>();
  for (const version of aiSkillVersions ?? []) {
    if (!aiSkillIds.has(version.skillId)) {
      errors.push({ table: 'aiSkillVersions', recordId: version.id, field: 'skillId', message: `AiSkillVersion references skillId "${version.skillId}" not found in aiSkills` });
    }
    const key = `${version.skillId}:${version.version}`;
    if (seenVersions.has(key)) {
      errors.push({ table: 'aiSkillVersions', recordId: version.id, field: 'version', message: `Duplicate AiSkillVersion for skillId "${version.skillId}" version ${version.version}` });
    }
    seenVersions.add(key);
  }
  // Phase 37 (T-37-15, D-25): the ledger's own references must resolve, or a restore writes
  // rows that point at nothing. `agentName`/`skillId`/`skillVersion`/`model` are snapshots and
  // are deliberately NOT live-validated — same rule as `targetAgentId` above.
  const batchById = new Map((aiTeamBatches ?? []).map((batch) => [batch.id, batch]));
  const assignmentIds = new Set((aiTeamAssignments ?? []).map((row) => row.id));
  for (const batch of aiTeamBatches ?? []) {
    if (!aiTeamIds.has(batch.teamId)) {
      errors.push({ table: 'aiTeamBatches', recordId: batch.id, field: 'teamId', message: `AiTeamBatch references teamId "${batch.teamId}" not found in aiTeams` });
    }
    if (!threadIds.has(batch.threadId)) {
      errors.push({ table: 'aiTeamBatches', recordId: batch.id, field: 'threadId', message: `AiTeamBatch references threadId "${batch.threadId}" not found in chatThreads` });
    }
  }
  for (const assignment of aiTeamAssignments ?? []) {
    if (!batchById.has(assignment.batchId)) {
      errors.push({ table: 'aiTeamAssignments', recordId: assignment.id, field: 'batchId', message: `AiTeamAssignment references batchId "${assignment.batchId}" not found in aiTeamBatches` });
    }
    if (assignment.retryOfAssignmentId !== undefined && !assignmentIds.has(assignment.retryOfAssignmentId)) {
      errors.push({ table: 'aiTeamAssignments', recordId: assignment.id, field: 'retryOfAssignmentId', message: `AiTeamAssignment references retryOfAssignmentId "${assignment.retryOfAssignmentId}" not found in aiTeamAssignments` });
    }
  }
  // D-25/D-04: one team = one chat. A nested scope key would merge two groups' transcripts.
  for (const thread of chatThreads ?? []) {
    if (thread.scopeType !== 'team') continue;
    const entityId = thread.entityId;
    if (entityId === undefined || !aiTeamIds.has(entityId)) {
      errors.push({ table: 'chatThreads', recordId: thread.id, field: 'entityId', message: `Team ChatThread references entityId "${String(entityId)}" not found in aiTeams` });
    }
    if (thread.scopeKey !== `team:${String(entityId)}`) {
      errors.push({ table: 'chatThreads', recordId: thread.id, field: 'scopeKey', message: 'Team ChatThread scopeKey must be exactly "team:<entityId>"' });
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
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
      ...(aiEmployees !== undefined ? { aiEmployees: aiEmployees as NonNullable<BackupEnvelope['tables']['aiEmployees']> } : {}),
      ...(aiLeads !== undefined ? { aiLeads: aiLeads as NonNullable<BackupEnvelope['tables']['aiLeads']> } : {}),
      ...(aiSkills !== undefined ? { aiSkills: aiSkills as NonNullable<BackupEnvelope['tables']['aiSkills']> } : {}),
      ...(aiTeams !== undefined ? { aiTeams: aiTeams as NonNullable<BackupEnvelope['tables']['aiTeams']> } : {}),
      ...(aiTeamMembers !== undefined ? { aiTeamMembers: aiTeamMembers as NonNullable<BackupEnvelope['tables']['aiTeamMembers']> } : {}),
      ...(aiTeamLinks !== undefined ? { aiTeamLinks: aiTeamLinks as NonNullable<BackupEnvelope['tables']['aiTeamLinks']> } : {}),
      ...(aiSkillVersions !== undefined ? { aiSkillVersions: aiSkillVersions as NonNullable<BackupEnvelope['tables']['aiSkillVersions']> } : {}),
      ...(aiTeamBatches !== undefined ? { aiTeamBatches: aiTeamBatches as NonNullable<BackupEnvelope['tables']['aiTeamBatches']> } : {}),
      ...(aiTeamAssignments !== undefined ? { aiTeamAssignments: aiTeamAssignments as NonNullable<BackupEnvelope['tables']['aiTeamAssignments']> } : {}),
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
      ...(aiEmployees !== undefined ? { aiEmployees: aiEmployees.length } : {}),
      ...(aiLeads !== undefined ? { aiLeads: aiLeads.length } : {}),
      ...(aiSkills !== undefined ? { aiSkills: aiSkills.length } : {}),
      ...(aiTeams !== undefined ? { aiTeams: aiTeams.length } : {}),
      ...(aiTeamMembers !== undefined ? { aiTeamMembers: aiTeamMembers.length } : {}),
      ...(aiTeamLinks !== undefined ? { aiTeamLinks: aiTeamLinks.length } : {}),
      ...(aiSkillVersions !== undefined ? { aiSkillVersions: aiSkillVersions.length } : {}),
      ...(aiTeamBatches !== undefined ? { aiTeamBatches: aiTeamBatches.length } : {}),
      ...(aiTeamAssignments !== undefined ? { aiTeamAssignments: aiTeamAssignments.length } : {}),
    },
  };


  return {
    valid: true,
    envelope: validEnvelope,
    errors: [],
  };
}
