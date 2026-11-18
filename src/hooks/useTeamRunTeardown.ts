import { useEffect } from 'react';
import { disposeAllRuns } from '../services/ai/office/teamRunManager';

/**
 * IN-04/IN-07: app exit tears down every live team run.
 *
 * Before this, `disposeAllRuns` had no production caller, so a coordinator could keep
 * writing agent rows into a window that was closing, and `abortedBy: 'app-exit'` was a value
 * nothing produced. The Tauri close hook is the app's own exit seam (the same one
 * `useLocalSqlitePersistence` flushes on); `pagehide` covers the dev/browser runtime.
 *
 * The close handler does not `preventDefault`, so it never delays the window closing — it
 * releases parks and closes ledger rows best-effort, exactly like a team delete.
 */
export function useTeamRunTeardown(): void {
  useEffect(() => {
    const teardown = () => {
      void disposeAllRuns('app-exit').catch(() => {
        /* an exit must never throw out of the unload path */
      });
    };

    window.addEventListener('pagehide', teardown);

    let detachCloseListener: (() => void) | undefined;
    void import('@tauri-apps/api/window')
      .then((api) => api.getCurrentWindow().onCloseRequested(teardown))
      .then((detach) => {
        detachCloseListener = detach;
      })
      .catch(() => undefined);

    return () => {
      window.removeEventListener('pagehide', teardown);
      detachCloseListener?.();
    };
  }, []);
}
