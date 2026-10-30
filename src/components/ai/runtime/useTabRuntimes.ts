import { useCallback, useMemo, useRef, useState } from 'react';
import { createTabRuntime, type TabRuntime, type TabRuntimePatch } from './tabTypes';

export interface TabRuntimeRegistry {
  get(tabId: string, threadId?: string): TabRuntime | undefined;
  initialize(tabId: string, threadId: string): TabRuntime;
  patch(tabId: string, patch: TabRuntimePatch, threadId?: string): TabRuntime | undefined;
  reset(tabId: string, threadId: string): TabRuntime;
  discard(tabId: string): void;
  snapshot: Readonly<Record<string, TabRuntime>>;
}

export function useTabRuntimes(): TabRuntimeRegistry {
  const runtimesRef = useRef(new Map<string, TabRuntime>());
  const [snapshot, setSnapshot] = useState<Record<string, TabRuntime>>({});

  const publish = useCallback(() => {
    setSnapshot(Object.fromEntries(runtimesRef.current));
  }, []);

  const ensure = useCallback((tabId: string, threadId: string) => {
    const current = runtimesRef.current.get(tabId);
    if (!current) {
      const next = createTabRuntime(tabId, threadId);
      runtimesRef.current.set(tabId, next);
      return next;
    }
    if (current.threadId !== threadId) {
      const next = { ...current, threadId };
      runtimesRef.current.set(tabId, next);
      return next;
    }
    return current;
  }, []);

  const get = useCallback((tabId: string, threadId?: string) => {
    const runtime = runtimesRef.current.get(tabId);
    return runtime && (!threadId || runtime.threadId === threadId) ? runtime : undefined;
  }, []);

  const patch = useCallback((tabId: string, patchValue: TabRuntimePatch, threadId?: string) => {
    const runtime = runtimesRef.current.get(tabId);
    if (!runtime || (threadId && runtime.threadId !== threadId)) return runtime;
    const next = { ...runtime, ...patchValue };
    runtimesRef.current.set(tabId, next);
    publish();
    return next;
  }, [publish]);

  const initialize = useCallback((tabId: string, threadId: string) => {
    const current = runtimesRef.current.get(tabId);
    const runtime = ensure(tabId, threadId);
    if (current !== runtime) publish();
    return runtime;
  }, [ensure, publish]);

  const reset = useCallback((tabId: string, threadId: string) => {
    const next = createTabRuntime(tabId, threadId);
    runtimesRef.current.set(tabId, next);
    publish();
    return next;
  }, [publish]);

  const discard = useCallback((tabId: string) => {
    if (!runtimesRef.current.delete(tabId)) return;
    publish();
  }, [publish]);

  return useMemo(() => ({ get, initialize, patch, reset, discard, snapshot }), [discard, get, initialize, patch, reset, snapshot]);
}
