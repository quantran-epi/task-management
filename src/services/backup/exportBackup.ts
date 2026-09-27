import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { BackupEnvelope } from '../../types/backup';
import { generateId } from '../../utils/uuid';

export const APP_MARKER = 'personal-task-planner' as const;
export const CURRENT_SCHEMA_VERSION = 1 as const;

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
 * Headless export function querying 6 core business tables from targetDb,
 * assembling the standard envelope, logging export history to backupMetadata,
 * and returning the BackupEnvelope.
 */
export async function exportBackupPayload(
  targetDb: TaskPlannerDatabase = defaultDb
): Promise<BackupEnvelope> {
  const [
    projects,
    milestones,
    tasks,
    capacityRules,
    capacityOverrides,
    plannedAllocations,
  ] = await Promise.all([
    targetDb.projects.toArray(),
    targetDb.milestones.toArray(),
    targetDb.tasks.toArray(),
    targetDb.capacityRules.toArray(),
    targetDb.capacityOverrides.toArray(),
    targetDb.plannedAllocations.toArray(),
  ]);

  const exportedAt = new Date().toISOString();

  const tables = {
    projects,
    milestones,
    tasks,
    capacityRules,
    capacityOverrides,
    plannedAllocations,
  };

  const counts = {
    projects: projects.length,
    milestones: milestones.length,
    tasks: tasks.length,
    capacityRules: capacityRules.length,
    capacityOverrides: capacityOverrides.length,
    plannedAllocations: plannedAllocations.length,
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
