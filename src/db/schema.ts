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

// Phase 34 (D-18, D-23, D-25, D-32): AI Office stores. Purely additive — no existing
// store index spec is touched, so no index rebuild and no `.upgrade()` hook is needed.
export const SCHEMA_V17 = {
  ...SCHEMA_V16,
  aiEmployees: 'id, name, skillId, model, createdAt',
  aiLeads: 'id, name, model, createdAt',
  aiSkills: 'id, name, createdAt',
  aiTeams: 'id, name, leadId, status, createdAt',
  aiTeamMembers: 'id, teamId, agentId, role',
  aiTeamLinks: 'id, teamId, itemType, itemId',
} as const;

// Phase 35 (C-16): SDLC rows are purged in the V18 upgrade hook. No index changes —
// the purge is a row delete, not a schema reshape.
export const SCHEMA_V18 = { ...SCHEMA_V17 } as const;

// Phase 36 (D-16, D-22): skill revisions. Purely additive — no existing store index spec
// is touched, so no index rebuild and no `.upgrade()` hook is needed.
export const SCHEMA_V19 = {
  ...SCHEMA_V18,
  aiSkillVersions: 'id, skillId, [skillId+version], status, createdAt',
} as const;

// Post-36 repair: rewrites a legacy `scopeType` value only, so no index spec changes.
export const SCHEMA_V20 = { ...SCHEMA_V19 } as const;

// Post-36 repair: purges SDLC threads and orphan tabs. Deletes only, no index changes.
export const SCHEMA_V21 = { ...SCHEMA_V20 } as const;

// Phase 37 (D-22): the run ledger. Purely additive — no existing store index spec is
// touched, so no index rebuild and no `.upgrade()` hook is needed (C-16: no backfill).
export const SCHEMA_V22 = {
  ...SCHEMA_V21,
  aiTeamBatches: 'id, teamId, threadId, [threadId+batchIndex], startedAt',
  aiTeamAssignments:
    'id, batchId, agentId, [batchId+attemptNo], runStatus, retryOfAssignmentId',
} as const;

// 37.1 rework: the unified team-chat model. Purely additive — no existing store index spec
// is touched, so no index rebuild and no `.upgrade()` hook is needed. `teamMessages` needs a
// monotonic `seq` per team, which is allocated inside the append transaction, not by an
// auto-increment store (a compound `[teamId+seq]` unique index is what enforces it).
export const SCHEMA_V23 = {
  ...SCHEMA_V22,
  teamParticipants: 'id, teamId, [teamId+kind]',
  teamMessages: 'id, teamId, [teamId+seq], [teamId+createdAt], assignmentId',
  teamReadCursors: 'id, [teamId+participantId]',
} as const;

// V24: `replyToId` on both message tables (37.1 R14). Purely additive and unindexed — the
// reply target is read by id from the rows already in memory, never queried by. No index
// rebuild, no `.upgrade()` hook.
export const SCHEMA_V24 = {
  ...SCHEMA_V23,
} as const;

// Phase 38 (D-04, D-05, D-11, D-23): split usage columns on member and attempt rows plus a
// per-team warn-threshold override. Every new column is unindexed and lives inside the opaque
// row payload, so no index rebuild and no `.upgrade()` hook (C-16: no backfill).
export const SCHEMA_V25 = {
  ...SCHEMA_V24,
} as const;

// Phase 39 (D-14): `version` is assigned at approval only. The upgrade hook strips a number
// from every non-approved row written by a pre-39 build; no index spec changes, so the store
// shape is identical to V25.
export const SCHEMA_V26 = {
  ...SCHEMA_V25,
} as const;

// Bump with every new `this.version(n)` in db/index.ts. Migration tests assert
// against this instead of a literal, so a schema bump never silently breaks them.
export const LATEST_SCHEMA_VERSION = 26;
