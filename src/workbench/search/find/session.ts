import type { RemoteGrepHit } from '../../../types/gitRemote';

/**
 * One parsed grep stream — exactly the shape `grepRemoteRef` returns. Hits are committed
 * verbatim (already-parsed records); no raw stdout and no highlight ranges live at this layer.
 */
export interface GrepResult {
  hits: RemoteGrepHit[];
  truncated: boolean;
}

/** Query contract shared with plan 02. User strings stay DATA; no shell command is built here. */
export interface RemoteQuery {
  pattern: string;
  mode: 'content' | 'files' | 'folders';
  scope: 'whole-ref' | 'directory';
  directory?: string | undefined;
  mask?: string | undefined;
  matchCase: boolean;
  words: boolean;
  regex: boolean;
}

/** D-10 result cap. The 150 ms debounce itself lives in the component (plan 02). */
export const FIND_MATCH_LIMIT = 2000;
export const FIND_DEBOUNCE_MS = 150;

/** Single-source status copy from UI-SPEC "Copywriting Contract" — no inline literals in UI. */
export const FIND_STATUS_COPY = {
  searching: 'Searching…',
  stale: 'Results out of date — a newer search is running.',
  partial: 'Stopped — showing partial results.',
  truncated:
    'Showing the first 2,000 matches — results truncated. Narrow the pattern or file mask.',
  error: (reason: string): string =>
    `Search failed — ${reason}. Check the SSH connection and the selected ref, then retry.`,
  // UI-SPEC "Copywriting Contract" — single source for empty / preview states (D-08).
  emptyHeading: 'No matches',
  emptyBody: (pattern: string, repo: string, ref: string): string =>
    `No matches for \`${pattern}\` in \`${repo} / ${ref}\`. Try a different pattern, widen the file mask, or switch scope to "Toàn bộ nhánh".`,
  // WR-04: Files/Folders need a needle; with none typed, prompt instead of an unexplained list.
  emptyPrompt: 'Type to search files/folders.',
  previewUnavailable:
    'Preview unavailable for this binary or large file (>256 KB). Open full file.',
  openFullFile: 'Open full file',
} as const;

export type FindStatus = 'idle' | 'searching' | 'done' | 'error' | 'partial';

export interface FindState {
  status: FindStatus;
  /** A query change marks current results stale immediately; a committed response clears it. */
  stale: boolean;
  hits: RemoteGrepHit[];
  error: string | null;
  truncated: boolean;
}

const IDLE_STATE: FindState = {
  status: 'idle',
  stale: false,
  hits: [],
  error: null,
  truncated: false,
};

/**
 * Recognises the Tauri `cancel_tool_call` rejection, abort-style errors and the codebase's
 * `err.name === 'AbortError'` convention (AIChatDrawer / documentExport). The transport itself
 * is `cancelToolCall(callId)` — no second cancel path exists (Pitfall 8).
 */
export function isCancelledError(e: unknown): boolean {
  if (!e) return false;
  if (typeof e === 'object' && 'name' in e && (e as { name?: unknown }).name === 'AbortError') {
    return true;
  }
  const msg = e instanceof Error ? e.message : String(e);
  return /cancell?ed|abort(ed)?|cancel_tool_call/i.test(msg);
}

export function defaultErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export interface FindSessionDeps {
  start: (callId: string, remoteQuery: RemoteQuery) => Promise<GrepResult>;
  cancel: (callId: string) => Promise<void>;
  nextRequestId?: () => string;
  isCancelledError?: (e: unknown) => boolean;
  errorMessage?: (e: unknown) => string;
}

/**
 * Pure supersede-and-guard state machine (D-08). Every search bumps `seq`, marks current
 * results stale, cancels the prior request and issues a stable callId. A response whose seq
 * no longer matches is dropped, so a late run can never overwrite newer results. No React,
 * db or service imports — deps are injected and the UI wires cancel to `cancelRemoteCall`, which
 * delegates to the `cancelToolCall` transport.
 */
export class FindSession {
  private seq = 0;
  private callId: string | null = null;
  private state: FindState = IDLE_STATE;
  private readonly deps: Required<FindSessionDeps>;

  constructor(
    deps: FindSessionDeps,
    private readonly onChange?: (state: FindState) => void
  ) {
    this.deps = {
      ...deps,
      nextRequestId: deps.nextRequestId ?? (() => `find-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
      isCancelledError: deps.isCancelledError ?? isCancelledError,
      errorMessage: deps.errorMessage ?? defaultErrorMessage,
    };
  }

  getState(): FindState {
    return this.state;
  }

  /** Marks current results stale immediately without clearing hits. */
  invalidate(): void {
    this.emit({ ...this.state, stale: true });
  }

  async search(remoteQuery: RemoteQuery): Promise<void> {
    const seq = ++this.seq;
    this.invalidate();

    // Stop the prior SSH process and drop its eventual response via the seq guard above.
    const running = this.callId;
    if (running) void this.deps.cancel(running).catch(() => undefined);

    const callId = this.deps.nextRequestId();
    this.callId = callId;
    this.emit({ ...this.state, status: 'searching', stale: true, error: null });

    try {
      const result = await this.deps.start(callId, remoteQuery);
      if (seq !== this.seq) return; // stale response — never overwrite current results
      this.callId = null;
      this.emit({
        status: 'done',
        stale: false,
        hits: result.hits,
        truncated: result.truncated,
        error: null,
      });
    } catch (e) {
      if (seq !== this.seq) return; // a cancelled/superseded run's error is not our state
      this.callId = null;
      if (this.deps.isCancelledError(e)) {
        this.emit({ ...this.state, status: 'partial', stale: false, error: null });
      } else {
        this.emit({
          ...this.state,
          status: 'error',
          stale: false,
          error: FIND_STATUS_COPY.error(this.deps.errorMessage(e)),
        });
      }
    }
  }

  /** Stop: cancel the in-flight SSH call and keep the hits collected so far. Idempotent. */
  cancel(): void {
    const running = this.callId;
    if (!running) return; // nothing in flight (already resolved/cancelled) — no state clobber
    this.seq += 1; // make the in-flight response stale so it cannot commit after Stop
    this.callId = null;
    void this.deps.cancel(running).catch(() => undefined);
    this.emit({ ...this.state, status: 'partial', stale: false, error: null });
  }

  /**
   * WR-08: clear all results and cancel any in-flight call (e.g. the content Pattern was
   * emptied). Bumping seq makes a late response stale; emitting IDLE_STATE clears stale hits,
   * status and error together so nothing from the previous query can resurface.
   */
  reset(): void {
    this.seq += 1;
    const running = this.callId;
    this.callId = null;
    if (running) void this.deps.cancel(running).catch(() => undefined);
    this.emit(IDLE_STATE);
  }

  private emit(next: FindState): void {
    this.state = next;
    this.onChange?.(next);
  }
}
