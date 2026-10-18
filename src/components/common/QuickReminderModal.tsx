import React, { useEffect } from 'react';
import { Modal, Form, DatePicker, TimePicker, Input, message } from 'antd';
import dayjs from 'dayjs';
import type { Task, Project, ReminderItem } from '../../types/models';
import { updateTask } from '../../db/repositories/taskRepo';
import { updateProject } from '../../db/repositories/projectRepo';
import type { TaskPlannerDatabase } from '../../db';

export interface QuickReminderModalProps {
  open: boolean;
  onClose: () => void;
  target: { type: 'task'; entity: Task } | { type: 'project'; entity: Project } | null;
  db?: TaskPlannerDatabase | undefined;
}

interface QuickReminderFormValues {
  date: dayjs.Dayjs;
  time?: dayjs.Dayjs;
  note?: string;
}

const generateId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : '00000000-0000-4000-8000-' + Math.random().toString(16).slice(2, 14).padEnd(12, '0');

export const QuickReminderModal: React.FC<QuickReminderModalProps> = ({
  open,
  onClose,
  target,
  db,
}) => {
  const [form] = Form.useForm<QuickReminderFormValues>();

  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        date: dayjs().add(1, 'day'),
        time: dayjs().set('hour', 9).set('minute', 0),
        note: '',
      });
    }
  }, [open, form]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      if (!target) return;

      const newReminder: ReminderItem = {
        id: generateId(),
        date: values.date.format('YYYY-MM-DD'),
        time: values.time ? values.time.format('HH:mm') : undefined,
        note: values.note?.trim() || undefined,
      };

      if (target.type === 'task') {
        const currentReminders = target.entity.reminders ?? [];
        await updateTask(
          target.entity.id,
          {
            reminders: [...currentReminders, newReminder],
          },
          db
        );
        message.success(`Đã thêm nhắc nhở cho tác vụ "${target.entity.name}"`);
      } else {
        const currentReminders = target.entity.reminders ?? [];
        await updateProject(
          target.entity.id,
          {
            reminders: [...currentReminders, newReminder],
          },
          db
        );
        message.success(`Đã thêm nhắc nhở cho dự án "${target.entity.name}"`);
      }

      onClose();
    } catch {
      // Form validation error
    }
  };

  const title = target
    ? `Thêm nhắc nhở: ${target.type === 'task' ? 'Tác vụ' : 'Dự án'} "${target.entity.name}"`
    : 'Thêm nhắc nhở';

  return (
    <Modal
      title={title}
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      okText="Lưu nhắc nhở"
      cancelText="Hủy"
      destroyOnClose
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item
          name="date"
          label="Ngày nhắc nhở"
          rules={[{ required: true, message: 'Vui lòng chọn ngày nhắc nhở' }]}
        >
          <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" placeholder="Chọn ngày" />
        </Form.Item>

        <Form.Item name="time" label="Giờ nhắc nhở (tùy chọn)">
          <TimePicker style={{ width: '100%' }} format="HH:mm" placeholder="Chọn giờ (HH:mm)" />
        </Form.Item>

        <Form.Item name="note" label="Ghi chú nhắc nhở (tùy chọn)">
          <Input.TextArea
            rows={3}
            placeholder="Nội dung cần nhớ khi đến giờ..."
            maxLength={200}
            showCount
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};
