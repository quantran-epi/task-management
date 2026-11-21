import React from 'react';
import { Button, DatePicker, Space, Typography, SpaceCompact } from '../ui';
import { LeftOutlined, RightOutlined, SettingOutlined } from '../ui/icon';
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
      ? `${weekStart.format('DD/MM')} – ${weekEnd.format('DD/MM/YYYY')}`
      : `${weekStart.format('DD/MM/YYYY')} – ${weekEnd.format('DD/MM/YYYY')}`;

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
        <SpaceCompact>
          <Button
            icon={<LeftOutlined />}
            onClick={handlePrevWeek}
            aria-label="Tuần trước"
            title="Tuần trước (Alt+Left)"
          />
          <Button onClick={handleToday} aria-label="Hôm nay" title="Về hôm nay (Alt+T)">
            Hôm nay
          </Button>
          <Button
            icon={<RightOutlined />}
            onClick={handleNextWeek}
            aria-label="Tuần sau"
            title="Tuần sau (Alt+Right)"
          />
        </SpaceCompact>

        {/* Week DatePicker */}
        <DatePicker
          picker="week"
          value={weekStart}
          onChange={handlePickerChange}
          format={(d) => `Tuần ${d.isoWeek()} (${d.year()})`}
          allowClear={false}
          aria-label="Chọn tuần làm việc"
          style={{ width: 160 }}
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
        aria-label="Cài đặt công suất"
      >
        Cài đặt công suất
      </Button>
    </div>
  );
};
