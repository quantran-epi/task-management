import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../../src/db/index';
import { restoreBackupPayload, rollbackToSnapshot } from '../../../src/services/backup/restoreBackup';
import type { BackupEnvelope } from '../../../src/types/backup';
import { APP_MARKER, CURRENT_SCHEMA_VERSION } from '../../../src/services/backup/exportBackup';

describe('restoreBackupPayload & rollbackToSnapshot', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestRestoreDB_' + Math.random().toString(36).slice(2));
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  const sampleBackup: BackupEnvelope = {
    app: APP_MARKER,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: '2026-09-27T12:00:00.000Z',
    tables: {
      projects: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Restored Project',
          status: 'In Progress',
          createdAt: '2026-09-27T12:00:00.000Z',
          updatedAt: '2026-09-27T12:00:00.000Z',
        },
      ],
      milestones: [],
      tasks: [],
      capacityRules: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          dayOfWeek: 1,
          workMinutes: 480,
        },
      ],
      capacityOverrides: [],
      plannedAllocations: [],
    },
    counts: {
      projects: 1,
      milestones: 0,
      tasks: 0,
      capacityRules: 1,
      capacityOverrides: 0,
      plannedAllocations: 0,
    },
  };

  it('restores all tables, saves snapshot in settings, and logs to backupMetadata', async () => {
    // Populate some initial data
    await testDb.projects.add({
      id: '00000000-0000-4000-8000-000000000000',
      name: 'Initial Project',
      status: 'Open',
      createdAt: '2026-09-26T10:00:00.000Z',
      updatedAt: '2026-09-26T10:00:00.000Z',
    });

    const result = await restoreBackupPayload(sampleBackup, testDb);
    expect(result.totalRestored).toBe(2);

    // Verify existing tables replaced
    const projects = await testDb.projects.toArray();
    expect(projects).toHaveLength(1);
    expect(projects[0]?.name).toBe('Restored Project');

    // Verify snapshot saved in settings
    const snapshotSetting = await testDb.settings.get('last_pre_import_snapshot');
    expect(snapshotSetting).toBeDefined();
    const snapshot = snapshotSetting?.value as any;
    expect(snapshot.tables.projects).toHaveLength(1);
    expect(snapshot.tables.projects[0].name).toBe('Initial Project');

    // Verify backupMetadata logged
    const logs = await testDb.backupMetadata.toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0]?.recordCount).toBe(2);
  });

  it('rolls back to snapshot restoring previous state', async () => {
    // Initial data
    await testDb.projects.add({
      id: '00000000-0000-4000-8000-000000000000',
      name: 'Pre-Restore Project',
      status: 'Open',
      createdAt: '2026-09-26T10:00:00.000Z',
      updatedAt: '2026-09-26T10:00:00.000Z',
    });

    // Run restore
    await restoreBackupPayload(sampleBackup, testDb);
    expect((await testDb.projects.toArray())[0]?.name).toBe('Restored Project');

    // Run rollback
    const rollbackResult = await rollbackToSnapshot(testDb);
    expect(rollbackResult.success).toBe(true);

    // Check project is back to Pre-Restore Project
    const projects = await testDb.projects.toArray();
    expect(projects).toHaveLength(1);
    expect(projects[0]?.name).toBe('Pre-Restore Project');
  });
});
