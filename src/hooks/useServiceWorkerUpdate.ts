import { useContext } from 'react';
import {
  ServiceWorkerContext,
  type ServiceWorkerContextValue,
} from '../context/ServiceWorkerContext';

export type UseServiceWorkerUpdateResult = ServiceWorkerContextValue;

const fallbackValue: UseServiceWorkerUpdateResult = {
  needRefresh: false,
  setNeedRefresh: () => {},
  offlineReady: false,
  isChecking: false,
  checkUpdate: async () => false,
  reloadApp: async () => {},
};

/**
 * Hook consuming singleton Service Worker update state from ServiceWorkerContext.
 * Provides safe fallback if invoked outside ServiceWorkerProvider.
 */
export function useServiceWorkerUpdate(): UseServiceWorkerUpdateResult {
  const context = useContext(ServiceWorkerContext);
  return context ?? fallbackValue;
}
