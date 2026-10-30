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
  db.projects,
  db.milestones,
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
  db.settings,
  db.backupMetadata,
];

const SDLC_TITLE = '⚙️ SDLC Workflow';
const DEFAULT_CHAT_TITLE = '💬 Cuộc trò chuyện';

function scopeFromThread(thread: ChatThread): string {
  return thread.scopeType === 'project' && thread.scopeKey.endsWith(':sdlc')
    ? thread.scopeKey.slice(0, -':sdlc'.length)
    : thread.scopeKey;
}

function legacyTabRows(
  threads: ChatThread[],
  projectIds: Set<string>,
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
      id: thread.scopeKey === `${scopeKey}:sdlc` && thread.scopeType === 'project' ? generateId() : thread.id,
      threadId: thread.id,
      scopeKey,
      type: thread.scopeKey === `${scopeKey}:sdlc` && thread.scopeType === 'project' ? 'sdlc' : 'chat',
      title: thread.title?.trim() || DEFAULT_CHAT_TITLE,
      order: 0,
      active: false,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
    });
  }

  for (const projectId of projectIds) scopes.add(`project:${projectId}`);
  const orderedScopes = [...scopes].sort();
  for (const scopeKey of orderedScopes) {
    const scopedThreads = threadByScope.get(scopeKey) ?? [];
    const hasSdlc = scopedThreads.some((thread) => thread.scopeKey === `${scopeKey}:sdlc` && thread.scopeType === 'project');
    const projectId = scopeKey.startsWith('project:') ? scopeKey.slice('project:'.length) : undefined;
    if (projectId && !hasSdlc) {
      const threadId = generateId();
      const sdlcThread: ChatThread = {
        id: threadId,
        scopeKey: `${scopeKey}:sdlc`,
        scopeType: 'project',
        entityId: projectId,
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
    if (!scopedThreads.some((thread) => thread.scopeKey !== `${scopeKey}:sdlc` || thread.scopeType !== 'project')) {
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
  const backfilled = legacyTabRows(tables.chatThreads ?? [], new Set(tables.projects.map((project) => project.id)), now);
  return {
    tables: { ...tables, chatThreads: backfilled.threads, chatTabs: backfilled.tabs },
    tabs: backfilled.tabs,
  };
}

function countsFor(tables: BackupTableData): BackupTableCounts {
  return Object.fromEntries(Object.entries(tables).map(([key, rows]) => [key, Array.isArray(rows) ? rows.length : 0])) as unknown as BackupTableCounts;
}

async function captureSnapshot(targetDb: TaskPlannerDatabase, timestamp: string): Promise<SnapshotData> {
  const [projects, milestones, tasks, capacityRules, capacityOverrides, plannedAllocations, workSessions, notes, rawAttachments, chatThreads, chatMessages, chatTabs, documentSets, publishedDocuments, publishAttempts, dlpAudits, knowledgeLinks, telegramSettingsRaw, telegramWhitelist, settings] = await Promise.all([
    targetDb.projects.toArray(), targetDb.milestones.toArray(), targetDb.tasks.toArray(), targetDb.capacityRules.toArray(), targetDb.capacityOverrides.toArray(), targetDb.plannedAllocations.toArray(), targetDb.workSessions.toArray(), targetDb.notes.toArray(), targetDb.noteAttachments.toArray(), targetDb.chatThreads.toArray(), targetDb.chatMessages.toArray(), targetDb.chatTabs.toArray(), targetDb.documentSets.toArray(), targetDb.publishedDocuments.toArray(), targetDb.publishAttempts.toArray(), targetDb.dlpAudits.toArray(), targetDb.knowledgeLinks.toArray(), targetDb.telegramSettings.toArray(), targetDb.telegramWhitelist.toArray(), targetDb.settings.toArray()
  ]);
  const telegramSettings = telegramSettingsRaw.map((setting) => ({ ...setting, botToken: '' }));
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
  const tables: BackupTableData = { projects, milestones, tasks, capacityRules, capacityOverrides, plannedAllocations, workSessions, notes, noteAttachments, chatThreads, chatMessages, chatTabs, documentSets, publishedDocuments, publishAttempts, dlpAudits, knowledgeLinks, telegramSettings, telegramWhitelist, settings };
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
  snapshot?: SnapshotData,
  recordCount = Object.values(countsFor(tables)).reduce((sum, count) => sum + count, 0),
): Promise<void> {
  await targetDb.transaction('rw', RESTORE_TABLES(targetDb), async () => {
    await Promise.all([
      targetDb.projects.clear(), targetDb.milestones.clear(), targetDb.tasks.clear(), targetDb.capacityRules.clear(), targetDb.capacityOverrides.clear(), targetDb.plannedAllocations.clear(), targetDb.workSessions.clear(), targetDb.activeTimers.clear(), targetDb.notes.clear(), targetDb.noteAttachments.clear(), targetDb.chatThreads.clear(), targetDb.chatMessages.clear(), targetDb.chatTabs.clear(), targetDb.telegramSettings.clear(), targetDb.telegramWhitelist.clear(), targetDb.documentSets.clear(), targetDb.publishedDocuments.clear(), targetDb.publishAttempts.clear(), targetDb.dlpAudits.clear(), targetDb.knowledgeLinks.clear(), targetDb.settings.clear(), targetDb.backupMetadata.clear(),
    ]);

    const add = async <T>(table: { bulkAdd: (rows: T[]) => Promise<unknown> }, rows: T[] | undefined) => {
      if (rows?.length) await table.bulkAdd(rows);
    };
    await add(targetDb.projects, tables.projects);
    await add(targetDb.milestones, tables.milestones);
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
    await add(targetDb.activeTimers, tables.activeTimers);
    for (const setting of tables.settings ?? []) if (isSafeBackupSetting(setting.key)) await targetDb.settings.put(setting);
    if (snapshot) await targetDb.settings.put({ key: 'last_pre_import_snapshot', value: snapshot });
    await targetDb.backupMetadata.add({ id: generateId(), timestamp: new Date().toISOString(), appVersion: '0.1.0', recordCount });
  });
}

export async function restoreBackupPayload(backup: BackupEnvelope, targetDb: TaskPlannerDatabase = defaultDb): Promise<{ totalRestored: number; snapshotTime: string }> {
  const validation = validateBackupPayload(backup);
  if (!validation.valid || !validation.envelope) throw new Error('Backup payload must pass validation before restore');
  const validatedBackup = validation.envelope;
  const snapshotTime = new Date().toISOString();
  const normalized = restoreRows(validatedBackup, snapshotTime);
  const snapshot = await captureSnapshot(targetDb, snapshotTime);
  const totalRestored = Object.values(validatedBackup.counts).reduce((sum, count) => sum + count, 0);
  await replaceTables(targetDb, normalized.tables, prepareAttachments(normalized.tables.noteAttachments), snapshot, totalRestored);
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
  const envelope: BackupEnvelope = { app: APP_MARKER, schemaVersion: CURRENT_SCHEMA_VERSION, exportedAt: snapshot.timestamp, tables: snapshot.tables, counts: snapshot.counts };
  triggerDownload(JSON.stringify(envelope, null, 2), fileName);
}
