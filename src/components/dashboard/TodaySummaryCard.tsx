import React from 'react';
import { Card, Statistic, Progress, Tag, Button, Space, Typography, Alert } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  MinusCircleOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { DayCapacityMetrics, DailyLoadState } from '../../utils/capacity';
import { formatMinutes } from '../../utils/time';

const { Text } = Typography;

export interface TodaySummaryCardProps {
  metrics: DayCapacityMetrics | null;
  scheduledCount: number;
  todayDate?: string;
  onOpenPlanner: () => void;
}

export const LOAD_STATUS_CONFIG: Record<
  DailyLoadState,
  {
    label: string;
    color: 'success' | 'warning' | 'error' | 'default';
    icon: React.ReactNode;
  }
> = {
  available: {
    label: 'Khả dụng',
    color: 'success',
    icon: <CheckCircleOutlined />,
  },
  busy: {
    label: 'Bận',
    color: 'warning',
    icon: <ClockCircleOutlined />,
  },
  overloaded: {
    label: 'Quá tải',
    color: 'error',
    icon: <ExclamationCircleOutlined />,
  },
  'no-capacity': {
    label: 'Nghỉ',
    color: 'default',
    icon: <MinusCircleOutlined />,
  },
};

const LOAD_STROKE_COLORS: Record<DailyLoadState, string> = {
  available: '#52c41a',
  busy: '#fa8c16',
  overloaded: '#ff4d4f',
  'no-capacity': '#8c8c8c',
};

export const TodaySummaryCard: React.FC<TodaySummaryCardProps> = ({
  metrics,
  scheduledCount,
  todayDate,
  onOpenPlanner,
}) => {
  const displayDate = todayDate ? dayjs(todayDate, 'YYYY-MM-DD') : dayjs();
  const formattedDate = displayDate.isValid()
    ? displayDate.format('dddd, D MMMM YYYY')
    : dayjs().format('dddd, D MMMM YYYY');

  const allocatedMinutes = metrics
    ? (metrics.activeAllocatedMinutes ?? (metrics as unknown as { allocatedMinutes?: number }).allocatedMinutes ?? 0)
    : 0;
  const effectiveCapacityMinutes = metrics?.effectiveCapacityMinutes ?? 0;
  const loadState: DailyLoadState = metrics?.loadState ?? 'no-capacity';
  const percent = metrics ? Math.min(100, Math.max(0, metrics.percent)) : 0;
  const statusCfg = LOAD_STATUS_CONFIG[loadState];
  const strokeColor = LOAD_STROKE_COLORS[loadState];

  return (
    <Card
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>{formattedDate}</span>
          <Tag color="blue" style={{ margin: 0 }}>
            {scheduledCount} tác vụ hôm nay
          </Tag>
        </div>
      }
      data-testid="today-summary-card"
      styles={{ body: { display: 'flex', flexDirection: 'column', gap: 16 } }}
    >
      {/* KPI Statistic */}
      <Statistic
        title={<Text type="secondary">Khối lượng công việc hôm nay</Text>}
        value={`${formatMinutes(allocatedMinutes)} / ${formatMinutes(effectiveCapacityMinutes)}`}
        valueStyle={{ fontSize: 24, fontWeight: 600 }}
      />

      {/* Utilization Progress Bar */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Mức sử dụng công suất
          </Text>
          <Text strong style={{ fontSize: 12 }}>
            {percent}%
          </Text>
        </div>
        <Progress
          percent={percent}
          strokeColor={strokeColor}
          status={loadState === 'overloaded' ? 'exception' : loadState === 'available' ? 'success' : 'normal'}
          showInfo={false}
        />
      </div>

      {/* Dual-encoded status badge row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <Space size={8}>
          <Tag
            color={statusCfg.color}
            icon={statusCfg.icon}
            style={{ display: 'inline-flex', alignItems: 'center', fontSize: 13, padding: '2px 8px' }}
          >
            {statusCfg.label}
          </Tag>
        </Space>
      </div>

      {/* Contextual handling per D-04 */}
      {effectiveCapacityMinutes === 0 ? (
        <Alert
          type="info"
          showIcon
          message="Ngày nghỉ / Không có giờ làm việc"
          description="Hôm nay có 0 giờ làm việc theo lịch. Tận hưởng ngày nghỉ hoặc thêm ghi đè công suất nếu làm thêm."
          data-testid="rest-day-alert"
        />
      ) : allocatedMinutes === 0 ? (
        <Alert
          type="info"
          showIcon
          message="Lịch trình trống"
          description={`Lịch trình trống — ${formatMinutes(effectiveCapacityMinutes)} khả dụng hôm nay và chưa có tác vụ nào được lên lịch.`}
          action={
            <Button size="small" type="primary" onClick={onOpenPlanner}>
              Lên kế hoạch hôm nay
            </Button>
          }
          data-testid="clear-schedule-alert"
        />
      ) : null}

      {/* Action CTA per D-15 */}
      <Button
        type="primary"
        icon={<CalendarOutlined />}
        onClick={onOpenPlanner}
        block
        size="large"
        data-testid="open-today-planner-btn"
      >
        Mở Hôm nay trong Lịch
      </Button>
    </Card>
  );
};
