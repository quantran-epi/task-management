import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { TaskPlannerDatabase } from '../../src/db';
import type { TeamRunCoordinator } from '../../src/services/ai/office/teamRunCoordinator';
import {
  disposeAllRuns,
  getOrCreateRun,
  peekRun,
} from '../../src/services/ai/office/teamRunManager';
import { useTeamRunTeardown } from '../../src/hooks/useTeamRunTeardown';

/**
 * IN-04: `disposeAllRuns` had no production caller, so a live run could keep writing while
 * the window closed and `abortedBy: 'app-exit'` was a value nothing produced. The hook wires
 * it to `pagehide` (and the Tauri close hook, which is not available in jsdom).
 *
 * `@tauri-apps/api/window` is intentionally left unmocked: the dynamic import rejects in a
 * plain browser/jsdom and the hook swallows it, so `pagehide` is the observable channel.
 */

const fakeDb = (name: string) => ({ name }) as unknown as TaskPlannerDatabase;

function stubCoordinator() {
  const calls: Array<string | undefined> = [];
  const coordinator = {
    dispose: vi.fn(async (cause?: string) => {
      calls.push(cause);
    }),
    getState: () => ({ phase: 'idle' as const }),
  } as unknown as TeamRunCoordinator;
  return { coordinator, calls };
}

describe('useTeamRunTeardown (IN-04)', () => {
  afterEach(async () => {
    await disposeAllRuns();
    vi.clearAllMocks();
  });

  beforeEach(async () => {
    await disposeAllRuns();
  });

  it('disposes every retained run with the app-exit cause on pagehide', async () => {
    const db = fakeDb('TeamRunTeardown_pagehide');
    const first = stubCoordinator();
    const second = stubCoordinator();
    await getOrCreateRun(db, 'team-1', 'thread-1', () => first.coordinator);
    await getOrCreateRun(db, 'team-2', 'thread-1', () => second.coordinator);

    const { unmount } = renderHook(() => useTeamRunTeardown());
    window.dispatchEvent(new Event('pagehide'));

    await vi.waitFor(() => {
      expect(first.calls).toEqual(['app-exit']);
      expect(second.calls).toEqual(['app-exit']);
    });
    expect(peekRun(db, 'team-1')).toBeUndefined();
    expect(peekRun(db, 'team-2')).toBeUndefined();
    unmount();
  });

  it('detaches its listener on unmount', async () => {
    const db = fakeDb('TeamRunTeardown_unmount');
    const stub = stubCoordinator();
    await getOrCreateRun(db, 'team-1', 'thread-1', () => stub.coordinator);

    const { unmount } = renderHook(() => useTeamRunTeardown());
    unmount();
    window.dispatchEvent(new Event('pagehide'));

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(stub.calls).toEqual([]);
    expect(peekRun(db, 'team-1')).toBeDefined();
  });
});
