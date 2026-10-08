import React, { useState } from 'react';
import {
  Card,
  Switch,
  Typography,
  Space,
  Alert,
  Divider,
  Select,
  Checkbox,
  Row,
  Col,
  Button,
  message,
} from 'antd';
import {
  NotificationOutlined,
  ControlOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { APP_NAME } from '../../constants/app';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import {
  sendDesktopNotification,
  isTauriEnvironment,
  isNotificationPermissionGranted,
  requestNotificationPermission,
} from '../../utils/desktopNotification';
import {
  NOTIFICATION_SETTINGS_KEY,
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationSettings,
} from '../../types/notifications';

const { Text, Paragraph } = Typography;

export interface NotificationSettingsCardProps {
  db?: TaskPlannerDatabase | undefined;
}

export const NotificationSettingsCard: React.FC<NotificationSettingsCardProps> = ({
  db = defaultDb,
}) => {
  const [permissionBlocked, setPermissionBlocked] = useState(false);

  const rawSettings = useLiveQuery(
    async () => {
      const record = await db.settings.get(NOTIFICATION_SETTINGS_KEY);
      return record?.value && typeof record.value === 'object'
        ? (record.value as Partial<NotificationSettings>)
        : undefined;
    },
    [db]
  );

  const settings: NotificationSettings = {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    ...rawSettings,
    enabledCategories: {
      ...DEFAULT_NOTIFICATION_SETTINGS.enabledCategories,
      ...(rawSettings?.enabledCategories ?? {}),
    },
  };

  const saveSettings = async (partial: Partial<NotificationSettings>) => {
    const record = await db.settings.get(NOTIFICATION_SETTINGS_KEY);
    const existing =
      record?.value && typeof record.value === 'object'
        ? (record.value as Partial<NotificationSettings>)
        : {};
    const updated: NotificationSettings = {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      ...existing,
      ...partial,
      enabledCategories: {
        ...DEFAULT_NOTIFICATION_SETTINGS.enabledCategories,
        ...(existing.enabledCategories ?? {}),
        ...(partial.enabledCategories ?? {}),
      },
    };
    await db.settings.put({
      key: NOTIFICATION_SETTINGS_KEY,
      value: updated,
    });
    if (partial.browserNotificationsEnabled !== undefined) {
      await db.settings.put({
        key: 'browserNotificationsEnabled',
        value: partial.browserNotificationsEnabled,
      });
    }
  };

  const handleBrowserToggle = async (checked: boolean) => {
    setPermissionBlocked(false);

    if (checked) {
      if (!isTauriEnvironment() && (typeof window === 'undefined' || !('Notification' in window))) {
        message.warning('Trình duyệt của bạn không hỗ trợ thông báo màn hình.');
        return;
      }

      const alreadyGranted = await isNotificationPermissionGranted();
      if (alreadyGranted) {
        await saveSettings({ browserNotificationsEnabled: true });
        message.success('Đã bật thông báo màn hình.');
        await sendDesktopNotification({
          title: `${APP_NAME} - Thông báo màn hình`,
          body: 'Thông báo màn hình đã được kích hoạt thành công.',
          requireInteraction: settings.requireInteractionEnabled,
        });
        return;
      }

      if (
        !isTauriEnvironment() &&
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'denied'
      ) {
        setPermissionBlocked(true);
        await saveSettings({ browserNotificationsEnabled: false });
        return;
      }

      try {
        const granted = await requestNotificationPermission();
        if (granted) {
          await saveSettings({ browserNotificationsEnabled: true });
          message.success('Đã bật thông báo màn hình.');
          await sendDesktopNotification({
            title: `${APP_NAME} - Thông báo màn hình`,
            body: 'Thông báo màn hình đã được kích hoạt thành công.',
            requireInteraction: settings.requireInteractionEnabled,
          });
        } else {
          setPermissionBlocked(true);
          await saveSettings({ browserNotificationsEnabled: false });
        }
      } catch (err) {
        console.error('Failed to request notification permission:', err);
      }
    } else {
      await saveSettings({ browserNotificationsEnabled: false });
      message.info('Đã tắt thông báo màn hình.');
    }
  };

  const isDenied =
    permissionBlocked ||
    (typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'denied');

  return (
    <Card
      title={
        <Space>
          <NotificationOutlined />
          <span>Cài đặt thông báo & cảnh báo</span>
        </Space>
      }
      data-testid="notification-settings-card"
    >
      {/* Section 1: Thông báo trình duyệt (Desktop Notifications) */}
      <div>
        <Space style={{ marginBottom: 12 }}>
          <NotificationOutlined />
          <Text strong>Thông báo trình duyệt (Desktop Notifications)</Text>
        </Space>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
            marginBottom: 16,
          }}
        >
          <div style={{ flex: 1 }}>
            <Text strong>Bật thông báo màn hình</Text>
            <Paragraph type="secondary" style={{ margin: 0 }}>
              Hiển thị biểu ngữ thông báo của hệ điều hành khi có việc quá hạn, quá tải hoặc đến giờ nhắc nhở.
            </Paragraph>
          </div>
          <Switch
            checked={settings.browserNotificationsEnabled}
            onChange={handleBrowserToggle}
            data-testid="browser-notifications-switch"
            aria-label="Bật hoặc tắt thông báo trình duyệt"
          />
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
          }}
        >
          <div style={{ flex: 1 }}>
            <Text strong>Giữ thông báo trên màn hình</Text>
            <Paragraph type="secondary" style={{ margin: 0 }}>
              Giữ biểu ngữ thông báo hiển thị cho đến khi người dùng nhấp hoặc đóng thủ công (requireInteraction: true).
            </Paragraph>
          </div>
          <Switch
            checked={settings.requireInteractionEnabled}
            onChange={(checked) => saveSettings({ requireInteractionEnabled: checked })}
            data-testid="require-interaction-switch"
            aria-label="Giữ thông báo trên màn hình cho đến khi đóng thủ công"
          />
        </div>

        <div style={{ marginTop: 16 }}>
          <Button
            data-testid="test-notification-button"
            onClick={async () => {
              if (!isTauriEnvironment() && (typeof window === 'undefined' || !('Notification' in window))) {
                message.warning('Trình duyệt của bạn không hỗ trợ thông báo màn hình.');
                return;
              }
              const granted = await isNotificationPermissionGranted();
              if (!granted) {
                message.warning('Vui lòng cấp quyền thông báo trước.');
                return;
              }
              const sent = await sendDesktopNotification({
                title: `${APP_NAME} - Thông báo thử nghiệm`,
                body: 'Thông báo màn hình đang hoạt động với cài đặt của bạn.',
                requireInteraction: settings.requireInteractionEnabled,
              });
              if (sent) {
                message.success('Đã gửi thông báo thử nghiệm.');
              } else {
                message.error('Không thể gửi thông báo thử nghiệm.');
              }
            }}
          >
            Gửi thông báo thử nghiệm
          </Button>
        </div>

        {isDenied && (
          <Alert
            type="warning"
            showIcon
            style={{ marginTop: 16 }}
            title="Quyền thông báo bị từ chối"
            description="Vui lòng cấp quyền thông báo trong cài đặt trình duyệt để nhận cảnh báo."
            data-testid="permission-denied-alert"
          />
        )}
      </div>

      <Divider />

      {/* Section 2: Ngưỡng cảnh báo (Thresholds) */}
      <div>
        <Space style={{ marginBottom: 16 }}>
          <ControlOutlined />
          <Text strong>Ngưỡng cảnh báo (Thresholds)</Text>
        </Space>

        <Row gutter={[16, 16]}>
          <Col xs={24} sm={8}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Text>Sắp đến hạn (Due Soon)</Text>
              <Select
                value={settings.dueSoonDays}
                onChange={(val) => saveSettings({ dueSoonDays: val })}
                data-testid="due-soon-days-select"
                aria-label="Ngưỡng ngày sắp đến hạn"
                options={[
                  { value: 1, label: '1 ngày (hôm nay & ngày mai)' },
                  { value: 2, label: '2 ngày' },
                  { value: 3, label: '3 ngày' },
                  { value: 5, label: '5 ngày' },
                ]}
              />
            </div>
          </Col>

          <Col xs={24} sm={8}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Text>Việc ứ đọng (Stale Tasks)</Text>
              <Select
                value={settings.staleTaskDays}
                onChange={(val) => saveSettings({ staleTaskDays: val })}
                data-testid="stale-task-days-select"
                aria-label="Ngưỡng ngày tác vụ ứ đọng"
                options={[
                  { value: 3, label: '3 ngày' },
                  { value: 5, label: '5 ngày (mặc định)' },
                  { value: 7, label: '7 ngày' },
                  { value: 14, label: '14 ngày' },
                ]}
              />
            </div>
          </Col>

          <Col xs={24} sm={8}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Text>Ngưỡng quá tải công suất</Text>
              <Select
                value={settings.capacityOverloadThreshold}
                onChange={(val) => saveSettings({ capacityOverloadThreshold: val })}
                data-testid="capacity-overload-select"
                aria-label="Ngưỡng tỷ lệ quá tải công suất"
                options={[
                  { value: 100, label: '100% công suất (mặc định)' },
                  { value: 110, label: '110% công suất' },
                  { value: 120, label: '120% công suất' },
                ]}
              />
            </div>
          </Col>
        </Row>
      </div>

      <Divider />

      {/* Section 3: Nhóm cảnh báo hiển thị (Categories) */}
      <div>
        <Space orientation="horizontal" style={{ marginBottom: 12 }}>
          <AppstoreOutlined />
          <Text strong>Nhóm cảnh báo hiển thị (Categories)</Text>
        </Space>
        <Paragraph type="secondary" style={{ marginBottom: 16 }}>
          Chọn các loại cảnh báo bạn muốn nhận và theo dõi trong ứng dụng.
        </Paragraph>

        <Row gutter={[16, 12]}>
          <Col xs={24} sm={12} md={8}>
            <Checkbox
              checked={settings.enabledCategories.overdue}
              onChange={(e) =>
                saveSettings({
                  enabledCategories: {
                    ...settings.enabledCategories,
                    overdue: e.target.checked,
                  },
                })
              }
              data-testid="category-checkbox-overdue"
            >
              Quá hạn (Overdue)
            </Checkbox>
          </Col>

          <Col xs={24} sm={12} md={8}>
            <Checkbox
              checked={settings.enabledCategories.dueSoon}
              onChange={(e) =>
                saveSettings({
                  enabledCategories: {
                    ...settings.enabledCategories,
                    dueSoon: e.target.checked,
                  },
                })
              }
              data-testid="category-checkbox-dueSoon"
            >
              Sắp đến hạn (Due Soon)
            </Checkbox>
          </Col>

          <Col xs={24} sm={12} md={8}>
            <Checkbox
              checked={settings.enabledCategories.overload}
              onChange={(e) =>
                saveSettings({
                  enabledCategories: {
                    ...settings.enabledCategories,
                    overload: e.target.checked,
                  },
                })
              }
              data-testid="category-checkbox-overload"
            >
              Quá tải công suất (Overload)
            </Checkbox>
          </Col>

          <Col xs={24} sm={12} md={8}>
            <Checkbox
              checked={settings.enabledCategories.stale}
              onChange={(e) =>
                saveSettings({
                  enabledCategories: {
                    ...settings.enabledCategories,
                    stale: e.target.checked,
                  },
                })
              }
              data-testid="category-checkbox-stale"
            >
              Việc ứ đọng (Stale)
            </Checkbox>
          </Col>

          <Col xs={24} sm={12} md={8}>
            <Checkbox
              checked={settings.enabledCategories.reminders}
              onChange={(e) =>
                saveSettings({
                  enabledCategories: {
                    ...settings.enabledCategories,
                    reminders: e.target.checked,
                  },
                })
              }
              data-testid="category-checkbox-reminders"
            >
              Nhắc nhở tùy chỉnh (Reminders)
            </Checkbox>
          </Col>

          <Col xs={24} sm={12} md={8}>
            <Checkbox
              checked={settings.enabledCategories.timer}
              onChange={(e) =>
                saveSettings({
                  enabledCategories: {
                    ...settings.enabledCategories,
                    timer: e.target.checked,
                  },
                })
              }
              data-testid="category-checkbox-timer"
            >
              Cảnh báo đồng hồ (Timer)
            </Checkbox>
          </Col>
        </Row>
      </div>
    </Card>
  );
};
