import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MAX_LIVE_STEPS,
  appendToolTaskOutput,
  capToolEvents,
  getToolTask,
  getToolTaskSnapshot,
  resetToolTaskStoreForTests,
  subscribeToolTasks,
  upsertToolTask,
} from '../../../../src/components/ai/runtime/toolTaskStore';

describe('toolTaskStore - bounded live task snapshots', () => {
  beforeEach(() => {
    resetToolTaskStoreForTests();
    vi.useRealTimers();
  });

  it('keeps at most MAX_LIVE_STEPS snapshots keyed by call id', () => {
    for (let i = 0; i < MAX_LIVE_STEPS + 50; i += 1) {
      upsertToolTask({ callId: `call-${i}`, status: 'running' });
    }
    expect(getToolTaskSnapshot().size).toBe(MAX_LIVE_STEPS);
    // Oldest ids are evicted; newest remain.
    expect(getToolTask('call-0')).toBeUndefined();
    expect(getToolTask(`call-${MAX_LIVE_STEPS + 49}`)).toBeDefined();
  });

  it('upsert merges by id instead of appending duplicates', () => {
    upsertToolTask({ callId: '同一个', status: 'running' });
    appendToolTaskOutput('同一个', 'stdout', 'chunk-1');
    appendToolTaskOutput('同一个', 'stdout', 'chunk-2');
    upsertToolTask({ callId: '同一个', status: 'cancelled', finishReason: 'cancelled' });
    expect(getToolTaskSnapshot().size).toBe(1);
    expect(getToolTask('同一个')?.stdout).toContain('chunk-1');
    expect(getToolTask('同一个')?.stdout).toContain('chunk-2');
    expect(getToolTask('同一个')?.status).toBe('cancelled');
  });

  it('notifies subscribers at most once per ~50ms (throttled flush)', async () => {
    vi.useFakeTimers();
    const listener = vi.fn();
    subscribeToolTasks(listener);
    for (let i = 0; i < 20; i += 1) {
      upsertToolTask({ callId: `c-${i}`, status: 'running' });
    }
    expect(listener).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe stops notifications; state survives unsubscribe (survives unmount)', async () => {
    vi.useFakeTimers();
    const listener = vi.fn();
    const off = subscribeToolTasks(listener);
    upsertToolTask({ callId: 'persist', status: 'running', stdout: 'partial' });
    off();
    await vi.advanceTimersByTimeAsync(100);
    expect(listener).not.toHaveBeenCalled();
    // A remounted view reads the same snapshot from the module-level store.
    expect(getToolTask('persist')?.stdout).toBe('partial');
  });

  it('capToolEvents replaces same-id call/result and caps globally', () => {
    let events: Array<{ id: string; phase: 'call' | 'result' }> = [];
    for (let i = 0; i < MAX_LIVE_STEPS + 20; i += 1) {
      events = capToolEvents(events, { id: `t-${i}`, phase: 'call' });
    }
    expect(events).toHaveLength(MAX_LIVE_STEPS);
    const before = events.length;
    events = capToolEvents(events, { id: events[0]!.id, phase: 'result' });
    expect(events).toHaveLength(before); // result replaced the call, not appended
    expect(events.at(-1)?.phase).toBe('result');
  });
});
