// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db';
import { exportBackupPayload } from '../../src/services/backup/exportBackup';
import { restoreBackupPayload } from '../../src/services/backup/restoreBackup';
import { validateBackupPayload } from '../../src/services/backup/validateBackup';
import type { BackupEnvelope } from '../../src/types/backup';
import type { ChatTab, ChatMessage, ChatThread, ChangeRequest } from '../../src/types/models';

const changeRequestId = '11111111-1111-4111-8111-111111111111';
const threadId = '22222222-2222-4222-8222-222222222222';
const tabId = '33333333-3333-4333-8333-333333333333';
const now = '2026-10-30T12:00:00.000Z';

const changeRequest: ChangeRequest = {
  id: changeRequestId,
  name: 'Backup CR',
  code: 'CR-BACKUP',
  status: 'Open',
  type: 'ENHANCEMENT',
  targets: [],
  createdAt: now,
  updatedAt: now,
};

const thread: ChatThread = {
  id: threadId,
  scopeKey: `cr:${changeRequestId}`,
  scopeType: 'cr',
  entityId: changeRequestId,
  title: 'Chat',
  createdAt: now,
  updatedAt: now,
};

function makeTab(overrides: Partial<ChatTab> = {}): ChatTab {
  return {
    id: tabId,
    threadId,
    scopeKey: `cr:${changeRequestId}`,
    type: 'chat',
    title: 'Chat',
    order: 0,
    active: true,
    config: {
      model: 'model-a',
      analysisMode: true,
      mcpEnabled: false,
      knowledgeEnabled: true,
      promptContextOptions: { maxChars: 12000 },
    },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function baseTables() {
  return {
    changeRequests: [changeRequest],
    systems: [],
    tasks: [],
    capacityRules: [],
    capacityOverrides: [],
    plannedAllocations: [],
    notes: [],
    chatThreads: [thread],
    chatMessages: [],
    chatTabs: [makeTab()],
  };
}

function basePayload() {
  const tables = baseTables();
  return {
    app: 'personal-task-planner' as const,
    schemaVersion: 12,
    exportedAt: now,
    tables,
    counts: {
      changeRequests: 1,
      systems: 0,
      tasks: 0,
      capacityRules: 0,
      capacityOverrides: 0,
      plannedAllocations: 0,
      notes: 0,
      chatThreads: 1,
      chatMessages: 0,
      chatTabs: 1,
    },
  };
}

describe('backup tab contract', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`tab-backup-${Date.now()}-${Math.random()}`);
    await db.open();
    await db.changeRequests.add(changeRequest);
    await db.chatThreads.add(thread);
    await db.chatTabs.add(makeTab());
  });

  afterEach(async () => {
    await db.delete();
  });

  it('round-trips durable tab, active pointer, safe config, and valid history', async () => {
    await db.chatMessages.add({
      id: '77777777-7777-4777-8777-777777777777',
      threadId,
      role: 'user',
      content: 'Continue chat',
      createdAt: now,
    });

    const backup = await exportBackupPayload(db);

    expect(backup.tables.chatTabs).toHaveLength(1);
    expect(backup.counts.chatTabs).toBe(1);
    expect(backup.tables.chatTabs?.[0]).toMatchObject({
      id: tabId,
      threadId,
      type: 'chat',
      active: true,
      config: { model: 'model-a', analysisMode: true },
    });
    expect(JSON.stringify(backup)).not.toContain('apiKey');
    expect(JSON.stringify(backup)).not.toContain('passphrase');

    const validation = validateBackupPayload(backup);
    expect(validation.valid).toBe(true);
    expect(validation.envelope?.tables.chatTabs?.[0]?.type).toBe('chat');
    expect(validation.envelope?.tables.chatMessages).toHaveLength(1);
  });

  it('omits nested secrets, partial buffers, runtime errors, prompts, and raw responses from export', async () => {
    await db.chatTabs.update(tabId, {
      config: {
        ...makeTab().config,
        apiKey: 'secret-api-key',
        passphrase: 'secret-passphrase',
        promptContextOptions: {
          maxChars: 12000,
          partial_buffer: 'partial output',
          error_stack: 'secret stack',
          private_prompt: 'private prompt',
          raw_model_response: 'raw provider response',
        },
      } as ChatTab['config'],
    });

    const backup = await exportBackupPayload(db);
    const serialized = JSON.stringify(backup);
    expect(serialized).not.toContain('secret-api-key');
    expect(serialized).not.toContain('secret-passphrase');
    expect(serialized).not.toContain('partial output');
    expect(serialized).not.toContain('secret stack');
    expect(serialized).not.toContain('private prompt');
    expect(serialized).not.toContain('raw provider response');
    expect(validateBackupPayload(backup).valid).toBe(true);
  });

  it('rejects orphan pointers, stale thread links, and forbidden nested keys', () => {
    const duplicate = basePayload();
    duplicate.tables.chatTabs = [makeTab(), makeTab({ id: '88888888-8888-4888-8888-888888888888' })];
    expect(validateBackupPayload(duplicate).valid).toBe(false);

    const orphan = basePayload();
    orphan.tables.chatTabs = [makeTab({ threadId: '99999999-9999-4999-8999-999999999999' })];
    expect(validateBackupPayload(orphan).valid).toBe(false);

    const forbidden = basePayload();
    forbidden.tables.chatTabs = [makeTab({
      config: { promptContextOptions: { bearerToken: 'x' } } as unknown as ChatTab['config'],
    })];
    const forbiddenResult = validateBackupPayload(forbidden);
    expect(forbiddenResult.valid).toBe(false);
    expect(
      forbiddenResult.errors.some(
        (error) => error.table === 'chatTabs' && error.message.includes('FORBIDDEN_FIELD')
      )
    ).toBe(true);
  });

  it('accepts v11 payloads without chatTabs and backfills them on restore', () => {
    const legacy = basePayload();
    delete (legacy.tables as Partial<typeof legacy.tables>).chatTabs;
    delete (legacy.counts as Partial<typeof legacy.counts>).chatTabs;

    const result = validateBackupPayload(legacy);

    expect(result.valid).toBe(true);
    expect(result.envelope?.tables.chatTabs).toBeUndefined();
  });

  it('restores a legacy SDLC thread as one ordinary chat tab and creates no sdlc tab', async () => {
    const legacy = basePayload();
    delete (legacy.tables as Partial<typeof legacy.tables>).chatTabs;
    delete (legacy.counts as Partial<typeof legacy.counts>).chatTabs;
    legacy.tables.chatThreads = [
      { ...thread, id: '99999999-9999-4999-8999-999999999999', scopeKey: `cr:${changeRequestId}:sdlc`, title: 'Legacy SDLC' },
    ];
    const legacyMessages: ChatMessage[] = [{
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      threadId: legacy.tables.chatThreads[0]!.id,
      role: 'user',
      content: 'Keep this history',
      createdAt: now,
    }];
    (legacy.tables as unknown as { chatMessages: ChatMessage[] }).chatMessages = legacyMessages;
    legacy.counts.chatThreads = 1;
    legacy.counts.chatMessages = 1;

    const validation = validateBackupPayload(legacy);
    expect(validation.valid).toBe(true);
    await restoreBackupPayload(validation.envelope as BackupEnvelope, db);

    const tabs = await db.chatTabs.orderBy('scopeKey').toArray();
    expect(tabs).toHaveLength(1);
    expect(tabs.filter((tab) => (tab as { type: string }).type === 'sdlc')).toHaveLength(0);
    expect(tabs.filter((tab) => tab.type === 'chat')).toHaveLength(1);
    expect(tabs[0]?.active).toBe(true);
    expect(tabs[0]?.scopeKey).toBe(`cr:${changeRequestId}`);
    expect((await db.chatMessages.toArray())[0]?.content).toBe('Keep this history');
  });
});
