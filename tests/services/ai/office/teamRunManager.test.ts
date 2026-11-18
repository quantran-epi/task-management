// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import type { TaskPlannerDatabase } from '../../../../src/db';
import type { TeamRunCoordinator } from '../../../../src/services/ai/office/teamRunCoordinator';
import {
  disposeAllRuns,
  disposeRun,
  getOrCreateRun,
  peekRun,
  runKey,
} from '../../../../src/services/ai/office/teamRunManager';

/**
 * Only `dispose` and `getState` are exercised by the manager, so a stub is enough — the
 * real coordinator's lifetime behaviour is covered in `teamRunCoordinator.test.ts`.
 */
interface StubOptions {
  dispose?: () => Promise<void>;
}

function createStub(label: string, options: StubOptions = {}) {
  const calls: string[] = [];
  const coordinator = {
    dispose: async () => {
      calls.push(`dispose-${label}`);
      await options.dispose?.();
    },
    getState: () => ({ phase: 'idle' as const }),
  } as unknown as TeamRunCoordinator;
  return { coordinator, calls };
}

const fakeDb = (name: string) => ({ name }) as unknown as TaskPlannerDatabase;

describe('teamRunManager (D-18)', () => {
  afterEach(async () => {
    await disposeAllRuns();
  });

  it('returns the same coordinator for the same team and thread', async () => {
    const db = fakeDb('TeamRunManager_same');
    const { coordinator } = createStub('a');

    const first = await getOrCreateRun(db, 'team-1', 'thread-1', () => coordinator);
    const second = await getOrCreateRun(db, 'team-1', 'thread-1', () => {
      throw new Error('must not construct a second coordinator');
    });

    expect(second).toBe(first);
  });

  it('keys runs by database name so two databases never share a coordinator', async () => {
    const dbA = fakeDb('TeamRunManager_db_a');
    const dbB = fakeDb('TeamRunManager_db_b');
    const a = createStub('a').coordinator;
    const b = createStub('b').coordinator;

    expect(runKey(dbA, 'team-1')).not.toBe(runKey(dbB, 'team-1'));
    await getOrCreateRun(dbA, 'team-1', 'thread-1', () => a);
    await getOrCreateRun(dbB, 'team-1', 'thread-1', () => b);

    expect(peekRun(dbA, 'team-1')).toBe(a);
    expect(peekRun(dbB, 'team-1')).toBe(b);
  });

  it('isolates teams: disposing one leaves the sibling coordinator in place', async () => {
    const db = fakeDb('TeamRunManager_isolate');
    const first = createStub('first').coordinator;
    const second = createStub('second').coordinator;
    await getOrCreateRun(db, 'team-1', 'thread-1', () => first);
    await getOrCreateRun(db, 'team-2', 'thread-1', () => second);

    await disposeRun(db, 'team-1');

    expect(peekRun(db, 'team-1')).toBeUndefined();
    expect(peekRun(db, 'team-2')).toBe(second);
  });

  it('resolves without throwing when the team has no live coordinator', async () => {
    const db = fakeDb('TeamRunManager_absent');
    await expect(disposeRun(db, 'never-created')).resolves.toBeUndefined();
  });

  it('disposes exactly once across a double disposeRun', async () => {
    const db = fakeDb('TeamRunManager_double');
    const stub = createStub('solo');
    await getOrCreateRun(db, 'team-1', 'thread-1', () => stub.coordinator);

    await disposeRun(db, 'team-1');
    await disposeRun(db, 'team-1');

    expect(stub.calls).toEqual(['dispose-solo']);
    expect(peekRun(db, 'team-1')).toBeUndefined();
  });

  it('awaits the stale dispose before constructing the replacement', async () => {
    const db = fakeDb('TeamRunManager_thread_change');
    const order: string[] = [];
    const stale = createStub('stale', {
      dispose: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
      },
    }).coordinator;
    await getOrCreateRun(db, 'team-1', 'thread-old', () => stale);

    const replacement = createStub('new').coordinator;
    const returned = await getOrCreateRun(db, 'team-1', 'thread-new', () => {
      order.push('create');
      return replacement;
    });
    order.unshift('dispose-stale');

    expect(returned).toBe(replacement);
    expect(order).toEqual(['dispose-stale', 'create']);
    expect(peekRun(db, 'team-1')).toBe(replacement);
  });

  it('never hands out two coordinators for one team during a thread change', async () => {
    const db = fakeDb('TeamRunManager_no_overlap');
    let inFlightDisposals = 0;
    let overlap = false;
    const stale = createStub('stale', {
      dispose: async () => {
        inFlightDisposals += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlightDisposals -= 1;
      },
    }).coordinator;
    await getOrCreateRun(db, 'team-1', 'thread-old', () => stale);

    const replacement = createStub('new').coordinator;
    const returned = await getOrCreateRun(db, 'team-1', 'thread-new', () => {
      if (inFlightDisposals > 0) overlap = true;
      return replacement;
    });

    expect(overlap).toBe(false);
    expect(returned).toBe(replacement);
  });

  it('drops the entry even when dispose throws, and rethrows to the caller', async () => {
    const db = fakeDb('TeamRunManager_throwing');
    const exploding = createStub('boom', {
      dispose: async () => {
        throw new Error('dispose failed');
      },
    }).coordinator;
    await getOrCreateRun(db, 'team-1', 'thread-1', () => exploding);

    await expect(disposeRun(db, 'team-1')).rejects.toThrow('dispose failed');
    expect(peekRun(db, 'team-1')).toBeUndefined();
  });

  it('disposeAllRuns disposes every retained coordinator', async () => {
    const db = fakeDb('TeamRunManager_all');
    const first = createStub('a');
    const second = createStub('b');
    await getOrCreateRun(db, 'team-1', 'thread-1', () => first.coordinator);
    await getOrCreateRun(db, 'team-2', 'thread-1', () => second.coordinator);

    await disposeAllRuns();

    expect(first.calls).toEqual(['dispose-a']);
    expect(second.calls).toEqual(['dispose-b']);
    expect(peekRun(db, 'team-1')).toBeUndefined();
    expect(peekRun(db, 'team-2')).toBeUndefined();
  });
});
