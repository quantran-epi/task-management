import {
  createChatTurnRuntime,
  type ChatTurnRuntime,
  type ChatTurnRuntimeDeps,
} from '../../../components/ai/runtime/chatTurnRuntime';

/**
 * One `ChatTurnRuntime` per agent (D-02, D-14).
 *
 * `ChatTurnRuntime.start()` throws `TURN_IN_PROGRESS` on a second concurrent call, so true
 * batch concurrency requires one instance per agent (Pitfall 1). Keyed by `agentId` only:
 * one team run owns one registry, so there is no thread churn to reconcile.
 *
 * Shape copied from `tabRuntimes.ts:27-60`, not imported — that registry is keyed by
 * `(tabId, threadId)` and its `get` takes two arguments.
 */
export interface TeamRunRegistry {
  get(agentId: string): ChatTurnRuntime;
  peek(agentId: string): ChatTurnRuntime | undefined;
  /** Per-agent Stop (D-14). */
  abort(agentId: string): void;
  /** Global Stop (D-14). */
  abortAll(): void;
  /** Teardown: abort and drop every entry. */
  clear(): void;
  getSnapshot(): Readonly<Record<string, ChatTurnRuntime>>;
}

export function createTeamRunRegistry(
  createDeps: (agentId: string) => ChatTurnRuntimeDeps
): TeamRunRegistry {
  const entries = new Map<string, ChatTurnRuntime>();

  return {
    get(agentId) {
      const existing = entries.get(agentId);
      if (existing) return existing;
      const runtime = createChatTurnRuntime(createDeps(agentId));
      entries.set(agentId, runtime);
      return runtime;
    },
    peek(agentId) {
      return entries.get(agentId);
    },
    abort(agentId) {
      entries.get(agentId)?.abort();
    },
    abortAll() {
      for (const runtime of entries.values()) runtime.abort();
    },
    clear() {
      for (const runtime of entries.values()) runtime.abort();
      entries.clear();
    },
    getSnapshot() {
      return Object.fromEntries(entries);
    },
  };
}
