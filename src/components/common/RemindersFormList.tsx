import React from 'react';
import { Form, DatePicker, TimePicker, Input, Button, Space, Typography } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { ReminderItem } from '../../types/models';

const { Text } = Typography;

const generateId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : '00000000-0000-4000-8000-' + Math.random().toString(16).slice(2, 14).padEnd(12, '0');

export interface RemindersFormListProps {
  label?: React.ReactNode;
}

/**
 * Format domain entity reminder data into Ant Design Form initial values
 */
export function formatRemindersForForm(entity?: {
  reminders?: ReminderItem[];
  reminderDate?: string;
  reminderNote?: string;
} | null) {
  if (!entity) return [];
  if (entity.reminders && entity.reminders.length > 0) {
    return entity.reminders.map((r) => ({
      id: r.id || generateId(),
      date: r.date ? dayjs(r.date, 'YYYY-MM-DD') : null,
      time: r.time ? dayjs(r.time, 'HH:mm') : null,
      note: r.note || '',
    }));
  }
  if (entity.reminderDate) {
    return [
      {
        id: generateId(),
        date: dayjs(entity.reminderDate, 'YYYY-MM-DD'),
        time: null,
        note: entity.reminderNote || '',
      },
    ];
  }
  return [];
}

/**
 * Convert Form.List values into clean ReminderItem[] for persistence
 */
export function formatRemindersForSave(formReminders?: unknown[]): ReminderItem[] | undefined {
  if (!Array.isArray(formReminders) || formReminders.length === 0) {
    return undefined;
  }
  const items: ReminderItem[] = [];
  for (const item of formReminders) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const rawDate = rec.date;
    if (!rawDate) continue;

    const dateStr =
      typeof (rawDate as { format?: unknown }).format === 'function'
        ? (rawDate as { format: (fmt: string) => string }).format('YYYY-MM-DD')
        : String(rawDate).slice(0, 10);

    const rawTime = rec.time;
    let timeStr: string | undefined = undefined;
    if (rawTime) {
      timeStr =
        typeof (rawTime as { format?: unknown }).format === 'function'
          ? (rawTime as { format: (fmt: string) => string }).format('HH:mm')
          : String(rawTime).slice(0, 5);
    }

    const noteStr = typeof rec.note === 'string' && rec.note.trim() ? rec.note.trim() : undefined;
    const idStr = typeof rec.id === 'string' && rec.id ? rec.id : generateId();

    const itemObj: ReminderItem = {
      id: idStr,
      date: dateStr,
    };
    if (timeStr !== undefined) itemObj.time = timeStr;
    if (noteStr !== undefined) itemObj.note = noteStr;

    items.push(itemObj);
    if (items.length >= 5) break;
  }
  return items.length > 0 ? items : undefined;
}

export const RemindersFormList: React.FC<RemindersFormListProps> = ({
  label = 'Nhắc nhở (Tối đa 5)',
}) => {
  return (
    <Form.Item label={label} style={{ marginBottom: 16 }}>
      <Form.List name="reminders">
        {(fields, { add, remove }) => (
          <Space direction="vertical" style={{ width: '100%' }}>
            {fields.map((field) => (
              <div
                key={field.key}
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'flex-start',
                  width: '100%',
                }}
              >
                <Form.Item name={[field.name, 'id']} hidden>
                  <Input />
                </Form.Item>

                <Form.Item
                  name={[field.name, 'date']}
                  rules={[{ required: true, message: 'Chọn ngày nhắc' }]}
                  style={{ width: 140, marginBottom: 8, flexShrink: 0 }}
                >
                  <DatePicker
                    format="YYYY-MM-DD"
                    placeholder="Ngày"
                    style={{ width: '100%' }}
                  />
                </Form.Item>

                <Form.Item
                  name={[field.name, 'time']}
                  style={{ width: 100, marginBottom: 8, flexShrink: 0 }}
                >
                  <TimePicker
                    format="HH:mm"
                    placeholder="Giờ"
                    allowClear
                    style={{ width: '100%' }}
                  />
                </Form.Item>

                <Form.Item
                  name={[field.name, 'note']}
                  style={{ flex: 1, marginBottom: 8 }}
                >
                  <Input placeholder="Ghi chú nhắc nhở..." maxLength={500} allowClear />
                </Form.Item>

                <Button
                  danger
                  type="text"
                  icon={<DeleteOutlined />}
                  onClick={() => remove(field.name)}
                  aria-label="Xóa nhắc nhở"
                  style={{ marginTop: 4, flexShrink: 0 }}
                />
              </div>
            ))}

            {fields.length < 5 ? (
              <Button
                type="dashed"
                onClick={() => add({ id: generateId(), date: null, time: null, note: '' })}
                icon={<PlusOutlined />}
                style={{ width: '100%' }}
              >
                Thêm nhắc nhở ({fields.length}/5)
              </Button>
            ) : (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Đã đạt tối đa 5 nhắc nhở
              </Text>
            )}
          </Space>
        )}
      </Form.List>
    </Form.Item>
  );
};

export default RemindersFormList;
