// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db as defaultDb } from '../../src/db';
import { chatWindowDb } from '../../src/db/chatWindowDb';
import { initializeDatabaseDefaults } from '../../src/db/seeds';
import { createChatTab } from '../../src/db/repositories/chatTabRepo';

const REQUIRED_TABLES = [
  'settings',
  'chatThreads',
  'chatMessages',
  'chatTabs',
  'systems',
  'changeRequests',
  'aiTeams',
  'notes',
  'documentSets',
] as const;

describe('chatWindowDb (D-01)', () => {
  beforeAll(async () => {
    await Promise.all([chatWindowDb.open(), defaultDb.open()]);
  });

  afterAll(async () => {
    chatWindowDb.close();
    defaultDb.close();
    await Promise.all([Dexie.delete('TaskMateChatWindowDB'), Dexie.delete('PersonalTaskPlannerDB')]);
  });

  it('is a separate singleton with the same schema as the TaskMate DB', () => {
    expect(chatWindowDb.name).toBe('TaskMateChatWindowDB');
    expect(defaultDb.name).toBe('PersonalTaskPlannerDB');
    expect(chatWindowDb.name).not.toBe(defaultDb.name);
    const names = chatWindowDb.tables.map((table) => table.name);
    for (const table of REQUIRED_TABLES) expect(names).toContain(table);
    expect(names).toEqual(defaultDb.tables.map((table) => table.name));
  });

  it('keeps settings isolated in both directions', async () => {
    await chatWindowDb.settings.put({ key: 'chat-only-setting', value: 'chat' });
    await defaultDb.settings.put({ key: 'taskmate-only-setting', value: 'taskmate' });

    expect((await chatWindowDb.settings.get('chat-only-setting'))?.value).toBe('chat');
    expect((await defaultDb.settings.get('chat-only-setting'))?.value).toBeUndefined();
    expect((await defaultDb.settings.get('taskmate-only-setting'))?.value).toBe('taskmate');
    expect((await chatWindowDb.settings.get('taskmate-only-setting'))?.value).toBeUndefined();
  });

  it('seeds defaults only into the selected database', async () => {
    await initializeDatabaseDefaults(chatWindowDb);
    expect(await chatWindowDb.capacityRules.count()).toBe(7);
    expect(await defaultDb.capacityRules.count()).toBe(0);
    await initializeDatabaseDefaults(defaultDb);
    expect(await defaultDb.capacityRules.count()).toBe(7);
  });

  it('does not mix chat tab models between dock and standalone databases', async () => {
    await chatWindowDb.settings.put({ key: 'ninerouter_default_model', value: 'chat-model' });
    await defaultDb.settings.put({ key: 'ninerouter_default_model', value: 'taskmate-model' });

    const docked = await createChatTab(
      { scopeType: 'global', scopeKey: 'global', config: { model: 'taskmate-model' } },
      defaultDb
    );
    const standalone = await createChatTab(
      { scopeType: 'global', scopeKey: 'global', config: { model: 'chat-model' } },
      chatWindowDb
    );

    expect((await defaultDb.chatTabs.get(docked.id))?.config?.model).toBe('taskmate-model');
    expect((await chatWindowDb.chatTabs.get(standalone.id))?.config?.model).toBe('chat-model');
    expect(await defaultDb.chatTabs.where('scopeKey').equals('global').count()).toBe(1);
    expect(await chatWindowDb.chatTabs.where('scopeKey').equals('global').count()).toBe(1);
  });
});
