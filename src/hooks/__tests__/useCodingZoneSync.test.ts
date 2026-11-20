import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  useCodingZoneSync,
  isValidCodingZoneSyncPayload,
  setCodingZoneEmitterForTest,
  setCodingZoneListenerForTest,
  getCodingZoneListenerCountForTest,
} from '../useCodingZoneSync';
import {
  CODING_ZONE_HANDOFF_EVENT,
  CODING_ZONE_SYNC_EVENT,
} from '../../utils/codingZonePopout';

interface Harness {
  postMessage: (data: unknown) => void;
  postMessageMock: ReturnType<typeof vi.fn>;
  close: () => void;
  closeMock: ReturnType<typeof vi.fn>;
  trigger: (data: unknown) => void;
}

const channels: Harness[] = [];
const emitMock = vi.fn(async () => {});
const listeners = new Map<string, (event: { payload: unknown; event: string; id: number }) => void>();

class MockBroadcastChannel {
  private handlers = new Set<(event: { data: unknown }) => void>();
  constructor(_name: string) {
    const postMessageMock = vi.fn();
    const closeMock = vi.fn();
    const harness: Harness = {
      postMessage: (data: unknown) => postMessageMock(data),
      postMessageMock,
      close: () => closeMock(),
      closeMock,
      trigger: (data: unknown) => this.handlers.forEach((handler) => handler({ data })),
    };
    channels.push(harness);
    (this as unknown as { postMessage: unknown }).postMessage = harness.postMessage;
    (this as unknown as { close: unknown }).close = harness.close;
  }
  addEventListener(_type: string, handler: (event: { data: unknown }) => void) { this.handlers.add(handler); }
  removeEventListener(_type: string, handler: (event: { data: unknown }) => void) { this.handlers.delete(handler); }
}

vi.mock('../../utils/timerPopout', () => ({ isTauriApp: () => true }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
  emitTo: vi.fn(),
}));

describe('useCodingZoneSync', () => {
  const originalBroadcastChannel = globalThis.BroadcastChannel;

  beforeEach(() => {
    channels.length = 0;
    listeners.clear();
    vi.clearAllMocks();
    emitMock.mockClear();
    setCodingZoneListenerForTest(async (event: string, handler: (event: { payload: unknown }) => void) => {
      listeners.set(event, handler);
      return () => { listeners.delete(event); };
    });
    setCodingZoneEmitterForTest(emitMock);
    Object.assign(globalThis, { BroadcastChannel: MockBroadcastChannel });
  });

  afterEach(() => {
    Object.assign(globalThis, { BroadcastChannel: originalBroadcastChannel });
  });

  it('ignores self-origin, stale and malformed events; applies newer revisions', () => {
    const onState = vi.fn();
    renderHook(() => useCodingZoneSync('main', onState));
    const receiving = channels.at(-1);
    expect(receiving).toBeDefined();

    const base = { originWindowId: 'popout', revision: 1, kind: 'full', payload: { ok: 1 } };
    receiving?.trigger(base);
    receiving?.trigger({ ...base, revision: 1, payload: { ok: 2 } });
    receiving?.trigger({ ...base, originWindowId: 'main', revision: 2 });
    receiving?.trigger({ bogus: true });
    receiving?.trigger({ ...base, revision: 3, payload: { ok: 3 } });

    expect(onState).toHaveBeenCalledTimes(2);
    expect(onState).toHaveBeenNthCalledWith(1, base);
    expect(onState).toHaveBeenNthCalledWith(2, { ...base, revision: 3, payload: { ok: 3 } });
  });

  it('validates payload shape at receipt', () => {
    expect(isValidCodingZoneSyncPayload({ originWindowId: 'w', revision: 1, kind: 'full', payload: null })).toBe(true);
    expect(isValidCodingZoneSyncPayload({ originWindowId: 'w', revision: -1, kind: 'full', payload: null })).toBe(false);
    expect(isValidCodingZoneSyncPayload({ originWindowId: 'w', revision: 1, kind: 'unknown', payload: null })).toBe(false);
    expect(isValidCodingZoneSyncPayload(null)).toBe(false);
  });

  it('publish increments revision and targets the popout window', async () => {
    const { result } = renderHook(() => useCodingZoneSync('main', vi.fn()));
    act(() => { result.current.publish('hunk', { key: 'a', state: 'accepted' }); });
    act(() => { result.current.publish('hunk', { key: 'b', state: 'rejected' }); });

    const sent = channels.at(-1)?.postMessageMock.mock.calls.map((call) => call[0] as { revision: number });
    expect(sent?.map((item) => item.revision)).toEqual([1, 2]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(emitMock).toHaveBeenCalledWith('coding-zone-popout', CODING_ZONE_SYNC_EVENT, expect.objectContaining({ revision: 2 }));
  });

  it('republishes latest state when a late popout requests it', async () => {
    const getSnapshot = vi.fn(() => ({ seeded: true }));
    const { result } = renderHook(() => useCodingZoneSync('main', vi.fn(), getSnapshot));
    const owner = channels.at(-1);
    expect(owner).toBeDefined();
    act(() => {
      owner?.trigger({ originWindowId: 'popout', revision: 0, kind: 'request-state', payload: null });
    });
    expect(getSnapshot).toHaveBeenCalledTimes(1);
    const published = owner?.postMessageMock.mock.calls.at(-1)?.[0] as { originWindowId: string; revision: number; kind: string };
    expect(published).toMatchObject({ originWindowId: 'main', revision: 1, kind: 'full' });
    act(() => { result.current.requestState(); });
    const request = owner?.postMessageMock.mock.calls.at(-1)?.[0] as { kind: string };
    expect(request.kind).toBe('request-state');
  });

  it('seeds initial state from the handoff event', async () => {
    const onState = vi.fn();
    renderHook(() => useCodingZoneSync('popout', onState));
    await waitFor(() => {
      expect(listeners.get(CODING_ZONE_HANDOFF_EVENT)).toBeDefined();
    });
    const handoff = listeners.get(CODING_ZONE_HANDOFF_EVENT);
    act(() => {
      handoff?.({ payload: { originWindowId: 'main', revision: 0, kind: 'full', payload: { seeded: true } }, event: CODING_ZONE_HANDOFF_EVENT, id: 1 });
    });
    expect(onState).toHaveBeenCalledWith(expect.objectContaining({ payload: { seeded: true } }));
  });

  it('unsubscribes listeners and closes the channel on unmount', async () => {
    const { unmount } = renderHook(() => useCodingZoneSync('main', vi.fn()));
    await waitFor(() => { expect(getCodingZoneListenerCountForTest()).toBeGreaterThan(0); });
    unmount();
    expect(getCodingZoneListenerCountForTest()).toBe(0);
  });
});
