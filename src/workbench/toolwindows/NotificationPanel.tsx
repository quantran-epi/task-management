import React, { useState, useMemo } from 'react';
import { Tabs, List, Empty, useMessage } from '../../components/ui';
import { CheckCircleOutlined } from '../../components/ui/icon';
import type { AlertNotificationItem, NotificationTabKey } from '../../types/notifications';
import { NotificationItemRow } from '../../components/notifications/NotificationItemRow';
import { useNotifications } from '../../hooks/useNotifications';
import { dismissAlertToday } from '../../db/repositories/notificationRepo';
import { getTodayDateString, isValidCalendarDate } from '../../utils/date';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { useLayoutStore, type LayoutActions } from '../store/layoutStore';

export interface NotificationPanelProps {
  db?: TaskPlannerDatabase | undefined;
}

export const NotificationPanel: React.FC<NotificationPanelProps> = ({ db = defaultDb }) => {
  const message = useMessage();
  const notifications = useNotifications(db);
  const [activeTab, setActiveTab] = useState<NotificationTabKey>('all');
  const openTab = useLayoutStore((s: LayoutActions) => s.openTab);

  const items = notifications.items;

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

  const handleDismiss = async (item: AlertNotificationItem) => {
    try {
      await dismissAlertToday(item.id, getTodayDateString(), db);
      message.success('Đã ẩn cảnh báo trong ngày hôm nay.');
    } catch (err) {
      console.error('Failed to dismiss alert:', err);
    }
  };

  const handleItemClick = (item: AlertNotificationItem) => {
    // Capacity alerts carry a `date`, not an entityId — route them to the planner on that
    // day. The old fallback opened the generic Tasks tab (or an insight-tab for a task id
    // that never existed), which was the wrong destination for every overload alert.
    if (item.entityType === 'capacity') {
      if (item.date && isValidCalendarDate(item.date)) {
        openTab({
          id: `planner-${item.date}`,
          title: 'Capacity Planner',
          viewType: 'planner',
          closable: true,
          params: { date: item.date },
        });
      } else {
        openTab({ id: 'planner', title: 'Capacity Planner', viewType: 'planner', closable: true });
      }
      return;
    }
    if (item.entityId) {
      let type: 'task' | 'cr' | 'system';
      switch (item.entityType) {
        case 'cr':
          type = 'cr';
          break;
        case 'system':
          type = 'system';
          break;
        case 'task':
        default:
          type = 'task';
          break;
      }
      openTab({
        id: `${type}-${item.entityId}`,
        title: `${type.toUpperCase()}: ${item.title}`,
        viewType: 'insight',
        closable: true,
        params: { itemType: type, itemId: item.entityId },
      });
    } else {
      openTab({
        id: 'tasks',
        title: 'Tasks',
        viewType: 'tasks',
      });
    }
  };

  const tabItems = [
    {
      key: 'all',
      label: `All (${tabCounts.all})`,
    },
    {
      key: 'deadline',
      label: tabCounts.deadline > 0 ? `Due (${tabCounts.deadline})` : 'Due',
    },
    {
      key: 'overload',
      label: tabCounts.overload > 0 ? `Overload (${tabCounts.overload})` : 'Overload',
    },
    {
      key: 'stale',
      label: tabCounts.stale > 0 ? `Stale (${tabCounts.stale})` : 'Stale',
    },
    {
      key: 'reminders',
      label: tabCounts.reminders > 0 ? `Reminders (${tabCounts.reminders})` : 'Reminders',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Category Tabs */}
      <div style={{ padding: '0 8px', borderBottom: '1px solid var(--border, #e9eaee)' }}>
        <Tabs
          activeKey={activeTab}
          onChange={(k) => setActiveTab(k as NotificationTabKey)}
          items={tabItems}
          size="small"
          tabBarStyle={{ marginBottom: 0, fontSize: 'var(--font-size-small)' }}
        />
      </div>

      {/* Notifications List */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 10px' }}>
        {filteredItems.length > 0 ? (
          <List
            dataSource={filteredItems}
            renderItem={(item) => (
              <NotificationItemRow
                key={item.id}
                item={item}
                onItemClick={handleItemClick}
                onDismiss={handleDismiss}
                db={db}
              />
            )}
            split={false}
          />
        ) : (
          <div style={{ padding: 32, textAlign: 'center' }}>
            <Empty
              image={<CheckCircleOutlined style={{ fontSize: 32, color: 'var(--success, #338555)' }} />}
              description="No active alerts"
              style={{ marginTop: 24 }}
            />
          </div>
        )}
      </div>
    </div>
  );
};
export default NotificationPanel;
