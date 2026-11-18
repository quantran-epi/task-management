import {
  createChatTurnRuntime,
  type ChatTurnRuntime,
  type ChatTurnRuntimeDeps,
} from './chatTurnRuntime';

/** Host-side prelude abort controller (grounded routing / prompt assembly). */
export function createHostAbortController(): AbortController {
  return new AbortController();
}

export interface TabTurnRegistry {
  /** Same instance for the same tab, so an in-flight turn survives re-render and tab switches. */
  get(tabId: string, threadId: string): ChatTurnRuntime;
  peek(tabId: string): ChatTurnRuntime | undefined;
  /** Aborts the tab's runtime and drops it, so the next `get` starts clean. */
  discard(tabId: string): void;
  abortTab(tabId: string): void;
  abortAll(): void;
  getSnapshot(): Readonly<Record<string, ChatTurnRuntime>>;
}

/**
 * Ref-backed registry of one `createChatTurnRuntime` per chat tab.
 * One tab's turn never aborts another tab's turn (T-25.3-35).
 */
export function createTabTurnRegistry(
  createDeps: (tabId: string, threadId: string) => ChatTurnRuntimeDeps
): TabTurnRegistry {
  const entries = new Map<string, { threadId: string; runtime: ChatTurnRuntime }>();

  return {
    get(tabId, threadId) {
      const existing = entries.get(tabId);
      if (existing && existing.threadId === threadId) return existing.runtime;
      if (existing) existing.runtime.abort();
      const runtime = createChatTurnRuntime(createDeps(tabId, threadId));
      entries.set(tabId, { threadId, runtime });
      return runtime;
    },
    peek(tabId) {
      return entries.get(tabId)?.runtime;
    },
    discard(tabId) {
      const existing = entries.get(tabId);
      if (!existing) return;
      existing.runtime.abort();
      entries.delete(tabId);
    },
    abortTab(tabId) {
      entries.get(tabId)?.runtime.abort();
    },
    abortAll() {
      for (const entry of entries.values()) entry.runtime.abort();
    },
    getSnapshot() {
      return Object.fromEntries([...entries].map(([tabId, entry]) => [tabId, entry.runtime]));
    },
  };
}
