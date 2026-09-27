import React from 'react';
import { Tag, Progress, Space, Typography } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  MinusCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { HorizonDayData } from '../../types/dashboard';
import type { DailyLoadState } from '../../utils/capacity';
import { formatMinutes } from '../../utils/time';

const { Text } = Typography;

export interface MiniDayCardProps {
  day: HorizonDayData;
  onNavigateToDate: (date: string) => void;
}

const LOAD_STATUS_CONFIG: Record<
  DailyLoadState,
  {
    label: string;
    color: 'success' | 'warning' | 'error' | 'default';
    icon: React.ReactNode;
    progressStatus: 'success' | 'normal' | 'exception' | 'active';
    progressColor?: string;
  }
> = {
  available: {
    label: 'Khả dụng',
    color: 'success',
    icon: <CheckCircleOutlined />,
    progressStatus: 'success',
    progressColor: '#52c41a',
  },
  busy: {
    label: 'Bận',
    color: 'warning',
    icon: <ClockCircleOutlined />,
    progressStatus: 'normal',
    progressColor: '#fa8c16',
  },
  overloaded: {
    label: 'Quá tải',
    color: 'error',
    icon: <ExclamationCircleOutlined />,
    progressStatus: 'exception',
    progressColor: '#ff4d4f',
  },
  'no-capacity': {
    label: 'Nghỉ',
    color: 'default',
    icon: <MinusCircleOutlined />,
    progressStatus: 'normal',
    progressColor: '#8c8c8c',
  },
};

export const MiniDayCard: React.FC<MiniDayCardProps> = ({ day, onNavigateToDate }) => {
  const { date, isToday, metrics, excessMinutes } = day;
  const statusCfg = LOAD_STATUS_CONFIG[metrics.loadState];
  const formattedDate = dayjs(date, 'YYYY-MM-DD').format('D/M');
  const dayName = day.dayName;

  // Clamp progress percentage to valid non-negative range [0, 100] per T-05-06
  const progressPercent = Math.min(100, Math.max(0, metrics.percent));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onNavigateToDate(date);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`mini-day-card-${date}`}
      aria-label={`${date}: ${statusCfg.label}, ${formatMinutes(metrics.activeAllocatedMinutes)} trên ${formatMinutes(metrics.effectiveCapacityMinutes)}`}
      onClick={() => onNavigateToDate(date)}
      onKeyDown={handleKeyDown}
      style={{
        cursor: 'pointer',
        minWidth: 180,
        padding: '8px 10px',
        borderRadius: 6,
        border: metrics.isOverloaded
          ? '1px solid #ff4d4f'
          : isToday
          ? '1px solid #1677ff'
          : '1px solid #f0f0f0',
        backgroundColor: isToday ? 'rgba(22, 119, 255, 0.05)' : '#ffffff',
        transition: 'all 0.2s ease',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      {/* Top row: Date, Day name, and Today badge */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Space size={4}>
          <Text strong style={{ fontSize: 13 }}>
            {formattedDate}
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            ({dayName})
          </Text>
        </Space>
        {isToday && (
          <Tag color="processing" style={{ margin: 0, fontSize: 11, lineHeight: '18px', padding: '0 4px' }}>
            Hôm nay
          </Tag>
        )}
      </div>

      {/* Capacity & allocated figures */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <Text type="secondary">
          {formatMinutes(metrics.activeAllocatedMinutes)} / {formatMinutes(metrics.effectiveCapacityMinutes)}
        </Text>
        {metrics.isOverloaded ? (
          <Text type="danger" strong>
            +{formatMinutes(excessMinutes)} vượt
          </Text>
        ) : (
          <Text type="secondary">
            {metrics.netBalanceMinutes >= 0 ? `+${formatMinutes(metrics.netBalanceMinutes)}` : '0m'}
          </Text>
        )}
      </div>

      {/* Progress bar */}
      <Progress
        percent={progressPercent}
        size="small"
        status={statusCfg.progressStatus}
        strokeColor={statusCfg.progressColor}
        showInfo={false}
        style={{ margin: 0 }}
      />

      {/* Bottom row: Load status badge */}
      <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center' }}>
        <Tag
          color={statusCfg.color}
          icon={statusCfg.icon}
          style={{ margin: 0, fontSize: 11, padding: '0 6px' }}
        >
          {statusCfg.label}
        </Tag>
      </div>
    </div>
  );
};
