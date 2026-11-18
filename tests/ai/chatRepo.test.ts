import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../src/db';
import {
  buildScopeKey,
  createOrGetThread,
  saveMessage,
  getMessagesByThreadId,
  clearThreadContext,
  deleteThreadByScope,
} from '../../src/db/repositories/chatRepo';

describe('chatRepo scope keys (CR/System axis)', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`test-chat-db-${Date.now()}-${Math.random()}`);
  });

  it('builds cr: and system: scope keys', () => {
    expect(buildScopeKey('cr', 'abc')).toBe('cr:abc');
    expect(buildScopeKey('system', 'xyz')).toBe('system:xyz');
    expect(buildScopeKey('task', 't1')).toBe('task:t1');
    expect(buildScopeKey('global')).toBe('global');
  });

  it('initializes chatThreads and chatMessages stores', async () => {
    expect(db.chatThreads).toBeDefined();
    expect(db.chatMessages).toBeDefined();

    expect(await db.chatThreads.count()).toBe(0);
    expect(await db.chatMessages.count()).toBe(0);
  });

  it('createOrGetThread creates a single thread per scopeKey and reuses existing', async () => {
    const thread1 = await createOrGetThread({ scopeType: 'global' }, db);
    expect(thread1.id).toBeDefined();
    expect(thread1.scopeKey).toBe('global');
    expect(thread1.scopeType).toBe('global');

    const thread2 = await createOrGetThread({ scopeType: 'global' }, db);
    expect(thread2.id).toBe(thread1.id);

    const taskThread = await createOrGetThread(
      { scopeType: 'task', entityId: 'task-123', title: 'Task Chat' },
      db
    );
    expect(taskThread.scopeKey).toBe('task:task-123');
    expect(taskThread.entityId).toBe('task-123');
    expect(taskThread.title).toBe('Task Chat');

    const crThread = await createOrGetThread(
      { scopeType: 'cr', entityId: 'cr-1', title: 'CR Chat' },
      db
    );
    expect(crThread.scopeKey).toBe('cr:cr-1');
    expect(crThread.scopeType).toBe('cr');
  });

  // 37.1 UAT gap 4: React StrictMode double-invokes the first mount, so two callers race
  // the read-then-add. `scopeKey` is a unique index, so the loser used to throw
  // `ConstraintError` and the workspace stayed stuck on "Đang chuẩn bị nhóm...".
  it('createOrGetThread resolves concurrent callers to one thread without throwing', async () => {
    const results = await Promise.all([
      createOrGetThread({ scopeType: 'team', entityId: 'team-race' }, db),
      createOrGetThread({ scopeType: 'team', entityId: 'team-race' }, db),
      createOrGetThread({ scopeType: 'team', entityId: 'team-race' }, db),
    ]);

    expect(new Set(results.map((row) => row.id)).size).toBe(1);
    expect(await db.chatThreads.count()).toBe(1);
  });

  it('saveMessage appends user and assistant messages and updates thread updatedAt', async () => {
    const thread = await createOrGetThread({ scopeType: 'global' }, db);
    const msg1 = await saveMessage(
      {
        threadId: thread.id,
        role: 'user',
        content: 'Xin chào AI',
      },
      db
    );
    expect(msg1.id).toBeDefined();
    expect(msg1.role).toBe('user');
    expect(msg1.content).toBe('Xin chào AI');

    await saveMessage(
      {
        threadId: thread.id,
        role: 'assistant',
        content: 'Tôi có thể giúp gì cho bạn?',
      },
      db
    );

    const messages = await getMessagesByThreadId(thread.id, db);
    expect(messages).toHaveLength(2);
    expect(messages[0]?.content).toBe('Xin chào AI');
    expect(messages[1]?.content).toBe('Tôi có thể giúp gì cho bạn?');
  });

  it('clearThreadContext appends context boundary marker and respects it', async () => {
    const thread = await createOrGetThread({ scopeType: 'global' }, db);
    await saveMessage({ threadId: thread.id, role: 'user', content: 'Cũ 1' }, db);
    await saveMessage({ threadId: thread.id, role: 'assistant', content: 'Cũ 2' }, db);

    const dividerMsg = await clearThreadContext(thread.id, db);
    expect(dividerMsg.isContextBoundary).toBe(true);

    await saveMessage({ threadId: thread.id, role: 'user', content: 'Mới 1' }, db);

    const allMessages = await getMessagesByThreadId(thread.id, db);
    expect(allMessages).toHaveLength(4);
    const boundaryMsg = allMessages.find((m) => m.id === dividerMsg.id);
    expect(boundaryMsg?.isContextBoundary).toBe(true);
  });

  it('deleteThreadByScope purges thread and all its messages', async () => {
    const thread = await createOrGetThread({ scopeType: 'task', entityId: 't-1' }, db);
    await saveMessage({ threadId: thread.id, role: 'user', content: 'Hello' }, db);
    await saveMessage({ threadId: thread.id, role: 'assistant', content: 'Hi' }, db);

    await deleteThreadByScope('task:t-1', db);

    const foundThread = await db.chatThreads.where('scopeKey').equals('task:t-1').first();
    expect(foundThread).toBeUndefined();

    const messages = await db.chatMessages.where('threadId').equals(thread.id).toArray();
    expect(messages).toHaveLength(0);
  });

  it('deleteThreadByScope purges a CR-scoped thread', async () => {
    const thread = await createOrGetThread({ scopeType: 'cr', entityId: 'cr-9' }, db);
    await saveMessage({ threadId: thread.id, role: 'user', content: 'CR msg' }, db);

    await deleteThreadByScope('cr:cr-9', db);

    expect(await db.chatThreads.where('scopeKey').equals('cr:cr-9').first()).toBeUndefined();
    expect(await db.chatMessages.where('threadId').equals(thread.id).count()).toBe(0);
  });

  it('persists AI Office attribution into the stored row and omits the keys when absent', async () => {
    const thread = await createOrGetThread({ scopeType: 'cr', entityId: 'cr-attrib' }, db);
    await saveMessage(
      {
        threadId: thread.id,
        role: 'assistant',
        content: 'Báo cáo của nhân viên',
        agentId: 'agent-1',
        agentName: 'Lan',
        agentKind: 'employee',
        messageKind: 'report',
      },
      db
    );
    await saveMessage({ threadId: thread.id, role: 'assistant', content: 'Không gán' }, db);

    const rows = await getMessagesByThreadId(thread.id, db);
    // Both rows can share a millisecond; select by content, not by index.
    const attributed = rows.find((row) => row.content === 'Báo cáo của nhân viên')!;
    const plain = rows.find((row) => row.content === 'Không gán')!;
    expect(attributed).toMatchObject({
      agentId: 'agent-1',
      agentName: 'Lan',
      agentKind: 'employee',
      messageKind: 'report',
    });
    for (const key of ['agentId', 'agentName', 'agentKind', 'messageKind']) {
      expect(Object.hasOwn(plain, key)).toBe(false);
    }
  });
});
