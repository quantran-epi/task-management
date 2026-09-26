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
  message,
} from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
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
    form.resetFields();
    form.setFieldsValue({
      date: dayjs(),
      hours: 0,
      minutes: 0,
      note: '',
    });
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    if (restorerRef.current) {
      restorerRef.current();
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const dateStr = (values.date as Dayjs).format('YYYY-MM-DD');
      const hours = values.hours ?? 0;
      const minutes = values.minutes ?? 0;
      const totalMinutes = Math.min(1440, Math.max(0, hours * 60 + minutes));
      const note = values.note?.trim() || undefined;

      await setCapacityOverride(dateStr, totalMinutes, note, db);
      message.success('Capacity override saved');
      handleCloseModal();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) {
        return; // Validation failed
      }
      message.error('Failed to save capacity override');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (date: string) => {
    try {
      await removeCapacityOverride(date, db);
      message.success(`Override for ${date} removed; restored weekly default.`);
    } catch {
      message.error('Failed to remove override');
    }
  };

  const columns = [
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      render: (date: string) => <Text strong>{date}</Text>,
    },
    {
      title: 'Day',
      key: 'day',
      render: (_: unknown, record: CapacityOverride) => {
        return <Text type="secondary">{dayjs(record.date).format('dddd')}</Text>;
      },
    },
    {
      title: 'Type',
      key: 'type',
      render: (_: unknown, record: CapacityOverride) => {
        if (record.workMinutes === 0) {
          return <Tag color="default">Leave / Off</Tag>;
        }
        if (record.workMinutes > 480) {
          return <Tag color="orange">Overtime</Tag>;
        }
        return <Tag color="blue">Custom</Tag>;
      },
    },
    {
      title: 'Capacity',
      dataIndex: 'workMinutes',
      key: 'workMinutes',
      render: (mins: number) => <Text>{formatMinutes(mins)}</Text>,
    },
    {
      title: 'Note',
      dataIndex: 'note',
      key: 'note',
      render: (note?: string) => note || <Text type="secondary">—</Text>,
    },
    {
      title: 'Action',
      key: 'action',
      render: (_: unknown, record: CapacityOverride) => (
        <Popconfirm
          title="Reset to Default"
          description={`Remove override for ${record.date} and restore weekly default?`}
          okText="Reset"
          cancelText="Cancel"
          okButtonProps={{ danger: true }}
          onConfirm={() => handleDelete(record.date)}
        >
          <Button
            type="link"
            danger
            size="small"
            icon={<DeleteOutlined />}
            aria-label={`Reset override for ${record.date}`}
          >
            Reset to Default
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <Card
      title={<Title level={5} style={{ margin: 0 }}>Specific Date Overrides</Title>}
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleOpenAdd}
          data-testid="add-override-btn"
        >
          + Add Override
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
                  <Text strong>No specific date overrides</Text>
                  <br />
                  <Text type="secondary">
                    All dates use default weekly template hours. Click &apos;+ Add Override&apos; to schedule holidays or overtime.
                  </Text>
                </div>
              }
            />
          ),
        }}
      />

      <Modal
        title="Add Date Capacity Override"
        open={modalOpen}
        onOk={handleSave}
        onCancel={handleCloseModal}
        confirmLoading={submitting}
        okText="Save Override"
        cancelText="Cancel"
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            name="date"
            label="Calendar Date"
            rules={[{ required: true, message: 'Please select a date' }]}
          >
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>

          <Space align="start" size="middle">
            <Form.Item
              name="hours"
              label="Work Hours"
              rules={[{ required: true, message: 'Hours required' }]}
            >
              <InputNumber min={0} max={24} suffix="h" style={{ width: 120 }} />
            </Form.Item>

            <Form.Item
              name="minutes"
              label="Work Minutes"
              rules={[{ required: true, message: 'Minutes required' }]}
            >
              <InputNumber min={0} max={59} step={15} suffix="m" style={{ width: 120 }} />
            </Form.Item>
          </Space>

          <Form.Item
            name="note"
            label="Note / Reason"
            rules={[{ max: 200, message: 'Note must be 200 characters or less' }]}
          >
            <Input placeholder="e.g. National Holiday, Vacation, Overtime sprint" maxLength={200} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};
