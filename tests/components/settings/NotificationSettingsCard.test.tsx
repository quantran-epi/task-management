import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NotificationSettingsCard } from '../../../src/components/settings/NotificationSettingsCard';
import { db } from '../../../src/db';
import {
  NOTIFICATION_SETTINGS_KEY,
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationSettings,
} from '../../../src/types/notifications';
import * as tauriPluginNotification from '@tauri-apps/plugin-notification';

vi.mock('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
  sendNotification: vi.fn(),
}));

describe('NotificationSettingsCard (D-10, D-11, NOTIF-08, TAURI-NOTIF-DESKTOP-DISPATCH)', () => {
  beforeEach(async () => {
    await db.settings.delete('browserNotificationsEnabled');
    await db.settings.delete(NOTIFICATION_SETTINGS_KEY);
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders default controls for notifications, thresholds, and categories', async () => {
    render(<NotificationSettingsCard db={db} />);

    expect(screen.getByTestId('notification-settings-card')).toBeDefined();
    expect(screen.getByText(/Cài đặt thông báo & cảnh báo/i)).toBeDefined();
    expect(screen.getByTestId('browser-notifications-switch')).toBeDefined();
    expect(screen.getByTestId('require-interaction-switch')).toBeDefined();
    expect(screen.getByTestId('due-soon-days-select')).toBeDefined();
    expect(screen.getByTestId('stale-task-days-select')).toBeDefined();
    expect(screen.getByTestId('capacity-overload-select')).toBeDefined();

    // Test notification button
    expect(screen.getByTestId('test-notification-button')).toBeDefined();
    expect(screen.getByText(/Gửi thông báo thử nghiệm/i)).toBeDefined();

    // Category checkboxes
    expect(screen.getByTestId('category-checkbox-overdue')).toBeDefined();
    expect(screen.getByTestId('category-checkbox-dueSoon')).toBeDefined();
    expect(screen.getByTestId('category-checkbox-overload')).toBeDefined();
    expect(screen.getByTestId('category-checkbox-stale')).toBeDefined();
    expect(screen.getByTestId('category-checkbox-reminders')).toBeDefined();
    expect(screen.getByTestId('category-checkbox-timer')).toBeDefined();
  });

  it('requests permission and enables browser notifications when toggle is clicked', async () => {
    const mockRequestPermission = vi.fn().mockResolvedValue('granted');
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission: mockRequestPermission,
    });

    render(<NotificationSettingsCard db={db} />);
    const toggle = screen.getByTestId('browser-notifications-switch');

    fireEvent.click(toggle);

    await waitFor(async () => {
      expect(mockRequestPermission).toHaveBeenCalled();
      const savedLegacy = await db.settings.get('browserNotificationsEnabled');
      expect(savedLegacy?.value).toBe(true);

      const savedSettings = await db.settings.get(NOTIFICATION_SETTINGS_KEY);
      const val = savedSettings?.value as NotificationSettings;
      expect(val?.browserNotificationsEnabled).toBe(true);
    });
  });

  it('shows warning alert and disables setting when notification permission is denied', async () => {
    vi.stubGlobal('Notification', {
      permission: 'denied',
      requestPermission: vi.fn().mockResolvedValue('denied'),
    });

    render(<NotificationSettingsCard db={db} />);
    const toggle = screen.getByTestId('browser-notifications-switch');

    fireEvent.click(toggle);

    await waitFor(async () => {
      expect(screen.getByTestId('permission-denied-alert')).toBeDefined();
      const saved = await db.settings.get('browserNotificationsEnabled');
      expect(saved?.value).toBe(false);
    });
  });

  it('toggles requireInteractionEnabled switch and saves to db.settings', async () => {
    render(<NotificationSettingsCard db={db} />);
    const requireToggle = screen.getByTestId('require-interaction-switch');

    // Default is true, clicking toggles to false
    fireEvent.click(requireToggle);

    await waitFor(async () => {
      const saved = await db.settings.get(NOTIFICATION_SETTINGS_KEY);
      const val = saved?.value as NotificationSettings;
      expect(val?.requireInteractionEnabled).toBe(false);
    });
  });

  it('updates category toggles in db.settings when checkbox is changed', async () => {
    render(<NotificationSettingsCard db={db} />);

    const overdueCheckbox = screen.getByTestId('category-checkbox-overdue');
    expect(overdueCheckbox).toBeDefined();

    // Toggle overdue off
    fireEvent.click(overdueCheckbox);

    await waitFor(async () => {
      const saved = await db.settings.get(NOTIFICATION_SETTINGS_KEY);
      const val = saved?.value as NotificationSettings;
      expect(val?.enabledCategories.overdue).toBe(false);
      expect(val?.enabledCategories.dueSoon).toBe(true);
    });
  });

  it('persists threshold settings changes to Dexie', async () => {
    // Seed initial custom settings
    await db.settings.put({
      key: NOTIFICATION_SETTINGS_KEY,
      value: {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        dueSoonDays: 3,
        staleTaskDays: 7,
        capacityOverloadThreshold: 110,
      },
    });

    render(<NotificationSettingsCard db={db} />);

    await waitFor(async () => {
      const saved = await db.settings.get(NOTIFICATION_SETTINGS_KEY);
      const val = saved?.value as NotificationSettings;
      expect(val?.dueSoonDays).toBe(3);
      expect(val?.staleTaskDays).toBe(7);
      expect(val?.capacityOverloadThreshold).toBe(110);
    });
  });

  it('preserves existing database settings even when toggled immediately on mount', async () => {
    // Seed initial custom settings
    await db.settings.put({
      key: NOTIFICATION_SETTINGS_KEY,
      value: {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        dueSoonDays: 5,
        staleTaskDays: 14,
        requireInteractionEnabled: true,
      },
    });

    render(<NotificationSettingsCard db={db} />);

    // Immediately toggle requireInteraction before useLiveQuery finishes
    const requireToggle = screen.getByTestId('require-interaction-switch');
    fireEvent.click(requireToggle);

    await waitFor(async () => {
      const saved = await db.settings.get(NOTIFICATION_SETTINGS_KEY);
      const val = saved?.value as NotificationSettings;
      expect(val?.requireInteractionEnabled).toBe(false);
      // Existing custom thresholds must NOT be overwritten by DEFAULT_NOTIFICATION_SETTINGS
      expect(val?.dueSoonDays).toBe(5);
      expect(val?.staleTaskDays).toBe(14);
    });
  });

  it('sends test desktop notification when test notification button is clicked with granted permission', async () => {
    const mockNotification = vi.fn();
    vi.stubGlobal(
      'Notification',
      Object.assign(mockNotification, {
        permission: 'granted',
        requestPermission: vi.fn().mockResolvedValue('granted'),
      })
    );

    render(<NotificationSettingsCard db={db} />);
    const testButton = screen.getByTestId('test-notification-button');

    fireEvent.click(testButton);

    await waitFor(() => {
      expect(mockNotification).toHaveBeenCalledTimes(1);
      expect(mockNotification).toHaveBeenCalledWith(
        'Task Planner - Thông báo thử nghiệm',
        expect.objectContaining({
          body: expect.stringContaining('Thông báo màn hình đang hoạt động'),
          requireInteraction: true,
        })
      );
    });
  });

  it('supports Tauri native permission toggle and test notification dispatch', async () => {
    vi.stubGlobal('__TAURI_INTERNALS__', {});
    vi.mocked(tauriPluginNotification.isPermissionGranted).mockResolvedValue(false);
    vi.mocked(tauriPluginNotification.requestPermission).mockResolvedValue('granted');

    render(<NotificationSettingsCard db={db} />);
    const toggle = screen.getByTestId('browser-notifications-switch');

    fireEvent.click(toggle);

    await waitFor(async () => {
      expect(tauriPluginNotification.requestPermission).toHaveBeenCalled();
      const saved = await db.settings.get(NOTIFICATION_SETTINGS_KEY);
      const val = saved?.value as NotificationSettings;
      expect(val?.browserNotificationsEnabled).toBe(true);
    });

    // Test notification dispatch in Tauri
    vi.mocked(tauriPluginNotification.isPermissionGranted).mockResolvedValue(true);
    const testButton = screen.getByTestId('test-notification-button');
    fireEvent.click(testButton);

    await waitFor(() => {
      expect(tauriPluginNotification.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Task Planner - Thông báo thử nghiệm',
          body: 'Thông báo màn hình đang hoạt động với cài đặt của bạn.',
        })
      );
    });
  });
});
