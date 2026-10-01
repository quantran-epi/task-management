import React, { useEffect, useState } from 'react';
import {
  Modal,
  Form,
  DatePicker,
  TimePicker,
  InputNumber,
  Input,
  Button,
  List,
  Typography,
  Popconfirm,
  Tag,
  Space,
  Divider,
  message,
} from 'antd';
import { DeleteOutlined, PlusOutlined, EditOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { useRegisterActiveForm } from '../../context/FormGuardContext';
import {
  createWorkSession,
  updateWorkSession,
  deleteWorkSession,
  getWorkSessionsForTask,
} from '../../db/repositories/workSessionRepo';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { WorkSession } from '../../types/models';
import { formatMinutes } from '../../utils/worklog';

const { Text } = Typography;

export interface WorkSessionDetailModalProps {
  open: boolean;
  taskId: string;
  taskName?: string | undefined;
  date: string; // YYYY-MM-DD
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

export const WorkSessionDetailModal: React.FC<WorkSessionDetailModalProps> = ({
  open,
  taskId,
  taskName,
  date,
  onClose,
  onSuccess,
  db = defaultDb,
}) => {
  useRegisterActiveForm('work-session-detail-modal', open);
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [editingSession, setEditingSession] = useState<WorkSession | null>(null);
  const [form] = Form.useForm<FormValues>();

  const loadSessions = async () => {
    setLoading(true);
    try {
      const allForTask = await getWorkSessionsForTask(taskId, db);
      // Filter sessions matching this calendar date
      const matching = allForTask.filter((s) => s.date === date);
      setSessions(matching);
    } catch (err: any) {
      message.error(err?.message || 'Không thể tải danh sách phiên làm việc.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && taskId) {
      loadSessions();
      setEditingSession(null);
    }
  }, [open, taskId, date]);

  useEffect(() => {
    if (editingSession) {
      const start = dayjs(editingSession.startTime);
      const end = editingSession.endTime
        ? dayjs(editingSession.endTime)
        : start.add(editingSession.durationMinutes, 'minute');
      form.setFieldsValue({
        date: dayjs(editingSession.date, 'YYYY-MM-DD'),
        timeRange: [start, end],
        durationMinutes: editingSession.durationMinutes,
        note: editingSession.note || '',
      });
    } else {
      const defaultDate = dayjs(date, 'YYYY-MM-DD').isValid() ? dayjs(date, 'YYYY-MM-DD') : dayjs();
      const start = defaultDate.hour(9).minute(0).second(0);
      const end = defaultDate.hour(10).minute(0).second(0);
      form.setFieldsValue({
        date: defaultDate,
        timeRange: [start, end],
        durationMinutes: 60,
        note: '',
      });
    }
  }, [editingSession, date, form]);

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

      if (editingSession) {
        await updateWorkSession(
          editingSession.id,
          {
            startTime: startTimeIso,
            endTime: endTimeIso,
            durationMinutes,
            segments: [{ startTime: startTimeIso, endTime: endTimeIso }],
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

      setEditingSession(null);
      await loadSessions();
      onSuccess?.();
    } catch (err: any) {
      message.error(err?.message || 'Không thể lưu phiên làm việc. Vui lòng thử lại.');
    }
  };

  const handleDelete = async (sessionId: string) => {
    try {
      await deleteWorkSession(sessionId, db);
      message.success('Đã xóa phiên làm việc');
      if (editingSession?.id === sessionId) {
        setEditingSession(null);
      }
      await loadSessions();
      onSuccess?.();
    } catch (err: any) {
      message.error(err?.message || 'Không thể xóa phiên làm việc.');
    }
  };

  return (
    <Modal
      title={
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Chi tiết phiên làm việc</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {taskName ?? 'Tác vụ'} — Ngày: {date}
          </Text>
        </div>
      }
      open={open}
      onCancel={() => {
        setEditingSession(null);
        onClose();
      }}
      footer={[
        <Button key="close" onClick={onClose}>
          Đóng
        </Button>,
      ]}
      width={680}
      destroyOnClose
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12 }}>
        {/* Existing sessions on this date */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text strong>Các phiên đã ghi ({sessions.length})</Text>
            {editingSession && (
              <Button size="small" icon={<PlusOutlined />} onClick={() => setEditingSession(null)}>
                Tạo phiên mới
              </Button>
            )}
          </div>

          <List
            loading={loading}
            dataSource={sessions}
            locale={{ emptyText: 'Chưa có phiên làm việc nào trong ngày này' }}
            renderItem={(s) => {
              const startFmt = dayjs(s.startTime).format('HH:mm');
              const endFmt = s.endTime ? dayjs(s.endTime).format('HH:mm') : '—';
              const isSelected = editingSession?.id === s.id;
              return (
                <List.Item
                  style={{
                    padding: '8px 12px',
                    borderRadius: 6,
                    backgroundColor: isSelected ? '#e6f4ff' : '#fafafa',
                    border: isSelected ? '1px solid #91caff' : '1px solid #f0f0f0',
                    marginBottom: 8,
                  }}
                  actions={[
                    <Button
                      key="edit"
                      type="text"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => setEditingSession(s)}
                      aria-label="Chỉnh sửa phiên"
                    />,
                    <Popconfirm
                      key="delete"
                      title="Xóa phiên làm việc này? Thời gian thực tế của tác vụ sẽ giảm tương ứng."
                      okText="Xóa"
                      cancelText="Hủy"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => handleDelete(s.id)}
                    >
                      <Button
                        type="text"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        aria-label="Xóa phiên"
                      />
                    </Popconfirm>,
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <Space>
                        <Text style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {startFmt} - {endFmt}
                        </Text>
                        <Tag color="blue">{formatMinutes(s.durationMinutes)}</Tag>
                        {s.segments && s.segments.length > 1 && (
                          <Tag>{s.segments.length} đoạn chạy</Tag>
                        )}
                      </Space>
                    }
                    description={
                      <div>
                        {s.note && <Text type="secondary">{s.note}</Text>}
                        {s.segments && s.segments.length > 0 && (
                          <div style={{ marginTop: 4, fontSize: 11, color: '#8c8c8c' }}>
                            Các đoạn chạy:{' '}
                            {s.segments.map((seg, idx) => {
                              const segStart = dayjs(seg.startTime).format('HH:mm');
                              const segEnd = seg.endTime ? dayjs(seg.endTime).format('HH:mm') : 'đang chạy';
                              return (
                                <span key={idx} style={{ marginRight: 8 }}>
                                  [{segStart} - {segEnd}]
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    }
                  />
                </List.Item>
              );
            }}
          />
        </div>

        <Divider style={{ margin: '8px 0' }} />

        {/* Form to create or edit session */}
        <div>
          <Text strong style={{ display: 'block', marginBottom: 12 }}>
            {editingSession ? 'Chỉnh sửa thông tin phiên' : 'Thêm phiên làm việc thủ công'}
          </Text>

          <Form form={form} layout="vertical" onFinish={handleFinish}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Form.Item
                name="date"
                label="Ngày làm việc"
                rules={[{ required: true, message: 'Vui lòng chọn ngày làm việc' }]}
              >
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" allowClear={false} />
              </Form.Item>

              <Form.Item
                name="timeRange"
                label="Khoảng thời gian (Bắt đầu - Kết thúc)"
                rules={[{ required: true, message: 'Vui lòng chọn khoảng thời gian' }]}
              >
                <TimePicker.RangePicker
                  style={{ width: '100%' }}
                  format="HH:mm"
                  onChange={handleTimeRangeChange}
                  allowClear={false}
                />
              </Form.Item>
            </div>

            <Form.Item
              name="durationMinutes"
              label="Thời lượng (phút)"
              rules={[
                { required: true, message: 'Vui lòng nhập thời lượng' },
                { type: 'number', min: 1, max: 1440, message: 'Thời lượng từ 1 đến 1440 phút' },
              ]}
            >
              <InputNumber min={1} max={1440} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item
              name="note"
              label="Ghi chú (tùy chọn)"
              rules={[{ max: 500, message: 'Ghi chú tối đa 500 ký tự' }]}
            >
              <Input.TextArea
                rows={2}
                maxLength={500}
                showCount
                placeholder="Nội dung công việc thực hiện trong phiên này..."
              />
            </Form.Item>

            <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
              <Space>
                {editingSession && (
                  <Button onClick={() => setEditingSession(null)}>Hủy sửa</Button>
                )}
                <Button type="primary" htmlType="submit">
                  Lưu thời gian
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </div>
      </div>
    </Modal>
  );
};
