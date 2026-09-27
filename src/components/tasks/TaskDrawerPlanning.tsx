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
  Tooltip,
} from 'antd';
import {
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs, { type Dayjs } from 'dayjs';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { FeasibilityModal } from '../planner/FeasibilityModal';
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
  const [feasibilityOpen, setFeasibilityOpen] = useState(false);

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
      message.error('Thời lượng phải từ ít nhất 1 phút');
      return;
    }
    if (totalMins > 1440) {
      message.error('Thời lượng không được vượt quá 24 giờ (1440 phút)');
      return;
    }

    try {
      setAdding(true);
      const dateStr = selectedDate.format('YYYY-MM-DD');
      await upsertAllocation(task.id, dateStr, totalMins, db);
      message.success(`Đã phân bổ ${formatMinutes(totalMins)} vào ${dateStr}`);
      setHours(1);
      setMinutes(0);
    } catch {
      message.error('Không thể thêm phân bổ');
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
      message.error('Thời lượng phải từ ít nhất 1 phút');
      return;
    }
    if (totalMins > 1440) {
      message.error('Thời lượng không được vượt quá 24 giờ');
      return;
    }

    try {
      setSavingEdit(true);
      const dateStr = editDate.format('YYYY-MM-DD');
      await updateAllocation(editingId, totalMins, dateStr, db);
      message.success('Đã cập nhật phân bổ');
      setEditingId(null);
    } catch {
      message.error('Không thể cập nhật phân bổ');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (id: string, mins: number) => {
    try {
      await deleteAllocation(id, db);
      message.success(`Đã xóa phân bổ ${formatMinutes(mins)}`);
    } catch {
      message.error('Không thể xóa phân bổ');
    }
  };

  const columns = [
    {
      title: 'Ngày',
      dataIndex: 'date',
      key: 'date',
      render: (d: string) => (
        <Text strong style={{ fontSize: 13 }}>
          {dayjs(d).format('YYYY-MM-DD (ddd)')}
        </Text>
      ),
    },
    {
      title: 'Thời lượng phân bổ',
      dataIndex: 'allocatedMinutes',
      key: 'allocatedMinutes',
      render: (mins: number) => <Text>{formatMinutes(mins)}</Text>,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 90,
      render: (_: unknown, record: PlannedAllocation) => {
        const isEditingThis = editingId === record.id;
        const editContent = (
          <div style={{ width: 220, padding: 4 }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              Sửa phân bổ
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
                Hủy
              </Button>
              <Button
                type="primary"
                size="small"
                loading={savingEdit}
                onClick={() => void handleSaveEdit()}
              >
                Lưu
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
                aria-label={`Sửa phân bổ ngày ${record.date}`}
              />
            </Popover>

            <Popconfirm
              title="Xóa phân bổ"
              description={`Xóa phân bổ ${formatMinutes(record.allocatedMinutes)} vào ngày ${record.date}?`}
              okText="Xóa"
              cancelText="Hủy"
              okButtonProps={{ danger: true }}
              onConfirm={() => void handleDelete(record.id, record.allocatedMinutes)}
            >
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                aria-label={`Xóa phân bổ ngày ${record.date}`}
              />
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ marginTop: 16 }} data-testid="task-drawer-planning">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <Title level={5} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <ClockCircleOutlined />
          <span>Lập kế hoạch & Phân bổ hàng ngày</span>
        </Title>
        <Tooltip
          title={
            estimateMinutes === 0
              ? 'Đặt thời gian ước tính để tự động phân bổ'
              : undefined
          }
        >
          <span>
            <Button
              size="small"
              icon={<ThunderboltOutlined />}
              onClick={() => setFeasibilityOpen(true)}
              disabled={estimateMinutes === 0}
              aria-label="Đánh giá khả thi & Tự động phân bổ"
            >
              ✨ Tự động phân bổ
            </Button>
          </span>
        </Tooltip>
      </div>

      {/* Progress & Live Estimate Comparison */}
      <Card size="small" style={{ marginBottom: 16, backgroundColor: '#fafafa' }}>
        <div style={{ marginBottom: 6 }}>
          <Progress
            percent={Math.min(100, percent)}
            status={isOverEstimate ? 'exception' : percent === 100 ? 'success' : 'normal'}
            {...(isOverEstimate ? { strokeColor: '#fa8c16' } : {})}
            aria-label="Tiến độ phân bổ"
            data-testid="planning-progress-bar"
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <Text strong data-testid="planning-metrics-total">
            Đã phân bổ: {formatMinutes(totalAllocatedMinutes)} / Ước tính: {formatMinutes(estimateMinutes)}
          </Text>
          <Text
            strong
            style={{ color: isOverEstimate ? '#fa8c16' : '#52c41a' }}
            data-testid="planning-metrics-balance"
          >
            {isOverEstimate
              ? `Phân bổ vượt mức: +${formatMinutes(overageMinutes)}`
              : `Còn lại cần phân bổ: ${formatMinutes(remainingMinutes)}`}
          </Text>
        </div>

        {isOverEstimate && (
          <Alert
            type="warning"
            showIcon
            message={`Thời gian phân bổ vượt quá ước tính tác vụ ${formatMinutes(overageMinutes)}`}
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
                description="Chưa có phân bổ nào trên các ngày lịch"
              />
            ),
          }}
        />
      </div>

      {/* Add Allocation Form */}
      <Card size="small" title={<Text strong>Lập kế hoạch theo ngày</Text>}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              Ngày thực hiện:
            </Text>
            <DatePicker
              value={selectedDate}
              onChange={(d) => d && setSelectedDate(d)}
              format="YYYY-MM-DD"
              style={{ width: '100%' }}
              aria-label="Ngày thực hiện"
            />
          </div>

          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              Thời lượng dự kiến:
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
                aria-label="Thêm phân bổ"
                data-testid="add-allocation-btn"
                onClick={() => void handleAddAllocation()}
              >
                Thêm phân bổ
              </Button>
            </Space>
          </div>

          <Space size="small">
            <Text type="secondary" style={{ fontSize: 12 }}>
              Mẫu nhanh:
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

      <FeasibilityModal
        open={feasibilityOpen}
        task={liveEstimateMinutes !== undefined ? { ...task, estimateMinutes: liveEstimateMinutes } : task}
        onCancel={() => setFeasibilityOpen(false)}
        onSuccess={() => setFeasibilityOpen(false)}
        db={db}
      />
    </div>
  );
};
