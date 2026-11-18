/**
 * Module-level store of live tool task snapshots. Lives outside React so closing a chat
 * tab / unmounting the drawer cannot drop the output or the cancel button: the view can
 * re-subscribe and immediately read the last snapshot by callId.
 *
 * Ownership split (architect-approved design):
 * - Rust ToolTaskRegistry owns liveness (cancel token, PID).
 * - This store owns the last output snapshot while a task runs (survives unmount).
 * - useTabRuntimes owns the per-tab draft/status tool events.
 * - React is a pure view.
 */

export const MAX_LIVE_STEPS = 200;
const FLUSH_INTERVAL_MS = 50;

export interface ToolTaskSnapshot {
  callId: string;
  status: 'running' | 'done' | 'cancelled' | 'error';
  stdout: string;
  stderr: string;
  finishReason?: string | undefined;
  updatedAt: number;
}

type Listener = () => void;

const snapshots = new Map<string, ToolTaskSnapshot>();
const listeners = new Set<Listener>();
// Global ring buffer of call ids, capped so the activity rail can never grow without bound.
const liveOrder: string[] = [];
/** Cached array snapshot: stable identity between updates for useSyncExternalStore. */
let orderedSnapshot: readonly ToolTaskSnapshot[] = [];

function rebuildOrderedSnapshot(): void {
  const next: ToolTaskSnapshot[] = [];
  for (const callId of liveOrder) {
    const snapshot = snapshots.get(callId);
    if (snapshot) next.push(snapshot);
  }
  orderedSnapshot = next;
}

/** Stable-identity list for React views. Do not mutate the returned array. */
export function getOrderedToolTasks(): readonly ToolTaskSnapshot[] {
  return orderedSnapshot;
}

let flushTimer: ReturnType<typeof setTimeout> | null = null;
let attached = false;
let detachFn: (() => void) | null = null;

function notify(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (err) {
      console.error('[toolTaskStore] listener error', err);
    }
  });
}

function scheduleFlush(): void {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    notify();
  }, FLUSH_INTERVAL_MS);
}

export function upsertToolTask(patch: Partial<ToolTaskSnapshot> & { callId: string }): void {
  const current = snapshots.get(patch.callId);
  const next: ToolTaskSnapshot = {
    callId: patch.callId,
    status: patch.status ?? current?.status ?? 'running',
    stdout: patch.stdout ?? current?.stdout ?? '',
    stderr: patch.stderr ?? current?.stderr ?? '',
    ...(patch.finishReason !== undefined || current?.finishReason !== undefined
      ? { finishReason: patch.finishReason ?? current?.finishReason }
      : {}),
    updatedAt: Date.now(),
  };
  if (!current) {
    liveOrder.push(patch.callId);
  } else {
    // An existing call being updated is the most recent activity: move it to the end so a
    // running task can never be evicted by a burst of older statuses.
    const idx = liveOrder.indexOf(patch.callId);
    if (idx >= 0) {
      liveOrder.splice(idx, 1);
      liveOrder.push(patch.callId);
    } else {
      liveOrder.push(patch.callId);
    }
  }
  while (liveOrder.length > MAX_LIVE_STEPS) {
    const dropped = liveOrder.shift();
    if (dropped) snapshots.delete(dropped);
  }
  snapshots.set(patch.callId, next);
  // Keep the cached snapshot identity fresh immediately; notify is still throttled.
  rebuildOrderedSnapshot();
  scheduleFlush();
}

/**
 * Id-keyed bounded append for per-tab tool events. A result event replaces the call event
 * with the same id instead of adding a second row, and the list never exceeds MAX_LIVE_STEPS.
 */
export function capToolEvents<T extends { id: string }>(events: readonly T[], event: T): T[] {
  const withoutSameId = events.filter((e) => e.id !== event.id);
  const next = [...withoutSameId, event];
  return next.length > MAX_LIVE_STEPS ? next.slice(-MAX_LIVE_STEPS) : next;
}

export function getToolTask(callId: string): ToolTaskSnapshot | undefined {
  return snapshots.get(callId);
}

export function getToolTaskSnapshot(): ReadonlyMap<string, ToolTaskSnapshot> {
  return snapshots;
}

export function subscribeToolTasks(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Append a bounded chunk to a task's output (coalesced by the 50ms flush). */
export function appendToolTaskOutput(callId: string, stream: 'stdout' | 'stderr', text: string): void {
  const current = snapshots.get(callId);
  const key = stream === 'stdout' ? 'stdout' : 'stderr';
  const prev = current?.[key] ?? '';
  // Cap each buffer so a chatty command cannot grow the store without bound.
  const merged = (prev + text).slice(-MAX_OUTPUT_CHARS);
  upsertToolTask({ callId, [key]: merged });
}

const MAX_OUTPUT_CHARS = 64_000;

export interface TauriEventLike {
  listen: (
    event: string,
    handler: (event: { payload: unknown }) => void
  ) => Promise<() => void>;
}

/**
 * Register ONE global Tauri listener for the app lifetime. Idempotent: repeated calls
 * from multiple mounts reuse the same subscription. Call the returned disposer only on
 * true app teardown (not on drawer/tab unmount).
 */
export async function attachGlobalToolTaskListener(
  listen: TauriEventLike['listen']
): Promise<() => void> {
  if (attached && detachFn) return detachFn;
  attached = true;

  const unlistenUpdate = await listen('tool-task-update', (evt) => {
    const payload = evt.payload as { callId?: string; stream?: string; text?: string };
    if (!payload?.callId || typeof payload.text !== 'string') return;
    appendToolTaskOutput(
      payload.callId,
      payload.stream === 'stderr' ? 'stderr' : 'stdout',
      payload.text
    );
  });

  const unlistenStatus = await listen('tool-task-status', (evt) => {
    const payload = evt.payload as {
      callId?: string;
      status?: string;
      finishReason?: string;
    };
    if (!payload?.callId || !payload.status) return;
    const status = (['running', 'done', 'cancelled', 'error'] as const).includes(payload.status as any)
      ? (payload.status as ToolTaskSnapshot['status'])
      : 'running';
    upsertToolTask({
      callId: payload.callId,
      status,
      ...(payload.finishReason ? { finishReason: payload.finishReason } : {}),
    });
  });

  detachFn = () => {
    unlistenUpdate();
    unlistenStatus();
    listeners.clear();
    snapshots.clear();
    liveOrder.length = 0;
    rebuildOrderedSnapshot();
    attached = false;
    detachFn = null;
  };
  return detachFn;
}

/** Test helper: reset module state between cases. Not used in production. */
export function resetToolTaskStoreForTests(): void {
  listeners.clear();
  snapshots.clear();
  liveOrder.length = 0;
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  attached = false;
  detachFn = null;
}
