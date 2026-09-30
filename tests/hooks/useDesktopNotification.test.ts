import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import dayjs from 'dayjs';
import {
  useDesktopNotification,
  SESSION_NOTIFICATION_SHOWN_KEY,
} from '../../src/hooks/useDesktopNotification';
import { db } from '../../src/db';
import {
  NOTIFICATION_SETTINGS_KEY,
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationState,
} from '../../src/types/notifications';
import * as tauriPluginNotification from '@tauri-apps/plugin-notification';

vi.mock('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
  sendNotification: vi.fn(),
}));

describe('useDesktopNotification hook (D-09, D-12, NOTIF-07, TAURI-NOTIF-DESKTOP-DISPATCH)', () => {
  beforeEach(async () => {
    await db.settings.delete('browserNotificationsEnabled');
    await db.settings.delete(NOTIFICATION_SETTINGS_KEY);
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const baseNotificationState: NotificationState = {
    items: [
      {
        id: 'overdue:task:1',
        category: 'overdue',
        title: 'Tác vụ 1',
        tagColor: 'error',
        tagLabel: 'Quá hạn',
        entityType: 'task',
        canDismiss: false,
        priorityOrder: 1,
      },
    ],
    activeCount: 1,
    categoryCounts: {
      overdue: 1,
      overload: 0,
      'due-soon': 0,
      stale: 0,
      reminder: 0,
    },
    isLoading: false,
  };

  it('dispatches startup notification with requireInteraction: true when default/enabled', async () => {
    await db.settings.put({
      key: NOTIFICATION_SETTINGS_KEY,
      value: {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        browserNotificationsEnabled: true,
        requireInteractionEnabled: true,
      },
    });

    const mockNotification = vi.fn();
    vi.stubGlobal(
      'Notification',
      Object.assign(mockNotification, {
        permission: 'granted',
      })
    );

    renderHook(() => useDesktopNotification({ notifications: baseNotificationState, db }));

    await waitFor(() => {
      expect(mockNotification).toHaveBeenCalledTimes(1);
      expect(mockNotification).toHaveBeenCalledWith(
        'Task Planner',
        expect.objectContaining({
          body: expect.stringContaining('1 việc quá hạn'),
          requireInteraction: true,
        })
      );
      expect(sessionStorage.getItem(SESSION_NOTIFICATION_SHOWN_KEY)).toBe('true');
    });
  });

  it('includes stale tasks in startup summary text when only stale tasks exist', async () => {
    await db.settings.put({
      key: NOTIFICATION_SETTINGS_KEY,
      value: {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        browserNotificationsEnabled: true,
        requireInteractionEnabled: true,
      },
    });

    const mockNotification = vi.fn();
    vi.stubGlobal(
      'Notification',
      Object.assign(mockNotification, {
        permission: 'granted',
      })
    );

    const staleNotificationState: NotificationState = {
      items: [
        {
          id: 'stale:task:1',
          category: 'stale',
          title: 'Tác vụ trì trệ',
          tagColor: 'warning',
          tagLabel: 'Cần cập nhật',
          entityType: 'task',
          canDismiss: true,
          priorityOrder: 3,
        },
      ],
      activeCount: 1,
      categoryCounts: {
        overdue: 0,
        overload: 0,
        'due-soon': 0,
        stale: 1,
        reminder: 0,
      },
      isLoading: false,
    };

    renderHook(() => useDesktopNotification({ notifications: staleNotificationState, db }));

    await waitFor(() => {
      expect(mockNotification).toHaveBeenCalledTimes(1);
      expect(mockNotification).toHaveBeenCalledWith(
        'Task Planner',
        expect.objectContaining({
          body: 'Bạn có 0 việc quá hạn, 0 ngày quá tải, và 1 việc cần xử lý.',
        })
      );
    });
  });

  it('respects requireInteraction: false when disabled in settings', async () => {
    await db.settings.put({
      key: NOTIFICATION_SETTINGS_KEY,
      value: {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        browserNotificationsEnabled: true,
        requireInteractionEnabled: false,
      },
    });

    const mockNotification = vi.fn();
    vi.stubGlobal(
      'Notification',
      Object.assign(mockNotification, {
        permission: 'granted',
      })
    );

    renderHook(() => useDesktopNotification({ notifications: baseNotificationState, db }));

    await waitFor(() => {
      expect(mockNotification).toHaveBeenCalledTimes(1);
      expect(mockNotification).toHaveBeenCalledWith(
        'Task Planner',
        expect.objectContaining({
          requireInteraction: false,
        })
      );
    });
  });

  it('suppresses notifications when browserNotificationsEnabled is false', async () => {
    await db.settings.put({
      key: NOTIFICATION_SETTINGS_KEY,
      value: {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        browserNotificationsEnabled: false,
      },
    });

    const mockNotification = vi.fn();
    vi.stubGlobal(
      'Notification',
      Object.assign(mockNotification, {
        permission: 'granted',
      })
    );

    renderHook(() => useDesktopNotification({ notifications: baseNotificationState, db }));

    expect(mockNotification).not.toHaveBeenCalled();
  });

  it('suppresses notifications when Notification.permission is not granted', async () => {
    await db.settings.put({
      key: NOTIFICATION_SETTINGS_KEY,
      value: {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        browserNotificationsEnabled: true,
      },
    });

    const mockNotification = vi.fn();
    vi.stubGlobal(
      'Notification',
      Object.assign(mockNotification, {
        permission: 'denied',
      })
    );

    renderHook(() => useDesktopNotification({ notifications: baseNotificationState, db }));

    expect(mockNotification).not.toHaveBeenCalled();
  });

  it('does not trigger startup notification again in the same session', async () => {
    await db.settings.put({
      key: NOTIFICATION_SETTINGS_KEY,
      value: {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        browserNotificationsEnabled: true,
      },
    });
    sessionStorage.setItem(SESSION_NOTIFICATION_SHOWN_KEY, 'true');

    const mockNotification = vi.fn();
    vi.stubGlobal(
      'Notification',
      Object.assign(mockNotification, {
        permission: 'granted',
      })
    );

    renderHook(() => useDesktopNotification({ notifications: baseNotificationState, db }));

    expect(mockNotification).not.toHaveBeenCalled();
  });

  it('dispatches live notification when a reminder reaches current minute', async () => {
    const currentClock = dayjs().format('HH:mm');
    const currentDate = dayjs().format('YYYY-MM-DD');
    const currentMinuteTarget = `${currentClock} ${currentDate}`;

    await db.settings.put({
      key: NOTIFICATION_SETTINGS_KEY,
      value: {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        browserNotificationsEnabled: true,
        requireInteractionEnabled: true,
      },
    });

    // Mark startup notification already shown to test pure live reminder dispatch
    sessionStorage.setItem(SESSION_NOTIFICATION_SHOWN_KEY, 'true');

    const mockNotification = vi.fn();
    vi.stubGlobal(
      'Notification',
      Object.assign(mockNotification, {
        permission: 'granted',
      })
    );

    const reminderState: NotificationState = {
      items: [
        {
          id: 'reminder:task:t-1:rem-1',
          category: 'reminder',
          title: 'Cuộc họp quan trọng',
          subtitle: 'Chuẩn bị tài liệu',
          date: currentMinuteTarget,
          tagColor: 'gold',
          tagLabel: `Nhắc nhở (${currentClock})`,
          entityType: 'task',
          canDismiss: true,
          priorityOrder: 5,
        },
      ],
      activeCount: 1,
      categoryCounts: {
        overdue: 0,
        overload: 0,
        'due-soon': 0,
        stale: 0,
        reminder: 1,
      },
      isLoading: false,
    };

    renderHook(() => useDesktopNotification({ notifications: reminderState, db }));

    await waitFor(() => {
      expect(mockNotification).toHaveBeenCalledWith(
        'Cuộc họp quan trọng',
        expect.objectContaining({
          body: 'Chuẩn bị tài liệu',
          requireInteraction: true,
        })
      );
    });
  });

  it('dispatches live notification even if interval ticks after reminder minute (browser throttling)', async () => {
    const twoMinutesAgoClock = dayjs().subtract(2, 'minute').format('HH:mm');
    const currentDate = dayjs().format('YYYY-MM-DD');
    const delayedTarget = `${twoMinutesAgoClock} ${currentDate}`;

    await db.settings.put({
      key: NOTIFICATION_SETTINGS_KEY,
      value: {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        browserNotificationsEnabled: true,
        requireInteractionEnabled: true,
      },
    });

    sessionStorage.setItem(SESSION_NOTIFICATION_SHOWN_KEY, 'true');

    const mockNotification = vi.fn();
    vi.stubGlobal(
      'Notification',
      Object.assign(mockNotification, {
        permission: 'granted',
      })
    );

    const reminderState: NotificationState = {
      items: [
        {
          id: 'reminder:task:t-2:rem-2',
          category: 'reminder',
          title: 'Nhắc nhở trễ',
          subtitle: 'Kiểm tra',
          date: delayedTarget,
          tagColor: 'gold',
          tagLabel: `Nhắc nhở (${twoMinutesAgoClock})`,
          entityType: 'task',
          canDismiss: true,
          priorityOrder: 5,
        },
      ],
      activeCount: 1,
      categoryCounts: {
        overdue: 0,
        overload: 0,
        'due-soon': 0,
        stale: 0,
        reminder: 1,
      },
      isLoading: false,
    };

    renderHook(() => useDesktopNotification({ notifications: reminderState, db }));

    await waitFor(() => {
      expect(mockNotification).toHaveBeenCalledWith(
        'Nhắc nhở trễ',
        expect.objectContaining({
          body: 'Kiểm tra',
          requireInteraction: true,
        })
      );
    });
  });

  it('dispatches desktop notification for newly triggered overdue and overload alerts with deduplication', async () => {
    await db.settings.put({
      key: NOTIFICATION_SETTINGS_KEY,
      value: {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        browserNotificationsEnabled: true,
        requireInteractionEnabled: true,
      },
    });

    sessionStorage.setItem(SESSION_NOTIFICATION_SHOWN_KEY, 'true');

    const mockNotification = vi.fn();
    vi.stubGlobal(
      'Notification',
      Object.assign(mockNotification, {
        permission: 'granted',
      })
    );

    const initialEmptyState: NotificationState = {
      items: [],
      activeCount: 0,
      categoryCounts: {
        overdue: 0,
        overload: 0,
        'due-soon': 0,
        stale: 0,
        reminder: 0,
      },
      isLoading: false,
    };

    let currentState = initialEmptyState;
    const { rerender } = renderHook(() =>
      useDesktopNotification({ notifications: currentState, db })
    );

    // Now a task becomes overdue and an overload occurs
    currentState = {
      items: [
        {
          id: 'overdue:task:t-new',
          category: 'overdue',
          title: 'Hồ sơ tín dụng quá hạn',
          subtitle: 'Dự án Core Banking',
          tagColor: 'error',
          tagLabel: 'Quá hạn 1 ngày',
          entityType: 'task',
          canDismiss: false,
          priorityOrder: 1,
        },
        {
          id: 'overload:2026-04-01',
          category: 'overload',
          title: 'Quá tải 125% ngày 2026-04-01',
          tagColor: 'error',
          tagLabel: 'Quá tải',
          entityType: 'project',
          canDismiss: false,
          priorityOrder: 2,
        },
      ],
      activeCount: 2,
      categoryCounts: {
        overdue: 1,
        overload: 1,
        'due-soon': 0,
        stale: 0,
        reminder: 0,
      },
      isLoading: false,
    };

    rerender();

    await waitFor(() => {
      expect(mockNotification).toHaveBeenCalledWith(
        '[Quá hạn 1 ngày] Hồ sơ tín dụng quá hạn',
        expect.objectContaining({
          body: 'Dự án Core Banking',
          requireInteraction: true,
        })
      );
      expect(mockNotification).toHaveBeenCalledWith(
        '[Quá tải] Quá tải 125% ngày 2026-04-01',
        expect.objectContaining({
          body: 'Quá tải',
          requireInteraction: true,
        })
      );
    });

    const callCountAfterFirstAlert = mockNotification.mock.calls.length;

    // Rerender again with same active items - must deduplicate and NOT fire again
    rerender();
    await new Promise((r) => setTimeout(r, 50));
    expect(mockNotification).toHaveBeenCalledTimes(callCountAfterFirstAlert);
  });

  it('suppresses alerts when specific category is disabled in settings', async () => {
    await db.settings.put({
      key: NOTIFICATION_SETTINGS_KEY,
      value: {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        browserNotificationsEnabled: true,
        enabledCategories: {
          ...DEFAULT_NOTIFICATION_SETTINGS.enabledCategories,
          overdue: false, // Overdue disabled
        },
      },
    });

    sessionStorage.setItem(SESSION_NOTIFICATION_SHOWN_KEY, 'true');

    const mockNotification = vi.fn();
    vi.stubGlobal(
      'Notification',
      Object.assign(mockNotification, {
        permission: 'granted',
      })
    );

    const alertState: NotificationState = {
      items: [
        {
          id: 'overdue:task:suppressed',
          category: 'overdue',
          title: 'Tác vụ quá hạn bị tắt',
          tagColor: 'error',
          tagLabel: 'Quá hạn',
          entityType: 'task',
          canDismiss: false,
          priorityOrder: 1,
        },
      ],
      activeCount: 1,
      categoryCounts: {
        overdue: 1,
        overload: 0,
        'due-soon': 0,
        stale: 0,
        reminder: 0,
      },
      isLoading: false,
    };

    renderHook(() => useDesktopNotification({ notifications: alertState, db }));

    await new Promise((r) => setTimeout(r, 100));
    expect(mockNotification).not.toHaveBeenCalled();
  });

  it('dispatches notifications in Tauri environment via @tauri-apps/plugin-notification without window.Notification', async () => {
    vi.stubGlobal('__TAURI_INTERNALS__', {});
    vi.stubGlobal('Notification', undefined);

    await db.settings.put({
      key: NOTIFICATION_SETTINGS_KEY,
      value: {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        browserNotificationsEnabled: true,
        requireInteractionEnabled: true,
      },
    });

    sessionStorage.setItem(SESSION_NOTIFICATION_SHOWN_KEY, 'true');
    vi.mocked(tauriPluginNotification.isPermissionGranted).mockResolvedValue(true);

    const reminderState: NotificationState = {
      items: [
        {
          id: 'reminder:tauri:1',
          category: 'reminder',
          title: 'Tauri Native Reminder',
          subtitle: 'Kiểm tra tauri native alert',
          tagColor: 'gold',
          tagLabel: 'Nhắc nhở',
          entityType: 'task',
          canDismiss: true,
          priorityOrder: 5,
        },
      ],
      activeCount: 1,
      categoryCounts: {
        overdue: 0,
        overload: 0,
        'due-soon': 0,
        stale: 0,
        reminder: 1,
      },
      isLoading: false,
    };

    renderHook(() => useDesktopNotification({ notifications: reminderState, db }));

    await waitFor(() => {
      expect(tauriPluginNotification.sendNotification).toHaveBeenCalledWith({
        title: 'Tauri Native Reminder',
        body: 'Kiểm tra tauri native alert',
        extra: undefined,
      });
    });
  });
});
