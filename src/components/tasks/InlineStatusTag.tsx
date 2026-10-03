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

interface StatusTheme {
  label: string;
  bg: string;
  color: string;
  borderColor: string;
  textDecoration?: string;
  opacity?: number;
}

const STATUS_CONFIG: Record<TaskStatus, StatusTheme> = {
  Open: {
    label: 'Mở',
    bg: '#f1f5f9',
    color: '#475569',
    borderColor: '#e2e8f0',
  },
  Pending: {
    label: 'Chờ xử lý',
    bg: '#fffbeb',
    color: '#b45309',
    borderColor: '#fde68a',
  },
  'In Progress': {
    label: 'Đang làm',
    bg: '#eef2ff',
    color: '#4338ca',
    borderColor: '#c7d2fe',
  },
  Resolved: {
    label: 'Đã giải quyết',
    bg: '#faf5ff',
    color: '#7e22ce',
    borderColor: '#e9d5ff',
  },
  'In Review': {
    label: 'Đang duyệt',
    bg: '#f0f9ff',
    color: '#0284c7',
    borderColor: '#bae6fd',
  },
  Done: {
    label: 'Hoàn thành',
    bg: '#ecfdf5',
    color: '#047857',
    borderColor: '#a7f3d0',
  },
  Cancelled: {
    label: 'Đã hủy',
    bg: '#f8fafc',
    color: '#94a3b8',
    borderColor: '#e2e8f0',
    textDecoration: 'line-through',
    opacity: 0.75,
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
  const current = STATUS_CONFIG[status] ?? {
    label: status,
    bg: '#f1f5f9',
    color: '#475569',
    borderColor: '#e2e8f0',
  };

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

  const menuItems: MenuProps['items'] = ALL_STATUSES.map((st) => {
    const cfg = STATUS_CONFIG[st];
    return {
      key: st,
      label: (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            textDecoration: cfg?.textDecoration,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: cfg?.color || '#94a3b8',
              display: 'inline-block',
            }}
          />
          {cfg?.label || st}
        </span>
      ),
    };
  });

  return (
    <Dropdown menu={{ items: menuItems, onClick: handleMenuClick }} trigger={['click']}>
      <Tag
        bordered={false}
        style={{
          cursor: 'pointer',
          userSelect: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          margin: 0,
          borderRadius: 12,
          padding: '1px 10px',
          fontSize: 12,
          fontWeight: 500,
          backgroundColor: current.bg,
          color: current.color,
          border: `1px solid ${current.borderColor}`,
          textDecoration: current.textDecoration,
          opacity: current.opacity,
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        role="button"
        aria-label={`Trạng thái hiện tại: ${current.label}. Nhấn để thay đổi.`}
      >
        <span>{current.label}</span>
        <span style={{ fontSize: 9, opacity: 0.7, marginLeft: 1 }}>▾</span>
      </Tag>
    </Dropdown>
  );
};
