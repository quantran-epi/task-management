import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentLogStore } from '../../src/services/agents/agentLogStore';
import type { GhostDevStreamChunk } from '../../src/types/agent';

describe('AgentLogStore Unit Tests', () => {
  let store: AgentLogStore;

  beforeEach(() => {
    store = new AgentLogStore();
  });

  it('keeps independent logs per session/taskId', () => {
    const chunk1: GhostDevStreamChunk = {
      taskId: 'task-A',
      source: 'master',
      timestamp: '2026-10-07T00:00:00Z',
      type: 'log',
      content: 'Line 1 for Task A',
    };
    const chunk2: GhostDevStreamChunk = {
      taskId: 'task-B',
      source: 'master',
      timestamp: '2026-10-07T00:00:01Z',
      type: 'log',
      content: 'Line 1 for Task B',
    };

    store.addChunk(chunk1);
    store.addChunk(chunk2);

    expect(store.getLogs('task-A')).toHaveLength(1);
    expect(store.getLogs('task-A')[0]?.content).toBe('Line 1 for Task A');

    expect(store.getLogs('task-B')).toHaveLength(1);
    expect(store.getLogs('task-B')[0]?.content).toBe('Line 1 for Task B');

    expect(store.getLogs('task-C')).toHaveLength(0);
  });

  it('notifies subscribers when new chunks arrive for specific taskId', () => {
    const listenerA = vi.fn();
    const listenerB = vi.fn();

    const unsubA = store.subscribe('task-A', listenerA);
    const unsubB = store.subscribe('task-B', listenerB);

    // Initial subscribe call with empty list
    expect(listenerA).toHaveBeenCalledWith([]);
    expect(listenerB).toHaveBeenCalledWith([]);

    listenerA.mockClear();
    listenerB.mockClear();

    const chunkA: GhostDevStreamChunk = {
      taskId: 'task-A',
      source: 'master',
      timestamp: '2026-10-07T00:00:02Z',
      type: 'log',
      content: 'New output for Task A',
    };

    store.addChunk(chunkA);

    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerA).toHaveBeenCalledWith([chunkA]);
    expect(listenerB).not.toHaveBeenCalled();

    unsubA();
    unsubB();
  });

  it('clearing logs for one task does not affect other tasks', () => {
    store.addChunk({
      taskId: 'task-1',
      source: 'master',
      timestamp: '2026-10-07T00:00:00Z',
      type: 'log',
      content: 'Output 1',
    });
    store.addChunk({
      taskId: 'task-2',
      source: 'master',
      timestamp: '2026-10-07T00:00:00Z',
      type: 'log',
      content: 'Output 2',
    });

    store.clearLogs('task-1');

    expect(store.getLogs('task-1')).toHaveLength(0);
    expect(store.getLogs('task-2')).toHaveLength(1);
  });

  it('deleting logs removes task data completely', () => {
    store.addChunk({
      taskId: 'task-to-delete',
      source: 'master',
      timestamp: '2026-10-07T00:00:00Z',
      type: 'log',
      content: 'Log to delete',
    });

    expect(store.getLogs('task-to-delete')).toHaveLength(1);
    store.deleteLogs('task-to-delete');
    expect(store.getLogs('task-to-delete')).toHaveLength(0);
  });
});
