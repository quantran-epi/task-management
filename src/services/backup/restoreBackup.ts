import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { BackupEnvelope, SnapshotData } from '../../types/backup';
import type { NoteAttachment } from '../../types/models';
import { generateId } from '../../utils/uuid';
import { isSafeBackupSetting, blobToBase64, triggerDownload, APP_MARKER, CURRENT_SCHEMA_VERSION } from './exportBackup';

/**
 * Converts a Base64 Data URL or raw base64 back into a browser Blob.
 */
function base64ToBlob(base64Data: string, mimeType: string): Blob {
  try {
    const raw = base64Data.includes(',') ? base64Data.split(',')[1] || '' : base64Data;
    const binary = atob(raw);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
  } catch {
    return new Blob([], { type: mimeType });
  }
}

/**
 * Atomically replaces data in domain tables with incoming backup payload.
 * Before clearing tables, captures full snapshot into `settings.last_pre_import_snapshot`.
 * Runs in a single Dexie readwrite transaction across domain tables + settings + backupMetadata.
 */
export async function restoreBackupPayload(
  backup: BackupEnvelope,
  targetDb: TaskPlannerDatabase = defaultDb
): Promise<{ totalRestored: number; snapshotTime: string }> {
  const snapshotTime = new Date().toISOString();

  // 1. Capture snapshot of current domain tables before opening the transaction.
  // Converting attachments via blobToBase64 is asynchronous and must complete outside
  // the Dexie transaction so IndexedDB does not auto-commit/abort due to non-IDB microtask delays.
  const [
    projects,
    milestones,
    tasks,
    capacityRules,
    capacityOverrides,
    plannedAllocations,
    workSessions,
    notes,
    rawAttachments,
    chatThreads,
    chatMessages,
    documentSets,
    publishedDocuments,
    publishAttempts,
    dlpAudits,
    knowledgeLinks,
    telegramSettingsRaw,
    telegramWhitelist,
  ] = await Promise.all([
    targetDb.projects.toArray(),
    targetDb.milestones.toArray(),
    targetDb.tasks.toArray(),
    targetDb.capacityRules.toArray(),
    targetDb.capacityOverrides.toArray(),
    targetDb.plannedAllocations.toArray(),
    targetDb.workSessions.toArray(),
    targetDb.notes.toArray(),
    targetDb.noteAttachments.toArray(),
    targetDb.chatThreads.toArray(),
    targetDb.chatMessages.toArray(),
    targetDb.documentSets.toArray(),
    targetDb.publishedDocuments.toArray(),
    targetDb.publishAttempts.toArray(),
    targetDb.dlpAudits.toArray(),
    targetDb.knowledgeLinks.toArray(),
    targetDb.telegramSettings.toArray(),
    targetDb.telegramWhitelist.toArray(),
  ]);

  const telegramSettings = telegramSettingsRaw.map((s) => ({
    ...s,
    botToken: '',
  }));

  const serializedAttachments = await Promise.all(
    rawAttachments.map(async (att) => ({
      id: att.id,
      noteId: att.noteId,
      fileName: att.fileName,
      mimeType: att.mimeType,
      sizeBytes: att.sizeBytes,
      data: await blobToBase64(att.data, att.mimeType),
      ...(att.caption ? { caption: att.caption } : {}),
      createdAt: att.createdAt,
    }))
  );

  const snapshot: SnapshotData = {
    timestamp: snapshotTime,
    tables: {
      projects,
      milestones,
      tasks,
      capacityRules,
      capacityOverrides,
      plannedAllocations,
      workSessions,
      notes,
      noteAttachments: serializedAttachments,
      chatThreads,
      chatMessages,
      documentSets,
      publishedDocuments,
      publishAttempts,
      dlpAudits,
      knowledgeLinks,
      telegramSettings,
      telegramWhitelist,
    },
    counts: {
      projects: projects.length,
      milestones: milestones.length,
      tasks: tasks.length,
      capacityRules: capacityRules.length,
      capacityOverrides: capacityOverrides.length,
      plannedAllocations: plannedAllocations.length,
      workSessions: workSessions.length,
      notes: notes.length,
      noteAttachments: rawAttachments.length,
      chatThreads: chatThreads.length,
      chatMessages: chatMessages.length,
      documentSets: documentSets.length,
      publishedDocuments: publishedDocuments.length,
      publishAttempts: publishAttempts.length,
      dlpAudits: dlpAudits.length,
      knowledgeLinks: knowledgeLinks.length,
      telegramSettings: telegramSettings.length,
      telegramWhitelist: telegramWhitelist.length,
    },
  };

  // Pre-map incoming attachments to avoid CPU work during transaction
  const restoredAttachments: NoteAttachment[] =
    backup.tables.noteAttachments && backup.tables.noteAttachments.length
      ? backup.tables.noteAttachments.map((att) => ({
          id: att.id,
          noteId: att.noteId,
          fileName: att.fileName,
          mimeType: att.mimeType,
          sizeBytes: att.sizeBytes,
          data: att.data ? base64ToBlob(att.data, att.mimeType) : new Blob([], { type: att.mimeType }),
          ...(att.filePath ? { filePath: att.filePath } : {}),
          ...(att.caption ? { caption: att.caption } : {}),
          createdAt: att.createdAt,
        }))
      : [];

  await targetDb.transaction(
    'rw',
    [
      targetDb.projects,
      targetDb.milestones,
      targetDb.tasks,
      targetDb.capacityRules,
      targetDb.capacityOverrides,
      targetDb.plannedAllocations,
      targetDb.workSessions,
      targetDb.activeTimers,
      targetDb.notes,
      targetDb.noteAttachments,
      targetDb.chatThreads,
      targetDb.chatMessages,
      targetDb.documentSets,
      targetDb.publishedDocuments,
      targetDb.publishAttempts,
      targetDb.dlpAudits,
      targetDb.knowledgeLinks,
      targetDb.telegramSettings,
      targetDb.telegramWhitelist,
      targetDb.settings,
      targetDb.backupMetadata,
    ],
    async () => {
      // 1. Save pre-import snapshot to settings table
      await targetDb.settings.put({
        key: 'last_pre_import_snapshot',
        value: snapshot,
      });

      // 2. Clear current domain tables, notes, attachments, active timers, and chat
      await Promise.all([
        targetDb.projects.clear(),
        targetDb.milestones.clear(),
        targetDb.tasks.clear(),
        targetDb.capacityRules.clear(),
        targetDb.capacityOverrides.clear(),
        targetDb.plannedAllocations.clear(),
        targetDb.workSessions.clear(),
        targetDb.activeTimers.clear(),
        targetDb.notes.clear(),
        targetDb.noteAttachments.clear(),
        targetDb.chatThreads.clear(),
        targetDb.chatMessages.clear(),
        targetDb.telegramSettings.clear(),
        targetDb.telegramWhitelist.clear(),
      ]);

      // 2b. Knowledge tables: only clear when the payload explicitly carries documentSets.
      // A legacy backup omitting the field must not erase a valid local catalog (data loss).
      if (backup.tables.documentSets !== undefined) {
        await Promise.all([
          targetDb.documentSets.clear(),
          targetDb.publishedDocuments.clear(),
          targetDb.publishAttempts.clear(),
          targetDb.dlpAudits.clear(),
          targetDb.knowledgeLinks.clear(),
        ]);
      }

      // 3. Bulk add incoming records
      if (backup.tables.projects.length) {
        await targetDb.projects.bulkAdd(backup.tables.projects);
      }
      if (backup.tables.milestones.length) {
        await targetDb.milestones.bulkAdd(backup.tables.milestones);
      }
      if (backup.tables.tasks.length) {
        await targetDb.tasks.bulkAdd(backup.tables.tasks);
      }
      if (backup.tables.capacityRules.length) {
        await targetDb.capacityRules.bulkAdd(backup.tables.capacityRules);
      }
      if (backup.tables.capacityOverrides.length) {
        await targetDb.capacityOverrides.bulkAdd(backup.tables.capacityOverrides);
      }
      if (backup.tables.plannedAllocations.length) {
        await targetDb.plannedAllocations.bulkAdd(backup.tables.plannedAllocations);
      }
      if (backup.tables.workSessions && backup.tables.workSessions.length) {
        await targetDb.workSessions.bulkAdd(backup.tables.workSessions);
      }
      if (backup.tables.notes && backup.tables.notes.length) {
        await targetDb.notes.bulkAdd(backup.tables.notes);
      }
      if (restoredAttachments.length) {
        await targetDb.noteAttachments.bulkAdd(restoredAttachments);
      }
      if (backup.tables.chatThreads && backup.tables.chatThreads.length) {
        await targetDb.chatThreads.bulkAdd(backup.tables.chatThreads);
      }
      if (backup.tables.chatMessages && backup.tables.chatMessages.length) {
        await targetDb.chatMessages.bulkAdd(backup.tables.chatMessages);
      }
      if (backup.tables.documentSets?.length) {
        await targetDb.documentSets.bulkAdd(backup.tables.documentSets);
      }
      if (backup.tables.publishedDocuments?.length) {
        await targetDb.publishedDocuments.bulkAdd(backup.tables.publishedDocuments);
      }
      if (backup.tables.publishAttempts?.length) {
        await targetDb.publishAttempts.bulkAdd(backup.tables.publishAttempts);
      }
      if (backup.tables.dlpAudits?.length) {
        await targetDb.dlpAudits.bulkAdd(backup.tables.dlpAudits);
      }
      if (backup.tables.knowledgeLinks?.length) {
        await targetDb.knowledgeLinks.bulkAdd(backup.tables.knowledgeLinks);
      }
      if (backup.tables.telegramSettings?.length) {
        await targetDb.telegramSettings.bulkAdd(backup.tables.telegramSettings);
      }
      if (backup.tables.telegramWhitelist?.length) {
        await targetDb.telegramWhitelist.bulkAdd(backup.tables.telegramWhitelist);
      }
      if (backup.tables.activeTimers && backup.tables.activeTimers.length) {
        await targetDb.activeTimers.bulkAdd(backup.tables.activeTimers);
      }
      if (backup.tables.settings && backup.tables.settings.length) {
        for (const setting of backup.tables.settings) {
          if (isSafeBackupSetting(setting.key)) {
            await targetDb.settings.put(setting);
          }
        }
      }

      // 4. Log restore in backupMetadata
      const totalCount = Object.values(backup.counts).reduce((sum, n) => sum + n, 0);
      await targetDb.backupMetadata.add({
        id: generateId(),
        timestamp: snapshotTime,
        appVersion: '0.1.0',
        recordCount: totalCount,
      });
    }
  );

  const totalRestored = Object.values(backup.counts).reduce((sum, n) => sum + n, 0);
  return { totalRestored, snapshotTime };
}


/**
 * Rolls back the database to the saved pre-import snapshot in settings.
 */
export async function rollbackToSnapshot(
  targetDb: TaskPlannerDatabase = defaultDb
): Promise<{ success: boolean; totalRestored: number }> {
  const snapshotSetting = await targetDb.settings.get('last_pre_import_snapshot');
  if (!snapshotSetting || !snapshotSetting.value) {
    throw new Error('Không tìm thấy bản snapshot an toàn để hoàn tác');
  }

  const snapshot = snapshotSetting.value as SnapshotData;
  const rollbackTime = new Date().toISOString();

  // Pre-map attachments outside transaction
  const restoredAttachments: NoteAttachment[] =
    snapshot.tables.noteAttachments && snapshot.tables.noteAttachments.length
      ? snapshot.tables.noteAttachments.map((att) => ({
          id: att.id,
          noteId: att.noteId,
          fileName: att.fileName,
          mimeType: att.mimeType,
          sizeBytes: att.sizeBytes,
          data: att.data ? base64ToBlob(att.data, att.mimeType) : new Blob([], { type: att.mimeType }),
          ...(att.filePath ? { filePath: att.filePath } : {}),
          ...(att.caption ? { caption: att.caption } : {}),
          createdAt: att.createdAt,
        }))
      : [];

  await targetDb.transaction(
    'rw',
    [
      targetDb.projects,
      targetDb.milestones,
      targetDb.tasks,
      targetDb.capacityRules,
      targetDb.capacityOverrides,
      targetDb.plannedAllocations,
      targetDb.workSessions,
      targetDb.activeTimers,
      targetDb.notes,
      targetDb.noteAttachments,
      targetDb.chatThreads,
      targetDb.chatMessages,
      targetDb.documentSets,
      targetDb.publishedDocuments,
      targetDb.publishAttempts,
      targetDb.dlpAudits,
      targetDb.knowledgeLinks,
      targetDb.telegramSettings,
      targetDb.telegramWhitelist,
      targetDb.settings,
      targetDb.backupMetadata,
    ],
    async () => {
      // 1. Clear current domain tables
      await Promise.all([
        targetDb.projects.clear(),
        targetDb.milestones.clear(),
        targetDb.tasks.clear(),
        targetDb.capacityRules.clear(),
        targetDb.capacityOverrides.clear(),
        targetDb.plannedAllocations.clear(),
        targetDb.workSessions.clear(),
        targetDb.activeTimers.clear(),
        targetDb.notes.clear(),
        targetDb.noteAttachments.clear(),
        targetDb.chatThreads.clear(),
        targetDb.chatMessages.clear(),
        targetDb.telegramSettings.clear(),
        targetDb.telegramWhitelist.clear(),
      ]);

      // 1b. Pre-v10 snapshots omit documentSets; preserve the live catalog instead of erasing it.
      if (snapshot.tables.documentSets !== undefined) {
        await Promise.all([
          targetDb.documentSets.clear(),
          targetDb.publishedDocuments.clear(),
          targetDb.publishAttempts.clear(),
          targetDb.dlpAudits.clear(),
          targetDb.knowledgeLinks.clear(),
        ]);
      }

      // 2. Restore records from snapshot
      if (snapshot.tables.projects.length) {
        await targetDb.projects.bulkAdd(snapshot.tables.projects);
      }
      if (snapshot.tables.milestones.length) {
        await targetDb.milestones.bulkAdd(snapshot.tables.milestones);
      }
      if (snapshot.tables.tasks.length) {
        await targetDb.tasks.bulkAdd(snapshot.tables.tasks);
      }
      if (snapshot.tables.capacityRules.length) {
        await targetDb.capacityRules.bulkAdd(snapshot.tables.capacityRules);
      }
      if (snapshot.tables.capacityOverrides.length) {
        await targetDb.capacityOverrides.bulkAdd(snapshot.tables.capacityOverrides);
      }
      if (snapshot.tables.plannedAllocations.length) {
        await targetDb.plannedAllocations.bulkAdd(snapshot.tables.plannedAllocations);
      }
      if (snapshot.tables.workSessions && snapshot.tables.workSessions.length) {
        await targetDb.workSessions.bulkAdd(snapshot.tables.workSessions);
      }
      if (snapshot.tables.notes && snapshot.tables.notes.length) {
        await targetDb.notes.bulkAdd(snapshot.tables.notes);
      }
      if (restoredAttachments.length) {
        await targetDb.noteAttachments.bulkAdd(restoredAttachments);
      }
      if (snapshot.tables.chatThreads && snapshot.tables.chatThreads.length) {
        await targetDb.chatThreads.bulkAdd(snapshot.tables.chatThreads);
      }
      if (snapshot.tables.chatMessages && snapshot.tables.chatMessages.length) {
        await targetDb.chatMessages.bulkAdd(snapshot.tables.chatMessages);
      }
      if (snapshot.tables.documentSets?.length) {
        await targetDb.documentSets.bulkAdd(snapshot.tables.documentSets);
      }
      if (snapshot.tables.publishedDocuments?.length) {
        await targetDb.publishedDocuments.bulkAdd(snapshot.tables.publishedDocuments);
      }
      if (snapshot.tables.publishAttempts?.length) {
        await targetDb.publishAttempts.bulkAdd(snapshot.tables.publishAttempts);
      }
      if (snapshot.tables.dlpAudits?.length) {
        await targetDb.dlpAudits.bulkAdd(snapshot.tables.dlpAudits);
      }
      if (snapshot.tables.knowledgeLinks?.length) {
        await targetDb.knowledgeLinks.bulkAdd(snapshot.tables.knowledgeLinks);
      }
      if (snapshot.tables.telegramSettings?.length) {
        await targetDb.telegramSettings.bulkAdd(snapshot.tables.telegramSettings);
      }
      if (snapshot.tables.telegramWhitelist?.length) {
        await targetDb.telegramWhitelist.bulkAdd(snapshot.tables.telegramWhitelist);
      }

      // 3. Clear the snapshot from settings after rollback
      await targetDb.settings.delete('last_pre_import_snapshot');


      // 4. Log rollback in backupMetadata
      const totalCount = Object.values(snapshot.counts).reduce((sum, n) => sum + n, 0);
      await targetDb.backupMetadata.add({
        id: generateId(),
        timestamp: rollbackTime,
        appVersion: '0.1.0',
        recordCount: totalCount,
      });
    }
  );

  const totalRestored = Object.values(snapshot.counts).reduce((sum, n) => sum + n, 0);
  return { success: true, totalRestored };
}

/**
 * Downloads the snapshot as a standard JSON backup file for disaster recovery.
 * Wraps snapshot tables and counts in BackupEnvelope for full re-import compatibility.
 */
export function downloadSnapshotFile(snapshot: SnapshotData): void {
  const fileName = `task-planner-snapshot-${snapshot.timestamp.replace(/[:.]/g, '-')}.json`;
  const envelope: BackupEnvelope = {
    app: APP_MARKER,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: snapshot.timestamp,
    tables: snapshot.tables,
    counts: snapshot.counts,
  };
  const content = JSON.stringify(envelope, null, 2);
  triggerDownload(content, fileName);
}
