import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sendDesktopNotification,
  isTauriEnvironment,
  isNotificationPermissionGranted,
  requestNotificationPermission,
} from '../../src/utils/desktopNotification';
import * as tauriPluginNotification from '@tauri-apps/plugin-notification';

vi.mock('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
  sendNotification: vi.fn(),
}));

describe('desktopNotification utility (NOTIF-07, NOTIF-08, TAURI-NOTIF-DESKTOP-DISPATCH)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('isTauriEnvironment', () => {
    it('returns false when window lacks __TAURI_INTERNALS__ and __TAURI__', () => {
      vi.stubGlobal('__TAURI_INTERNALS__', undefined);
      vi.stubGlobal('__TAURI__', undefined);
      expect(isTauriEnvironment()).toBe(false);
    });

    it('returns true when window.__TAURI_INTERNALS__ is present', () => {
      vi.stubGlobal('__TAURI_INTERNALS__', {});
      expect(isTauriEnvironment()).toBe(true);
    });

    it('returns true when window.__TAURI__ is present', () => {
      vi.stubGlobal('__TAURI__', {});
      expect(isTauriEnvironment()).toBe(true);
    });
  });

  describe('Tauri native plugin delegation', () => {
    beforeEach(() => {
      vi.stubGlobal('__TAURI_INTERNALS__', {});
    });

    it('delegates isNotificationPermissionGranted to @tauri-apps/plugin-notification', async () => {
      vi.mocked(tauriPluginNotification.isPermissionGranted).mockResolvedValue(true);

      const result = await isNotificationPermissionGranted();
      expect(result).toBe(true);
      expect(tauriPluginNotification.isPermissionGranted).toHaveBeenCalledTimes(1);
    });

    it('delegates requestNotificationPermission to @tauri-apps/plugin-notification', async () => {
      vi.mocked(tauriPluginNotification.requestPermission).mockResolvedValue('granted');

      const result = await requestNotificationPermission();
      expect(result).toBe(true);
      expect(tauriPluginNotification.requestPermission).toHaveBeenCalledTimes(1);
    });

    it('returns false from requestNotificationPermission when Tauri permission is denied', async () => {
      vi.mocked(tauriPluginNotification.requestPermission).mockResolvedValue('denied');

      const result = await requestNotificationPermission();
      expect(result).toBe(false);
    });

    it('sends notification via sendNotification in Tauri environment when permission is granted', async () => {
      vi.mocked(tauriPluginNotification.isPermissionGranted).mockResolvedValue(true);

      const result = await sendDesktopNotification({
        title: 'Tauri Native Thông Báo',
        body: 'Thân thông báo tauri',
        data: { customKey: 'val123' },
      });

      expect(result).toBe(true);
      expect(tauriPluginNotification.sendNotification).toHaveBeenCalledWith({
        title: 'Tauri Native Thông Báo',
        body: 'Thân thông báo tauri',
        extra: { customKey: 'val123' },
      });
    });

    it('returns false and does not call sendNotification when Tauri permission is not granted', async () => {
      vi.mocked(tauriPluginNotification.isPermissionGranted).mockResolvedValue(false);

      const result = await sendDesktopNotification({
        title: 'Bị từ chối',
        body: 'Không thể gửi',
      });

      expect(result).toBe(false);
      expect(tauriPluginNotification.sendNotification).not.toHaveBeenCalled();
    });
  });

  describe('Browser & PWA fallback', () => {
    it('returns false when window or Notification API is not available', async () => {
      vi.stubGlobal('Notification', undefined);
      const result = await sendDesktopNotification({ title: 'Test' });
      expect(result).toBe(false);
    });

    it('returns false when Notification.permission is denied or default', async () => {
      vi.stubGlobal('Notification', {
        permission: 'denied',
      });
      const resultDenied = await sendDesktopNotification({ title: 'Test' });
      expect(resultDenied).toBe(false);

      vi.stubGlobal('Notification', {
        permission: 'default',
      });
      const resultDefault = await sendDesktopNotification({ title: 'Test' });
      expect(resultDefault).toBe(false);
    });

    it('dispatches via Service Worker registration.showNotification when ready', async () => {
      const mockShowNotification = vi.fn().mockResolvedValue(undefined);
      const mockRegistration = {
        showNotification: mockShowNotification,
      };

      vi.stubGlobal('Notification', Object.assign(vi.fn(), {
        permission: 'granted',
      }));

      vi.stubGlobal('navigator', {
        serviceWorker: {
          ready: Promise.resolve(mockRegistration),
        },
      });

      const result = await sendDesktopNotification({
        title: 'Nhắc nhở PWA',
        body: 'Nội dung nhắc nhở',
        tag: 'rem-123',
        requireInteraction: true,
        data: { id: 123 },
      });

      expect(result).toBe(true);
      expect(mockShowNotification).toHaveBeenCalledTimes(1);
      expect(mockShowNotification).toHaveBeenCalledWith('Nhắc nhở PWA', {
        body: 'Nội dung nhắc nhở',
        icon: '/task-management/favicon.ico',
        tag: 'rem-123',
        requireInteraction: true,
        data: { id: 123 },
      });
    });

    it('falls back to window.Notification when serviceWorker is not supported or not ready', async () => {
      const mockNotificationConstructor = vi.fn();
      vi.stubGlobal('Notification', Object.assign(mockNotificationConstructor, {
        permission: 'granted',
      }));

      vi.stubGlobal('navigator', {});

      const result = await sendDesktopNotification({
        title: 'Thông báo dự phòng',
        body: 'Chi tiết dự phòng',
        requireInteraction: false,
      });

      expect(result).toBe(true);
      expect(mockNotificationConstructor).toHaveBeenCalledTimes(1);
      expect(mockNotificationConstructor).toHaveBeenCalledWith('Thông báo dự phòng', {
        body: 'Chi tiết dự phòng',
        icon: '/task-management/favicon.ico',
        tag: undefined,
        requireInteraction: false,
        data: undefined,
      });
    });

    it('falls back to window.Notification when Service Worker showNotification rejects', async () => {
      const mockShowNotification = vi.fn().mockRejectedValue(new Error('SW error'));
      const mockRegistration = {
        showNotification: mockShowNotification,
      };

      const mockNotificationConstructor = vi.fn();
      vi.stubGlobal('Notification', Object.assign(mockNotificationConstructor, {
        permission: 'granted',
      }));

      vi.stubGlobal('navigator', {
        serviceWorker: {
          ready: Promise.resolve(mockRegistration),
        },
      });

      const result = await sendDesktopNotification({
        title: 'Thông báo sau lỗi SW',
        body: 'Fallback qua window.Notification',
        requireInteraction: true,
      });

      expect(result).toBe(true);
      expect(mockShowNotification).toHaveBeenCalledTimes(1);
      expect(mockNotificationConstructor).toHaveBeenCalledTimes(1);
      expect(mockNotificationConstructor).toHaveBeenCalledWith('Thông báo sau lỗi SW', {
        body: 'Fallback qua window.Notification',
        icon: '/task-management/favicon.ico',
        tag: undefined,
        requireInteraction: true,
        data: undefined,
      });
    });
  });
});
