import React, { useEffect } from 'react';
import { Modal, Form, DatePicker, InputNumber, useMessage, Textarea, TimeRangePicker, FormItem, useForm } from '../ui';
import dayjs, { type Dayjs } from 'dayjs';
import { useRegisterActiveForm } from '../../context/FormGuardContext';
import { createWorkSession, updateWorkSession } from '../../db/repositories/workSessionRepo';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { WorkSession } from '../../types/models';

export interface ManualWorkSessionModalProps {
  open: boolean;
  taskId: string;
  sessionToEdit?: WorkSession | null | undefined;
  onClose: () => void;
  onSuccess?: (() => void) | undefined;
  db?: TaskPlannerDatabase | undefined;
}

interface FormValues {
  date: Dayjs;
  timeRange: [Dayjs, Dayjs];
  durationMinutes: number;
  note?: string;
}

export const ManualWorkSessionModal: React.FC<ManualWorkSessionModalProps> = ({
  open,
  taskId,
  sessionToEdit,
  onClose,
  onSuccess,
  db = defaultDb,
}) => {
  const message = useMessage();
  useRegisterActiveForm('manual-work-session-modal', open);
  const [form] = useForm<FormValues>();

  useEffect(() => {
    if (!open) return;

    if (sessionToEdit) {
      const start = dayjs(sessionToEdit.startTime);
      const end = sessionToEdit.endTime ? dayjs(sessionToEdit.endTime) : start.add(sessionToEdit.durationMinutes, 'minute');
      form.setFieldsValue({
        date: dayjs(sessionToEdit.date, 'YYYY-MM-DD'),
        timeRange: [start, end],
        durationMinutes: sessionToEdit.durationMinutes,
        note: sessionToEdit.note || '',
      });
    } else {
      const now = dayjs();
      const oneHourAgo = now.subtract(1, 'hour');
      form.setFieldsValue({
        date: now,
        timeRange: [oneHourAgo, now],
        durationMinutes: 60,
        note: '',
      });
    }
  }, [open, sessionToEdit, form]);

  const handleTimeRangeChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    if (dates && dates[0] && dates[1]) {
      const start = dates[0];
      const end = dates[1];
      const diffMinutes = end.diff(start, 'minute');
      if (diffMinutes > 0) {
        form.setFieldValue('durationMinutes', Math.min(1440, diffMinutes));
      }
    }
  };

  const handleFinish = async (values: FormValues) => {
    try {
      const [startTimeDayjs, endTimeDayjs] = values.timeRange;

      if (!endTimeDayjs || !startTimeDayjs || endTimeDayjs.isBefore(startTimeDayjs) || endTimeDayjs.isSame(startTimeDayjs)) {
        message.error('Thời gian không hợp lệ. Giờ kết thúc phải sau giờ bắt đầu.');
        return;
      }

      // Construct ISO timestamps matching the selected date
      const startTimeIso = values.date
        .hour(startTimeDayjs.hour())
        .minute(startTimeDayjs.minute())
        .second(0)
        .toISOString();

      const endTimeIso = values.date
        .hour(endTimeDayjs.hour())
        .minute(endTimeDayjs.minute())
        .second(0)
        .toISOString();

      const durationMinutes = Math.max(1, Math.min(1440, Math.floor(values.durationMinutes)));
      const note = values.note?.trim() || undefined;

      if (sessionToEdit) {
        await updateWorkSession(
          sessionToEdit.id,
          {
            startTime: startTimeIso,
            endTime: endTimeIso,
            durationMinutes,
            note,
          },
          db
        );
        message.success('Đã cập nhật phiên làm việc');
      } else {
        await createWorkSession(
          {
            taskId,
            startTime: startTimeIso,
            endTime: endTimeIso,
            durationMinutes,
            note,
          },
          db
        );
        message.success('Đã lưu phiên làm việc');
      }

      onSuccess?.();
      onClose();
    } catch (err: any) {
      message.error(err?.message || 'Không thể lưu phiên làm việc. Vui lòng thử lại.');
    }
  };

  return (
    <Modal
      title={sessionToEdit ? 'Chỉnh sửa phiên làm việc' : 'Thêm phiên làm việc'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="Lưu phiên làm việc"
      cancelText="Hủy"
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <FormItem
          name="date"
          label="Ngày làm việc"
          rules={[{ required: true, message: 'Vui lòng chọn ngày làm việc' }]}
        >
          <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" allowClear={false} />
        </FormItem>

        <FormItem
          name="timeRange"
          label="Khoảng thời gian (Bắt đầu - Kết thúc)"
          rules={[{ required: true, message: 'Vui lòng chọn khoảng thời gian' }]}
        >
          <TimeRangePicker
            style={{ width: '100%' }}
            format="HH:mm"
            onChange={handleTimeRangeChange}
            allowClear={false}
          />
        </FormItem>

        <FormItem
          name="durationMinutes"
          label="Thời lượng (phút)"
          rules={[
            { required: true, message: 'Vui lòng nhập thời lượng' },
            { type: 'number', min: 1, max: 1440, message: 'Thời lượng từ 1 đến 1440 phút' },
          ]}
        >
          <InputNumber min={1} max={1440} style={{ width: '100%' }} />
        </FormItem>

        <FormItem
          name="note"
          label="Ghi chú (tùy chọn)"
          rules={[{ max: 500, message: 'Ghi chú tối đa 500 ký tự' }]}
        >
          <Textarea
            rows={3}
            maxLength={500}
            showCount
            placeholder="Nội dung công việc thực hiện trong phiên này..."
          />
        </FormItem>
      </Form>
    </Modal>
  );
};
