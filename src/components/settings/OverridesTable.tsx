import React, { useState, useRef } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  DatePicker,
  InputNumber,
  Input,
  Space,
  Tag,
  Typography,
  Popconfirm,
  Empty,
  Segmented,
  message,
} from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs, { type Dayjs } from 'dayjs';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import {
  setCapacityOverride,
  removeCapacityOverride,
} from '../../db/repositories/capacityRepo';
import { formatMinutes } from '../../utils/time';
import { createFocusRestorer } from '../../utils/focus';
import type { CapacityOverride } from '../../types/models';

const { Text, Title } = Typography;

export interface OverridesTableProps {
  db?: TaskPlannerDatabase;
}

export const OverridesTable: React.FC<OverridesTableProps> = ({ db = defaultDb }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingOverride, setEditingOverride] = useState<CapacityOverride | null>(null);
  const [rangeMode, setRangeMode] = useState<'single' | 'range'>('single');
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const restorerRef = useRef<(() => void) | null>(null);

  const overrides = useLiveQuery(
    async () => {
      const records = await db.capacityOverrides.toArray();
      return records.sort((a, b) => a.date.localeCompare(b.date));
    },
    [db],
    []
  );

  const handleOpenAdd = () => {
    restorerRef.current = createFocusRestorer();
    setEditingOverride(null);
    setRangeMode('single');
    form.resetFields();
    form.setFieldsValue({
      date: dayjs(),
      dateRange: [dayjs(), dayjs()],
      hours: 0,
      minutes: 0,
      note: '',
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (record: CapacityOverride) => {
    restorerRef.current = createFocusRestorer();
    setEditingOverride(record);
    setRangeMode('single');
    form.resetFields();
    form.setFieldsValue({
      date: dayjs(record.date, 'YYYY-MM-DD'),
      hours: Math.floor(record.workMinutes / 60),
      minutes: record.workMinutes % 60,
      note: record.note || '',
    });
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingOverride(null);
    setRangeMode('single');
    if (restorerRef.current) {
      restorerRef.current();
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const hours = values.hours ?? 0;
      const minutes = values.minutes ?? 0;
      const totalMinutes = Math.min(1440, Math.max(0, hours * 60 + minutes));
      const note = values.note?.trim() || undefined;

      if (editingOverride || rangeMode === 'single') {
        const dateStr = (values.date as Dayjs).format('YYYY-MM-DD');
        await setCapacityOverride(dateStr, totalMinutes, note, db);
        message.success(editingOverride ? 'Đã cập nhật ngày ngoại lệ công suất' : 'Đã lưu ngày ngoại lệ công suất');
      } else {
        const [start, end] = values.dateRange as [Dayjs, Dayjs];
        let curr = start.startOf('day');
        const endDay = end.startOf('day');
        let count = 0;
        while (curr.isBefore(endDay) || curr.isSame(endDay, 'day')) {
          await setCapacityOverride(curr.format('YYYY-MM-DD'), totalMinutes, note, db);
          curr = curr.add(1, 'day');
          count++;
        }
        message.success(`Đã lưu ${count} ngày ngoại lệ công suất`);
      }

      handleCloseModal();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) {
        return; // Validation failed
      }
      message.error('Không thể lưu ngày ngoại lệ công suất');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (date: string) => {
    try {
      await removeCapacityOverride(date, db);
      message.success(`Đã xóa ngoại lệ cho ngày ${date}; đã khôi phục mặc định hàng tuần.`);
    } catch {
      message.error('Không thể xóa ngoại lệ');
    }
  };

  const columns = [
    {
      title: 'Ngày',
      dataIndex: 'date',
      key: 'date',
      render: (date: string) => <Text strong>{date}</Text>,
    },
    {
      title: 'Thứ',
      key: 'day',
      render: (_: unknown, record: CapacityOverride) => {
        return <Text type="secondary">{dayjs(record.date).format('dddd')}</Text>;
      },
    },
    {
      title: 'Loại',
      key: 'type',
      render: (_: unknown, record: CapacityOverride) => {
        if (record.workMinutes === 0) {
          return <Tag color="default">Nghỉ</Tag>;
        }
        if (record.workMinutes > 480) {
          return <Tag color="orange">Làm thêm giờ</Tag>;
        }
        return <Tag color="blue">Tùy chỉnh</Tag>;
      },
    },
    {
      title: 'Công suất',
      dataIndex: 'workMinutes',
      key: 'workMinutes',
      render: (mins: number) => <Text>{formatMinutes(mins)}</Text>,
    },
    {
      title: 'Ghi chú',
      dataIndex: 'note',
      key: 'note',
      render: (note?: string) => note || <Text type="secondary">—</Text>,
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 170,
      render: (_: unknown, record: CapacityOverride) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleOpenEdit(record)}
            aria-label={`Chỉnh sửa ngoại lệ cho ${record.date}`}
          >
            Sửa
          </Button>
          <Popconfirm
            title="Khôi phục mặc định"
            description={`Xóa ngoại lệ cho ngày ${record.date} và khôi phục mặc định hàng tuần?`}
            okText="Khôi phục"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(record.date)}
          >
            <Button
              type="link"
              danger
              size="small"
              icon={<DeleteOutlined />}
              aria-label={`Khôi phục ngoại lệ cho ${record.date}`}
            >
              Khôi phục
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title={<Title level={5} style={{ margin: 0 }}>Ngoại lệ theo ngày cụ thể</Title>}
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleOpenAdd}
          data-testid="add-override-btn"
        >
          Thêm ngày ngoại lệ
        </Button>
      }
      size="small"
    >
      <Table<CapacityOverride>
        dataSource={overrides}
        columns={columns}
        rowKey="date"
        pagination={overrides.length > 5 ? { pageSize: 5 } : false}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <div>
                  <Text strong>Chưa có ngày ngoại lệ nào</Text>
                  <br />
                  <Text type="secondary">
                    Tất cả các ngày đều sử dụng số giờ mặc định theo mẫu hàng tuần. Nhấn &apos;Thêm ngày ngoại lệ&apos; để lên lịch ngày nghỉ hoặc làm thêm giờ.
                  </Text>
                </div>
              }
            />
          ),
        }}
      />

      <Modal
        title={editingOverride ? 'Chỉnh sửa ngoại lệ công suất' : 'Thêm ngoại lệ công suất theo ngày'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={handleCloseModal}
        confirmLoading={submitting}
        okText={editingOverride ? 'Cập nhật' : 'Lưu ngoại lệ'}
        cancelText="Hủy"
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          {!editingOverride && (
            <Form.Item label="Phương thức chọn ngày">
              <Segmented<'single' | 'range'>
                value={rangeMode}
                onChange={(val) => setRangeMode(val)}
                options={[
                  { label: 'Một ngày', value: 'single' },
                  { label: 'Khoảng ngày', value: 'range' },
                ]}
              />
            </Form.Item>
          )}

          {editingOverride || rangeMode === 'single' ? (
            <Form.Item
              name="date"
              label="Ngày"
              rules={[{ required: true, message: 'Vui lòng chọn ngày' }]}
            >
              <DatePicker
                style={{ width: '100%' }}
                format="YYYY-MM-DD"
                disabled={Boolean(editingOverride)}
              />
            </Form.Item>
          ) : (
            <Form.Item
              name="dateRange"
              label="Khoảng ngày"
              rules={[{ required: true, message: 'Vui lòng chọn khoảng ngày' }]}
            >
              <DatePicker.RangePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
            </Form.Item>
          )}

          <Space align="start" size="middle">
            <Form.Item
              name="hours"
              label="Số giờ làm việc"
              rules={[{ required: true, message: 'Vui lòng nhập số giờ' }]}
            >
              <InputNumber min={0} max={24} suffix="h" style={{ width: 120 }} />
            </Form.Item>

            <Form.Item
              name="minutes"
              label="Số phút làm việc"
              rules={[{ required: true, message: 'Vui lòng nhập số phút' }]}
            >
              <InputNumber min={0} max={59} step={15} suffix="m" style={{ width: 120 }} />
            </Form.Item>
          </Space>

          <Form.Item
            name="note"
            label="Ghi chú / Lý do"
            rules={[{ max: 200, message: 'Ghi chú tối đa 200 ký tự' }]}
          >
            <Input placeholder="vd: Nghỉ lễ Quốc khánh, Nghỉ phép, Tăng ca chạy dự án" maxLength={200} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};
