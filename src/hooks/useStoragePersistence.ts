import { useState, useEffect, useCallback } from 'react';
import { getStorageQuotaEstimate } from '../services/storage/storagePersistence';
import { announceToScreenReader } from '../components/common/AriaLiveRegion';

export interface UseStoragePersistenceReturn {
  isPersisted: boolean;
  quotaBytes?: number | undefined;
  usageBytes?: number | undefined;
  formattedQuota: string;
  formattedUsage: string;
  percentUsed: number;
  isSupported: boolean;
  loading: boolean;
  requestPersistence: () => Promise<boolean>;
  refresh: () => Promise<void>;
}

export function useStoragePersistence(): UseStoragePersistenceReturn {
  const [isPersisted, setIsPersisted] = useState(false);
  const [quotaBytes, setQuotaBytes] = useState<number | undefined>(undefined);
  const [usageBytes, setUsageBytes] = useState<number | undefined>(undefined);
  const [formattedQuota, setFormattedQuota] = useState('Không xác định');
  const [formattedUsage, setFormattedUsage] = useState('0 B');
  const [percentUsed, setPercentUsed] = useState(0);
  const [isSupported, setIsSupported] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const supported =
        typeof navigator !== 'undefined' &&
        'storage' in navigator &&
        !!navigator.storage;
      setIsSupported(supported);

      if (supported && typeof navigator.storage.persisted === 'function') {
        const persisted = await navigator.storage.persisted();
        setIsPersisted(persisted);
      } else {
        setIsPersisted(false);
      }

      const estimate = await getStorageQuotaEstimate();
      setQuotaBytes(estimate.quotaBytes);
      setUsageBytes(estimate.usageBytes);
      setFormattedQuota(estimate.formattedQuota);
      setFormattedUsage(estimate.formattedUsage);
      setPercentUsed(estimate.percentUsed);
    } catch (err) {
      console.warn('Failed to query storage persistence status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const requestPersistence = useCallback(async (): Promise<boolean> => {
    const supported =
      typeof navigator !== 'undefined' &&
      'storage' in navigator &&
      !!navigator.storage?.persist;

    if (!supported) {
      announceToScreenReader('Trình duyệt không hỗ trợ yêu cầu lưu trữ bền vững.');
      return false;
    }

    setLoading(true);
    try {
      const persisted = await navigator.storage.persist();
      setIsPersisted(persisted);

      if (persisted) {
        announceToScreenReader('Đã kích hoạt chế độ lưu trữ bền vững thành công.');
      } else {
        announceToScreenReader('Trình duyệt chưa cấp quyền lưu trữ bền vững.');
      }

      const estimate = await getStorageQuotaEstimate();
      setQuotaBytes(estimate.quotaBytes);
      setUsageBytes(estimate.usageBytes);
      setFormattedQuota(estimate.formattedQuota);
      setFormattedUsage(estimate.formattedUsage);
      setPercentUsed(estimate.percentUsed);

      return persisted;
    } catch (err) {
      console.warn('Manual storage persistence request failed:', err);
      announceToScreenReader('Không thể yêu cầu lưu trữ bền vững.');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    isPersisted,
    quotaBytes,
    usageBytes,
    formattedQuota,
    formattedUsage,
    percentUsed,
    isSupported,
    loading,
    requestPersistence,
    refresh,
  };
}
