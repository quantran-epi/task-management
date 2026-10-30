import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../index';
import {
  getOrCreateSdlcThread,
  createChatTabThread,
  getProjectThreads,
  deleteChatTabThread,
  saveMessage,
  getMessagesByThreadId,
} from '../chatRepo';

describe('chatRepo - Project Multi-Tab & SDLC Threads', () => {
  let db: TaskPlannerDatabase;
  const projectId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    db = new TaskPlannerDatabase(`TestDB_${Math.random()}`);
  });

  afterEach(async () => {
    await db.delete();
  });

  it('đảm bảo mỗi project chỉ có tối đa 1 thread SDLC', async () => {
    const thread1 = await getOrCreateSdlcThread(projectId, 'SDLC 1', db);
    const thread2 = await getOrCreateSdlcThread(projectId, 'SDLC 2', db);

    expect(thread1.id).toBe(thread2.id);
    expect(thread1.scopeKey).toBe(`project:${projectId}:sdlc`);

    const allThreads = await db.chatThreads.where('scopeKey').equals(`project:${projectId}:sdlc`).toArray();
    expect(allThreads.length).toBe(1);
  });

  it('tạo nhiều tab chat thường độc lập trong cùng 1 project', async () => {
    const chatTab1 = await createChatTabThread(projectId, 'Chat 1', db);
    const chatTab2 = await createChatTabThread(projectId, 'Chat 2', db);

    expect(chatTab1.id).not.toBe(chatTab2.id);
    expect(chatTab1.scopeKey).toBe(`project:${projectId}:chat:${chatTab1.id}`);
    expect(chatTab2.scopeKey).toBe(`project:${projectId}:chat:${chatTab2.id}`);

    const projectThreads = await getProjectThreads(projectId, db);
    expect(projectThreads.length).toBe(2);
  });

  it('xóa tab chat thường dọn sạch cả thread và tin nhắn liên quan', async () => {
    const chatTab = await createChatTabThread(projectId, 'Temporary Chat', db);

    await saveMessage(
      {
        threadId: chatTab.id,
        role: 'user',
        content: 'Xin chào AI trong tab chat',
      },
      db
    );

    const msgsBefore = await getMessagesByThreadId(chatTab.id, db);
    expect(msgsBefore.length).toBe(1);

    await deleteChatTabThread(chatTab.id, db);

    const threadAfter = await db.chatThreads.get(chatTab.id);
    expect(threadAfter).toBeUndefined();

    const msgsAfter = await getMessagesByThreadId(chatTab.id, db);
    expect(msgsAfter.length).toBe(0);
  });
});
