import {
  DEFAULT_BUDGET_WARN_THRESHOLD_PCT,
  clampBudgetWarnThresholdPct,
} from '../../../types/aiOffice';
import type { ChatTokenUsage } from '../../../types/models';

/**
 * Budget threshold math (D-01/D-02, D-04/D-05, D-09).
 *
 * The budget surface is warning-only: `splitUsage`, `resolveThresholdPct` and
 * `isAtThreshold` compute numbers and never refuse a call, never park a turn and never
 * throw. The legacy `BudgetGate` below is the old parking gate; it is still called from
 * `beforeToolRoundFor` and is deleted — implementation, call sites and tests — by plan 08.
 * This intermediate tree is NOT gate-free yet.
 *
 * Usage policy (RESEARCH §Usage policy), written down here because this is where the code
 * that enforces it lives:
 *
 * 1. Reported usage wins. If the provider reported any `usage` for a round, that number is
 *    authoritative for that round; estimates are never mixed in (D-08).
 * 2. Input and output are both charged, always, for every request — including every tool
 *    round inside one turn.
 * 3. Cache tokens count as normal tokens (D-09):
 *    `inputTokens = promptTokens + cacheReadTokens + cacheCreationTokens`.
 * 4. No usage → estimate, always, never zero (D-10); the estimator, not `splitUsage`,
 *    decides when a zero must be replaced.
 * 5. Total-without-split → charge the whole total to input and set `splitInferred: true`:
 *    a provider that returns only `total_tokens` cannot be split honestly, and
 *    under-charging output is the worse error for a hard budget.
 * 6. Aborted streams are charged (D-12): reported usage if present, else an estimate.
 * 7. Retries and failures are charged per attempt (D-11); a failed attempt is not free.
 * 8. Deltas, not totals, reach the ledger — the coordinator converts the runtime's
 *    cumulative per-turn total into a delta against a per-turn baseline.
 */
export interface BudgetGate {
  close(): void;
  open(): void;
  isClosed(): boolean;
  wait(signal?: AbortSignal): Promise<void>;
}

export function createBudgetGate(): BudgetGate {
  let closed = false;
  // A single resolver slot dropped the earlier waiter when two turns parked on the same
  // closed gate, stranding it forever. Release every waiter instead.
  let resolvers = new Set<() => void>();

  const release = () => {
    const pending = resolvers;
    resolvers = new Set();
    for (const resolve of pending) resolve();
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
        let settled = false;
        const onAbort = () => {
          if (settled) return;
          settled = true;
          resolvers.delete(releaseOne);
          reject(new DOMException('Aborted', 'AbortError'));
        };
        // `once` keeps a long-lived turn signal from accumulating listeners across rounds.
        signal?.addEventListener('abort', onAbort, { once: true });
        const releaseOne = () => {
          if (settled) return;
          settled = true;
          signal?.removeEventListener('abort', onAbort);
          resolve();
        };
        resolvers.add(releaseOne);
      });
    },
  };
}

/**
 * D-20: tenths of the budget consumed. A zero (or negative) budget means "no budget
 * configured yet" — D-05 lets a group be created with a name alone — so it counts as
 * nothing consumed. Treating it as fully consumed closed the gate before the first turn
 * and parked every turn forever with no banner.
 */
export function bucketOf(used: number, budget: number): number {
  if (!Number.isFinite(budget) || budget <= 0) return 0;
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

export interface UsageSplit {
  inputTokens: number;
  outputTokens: number;
  /** Reserved for the estimator (D-10); this function never sets it. */
  estimated: boolean;
  /** The provider reported a total but no split, so the whole total is charged to input. */
  splitInferred: boolean;
}

/**
 * D-09: keep the input/output split instead of collapsing it to one total. Cache tokens are
 * charged as input. A total-only report is charged entirely to input and flagged — never
 * dropped — because under-charging output is the worse error for a hard budget. An empty
 * report is all zeros with `estimated: false`; the estimator decides when to replace a zero.
 */
export function splitUsage(usage: ChatTokenUsage): UsageSplit {
  const input =
    (usage.promptTokens ?? 0) + (usage.cacheReadTokens ?? 0) + (usage.cacheCreationTokens ?? 0);
  const output = usage.completionTokens ?? 0;
  if (input + output > 0) {
    return { inputTokens: input, outputTokens: output, estimated: false, splitInferred: false };
  }
  if (typeof usage.totalTokens === 'number' && usage.totalTokens > 0) {
    return {
      inputTokens: usage.totalTokens,
      outputTokens: 0,
      estimated: false,
      splitInferred: true,
    };
  }
  return { inputTokens: 0, outputTokens: 0, estimated: false, splitInferred: false };
}

/**
 * D-04/D-05: the per-team override wins over the global default, and an absent override
 * inherits rather than materializing a value. Every branch rounds and clamps into 1..100
 * (T-38-11), so a hand-edited backup cannot disable or invert the warning.
 */
export function resolveThresholdPct(
  team: { budgetWarnThresholdPct?: number | undefined },
  globalPct: number | undefined
): number {
  const teamPct = team.budgetWarnThresholdPct;
  if (typeof teamPct === 'number' && Number.isFinite(teamPct) && inBand(teamPct)) {
    return Math.round(teamPct);
  }
  if (typeof globalPct === 'number' && Number.isFinite(globalPct) && inBand(globalPct)) {
    return Math.round(globalPct);
  }
  return DEFAULT_BUDGET_WARN_THRESHOLD_PCT;
}

function inBand(pct: number): boolean {
  const rounded = Math.round(pct);
  return rounded >= 1 && rounded <= 100;
}

/**
 * The crossing rule, inclusive at the boundary: `used >= budget * pct / 100` on the raw
 * numbers. Percentage *display* rounding must never decide the crossing — callers round for
 * display only. A zero (or non-finite) budget is never "reached": a group may exist with no
 * budget yet (D-05), and that must not raise a warning.
 */
export function isAtThreshold(used: number, budget: number, pct: number): boolean {
  if (!Number.isFinite(budget) || budget <= 0) return false;
  if (!Number.isFinite(used)) return false;
  return used >= (budget * pct) / 100;
}

/**
 * D-04: the setter's whole rule, pure. `undefined` means "inherit the global default" and is
 * the ONLY clear mechanism — no separate clear path. `null` never reaches here; the drawer's
 * `null` is normalized to `undefined` at the save boundary. `current` is part of the
 * signature so the rule reads as a transition, not a bare clamp.
 */
export function nextThresholdOverride(
  _current: number | undefined,
  input: number | undefined
): number | undefined {
  return input === undefined ? undefined : clampBudgetWarnThresholdPct(input);
}
