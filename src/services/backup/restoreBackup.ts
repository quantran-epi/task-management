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
  db.settings,
  db.backupMetadata,
];

const SDLC_TITLE = '⚙️ SDLC Workflow';
const DEFAULT_CHAT_TITLE = '💬 Cuộc trò chuyện';

function scopeFromThread(thread: ChatThread): string {
  if (thread.scopeType === 'cr' && thread.scopeKey.endsWith(':sdlc')) {
    return thread.scopeKey.slice(0, -':sdlc'.length);
  }
  // WR-16: a `:chat:`-suffixed thread scope must not become a tab scope — the validator
  // rejects a tab whose scopeKey carries the per-thread suffix.
  const chatIndex = thread.scopeKey.indexOf(':chat:');
  return chatIndex >= 0 ? thread.scopeKey.slice(0, chatIndex) : thread.scopeKey;
}

function legacyTabRows(
  threads: ChatThread[],
  now: string,
): { threads: ChatThread[]; tabs: ChatTab[] } {
  const importedThreads = [...threads];
  const tabs: ChatTab[] = [];
  const scopes = new Set<string>();
  const threadByScope = new Map<string, ChatThread[]>();

  for (const thread of importedThreads) {
    const scopeKey = scopeFromThread(thread);
    scopes.add(scopeKey);
    const scoped = threadByScope.get(scopeKey) ?? [];
    scoped.push(thread);
    threadByScope.set(scopeKey, scoped);
    tabs.push({
      id: thread.scopeKey === `${scopeKey}:sdlc` && thread.scopeType === 'cr' ? generateId() : thread.id,
      threadId: thread.id,
      scopeKey,
      type: thread.scopeKey === `${scopeKey}:sdlc` && thread.scopeType === 'cr' ? 'sdlc' : 'chat',
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
    const hasSdlc = scopedThreads.some((thread) => thread.scopeKey === `${scopeKey}:sdlc` && thread.scopeType === 'cr');
    const crId = scopeKey.startsWith('cr:') ? scopeKey.slice('cr:'.length) : undefined;
    if (crId && !hasSdlc) {
      const threadId = generateId();
      const sdlcThread: ChatThread = {
        id: threadId,
        scopeKey: `${scopeKey}:sdlc`,
        scopeType: 'cr',
        entityId: crId,
        title: SDLC_TITLE,
        createdAt: now,
        updatedAt: now,
      };
      importedThreads.push(sdlcThread);
      scopedThreads.push(sdlcThread);
      threadByScope.set(scopeKey, scopedThreads);
      tabs.push({
        id: generateId(),
        threadId,
        scopeKey,
        type: 'sdlc',
        title: SDLC_TITLE,
        order: 0,
        active: false,
        createdAt: now,
        updatedAt: now,
      });
    }
    if (!scopedThreads.some((thread) => thread.scopeKey !== `${scopeKey}:sdlc` || thread.scopeType !== 'cr')) {
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
  return {
    tables: { ...tables, chatThreads: backfilled.threads, chatTabs: backfilled.tabs },
    tabs: backfilled.tabs,
  };
}

function countsFor(tables: BackupTableData): BackupTableCounts {
  return Object.fromEntries(Object.entries(tables).map(([key, rows]) => [key, Array.isArray(rows) ? rows.length : 0])) as unknown as BackupTableCounts;
}

async function captureSnapshot(targetDb: TaskPlannerDatabase, timestamp: string): Promise<SnapshotData> {
  // activeTimers is part of the snapshot: replaceTables clears the table for both import and
  // rollback, so omitting it here would destroy the in-progress timer with no way back.
  const [tasks, capacityRules, capacityOverrides, plannedAllocations, workSessions, activeTimers, notes, rawAttachments, chatThreads, chatMessages, chatTabs, documentSets, publishedDocuments, publishAttempts, dlpAudits, knowledgeLinks, telegramSettingsRaw, telegramWhitelist, systems, changeRequests, settings] = await Promise.all([
    targetDb.tasks.toArray(), targetDb.capacityRules.toArray(), targetDb.capacityOverrides.toArray(), targetDb.plannedAllocations.toArray(), targetDb.workSessions.toArray(), targetDb.activeTimers.toArray(), targetDb.notes.toArray(), targetDb.noteAttachments.toArray(), targetDb.chatThreads.toArray(), targetDb.chatMessages.toArray(), targetDb.chatTabs.toArray(), targetDb.documentSets.toArray(), targetDb.publishedDocuments.toArray(), targetDb.publishAttempts.toArray(), targetDb.dlpAudits.toArray(), targetDb.knowledgeLinks.toArray(), targetDb.telegramSettings.toArray(), targetDb.telegramWhitelist.toArray(), targetDb.systems.toArray(), targetDb.changeRequests.toArray(), targetDb.settings.toArray()
  ]);
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
  const tables: BackupTableData = { tasks, capacityRules, capacityOverrides, plannedAllocations, workSessions, activeTimers, notes, noteAttachments, chatThreads, chatMessages, chatTabs, documentSets, publishedDocuments, publishAttempts, dlpAudits, knowledgeLinks, telegramSettings, telegramWhitelist, systems, changeRequests, settings: safeSettings };
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
    ...(attachment.filePath ? { filePath: attachment.filePath } : {}),
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
    // Settings are replaced key-by-key, never cleared wholesale: secrets (tokens, passphrases)
    // are not part of any payload and must survive an import and its rollback.
    const incomingSettingKeys = new Set<string>([
      ...(tables.settings ?? []).map((setting) => setting.key),
      ...(tables.chatTabs ?? [])
        .filter((tab) => tab.workflowState && tab.scopeKey.startsWith('cr:'))
        .map((tab) => `sdlc_workflow:${tab.scopeKey.slice('cr:'.length)}:${tab.threadId}`),
    ]);
    await Promise.all([
      targetDb.tasks.clear(), targetDb.capacityRules.clear(), targetDb.capacityOverrides.clear(), targetDb.plannedAllocations.clear(), targetDb.workSessions.clear(), targetDb.activeTimers.clear(), targetDb.notes.clear(), targetDb.noteAttachments.clear(), targetDb.chatThreads.clear(), targetDb.chatMessages.clear(), targetDb.chatTabs.clear(), targetDb.telegramSettings.clear(), targetDb.telegramWhitelist.clear(), targetDb.systems.clear(), targetDb.changeRequests.clear(), ...clearKnowledge, targetDb.settings.bulkDelete([...incomingSettingKeys]), targetDb.backupMetadata.clear(),
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
    await add(targetDb.activeTimers, tables.activeTimers);
    for (const setting of tables.settings ?? []) if (isSafeBackupSetting(setting.key)) await targetDb.settings.put(setting);
    // The drawer restores SDLC workflow state from settings, not from the tab row. Mirror the tab's
    // exported workflowState into that key (and let the validator's `interrupted` checkpoint win),
    // so the two stores cannot disagree about a restored, blocked workflow.
    for (const tab of tables.chatTabs ?? []) {
      if (!tab.workflowState || !tab.scopeKey.startsWith('cr:')) continue;
      const key = `sdlc_workflow:${tab.scopeKey.slice('cr:'.length)}:${tab.threadId}`;
      const existing = await targetDb.settings.get(key);
      const base = (existing?.value ?? tab.workflowState) as Record<string, unknown>;
      const checkpoint = tab.workflowState.checkpoint ?? base.checkpoint;
      await targetDb.settings.put({ key, value: { ...base, ...(checkpoint ? { checkpoint } : {}) } });
    }
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
