import { useEffect, useRef } from 'react';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import { attachSqliteTableHooks, flushLocalSqliteNow } from '../services/localSqlitePersistence';

export function useLocalSqlitePersistence(db: TaskPlannerDatabase = defaultDb): void {
  const attachedRef = useRef(false);

  useEffect(() => {
    if (attachedRef.current) return;
    attachedRef.current = true;

    const detachHooks = attachSqliteTableHooks(db);
    let flushTimer: number | undefined;

    const scheduleFlush = () => {
      if (flushTimer !== undefined) window.clearTimeout(flushTimer);
      flushTimer = window.setTimeout(() => {
        void flushLocalSqliteNow(db).catch((err) => {
          console.warn('Local SQLite flush failed:', err);
        });
      }, 1000);
    };

    const pagehide = () => {
      void flushLocalSqliteNow(db).catch((err) => {
        console.warn('Local SQLite pagehide flush failed:', err);
      });
    };

    const storage = () => scheduleFlush();
    window.addEventListener('storage', storage);
    window.addEventListener('pagehide', pagehide);

    let detachCloseListener: (() => void) | undefined;
    void import('@tauri-apps/api/window')
      .then((api) => api.getCurrentWindow().onCloseRequested(async () => {
        await flushLocalSqliteNow(db);
      }))
      .then((detach) => {
        detachCloseListener = detach;
      })
      .catch(() => undefined);

    return () => {
      attachedRef.current = false;
      if (flushTimer !== undefined) window.clearTimeout(flushTimer);
      window.removeEventListener('storage', storage);
      window.removeEventListener('pagehide', pagehide);
      detachCloseListener?.();
      detachHooks();
    };
  }, [db]);
}
