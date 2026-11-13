// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import {
  createBudgetGate,
  normalizeUsageTotal,
  splitUsage,
  resolveThresholdPct,
  isAtThreshold,
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

  it('normalizes usage totals when the provider omits totalTokens', () => {
    expect(normalizeUsageTotal({ promptTokens: 10, completionTokens: 5 })).toBe(15);
    expect(normalizeUsageTotal({ promptTokens: 10, completionTokens: 5, totalTokens: 99 })).toBe(99);
    expect(normalizeUsageTotal({})).toBe(0);
  });
});

describe('splitUsage / threshold math (AIO-BUDGET-02, AIO-BUDGET-06, D-05, D-09)', () => {
  it('retains the input/output split instead of collapsing it to a total', () => {
    expect(splitUsage({ promptTokens: 10, completionTokens: 5 })).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      estimated: false,
      splitInferred: false,
    });
  });

  it('charges cache read and cache creation tokens as input (D-09)', () => {
    expect(
      splitUsage({ promptTokens: 10, cacheReadTokens: 40, cacheCreationTokens: 5 })
    ).toEqual({
      inputTokens: 55,
      outputTokens: 0,
      estimated: false,
      splitInferred: false,
    });
  });

  it('charges a total-only report wholly to input and flags the inferred split', () => {
    expect(splitUsage({ totalTokens: 42 })).toEqual({
      inputTokens: 42,
      outputTokens: 0,
      estimated: false,
      splitInferred: true,
    });
  });

  it('returns all zeros for an empty report — the estimator decides when to estimate', () => {
    expect(splitUsage({})).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      estimated: false,
      splitInferred: false,
    });
  });

  it('never returns a negative component whatever the provider sends', () => {
    const split = splitUsage({ promptTokens: -5, completionTokens: -1 });
    expect(split.inputTokens).toBeGreaterThanOrEqual(0);
    expect(split.outputTokens).toBeGreaterThanOrEqual(0);
  });

  it('resolves the override over the global value, and inherits when absent', () => {
    expect(resolveThresholdPct({}, undefined)).toBe(80);
    expect(resolveThresholdPct({ budgetWarnThresholdPct: 65 }, 90)).toBe(65);
    expect(resolveThresholdPct({}, 55)).toBe(55);
    // An absent override inherits the global value rather than defaulting to 80.
    expect(resolveThresholdPct({}, 65)).toBe(65);
    expect(resolveThresholdPct({ budgetWarnThresholdPct: undefined }, 65)).toBe(65);
  });

  it('clamps every out-of-band percentage into 1..100', () => {
    expect(resolveThresholdPct({ budgetWarnThresholdPct: 0 }, undefined)).toBe(80);
    expect(resolveThresholdPct({ budgetWarnThresholdPct: 1000 }, 42)).toBe(42);
    expect(resolveThresholdPct({}, Number.NaN)).toBe(80);
    expect(resolveThresholdPct({ budgetWarnThresholdPct: 0.5 }, undefined)).toBe(1);
    expect(resolveThresholdPct({ budgetWarnThresholdPct: -3 }, undefined)).toBe(80);
    expect(resolveThresholdPct({ budgetWarnThresholdPct: 100 }, undefined)).toBe(100);
  });

  it('is inclusive at the threshold boundary', () => {
    expect(isAtThreshold(799, 1000, 80)).toBe(false);
    expect(isAtThreshold(800, 1000, 80)).toBe(true);
    expect(isAtThreshold(801, 1000, 80)).toBe(true);
    expect(isAtThreshold(999, 1000, 100)).toBe(false);
    expect(isAtThreshold(1000, 1000, 100)).toBe(true);
    expect(isAtThreshold(1001, 1000, 100)).toBe(true);
    // Exact boundary on a small budget.
    expect(isAtThreshold(5, 10, 50)).toBe(true);
  });

  it('never treats an unconfigured budget as reached', () => {
    expect(isAtThreshold(0, 0, 80)).toBe(false);
    expect(isAtThreshold(1, 0, 80)).toBe(false);
    expect(isAtThreshold(Number.NaN, 1000, 80)).toBe(false);
  });

  it('decides the crossing on the raw comparison, not on display rounding', () => {
    // 3 * 33 / 100 = 0.99, so 1 token is already at the threshold. Percentage DISPLAY
    // rounding (33%) must never decide the crossing; the raw comparison is the contract
    // (plan 09 colours on this same comparison and only rounds for display).
    expect(isAtThreshold(1, 3, 33)).toBe(true);
  });
});
