import React from 'react';
import { Dropdown, Tag, message, type MenuProps } from 'antd';
import type { TaskStatus } from '../../types/models';
import { updateTaskStatus } from '../../db/repositories/taskRepo';
import type { TaskPlannerDatabase } from '../../db';

export interface InlineStatusTagProps {
  taskId: string;
  status: TaskStatus;
  estimateMinutes?: number;
  onStatusChange?: (newStatus: TaskStatus) => void;
  db?: TaskPlannerDatabase;
}

const STATUS_CONFIG: Record<
  TaskStatus,
  { label: string; color: string; style?: React.CSSProperties }
> = {
  Open: { label: 'Open', color: 'default' },
  'In Progress': { label: 'In Progress', color: 'processing' },
  Resolved: { label: 'Resolved', color: 'warning' },
  'In Review': { label: 'In Review', color: 'cyan' },
  Done: { label: 'Done', color: 'success' },
  Cancelled: {
    label: 'Cancelled',
    color: 'default',
    style: { textDecoration: 'line-through', opacity: 0.65 },
  },
};

const ALL_STATUSES: TaskStatus[] = [
  'Open',
  'In Progress',
  'Resolved',
  'In Review',
  'Done',
  'Cancelled',
];

export const InlineStatusTag: React.FC<InlineStatusTagProps> = ({
  taskId,
  status,
  estimateMinutes,
  onStatusChange,
  db,
}) => {
  const current = STATUS_CONFIG[status] ?? { label: status, color: 'default' };

  const handleMenuClick: MenuProps['onClick'] = async ({ key }) => {
    const nextStatus = key as TaskStatus;
    if (nextStatus === status) return;

    try {
      await updateTaskStatus(taskId, nextStatus, db);
      message.success({ content: 'Status updated', duration: 1.5 });

      if (nextStatus === 'In Progress' && (!estimateMinutes || estimateMinutes === 0)) {
        message.info({
          content: 'Reminder: This task has no time estimate',
          duration: 2.5,
        });
      }

      onStatusChange?.(nextStatus);
    } catch {
      message.error({ content: 'Failed to update status', duration: 2 });
    }
  };

  const menuItems: MenuProps['items'] = ALL_STATUSES.map((st) => ({
    key: st,
    label: (
      <span style={st === 'Cancelled' ? { textDecoration: 'line-through' } : undefined}>
        {st}
      </span>
    ),
  }));

  return (
    <Dropdown menu={{ items: menuItems, onClick: handleMenuClick }} trigger={['click']}>
      <Tag
        color={current.color}
        style={{
          cursor: 'pointer',
          userSelect: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          margin: 0,
          ...current.style,
        }}
        role="button"
        aria-label={`Current status: ${status}. Click to change.`}
      >
        <span style={current.style}>{current.label}</span>
        <span style={{ fontSize: 10 }}>▾</span>
      </Tag>
    </Dropdown>
  );
};
