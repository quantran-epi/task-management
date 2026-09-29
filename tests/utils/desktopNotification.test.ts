import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendDesktopNotification } from '../../src/utils/desktopNotification';

describe('desktopNotification utility (NOTIF-07, NOTIF-08)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

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
