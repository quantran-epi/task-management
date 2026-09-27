import { useState, useEffect, useCallback, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export interface UseServiceWorkerUpdateResult {
  needRefresh: boolean;
  setNeedRefresh: (value: boolean) => void;
  offlineReady: boolean;
  isChecking: boolean;
  checkUpdate: () => Promise<void>;
  reloadApp: (force?: boolean) => Promise<void>;
}

/**
 * Hook managing service worker updates, periodic focus update checks (D-03),
 * and reload dispatch (D-01, D-02).
 */
export function useServiceWorkerUpdate(): UseServiceWorkerUpdateResult {
  const [isChecking, setIsChecking] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      registrationRef.current = r;
      // Setup periodic update check if supported
      if (r) {
        // Check once an hour if registration supports periodicSync or interval
        const intervalId = setInterval(
          () => {
            if (navigator.onLine) {
              r.update().catch(() => {});
            }
          },
          60 * 60 * 1000
        );

        return () => clearInterval(intervalId);
      }
      return undefined;
    },
    onRegisterError(error) {
      console.error('Service worker registration failed:', error);
    },
  });

  const checkUpdate = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.onLine) return;
    setIsChecking(true);
    try {
      if (registrationRef.current) {
        await registrationRef.current.update();
      } else if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          registrationRef.current = reg;
          await reg.update();
        }
      }
    } catch (err) {
      console.warn('Update check failed:', err);
    } finally {
      setIsChecking(false);
    }
  }, []);

  // Check update on window focus and tab visibility change per D-03
  useEffect(() => {
    const handleFocus = () => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        checkUpdate().catch(() => {});
      }
    };

    const handleVisibilityChange = () => {
      if (
        typeof document !== 'undefined' &&
        document.visibilityState === 'visible' &&
        typeof navigator !== 'undefined' &&
        navigator.onLine
      ) {
        checkUpdate().catch(() => {});
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [checkUpdate]);

  const reloadApp = useCallback(
    async (force = false) => {
      try {
        await updateServiceWorker(force || true);
      } catch (err) {
        console.error('Failed to trigger updateServiceWorker:', err);
        // Fallback to hard reload if SW reload fails
        window.location.reload();
      }
    },
    [updateServiceWorker]
  );

  return {
    needRefresh,
    setNeedRefresh,
    offlineReady,
    isChecking,
    checkUpdate,
    reloadApp,
  };
}
