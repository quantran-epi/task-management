// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  exportBackupPayload,
  APP_MARKER,
  CURRENT_SCHEMA_VERSION,
} from '../../../src/services/backup/exportBackup';
import { validateBackupPayload } from '../../../src/services/backup/validateBackup';
import { TaskPlannerDatabase } from '../../../src/db';
import type { BackupEnvelope } from '../../../src/types/backup';

describe('Backup Schema v2 Export & v1 Backward Compatibility (SHB-05, D-16, D-17)', () => {
  describe('exportBackupPayload', () => {
    it('emits backup envelope with CURRENT_SCHEMA_VERSION equal to 4', async () => {
      const testDb = new TaskPlannerDatabase('TestExportV2DB_' + Math.random().toString(36).slice(2));
      await testDb.open();

      const envelope = await exportBackupPayload(testDb);
      expect(CURRENT_SCHEMA_VERSION).toBe(4);
      expect(envelope.schemaVersion).toBe(4);
      expect(envelope.app).toBe(APP_MARKER);

      await testDb.delete();
    });
  });


  describe('validateBackupPayload v1 compatibility & normalization', () => {
    const sampleProjectId = '11111111-1111-4111-8111-111111111111';
    const sampleMilestoneId = '22222222-2222-4222-8222-222222222222';
    const sampleTaskId = '33333333-3333-4333-8333-333333333333';

    it('accepts v1 backup payload and normalizes records with empty arrays and workType "code"', () => {
      const v1Payload: BackupEnvelope = {
        app: APP_MARKER,
        schemaVersion: 1,
        exportedAt: '2026-09-01T00:00:00.000Z',
        tables: {
          projects: [
            {
              id: sampleProjectId,
              name: 'Legacy Project',
              status: 'Open',
              createdAt: '2026-09-01T00:00:00.000Z',
              updatedAt: '2026-09-01T00:00:00.000Z',
            },
          ],
          milestones: [
            {
              id: sampleMilestoneId,
              projectId: sampleProjectId,
              name: 'Legacy Milestone',
              status: 'Open',
              createdAt: '2026-09-01T00:00:00.000Z',
              updatedAt: '2026-09-01T00:00:00.000Z',
            },
          ],
          tasks: [
            {
              id: sampleTaskId,
              projectId: sampleProjectId,
              milestoneId: sampleMilestoneId,
              name: 'Legacy Task',
              status: 'Open',
              progress: 0,
              priority: 'Medium',
              estimateMinutes: 120,
              createdAt: '2026-09-01T00:00:00.000Z',
              updatedAt: '2026-09-01T00:00:00.000Z',
            },
          ],
          capacityRules: [],
          capacityOverrides: [],
          plannedAllocations: [],
        },
        counts: {
          projects: 1,
          milestones: 1,
          tasks: 1,
          capacityRules: 0,
          capacityOverrides: 0,
          plannedAllocations: 0,
        },
      };

      const result = validateBackupPayload(v1Payload);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.envelope).toBeDefined();

      const project = result.envelope!.tables.projects[0];
      expect(project?.opsOwners).toEqual([]);
      expect(project?.businessAnalysts).toEqual([]);

      const milestone = result.envelope!.tables.milestones[0];
      expect(milestone?.opsOwners).toEqual([]);
      expect(milestone?.businessAnalysts).toEqual([]);

      const task = result.envelope!.tables.tasks[0];
      expect(task?.opsOwners).toEqual([]);
      expect(task?.businessAnalysts).toEqual([]);
      expect(task?.workType).toBe('code');
    });

    it('accepts v2 backup payload preserving explicit tag arrays and workType', () => {
      const v2Payload: BackupEnvelope = {
        app: APP_MARKER,
        schemaVersion: 2,
        exportedAt: '2026-09-28T00:00:00.000Z',
        tables: {
          projects: [
            {
              id: sampleProjectId,
              name: 'V2 Project',
              status: 'In Progress',
              opsOwners: ['OpsAlice'],
              businessAnalysts: ['BABob'],
              createdAt: '2026-09-28T00:00:00.000Z',
              updatedAt: '2026-09-28T00:00:00.000Z',
            },
          ],
          milestones: [
            {
              id: sampleMilestoneId,
              projectId: sampleProjectId,
              name: 'V2 Milestone',
              status: 'In Progress',
              opsOwners: ['OpsAlice'],
              businessAnalysts: ['BABob'],
              createdAt: '2026-09-28T00:00:00.000Z',
              updatedAt: '2026-09-28T00:00:00.000Z',
            },
          ],
          tasks: [
            {
              id: sampleTaskId,
              projectId: sampleProjectId,
              milestoneId: sampleMilestoneId,
              name: 'V2 Task',
              status: 'In Progress',
              progress: 50,
              priority: 'High',
              estimateMinutes: 240,
              workType: 'investigate',
              opsOwners: ['OpsAlice', 'OpsCharlie'],
              businessAnalysts: ['BABob'],
              createdAt: '2026-09-28T00:00:00.000Z',
              updatedAt: '2026-09-28T00:00:00.000Z',
            },
          ],
          capacityRules: [],
          capacityOverrides: [],
          plannedAllocations: [],
        },
        counts: {
          projects: 1,
          milestones: 1,
          tasks: 1,
          capacityRules: 0,
          capacityOverrides: 0,
          plannedAllocations: 0,
        },
      };

      const result = validateBackupPayload(v2Payload);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);

      const task = result.envelope!.tables.tasks[0];
      expect(task?.workType).toBe('investigate');
      expect(task?.opsOwners).toEqual(['OpsAlice', 'OpsCharlie']);
      expect(task?.businessAnalysts).toEqual(['BABob']);
    });

    it('rejects unsupported schemaVersion with descriptive Vietnamese message', () => {
      const v5Payload = {
        app: APP_MARKER,
        schemaVersion: 5,
        exportedAt: '2026-09-28T00:00:00.000Z',
        tables: {
          projects: [],
          milestones: [],
          tasks: [],
          capacityRules: [],
          capacityOverrides: [],
          plannedAllocations: [],
        },
        counts: {
          projects: 0,
          milestones: 0,
          tasks: 0,
          capacityRules: 0,
          capacityOverrides: 0,
          plannedAllocations: 0,
        },
      };

      const result = validateBackupPayload(v5Payload);
      expect(result.valid).toBe(false);
      expect(result.errors[0]?.field).toBe('schemaVersion');
      expect(result.errors[0]?.message).toContain('chỉ hỗ trợ phiên bản 1 đến 4');

      const v0Payload = {
        ...v5Payload,
        schemaVersion: 0,
      };
      const result0 = validateBackupPayload(v0Payload);
      expect(result0.valid).toBe(false);
      expect(result0.errors[0]?.field).toBe('schemaVersion');
      expect(result0.errors[0]?.message).toContain('chỉ hỗ trợ phiên bản 1 đến 4');
    });

  });
});
