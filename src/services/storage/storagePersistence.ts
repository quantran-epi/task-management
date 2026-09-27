export interface StoragePersistenceResult {
  isPersisted: boolean;
  quotaBytes?: number | undefined;
  usageBytes?: number | undefined;
  isSupported: boolean;
}

export interface StorageQuotaEstimate {
  quotaBytes?: number | undefined;
  usageBytes?: number | undefined;
  formattedQuota: string;
  formattedUsage: string;
  percentUsed: number;
  isSupported: boolean;
}

export function formatBytes(bytes?: number): string {
  if (bytes === undefined || isNaN(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = bytes / Math.pow(k, i);
  return `${val.toFixed(1)} ${sizes[i]}`;
}

export async function checkAndRequestStoragePersistence(): Promise<StoragePersistenceResult> {
  const isSupported = typeof navigator !== 'undefined' && 'storage' in navigator && !!navigator.storage;

  if (!isSupported) {
    return { isPersisted: false, isSupported: false };
  }

  let isPersisted = false;
  let quotaBytes: number | undefined;
  let usageBytes: number | undefined;

  try {
    if (typeof navigator.storage.persisted === 'function') {
      isPersisted = await navigator.storage.persisted();
      if (!isPersisted && typeof navigator.storage.persist === 'function') {
        isPersisted = await navigator.storage.persist();
      }
    }

    if (typeof navigator.storage.estimate === 'function') {
      const estimate = await navigator.storage.estimate();
      quotaBytes = estimate.quota;
      usageBytes = estimate.usage;
    }
  } catch (err) {
    console.warn('Storage persistence request failed or was blocked by browser:', err);
  }

  return { isPersisted, quotaBytes, usageBytes, isSupported: true };
}

export async function getStorageQuotaEstimate(): Promise<StorageQuotaEstimate> {
  const isSupported = typeof navigator !== 'undefined' && 'storage' in navigator && !!navigator.storage;

  if (!isSupported) {
    return {
      formattedQuota: 'Không xác định',
      formattedUsage: '0 B',
      percentUsed: 0,
      isSupported: false,
    };
  }

  try {
    if (typeof navigator.storage.estimate === 'function') {
      const estimate = await navigator.storage.estimate();
      const quotaBytes = estimate.quota;
      const usageBytes = estimate.usage;
      const percentUsed =
        quotaBytes && quotaBytes > 0 && usageBytes !== undefined
          ? Math.min(100, Math.round((usageBytes / quotaBytes) * 1000) / 10)
          : 0;

      return {
        quotaBytes,
        usageBytes,
        formattedQuota: formatBytes(quotaBytes),
        formattedUsage: formatBytes(usageBytes),
        percentUsed,
        isSupported: true,
      };
    }
  } catch (err) {
    console.warn('Storage estimate failed:', err);
  }

  return {
    formattedQuota: 'Không xác định',
    formattedUsage: '0 B',
    percentUsed: 0,
    isSupported: true,
  };
}
