import { useSyncExternalStore } from 'react';

/** One holder record. `key` is stable across updates; `updatedAt` changes on every mutation. */
export interface ImperativeRecord<T> {
  key: string;
  payload: T;
  updatedAt: number;
}

export interface ImperativeChannel<T> {
  subscribe(listener: () => void): () => void;
  getSnapshot(): readonly ImperativeRecord<T>[];
  push(payload: T, key?: string): ImperativeRecord<T>;
  update(key: string, patch: Partial<T>): void;
  remove(key: string): void;
  clear(): void;
}

/**
 * External store for imperative holders (message, notification, modal.confirm).
 * Each holder owns its own channel; no module-level singleton, nothing persisted.
 */
export function createImperativeChannel<T>(): ImperativeChannel<T> {
  const listeners = new Set<() => void>();
  const records = new Map<string, ImperativeRecord<T>>();
  let snapshot: readonly ImperativeRecord<T>[] = [];

  const emit = () => {
    snapshot = [...records.values()];
    for (const listener of listeners) listener();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      return snapshot;
    },
    push(payload, key) {
      const recordKey = key ?? crypto.randomUUID();
      const existing = records.get(recordKey);
      const record: ImperativeRecord<T> = {
        key: recordKey,
        payload: existing
          ? { ...existing.payload, ...payload }
          : payload,
        updatedAt: Date.now(),
      };
      records.set(recordKey, record);
      emit();
      return record;
    },
    update(key, patch) {
      const existing = records.get(key);
      if (!existing) return;
      records.set(key, {
        ...existing,
        payload: { ...existing.payload, ...patch },
        updatedAt: Date.now(),
      });
      emit();
    },
    remove(key) {
      if (!records.delete(key)) return;
      emit();
    },
    clear() {
      if (records.size === 0) return;
      records.clear();
      emit();
    },
  };
}

/** Subscribe a component to a holder channel with React's external-store hook. */
export function useImperativeChannel<T>(channel: ImperativeChannel<T>): readonly ImperativeRecord<T>[] {
  return useSyncExternalStore(channel.subscribe, channel.getSnapshot, channel.getSnapshot);
}
