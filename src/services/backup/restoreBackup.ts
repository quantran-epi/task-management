import type {
  BackupEnvelope,
  BackupTableData,
  BackupTableCounts,
  SnapshotData,
} from '../../types/backup';
import type { ChatTab, ChatThread, NoteAttachment } from '../../types/models';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { generateId } from '../../utils/uuid';
import { isSafeBackupSetting, blobToBase64, triggerDownload, APP_MARKER, CURRENT_SCHEMA_VERSION } from './exportBackup';
import { validateBackupPayload } from './validateBackup';

/** Converts a Base64 Data URL or raw base64 back into a browser Blob. */
function base64ToBlob(base64Data: string, mimeType: string): Blob {
  try {
    const raw = base64Data.includes(',') ? base64Data.split(',')[1] || '' : base64Data;
    const binary = atob(raw);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mimeType });
  } catch {
    return new Blob([], { type: mimeType });
  }
}

const RESTORE_TABLES = (db: TaskPlannerDatabase) => [
  db.tasks,
  db.capacityRules,
  db.capacityOverrides,
  db.plannedAllocations,
  db.workSessions,
  db.activeTimers,
  db.notes,
  db.noteAttachments,
  db.chatThreads,
  db.chatMessages,
  db.chatTabs,
  db.documentSets,
  db.publishedDocuments,
  db.publishAttempts,
  db.dlpAudits,
  db.knowledgeLinks,
  db.telegramSettings,
  db.telegramWhitelist,
  db.systems,
  db.changeRequests,
  db.aiEmployees,
  db.aiLeads,
  db.aiSkills,
  db.aiTeams,
  db.aiTeamMembers,
  db.aiTeamLinks,
  db.aiSkillVersions,
  db.aiTeamBatches,
  db.aiTeamAssignments,
  db.teamMessages,
  db.teamReadCursors,
  // WR-15: cleared with the log (never exported), so it must be in the transaction scope.
  db.teamParticipants,
  db.settings,
  db.backupMetadata,
];

/** Phase 34/37: the nine AI Office tables, cleared and re-added as one group. */
const AI_OFFICE_TABLE_KEYS = [
  'aiEmployees',
  'aiLeads',
  'aiSkills',
  'aiTeams',
  'aiTeamMembers',
  'aiTeamLinks',
  'aiSkillVersions',
  'aiTeamBatches',
  'aiTeamAssignments',
] as const;

const DEFAULT_CHAT_TITLE = '💬 Cuộc trò chuyện';

function scopeFromThread(thread: ChatThread): string {
  // WR-16: a `:chat:`-suffixed thread scope must not become a tab scope — the validator
  // rejects a tab whose scopeKey carries the per-thread suffix.
  const chatIndex = thread.scopeKey.indexOf(':chat:');
  return chatIndex >= 0 ? thread.scopeKey.slice(0, chatIndex) : thread.scopeKey;
}

// C-16: a legacy SDLC thread scope suffix. Such rows are deleted, never restored — the tab is
// not generated either — but the CR scope still needs its ordinary chat thread.
const LEGACY_SDLC_SCOPE_SUFFIX = ':sdlc';

function legacyTabRows(
  threads: ChatThread[],
  now: string,
): { threads: ChatThread[]; tabs: ChatTab[] } {
  const importedThreads: ChatThread[] = [];
  const tabs: ChatTab[] = [];
  const scopes = new Set<string>();
  const threadByScope = new Map<string, ChatThread[]>();

  for (const thread of threads) {
    if (thread.scopeKey.endsWith(LEGACY_SDLC_SCOPE_SUFFIX)) {
      scopes.add(thread.scopeKey.slice(0, -LEGACY_SDLC_SCOPE_SUFFIX.length));
      continue;
    }
    const scopeKey = scopeFromThread(thread);
    importedThreads.push(thread);
    scopes.add(scopeKey);
    const scoped = threadByScope.get(scopeKey) ?? [];
    scoped.push(thread);
    threadByScope.set(scopeKey, scoped);
    tabs.push({
      id: thread.id,
      threadId: thread.id,
      scopeKey,
      type: 'chat',
      title: thread.title?.trim() || DEFAULT_CHAT_TITLE,
      order: 0,
      active: false,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
    });
  }

  const orderedScopes = [...scopes].sort();
  for (const scopeKey of orderedScopes) {
    const scopedThreads = threadByScope.get(scopeKey) ?? [];
    if (scopedThreads.length === 0) {
      const threadId = generateId();
      const thread: ChatThread = {
        id: threadId,
        scopeKey: `${scopeKey}:chat:${threadId}`,
        scopeType: scopeKey === 'global' ? 'global' : (scopeKey.split(':')[0] as ChatThread['scopeType']),
        ...(scopeKey.split(':')[1] ? { entityId: scopeKey.split(':')[1] } : {}),
        title: `${DEFAULT_CHAT_TITLE} #1`,
        createdAt: now,
        updatedAt: now,
      };
      importedThreads.push(thread);
      tabs.push({
        id: threadId,
        threadId,
        scopeKey,
        type: 'chat',
        title: thread.title!,
        order: 0,
        active: false,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  const byScope = new Map<string, ChatTab[]>();
  for (const tab of tabs) byScope.set(tab.scopeKey, [...(byScope.get(tab.scopeKey) ?? []), tab]);
  const normalizedTabs = tabs.map((tab) => {
    const scopeTabs = byScope.get(tab.scopeKey) ?? [];
    const scopeIndex = scopeTabs.indexOf(tab);
    return { ...tab, order: scopeIndex, active: scopeIndex === 0 };
  });
  return { threads: importedThreads, tabs: normalizedTabs };
}

function restoreRows(
  backup: BackupEnvelope,
  now: string,
): { tables: BackupTableData; tabs: ChatTab[] } {
  const tables = backup.tables;
  if (tables.chatTabs !== undefined) return { tables, tabs: tables.chatTabs };
  const backfilled = legacyTabRows(tables.chatThreads ?? [], now);
  // C-16: legacyTabRows deletes `:sdlc` threads, so their messages must go too — otherwise the
  // restored DB carries orphans that its own exporter/validator then rejects (L5).
  const survivingThreadIds = new Set(backfilled.threads.map((thread) => thread.id));
  const chatMessages = tables.chatMessages?.filter((message) =>
    survivingThreadIds.has(message.threadId)
  );
  return {
    tables: {
      ...tables,
      chatThreads: backfilled.threads,
      chatTabs: backfilled.tabs,
      ...(chatMessages !== undefined ? { chatMessages } : {}),
    },
    tabs: backfilled.tabs,
  };
}

function countsFor(tables: BackupTableData): BackupTableCounts {
  return Object.fromEntries(Object.entries(tables).map(([key, rows]) => [key, Array.isArray(rows) ? rows.length : 0])) as unknown as BackupTableCounts;
}

async function captureSnapshot(targetDb: TaskPlannerDatabase, timestamp: string): Promise<SnapshotData> {
  // activeTimers is part of the snapshot: replaceTables clears the table for both import and
  // rollback, so omitting it here would destroy the in-progress timer with no way back.
  // CR-02: same rule for the team log — replaceTables clears `teamMessages`/`teamReadCursors`
  // with the AI Office group, so a snapshot without them would delete the transcript on a
  // rollback with no copy to restore.
  const [tasks, capacityRules, capacityOverrides, plannedAllocations, workSessions, activeTimers, notes, rawAttachments, chatThreads, chatMessages, chatTabs, documentSets, publishedDocuments, publishAttempts, dlpAudits, knowledgeLinks, telegramSettingsRaw, telegramWhitelist, systems, changeRequests, aiEmployees, aiLeads, aiSkills, aiTeams, aiTeamMembers, aiTeamLinks, aiSkillVersions, aiTeamBatches, rawAiTeamAssignments, teamMessages, teamReadCursors, settings] = await Promise.all([
    targetDb.tasks.toArray(), targetDb.capacityRules.toArray(), targetDb.capacityOverrides.toArray(), targetDb.plannedAllocations.toArray(), targetDb.workSessions.toArray(), targetDb.activeTimers.toArray(), targetDb.notes.toArray(), targetDb.noteAttachments.toArray(), targetDb.chatThreads.toArray(), targetDb.chatMessages.toArray(), targetDb.chatTabs.toArray(), targetDb.documentSets.toArray(), targetDb.publishedDocuments.toArray(), targetDb.publishAttempts.toArray(), targetDb.dlpAudits.toArray(), targetDb.knowledgeLinks.toArray(), targetDb.telegramSettings.toArray(), targetDb.telegramWhitelist.toArray(), targetDb.systems.toArray(), targetDb.changeRequests.toArray(), targetDb.aiEmployees.toArray(), targetDb.aiLeads.toArray(), targetDb.aiSkills.toArray(), targetDb.aiTeams.toArray(), targetDb.aiTeamMembers.toArray(), targetDb.aiTeamLinks.toArray(), targetDb.aiSkillVersions.toArray(), targetDb.aiTeamBatches.toArray(), targetDb.aiTeamAssignments.toArray(), targetDb.teamMessages.toArray(), targetDb.teamReadCursors.toArray(), targetDb.settings.toArray()
  ]);
  // T-37-14: the snapshot is downloadable as an envelope, so the same projection applies here.
  const aiTeamAssignments = rawAiTeamAssignments.map(({ diagnosticDetail: _detail, ...row }) => row);
  const telegramSettings = telegramSettingsRaw.map((setting) => ({ ...setting, botToken: '' }));
  // Never persist secrets (tokens, passphrases, SSH inventory) in a snapshot the UI offers
  // for download; the export path filters the same way.
  const safeSettings = settings.filter((setting) => isSafeBackupSetting(setting.key));
  const noteAttachments = await Promise.all(rawAttachments.map(async (attachment) => ({
    id: attachment.id,
    noteId: attachment.noteId,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    data: await blobToBase64(attachment.data, attachment.mimeType),
    ...(attachment.caption ? { caption: attachment.caption } : {}),
    createdAt: attachment.createdAt,
  })));
  const tables: BackupTableData = { tasks, capacityRules, capacityOverrides, plannedAllocations, workSessions, activeTimers, notes, noteAttachments, chatThreads, chatMessages, chatTabs, documentSets, publishedDocuments, publishAttempts, dlpAudits, knowledgeLinks, telegramSettings, telegramWhitelist, systems, changeRequests, aiEmployees, aiLeads, aiSkills, aiTeams, aiTeamMembers, aiTeamLinks, aiSkillVersions, aiTeamBatches, aiTeamAssignments, teamMessages, teamReadCursors, settings: safeSettings };
  return { timestamp, tables, counts: countsFor(tables) };
}

function prepareAttachments(attachments: BackupTableData['noteAttachments']): NoteAttachment[] {
  return (attachments ?? []).map((attachment) => ({
    id: attachment.id,
    noteId: attachment.noteId,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    data: attachment.data ? base64ToBlob(attachment.data, attachment.mimeType) : new Blob([], { type: attachment.mimeType }),
    // Export strips `filePath` (it can be an absolute local path), so restore re-derives the
    // deterministic attachment path here — this is what makes the export comment true.
    filePath: attachment.filePath ?? `attachments/${attachment.id}_${attachment.fileName}`,
    ...(attachment.caption ? { caption: attachment.caption } : {}),
    createdAt: attachment.createdAt,
  }));
}

async function replaceTables(
  targetDb: TaskPlannerDatabase,
  tables: BackupTableData,
  attachments: NoteAttachment[],
  snapshot?: SnapshotData | (() => Promise<SnapshotData>),
  recordCount = Object.values(countsFor(tables)).reduce((sum, count) => sum + count, 0),
): Promise<void> {
  // WR-10/D-20: the AI Office group is all-present or all-absent. A payload carrying only some
  // of the nine keys would wipe the group and restore nothing, so it is refused whole — and
  // refused *outside* the transaction, so no clear() or bulkAdd can run. `captureSnapshot`
  // always emits all nine keys, so a rollback replay can never be refused here.
  const aiPresent = AI_OFFICE_TABLE_KEYS.filter((key) => tables[key] !== undefined);
  if (aiPresent.length > 0 && aiPresent.length !== AI_OFFICE_TABLE_KEYS.length) {
    throw new Error('Backup thiếu bảng AI Office — từ chối nhập để tránh mất dữ liệu.');
  }

  await targetDb.transaction('rw', RESTORE_TABLES(targetDb), async () => {
    // Captured inside the transaction so a write landing between snapshot and replace cannot
    // be lost without a rollback path.
    const snapshotData = typeof snapshot === 'function' ? await snapshot() : snapshot;
    // Legacy/older payloads omit the knowledge tables; absent means "payload predates them", not "delete the catalog".
    const clearKnowledge = tables.documentSets !== undefined
      ? [
          targetDb.documentSets.clear(), targetDb.publishedDocuments.clear(), targetDb.publishAttempts.clear(),
          targetDb.dlpAudits.clear(), targetDb.knowledgeLinks.clear(),
        ]
      : [];
    // Phase 34: same rule for AI Office — a payload that predates the tables must not wipe them.
    const clearAiOffice = AI_OFFICE_TABLE_KEYS.some((key) => tables[key] !== undefined)
      ? [
          targetDb.aiEmployees.clear(), targetDb.aiLeads.clear(), targetDb.aiSkills.clear(),
          targetDb.aiTeams.clear(), targetDb.aiTeamMembers.clear(), targetDb.aiTeamLinks.clear(),
          targetDb.aiSkillVersions.clear(),
          targetDb.aiTeamBatches.clear(), targetDb.aiTeamAssignments.clear(),
        ]
      : [];
    // CR-03: the log is cleared only when the payload actually carries it. `exportBackup`
    // omits an empty log, so clearing unconditionally would let a valid export from a
    // machine with no transcript wipe the local one while restoring nothing.
    // WR-15: `teamParticipants` is never exported, so it is cleared alongside the log —
    // otherwise rows for agents that no longer exist survive the restore as orphans.
    const clearTeamLog = tables.teamMessages !== undefined || tables.teamReadCursors !== undefined
      ? [targetDb.teamMessages.clear(), targetDb.teamReadCursors.clear(), targetDb.teamParticipants.clear()]
      : [];
    // Settings are replaced key-by-key, never cleared wholesale: secrets (tokens, passphrases)
    // are not part of any payload and must survive an import and its rollback.
    const incomingSettingKeys = new Set<string>([
      ...(tables.settings ?? []).map((setting) => setting.key),
    ]);
    await Promise.all([
      targetDb.tasks.clear(), targetDb.capacityRules.clear(), targetDb.capacityOverrides.clear(), targetDb.plannedAllocations.clear(), targetDb.workSessions.clear(), targetDb.activeTimers.clear(), targetDb.notes.clear(), targetDb.noteAttachments.clear(), targetDb.chatThreads.clear(), targetDb.chatMessages.clear(), targetDb.chatTabs.clear(), targetDb.telegramSettings.clear(), targetDb.telegramWhitelist.clear(), targetDb.systems.clear(), targetDb.changeRequests.clear(), ...clearKnowledge, ...clearAiOffice, ...clearTeamLog, targetDb.settings.bulkDelete([...incomingSettingKeys]), targetDb.backupMetadata.clear(),
    ]);

    const add = async <T>(table: { bulkAdd: (rows: T[]) => Promise<unknown> }, rows: T[] | undefined) => {
      if (rows?.length) await table.bulkAdd(rows);
    };
    await add(targetDb.tasks, tables.tasks);
    await add(targetDb.capacityRules, tables.capacityRules);
    await add(targetDb.capacityOverrides, tables.capacityOverrides);
    await add(targetDb.plannedAllocations, tables.plannedAllocations);
    await add(targetDb.workSessions, tables.workSessions);
    await add(targetDb.notes, tables.notes);
    await add(targetDb.noteAttachments, attachments);
    await add(targetDb.chatThreads, tables.chatThreads);
    await add(targetDb.chatMessages, tables.chatMessages);
    await add(targetDb.chatTabs, tables.chatTabs);
    await add(targetDb.documentSets, tables.documentSets);
    await add(targetDb.publishedDocuments, tables.publishedDocuments);
    await add(targetDb.publishAttempts, tables.publishAttempts);
    await add(targetDb.dlpAudits, tables.dlpAudits);
    await add(targetDb.knowledgeLinks, tables.knowledgeLinks);
    await add(targetDb.telegramSettings, tables.telegramSettings);
    await add(targetDb.telegramWhitelist, tables.telegramWhitelist);
    await add(targetDb.systems, tables.systems);
    await add(targetDb.changeRequests, tables.changeRequests);
    await add(targetDb.aiEmployees, tables.aiEmployees);
    await add(targetDb.aiLeads, tables.aiLeads);
    await add(targetDb.aiSkills, tables.aiSkills);
    // The retired `status` column is accepted from older exports and dropped here, so a
    // restored row matches the current `AiTeam` shape exactly.
    await add(
      targetDb.aiTeams,
      (tables.aiTeams ?? []).map((row) => {
        const { status: _retired, ...rest } = row as typeof row & { status?: unknown };
        return rest;
      })
    );
    // Phase 38: the new columns (`budgetWarnThresholdPct`, split usage) ride along inside these
    // whole rows; the record schemas already validated them upstream in `validateBackupPayload`.
    await add(targetDb.aiTeamMembers, tables.aiTeamMembers);
    await add(targetDb.aiTeamLinks, tables.aiTeamLinks);
    // D-22: `status` is written verbatim — a restored `pending` row is stored data, not an approval.
    await add(targetDb.aiSkillVersions, tables.aiSkillVersions);
    await add(targetDb.aiTeamBatches, tables.aiTeamBatches);
    await add(targetDb.aiTeamAssignments, tables.aiTeamAssignments);
    // 37.1 WR-07: restore the log and its cursors with the transcript they belong to.
    await add(targetDb.teamMessages, tables.teamMessages);
    await add(targetDb.teamReadCursors, tables.teamReadCursors);
    await add(targetDb.activeTimers, tables.activeTimers);
    for (const setting of tables.settings ?? []) if (isSafeBackupSetting(setting.key)) await targetDb.settings.put(setting);
    if (snapshotData) await targetDb.settings.put({ key: 'last_pre_import_snapshot', value: snapshotData });
    await targetDb.backupMetadata.add({ id: generateId(), timestamp: new Date().toISOString(), appVersion: '0.1.0', recordCount });
  });
}

export async function restoreBackupPayload(backup: BackupEnvelope, targetDb: TaskPlannerDatabase = defaultDb): Promise<{ totalRestored: number; snapshotTime: string }> {
  const validation = validateBackupPayload(backup);
  if (!validation.valid || !validation.envelope) {
    // Surface the validator's own message (notably the D-49 legacy-backup copy) instead of a generic one.
    const first = validation.errors[0]?.message;
    throw new Error(first ? `Backup payload must pass validation before restore: ${first}` : 'Backup payload must pass validation before restore');
  }
  const validatedBackup = validation.envelope;
  const snapshotTime = new Date().toISOString();
  const normalized = restoreRows(validatedBackup, snapshotTime);
  const totalRestored = Object.values(validatedBackup.counts).reduce((sum, count) => sum + count, 0);
  await replaceTables(
    targetDb,
    normalized.tables,
    prepareAttachments(normalized.tables.noteAttachments),
    () => captureSnapshot(targetDb, snapshotTime),
    totalRestored,
  );
  return { totalRestored, snapshotTime };
}

export async function rollbackToSnapshot(targetDb: TaskPlannerDatabase = defaultDb): Promise<{ success: boolean; totalRestored: number }> {
  const snapshotSetting = await targetDb.settings.get('last_pre_import_snapshot');
  if (!snapshotSetting?.value) throw new Error('Không tìm thấy bản snapshot an toàn để hoàn tác');
  const snapshot = snapshotSetting.value as SnapshotData;
  await replaceTables(targetDb, snapshot.tables, prepareAttachments(snapshot.tables.noteAttachments));
  await targetDb.settings.delete('last_pre_import_snapshot');
  return { success: true, totalRestored: Object.values(snapshot.counts).reduce((sum, count) => sum + count, 0) };
}

export function downloadSnapshotFile(snapshot: SnapshotData): void {
  const fileName = `task-planner-snapshot-${snapshot.timestamp.replace(/[:.]/g, '-')}.json`;
  // Second line of defence: a snapshot captured by an older build may still carry secrets.
  const settings = snapshot.tables.settings;
  const tables: BackupTableData = settings
    ? { ...snapshot.tables, settings: settings.filter((setting) => isSafeBackupSetting(setting.key)) }
    : snapshot.tables;
  const envelope: BackupEnvelope = { app: APP_MARKER, schemaVersion: CURRENT_SCHEMA_VERSION, exportedAt: snapshot.timestamp, tables, counts: countsFor(tables) };
  triggerDownload(JSON.stringify(envelope, null, 2), fileName);
}
