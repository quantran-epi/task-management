import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { BackupEnvelope, SnapshotData } from '../../types/backup';
import { generateId } from '../../utils/uuid';
import { triggerDownload } from './exportBackup';

/**
 * Atomically replaces data in 6 domain tables with incoming backup payload.
 * Before clearing tables, captures full snapshot into `settings.last_pre_import_snapshot`.
 * Runs in a single Dexie readwrite transaction across 6 domain tables + settings + backupMetadata.
 */
export async function restoreBackupPayload(
  backup: BackupEnvelope,
  targetDb: TaskPlannerDatabase = defaultDb
): Promise<{ totalRestored: number; snapshotTime: string }> {
  const snapshotTime = new Date().toISOString();

  await targetDb.transaction(
    'rw',
    [
      targetDb.projects,
      targetDb.milestones,
      targetDb.tasks,
      targetDb.capacityRules,
      targetDb.capacityOverrides,
      targetDb.plannedAllocations,
      targetDb.settings,
      targetDb.backupMetadata,
    ],
    async () => {
      // 1. Capture snapshot of current domain tables
      const [projects, milestones, tasks, capacityRules, capacityOverrides, plannedAllocations] =
        await Promise.all([
          targetDb.projects.toArray(),
          targetDb.milestones.toArray(),
          targetDb.tasks.toArray(),
          targetDb.capacityRules.toArray(),
          targetDb.capacityOverrides.toArray(),
          targetDb.plannedAllocations.toArray(),
        ]);

      const snapshot: SnapshotData = {
        timestamp: snapshotTime,
        tables: {
          projects,
          milestones,
          tasks,
          capacityRules,
          capacityOverrides,
          plannedAllocations,
        },
        counts: {
          projects: projects.length,
          milestones: milestones.length,
          tasks: tasks.length,
          capacityRules: capacityRules.length,
          capacityOverrides: capacityOverrides.length,
          plannedAllocations: plannedAllocations.length,
        },
      };

      // Save pre-import snapshot to settings table
      await targetDb.settings.put({
        key: 'last_pre_import_snapshot',
        value: snapshot,
      });

      // 2. Clear current domain tables
      await Promise.all([
        targetDb.projects.clear(),
        targetDb.milestones.clear(),
        targetDb.tasks.clear(),
        targetDb.capacityRules.clear(),
        targetDb.capacityOverrides.clear(),
        targetDb.plannedAllocations.clear(),
      ]);

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

  await targetDb.transaction(
    'rw',
    [
      targetDb.projects,
      targetDb.milestones,
      targetDb.tasks,
      targetDb.capacityRules,
      targetDb.capacityOverrides,
      targetDb.plannedAllocations,
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
      ]);

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
 */
export function downloadSnapshotFile(snapshot: SnapshotData): void {
  const fileName = `task-planner-snapshot-${snapshot.timestamp.replace(/[:.]/g, '-')}.json`;
  const content = JSON.stringify(snapshot, null, 2);
  triggerDownload(content, fileName);
}
