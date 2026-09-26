import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  Form,
  Select,
  DatePicker,
  InputNumber,
  Button,
  Space,
  Alert,
  Typography,
  Tag,
  message,
} from 'antd';
import { ClockCircleOutlined, WarningOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs, { type Dayjs } from 'dayjs';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import {
  upsertAllocation,
  getAllocationsForTask,
} from '../../db/repositories/allocationRepo';
import { formatMinutes } from '../../utils/time';
import { createFocusRestorer } from '../../utils/focus';
import type { Task, TaskPriority } from '../../types/models';

const { Text } = Typography;

export interface AllocationModalProps {
  open: boolean;
  initialDate?: string;
  initialTaskId?: string;
  onCancel: () => void;
  onSuccess?: () => void;
  db?: TaskPlannerDatabase;
}

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  Low: 'default',
  Medium: 'blue',
  High: 'orange',
  Urgent: 'red',
};

export const AllocationModal: React.FC<AllocationModalProps> = ({
  open,
  initialDate,
  initialTaskId,
  onCancel,
  onSuccess,
  db = defaultDb,
}) => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [existingTotalMinutes, setExistingTotalMinutes] = useState(0);
  const [existingDateMinutes, setExistingDateMinutes] = useState(0);
  const restorerRef = useRef<(() => void) | null>(null);

  // Watch form fields for live estimate comparison
  const selectedTaskId = Form.useWatch('taskId', form);
  const selectedDate = Form.useWatch('date', form) as Dayjs | undefined;
  const hours = Form.useWatch('hours', form) ?? 0;
  const minutes = Form.useWatch('minutes', form) ?? 0;

  // Query active tasks for dropdown (PLAN-01)
  const activeTasks = useLiveQuery(
    async () => {
      const all = await db.tasks.toArray();
      return all
        .filter((t) => t.status !== 'Done' && t.status !== 'Cancelled')
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    [db],
    []
  );

  const selectedTask = activeTasks.find((t) => t.id === selectedTaskId);

  // Focus restorer
  useEffect(() => {
    if (open) {
      restorerRef.current = createFocusRestorer();
      const targetDate = initialDate ? dayjs(initialDate, 'YYYY-MM-DD') : dayjs();
      form.setFieldsValue({
        taskId: initialTaskId ?? undefined,
        date: targetDate,
        hours: 1,
        minutes: 0,
      });
    }
  }, [open, initialDate, initialTaskId, form]);

  // Load task allocations whenever selectedTaskId or selectedDate changes (D-10)
  useEffect(() => {
    if (!selectedTaskId) {
      setExistingTotalMinutes(0);
      setExistingDateMinutes(0);
      return;
    }

    let isMounted = true;
    async function loadTaskAllocations() {
      try {
        const allocations = await getAllocationsForTask(selectedTaskId, db);
        if (!isMounted) return;

        const total = allocations.reduce((sum, a) => sum + a.allocatedMinutes, 0);
        setExistingTotalMinutes(total);

        const dateStr = selectedDate ? selectedDate.format('YYYY-MM-DD') : '';
        const onDate = allocations.find((a) => a.date === dateStr);
        setExistingDateMinutes(onDate ? onDate.allocatedMinutes : 0);
      } catch {
        // Silently handle if db unready
      }
    }

    void loadTaskAllocations();
    return () => {
      isMounted = false;
    };
  }, [selectedTaskId, selectedDate, db]);

  const handleClose = () => {
    form.resetFields();
    onCancel();
    if (restorerRef.current) {
      restorerRef.current();
    }
  };

  const handleQuickPreset = (hrs: number) => {
    form.setFieldsValue({
      hours: hrs,
      minutes: 0,
    });
  };

  const inputMinutes = Math.max(0, (hours ?? 0) * 60 + (minutes ?? 0));
  // New total allocated across all dates accounting for replacing date's allocation (D-12)
  const newTotalAllocated = (existingTotalMinutes - existingDateMinutes) + inputMinutes;
  const taskEstimate = selectedTask?.estimateMinutes ?? 0;
  const isOverEstimate = taskEstimate > 0 && newTotalAllocated > taskEstimate;
  const overageMinutes = Math.max(0, newTotalAllocated - taskEstimate);
  const remainingMinutes = Math.max(0, taskEstimate - newTotalAllocated);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const totalMins = (values.hours ?? 0) * 60 + (values.minutes ?? 0);
      if (totalMins <= 0) {
        message.error('Planned duration must be at least 1 minute');
        return;
      }
      if (totalMins > 1440) {
        message.error('Planned duration cannot exceed 24 hours (1440 minutes)');
        return;
      }

      setSubmitting(true);
      const dateStr = (values.date as Dayjs).format('YYYY-MM-DD');

      await upsertAllocation(values.taskId, dateStr, totalMins, db);
      message.success(`Allocated ${formatMinutes(totalMins)} to ${dateStr}`);
      onSuccess?.();
      handleClose();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) {
        return; // AntD Form validation error
      }
      message.error('Failed to save allocation');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={
        <Space>
          <ClockCircleOutlined />
          <span>Allocate Task Time</span>
        </Space>
      }
      open={open}
      onOk={() => void handleSubmit()}
      onCancel={handleClose}
      confirmLoading={submitting}
      okText="Save Allocation"
      cancelText="Cancel"
      destroyOnClose
      width={520}
    >
      <Form form={form} layout="vertical" preserve={false} style={{ marginTop: 16 }}>
        {/* Task Selection */}
        <Form.Item
          name="taskId"
          label="Select Task"
          rules={[{ required: true, message: 'Please select a task to allocate' }]}
        >
          <Select
            placeholder="Search active tasks..."
            showSearch
            optionFilterProp="label"
            aria-label="Select Task"
            options={activeTasks.map((t) => ({
              value: t.id,
              label: `${t.name} (${t.priority}, est: ${formatMinutes(t.estimateMinutes)})`,
              task: t,
            }))}
            optionRender={(option) => {
              const t = (option.data as { task: Task }).task;
              return (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text ellipsis style={{ maxWidth: 260 }}>
                    {t.name}
                  </Text>
                  <Space size={4}>
                    <Tag color={PRIORITY_COLORS[t.priority]}>{t.priority}</Tag>
                    <Tag>{formatMinutes(t.estimateMinutes)}</Tag>
                  </Space>
                </div>
              );
            }}
          />
        </Form.Item>

        {/* Date Picker */}
        <Form.Item
          name="date"
          label="Target Date"
          rules={[{ required: true, message: 'Please select target calendar date' }]}
        >
          <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" aria-label="Target Date" />
        </Form.Item>

        {/* Duration Input & Presets */}
        <Form.Item label="Planned Duration" required style={{ marginBottom: 8 }}>
          <Space align="start" size="middle">
            <Form.Item
              name="hours"
              rules={[{ required: true, message: 'Hours required' }]}
              style={{ marginBottom: 0 }}
            >
              <InputNumber
                min={0}
                max={24}
                suffix="h"
                style={{ width: 100 }}
                aria-label="Planned Hours"
              />
            </Form.Item>

            <Form.Item
              name="minutes"
              rules={[{ required: true, message: 'Minutes required' }]}
              style={{ marginBottom: 0 }}
            >
              <InputNumber
                min={0}
                max={59}
                step={15}
                suffix="m"
                style={{ width: 100 }}
                aria-label="Planned Minutes"
              />
            </Form.Item>
          </Space>
        </Form.Item>

        {/* Quick Presets */}
        <div style={{ marginBottom: 16 }}>
          <Space size="small">
            <Text type="secondary" style={{ fontSize: 12 }}>
              Presets:
            </Text>
            <Button size="small" onClick={() => handleQuickPreset(1)}>
              1h
            </Button>
            <Button size="small" onClick={() => handleQuickPreset(2)}>
              2h
            </Button>
            <Button size="small" onClick={() => handleQuickPreset(4)}>
              4h
            </Button>
          </Space>
        </div>

        {/* Estimate Comparison & Soft Warning (D-10, PLAN-06) */}
        {selectedTask && (
          <div
            style={{
              padding: 12,
              backgroundColor: '#f5f5f5',
              borderRadius: 6,
              marginBottom: 16,
            }}
            data-testid="estimate-comparison"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text type="secondary">Task Estimate:</Text>
              <Text strong>{formatMinutes(taskEstimate)}</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text type="secondary">Total Planned (Cumulative):</Text>
              <Text strong style={{ color: isOverEstimate ? '#fa8c16' : undefined }}>
                {formatMinutes(newTotalAllocated)}
              </Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text type="secondary">
                {isOverEstimate ? 'Over-allocated:' : 'Remaining to plan:'}
              </Text>
              <Text type={isOverEstimate ? 'warning' : 'secondary'} strong>
                {isOverEstimate ? `+${formatMinutes(overageMinutes)}` : formatMinutes(remainingMinutes)}
              </Text>
            </div>

            {isOverEstimate && (
              <Alert
                message={`Total allocated time exceeds task estimate by ${formatMinutes(overageMinutes)}`}
                type="warning"
                showIcon
                icon={<WarningOutlined />}
                style={{ marginTop: 10 }}
                data-testid="soft-overflow-warning"
              />
            )}
          </div>
        )}
      </Form>
    </Modal>
  );
};
