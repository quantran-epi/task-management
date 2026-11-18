// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  exportBackupPayload,
  APP_MARKER,
  CURRENT_SCHEMA_VERSION,
} from '../../../src/services/backup/exportBackup';
import { validateBackupPayload } from '../../../src/services/backup/validateBackup';
import { TaskPlannerDatabase } from '../../../src/db';

const LEGACY_MESSAGE = 'Backup phiên bản cũ không còn được hỗ trợ';

/**
 * D-49: the current-version envelope is the only accepted shape. Pre-31.2 payloads are
 * rejected at the envelope stage — they are never normalized or mapped onto the CR model.
 */
describe('Backup envelope at the current schema version and legacy rejection (D-49)', () => {
  describe('exportBackupPayload', () => {
    it('emits the current-version envelope', async () => {
      const testDb = new TaskPlannerDatabase('TestExportV2DB_' + Math.random().toString(36).slice(2));
      await testDb.open();

      const envelope = await exportBackupPayload(testDb);
      expect(envelope.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(envelope.app).toBe(APP_MARKER);

      await testDb.delete();
    });
  });

  describe('validateBackupPayload legacy rejection', () => {
    const sampleSystemId = '11111111-1111-4111-8111-111111111111';
    const sampleCrId = '22222222-2222-4222-8222-222222222222';
    const sampleTaskId = '33333333-3333-4333-8333-333333333333';

    function legacyPayload(schemaVersion: number, tables: Record<string, unknown[]>) {
      return {
        app: APP_MARKER,
        schemaVersion,
        exportedAt: '2026-09-01T00:00:00.000Z',
        tables,
        counts: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])),
      };
    }

    it('rejects a v1 payload carrying projects and milestones', () => {
      const payload = legacyPayload(1, {
        projects: [{ id: sampleCrId, name: 'Legacy Project' }],
        milestones: [{ id: sampleSystemId, projectId: sampleCrId, name: 'Legacy Milestone' }],
        tasks: [],
      });

      const result = validateBackupPayload(payload);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes(LEGACY_MESSAGE))).toBe(true);
    });

    it('rejects a v2 payload even when it carries only CR-axis tables', () => {
      const payload = legacyPayload(2, {
        changeRequests: [{ id: sampleCrId, name: 'V2 CR', code: 'CR-V2', targets: [] }],
        systems: [{ id: sampleSystemId, name: 'V2 System', code: 'V2_SYS', type: 'SERVICE' }],
        tasks: [{ id: sampleTaskId, crId: sampleCrId, name: 'V2 Task' }],
      });

      const result = validateBackupPayload(payload);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'schemaVersion')).toBe(true);
      expect(result.errors.some((e) => e.message.includes(LEGACY_MESSAGE))).toBe(true);
    });

    it('rejects a payload carrying a projects table before any table validation', () => {
      const payload = legacyPayload(12, {
        projects: [],
        changeRequests: [],
        systems: [],
        tasks: [],
      });

      const result = validateBackupPayload(payload);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes(LEGACY_MESSAGE))).toBe(true);
    });

    it('rejects a payload carrying a milestones table', () => {
      const payload = legacyPayload(12, {
        milestones: [],
        changeRequests: [],
        systems: [],
        tasks: [],
      });

      const result = validateBackupPayload(payload);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes(LEGACY_MESSAGE))).toBe(true);
    });

    it('rejects a future schemaVersion with a descriptive Vietnamese message', () => {
      const payload = legacyPayload(999, { changeRequests: [], systems: [], tasks: [] });

      const result = validateBackupPayload(payload);
      expect(result.valid).toBe(false);
      expect(result.errors[0]?.field).toBe('schemaVersion');
      expect(result.errors[0]?.message).toContain('không tương thích');
    });
  });
});
