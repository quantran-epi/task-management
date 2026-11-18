// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  createTeamRunScheduler,
  type SchedulerHandle,
} from '../../../../src/services/ai/office/scheduler';
import { MAX_TEAM_CONCURRENCY } from '../../../../src/types/aiOffice';

/** Lets every pending microtask settle, so "still parked" is a real assertion. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('scheduler (D-01, D-04, D-05, D-07, D-08, T-37-05)', () => {
  it('admits exactly limit acquires and parks the rest', async () => {
    const scheduler = createTeamRunScheduler(2);

    const first = await scheduler.acquire(new AbortController().signal);
    const second = await scheduler.acquire(new AbortController().signal);
    let thirdSettled = false;
    const third = scheduler.acquire(new AbortController().signal).then((handle) => {
      thirdSettled = true;
      return handle;
    });

    await flush();
    expect(scheduler.getRunningCount()).toBe(2);
    expect(scheduler.getQueuedCount()).toBe(1);
    expect(thirdSettled).toBe(false);

    scheduler.release(first);
    const thirdHandle = await third;
    expect(thirdSettled).toBe(true);
    expect(scheduler.getRunningCount()).toBe(2);
    expect(scheduler.getQueuedCount()).toBe(0);

    scheduler.release(second);
    scheduler.release(thirdHandle);
  });

  it('admits in FIFO / plan order for five acquires at limit 1', async () => {
    const scheduler = createTeamRunScheduler(1);

    const acquires = [0, 1, 2, 3, 4].map((index) =>
      scheduler
        .acquire(new AbortController().signal)
        .then((handle): { index: number; handle: SchedulerHandle } => ({ index, handle }))
    );

    const first = awaitsInOrder(acquires);
    const order: number[] = [];
    for (let grant = 0; grant < 5; grant += 1) {
      const { index, handle } = await first.next();
      order.push(index);
      scheduler.release(handle);
    }

    expect(order).toEqual([0, 1, 2, 3, 4]);
    expect(scheduler.getRunningCount()).toBe(0);
    expect(scheduler.getQueuedCount()).toBe(0);
  });

  it('admits the third acquire only after the limit is raised to 3', async () => {
    const scheduler = createTeamRunScheduler(2);
    const first = await scheduler.acquire(new AbortController().signal);
    const second = await scheduler.acquire(new AbortController().signal);
    let thirdSettled = false;
    const third = scheduler.acquire(new AbortController().signal).then((handle) => {
      thirdSettled = true;
      return handle;
    });

    await flush();
    expect(scheduler.getRunningCount()).toBe(2);
    expect(scheduler.getQueuedCount()).toBe(1);
    expect(thirdSettled).toBe(false);

    scheduler.setLimit(3);
    const thirdHandle = await third;
    expect(thirdSettled).toBe(true);
    expect(scheduler.getRunningCount()).toBe(3);

    scheduler.release(first);
    scheduler.release(second);
    scheduler.release(thirdHandle);
  });

  it('raising the limit releases exactly the queued waiters that fit', async () => {
    const scheduler = createTeamRunScheduler(2);
    const handles = await Promise.all([
      scheduler.acquire(new AbortController().signal),
      scheduler.acquire(new AbortController().signal),
    ]);

    const parked: Array<Promise<SchedulerHandle>> = [0, 1, 2].map(() =>
      scheduler.acquire(new AbortController().signal)
    );
    await flush();
    expect(scheduler.getRunningCount()).toBe(2);
    expect(scheduler.getQueuedCount()).toBe(3);

    scheduler.setLimit(3);
    const third = await parked[0]!;
    expect(scheduler.getRunningCount()).toBe(3);
    expect(scheduler.getQueuedCount()).toBe(2);

    for (const handle of [...handles, third]) scheduler.release(handle);
  });

  it('lowering the limit preempts nothing and admits nobody until the count drops', async () => {
    const scheduler = createTeamRunScheduler(2);
    const handles = await Promise.all([
      scheduler.acquire(new AbortController().signal),
      scheduler.acquire(new AbortController().signal),
    ]);
    const parked = scheduler.acquire(new AbortController().signal);
    let settled = false;
    void parked.then(() => {
      settled = true;
    });

    scheduler.setLimit(1);
    await flush();
    expect(scheduler.getRunningCount()).toBe(2);
    expect(scheduler.getQueuedCount()).toBe(1);
    expect(settled).toBe(false);

    scheduler.release(handles[0]!);
    await flush();
    expect(scheduler.getRunningCount()).toBe(1);
    expect(settled).toBe(false);

    scheduler.release(handles[1]!);
    await parked;
    expect(scheduler.getRunningCount()).toBe(1);
  });

  it('admits nobody when the new limit equals the running count', async () => {
    const scheduler = createTeamRunScheduler(2);
    const handles = await Promise.all([
      scheduler.acquire(new AbortController().signal),
      scheduler.acquire(new AbortController().signal),
    ]);
    let admitted = false;
    void scheduler.acquire(new AbortController().signal).then(() => {
      admitted = true;
    });

    scheduler.setLimit(2);
    await flush();
    expect(admitted).toBe(false);
    expect(scheduler.getQueuedCount()).toBe(1);

    scheduler.release(handles[0]!);
    await flush();
    expect(scheduler.getRunningCount()).toBe(2);
    scheduler.release(handles[1]!);
  });

  it('clamps every limit through clampTeamConcurrency', () => {
    const scheduler = createTeamRunScheduler(9999);
    expect(scheduler.getLimit()).toBe(MAX_TEAM_CONCURRENCY);

    scheduler.setLimit(0);
    expect(scheduler.getLimit()).toBe(1);

    scheduler.setLimit(2.6);
    expect(scheduler.getLimit()).toBe(3);

    scheduler.setLimit(Number.NaN);
    expect(Number.isInteger(scheduler.getLimit())).toBe(true);
    expect(scheduler.getLimit()).toBeGreaterThanOrEqual(1);
    expect(scheduler.getLimit()).toBeLessThanOrEqual(MAX_TEAM_CONCURRENCY);
  });

  it('releases one slot on a double release and ignores an unknown handle', async () => {
    const scheduler = createTeamRunScheduler(2);
    const handle = await scheduler.acquire(new AbortController().signal);

    scheduler.release(handle);
    scheduler.release(handle);
    expect(scheduler.getRunningCount()).toBe(0);

    expect(() => scheduler.release({ slot: 424242 })).not.toThrow();
    expect(() => scheduler.cancel({ slot: 424242 })).not.toThrow();
    expect(scheduler.getRunningCount()).toBe(0);
  });

  it('treats cancel as an idempotent release', async () => {
    const scheduler = createTeamRunScheduler(1);
    const handle = await scheduler.acquire(new AbortController().signal);

    scheduler.cancel(handle);
    scheduler.cancel(handle);
    scheduler.release(handle);
    expect(scheduler.getRunningCount()).toBe(0);
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const scheduler = createTeamRunScheduler(1);
    const controller = new AbortController();
    controller.abort();

    await expect(scheduler.acquire(controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(scheduler.getRunningCount()).toBe(0);
    expect(scheduler.getQueuedCount()).toBe(0);
  });

  it('rejects a parked acquire and drops the waiter when its signal aborts', async () => {
    const scheduler = createTeamRunScheduler(1);
    const running = await scheduler.acquire(new AbortController().signal);
    const controller = new AbortController();

    const parked = scheduler.acquire(controller.signal);
    await flush();
    expect(scheduler.getQueuedCount()).toBe(1);

    controller.abort();
    await expect(parked).rejects.toMatchObject({ name: 'AbortError' });
    expect(scheduler.getQueuedCount()).toBe(0);
    expect(scheduler.getRunningCount()).toBe(1);

    scheduler.release(running);
    expect(scheduler.getRunningCount()).toBe(0);
  });

  it('rejects a parked acquire with a DOMException named AbortError', async () => {
    const scheduler = createTeamRunScheduler(1);
    scheduler.acquire(new AbortController().signal);
    const controller = new AbortController();
    const parked = scheduler.acquire(controller.signal);
    controller.abort();

    await expect(parked).rejects.toBeInstanceOf(DOMException);
    await expect(parked).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('does not admit an aborted waiter when a slot opens', async () => {
    const scheduler = createTeamRunScheduler(1);
    const running = await scheduler.acquire(new AbortController().signal);
    const controller = new AbortController();
    const parked = scheduler.acquire(controller.signal);
    controller.abort();
    await expect(parked).rejects.toMatchObject({ name: 'AbortError' });

    scheduler.release(running);
    expect(scheduler.getRunningCount()).toBe(0);
    expect(scheduler.getQueuedCount()).toBe(0);
  });
});

/**
 * Yields settled acquires in completion order. `Promise.all` would preserve array order,
 * which would make a FIFO assertion vacuous.
 */
function awaitsInOrder<T>(promises: Array<Promise<T>>) {
  const queue: T[] = [];
  const waiters: Array<(value: T) => void> = [];
  for (const promise of promises) {
    void promise.then((value) => {
      const waiter = waiters.shift();
      if (waiter) waiter(value);
      else queue.push(value);
    });
  }
  return {
    async next(): Promise<T> {
      const queued = queue.shift();
      if (queued !== undefined) return queued;
      return new Promise<T>((resolve) => waiters.push(resolve));
    },
  };
}
