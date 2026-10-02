import React from 'react';
import { Dropdown, Tag, message, type MenuProps } from 'antd';
import type { TaskStatus } from '../../types/models';
import { updateTaskStatus } from '../../db/repositories/taskRepo';
import type { TaskPlannerDatabase } from '../../db';

export interface InlineStatusTagProps {
  taskId: string;
  status: TaskStatus;
  estimateMinutes?: number | undefined;
  onStatusChange?: ((newStatus: TaskStatus) => void) | undefined;
  db?: TaskPlannerDatabase | undefined;
}

const STATUS_CONFIG: Record<
  TaskStatus,
  { label: string; color: string; style?: React.CSSProperties }
> = {
  Open: { label: 'Mở', color: 'default' },
  Pending: { label: 'Chờ xử lý', color: 'gold' },
  'In Progress': { label: 'Đang làm', color: 'processing' },
  Resolved: { label: 'Đã giải quyết', color: 'warning' },
  'In Review': { label: 'Đang duyệt', color: 'cyan' },
  Done: { label: 'Hoàn thành', color: 'success' },
  Cancelled: {
    label: 'Đã hủy',
    color: 'default',
    style: { textDecoration: 'line-through', opacity: 0.65 },
  },
};

const ALL_STATUSES: TaskStatus[] = [
  'Open',
  'Pending',
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
      message.success({ content: 'Đã cập nhật trạng thái', duration: 1.5 });

      if (nextStatus === 'In Progress' && (!estimateMinutes || estimateMinutes === 0)) {
        message.info({
          content: 'Nhắc nhở: Tác vụ này chưa có ước tính thời gian',
          duration: 2.5,
        });
      }

      onStatusChange?.(nextStatus);
    } catch {
      message.error({ content: 'Không thể cập nhật trạng thái', duration: 2 });
    }
  };

  const menuItems: MenuProps['items'] = ALL_STATUSES.map((st) => ({
    key: st,
    label: (
      <span style={st === 'Cancelled' ? { textDecoration: 'line-through' } : undefined}>
        {STATUS_CONFIG[st]?.label || st}
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
        aria-label={`Trạng thái hiện tại: ${current.label}. Nhấn để thay đổi.`}
      >
        <span style={current.style}>{current.label}</span>
        <span style={{ fontSize: 10 }}>▾</span>
      </Tag>
    </Dropdown>
  );
};
