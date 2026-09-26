import React, { useState } from 'react';
import {
  Card,
  Tag,
  Typography,
  Space,
  Button,
  Popover,
  Popconfirm,
  InputNumber,
  DatePicker,
  message,
} from 'antd';
import {
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  CheckCircleOutlined,
  StopOutlined,
} from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import {
  updateAllocation,
  deleteAllocation,
} from '../../db/repositories/allocationRepo';
import { formatMinutes } from '../../utils/time';
import type { PlannedAllocation, Task, TaskPriority } from '../../types/models';

const { Text } = Typography;

export interface TaskAllocationCardProps {
  allocation: PlannedAllocation;
  task: Task;
  isActive: boolean;
  onEditTask?: ((taskId: string) => void) | undefined;
  db?: TaskPlannerDatabase | undefined;
}

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  Low: 'default',
  Medium: 'blue',
  High: 'orange',
  Urgent: 'red',
};

export const TaskAllocationCard: React.FC<TaskAllocationCardProps> = ({
  allocation,
  task,
  isActive,
  onEditTask,
  db = defaultDb,
}) => {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [hours, setHours] = useState(Math.floor(allocation.allocatedMinutes / 60));
  const [minutes, setMinutes] = useState(allocation.allocatedMinutes % 60);
  const [targetDate, setTargetDate] = useState<Dayjs>(dayjs(allocation.date, 'YYYY-MM-DD'));
  const [saving, setSaving] = useState(false);

  const handleOpenChange = (open: boolean) => {
    setPopoverOpen(open);
    if (open) {
      setHours(Math.floor(allocation.allocatedMinutes / 60));
      setMinutes(allocation.allocatedMinutes % 60);
      setTargetDate(dayjs(allocation.date, 'YYYY-MM-DD'));
    }
  };

  const handleSaveEdit = async () => {
    const totalMinutes = hours * 60 + minutes;
    if (totalMinutes <= 0) {
      message.error('Duration must be at least 1 minute');
      return;
    }
    if (totalMinutes > 1440) {
      message.error('Duration cannot exceed 24 hours');
      return;
    }

    try {
      setSaving(true);
      const dateStr = targetDate.format('YYYY-MM-DD');
      await updateAllocation(allocation.id, totalMinutes, dateStr, db);
      message.success('Allocation updated');
      setPopoverOpen(false);
    } catch {
      message.error('Failed to update allocation');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteAllocation(allocation.id, db);
      message.success(`Removed allocation of ${formatMinutes(allocation.allocatedMinutes)}`);
    } catch {
      message.error('Failed to remove allocation');
    }
  };

  const editPopoverContent = (
    <div style={{ width: 220, padding: 4 }}>
      <Text strong style={{ display: 'block', marginBottom: 8 }}>
        Edit Allocation
      </Text>

      <div style={{ marginBottom: 8 }}>
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
          Target Date:
        </Text>
        <DatePicker
          value={targetDate}
          onChange={(d) => d && setTargetDate(d)}
          format="YYYY-MM-DD"
          size="small"
          style={{ width: '100%' }}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
          Planned Time:
        </Text>
        <Space size={4}>
          <InputNumber
            min={0}
            max={24}
            size="small"
            value={hours}
            onChange={(v) => setHours(v ?? 0)}
            suffix="h"
            style={{ width: 80 }}
          />
          <InputNumber
            min={0}
            max={59}
            step={15}
            size="small"
            value={minutes}
            onChange={(v) => setMinutes(v ?? 0)}
            suffix="m"
            style={{ width: 80 }}
          />
        </Space>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
        <Button size="small" onClick={() => setPopoverOpen(false)}>
          Cancel
        </Button>
        <Button
          type="primary"
          size="small"
          loading={saving}
          onClick={() => void handleSaveEdit()}
        >
          Save
        </Button>
      </div>
    </div>
  );

  return (
    <Card
      size="small"
      style={{
        marginBottom: 8,
        opacity: isActive ? 1 : 0.5,
        borderLeft: isActive ? '3px solid #1677ff' : '3px solid #d9d9d9',
        backgroundColor: isActive ? '#ffffff' : '#fafafa',
      }}
      bodyStyle={{ padding: '8px 12px' }}
      data-testid={`allocation-card-${allocation.id}`}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
          <Text
            strong
            delete={!isActive}
            style={{
              cursor: onEditTask ? 'pointer' : 'default',
              display: 'block',
            }}
            onClick={() => onEditTask?.(task.id)}
            title="Click to view task details in drawer"
            ellipsis
          >
            {task.name}
          </Text>

          <Space size={4} wrap style={{ marginTop: 4 }}>
            <Tag color={PRIORITY_COLORS[task.priority]} style={{ margin: 0, fontSize: 11 }}>
              {task.priority}
            </Tag>

            {!isActive && (
              <Tag
                icon={task.status === 'Done' ? <CheckCircleOutlined /> : <StopOutlined />}
                color="default"
                style={{ margin: 0, fontSize: 11 }}
              >
                {task.status === 'Done' ? 'Done - excluded' : 'Cancelled - excluded'}
              </Tag>
            )}
          </Space>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Popover
            content={editPopoverContent}
            trigger="click"
            open={popoverOpen}
            onOpenChange={handleOpenChange}
          >
            <Tag
              icon={<ClockCircleOutlined />}
              color={isActive ? 'blue' : 'default'}
              style={{
                cursor: 'pointer',
                margin: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
              title="Click to edit planned time or date"
              aria-label={`Allocated ${formatMinutes(allocation.allocatedMinutes)}`}
            >
              {formatMinutes(allocation.allocatedMinutes)}
              <EditOutlined style={{ fontSize: 10 }} />
            </Tag>
          </Popover>

          <Popconfirm
            title="Remove Allocation"
            description={`Remove allocation of ${formatMinutes(allocation.allocatedMinutes)}?`}
            okText="Remove"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
            onConfirm={() => void handleDelete()}
          >
            <Button
              type="text"
              danger
              size="small"
              icon={<DeleteOutlined />}
              style={{ width: 20, height: 20, padding: 0 }}
              aria-label={`Remove allocation of ${task.name}`}
            />
          </Popconfirm>
        </div>
      </div>
    </Card>
  );
};
