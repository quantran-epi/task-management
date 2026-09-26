import React, { useState } from 'react';
import {
  Card,
  Table,
  Button,
  DatePicker,
  InputNumber,
  Space,
  Typography,
  Progress,
  Alert,
  Popconfirm,
  Popover,
  Empty,
  message,
} from 'antd';
import {
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs, { type Dayjs } from 'dayjs';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import {
  upsertAllocation,
  updateAllocation,
  deleteAllocation,
} from '../../db/repositories/allocationRepo';
import { formatMinutes } from '../../utils/time';
import type { PlannedAllocation, Task } from '../../types/models';

const { Text, Title } = Typography;

export interface TaskDrawerPlanningProps {
  task: Task;
  liveEstimateMinutes?: number | undefined;
  db?: TaskPlannerDatabase | undefined;
}

export const TaskDrawerPlanning: React.FC<TaskDrawerPlanningProps> = ({
  task,
  liveEstimateMinutes,
  db = defaultDb,
}) => {
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
  const [hours, setHours] = useState(1);
  const [minutes, setMinutes] = useState(0);
  const [adding, setAdding] = useState(false);

  // Popover edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editHours, setEditHours] = useState(0);
  const [editMinutes, setEditMinutes] = useState(0);
  const [editDate, setEditDate] = useState<Dayjs>(dayjs());
  const [savingEdit, setSavingEdit] = useState(false);

  // Reactive query of task allocations
  const allocations = useLiveQuery(
    async () => {
      const list = await db.plannedAllocations.where('taskId').equals(task.id).toArray();
      return list.sort((a, b) => a.date.localeCompare(b.date));
    },
    [task.id, db],
    []
  );

  const totalAllocatedMinutes = allocations.reduce((sum, a) => sum + a.allocatedMinutes, 0);
  const estimateMinutes = liveEstimateMinutes !== undefined ? liveEstimateMinutes : task.estimateMinutes;
  const isOverEstimate = estimateMinutes > 0 && totalAllocatedMinutes > estimateMinutes;
  const percent =
    estimateMinutes > 0
      ? Math.round((totalAllocatedMinutes / estimateMinutes) * 100)
      : totalAllocatedMinutes > 0
        ? 100
        : 0;
  const remainingMinutes = Math.max(0, estimateMinutes - totalAllocatedMinutes);
  const overageMinutes = Math.max(0, totalAllocatedMinutes - estimateMinutes);

  const handleAddAllocation = async () => {
    const totalMins = hours * 60 + minutes;
    if (totalMins <= 0) {
      message.error('Duration must be at least 1 minute');
      return;
    }
    if (totalMins > 1440) {
      message.error('Duration cannot exceed 24 hours (1440 minutes)');
      return;
    }

    try {
      setAdding(true);
      const dateStr = selectedDate.format('YYYY-MM-DD');
      await upsertAllocation(task.id, dateStr, totalMins, db);
      message.success(`Allocated ${formatMinutes(totalMins)} on ${dateStr}`);
      setHours(1);
      setMinutes(0);
    } catch {
      message.error('Failed to add allocation');
    } finally {
      setAdding(false);
    }
  };

  const handleOpenEdit = (alloc: PlannedAllocation) => {
    setEditingId(alloc.id);
    setEditHours(Math.floor(alloc.allocatedMinutes / 60));
    setEditMinutes(alloc.allocatedMinutes % 60);
    setEditDate(dayjs(alloc.date, 'YYYY-MM-DD'));
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const totalMins = editHours * 60 + editMinutes;
    if (totalMins <= 0) {
      message.error('Duration must be at least 1 minute');
      return;
    }
    if (totalMins > 1440) {
      message.error('Duration cannot exceed 24 hours');
      return;
    }

    try {
      setSavingEdit(true);
      const dateStr = editDate.format('YYYY-MM-DD');
      await updateAllocation(editingId, totalMins, dateStr, db);
      message.success('Allocation updated');
      setEditingId(null);
    } catch {
      message.error('Failed to update allocation');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (id: string, mins: number) => {
    try {
      await deleteAllocation(id, db);
      message.success(`Removed allocation of ${formatMinutes(mins)}`);
    } catch {
      message.error('Failed to remove allocation');
    }
  };

  const columns = [
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      render: (d: string) => (
        <Text strong style={{ fontSize: 13 }}>
          {dayjs(d).format('YYYY-MM-DD (ddd)')}
        </Text>
      ),
    },
    {
      title: 'Allocated Time',
      dataIndex: 'allocatedMinutes',
      key: 'allocatedMinutes',
      render: (mins: number) => <Text>{formatMinutes(mins)}</Text>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 90,
      render: (_: unknown, record: PlannedAllocation) => {
        const isEditingThis = editingId === record.id;
        const editContent = (
          <div style={{ width: 220, padding: 4 }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              Edit Allocation
            </Text>
            <div style={{ marginBottom: 8 }}>
              <DatePicker
                value={editDate}
                onChange={(d) => d && setEditDate(d)}
                format="YYYY-MM-DD"
                size="small"
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <Space size={4}>
                <InputNumber
                  min={0}
                  max={24}
                  size="small"
                  value={editHours}
                  onChange={(v) => setEditHours(v ?? 0)}
                  suffix="h"
                  style={{ width: 80 }}
                />
                <InputNumber
                  min={0}
                  max={59}
                  step={15}
                  size="small"
                  value={editMinutes}
                  onChange={(v) => setEditMinutes(v ?? 0)}
                  suffix="m"
                  style={{ width: 80 }}
                />
              </Space>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
              <Button size="small" onClick={() => setEditingId(null)}>
                Cancel
              </Button>
              <Button
                type="primary"
                size="small"
                loading={savingEdit}
                onClick={() => void handleSaveEdit()}
              >
                Save
              </Button>
            </div>
          </div>
        );

        return (
          <Space size={4}>
            <Popover
              content={editContent}
              trigger="click"
              open={isEditingThis}
              onOpenChange={(open) => {
                if (open) handleOpenEdit(record);
                else setEditingId(null);
              }}
            >
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                aria-label={`Edit allocation on ${record.date}`}
              />
            </Popover>

            <Popconfirm
              title="Remove Allocation"
              description={`Remove allocation of ${formatMinutes(record.allocatedMinutes)} on ${record.date}?`}
              okText="Remove"
              cancelText="Cancel"
              okButtonProps={{ danger: true }}
              onConfirm={() => void handleDelete(record.id, record.allocatedMinutes)}
            >
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                aria-label={`Delete allocation on ${record.date}`}
              />
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ marginTop: 16 }} data-testid="task-drawer-planning">
      <Title level={5} style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <ClockCircleOutlined />
        <span>Planning & Daily Allocations</span>
      </Title>

      {/* Progress & Live Estimate Comparison */}
      <Card size="small" style={{ marginBottom: 16, backgroundColor: '#fafafa' }}>
        <div style={{ marginBottom: 6 }}>
          <Progress
            percent={Math.min(100, percent)}
            status={isOverEstimate ? 'exception' : percent === 100 ? 'success' : 'normal'}
            {...(isOverEstimate ? { strokeColor: '#fa8c16' } : {})}
            aria-label="Allocation progress"
            data-testid="planning-progress-bar"
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <Text strong data-testid="planning-metrics-total">
            Allocated: {formatMinutes(totalAllocatedMinutes)} of Est: {formatMinutes(estimateMinutes)}
          </Text>
          <Text
            strong
            style={{ color: isOverEstimate ? '#fa8c16' : '#52c41a' }}
            data-testid="planning-metrics-balance"
          >
            {isOverEstimate
              ? `Over-allocated: +${formatMinutes(overageMinutes)}`
              : `Remaining to plan: ${formatMinutes(remainingMinutes)}`}
          </Text>
        </div>

        {isOverEstimate && (
          <Alert
            type="warning"
            showIcon
            message={`Allocated time exceeds task estimate by ${formatMinutes(overageMinutes)}`}
            style={{ marginTop: 10 }}
            data-testid="planning-overflow-warning"
          />
        )}
      </Card>

      {/* Existing Allocations Table */}
      <div style={{ marginBottom: 16 }}>
        <Table<PlannedAllocation>
          dataSource={allocations}
          columns={columns}
          rowKey="id"
          size="small"
          pagination={false}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No planned allocations yet on any calendar date"
              />
            ),
          }}
        />
      </div>

      {/* Add Allocation Form */}
      <Card size="small" title={<Text strong>+ Plan on Date</Text>}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              Target Calendar Date:
            </Text>
            <DatePicker
              value={selectedDate}
              onChange={(d) => d && setSelectedDate(d)}
              format="YYYY-MM-DD"
              style={{ width: '100%' }}
              aria-label="Planning Date"
            />
          </div>

          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              Planned Duration:
            </Text>
            <Space align="center" size="middle">
              <InputNumber
                min={0}
                max={24}
                value={hours}
                onChange={(v) => setHours(v ?? 0)}
                suffix="h"
                style={{ width: 90 }}
                aria-label="Planning Hours"
              />
              <InputNumber
                min={0}
                max={59}
                step={15}
                value={minutes}
                onChange={(v) => setMinutes(v ?? 0)}
                suffix="m"
                style={{ width: 90 }}
                aria-label="Planning Minutes"
              />

              <Button
                type="primary"
                icon={<PlusOutlined />}
                loading={adding}
                aria-label="Add Allocation"
                data-testid="add-allocation-btn"
                onClick={() => void handleAddAllocation()}
              >
                Add Allocation
              </Button>
            </Space>
          </div>

          <Space size="small">
            <Text type="secondary" style={{ fontSize: 12 }}>
              Presets:
            </Text>
            <Button
              size="small"
              aria-label="Plan +30m"
              onClick={() => {
                setHours(0);
                setMinutes(30);
              }}
            >
              +30m
            </Button>
            <Button
              size="small"
              aria-label="Plan 1h"
              onClick={() => {
                setHours(1);
                setMinutes(0);
              }}
            >
              1h
            </Button>
            <Button
              size="small"
              aria-label="Plan 2h"
              onClick={() => {
                setHours(2);
                setMinutes(0);
              }}
            >
              2h
            </Button>
            <Button
              size="small"
              aria-label="Plan 4h"
              onClick={() => {
                setHours(4);
                setMinutes(0);
              }}
            >
              4h
            </Button>
          </Space>
        </Space>
      </Card>
    </div>
  );
};
