import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../../src/db/index';
import { restoreBackupPayload, rollbackToSnapshot, downloadSnapshotFile } from '../../../src/services/backup/restoreBackup';
import type { BackupEnvelope, SnapshotData } from '../../../src/types/backup';
import type { ChatMessage, ChatTab, ChatThread } from '../../../src/types/models';
import * as exportBackupModule from '../../../src/services/backup/exportBackup';
import { APP_MARKER, CURRENT_SCHEMA_VERSION } from '../../../src/services/backup/exportBackup';
import { validateBackupPayload } from '../../../src/services/backup/validateBackup';

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

  it('rolls back the running timer through the pre-import snapshot', async () => {
    await testDb.tasks.add({
      id: '22222222-2222-4222-8222-222222222222',
      projectId: '00000000-0000-4000-8000-000000000000',
      milestoneId: null,
      name: 'Timed task',
      status: 'Open',
      priority: 'Medium',
      progress: 0,
      estimateMinutes: 60,
      workType: 'code',
      createdAt: '2026-09-26T10:00:00.000Z',
      updatedAt: '2026-09-26T10:00:00.000Z',
    } as never);
    await testDb.activeTimers.add({
      taskId: '22222222-2222-4222-8222-222222222222',
      startedAt: '2026-09-26T10:05:00.000Z',
      accumulatedMinutes: 0,
      segments: [],
    } as never);

    await restoreBackupPayload(sampleBackup, testDb);
    // The import replaces the timer table; only the snapshot can bring it back.
    expect(await testDb.activeTimers.count()).toBe(0);

    const snapshot = (await testDb.settings.get('last_pre_import_snapshot'))?.value as SnapshotData;
    expect(snapshot.tables.activeTimers).toHaveLength(1);

    await rollbackToSnapshot(testDb);
    expect(await testDb.activeTimers.count()).toBe(1);
  });

  it('restores successfully when local DB contains note attachments with Blob data (no transaction auto-commit)', async () => {
    // Add existing note and attachment with Blob data
    await testDb.notes.add({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      title: 'Local Existing Note',
      body: 'Local body',
      isPinned: false,
      createdAt: '2026-09-26T10:00:00.000Z',
      updatedAt: '2026-09-26T10:00:00.000Z',
    });
    await testDb.noteAttachments.add({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      noteId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      fileName: 'test-blob.png',
      mimeType: 'image/png',
      sizeBytes: 12,
      data: new Blob(['fake-img-data'], { type: 'image/png' }),
      createdAt: '2026-09-26T10:00:00.000Z',
    });

    const result = await restoreBackupPayload(sampleBackup, testDb);
    expect(result.totalRestored).toBe(2);

    // Verify snapshot captured the attachment data
    const snapshotSetting = await testDb.settings.get('last_pre_import_snapshot');
    expect(snapshotSetting).toBeDefined();
    const snapshot = snapshotSetting?.value as SnapshotData;
    expect(snapshot.tables.noteAttachments).toHaveLength(1);
    expect(snapshot.tables.noteAttachments?.[0]?.fileName).toBe('test-blob.png');
    expect(snapshot.tables.noteAttachments?.[0]?.data).toContain('data:image/png;base64,');

    // Verify tables restored
    const projects = await testDb.projects.toArray();
    expect(projects).toHaveLength(1);
    expect(projects[0]?.name).toBe('Restored Project');
  });

  it('mirrors a restored SDLC tab workflow state into the settings key the drawer reads', async () => {
    const projectId = '11111111-1111-4111-8111-111111111111';
    const threadId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const tabId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const missingNoteId = '99999999-9999-4999-8999-999999999999';
    const workflowState = {
      schemaVersion: 1 as const,
      sessionId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      projectId,
      threadId,
      currentStep: 'SOLUTION' as const,
      metadata: { cr: 'CR-1', featureName: 'F', author: 'A', requestingUnit: 'U', date: '2026-10-30' },
      artifacts: {
        pl01: {
          noteId: missingNoteId,
          kind: 'PL01' as const,
          version: 1,
          hash: '01'.repeat(32),
          title: 'PL01',
          sourceHashes: [],
          updatedAt: '2026-09-27T12:00:00.000Z',
        },
      },
      staleSteps: [],
      createdAt: '2026-09-27T12:00:00.000Z',
      updatedAt: '2026-09-27T12:00:00.000Z',
    };
    const payload: BackupEnvelope = {
      ...sampleBackup,
      tables: {
        ...sampleBackup.tables,
        projects: [{ ...sampleBackup.tables.projects[0]!, id: projectId }],
        chatThreads: [{
          id: threadId,
          scopeKey: `project:${projectId}:sdlc`,
          scopeType: 'project',
          entityId: projectId,
          title: 'SDLC',
          createdAt: '2026-09-27T12:00:00.000Z',
          updatedAt: '2026-09-27T12:00:00.000Z',
        }],
        chatTabs: [{
          id: tabId,
          threadId,
          scopeKey: `project:${projectId}`,
          type: 'sdlc',
          title: 'SDLC',
          order: 0,
          active: true,
          workflowState,
          createdAt: '2026-09-27T12:00:00.000Z',
          updatedAt: '2026-09-27T12:00:00.000Z',
        }],
      },
      counts: { ...sampleBackup.counts, chatThreads: 1, chatTabs: 1 },
    };

    await restoreBackupPayload(payload, testDb);

    // The tab row alone is inert; the drawer reads this settings key.
    const stored = (await testDb.settings.get(`sdlc_workflow:${projectId}:${threadId}`))?.value as
      | { checkpoint?: { status?: string } }
      | undefined;
    expect(stored).toBeDefined();
    // The validator's blocked-tab `interrupted` checkpoint must win over a stale `running` one.
    expect(stored?.checkpoint?.status).toBe('interrupted');
  });

  it('restores chat tabs unchanged and rolls snapshot state back byte-for-byte', async () => {
    const localThread: ChatThread = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      scopeKey: 'global:chat:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      scopeType: 'global',
      title: 'Local chat',
      createdAt: '2026-09-26T10:00:00.000Z',
      updatedAt: '2026-09-26T10:00:00.000Z',
    };
    const localTab: ChatTab = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      threadId: localThread.id,
      scopeKey: 'global',
      type: 'chat',
      title: 'Local chat',
      order: 0,
      active: true,
      config: { analysisMode: true, mcpEnabled: false },
      createdAt: localThread.createdAt,
      updatedAt: localThread.updatedAt,
    };
    const localMessage: ChatMessage = {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      threadId: localThread.id,
      role: 'user',
      content: 'Local history body',
      createdAt: localThread.createdAt,
    };
    await testDb.chatThreads.add(localThread);
    await testDb.chatTabs.add(localTab);
    await testDb.chatMessages.add(localMessage);

    const importedThread: ChatThread = {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      scopeKey: 'global:chat:dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      scopeType: 'global',
      title: 'Imported chat',
      createdAt: '2026-09-27T12:00:00.000Z',
      updatedAt: '2026-09-27T12:00:00.000Z',
    };
    const importedTab: ChatTab = {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      threadId: importedThread.id,
      scopeKey: 'global',
      type: 'chat',
      title: 'Imported chat',
      order: 3,
      active: true,
      status: 'complete',
      config: { model: 'model-restored', analysisMode: false, knowledgeEnabled: true },
      checkpoint: {
        requestId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        step: 'SOLUTION',
        startedAt: '2026-09-27T12:00:00.000Z',
        status: 'interrupted',
      },
      createdAt: importedThread.createdAt,
      updatedAt: importedThread.updatedAt,
    };
    const backup: BackupEnvelope = {
      ...sampleBackup,
      tables: {
        ...sampleBackup.tables,
        chatThreads: [importedThread],
        chatMessages: [],
        chatTabs: [importedTab],
      },
      counts: { ...sampleBackup.counts, chatThreads: 1, chatMessages: 0, chatTabs: 1 },
    };

    await restoreBackupPayload(backup, testDb);
    expect(await testDb.chatTabs.toArray()).toEqual([importedTab]);

    const storedSnapshot = (await testDb.settings.get('last_pre_import_snapshot'))?.value as SnapshotData;
    expect(storedSnapshot.tables.chatTabs).toEqual([localTab]);
    expect(storedSnapshot.counts.chatTabs).toBe(1);

    await rollbackToSnapshot(testDb);
    expect(await testDb.chatThreads.toArray()).toEqual([localThread]);
    expect(await testDb.chatTabs.toArray()).toEqual([localTab]);
    expect(await testDb.chatMessages.toArray()).toEqual([localMessage]);
  });

  it('keeps chat tabs and snapshot unchanged when a replacement write fails', async () => {
    const localThread: ChatThread = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      scopeKey: 'global:chat:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      scopeType: 'global',
      title: 'Safe local chat',
      createdAt: '2026-09-26T10:00:00.000Z',
      updatedAt: '2026-09-26T10:00:00.000Z',
    };
    const localTab: ChatTab = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      threadId: localThread.id,
      scopeKey: 'global',
      type: 'chat',
      title: 'Safe local chat',
      order: 0,
      active: true,
      createdAt: localThread.createdAt,
      updatedAt: localThread.updatedAt,
    };
    const previousSnapshot = { marker: 'keep-existing-snapshot' };
    await testDb.chatThreads.add(localThread);
    await testDb.chatTabs.add(localTab);
    await testDb.settings.put({ key: 'last_pre_import_snapshot', value: previousSnapshot });

    const duplicateId = '11111111-1111-4111-8111-111111111111';
    const failingBackup: BackupEnvelope = {
      ...sampleBackup,
      tables: {
        ...sampleBackup.tables,
        projects: [sampleBackup.tables.projects[0]!, { ...sampleBackup.tables.projects[0]!, id: duplicateId }],
      },
      counts: { ...sampleBackup.counts, projects: 2 },
    };

    await expect(restoreBackupPayload(failingBackup, testDb)).rejects.toThrow();
    expect(await testDb.chatThreads.toArray()).toEqual([localThread]);
    expect(await testDb.chatTabs.toArray()).toEqual([localTab]);
    expect((await testDb.settings.get('last_pre_import_snapshot'))?.value).toEqual(previousSnapshot);
  });

  it('restores telegramSettings and telegramWhitelist, preserving local logs', async () => {
    // Add local existing session log that must not be cleared by restore
    await testDb.telegramSessionLogs.add({
      id: 'local-log-999',
      chatId: 'local_user',
      userMessage: 'Keep local log',
      aiResponse: 'Local log answer',
      dataScopeUsed: 'full',
      createdAt: '2026-10-20T00:00:00.000Z',
    });

    const telegramBackup: BackupEnvelope = {
      app: APP_MARKER,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      exportedAt: '2026-10-20T12:00:00.000Z',
      tables: {
        projects: [],
        milestones: [],
        tasks: [],
        capacityRules: [],
        capacityOverrides: [],
        plannedAllocations: [],
        telegramSettings: [
          {
            id: 'default',
            botToken: '',
            isEnabled: true,
            autoStartOnLaunch: false,
            defaultScope: 'pure_llm',
            maxHistoryTurns: 8,
          },
        ],
        telegramWhitelist: [
          {
            chatId: 'restored_user_1',
            name: 'Restored User',
            status: 'active',
            dataScope: 'pure_llm',
            dailyLimit: 25,
            usedToday: 2,
            lastActiveDate: '2026-10-20',
            createdAt: '2026-10-20T10:00:00.000Z',
            updatedAt: '2026-10-20T10:00:00.000Z',
          },
        ],
      },
      counts: {
        projects: 0,
        milestones: 0,
        tasks: 0,
        capacityRules: 0,
        capacityOverrides: 0,
        plannedAllocations: 0,
        telegramSettings: 1,
        telegramWhitelist: 1,
      },
    };

    const res = await restoreBackupPayload(telegramBackup, testDb);
    expect(res.totalRestored).toBe(2);

    const restoredSettings = await testDb.telegramSettings.get('default');
    expect(restoredSettings?.defaultScope).toBe('pure_llm');
    expect(restoredSettings?.maxHistoryTurns).toBe(8);

    const restoredUser = await testDb.telegramWhitelist.get('restored_user_1');
    expect(restoredUser?.name).toBe('Restored User');
    expect(restoredUser?.status).toBe('active');

    // Local telegramSessionLogs must remain intact
    const logs = await testDb.telegramSessionLogs.toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0]?.id).toBe('local-log-999');
  });
});

describe('downloadSnapshotFile', () => {
  it('wraps snapshot in valid BackupEnvelope and triggers download with matching filename and payload', () => {
    const triggerDownloadSpy = vi.spyOn(exportBackupModule, 'triggerDownload').mockImplementation(() => {});

    const mockSnapshot: SnapshotData = {
      timestamp: '2026-09-27T14:30:00.000Z',
      tables: {
        projects: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            name: 'Snapshot Project',
            status: 'Open',
            createdAt: '2026-09-27T10:00:00.000Z',
            updatedAt: '2026-09-27T10:00:00.000Z',
          },
        ],
        milestones: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            projectId: '22222222-2222-4222-8222-222222222222',
            name: 'Snapshot Milestone',
            status: 'Open',
            deadline: '2026-10-01',
            createdAt: '2026-09-27T10:00:00.000Z',
            updatedAt: '2026-09-27T10:00:00.000Z',
          },
        ],
        tasks: [
          {
            id: '44444444-4444-4444-8444-444444444444',
            projectId: '22222222-2222-4222-8222-222222222222',
            milestoneId: '33333333-3333-4333-8333-333333333333',
            name: 'Snapshot Task',
            status: 'Open',
            priority: 'Medium',
            progress: 0,
            estimateMinutes: 60,
            createdAt: '2026-09-27T10:00:00.000Z',
            updatedAt: '2026-09-27T10:00:00.000Z',
          },
        ],
        capacityRules: [
          {
            id: '55555555-5555-4555-8555-555555555555',
            dayOfWeek: 1,
            workMinutes: 480,
          },
        ],
        capacityOverrides: [],
        plannedAllocations: [],
      },
      counts: {
        projects: 1,
        milestones: 1,
        tasks: 1,
        capacityRules: 1,
        capacityOverrides: 0,
        plannedAllocations: 0,
      },
    };

    downloadSnapshotFile(mockSnapshot);

    expect(triggerDownloadSpy).toHaveBeenCalledTimes(1);
    const [content, fileName] = triggerDownloadSpy.mock.calls[0] as [string, string];

    expect(fileName).toMatch(/^task-planner-snapshot-.*\.json$/);
    expect(fileName).toContain('2026-09-27T14-30-00-000Z');

    const parsed = JSON.parse(content);
    expect(parsed.app).toBe(APP_MARKER);
    expect(parsed.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(parsed.exportedAt).toBe(mockSnapshot.timestamp);
    expect(parsed.tables).toEqual(mockSnapshot.tables);
    expect(parsed.counts).toEqual(mockSnapshot.counts);

    const validationResult = validateBackupPayload(parsed);
    expect(validationResult.valid).toBe(true);
    expect(validationResult.errors).toHaveLength(0);

    triggerDownloadSpy.mockRestore();
  });
});
