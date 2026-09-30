import React from 'react';
import { Tooltip } from 'antd';
import type { TaskStatus } from '../../types/models';

export interface StackedStatusBarProps {
  counts: Record<string, number>;
  totalTasks: number;
  height?: number | undefined;
}

interface StatusStyleConfig {
  label: string;
  color: string;
}

const STATUS_MAP: Record<TaskStatus, StatusStyleConfig> = {
  Open: { label: 'Mở', color: '#d9d9d9' },
  'In Progress': { label: 'Đang làm', color: '#1677ff' },
  'In Review': { label: 'Đang duyệt', color: '#722ed1' },
  Resolved: { label: 'Đã giải quyết', color: '#13c2c2' },
  Done: { label: 'Hoàn thành', color: '#52c41a' },
  Cancelled: { label: 'Đã hủy', color: '#ff4d4f' },
};

const ORDERED_STATUSES: TaskStatus[] = [
  'Done',
  'Resolved',
  'In Progress',
  'In Review',
  'Open',
  'Cancelled',
];

export const StackedStatusBar: React.FC<StackedStatusBarProps> = ({
  counts,
  totalTasks,
  height = 12,
}) => {
  if (totalTasks <= 0) {
    return (
      <div
        data-testid="stacked-status-bar-empty"
        style={{
          width: '100%',
          height,
          backgroundColor: '#f5f5f5',
          borderRadius: 4,
          border: '1px dashed #d9d9d9',
        }}
      />
    );
  }

  return (
    <div
      role="progressbar"
      aria-label="Phân bổ trạng thái tác vụ"
      aria-valuenow={Math.round(
        (((counts.Done ?? 0) + (counts.Resolved ?? 0)) / totalTasks) * 100
      )}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{
        display: 'flex',
        width: '100%',
        height,
        borderRadius: 4,
        overflow: 'hidden',
        backgroundColor: '#f5f5f5',
      }}
    >
      {ORDERED_STATUSES.map((status) => {
        const count = counts[status] ?? 0;
        if (count <= 0) return null;

        const config = STATUS_MAP[status];
        const percent = (count / totalTasks) * 100;
        const roundedPercent = Math.round(percent);

        return (
          <Tooltip
            key={status}
            title={`${config.label}: ${count} (${roundedPercent}%)`}
          >
            <div
              data-testid={`status-segment-${status}`}
              style={{
                width: `${percent}%`,
                height: '100%',
                backgroundColor: config.color,
                transition: 'width 0.3s ease',
                cursor: 'pointer',
              }}
            />
          </Tooltip>
        );
      })}
    </div>
  );
};
