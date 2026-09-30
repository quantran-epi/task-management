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
  onEditCapacity?: ((date: string) => void) | undefined;
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
    label: 'Khả dụng',
    color: 'success',
    icon: <CheckCircleOutlined />,
    progressStatus: 'success',
  },
  busy: {
    label: 'Bận',
    color: 'warning',
    icon: <ClockCircleOutlined />,
    progressStatus: 'normal',
  },
  overloaded: {
    label: 'Quá tải',
    color: 'error',
    icon: <ExclamationCircleOutlined />,
    progressStatus: 'exception',
  },
  'no-capacity': {
    label: 'Nghỉ',
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
  const formattedDate = dayjs(date, 'YYYY-MM-DD').format('ddd, DD/MM');
  const statusCfg = LOAD_STATUS_CONFIG[metrics.loadState];

  const netBalanceSign = metrics.netBalanceMinutes >= 0 ? '+' : '-';
  const formattedNetBalance = `${netBalanceSign}${formatMinutes(
    Math.abs(metrics.netBalanceMinutes)
  )}`;
  const netBalanceColor = metrics.netBalanceMinutes >= 0 ? '#52c41a' : '#ff4d4f';

  const ariaDescription = `${day.dayName}, ${formattedDate}: Sức chứa ${formatMinutes(
    metrics.effectiveCapacityMinutes
  )}, Đã phân bổ ${formatMinutes(
    metrics.activeAllocatedMinutes
  )}, Còn lại ${formattedNetBalance}, Trạng thái ${statusCfg.label}`;

  return (
    <div
      data-testid={`day-column-header-${date}`}
      data-is-today={isToday ? 'true' : 'false'}
      aria-label={ariaDescription}
      style={{
        padding: '8px 10px',
        borderRadius: '6px',
        backgroundColor: isToday ? 'rgba(22, 119, 255, 0.05)' : undefined,
        border: isToday ? '1px solid #1677ff' : '1px solid #f0f0f0',
        marginBottom: '8px',
        minHeight: 142,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Date & Today Highlight */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px 6px',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '6px',
          minHeight: 26,
        }}
      >
        <Space size={6} wrap>
          <Text strong style={{ fontSize: '14px' }}>
            {formattedDate}
          </Text>
          {isToday && (
            <Tag color="processing" style={{ margin: 0, fontSize: '11px', lineHeight: '18px' }}>
              Hôm nay
            </Tag>
          )}
        </Space>

        {/* Clickable Capacity Tag (D-07) */}
        <Tooltip title="Nhấn để sửa công suất ngày">
          <Tag
            role="button"
            tabIndex={0}
            aria-label={`Sửa công suất cho ${date}`}
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
            Sức chứa: {formatMinutes(metrics.effectiveCapacityMinutes)}
          </Tag>
        </Tooltip>
      </div>

      {/* Metrics Row: Cap, Alloc, Bal (D-17) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '4px',
          fontSize: '12px',
          marginBottom: '6px',
        }}
      >
        <Text type="secondary">
          Phân bổ: {formatMinutes(metrics.activeAllocatedMinutes)}
        </Text>
        <Text strong style={{ color: netBalanceColor }}>
          Còn lại: {formattedNetBalance}
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
          alignItems: 'flex-start',
          flex: 1,
          minHeight: 46,
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
            Chuyển ngữ cảnh cao ({metrics.activeTaskCount} tác vụ)
          </Tag>
        )}
      </div>
    </div>
  );
};
