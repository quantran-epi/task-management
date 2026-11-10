// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Dexie from 'dexie';
import { TaskPlannerDatabase } from '../../src/db/index';
import { exportBackupPayload } from '../../src/services/backup/exportBackup';
import { validateBackupPayload } from '../../src/services/backup/validateBackup';
import { restoreBackupPayload, rollbackToSnapshot } from '../../src/services/backup/restoreBackup';
import { formatElapsedTicker } from '../../src/utils/time';
import { createWorkSession } from '../../src/db/repositories/workSessionRepo';
import type { Task, ChangeRequest } from '../../src/types/models';

describe('Backup Schemas & Restore with Timer Work Sessions (TIMER-01, TIMER-02)', () => {
  let db: TaskPlannerDatabase;
  const dbName = 'TestBackupTimerDB_' + Math.random().toString(36).slice(2);

  const sampleCrId = '11111111-1111-4111-8111-111111111111';
  const sampleTaskId = '33333333-3333-4333-8333-333333333331';

  beforeEach(async () => {
    db = new TaskPlannerDatabase(dbName);
    await db.open();

    const now = new Date().toISOString();
    const cr: ChangeRequest = {
      id: sampleCrId,
      name: 'Backup Test CR',
      code: 'CR-BACKUP',
      status: 'In Progress',
      type: 'ENHANCEMENT',
      targets: [],
      createdAt: now,
      updatedAt: now,
    };
    await db.changeRequests.add(cr);

    const task: Task = {
      id: sampleTaskId,
      crId: sampleCrId,
      name: 'Backup Test Task',
      status: 'Open',
      progress: 0,
      priority: 'High',
      estimateMinutes: 60,
      createdAt: now,
      updatedAt: now,
    };
    await db.tasks.add(task);

    await createWorkSession(
      {
        taskId: sampleTaskId,
        startTime: '2026-09-29T08:00:00.000Z',
        endTime: '2026-09-29T08:45:00.000Z',
        durationMinutes: 45,
        note: 'Backup work session log',
      },
      db
    );
  });

  afterEach(async () => {
    db.close();
    await Dexie.delete(dbName);
  });

  it('exports backup payload with the version-11 envelope and includes workSessions', async () => {
    const payload = await exportBackupPayload(db);

    expect(payload.schemaVersion).toBe(12);
    expect(payload.tables.workSessions).toBeDefined();
    expect(payload.tables.workSessions).toHaveLength(1);
    expect(payload.counts.workSessions).toBe(1);
    expect(payload.tables.workSessions?.[0]?.durationMinutes).toBe(45);
    expect(payload.tables.workSessions?.[0]?.note).toBe('Backup work session log');
  });

  it('validates schema v3 backup payload successfully', async () => {
    const payload = await exportBackupPayload(db);
    const result = validateBackupPayload(payload);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.envelope?.tables.workSessions).toHaveLength(1);
  });

  it('rejects a legacy v2 payload carrying projects/milestones (D-49)', async () => {
    const legacyV2Payload = {
      app: 'personal-task-planner',
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      tables: {
        projects: [
          {
            id: sampleCrId,
            name: 'V2 Project',
            status: 'Open',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        milestones: [],
        tasks: [],
        capacityRules: [],
        capacityOverrides: [],
        plannedAllocations: [],
      },
      counts: {
        projects: 1,
        milestones: 0,
        tasks: 0,
        capacityRules: 0,
        capacityOverrides: 0,
        plannedAllocations: 0,
      },
    };

    const result = validateBackupPayload(legacyV2Payload);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Backup phiên bản cũ không còn được hỗ trợ'))).toBe(true);
  });

  it('catches referential integrity errors when workSession references non-existent taskId', async () => {
    const payload = await exportBackupPayload(db);
    if (payload.tables.workSessions && payload.tables.workSessions[0]) {
      payload.tables.workSessions[0].taskId = '99999999-9999-4999-8999-999999999999';
    }

    const result = validateBackupPayload(payload);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.table === 'workSessions' && e.field === 'taskId')).toBe(true);
  });

  it('restores backup payload and pre-import snapshot with workSessions', async () => {
    const exported = await exportBackupPayload(db);

    // Modify current db: delete work session
    await db.workSessions.clear();
    const sessionsBeforeRestore = await db.workSessions.toArray();
    expect(sessionsBeforeRestore).toHaveLength(0);

    // Restore from exported payload
    const restoreResult = await restoreBackupPayload(exported, db);
    expect(restoreResult.totalRestored).toBeGreaterThan(0);

    const sessionsAfterRestore = await db.workSessions.toArray();
    expect(sessionsAfterRestore).toHaveLength(1);
    expect(sessionsAfterRestore[0]?.durationMinutes).toBe(45);

    // Test rollback to snapshot
    await rollbackToSnapshot(db);
    const sessionsAfterRollback = await db.workSessions.toArray();
    expect(sessionsAfterRollback).toHaveLength(0); // snapshot captured when empty
  });

  it('formats elapsed seconds into HH:mm:ss ticker strings', () => {
    expect(formatElapsedTicker(0)).toBe('00:00:00');
    expect(formatElapsedTicker(45)).toBe('00:00:45');
    expect(formatElapsedTicker(125)).toBe('00:02:05');
    expect(formatElapsedTicker(3665)).toBe('01:01:05');
    expect(formatElapsedTicker(36000)).toBe('10:00:00');
    expect(formatElapsedTicker(-5)).toBe('00:00:00');
  });
});
