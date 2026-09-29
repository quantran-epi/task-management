import React, { useState } from 'react';
import {
  Table,
  Button,
  Space,
  Typography,
  Progress,
  Popconfirm,
  Tooltip,
  Empty,
  Card,
  theme,
  type TableColumnsType,
} from 'antd';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  CheckCircleOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs from 'dayjs';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { deleteWorkSession } from '../../db/repositories/workSessionRepo';
import { useTimer } from '../../hooks/useTimer';
import { formatMinutes, formatElapsedTicker } from '../../utils/time';
import { ManualWorkSessionModal } from './ManualWorkSessionModal';
import type { Task, WorkSession } from '../../types/models';

export interface WorkSessionsTabProps {
  task: Task;
  db?: TaskPlannerDatabase | undefined;
}

export const WorkSessionsTab: React.FC<WorkSessionsTabProps> = ({
  task,
  db = defaultDb,
}) => {
  const { token } = theme.useToken();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<WorkSession | null>(null);

  const {
    getTimerForTask,
    getElapsedSeconds,
    startTimer,
    pauseTimer,
    finishTimer,
  } = useTimer();

  const activeTimer = getTimerForTask(task.id);
  const isRunning = activeTimer?.status === 'running';
  const isPaused = activeTimer?.status === 'paused';
  const elapsedSec = getElapsedSeconds(task.id);

  // Live query all recorded work sessions for this task
  const sessions = useLiveQuery(
    async () => {
      const records = await db.workSessions.where('taskId').equals(task.id).toArray();
      return records.sort(
        (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
      );
    },
    [db, task.id]
  );

  const totalSpentMinutes = (sessions ?? []).reduce(
    (acc, curr) => acc + curr.durationMinutes,
    0
  );

  const estimateMinutes = task.estimateMinutes || 0;
  const percent = estimateMinutes > 0 ? Math.round((totalSpentMinutes / estimateMinutes) * 100) : 0;

  let progressColor = token.colorSuccess;
  if (percent >= 100) {
    progressColor = token.colorError;
  } else if (percent >= 80) {
    progressColor = token.colorWarning;
  }

  const handleDelete = async (sessionId: string) => {
    await deleteWorkSession(sessionId, db);
  };

  const columns: TableColumnsType<WorkSession> = [
    {
      title: 'Ngày',
      dataIndex: 'date',
      key: 'date',
      width: 105,
      render: (date: string) => <span style={{ fontSize: 13 }}>{date}</span>,
    },
    {
      title: 'Bắt đầu',
      dataIndex: 'startTime',
      key: 'startTime',
      width: 80,
      render: (startTime: string) => (
        <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
          {dayjs(startTime).format('HH:mm')}
        </span>
      ),
    },
    {
      title: 'Kết thúc',
      dataIndex: 'endTime',
      key: 'endTime',
      width: 80,
      render: (endTime?: string) => (
        <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
          {endTime ? dayjs(endTime).format('HH:mm') : '—'}
        </span>
      ),
    },
    {
      title: 'Thời lượng',
      dataIndex: 'durationMinutes',
      key: 'durationMinutes',
      width: 95,
      render: (mins: number) => (
        <span style={{ fontWeight: 600, fontSize: 13, color: token.colorPrimary }}>
          {formatMinutes(mins)}
        </span>
      ),
    },
    {
      title: 'Ghi chú',
      dataIndex: 'note',
      key: 'note',
      render: (note?: string) => {
        if (!note) {
          return <span style={{ color: token.colorTextQuaternary, fontSize: 12 }}>—</span>;
        }
        return (
          <Tooltip title={note.length > 50 ? note : undefined} placement="topLeft">
            <span
              style={{
                fontSize: 12,
                color: token.colorTextSecondary,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                wordBreak: 'break-word',
              }}
            >
              {note}
            </span>
          </Tooltip>
        );
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 85,
      render: (_, record) => (
        <Space orientation="horizontal" size={2}>
          <Tooltip title="Chỉnh sửa">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => {
                setEditingSession(record);
                setModalOpen(true);
              }}
              aria-label="Chỉnh sửa phiên làm việc"
              style={{ minWidth: 24, minHeight: 24, padding: 0 }}
            />
          </Tooltip>
          <Popconfirm
            title="Xóa phiên làm việc"
            description="Xóa phiên làm việc: Bạn có chắc chắn muốn xóa phiên làm việc này không? Thời gian đã ghi nhận sẽ bị trừ khỏi tổng số giờ của tác vụ."
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(record.id)}
          >
            <Tooltip title="Xóa">
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                aria-label="Xóa phiên làm việc"
                style={{ minWidth: 24, minHeight: 24, padding: 0 }}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Top Banner: Spent progress and active timer controls */}
      <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Đã ghi nhận / Ước lượng:
              </Typography.Text>
              <div style={{ fontSize: 16, fontWeight: 600 }}>
                {formatMinutes(totalSpentMinutes)}{' '}
                <span style={{ fontSize: 13, fontWeight: 400, color: token.colorTextSecondary }}>
                  / {formatMinutes(estimateMinutes)} ({percent}%)
                </span>
              </div>
            </div>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditingSession(null);
                setModalOpen(true);
              }}
              aria-label="Thêm phiên làm việc"
            >
              Thêm phiên làm việc
            </Button>
          </div>

          {estimateMinutes > 0 && (
            <Progress
              percent={Math.min(100, percent)}
              strokeColor={progressColor}
              size="small"
              showInfo={false}
              style={{ margin: 0 }}
            />
          )}

          {/* Active Timer status banner */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px 12px',
              borderRadius: 8,
              background: token.colorFillAlter,
              border: `1px solid ${token.colorBorderSecondary}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: isRunning
                    ? token.colorSuccess
                    : isPaused
                    ? token.colorWarning
                    : token.colorTextQuaternary,
                  display: 'inline-block',
                }}
              />
              <span style={{ fontWeight: 500, fontSize: 13 }}>
                {isRunning
                  ? 'Đang tính giờ trực tiếp:'
                  : isPaused
                  ? 'Đang tạm dừng:'
                  : 'Đồng hồ đang dừng'}
              </span>
              {(isRunning || isPaused) && (
                <span
                  style={{
                    fontVariantNumeric: 'tabular-nums',
                    fontWeight: 600,
                    fontSize: 14,
                    color: isRunning ? token.colorSuccess : token.colorWarning,
                  }}
                >
                  {formatElapsedTicker(elapsedSec)}
                </span>
              )}
            </div>

            <Space orientation="horizontal" size="small">
              {!activeTimer ? (
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  onClick={() => startTimer(task.id)}
                  aria-label="Bắt đầu tính giờ"
                >
                  Bắt đầu tính giờ
                </Button>
              ) : isRunning ? (
                <>
                  <Button
                    icon={<PauseCircleOutlined />}
                    onClick={() => pauseTimer(task.id)}
                    aria-label="Tạm dừng"
                  >
                    Tạm dừng
                  </Button>
                  <Button
                    type="primary"
                    icon={<CheckCircleOutlined />}
                    onClick={() => finishTimer(task.id)}
                    aria-label="Kết thúc phiên"
                  >
                    Kết thúc phiên
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="primary"
                    icon={<PlayCircleOutlined />}
                    onClick={() => startTimer(task.id)}
                    aria-label="Tiếp tục"
                  >
                    Tiếp tục
                  </Button>
                  <Button
                    icon={<CheckCircleOutlined />}
                    onClick={() => finishTimer(task.id)}
                    aria-label="Kết thúc phiên"
                  >
                    Kết thúc phiên
                  </Button>
                </>
              )}
            </Space>
          </div>
        </div>
      </Card>

      {/* Historical Sessions Table */}
      <Table
        rowKey="id"
        columns={columns}
        dataSource={sessions ?? []}
        loading={sessions === undefined}
        pagination={{ pageSize: 10, hideOnSinglePage: true }}
        size="small"
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <div>
                  <Typography.Text strong style={{ display: 'block', marginBottom: 4 }}>
                    Chưa có phiên làm việc nào
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                    Bấm "Bắt đầu tính giờ" hoặc "Thêm phiên làm việc" để ghi nhận thời gian cho tác vụ này.
                  </Typography.Text>
                </div>
              }
            />
          ),
        }}
      />

      <ManualWorkSessionModal
        open={modalOpen}
        taskId={task.id}
        sessionToEdit={editingSession}
        onClose={() => {
          setModalOpen(false);
          setEditingSession(null);
        }}
        db={db}
      />
    </div>
  );
};
