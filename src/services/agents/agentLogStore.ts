import type { GhostDevStreamChunk } from '../../types/agent';
import { isTauriApp } from '../../utils/timerPopout';

export const MAX_STREAM_LINES = 2000;

const DB_NAME = 'PlannerMateAgentTerminalDB';
const DB_VERSION = 1;
const STORE_NAME = 'terminal_logs';

function openDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'taskId' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

const pendingSaves = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleSave(taskId: string, logs: GhostDevStreamChunk[]) {
  const existingTimer = pendingSaves.get(taskId);
  if (existingTimer) clearTimeout(existingTimer);

  const timer = setTimeout(async () => {
    pendingSaves.delete(taskId);
    try {
      const db = await openDb();
      if (!db) return;
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({ taskId, logs, updatedAt: new Date().toISOString() });
    } catch (err) {
      console.warn('[agentLogStore] Failed to save logs to IndexedDB:', err);
    }
  }, 400);

  pendingSaves.set(taskId, timer);
}

async function deleteFromDb(taskId: string) {
  try {
    const db = await openDb();
    if (!db) return;
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(taskId);
  } catch (err) {
    console.warn('[agentLogStore] Failed to delete logs from IndexedDB:', err);
  }
}

async function loadAllFromDb(): Promise<Map<string, GhostDevStreamChunk[]>> {
  const result = new Map<string, GhostDevStreamChunk[]>();
  try {
    const db = await openDb();
    if (!db) return result;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = req.result as Array<{ taskId: string; logs: GhostDevStreamChunk[] }>;
        if (Array.isArray(rows)) {
          rows.forEach((row) => {
            if (row.taskId && Array.isArray(row.logs)) {
              result.set(row.taskId, row.logs);
            }
          });
        }
        resolve(result);
      };
      req.onerror = () => resolve(result);
    });
  } catch {
    return result;
  }
}

export class AgentLogStore {
  private logsByTask = new Map<string, GhostDevStreamChunk[]>();
  private listeners = new Map<string, Set<(logs: GhostDevStreamChunk[]) => void>>();
  private initialized = false;
  private tauriListening = false;

  constructor() {
    void this.init();
    this.attachTauriListener();
  }

  public async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    const loaded = await loadAllFromDb();
    for (const [taskId, logs] of loaded.entries()) {
      if (!this.logsByTask.has(taskId)) {
        this.logsByTask.set(taskId, logs);
      }
    }
    for (const [taskId, subs] of this.listeners.entries()) {
      const current = this.logsByTask.get(taskId) || [];
      subs.forEach((cb) => cb([...current]));
    }
  }

  public getLogs(taskId: string | null): GhostDevStreamChunk[] {
    if (!taskId) return [];
    return this.logsByTask.get(taskId) || [];
  }

  public addChunk(chunk: GhostDevStreamChunk): void {
    const taskId = chunk.taskId;
    if (!taskId) return;

    let list = this.logsByTask.get(taskId);
    if (!list) {
      list = [];
      this.logsByTask.set(taskId, list);
    }

    list.push(chunk);
    if (list.length > MAX_STREAM_LINES) {
      list.splice(0, list.length - MAX_STREAM_LINES);
    }

    scheduleSave(taskId, list);

    const subs = this.listeners.get(taskId);
    if (subs && subs.size > 0) {
      const copy = [...list];
      subs.forEach((cb) => cb(copy));
    }
  }

  public clearLogs(taskId: string): void {
    this.logsByTask.set(taskId, []);
    scheduleSave(taskId, []);
    const subs = this.listeners.get(taskId);
    if (subs) {
      subs.forEach((cb) => cb([]));
    }
  }

  public deleteLogs(taskId: string): void {
    this.logsByTask.delete(taskId);
    void deleteFromDb(taskId);
    const subs = this.listeners.get(taskId);
    if (subs) {
      subs.forEach((cb) => cb([]));
    }
  }

  public subscribe(taskId: string, callback: (logs: GhostDevStreamChunk[]) => void): () => void {
    if (!this.listeners.has(taskId)) {
      this.listeners.set(taskId, new Set());
    }
    const set = this.listeners.get(taskId)!;
    set.add(callback);

    // Initial trigger with current state
    callback(this.getLogs(taskId));

    return () => {
      set.delete(callback);
      if (set.size === 0) {
        this.listeners.delete(taskId);
      }
    };
  }

  public attachTauriListener(): void {
    if (this.tauriListening || !isTauriApp()) return;
    this.tauriListening = true;

    void (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        await listen<GhostDevStreamChunk>('ghost-dev:stream-chunk', (event) => {
          if (event.payload && event.payload.taskId) {
            this.addChunk(event.payload);
          }
        });
      } catch (err) {
        console.error('[AgentLogStore] Failed to attach Tauri stream listener:', err);
      }
    })();
  }
}

export const agentLogStore = new AgentLogStore();
