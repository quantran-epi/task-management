import { useCallback, useEffect, useMemo, useState } from 'react';
import { createTabRuntime, type TabRuntime, type TabRuntimePatch } from './tabTypes';

export interface TabRuntimeRegistry {
  get(tabId: string, threadId?: string): TabRuntime | undefined;
  initialize(tabId: string, threadId: string): TabRuntime;
  patch(tabId: string, patch: TabRuntimePatch, threadId?: string): TabRuntime | undefined;
  reset(tabId: string, threadId: string): TabRuntime;
  discard(tabId: string): void;
  /** Live read of every runtime, for cleanup paths that must not depend on render state. */
  getSnapshot(): Readonly<Record<string, TabRuntime>>;
  snapshot: Readonly<Record<string, TabRuntime>>;
}

// Module-level store so tab runtimes survive drawer unmounts and view navigation
const globalRuntimes = new Map<string, TabRuntime>();
const globalListeners = new Set<() => void>();

function notifyListeners() {
  globalListeners.forEach((listener) => {
    try {
      listener();
    } catch (err) {
      console.error('[useTabRuntimes] Listener error:', err);
    }
  });
}

export function useTabRuntimes(): TabRuntimeRegistry {
  const [snapshot, setSnapshot] = useState<Record<string, TabRuntime>>(() =>
    Object.fromEntries(globalRuntimes)
  );

  useEffect(() => {
    const listener = () => {
      setSnapshot(Object.fromEntries(globalRuntimes));
    };
    globalListeners.add(listener);
    // Sync immediately in case state changed before subscription attached
    listener();
    return () => {
      globalListeners.delete(listener);
    };
  }, []);

  const ensure = useCallback((tabId: string, threadId: string) => {
    const current = globalRuntimes.get(tabId);
    if (!current) {
      const next = createTabRuntime(tabId, threadId);
      globalRuntimes.set(tabId, next);
      return next;
    }
    if (current.threadId !== threadId) {
      const next = { ...current, threadId };
      globalRuntimes.set(tabId, next);
      return next;
    }
    return current;
  }, []);

  const get = useCallback((tabId: string, threadId?: string) => {
    const runtime = globalRuntimes.get(tabId);
    return runtime && (!threadId || runtime.threadId === threadId) ? runtime : undefined;
  }, []);

  const patch = useCallback((tabId: string, patchValue: TabRuntimePatch, threadId?: string) => {
    const runtime = globalRuntimes.get(tabId);
    if (!runtime || (threadId && runtime.threadId !== threadId)) return runtime;
    const next = { ...runtime, ...patchValue };
    globalRuntimes.set(tabId, next);
    notifyListeners();
    return next;
  }, []);

  const initialize = useCallback((tabId: string, threadId: string) => {
    const current = globalRuntimes.get(tabId);
    const runtime = ensure(tabId, threadId);
    if (current !== runtime) notifyListeners();
    return runtime;
  }, [ensure]);

  const reset = useCallback((tabId: string, threadId: string) => {
    const next = createTabRuntime(tabId, threadId);
    globalRuntimes.set(tabId, next);
    notifyListeners();
    return next;
  }, []);

  const discard = useCallback((tabId: string) => {
    if (!globalRuntimes.delete(tabId)) return;
    notifyListeners();
  }, []);

  const getSnapshot = useCallback(() => Object.fromEntries(globalRuntimes), []);

  return useMemo(
    () => ({ get, initialize, patch, reset, discard, getSnapshot, snapshot }),
    [discard, get, getSnapshot, initialize, patch, reset, snapshot]
  );
}
