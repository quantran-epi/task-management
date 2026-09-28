import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NotificationSettingsCard } from '../../../src/components/settings/NotificationSettingsCard';
import { useDesktopNotification, SESSION_NOTIFICATION_SHOWN_KEY } from '../../../src/hooks/useDesktopNotification';
import { db } from '../../../src/db';
import type { NotificationState } from '../../../src/types/notifications';
import { renderHook } from '@testing-library/react';

describe('NotificationSettingsCard (D-18, D-19)', () => {
  beforeEach(async () => {
    await db.settings.delete('browserNotificationsEnabled');
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders desktop notification settings card with title and switch', () => {
    render(<NotificationSettingsCard db={db} />);

    expect(screen.getByText(/Thông báo màn hình \(Desktop Notifications\)/i)).toBeDefined();
    expect(screen.getByRole('switch', { name: /Bật hoặc tắt thông báo trình duyệt/i })).toBeDefined();
  });

  it('requests permission and enables setting when permission is granted', async () => {
    const mockRequestPermission = vi.fn().mockResolvedValue('granted');
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission: mockRequestPermission,
    });

    render(<NotificationSettingsCard db={db} />);
    const toggle = screen.getByRole('switch', { name: /Bật hoặc tắt thông báo trình duyệt/i });

    fireEvent.click(toggle);

    await waitFor(async () => {
      expect(mockRequestPermission).toHaveBeenCalled();
      const saved = await db.settings.get('browserNotificationsEnabled');
      expect(saved?.value).toBe(true);
    });
  });

  it('shows warning alert when permission is denied', async () => {
    vi.stubGlobal('Notification', {
      permission: 'denied',
      requestPermission: vi.fn().mockResolvedValue('denied'),
    });

    render(<NotificationSettingsCard db={db} />);
    const toggle = screen.getByRole('switch', { name: /Bật hoặc tắt thông báo trình duyệt/i });

    fireEvent.click(toggle);

    expect(await screen.findByText('Quyền thông báo bị từ chối')).toBeDefined();
    const saved = await db.settings.get('browserNotificationsEnabled');
    expect(saved?.value).toBe(false);
  });
});

describe('useDesktopNotification hook (T-12-07, T-12-08)', () => {
  beforeEach(async () => {
    await db.settings.delete('browserNotificationsEnabled');
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('triggers browser notification when enabled, granted, and not throttled', async () => {
    await db.settings.put({ key: 'browserNotificationsEnabled', value: true });

    const mockNotificationConstructor = vi.fn();
    vi.stubGlobal('Notification', Object.assign(mockNotificationConstructor, {
      permission: 'granted',
    }));

    const mockState: NotificationState = {
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

    renderHook(() => useDesktopNotification({ notifications: mockState, db }));

    await waitFor(() => {
      expect(mockNotificationConstructor).toHaveBeenCalledTimes(1);
      expect(mockNotificationConstructor).toHaveBeenCalledWith(
        'Task Planner',
        expect.objectContaining({
          body: expect.stringContaining('1 việc quá hạn'),
        })
      );
      expect(sessionStorage.getItem(SESSION_NOTIFICATION_SHOWN_KEY)).toBe('true');
    });
  });

  it('does not trigger if already shown in this session (sessionStorage throttled)', async () => {
    await db.settings.put({ key: 'browserNotificationsEnabled', value: true });
    sessionStorage.setItem(SESSION_NOTIFICATION_SHOWN_KEY, 'true');

    const mockNotificationConstructor = vi.fn();
    vi.stubGlobal('Notification', Object.assign(mockNotificationConstructor, {
      permission: 'granted',
    }));

    const mockState: NotificationState = {
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

    renderHook(() => useDesktopNotification({ notifications: mockState, db }));

    expect(mockNotificationConstructor).not.toHaveBeenCalled();
  });
});
