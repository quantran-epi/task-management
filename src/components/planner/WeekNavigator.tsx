import React from 'react';
import { Button, DatePicker, Space, Typography } from 'antd';
import {
  LeftOutlined,
  RightOutlined,
  CalendarOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';

dayjs.extend(isoWeek);

const { Text } = Typography;

export interface WeekNavigatorProps {
  currentDate: string;
  onDateChange: (date: string) => void;
  onOpenCapacitySettings: () => void;
}

export const WeekNavigator: React.FC<WeekNavigatorProps> = ({
  currentDate,
  onDateChange,
  onOpenCapacitySettings,
}) => {
  const current = dayjs(currentDate, 'YYYY-MM-DD').isValid()
    ? dayjs(currentDate, 'YYYY-MM-DD')
    : dayjs();

  const weekStart = current.startOf('isoWeek');
  const weekEnd = current.endOf('isoWeek');

  const formattedRange =
    weekStart.year() === weekEnd.year()
      ? `${weekStart.format('MMM D')} – ${weekEnd.format('MMM D, YYYY')}`
      : `${weekStart.format('MMM D, YYYY')} – ${weekEnd.format('MMM D, YYYY')}`;

  const handlePrevWeek = () => {
    const prev = current.subtract(1, 'week').startOf('isoWeek').format('YYYY-MM-DD');
    onDateChange(prev);
  };

  const handleNextWeek = () => {
    const next = current.add(1, 'week').startOf('isoWeek').format('YYYY-MM-DD');
    onDateChange(next);
  };

  const handleToday = () => {
    const today = dayjs().format('YYYY-MM-DD');
    onDateChange(today);
  };

  const handlePickerChange = (date: Dayjs | null) => {
    if (date) {
      onDateChange(date.startOf('isoWeek').format('YYYY-MM-DD'));
    }
  };

  return (
    <div
      data-testid="week-navigator"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <Space wrap size="middle">
        {/* Navigation Button Group (D-02) */}
        <Space.Compact>
          <Button
            icon={<LeftOutlined />}
            onClick={handlePrevWeek}
            aria-label="Previous Week"
            title="Previous Week (Alt+Left)"
          />
          <Button onClick={handleToday} aria-label="Today" title="Jump to Today (Alt+T)">
            Today
          </Button>
          <Button
            icon={<RightOutlined />}
            onClick={handleNextWeek}
            aria-label="Next Week"
            title="Next Week (Alt+Right)"
          />
        </Space.Compact>

        {/* Week DatePicker */}
        <DatePicker
          picker="week"
          value={weekStart}
          onChange={handlePickerChange}
          format="YYYY-[W]ww"
          allowClear={false}
          aria-label="Select calendar week"
          style={{ width: 140 }}
        />

        {/* Display Formatted Range */}
        <Text strong style={{ fontSize: 16 }}>
          {formattedRange}
        </Text>
      </Space>

      {/* Action Button: Capacity Settings (D-05) */}
      <Button
        icon={<SettingOutlined />}
        onClick={onOpenCapacitySettings}
        aria-label="Capacity Settings"
      >
        Capacity Settings
      </Button>
    </div>
  );
};
