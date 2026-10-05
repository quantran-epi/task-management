import React, { createContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { isTauriApp } from '../utils/timerPopout';

export interface ServiceWorkerContextValue {
  needRefresh: boolean;
  setNeedRefresh: (value: boolean) => void;
  offlineReady: boolean;
  isChecking: boolean;
  checkUpdate: () => Promise<boolean>;
  reloadApp: (force?: boolean) => Promise<void>;
}

export const ServiceWorkerContext = createContext<ServiceWorkerContextValue | null>(null);

export interface ServiceWorkerProviderProps {
  children: React.ReactNode;
}

/**
 * Singleton Service Worker context provider managing registration,
 * background polling, focus checks, and reload lifecycle.
 */
export const ServiceWorkerProvider: React.FC<ServiceWorkerProviderProps> = ({ children }) => {
  const [isChecking, setIsChecking] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      registrationRef.current = r;
    },
    onRegisterError(error) {
      console.error('Service worker registration failed:', error);
    },
  });

  // Auto-unregister any stale service workers and purge caches in Tauri runtime
  useEffect(() => {
    if (!isTauriApp()) return;

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => {
          for (const reg of registrations) {
            reg.unregister().catch(() => {});
          }
        })
        .catch(() => {});
    }

    if (typeof window !== 'undefined' && 'caches' in window) {
      window.caches
        .keys()
        .then((keys) => {
          for (const key of keys) {
            window.caches.delete(key).catch(() => {});
          }
        })
        .catch(() => {});
    }
  }, []);

  const checkUpdate = useCallback(async (): Promise<boolean> => {
    if (isTauriApp()) return false;
    if (typeof navigator === 'undefined' || !navigator.onLine) return false;
    setIsChecking(true);
    try {
      let reg = registrationRef.current;
      if (!reg && 'serviceWorker' in navigator) {
        reg = await navigator.serviceWorker.getRegistration();
        if (reg) registrationRef.current = reg;
      }
      if (reg) {
        await reg.update();
        const hasUpdate = Boolean(reg.installing || reg.waiting);
        if (hasUpdate) {
          setNeedRefresh(true);
        }
        return hasUpdate;
      }
      return false;
    } catch (err) {
      console.warn('Update check failed:', err);
      return false;
    } finally {
      setIsChecking(false);
    }
  }, [setNeedRefresh]);

  // Hourly periodic update check per D-03 with proper unmount cleanup
  useEffect(() => {
    if (isTauriApp()) return;

    intervalRef.current = setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine && registrationRef.current) {
        registrationRef.current.update().catch(() => {});
      }
    }, 60 * 60 * 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  // Check update on window focus and tab visibility change per D-03
  useEffect(() => {
    if (isTauriApp()) return;

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
      if (isTauriApp()) {
        window.location.reload();
        return;
      }
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

  const contextValue = useMemo<ServiceWorkerContextValue>(
    () => ({
      needRefresh,
      setNeedRefresh,
      offlineReady,
      isChecking,
      checkUpdate,
      reloadApp,
    }),
    [needRefresh, setNeedRefresh, offlineReady, isChecking, checkUpdate, reloadApp]
  );

  return (
    <ServiceWorkerContext.Provider value={contextValue}>
      {children}
    </ServiceWorkerContext.Provider>
  );
};
