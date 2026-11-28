import { useEffect, useSyncExternalStore } from 'react';

/**
 * Module-level tick store. The 1s ticker lives here instead of TimerContext so
 * a tick only re-renders hooks that actually display elapsed time.
 */
let tick = 0;
const listeners = new Set<() => void>();
let intervalId: number | null = null;
let tickerUsers = 0;

function emitTick(): void {
  tick += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): number {
  return tick;
}

export function useTimerTick(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Mount once (in TimerProvider) to receive timer sync from other windows. */
export function useTimerSyncListener(channelName: string): void {
  useEffect(() => listenForTimerSync(channelName), [channelName]);
}

/** Test-only: drop cached channel so a fresh one is created on next subscribe. */
export function resetTimerSyncChannel(): void {
  syncChannel?.close();
  syncChannel = undefined;
}

/** Cross-window timer sync only bumps the store, never provider state. */
export function notifyTimerTick(): void {
  emitTick();
}

/**
 * Module-level BroadcastChannel listener used by every TimerProvider window.
 * Messages from other windows bump only the tick store.
 */
let syncChannel: BroadcastChannel | null | undefined;
let syncUsers = 0;
export function listenForTimerSync(channelName: string): () => void {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return () => {};
  syncUsers += 1;
  if (syncChannel === undefined) {
    try {
      syncChannel = new BroadcastChannel(channelName);
      syncChannel.onmessage = () => emitTick();
    } catch {
      syncChannel = null;
    }
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    syncUsers -= 1;
    if (syncUsers === 0) {
      syncChannel?.close();
      syncChannel = undefined;
    }
  };
}

/**
 * Refcounted 1s ticker. TimerProvider acquires it while any timer runs;
 * all windows/hooks share one interval.
 */
export function acquireTimerTicker(): () => void {
  tickerUsers += 1;
  if (intervalId === null) {
    intervalId = window.setInterval(emitTick, 1000);
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    tickerUsers -= 1;
    if (tickerUsers === 0 && intervalId !== null) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
  };
}
