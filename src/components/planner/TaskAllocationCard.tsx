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

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  Low: 'Thấp',
  Medium: 'Trung bình',
  High: 'Cao',
  Urgent: 'Khẩn cấp',
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
      message.error('Thời lượng phải từ ít nhất 1 phút');
      return;
    }
    if (totalMinutes > 1440) {
      message.error('Thời lượng không được vượt quá 24 giờ');
      return;
    }

    try {
      setSaving(true);
      const dateStr = targetDate.format('YYYY-MM-DD');
      await updateAllocation(allocation.id, totalMinutes, dateStr, db);
      message.success('Đã cập nhật phân bổ');
      setPopoverOpen(false);
    } catch {
      message.error('Không thể cập nhật phân bổ');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteAllocation(allocation.id, db);
      message.success(`Đã xóa phân bổ ${formatMinutes(allocation.allocatedMinutes)}`);
    } catch {
      message.error('Không thể xóa phân bổ');
    }
  };

  const editPopoverContent = (
    <div style={{ width: 220, padding: 4 }}>
      <Text strong style={{ display: 'block', marginBottom: 8 }}>
        Sửa phân bổ
      </Text>

      <div style={{ marginBottom: 8 }}>
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
          Ngày thực hiện:
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
          Thời gian dự kiến:
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
          Hủy
        </Button>
        <Button
          type="primary"
          size="small"
          loading={saving}
          onClick={() => void handleSaveEdit()}
        >
          Lưu
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
      bodyStyle={{ padding: '8px 10px' }}
      data-testid={`allocation-card-${allocation.id}`}
    >
      {/* Top row: Task name rendered full width with up to 2 lines of text (T-03-07) */}
      <Text
        strong
        delete={!isActive}
        style={{
          cursor: onEditTask ? 'pointer' : 'default',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          lineHeight: '1.3',
          wordBreak: 'break-word',
        }}
        onClick={() => onEditTask?.(task.id)}
        title="Click to view task details in drawer"
      >
        {task.name}
      </Text>

      {/* Bottom row: Meta tags and action controls */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 4,
          marginTop: 6,
        }}
      >
        {/* Left side: Priority tag and inactive/status tags with wrap */}
        <Space size={4} wrap>
          <Tag color={PRIORITY_COLORS[task.priority]} style={{ margin: 0, fontSize: 11 }}>
            {PRIORITY_LABELS[task.priority] || task.priority}
          </Tag>

          {!isActive && (
            <Tag
              icon={task.status === 'Done' ? <CheckCircleOutlined /> : <StopOutlined />}
              color="default"
              style={{ margin: 0, fontSize: 11 }}
            >
              {task.status === 'Done' ? 'Hoàn thành - không tính' : 'Đã hủy - không tính'}
            </Tag>
          )}
        </Space>

        {/* Right side: Duration popover tag and Delete Popconfirm button side-by-side */}
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
              title="Nhấn để sửa thời gian hoặc ngày"
              aria-label={`Allocated ${formatMinutes(allocation.allocatedMinutes)}`}
            >
              {formatMinutes(allocation.allocatedMinutes)}
              <EditOutlined style={{ fontSize: 10 }} />
            </Tag>
          </Popover>

          <Popconfirm
            title="Xóa phân bổ"
            description={`Xóa phân bổ ${formatMinutes(allocation.allocatedMinutes)}?`}
            okText="Xóa"
            cancelText="Hủy"
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
