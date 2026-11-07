import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../../src/db/index';
import { restoreBackupPayload } from '../../../src/services/backup/restoreBackup';
import type { BackupEnvelope } from '../../../src/types/backup';
import { APP_MARKER, CURRENT_SCHEMA_VERSION } from '../../../src/services/backup/exportBackup';

describe('restoreBackupPayload atomic failure handling', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestRestoreFailDB_' + Math.random().toString(36).slice(2));
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('aborts all changes cleanly when error is thrown inside transaction', async () => {
    // Populate an original CR
    await testDb.changeRequests.add({
      id: '00000000-0000-4000-8000-000000000000',
      name: 'Safe Initial CR',
      code: 'CR-SAFE',
      status: 'Open',
      type: 'ENHANCEMENT',
      targets: [],
      createdAt: '2026-09-26T10:00:00.000Z',
      updatedAt: '2026-09-26T10:00:00.000Z',
    });

    // Malformed backup that causes bulkAdd error (duplicate primary key in same table)
    const failingBackup: BackupEnvelope = {
      app: APP_MARKER,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      exportedAt: '2026-09-27T12:00:00.000Z',
      tables: {
        changeRequests: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            name: 'CR 1',
            code: 'CR-1',
            status: 'Open',
            type: 'ENHANCEMENT',
            targets: [],
            createdAt: '2026-09-27T12:00:00.000Z',
            updatedAt: '2026-09-27T12:00:00.000Z',
          },
          {
            id: '11111111-1111-4111-8111-111111111111', // Duplicate PK triggers Dexie error
            name: 'CR 2',
            code: 'CR-2',
            status: 'Open',
            type: 'ENHANCEMENT',
            targets: [],
            createdAt: '2026-09-27T12:00:00.000Z',
            updatedAt: '2026-09-27T12:00:00.000Z',
          },
        ],
        systems: [],
        tasks: [],
        capacityRules: [],
        capacityOverrides: [],
        plannedAllocations: [],
      },
      counts: {
        changeRequests: 2,
        systems: 0,
        tasks: 0,
        capacityRules: 0,
        capacityOverrides: 0,
        plannedAllocations: 0,
      },
    };

    await expect(restoreBackupPayload(failingBackup, testDb)).rejects.toThrow();

    // Verify original data is preserved untouched
    const crs = await testDb.changeRequests.toArray();
    expect(crs).toHaveLength(1);
    expect(crs[0]?.name).toBe('Safe Initial CR');
  });
});
