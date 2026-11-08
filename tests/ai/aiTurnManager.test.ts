import { describe, it, expect, vi, beforeEach } from 'vitest';
import { aiTurnManager } from '../../src/services/ai/aiTurnManager';

describe('aiTurnManager', () => {
  beforeEach(() => {
    aiTurnManager.abortAll();
  });

  it('registers and retrieves active turns', () => {
    const abortFn = vi.fn();
    aiTurnManager.registerTurn({
      id: 'tab-1',
      scopeKey: 'global',
      title: 'Chat Tổng quan',
      status: 'streaming',
      streamingStatusLabel: 'Đang phản hồi...',
      abort: abortFn,
    });

    const turn = aiTurnManager.getTurn('tab-1');
    expect(turn).toBeDefined();
    expect(turn?.title).toBe('Chat Tổng quan');
    expect(turn?.status).toBe('streaming');

    const active = aiTurnManager.getActiveTurns();
    expect(active.length).toBe(1);
    expect(active[0]?.id).toBe('tab-1');
  });

  it('filters out non-active turns in getActiveTurns', () => {
    aiTurnManager.registerTurn({
      id: 'tab-idle',
      scopeKey: 'global',
      title: 'Idle Turn',
      status: 'idle',
      streamingStatusLabel: null,
      abort: vi.fn(),
    });

    expect(aiTurnManager.getActiveTurns().length).toBe(0);
  });

  it('updates streamingText and toolEvents on turn', () => {
    aiTurnManager.registerTurn({
      id: 'tab-2',
      scopeKey: 'global',
      title: 'Tool Test',
      status: 'tool',
      streamingStatusLabel: 'Truy xuất công cụ',
      abort: vi.fn(),
    });

    aiTurnManager.updateTurn('tab-2', {
      streamingText: 'partial answer',
      toolEvents: [{ id: 't1', name: 'search', phase: 'call' }],
    });

    const turn = aiTurnManager.getTurn('tab-2');
    expect(turn?.streamingText).toBe('partial answer');
    expect(turn?.toolEvents.length).toBe(1);
  });

  it('aborts individual turn and removes it from active list', () => {
    const abortFn = vi.fn();
    aiTurnManager.registerTurn({
      id: 'tab-abort',
      scopeKey: 'global',
      title: 'Abort Test',
      status: 'streaming',
      streamingStatusLabel: 'Đang phản hồi',
      abort: abortFn,
    });

    expect(aiTurnManager.getActiveTurns().length).toBe(1);
    aiTurnManager.abortTurn('tab-abort');

    expect(abortFn).toHaveBeenCalledTimes(1);
    expect(aiTurnManager.getActiveTurns().length).toBe(0);
    expect(aiTurnManager.getTurn('tab-abort')).toBeUndefined();
  });

  it('notifies subscribers on change', () => {
    const subscriber = vi.fn();
    const unsubscribe = aiTurnManager.subscribe(subscriber);

    aiTurnManager.registerTurn({
      id: 'tab-sub',
      scopeKey: 'global',
      title: 'Sub test',
      status: 'preparing',
      streamingStatusLabel: 'Chuẩn bị',
      abort: vi.fn(),
    });

    expect(subscriber).toHaveBeenCalled();
    unsubscribe();

    aiTurnManager.updateTurn('tab-sub', { streamingText: 'text' });
    expect(subscriber).toHaveBeenCalledTimes(1);
  });
});
