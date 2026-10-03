import { describe, it, expect, beforeEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db';
import {
  createOrGetThread,
  saveMessage,
  getMessagesByThreadId,
  clearThreadContext,
  deleteThreadByScope,
} from '../../src/db/repositories/chatRepo';
import {
  deleteProjectWithCascade,
  deleteTaskWithAllocations,
} from '../../src/db/repositories/cascadeRepo';
import type { Task, Project, Milestone } from '../../src/types/models';

describe('chatRepo and SCHEMA_V8 integration', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`test-chat-db-${Date.now()}-${Math.random()}`);
  });

  it('initializes chatThreads and chatMessages stores in SCHEMA_V8', async () => {
    expect(db.chatThreads).toBeDefined();
    expect(db.chatMessages).toBeDefined();

    const threadCount = await db.chatThreads.count();
    const msgCount = await db.chatMessages.count();
    expect(threadCount).toBe(0);
    expect(msgCount).toBe(0);
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

  it('cascade delete cleans up chatThreads and chatMessages on entity deletion', async () => {
    const now = new Date().toISOString();
    const project: Project = {
      id: 'proj-1',
      name: 'Project 1',
      status: 'Open',
      createdAt: now,
      updatedAt: now,
    };
    const milestone: Milestone = {
      id: 'ms-1',
      projectId: 'proj-1',
      name: 'Milestone 1',
      status: 'Open',
      createdAt: now,
      updatedAt: now,
    };
    const task1: Task = {
      id: 'task-1',
      projectId: 'proj-1',
      milestoneId: 'ms-1',
      name: 'Task 1',
      status: 'Open',
      priority: 'Medium',
      progress: 0,
      estimateMinutes: 60,
      workType: 'code',
      createdAt: now,
      updatedAt: now,
    };
    const task2: Task = {
      id: 'task-2',
      projectId: 'proj-1',
      milestoneId: 'ms-1',
      name: 'Task 2',
      status: 'Open',
      priority: 'Low',
      progress: 0,
      estimateMinutes: 30,
      workType: 'code',
      createdAt: now,
      updatedAt: now,
    };

    await db.projects.add(project);
    await db.milestones.add(milestone);
    await db.tasks.bulkAdd([task1, task2]);

    // Create threads and messages for each entity
    const tThread1 = await createOrGetThread({ scopeType: 'task', entityId: 'task-1' }, db);
    await saveMessage({ threadId: tThread1.id, role: 'user', content: 'Task 1 msg' }, db);

    const tThread2 = await createOrGetThread({ scopeType: 'task', entityId: 'task-2' }, db);
    await saveMessage({ threadId: tThread2.id, role: 'user', content: 'Task 2 msg' }, db);

    const msThread = await createOrGetThread({ scopeType: 'milestone', entityId: 'ms-1' }, db);
    await saveMessage({ threadId: msThread.id, role: 'user', content: 'Milestone msg' }, db);

    const projThread = await createOrGetThread({ scopeType: 'project', entityId: 'proj-1' }, db);
    await saveMessage({ threadId: projThread.id, role: 'user', content: 'Project msg' }, db);

    // 1. Delete task-1 with allocations
    await deleteTaskWithAllocations('task-1', db);
    expect(await db.chatThreads.where('scopeKey').equals('task:task-1').first()).toBeUndefined();
    expect(await db.chatMessages.where('threadId').equals(tThread1.id).count()).toBe(0);

    // task-2 thread should remain
    expect(await db.chatThreads.where('scopeKey').equals('task:task-2').first()).toBeDefined();

    // 2. Delete project with cascade
    await deleteProjectWithCascade('proj-1', 'cascade', db);
    expect(await db.chatThreads.where('scopeKey').equals('project:proj-1').first()).toBeUndefined();
    expect(await db.chatThreads.where('scopeKey').equals('milestone:ms-1').first()).toBeUndefined();
    expect(await db.chatThreads.where('scopeKey').equals('task:task-2').first()).toBeUndefined();

    expect(await db.chatMessages.where('threadId').equals(projThread.id).count()).toBe(0);
    expect(await db.chatMessages.where('threadId').equals(msThread.id).count()).toBe(0);
    expect(await db.chatMessages.where('threadId').equals(tThread2.id).count()).toBe(0);
  });
});
