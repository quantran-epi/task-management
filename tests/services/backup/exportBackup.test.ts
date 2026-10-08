import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../../src/db/index';
import {
  APP_MARKER,
  CURRENT_SCHEMA_VERSION,
  exportBackupPayload,
  generateBackupFileName,
  triggerDownload,
} from '../../../src/services/backup/exportBackup';

describe('exportBackup service', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestExportDB_' + Math.random().toString(36).slice(2));
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  describe('generateBackupFileName', () => {
    it('generates filename matching expected pattern for current date', () => {
      const fileName = generateBackupFileName();
      expect(fileName).toMatch(/^task-planner-backup-\d{4}-\d{2}-\d{2}-\d{6}\.json$/);
    });

    it('formats specific date with zero-padded components', () => {
      const date = new Date(2026, 8, 27, 9, 5, 4); // 2026-09-27 09:05:04
      const fileName = generateBackupFileName(date);
      expect(fileName).toBe('task-planner-backup-2026-09-27-090504.json');
    });
  });

  describe('exportBackupPayload', () => {
    it('exports all 6 domain tables with envelope metadata and logs to backupMetadata', async () => {
      // Seed test data across tables
      const now = new Date().toISOString();
      await testDb.projects.add({
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Project 1',
        status: 'In Progress',
        createdAt: now,
        updatedAt: now,
      });

      await testDb.milestones.add({
        id: '22222222-2222-4222-8222-222222222222',
        projectId: '11111111-1111-4111-8111-111111111111',
        name: 'Milestone 1',
        status: 'Open',
        createdAt: now,
        updatedAt: now,
      });

      await testDb.tasks.add({
        id: '33333333-3333-4333-8333-333333333333',
        projectId: '11111111-1111-4111-8111-111111111111',
        name: 'Task 1',
        status: 'Open',
        priority: 'High',
        progress: 0,
        estimateMinutes: 120,
        createdAt: now,
        updatedAt: now,
      });

      await testDb.capacityRules.add({
        id: '44444444-4444-4444-8444-444444444444',
        dayOfWeek: 1,
        workMinutes: 480,
      });

      await testDb.capacityOverrides.add({
        id: '55555555-5555-4555-8555-555555555555',
        date: '2026-10-01',
        workMinutes: 240,
        note: 'Half day',
      });

      await testDb.plannedAllocations.add({
        id: '66666666-6666-4666-8666-666666666666',
        taskId: '33333333-3333-4333-8333-333333333333',
        date: '2026-10-01',
        allocatedMinutes: 120,
      });

      // Safe settings should be exported, sensitive settings should be stripped, backupMetadata excluded
      await testDb.settings.add({
        key: 'themeMode',
        value: 'dark',
      });
      await testDb.settings.add({
        key: 'github_pat',
        value: 'ghp_secret123',
      });

      await testDb.backupMetadata.add({
        id: '77777777-7777-4777-8777-777777777777',
        timestamp: '2026-09-01T00:00:00.000Z',
        appVersion: '0.1.0',
        recordCount: 10,
      });

      const envelope = await exportBackupPayload(testDb);

      expect(envelope.app).toBe(APP_MARKER);
      expect(envelope.app).toBe('personal-task-planner');
      expect(envelope.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(envelope.exportedAt).toBeDefined();
      expect(new Date(envelope.exportedAt).toString()).not.toBe('Invalid Date');

      // 6 domain tables
      expect(envelope.tables.projects).toHaveLength(1);
      expect(envelope.tables.milestones).toHaveLength(1);
      expect(envelope.tables.tasks).toHaveLength(1);
      expect(envelope.tables.capacityRules).toHaveLength(1);
      expect(envelope.tables.capacityOverrides).toHaveLength(1);
      expect(envelope.tables.plannedAllocations).toHaveLength(1);

      // Safe settings exported, secrets stripped, metadata excluded
      expect(envelope.tables.settings).toEqual([{ key: 'themeMode', value: 'dark' }]);
      expect((envelope.tables as unknown as Record<string, unknown>).backupMetadata).toBeUndefined();

      // Counts object
      expect(envelope.counts).toEqual({
        projects: 1,
        milestones: 1,
        tasks: 1,
        capacityRules: 1,
        capacityOverrides: 1,
        plannedAllocations: 1,
        workSessions: 0,
        notes: 0,
        noteAttachments: 0,
        chatThreads: 0,
        chatMessages: 0,
        activeTimers: 0,
        settings: 1,
        documentSets: 0,
        publishedDocuments: 0,
        publishAttempts: 0,
        dlpAudits: 0,
      });

      // Export history logged in backupMetadata
      const metadataEntries = await testDb.backupMetadata.toArray();
      // Total 2 entries: 1 pre-seeded + 1 new from this export
      expect(metadataEntries).toHaveLength(2);
      const latestLog = metadataEntries.find(
        (entry) => entry.id !== '77777777-7777-4777-8777-777777777777'
      );
      expect(latestLog).toBeDefined();
      expect(latestLog?.recordCount).toBe(7);
      expect(latestLog?.timestamp).toBe(envelope.exportedAt);
      expect(latestLog?.appVersion).toBe('0.1.0');
    });

    it('exports empty domain tables with zero counts when db has no records', async () => {
      const envelope = await exportBackupPayload(testDb);

      expect(envelope.counts).toEqual({
        projects: 0,
        milestones: 0,
        tasks: 0,
        capacityRules: 0,
        capacityOverrides: 0,
        plannedAllocations: 0,
        workSessions: 0,
        notes: 0,
        noteAttachments: 0,
        chatThreads: 0,
        chatMessages: 0,
        activeTimers: 0,
        settings: 0,
        documentSets: 0,
        publishedDocuments: 0,
        publishAttempts: 0,
        dlpAudits: 0,
      });

      const metadataEntries = await testDb.backupMetadata.toArray();

      expect(metadataEntries).toHaveLength(1);
      expect(metadataEntries[0]?.recordCount).toBe(0);
    });
  });

  describe('triggerDownload', () => {
    it('creates a blob, triggers click on download link, and revokes object url', () => {
      const createObjectURLMock = vi.fn().mockReturnValue('blob:http://localhost/mock-uuid');
      const revokeObjectURLMock = vi.fn();
      globalThis.URL.createObjectURL = createObjectURLMock;
      globalThis.URL.revokeObjectURL = revokeObjectURLMock;

      const clickMock = vi.fn();
      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName === 'a') {
          const anchor = originalCreateElement('a');
          anchor.click = clickMock;
          return anchor;
        }
        return originalCreateElement(tagName);
      });

      triggerDownload('{"test": true}', 'test-backup.json');

      expect(createObjectURLMock).toHaveBeenCalledTimes(1);
      expect(clickMock).toHaveBeenCalledTimes(1);
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:http://localhost/mock-uuid');

      vi.restoreAllMocks();
    });
  });
});
