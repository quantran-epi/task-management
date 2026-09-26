import React from 'react';
import { Tag, Progress, Space, Typography, Tooltip } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  MinusCircleOutlined,
  WarningOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { DayPlannerData } from '../../hooks/useWeeklyPlanner';
import type { DailyLoadState } from '../../utils/capacity';
import { formatMinutes } from '../../utils/time';

const { Text } = Typography;

export interface DayColumnHeaderProps {
  day: DayPlannerData;
  onEditCapacity?: (date: string) => void;
}

const LOAD_STATUS_CONFIG: Record<
  DailyLoadState,
  {
    label: string;
    color: 'success' | 'warning' | 'error' | 'default';
    icon: React.ReactNode;
    progressStatus: 'success' | 'normal' | 'exception' | 'active';
  }
> = {
  available: {
    label: 'Available',
    color: 'success',
    icon: <CheckCircleOutlined />,
    progressStatus: 'success',
  },
  busy: {
    label: 'Busy',
    color: 'warning',
    icon: <ClockCircleOutlined />,
    progressStatus: 'normal',
  },
  overloaded: {
    label: 'Overloaded',
    color: 'error',
    icon: <ExclamationCircleOutlined />,
    progressStatus: 'exception',
  },
  'no-capacity': {
    label: 'No Capacity',
    color: 'default',
    icon: <MinusCircleOutlined />,
    progressStatus: 'normal',
  },
};

export const DayColumnHeader: React.FC<DayColumnHeaderProps> = ({
  day,
  onEditCapacity,
}) => {
  const { date, isToday, metrics } = day;
  const formattedDate = dayjs(date, 'YYYY-MM-DD').format('ddd, MMM D');
  const statusCfg = LOAD_STATUS_CONFIG[metrics.loadState];

  const netBalanceSign = metrics.netBalanceMinutes >= 0 ? '+' : '-';
  const formattedNetBalance = `${netBalanceSign}${formatMinutes(
    Math.abs(metrics.netBalanceMinutes)
  )}`;
  const netBalanceColor = metrics.netBalanceMinutes >= 0 ? '#52c41a' : '#ff4d4f';

  const ariaDescription = `${day.dayName}, ${formattedDate}: Capacity ${formatMinutes(
    metrics.effectiveCapacityMinutes
  )}, Allocated ${formatMinutes(
    metrics.activeAllocatedMinutes
  )}, Net Balance ${formattedNetBalance}, Load status ${statusCfg.label}`;

  return (
    <div
      data-testid={`day-column-header-${date}`}
      data-is-today={isToday ? 'true' : 'false'}
      aria-label={ariaDescription}
      style={{
        padding: '12px',
        borderRadius: '6px',
        backgroundColor: isToday ? 'rgba(22, 119, 255, 0.05)' : undefined,
        border: isToday ? '1px solid #1677ff' : '1px solid #f0f0f0',
        marginBottom: '8px',
      }}
    >
      {/* Date & Today Highlight */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '6px',
        }}
      >
        <Space size={6}>
          <Text strong style={{ fontSize: '15px' }}>
            {formattedDate}
          </Text>
          {isToday && (
            <Tag color="processing" style={{ margin: 0, fontSize: '11px', lineHeight: '18px' }}>
              Today
            </Tag>
          )}
        </Space>

        {/* Clickable Capacity Tag (D-07) */}
        <Tooltip title="Click to edit date capacity">
          <Tag
            role="button"
            tabIndex={0}
            aria-label={`Edit capacity for ${date}`}
            icon={<CalendarOutlined />}
            onClick={() => onEditCapacity?.(date)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onEditCapacity?.(date);
              }
            }}
            style={{
              cursor: onEditCapacity ? 'pointer' : 'default',
              margin: 0,
              fontWeight: 600,
            }}
          >
            Cap: {formatMinutes(metrics.effectiveCapacityMinutes)}
          </Tag>
        </Tooltip>
      </div>

      {/* Metrics Row: Cap, Alloc, Bal (D-17) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '12px',
          marginBottom: '6px',
        }}
      >
        <Text type="secondary">
          Alloc: {formatMinutes(metrics.activeAllocatedMinutes)}
        </Text>
        <Text strong style={{ color: netBalanceColor }}>
          Bal: {formattedNetBalance}
        </Text>
      </div>

      {/* Progress Bar (Dual-encoding) */}
      <Progress
        percent={metrics.percent}
        status={statusCfg.progressStatus}
        size="small"
        showInfo={false}
        style={{ marginBottom: '6px' }}
      />

      {/* Load Status Badge & Context Switching Warning (D-13, D-15, PLAN-04) */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px',
          alignItems: 'center',
        }}
      >
        <Tag
          color={statusCfg.color}
          icon={statusCfg.icon}
          style={{ margin: 0, fontSize: '12px', display: 'inline-flex', alignItems: 'center' }}
        >
          {statusCfg.label}
        </Tag>

        {metrics.isHighContextSwitching && (
          <Tag
            color="warning"
            icon={<WarningOutlined />}
            style={{ margin: 0, fontSize: '11px', display: 'inline-flex', alignItems: 'center' }}
          >
            High context switching ({metrics.activeTaskCount} tasks)
          </Tag>
        )}
      </div>
    </div>
  );
};
