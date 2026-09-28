# Phase 12: In-App Notifications, Proactive Alerts & Custom Reminders - Pattern Map

**Mapped:** 2026-09-28
**Files analyzed:** 18
**Analogs found:** 18 / 18

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/types/notifications.ts` | model | static-typing | `src/types/dashboard.ts` | exact |
| `src/types/models.ts` | model | static-typing | `src/types/models.ts` | exact |
| `src/db/schema.ts` | config | migration | `src/db/schema.ts` (SCHEMA_V3) | exact |
| `src/db/index.ts` | config | migration | `src/db/index.ts` (db.version setup) | exact |
| `src/validation/schemas.ts` | utility | validation | `src/validation/schemas.ts` | exact |
| `src/validation/backupSchemas.ts` | utility | validation | `src/validation/backupSchemas.ts` | exact |
| `src/utils/notifications.ts` | utility | transform | `src/utils/dashboard.ts` | exact |
| `src/db/repositories/notificationRepo.ts` | service | CRUD | `src/db/repositories/tagRepo.ts` | exact |
| `src/db/repositories/allocationRepo.ts` | service | CRUD | `src/db/repositories/allocationRepo.ts` | exact |
| `src/hooks/useNotifications.ts` | hook | reactive-query | `src/hooks/useDashboardForecast.ts` | exact |
| `src/hooks/useDesktopNotification.ts` | hook | browser-api | `src/hooks/useServiceWorkerUpdate.ts` | role-match |
| `src/components/notifications/NotificationBell.tsx` | component | request-response | `src/components/shell/StatusBadge.tsx` | exact |
| `src/components/notifications/NotificationDrawer.tsx` | component | request-response | `src/components/tasks/TaskDrawer.tsx` | role-match |
| `src/components/notifications/NotificationItemRow.tsx` | component | request-response | `src/components/dashboard/AttentionTodayList.tsx` | exact |
| `src/components/settings/NotificationSettingsCard.tsx` | component | CRUD | `src/components/settings/GitHubConfigCard.tsx` | exact |
| `src/components/shell/AppShell.tsx` | component | composition | `src/components/shell/AppShell.tsx` | exact |
| `src/components/tasks/TaskDrawer.tsx` | component | CRUD | `src/components/tasks/TaskDrawer.tsx` | exact |
| `src/components/projects/ProjectModal.tsx` | component | CRUD | `src/components/projects/ProjectModal.tsx` | exact |

---

## Pattern Assignments

### `src/types/notifications.ts` (model, static-typing)

**Analog:** `src/types/dashboard.ts` (lines 1-40)

**Imports pattern:**
```typescript
import type { Task, Project, Milestone } from './models';
```

**Core types pattern:**
```typescript
export type AlertCategory = 'overdue' | 'overload' | 'due-soon' | 'stale' | 'reminder';
export type NotificationTabKey = 'all' | 'deadline' | 'overload' | 'stale' | 'reminders';
export type NotificationEntityType = 'task' | 'project' | 'milestone' | 'capacity';

export interface AlertNotificationItem {
  id: string; // e.g. "overdue:task:123", "overload:date:2026-09-29", "stale:task:456", "reminder:task:789"
  category: AlertCategory;
  title: string;
  subtitle?: string;
  date?: string;
  tagColor: 'error' | 'warning' | 'processing' | 'blue' | 'purple' | 'gold';
  tagLabel: string;
  entityType: NotificationEntityType;
  entityId?: string;
  canDismiss: boolean;
  priorityOrder: number; // 1: overdue, 2: overload, 3: due-soon, 4: stale, 5: reminder
  task?: Task;
}

export interface NotificationState {
  items: AlertNotificationItem[];
  activeCount: number;
  categoryCounts: Record<AlertCategory, number>;
  isLoading: boolean;
}
```

---

### `src/db/schema.ts` (config, migration)

**Analog:** `src/db/schema.ts` (lines 23-32)

**Core schema pattern:**
```typescript
export const SCHEMA_V4 = {
  projects: 'id, status, deadline, reminderDate, *opsOwners, *businessAnalysts',
  milestones: 'id, projectId, status, deadline, reminderDate, *opsOwners, *businessAnalysts',
  tasks: 'id, projectId, milestoneId, status, priority, deadline, workType, jiraKey, reminderDate, *opsOwners, *businessAnalysts',
  capacityRules: 'id, &dayOfWeek',
  capacityOverrides: 'id, date',
  plannedAllocations: 'id, taskId, date',
  settings: 'key',
  backupMetadata: 'id, timestamp',
} as const;
```

---

### `src/db/index.ts` (config, migration)

**Analog:** `src/db/index.ts` (lines 40-58)

**Dexie version bump pattern:**
```typescript
// Register schema v4 without destructive data mutations
this.version(4).stores(SCHEMA_V4);
```

---

### `src/utils/notifications.ts` (utility, transform)

**Analog:** `src/utils/dashboard.ts` (lines 1-60)

**Imports pattern:**
```typescript
import dayjs from 'dayjs';
import type { Task, Project, Milestone, CapacityRule, CapacityOverride, PlannedAllocation } from '../types/models';
import type { AlertNotificationItem } from '../types/notifications';
import { getEffectiveDailyCapacity, calculateDayMetrics } from './capacity';
import { isTaskActive } from '../db/repositories/allocationRepo';
```

**Core evaluation pattern:**
```typescript
export function evaluateNotifications(params: {
  tasks: Task[];
  projects: Project[];
  milestones: Milestone[];
  rules: CapacityRule[];
  overrides: CapacityOverride[];
  allocations: PlannedAllocation[];
  dismissedMap: Record<string, string>;
  todayDate: string;
}): AlertNotificationItem[] {
  const { tasks, projects, milestones, rules, overrides, allocations, dismissedMap, todayDate } = params;
  const tomorrowDate = dayjs(todayDate, 'YYYY-MM-DD').add(1, 'day').format('YYYY-MM-DD');
  const projectMap = new Map(projects.map((p) => [p.id, p.name]));
  const results: AlertNotificationItem[] = [];

  // 1. Overdue tasks (deadline < todayDate)
  for (const task of tasks) {
    if (task.status === 'Done' || task.status === 'Cancelled') continue;
    if (task.deadline && task.deadline < todayDate) {
      const daysOverdue = dayjs(todayDate, 'YYYY-MM-DD').diff(dayjs(task.deadline, 'YYYY-MM-DD'), 'day');
      results.push({
        id: `overdue:task:${task.id}`,
        category: 'overdue',
        title: task.name,
        subtitle: task.projectId ? projectMap.get(task.projectId) : undefined,
        date: task.deadline,
        tagColor: 'error',
        tagLabel: `Quá hạn ${daysOverdue} ngày`,
        entityType: 'task',
        entityId: task.id,
        canDismiss: false,
        priorityOrder: 1,
        task,
      });
    }
  }

  // 2. Capacity Overload (14-day horizon)
  // ... (evaluate via getEffectiveDailyCapacity + calculateDayMetrics, priorityOrder: 2)

  // 3. Due Soon tasks (deadline === todayDate || deadline === tomorrowDate)
  // ... (priorityOrder: 3)

  // 4. Stale tasks (status in ['In Progress', 'In Review'] && diffDays > 5)
  // Skip if dismissedMap[alertKey] === todayDate
  // ... (priorityOrder: 4, canDismiss: true)

  // 5. Custom Reminders (reminderDate <= todayDate)
  // Skip if dismissedMap[alertKey] === todayDate
  // ... (priorityOrder: 5, canDismiss: true)

  return results.sort((a, b) => a.priorityOrder - b.priorityOrder);
}
```

---

### `src/db/repositories/notificationRepo.ts` (service, CRUD)

**Analog:** `src/components/settings/GitHubConfigCard.tsx` (lines 75-79) and `src/db/repositories/tagRepo.ts`

**Imports pattern:**
```typescript
import { db as defaultDb, type TaskPlannerDatabase } from '../index';
```

**Core dismiss pattern:**
```typescript
const DISMISSED_ALERTS_KEY = 'dismissedAlerts';

export async function getDismissedAlerts(
  db: TaskPlannerDatabase = defaultDb
): Promise<Record<string, string>> {
  const setting = await db.settings.get(DISMISSED_ALERTS_KEY);
  return (setting?.value as Record<string, string>) ?? {};
}

export async function dismissAlertToday(
  alertKey: string,
  todayDate: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const existing = await db.settings.get(DISMISSED_ALERTS_KEY);
    const map: Record<string, string> = (existing?.value as Record<string, string>) ?? {};

    // Prune stale dates to prevent unbounded storage
    const cleaned: Record<string, string> = {};
    for (const [k, d] of Object.entries(map)) {
      if (d === todayDate) cleaned[k] = d;
    }
    cleaned[alertKey] = todayDate;

    await db.settings.put({
      key: DISMISSED_ALERTS_KEY,
      value: cleaned,
    });
  });
}
```

---

### `src/hooks/useNotifications.ts` (hook, reactive-query)

**Analog:** `src/hooks/useDashboardForecast.ts` (lines 1-135)

**Core hook pattern:**
```typescript
import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs from 'dayjs';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import { getTodayDateString } from '../utils/date';
import { evaluateNotifications } from '../utils/notifications';
import type { NotificationState, AlertCategory } from '../types/notifications';

export function useNotifications(targetDb: TaskPlannerDatabase = defaultDb): NotificationState {
  const todayDate = useMemo(() => getTodayDateString(), []);
  const maxOverloadDate = useMemo(
    () => dayjs(todayDate, 'YYYY-MM-DD').add(14, 'day').format('YYYY-MM-DD'),
    [todayDate]
  );

  const liveData = useLiveQuery(async () => {
    const [tasks, projects, milestones, rules, overrides, allocations, dismissedSetting] =
      await Promise.all([
        targetDb.tasks.toArray(),
        targetDb.projects.toArray(),
        targetDb.milestones.toArray(),
        targetDb.capacityRules.toArray(),
        targetDb.capacityOverrides.where('date').between(todayDate, maxOverloadDate, true, true).toArray(),
        targetDb.plannedAllocations.where('date').between(todayDate, maxOverloadDate, true, true).toArray(),
        targetDb.settings.get('dismissedAlerts'),
      ]);

    const dismissedMap = (dismissedSetting?.value as Record<string, string>) ?? {};
    const items = evaluateNotifications({
      tasks,
      projects,
      milestones,
      rules,
      overrides,
      allocations,
      dismissedMap,
      todayDate,
    });

    const categoryCounts: Record<AlertCategory, number> = {
      overdue: 0,
      overload: 0,
      'due-soon': 0,
      stale: 0,
      reminder: 0,
    };
    for (const item of items) {
      categoryCounts[item.category]++;
    }

    return {
      items,
      activeCount: items.length,
      categoryCounts,
      isLoading: false,
    };
  }, [targetDb, todayDate, maxOverloadDate]);

  return liveData ?? {
    items: [],
    activeCount: 0,
    categoryCounts: { overdue: 0, overload: 0, 'due-soon': 0, stale: 0, reminder: 0 },
    isLoading: true,
  };
}
```

---

### `src/components/notifications/NotificationBell.tsx` (component, request-response)

**Analog:** `src/components/shell/AppShell.tsx` (lines 106-116) and `src/components/shell/StatusBadge.tsx`

**Imports pattern:**
```typescript
import React from 'react';
import { Badge, Button, Tooltip } from 'antd';
import { BellOutlined } from '@ant-design/icons';
```

**Core presentation pattern:**
```typescript
export interface NotificationBellProps {
  count: number;
  onClick: () => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ count, onClick }) => {
  return (
    <Tooltip title={`Thông báo & Nhắc nhở (${count} cảnh báo)`}>
      <Badge count={count} overflowCount={99} offset={[-2, 4]} color="#ff4d4f">
        <Button
          type="text"
          icon={<BellOutlined style={{ fontSize: 18 }} />}
          onClick={onClick}
          aria-label={`Thông báo và nhắc nhở (${count} cảnh báo)`}
          style={{ minHeight: 36, minWidth: 36 }}
        />
      </Badge>
    </Tooltip>
  );
};
```

---

### `src/components/notifications/NotificationItemRow.tsx` (component, request-response)

**Analog:** `src/components/dashboard/AttentionTodayList.tsx` (lines 98-189)

**Imports pattern:**
```typescript
import React from 'react';
import { List, Checkbox, Tag, Typography, Button, Space, message } from 'antd';
import { CalendarOutlined, EyeInvisibleOutlined, FolderOutlined, FlagOutlined } from '@ant-design/icons';
import type { AlertNotificationItem } from '../../types/notifications';
import type { Task, TaskStatus } from '../../types/models';
import type { TaskPlannerDatabase } from '../../db';
import { updateTaskStatus } from '../../db/repositories/taskRepo';
```

**Interaction pattern:**
```typescript
export interface NotificationItemRowProps {
  item: AlertNotificationItem;
  onItemClick: (item: AlertNotificationItem) => void;
  onDismiss: (item: AlertNotificationItem) => void;
  db?: TaskPlannerDatabase;
}

export const NotificationItemRow: React.FC<NotificationItemRowProps> = ({
  item,
  onItemClick,
  onDismiss,
  db,
}) => {
  const handleToggleDone = async (task: Task) => {
    const nextStatus: TaskStatus = task.status === 'Done' ? 'Open' : 'Done';
    try {
      await updateTaskStatus(task.id, nextStatus, db);
      message.success('Đã cập nhật trạng thái tác vụ.');
    } catch {
      message.error('Không thể cập nhật trạng thái tác vụ. Vui lòng thử lại.');
    }
  };

  return (
    <List.Item
      style={{ display: 'flex', alignItems: 'flex-start', padding: '12px 0', gap: 12 }}
      key={item.id}
    >
      {/* Leading icon/checkbox */}
      {item.entityType === 'task' && item.task ? (
        <Checkbox
          checked={item.task.status === 'Done'}
          onChange={() => handleToggleDone(item.task!)}
          aria-label={`Đánh dấu hoàn thành cho ${item.title}`}
          style={{ marginTop: 2 }}
        />
      ) : item.entityType === 'capacity' ? (
        <CalendarOutlined style={{ color: '#fa8c16', fontSize: 16, marginTop: 4 }} />
      ) : item.entityType === 'project' ? (
        <FolderOutlined style={{ color: '#1677ff', fontSize: 16, marginTop: 4 }} />
      ) : (
        <FlagOutlined style={{ color: '#722ed1', fontSize: 16, marginTop: 4 }} />
      )}

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <Typography.Text
          strong
          ellipsis
          style={{ cursor: 'pointer', color: '#1677ff', display: 'block' }}
          onClick={() => onItemClick(item)}
        >
          {item.title}
        </Typography.Text>
        {item.subtitle && (
          <Typography.Text type="secondary" ellipsis style={{ fontSize: 12, display: 'block' }}>
            {item.subtitle}
          </Typography.Text>
        )}
        <Space size={4} orientation="horizontal" style={{ marginTop: 4 }}>
          <Tag color={item.tagColor} style={{ margin: 0 }}>
            {item.tagLabel}
          </Tag>
        </Space>
      </div>

      {/* Trailing actions */}
      <div style={{ flexShrink: 0 }}>
        {item.entityType === 'capacity' ? (
          <Button type="link" size="small" onClick={() => onItemClick(item)}>
            Xem lịch
          </Button>
        ) : item.canDismiss ? (
          <Button
            type="text"
            size="small"
            icon={<EyeInvisibleOutlined />}
            onClick={() => onDismiss(item)}
            title="Bỏ qua hôm nay"
          >
            Bỏ qua
          </Button>
        ) : null}
      </div>
    </List.Item>
  );
};
```

---

### `src/components/notifications/NotificationDrawer.tsx` (component, request-response)

**Analog:** `src/components/tasks/TaskDrawer.tsx` (lines 1-86) and `src/components/dashboard/AttentionTodayList.tsx`

**Drawer tabs and responsive width pattern:**
```typescript
import React, { useState } from 'react';
import { Drawer, Tabs, List, Empty, Grid } from 'antd';
import type { NotificationTabKey, AlertNotificationItem } from '../../types/notifications';
import { NotificationItemRow } from './NotificationItemRow';

const { useBreakpoint } = Grid;

export interface NotificationDrawerProps {
  open: boolean;
  onClose: () => void;
  items: AlertNotificationItem[];
  onItemClick: (item: AlertNotificationItem) => void;
  onDismiss: (item: AlertNotificationItem) => void;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  open,
  onClose,
  items,
  onItemClick,
  onDismiss,
}) => {
  const screens = useBreakpoint();
  const isMobile = screens.md === false;
  const [activeTab, setActiveTab] = useState<NotificationTabKey>('all');

  const filteredItems = items.filter((item) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'deadline') return item.category === 'overdue' || item.category === 'due-soon';
    if (activeTab === 'overload') return item.category === 'overload';
    if (activeTab === 'stale') return item.category === 'stale';
    if (activeTab === 'reminders') return item.category === 'reminder';
    return true;
  });

  return (
    <Drawer
      title="Thông báo & Nhắc nhở"
      placement="right"
      width={isMobile ? '100%' : 420}
      open={open}
      onClose={onClose}
      styles={{ body: { padding: '8px 16px' } }}
    >
      <Tabs
        activeKey={activeTab}
        onChange={(k) => setActiveTab(k as NotificationTabKey)}
        items={[
          { key: 'all', label: `Tất cả (${items.length})` },
          { key: 'deadline', label: 'Quá hạn & Đến hạn' },
          { key: 'overload', label: 'Quá tải' },
          { key: 'stale', label: 'Ứ đọng' },
          { key: 'reminders', label: 'Nhắc nhở' },
        ]}
      />
      {filteredItems.length === 0 ? (
        <Empty description="Không có cảnh báo nào" style={{ padding: '32px 0' }} />
      ) : (
        <List
          dataSource={filteredItems}
          renderItem={(item) => (
            <NotificationItemRow
              key={item.id}
              item={item}
              onItemClick={onItemClick}
              onDismiss={onDismiss}
            />
          )}
        />
      )}
    </Drawer>
  );
};
```

---

### `src/components/settings/NotificationSettingsCard.tsx` (component, CRUD)

**Analog:** `src/components/settings/GitHubConfigCard.tsx` (lines 33-80)

**Imports and switch pattern:**
```typescript
import React, { useState, useEffect } from 'react';
import { Card, Switch, Space, Alert, Typography, message } from 'antd';
import { NotificationOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';

export const NotificationSettingsCard: React.FC<{ db?: TaskPlannerDatabase }> = ({ db = defaultDb }) => {
  const [enabled, setEnabled] = useState(false);
  const [permissionBlocked, setPermissionBlocked] = useState(false);

  const setting = useLiveQuery(async () => {
    return db.settings.get('browserNotificationsEnabled');
  }, [db]);

  useEffect(() => {
    if (setting) {
      setEnabled(Boolean(setting.value));
    }
  }, [setting]);

  const handleToggle = async (checked: boolean) => {
    if (checked) {
      if (!('Notification' in window)) {
        message.warning('Trình duyệt không hỗ trợ thông báo.');
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        setEnabled(true);
        setPermissionBlocked(false);
        await db.settings.put({ key: 'browserNotificationsEnabled', value: true });
        message.success('Đã bật thông báo trình duyệt.');
      } else {
        setEnabled(false);
        setPermissionBlocked(true);
        await db.settings.put({ key: 'browserNotificationsEnabled', value: false });
      }
    } else {
      setEnabled(false);
      setPermissionBlocked(false);
      await db.settings.put({ key: 'browserNotificationsEnabled', value: false });
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
    >
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Typography.Text strong>Bật thông báo màn hình khi mở ứng dụng</Typography.Text>
            <div>
              <Typography.Text type="secondary">
                Nhận thông báo tóm tắt trên màn hình khi mở ứng dụng nếu có tác vụ quá hạn, ngày quá tải hoặc nhắc nhở đến hạn hôm nay.
              </Typography.Text>
            </div>
          </div>
          <Switch checked={enabled} onChange={handleToggle} />
        </div>
        {permissionBlocked && (
          <Alert
            type="warning"
            showIcon
            message="Trình duyệt đã chặn quyền thông báo. Vui lòng cấp quyền trong cài đặt trang web của trình duyệt."
          />
        )}
      </Space>
    </Card>
  );
};
```

---

### `src/components/tasks/TaskDrawer.tsx` (Form DatePicker & Input pattern)

**Analog:** `src/components/tasks/TaskDrawer.tsx` (lines 40-57, Form items)

**Date format and clearable input pattern:**
```typescript
// Form Item in TaskDrawer / ProjectModal / MilestoneModal
<Form.Item name="reminderDate" label="Ngày nhắc nhở">
  <DatePicker
    format="YYYY-MM-DD"
    placeholder="Chọn ngày nhắc nhở"
    style={{ width: '100%' }}
    allowClear
  />
</Form.Item>

<Form.Item name="reminderNote" label="Ghi chú nhắc nhở">
  <Input
    placeholder="Nhập nội dung cần lưu ý khi đến hạn..."
    maxLength={500}
    allowClear
  />
</Form.Item>
```

---

## Shared Patterns

### Dexie Read & Reactive Query
**Source:** `src/hooks/useDashboardForecast.ts` lines 30-60
**Apply to:** `src/hooks/useNotifications.ts`, `src/components/settings/NotificationSettingsCard.tsx`
```typescript
const liveData = useLiveQuery(async () => {
  const [dataA, dataB] = await Promise.all([
    targetDb.tableA.toArray(),
    targetDb.tableB.toArray(),
  ]);
  return transform(dataA, dataB);
}, [dependencies]);
```

### Dayjs Calendar Diff & Formatting
**Source:** `src/hooks/useDashboardForecast.ts` lines 68-75
**Apply to:** `src/utils/notifications.ts`
```typescript
// Prevent timezone drift by using YYYY-MM-DD
const diffDays = dayjs(todayDate, 'YYYY-MM-DD').diff(dayjs(targetDate, 'YYYY-MM-DD'), 'day');
const nextDate = dayjs(todayDate, 'YYYY-MM-DD').add(days, 'day').format('YYYY-MM-DD');
```

### Settings KV Storage Pattern
**Source:** `src/components/settings/GitHubConfigCard.tsx` lines 75-79
**Apply to:** `src/db/repositories/notificationRepo.ts`
```typescript
await db.transaction('rw', db.settings, async () => {
  await db.settings.put({ key: 'settingName', value: payload });
});
```

---

## No Analog Found

All 18 files have direct analogs in the existing codebase.

---

## Metadata

**Analog search scope:** `src/components/`, `src/hooks/`, `src/db/`, `src/utils/`, `src/types/`
**Files scanned:** 35
**Pattern extraction date:** 2026-09-28
