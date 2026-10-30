import { useCallback, useEffect, useRef, useState } from 'react';
import { createTabRuntime, type TabRuntime, type TabRuntimePatch } from './tabTypes';

export interface TabRuntimeRegistry {
  get(tabId: string, threadId?: string): TabRuntime;
  initialize(tabId: string, threadId: string): TabRuntime;
  patch(tabId: string, patch: TabRuntimePatch): TabRuntime;
  reset(tabId: string, threadId?: string): TabRuntime;
  discard(tabId: string): void;
  snapshot: Readonly<Record<string, TabRuntime>>;
}

export function useTabRuntimes(): TabRuntimeRegistry {
  const runtimesRef = useRef(new Map<string, TabRuntime>());
  const [snapshot, setSnapshot] = useState<Record<string, TabRuntime>>({});

  const publish = useCallback(() => {
    setSnapshot(Object.fromEntries(runtimesRef.current));
  }, []);

  const ensure = useCallback((tabId: string, threadId = '') => {
    let runtime = runtimesRef.current.get(tabId);
    if (!runtime) {
      runtime = createTabRuntime(tabId, threadId);
      runtimesRef.current.set(tabId, runtime);
    } else if (threadId && runtime.threadId !== threadId) {
      runtime = { ...runtime, threadId };
      runtimesRef.current.set(tabId, runtime);
    }
    return runtime;
  }, []);

  useEffect(() => {
    if (runtimesRef.current.size > 0) publish();
  }, [publish]);

  const get = useCallback((tabId: string, threadId = '') => {
    return runtimesRef.current.get(tabId) ?? createTabRuntime(tabId, threadId);
  }, []);

  const patch = useCallback((tabId: string, patchValue: TabRuntimePatch) => {
    const runtime = ensure(tabId);
    const next = { ...runtime, ...patchValue };
    runtimesRef.current.set(tabId, next);
    publish();
    return next;
  }, [ensure, publish]);

  const initialize = useCallback((tabId: string, threadId: string) => {
    const runtime = ensure(tabId, threadId);
    publish();
    return runtime;
  }, [ensure, publish]);

  const reset = useCallback((tabId: string, threadId = '') => {
    const next = createTabRuntime(tabId, threadId);
    runtimesRef.current.set(tabId, next);
    publish();
    return next;
  }, [publish]);

  const discard = useCallback((tabId: string) => {
    runtimesRef.current.delete(tabId);
    publish();
  }, [publish]);

  return { get, initialize, patch, reset, discard, snapshot };
}
