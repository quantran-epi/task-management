import { vi } from 'vitest';

export const mockUpdateServiceWorker = vi.fn().mockResolvedValue(undefined);
export const mockSetNeedRefresh = vi.fn();
export const mockSetOfflineReady = vi.fn();

export interface MockRegisterSWState {
  needRefresh: boolean;
  offlineReady: boolean;
}

export const useRegisterSWMock = vi.fn(() => ({
  needRefresh: [false, mockSetNeedRefresh] as [boolean, (value: boolean) => void],
  offlineReady: [false, mockSetOfflineReady] as [boolean, (value: boolean) => void],
  updateServiceWorker: mockUpdateServiceWorker,
}));

export const useRegisterSW = useRegisterSWMock;
