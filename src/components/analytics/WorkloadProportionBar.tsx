import React from 'react';
import { Tooltip } from 'antd';
import type { WorkloadDistributionItem } from '../../types/analytics';
import type { WorkType } from '../../types/models';

export interface WorkloadProportionBarProps {
  items: WorkloadDistributionItem[];
  metric?: 'hours' | 'count' | undefined;
  height?: number | undefined;
}

const WORK_TYPE_COLORS: Record<WorkType, string> = {
  code: '#1677ff',
  document: '#52c41a',
  meeting: '#722ed1',
  support_testing: '#fa8c16',
  investigate: '#eb2f96',
  configuration: '#13c2c2',
  review_code: '#faad14',
};

const STAKEHOLDER_PALETTE = [
  '#1677ff',
  '#52c41a',
  '#fa8c16',
  '#722ed1',
  '#13c2c2',
  '#eb2f96',
];

export const WorkloadProportionBar: React.FC<WorkloadProportionBarProps> = ({
  items,
  metric = 'hours',
  height = 16,
}) => {
  const totalValue = items.reduce((sum, item) => {
    return sum + (metric === 'count' ? item.taskCount : item.hours);
  }, 0);

  if (totalValue <= 0 || items.length === 0) {
    return (
      <div
        data-testid="workload-proportion-bar-empty"
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

  const getItemColor = (item: WorkloadDistributionItem, index: number): string => {
    if (
      item.key === 'unassigned' ||
      item.label === 'Chưa phân công' ||
      item.label.toLowerCase() === 'unassigned'
    ) {
      return '#8c8c8c';
    }

    if (item.workType && WORK_TYPE_COLORS[item.workType]) {
      return WORK_TYPE_COLORS[item.workType];
    }

    return STAKEHOLDER_PALETTE[index % STAKEHOLDER_PALETTE.length] ?? '#1677ff';
  };

  return (
    <div
      role="progressbar"
      aria-label="Tỷ trọng phân bổ tải công việc"
      aria-valuenow={100}
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
      {items.map((item, index) => {
        const itemVal = metric === 'count' ? item.taskCount : item.hours;
        if (itemVal <= 0) return null;

        const percent = (itemVal / totalValue) * 100;
        const roundedPercent = Math.round(percent);
        const color = getItemColor(item, index);

        return (
          <Tooltip
            key={item.key}
            title={
              <div>
                <div style={{ fontWeight: 600 }}>{item.label}</div>
                <div>Số tác vụ: {item.taskCount}</div>
                <div>Thời gian: {item.hours}h</div>
                <div>Tỷ trọng: {roundedPercent}%</div>
              </div>
            }
          >
            <div
              data-testid={`proportion-segment-${item.key}`}
              style={{
                width: `${percent}%`,
                height: '100%',
                backgroundColor: color,
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
