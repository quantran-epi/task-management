import React, { useState } from 'react';
import { Card, Switch, Typography, Space, Alert, message } from 'antd';
import { NotificationOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';

const { Text, Paragraph } = Typography;

export interface NotificationSettingsCardProps {
  db?: TaskPlannerDatabase;
}

export const NotificationSettingsCard: React.FC<NotificationSettingsCardProps> = ({
  db = defaultDb,
}) => {
  const [permissionBlocked, setPermissionBlocked] = useState(false);

  const enabled = useLiveQuery(
    async () => {
      const setting = await db.settings.get('browserNotificationsEnabled');
      return setting?.value === true;
    },
    [db],
    false
  );

  const handleToggle = async (checked: boolean) => {
    setPermissionBlocked(false);

    if (checked) {
      if (typeof window === 'undefined' || !('Notification' in window)) {
        message.warning('Trình duyệt của bạn không hỗ trợ thông báo màn hình.');
        return;
      }

      if (Notification.permission === 'denied') {
        setPermissionBlocked(true);
        await db.settings.put({
          key: 'browserNotificationsEnabled',
          value: false,
        });
        return;
      }

      try {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          await db.settings.put({
            key: 'browserNotificationsEnabled',
            value: true,
          });
          message.success('Đã bật thông báo trình duyệt.');
        } else {
          setPermissionBlocked(true);
          await db.settings.put({
            key: 'browserNotificationsEnabled',
            value: false,
          });
        }
      } catch (err) {
        console.error('Failed to request notification permission:', err);
      }
    } else {
      await db.settings.put({
        key: 'browserNotificationsEnabled',
        value: false,
      });
      message.info('Đã tắt thông báo trình duyệt.');
    }
  };

  return (
    <Card
      title={
        <Space>
          <NotificationOutlined />
          <span>Thông báo màn hình (Desktop Notifications)</span>
        </Space>
      }
      data-testid="notification-settings-card"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <Paragraph type="secondary" style={{ margin: 0 }}>
            Nhận thông báo tóm tắt trên màn hình khi mở ứng dụng nếu có tác vụ quá hạn, ngày quá tải hoặc nhắc nhở đến hạn hôm nay.
          </Paragraph>
        </div>
        <Switch
          checked={enabled}
          onChange={handleToggle}
          aria-label="Bật hoặc tắt thông báo trình duyệt"
        />
      </div>

      {permissionBlocked && (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 16 }}
          message="Quyền thông báo bị từ chối"
          description="Trình duyệt đã chặn quyền thông báo. Vui lòng cấp quyền trong cài đặt trang web của trình duyệt (biểu tượng khóa hoặc cài đặt trên thanh địa chỉ) để sử dụng tính năng này."
        />
      )}
    </Card>
  );
};
