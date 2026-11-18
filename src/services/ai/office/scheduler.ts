import { clampTeamConcurrency } from '../../../types/aiOffice';

/**
 * Per-team run scheduler (Phase 37, D-01/D-04/D-05/D-07/D-08, AIO-RUNTIME-05).
 *
 * Hand-written on purpose (D-07): no queue or mutex dependency is added. The whole
 * contract is "admit in plan order, release idempotently, honour a live limit".
 *
 * The park mirrors `budgetGate.ts:44-60`: the waiter (and its abort listener) is installed
 * before anything is published, the listener is `{ once: true }`, and an already-aborted
 * signal rejects immediately instead of parking forever (T-37-05).
 *
 * D-08: this module holds NO assignment state. It queues opaque waiters and owns slots;
 * the caller reads the ledger for the truth about what is queued or running.
 */
export interface SchedulerHandle {
  /** Unique per admission; never reused, so a stale handle can never free a live slot. */
  readonly slot: number;
}

export interface TeamRunScheduler {
  /**
   * Resolves once a slot is free. `signal` is REQUIRED and is the only cancellation
   * channel for a *queued* assignment: aborting it removes the waiter and rejects with
   * `AbortError`, so a caller that may need to cancel while parked owns a per-assignment
   * `AbortController` and hands its signal here. `cancel(handle)` cannot do that job —
   * it only accepts a handle `acquire` has already returned.
   */
  acquire(signal: AbortSignal): Promise<SchedulerHandle>;
  /** Idempotent: a second release of the same handle is a no-op. */
  release(handle: SchedulerHandle): void;
  /**
   * Release-equivalent, NOT a queue-cancel: there is no handle before admission, so a
   * queued acquire is cancelled by aborting its signal. Never use this to stop a parked
   * acquire — it would leave the acquire parked forever.
   */
  cancel(handle: SchedulerHandle): void;
  /** D-04: raising admits queued waiters FIFO; lowering preempts nothing. */
  setLimit(limit: number): void;
  getLimit(): number;
  getRunningCount(): number;
  getQueuedCount(): number;
}

interface Waiter {
  resolve: (handle: SchedulerHandle) => void;
  reject: (error: unknown) => void;
  signal: AbortSignal;
  onAbort: () => void;
}

export function createTeamRunScheduler(initialLimit: number): TeamRunScheduler {
  let limit = clampTeamConcurrency(initialLimit);
  const running = new Set<number>();
  const waiters: Waiter[] = [];
  /** Monotonic, never reused — makes a double release provably inert. */
  let nextSlot = 0;

  const admit = (): SchedulerHandle => {
    const handle: SchedulerHandle = { slot: nextSlot };
    nextSlot += 1;
    running.add(handle.slot);
    return handle;
  };

  /** FIFO drain: offer the freed slot to the oldest waiter first (D-05). */
  const drain = (): void => {
    while (running.size < limit) {
      const waiter = waiters.shift();
      if (!waiter) return;
      waiter.signal.removeEventListener('abort', waiter.onAbort);
      waiter.resolve(admit());
    }
  };

  const release = (handle: SchedulerHandle): void => {
    if (!running.delete(handle.slot)) return;
    drain();
  };

  return {
    acquire(signal: AbortSignal): Promise<SchedulerHandle> {
      if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
      if (running.size < limit) return Promise.resolve(admit());

      return new Promise<SchedulerHandle>((resolve, reject) => {
        const waiter: Waiter = {
          resolve,
          reject,
          signal,
          onAbort: () => {
            const index = waiters.indexOf(waiter);
            if (index !== -1) waiters.splice(index, 1);
            reject(new DOMException('Aborted', 'AbortError'));
          },
        };
        // Installed before the push, so a synchronous abort cannot lose the waiter.
        signal.addEventListener('abort', waiter.onAbort, { once: true });
        waiters.push(waiter);
      });
    },
    release,
    cancel(handle: SchedulerHandle): void {
      release(handle);
    },
    setLimit(next: number): void {
      limit = clampTeamConcurrency(next);
      drain();
    },
    getLimit(): number {
      return limit;
    },
    getRunningCount(): number {
      return running.size;
    },
    getQueuedCount(): number {
      return waiters.length;
    },
  };
}
