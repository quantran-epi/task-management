export const SCHEMA_V1 = {
  projects: 'id, status, deadline',
  milestones: 'id, projectId, status, deadline',
  tasks: 'id, projectId, milestoneId, status, priority, deadline',
  capacityRules: 'id, &dayOfWeek',
  capacityOverrides: 'id, date',
  plannedAllocations: 'id, taskId, date',
  settings: 'key',
  backupMetadata: 'id, timestamp',
} as const;

export const SCHEMA_V2 = {
  projects: 'id, status, deadline, *opsOwners, *businessAnalysts',
  milestones: 'id, projectId, status, deadline, *opsOwners, *businessAnalysts',
  tasks: 'id, projectId, milestoneId, status, priority, deadline, workType, *opsOwners, *businessAnalysts',
  capacityRules: 'id, &dayOfWeek',
  capacityOverrides: 'id, date',
  plannedAllocations: 'id, taskId, date',
  settings: 'key',
  backupMetadata: 'id, timestamp',
} as const;

export const SCHEMA_V3 = {
  projects: 'id, status, deadline, *opsOwners, *businessAnalysts',
  milestones: 'id, projectId, status, deadline, *opsOwners, *businessAnalysts',
  tasks: 'id, projectId, milestoneId, status, priority, deadline, workType, jiraKey, *opsOwners, *businessAnalysts',
  capacityRules: 'id, &dayOfWeek',
  capacityOverrides: 'id, date',
  plannedAllocations: 'id, taskId, date',
  settings: 'key',
  backupMetadata: 'id, timestamp',
} as const;

export const SCHEMA_V4 = {
  projects: 'id, status, deadline, reminderDate, *opsOwners, *businessAnalysts',
  milestones: 'id, projectId, status, deadline, reminderDate, *opsOwners, *businessAnalysts',
  tasks: 'id, projectId, milestoneId, status, priority, deadline, workType, jiraKey, reminderDate, *opsOwners, *businessAnalysts',
  capacityRules: 'id, &dayOfWeek',
  capacityOverrides: 'id, date',
  plannedAllocations: 'id, taskId, date',
  settings: 'key',
  backupMetadata: 'id, timestamp',
} as const;

export const SCHEMA_V5 = {
  ...SCHEMA_V4,
  workSessions: 'id, taskId, startTime, endTime, date',
  activeTimers: 'taskId, status',
} as const;

export const SCHEMA_V6 = {
  ...SCHEMA_V5,
} as const;

export const SCHEMA_V7 = {
  ...SCHEMA_V6,
  projects: 'id, status, deadline, reminderDate, jiraEpicKey, *opsOwners, *businessAnalysts',
  notes: 'id, entityType, entityId, isPinned, createdAt, updatedAt',
  noteAttachments: 'id, noteId, fileName, mimeType, sizeBytes, createdAt',
} as const;

export const SCHEMA_V8 = {
  ...SCHEMA_V7,
  chatThreads: 'id, &scopeKey, scopeType, entityId, updatedAt',
  chatMessages: 'id, threadId, role, createdAt',
} as const;

export const SCHEMA_V9 = {
  ...SCHEMA_V8,
  notes: 'id, type, parentId, entityType, entityId, isPinned, deletedAt, *tags, createdAt, updatedAt',
} as const;

export const SCHEMA_V10 = {
  ...SCHEMA_V9,
  documentSets: 'id, name, *documentIds, createdAt, updatedAt',
  publishedDocuments: '[setId+documentId], setId, documentId, lastKnownRemoteAt, publishedContentHash',
  publishAttempts: 'id, setId, startedAt, status',
  dlpAudits: 'id, setId, timestamp',
} as const;

export const SCHEMA_V11 = {
  ...SCHEMA_V10,
  knowledgeLinks: 'id, &linkKey, taskMateEntityType, taskMateEntityId, setId, urn, docId, updatedAt',
} as const;

export const SCHEMA_V12 = {
  ...SCHEMA_V11,
  telegramSettings: 'id',
  telegramWhitelist: 'chatId, name, status, dataScope, dailyLimit, usedToday, lastActiveDate',
  telegramSessionLogs: 'id, chatId, dataScopeUsed, createdAt',
} as const;

export const SCHEMA_V13 = {
  ...SCHEMA_V12,
} as const;

export const SCHEMA_V14 = {
  ...SCHEMA_V13,
  chatTabs: 'id, &threadId, scopeKey, [scopeKey+active], createdAt',
} as const;

export const SCHEMA_V15 = {
  ...SCHEMA_V14,
  systems: 'id, &code, parentId, type, sshConfigId, createdAt',
  changeRequests: 'id, &code, status, type, createdAt, updatedAt',
} as const;

// Phase 31.2 (D-27): `null` is Dexie's marker for "drop this object store". `stores()`
// merges cumulatively across versions, so the stores must be named explicitly here —
// omitting the key would silently keep the V15 store. Dexie's deleteRemovedTables()
// drops both object stores and their data atomically as part of the V15 → V16 upgrade.
export const SCHEMA_V16 = {
  ...SCHEMA_V15,
  projects: null,
  milestones: null,
  tasks: 'id, crId, systemId, status, priority, deadline, workType, jiraKey, reminderDate, *opsOwners, *businessAnalysts',
} as const;








