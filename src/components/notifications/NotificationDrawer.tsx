import React, { useState, useMemo } from 'react';
import { Drawer, Tabs, List, Empty, Badge, Grid } from 'antd';
import type { AlertNotificationItem, NotificationTabKey } from '../../types/notifications';
import { NotificationItemRow } from './NotificationItemRow';
import type { TaskPlannerDatabase } from '../../db';

export interface NotificationDrawerProps {
  open: boolean;
  onClose: () => void;
  items: AlertNotificationItem[];
  onItemClick: (item: AlertNotificationItem) => void;
  onDismiss: (item: AlertNotificationItem) => void;
  db?: TaskPlannerDatabase;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  open,
  onClose,
  items,
  onItemClick,
  onDismiss,
  db,
}) => {
  const screens = Grid.useBreakpoint();
  const [activeTab, setActiveTab] = useState<NotificationTabKey>('all');

  const isMobile = screens.md === false;
  const drawerWidth = isMobile ? '100%' : 420;

  const filteredItems = useMemo(() => {
    switch (activeTab) {
      case 'deadline':
        return items.filter(
          (item) => item.category === 'overdue' || item.category === 'due-soon'
        );
      case 'overload':
        return items.filter((item) => item.category === 'overload');
      case 'stale':
        return items.filter((item) => item.category === 'stale');
      case 'reminders':
        return items.filter((item) => item.category === 'reminder');
      case 'all':
      default:
        return items;
    }
  }, [items, activeTab]);

  const tabCounts = useMemo(() => {
    const counts = {
      all: items.length,
      deadline: 0,
      overload: 0,
      stale: 0,
      reminders: 0,
    };
    for (const item of items) {
      if (item.category === 'overdue' || item.category === 'due-soon') {
        counts.deadline++;
      } else if (item.category === 'overload') {
        counts.overload++;
      } else if (item.category === 'stale') {
        counts.stale++;
      } else if (item.category === 'reminder') {
        counts.reminders++;
      }
    }
    return counts;
  }, [items]);

  const tabItems = [
    {
      key: 'all',
      label: `Tất cả (${tabCounts.all})`,
    },
    {
      key: 'deadline',
      label: tabCounts.deadline > 0 ? `Quá hạn & Đến hạn (${tabCounts.deadline})` : 'Quá hạn & Đến hạn',
    },
    {
      key: 'overload',
      label: tabCounts.overload > 0 ? `Quá tải (${tabCounts.overload})` : 'Quá tải',
    },
    {
      key: 'stale',
      label: tabCounts.stale > 0 ? `Ứ đọng (${tabCounts.stale})` : 'Ứ đọng',
    },
    {
      key: 'reminders',
      label: tabCounts.reminders > 0 ? `Nhắc nhở (${tabCounts.reminders})` : 'Nhắc nhở',
    },
  ];

  return (
    <Drawer
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Thông báo & Nhắc nhở</span>
          <Badge
            count={items.length}
            overflowCount={99}
            style={{ backgroundColor: items.length > 0 ? '#ff4d4f' : '#d9d9d9' }}
          />
        </div>
      }
      placement="right"
      width={drawerWidth}
      open={open}
      onClose={onClose}
      styles={{
        body: { padding: 0, display: 'flex', flexDirection: 'column' },
      }}
    >
      <Tabs
        activeKey={activeTab}
        onChange={(k) => setActiveTab(k as NotificationTabKey)}
        items={tabItems}
        tabBarStyle={{ padding: '0 16px', margin: 0 }}
      />
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filteredItems.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Không có cảnh báo nào"
            style={{ padding: '48px 0' }}
          />
        ) : (
          <List
            dataSource={filteredItems}
            renderItem={(item) => (
              <NotificationItemRow
                key={item.id}
                item={item}
                onItemClick={onItemClick}
                onDismiss={onDismiss}
                db={db}
              />
            )}
          />
        )}
      </div>
    </Drawer>
  );
};
