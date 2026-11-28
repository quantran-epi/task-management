import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, renderHook, act } from '@testing-library/react';
import {
  useTimerTick,
  useTimerSyncListener,
  acquireTimerTicker,
  notifyTimerTick,
  resetTimerSyncChannel,
} from '../../src/hooks/useTimerTick';

describe('timer tick store', () => {
  const hookRender = vi.fn();
  function HookConsumer() {
    hookRender();
    return null;
  }

  afterEach(() => {
    resetTimerSyncChannel();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('notifies tick subscribers and snapshots tick from the store', () => {
    const contextRender = vi.fn();
    const tickRender = vi.fn();

    function ContextConsumer() {
      contextRender();
      return null;
    }
    function TickConsumer() {
      tickRender();
      return <span>{useTimerTick()}</span>;
    }
    render(
      <div>
        <ContextConsumer />
        <TickConsumer />
        <HookConsumer />
      </div>
    );
    const initialTickRenders = tickRender.mock.calls.length;
    const initialContextRenders = contextRender.mock.calls.length;
    const initialHookRenders = hookRender.mock.calls.length;

    act(() => {
      notifyTimerTick();
    });

    expect(tickRender.mock.calls.length).toBe(initialTickRenders + 1);
    expect(hookRender.mock.calls.length).toBe(initialHookRenders);
    expect(contextRender.mock.calls.length).toBe(initialContextRenders);
  });

  it('shares one interval across refcounted acquirers and stops when all release', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const setSpy = vi.spyOn(window, 'setInterval');
    const clearSpy = vi.spyOn(window, 'clearInterval');

    const releaseA = acquireTimerTicker();
    const releaseB = acquireTimerTicker();
    expect(setSpy).toHaveBeenCalledTimes(1);

    const { result } = renderHook(() => useTimerTick());
    const initial = result.current;
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current).toBe(initial + 2);

    releaseA();
    expect(clearSpy).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(initial + 3);

    releaseB();
    expect(clearSpy).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(initial + 3);
  });

  it('BroadcastChannel sync messages bump the tick store', () => {
    let providerChannel: MockBroadcastChannel | undefined;
    class MockBroadcastChannel {
      onmessage: ((event: unknown) => void) | null = null;
      constructor() {
        providerChannel = this;
      }
      postMessage() {}
      close() {}
    }
    vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);

    const { result } = renderHook(() => {
      useTimerSyncListener('task_timer_sync');
      return useTimerTick();
    });
    const initial = result.current;

    act(() => {
      providerChannel?.onmessage?.({ data: { type: 'START', taskId: 'task-1' } });
    });

    expect(result.current).toBe(initial + 1);
  });
});
