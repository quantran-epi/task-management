// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import {
  createBudgetGate,
  bucketOf,
  shouldNotifyPause,
  normalizeUsageTotal,
} from '../../../../src/services/ai/office/budgetGate';

describe('budgetGate (D-20, D-21, T-34-19)', () => {
  it('starts open and resolves wait immediately', async () => {
    const gate = createBudgetGate();
    expect(gate.isClosed()).toBe(false);
    await expect(gate.wait()).resolves.toBeUndefined();
  });

  it('suspends a closed gate until open resolves it', async () => {
    const gate = createBudgetGate();
    gate.close();
    expect(gate.isClosed()).toBe(true);

    let settled = false;
    const parked = gate.wait().then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    gate.open();
    await parked;
    expect(settled).toBe(true);
    expect(gate.isClosed()).toBe(false);
  });

  it('rejects with AbortError when the signal aborts while parked', async () => {
    const gate = createBudgetGate();
    gate.close();
    const controller = new AbortController();

    const parked = gate.wait(controller.signal);
    controller.abort();

    await expect(parked).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const gate = createBudgetGate();
    gate.close();
    const controller = new AbortController();
    controller.abort();

    await expect(gate.wait(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('releases every waiter when two turns park on the same closed gate', async () => {
    // Regression: a single resolver slot dropped the first waiter, stranding that turn
    // forever with no provider call.
    const gate = createBudgetGate();
    gate.close();

    let firstSettled = false;
    let secondSettled = false;

    const first = gate.wait().then(() => {
      firstSettled = true;
    });
    const second = gate.wait().then(() => {
      secondSettled = true;
    });

    gate.open();
    await Promise.all([first, second]);

    expect(firstSettled).toBe(true);
    expect(secondSettled).toBe(true);
  });

  it('does not strand the other waiter when one of them aborts', async () => {
    const gate = createBudgetGate();
    gate.close();
    const controller = new AbortController();

    const aborted = gate.wait(controller.signal);
    let otherSettled = false;
    const other = gate.wait().then(() => {
      otherSettled = true;
    });

    controller.abort();
    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' });
    expect(otherSettled).toBe(false);

    gate.open();
    await other;
    expect(otherSettled).toBe(true);
  });

  it('removes every abort listener once the gate opens', async () => {
    const gate = createBudgetGate();
    const controllers = [new AbortController(), new AbortController()];
    const spies = controllers.map((controller) =>
      vi.spyOn(controller.signal, 'removeEventListener')
    );

    gate.close();
    const parked = controllers.map((controller) => gate.wait(controller.signal));
    gate.open();
    await Promise.all(parked);

    for (const spy of spies) {
      expect(spy).toHaveBeenCalledWith('abort', expect.any(Function));
    }
  });

  it('removes the abort listener when the gate opens', async () => {
    const gate = createBudgetGate();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');

    gate.close();
    const parked = gate.wait(controller.signal);
    gate.open();
    await parked;

    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('treats opening an already-open gate as a no-op', () => {
    const gate = createBudgetGate();
    expect(() => gate.open()).not.toThrow();
    expect(gate.isClosed()).toBe(false);
  });

  it('buckets usage into tenths and treats a zero budget as nothing consumed', () => {
    expect(bucketOf(799, 1000)).toBe(7);
    expect(bucketOf(800, 1000)).toBe(8);
    // D-05: a group may exist with no budget yet — that must not close the gate.
    expect(bucketOf(0, 0)).toBe(0);
    expect(bucketOf(50, 0)).toBe(0);
    expect(Number.isFinite(bucketOf(1, 0))).toBe(true);
  });

  it('notifies only on the first crossing of the 80% bucket', () => {
    expect(shouldNotifyPause(7, 8)).toBe(true);
    expect(shouldNotifyPause(8, 8)).toBe(false);
    expect(shouldNotifyPause(9, 10)).toBe(false);
    // A top-up lowers the bucket, so the next crossing notifies again.
    expect(shouldNotifyPause(3, 8)).toBe(true);
    expect(shouldNotifyPause(3, 7)).toBe(false);
  });

  it('normalizes usage totals when the provider omits totalTokens', () => {
    expect(normalizeUsageTotal({ promptTokens: 10, completionTokens: 5 })).toBe(15);
    expect(normalizeUsageTotal({ promptTokens: 10, completionTokens: 5, totalTokens: 99 })).toBe(99);
    expect(normalizeUsageTotal({})).toBe(0);
  });
});
