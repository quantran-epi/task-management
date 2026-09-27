import React from 'react';
import { Card, Space, Typography, InputNumber, Button, Row, Col } from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { updateCapacityRule } from '../../db/repositories/capacityRepo';
import { formatMinutes } from '../../utils/time';
import type { CapacityRule } from '../../types/models';

const { Text, Title } = Typography;

interface WeekdayConfig {
  dayOfWeek: number;
  label: string;
}

const WEEKDAYS: WeekdayConfig[] = [
  { dayOfWeek: 1, label: 'Thứ Hai' },
  { dayOfWeek: 2, label: 'Thứ Ba' },
  { dayOfWeek: 3, label: 'Thứ Tư' },
  { dayOfWeek: 4, label: 'Thứ Năm' },
  { dayOfWeek: 5, label: 'Thứ Sáu' },
  { dayOfWeek: 6, label: 'Thứ Bảy' },
  { dayOfWeek: 0, label: 'Chủ Nhật' },
];

export interface WeeklyCapacityFormProps {
  db?: TaskPlannerDatabase;
}

export const WeeklyCapacityForm: React.FC<WeeklyCapacityFormProps> = ({ db = defaultDb }) => {
  const rules = useLiveQuery(
    async () => {
      const records = await db.capacityRules.toArray();
      const map = new Map<number, CapacityRule>();
      records.forEach((r) => map.set(r.dayOfWeek, r));
      return map;
    },
    [db],
    new Map<number, CapacityRule>()
  );

  const handleUpdate = async (dayOfWeek: number, hours: number, minutes: number) => {
    const totalMinutes = Math.min(1440, Math.max(0, hours * 60 + minutes));
    await updateCapacityRule(dayOfWeek, totalMinutes, db);
  };

  const handlePreset = async (dayOfWeek: number, presetHours: number) => {
    await updateCapacityRule(dayOfWeek, presetHours * 60, db);
  };

  const totalWeeklyMinutes = WEEKDAYS.reduce((sum, day) => {
    const rule = rules.get(day.dayOfWeek);
    const mins = rule !== undefined ? rule.workMinutes : (day.dayOfWeek >= 1 && day.dayOfWeek <= 5 ? 480 : 0);
    return sum + mins;
  }, 0);

  return (
    <Card
      title={<Title level={5} style={{ margin: 0 }}>Mẫu công suất cơ bản hàng tuần</Title>}
      extra={
        <Text strong type="secondary" data-testid="weekly-total">
          Tổng hàng tuần: {formatMinutes(totalWeeklyMinutes)}
        </Text>
      }
      size="small"
      style={{ marginBottom: 16 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 4 }}>
        {WEEKDAYS.map((day) => {
          const rule = rules.get(day.dayOfWeek);
          const totalMinutes = rule !== undefined ? rule.workMinutes : (day.dayOfWeek >= 1 && day.dayOfWeek <= 5 ? 480 : 0);
          const hours = Math.floor(totalMinutes / 60);
          const minutes = totalMinutes % 60;

          return (
            <Row
              key={day.dayOfWeek}
              align="middle"
              gutter={[12, 8]}
              style={{
                padding: '6px 0',
                borderBottom: day.dayOfWeek === 0 ? 'none' : '1px solid #f0f0f0',
              }}
              data-testid={`weekday-row-${day.dayOfWeek}`}
            >
              <Col xs={24} sm={6}>
                <Text strong style={{ minWidth: 100, display: 'inline-block' }}>
                  {day.label}
                </Text>
              </Col>

              <Col xs={14} sm={10}>
                <Space align="center" size={4}>
                  <InputNumber
                    min={0}
                    max={24}
                    value={hours}
                    onChange={(val) => handleUpdate(day.dayOfWeek, val ?? 0, minutes)}
                    aria-label={`${day.label} hours`}
                    suffix="h"
                    style={{ width: 90 }}
                  />
                  <InputNumber
                    min={0}
                    max={59}
                    step={15}
                    value={minutes}
                    onChange={(val) => handleUpdate(day.dayOfWeek, hours, val ?? 0)}
                    aria-label={`${day.label} minutes`}
                    suffix="m"
                    style={{ width: 90 }}
                  />
                </Space>
              </Col>

              <Col xs={10} sm={8}>
                <Space size={4}>
                  <Button
                    size="small"
                    onClick={() => handlePreset(day.dayOfWeek, 0)}
                    aria-label={`Set ${day.label} to 0h`}
                  >
                    0h
                  </Button>
                  <Button
                    size="small"
                    onClick={() => handlePreset(day.dayOfWeek, 4)}
                    aria-label={`Set ${day.label} to 4h`}
                  >
                    4h
                  </Button>
                  <Button
                    size="small"
                    onClick={() => handlePreset(day.dayOfWeek, 8)}
                    aria-label={`Set ${day.label} to 8h`}
                  >
                    8h
                  </Button>
                </Space>
              </Col>
            </Row>
          );
        })}
      </div>
    </Card>
  );
};
