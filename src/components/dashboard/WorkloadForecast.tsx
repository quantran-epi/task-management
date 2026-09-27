import React from 'react';
import { Card, Segmented, Alert, Tag, Typography, Space } from 'antd';
import type { ForecastHorizon, HorizonDayData } from '../../types/dashboard';
import { MiniDayCard } from './MiniDayCard';
import { formatMinutes } from '../../utils/time';

const { Text } = Typography;

export interface WorkloadForecastProps {
  horizon: ForecastHorizon;
  onHorizonChange: (h: ForecastHorizon) => void;
  horizonDays: HorizonDayData[];
  overloadedDays: Array<{ date: string; excessMinutes: number }>;
  onDateClick: (date: string) => void;
}

const HORIZON_OPTIONS = [
  { label: '7 ngày tới', value: 7 },
  { label: '14 ngày tới', value: 14 },
  { label: '30 ngày tới', value: 30 },
];

export const WorkloadForecast: React.FC<WorkloadForecastProps> = ({
  horizon,
  onHorizonChange,
  horizonDays,
  overloadedDays,
  onDateClick,
}) => {
  const totalExcessMinutes = overloadedDays.reduce((sum, d) => sum + d.excessMinutes, 0);

  return (
    <Card
      title="Dự báo khối lượng công việc"
      extra={
        <Segmented
          options={HORIZON_OPTIONS}
          value={horizon}
          onChange={(val) => onHorizonChange(val as ForecastHorizon)}
        />
      }
      styles={{ body: { display: 'flex', flexDirection: 'column', gap: 16 } }}
    >
      {/* Overload Alert banner per D-07 */}
      {overloadedDays.length > 0 && (
        <Alert
          type="warning"
          showIcon
          title="Phát hiện quá tải công suất"
          description={
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Text>
                Có {overloadedDays.length} ngày vượt quá sức chứa với tổng thời gian quá tải{' '}
                <Text strong type="danger">
                  {formatMinutes(totalExcessMinutes)}
                </Text>
                . Nhấn vào ngày để điều chỉnh:
              </Text>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {overloadedDays.map((d) => (
                  <Tag
                    key={d.date}
                    color="error"
                    style={{ cursor: 'pointer', padding: '2px 8px' }}
                    onClick={() => onDateClick(d.date)}
                    data-testid={`overload-chip-${d.date}`}
                  >
                    {d.date}: +{formatMinutes(d.excessMinutes)}
                  </Tag>
                ))}
              </div>
            </Space>
          }
        />
      )}

      {/* Day Cards Grid per D-06, D-13 */}
      <div
        data-testid="forecast-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 12,
        }}
      >
        {horizonDays.map((day) => (
          <MiniDayCard key={day.date} day={day} onNavigateToDate={onDateClick} />
        ))}
      </div>
    </Card>
  );
};
