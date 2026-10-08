import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { BackupEnvelope } from '../../types/backup';
import { generateId } from '../../utils/uuid';

export const APP_MARKER = 'personal-task-planner' as const;
export const CURRENT_SCHEMA_VERSION = 4 as const;

export const UNSAFE_OR_EPHEMERAL_SETTING_KEYS = new Set<string>([
  'jira_api_token',
  'github_pat',
  'github_token',
  'github_passphrase',
  'backup_passphrase',
  'ninerouter_api_key',
  'knowledge_server_token',
  'image_api_key',
  'tauri_keyring_migrated',
  'tauri_sqlite_queue',
  'tauri_sqlite_last_flush_at',
  'tauri_sqlite_missing_path',
  'tauri_sqlite_path',
  'tauri_sqlite_enabled',
  'last_synced_sha',
  'last_synced_at',
  'github_auto_sync_last_run_at',
  'github_auto_sync_last_attempt_at',
  'github_auto_sync_last_error',
  'github_auto_sync_state',
  'github_auto_sync_dirty_since',
  'github_auto_sync_missed_due_at',
  'last_pre_import_snapshot',
]);

export function isSafeBackupSetting(key: string): boolean {
  if (UNSAFE_OR_EPHEMERAL_SETTING_KEYS.has(key)) return false;
  const lower = key.toLowerCase();
  if (
    lower.endsWith('_token') ||
    lower.endsWith('_key') ||
    lower.endsWith('_passphrase') ||
    lower.endsWith('_secret') ||
    lower.endsWith('_pat')
  ) {
    return false;
  }
  return true;
}

export async function blobToBase64(blob: Blob, fallbackMime?: string): Promise<string> {
  const mime = blob.type || fallbackMime || 'application/octet-stream';

  if (typeof (blob as any).arrayBuffer === 'function') {
    const buffer = await (blob as any).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    const base64 = btoa(binary);
    return `data:${mime};base64,${base64}`;
  }

  // Handle fake-indexeddb / node-blob / buffer
  if (typeof (blob as any).text === 'function') {
    const text = await (blob as any).text();
    const base64 = btoa(text);
    return `data:${mime};base64,${base64}`;
  }

  if (typeof FileReader !== 'undefined') {
    try {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve(reader.result as string);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      // Fallback below
    }
  }

  // Node Buffer check
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(await (blob as any).text?.() || '');
    return `data:${mime};base64,${buf.toString('base64')}`;
  }

  throw new Error('Không thể chuyển đổi Blob sang Base64');
}

/**
 * Generates formatted backup filename: task-planner-backup-YYYY-MM-DD-HHmmss.json
 */
export function generateBackupFileName(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `task-planner-backup-${year}-${month}-${day}-${hours}${minutes}${seconds}.json`;
}

/**
 * Headless export function querying 6 core business tables + workSessions from targetDb,
 * assembling the standard envelope, logging export history to backupMetadata,
 * and returning the BackupEnvelope.
 */
export interface ExportBackupOptions {
  excludeAttachmentData?: boolean;
}

export async function exportBackupPayload(
  targetDb: TaskPlannerDatabase = defaultDb,
  _options?: ExportBackupOptions
): Promise<BackupEnvelope> {
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
    activeTimers,
    allSettings,
    documentSets,
    publishedDocuments,
    publishAttempts,
    dlpAudits,
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
    targetDb.activeTimers.toArray(),
    targetDb.settings.toArray(),
    targetDb.documentSets.toArray(),
    targetDb.publishedDocuments.toArray(),
    targetDb.publishAttempts.toArray(),
    targetDb.dlpAudits.toArray(),
  ]);

  // Strictly exclude binary and base64 image data to prevent storage growth
  const noteAttachments = rawAttachments.map((att) => ({
    id: att.id,
    noteId: att.noteId,
    fileName: att.fileName,
    mimeType: att.mimeType,
    sizeBytes: att.sizeBytes,
    filePath: att.filePath || `attachments/${att.id}_${att.fileName}`,
    ...(att.caption ? { caption: att.caption } : {}),
    createdAt: att.createdAt,
  }));

  // Filter settings to include only safe configuration, stripping secrets and machine-local sync markers
  const safeSettings = allSettings.filter((s) => isSafeBackupSetting(s.key));

  const exportedAt = new Date().toISOString();

  const tables = {
    projects,
    milestones,
    tasks,
    capacityRules,
    capacityOverrides,
    plannedAllocations,
    workSessions,
    notes,
    noteAttachments,
    chatThreads,
    chatMessages,
    activeTimers,
    settings: safeSettings,
    documentSets,
    publishedDocuments,
    publishAttempts,
    dlpAudits,
  };

  const counts = {
    projects: projects.length,
    milestones: milestones.length,
    tasks: tasks.length,
    capacityRules: capacityRules.length,
    capacityOverrides: capacityOverrides.length,
    plannedAllocations: plannedAllocations.length,
    workSessions: workSessions.length,
    notes: notes.length,
    noteAttachments: noteAttachments.length,
    chatThreads: chatThreads.length,
    chatMessages: chatMessages.length,
    activeTimers: activeTimers.length,
    settings: safeSettings.length,
    documentSets: documentSets.length,
    publishedDocuments: publishedDocuments.length,
    publishAttempts: publishAttempts.length,
    dlpAudits: dlpAudits.length,
  };

  const envelope: BackupEnvelope = {
    app: APP_MARKER,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt,
    tables,
    counts,
  };


  const totalRecordCount = Object.values(counts).reduce((sum, n) => sum + n, 0);

  await targetDb.backupMetadata.add({
    id: generateId(),
    timestamp: exportedAt,
    appVersion: '0.1.0',
    recordCount: totalRecordCount,
  });

  return envelope;
}

/**
 * Triggers browser download by creating a temporary Blob and synthetic anchor click,
 * then revoking the object URL immediately to prevent memory leaks (T-06-02).
 */
export function triggerDownload(content: string, fileName: string): void {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
