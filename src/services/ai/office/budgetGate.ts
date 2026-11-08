import type { ChatTokenUsage } from '../../../types/models';

/**
 * Budget gate (D-20, D-21).
 *
 * The coordinator awaits `wait(signal)` at every tool-round boundary. While the team's
 * budget is under the pause threshold the gate is open and the await resolves instantly;
 * when the 80% crossing is detected the coordinator closes it, and the turn parks here
 * instead of continuing to spend. `open()` (the user's "continue" / top-up) releases it.
 *
 * The park copies the approval park in `chatTurnRuntime.ts:371-403`: the resolver slot is
 * installed before anything is published, so a synchronous subscriber cannot lose the
 * release. It also copies the abort path at `:189-196` — a parked turn must never hang
 * after Stop (Pitfall 8, T-34-19).
 */
export interface BudgetGate {
  close(): void;
  open(): void;
  isClosed(): boolean;
  wait(signal?: AbortSignal): Promise<void>;
}

export function createBudgetGate(): BudgetGate {
  let closed = false;
  let resolver: (() => void) | null = null;

  const release = () => {
    const pending = resolver;
    resolver = null;
    pending?.();
  };

  return {
    close() {
      closed = true;
    },
    open() {
      closed = false;
      release();
    },
    isClosed() {
      return closed;
    },
    wait(signal?: AbortSignal) {
      if (!closed) return Promise.resolve();
      if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));

      return new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          resolver = null;
          reject(new DOMException('Aborted', 'AbortError'));
        };
        // `once` keeps a long-lived turn signal from accumulating listeners across rounds.
        signal?.addEventListener('abort', onAbort, { once: true });
        resolver = () => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        };
      });
    },
  };
}

/**
 * D-20: tenths of the budget consumed. A zero (or negative) budget counts as fully
 * consumed rather than dividing by zero.
 */
export function bucketOf(used: number, budget: number): number {
  if (!Number.isFinite(budget) || budget <= 0) return 10;
  if (!Number.isFinite(used) || used <= 0) return 0;
  return Math.floor((used / budget) * 10);
}

/**
 * The whole crossing rule with zero stored state: notify when this observation is at or
 * past the 80% bucket and the previous one was below it. After a top-up the budget grows,
 * the bucket drops below 8, and the next crossing notifies again.
 */
export function shouldNotifyPause(previousBucket: number, currentBucket: number): boolean {
  return currentBucket >= 8 && previousBucket < 8;
}

/** Some providers omit `total_tokens`; sum the parts when it is absent. */
export function normalizeUsageTotal(usage: ChatTokenUsage): number {
  return usage.totalTokens ?? (usage.promptTokens ?? 0) + (usage.completionTokens ?? 0);
}
