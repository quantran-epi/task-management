import React, { useState } from 'react';
import {
  Button,
  Dropdown,
  Popconfirm,
  Modal,
  Select,
  Space,
  theme,
  message,
  type MenuProps,
} from 'antd';
import {
  DeleteOutlined,
  CheckCircleOutlined,
  FolderOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import type { TaskStatus, Project, Milestone } from '../../types/models';
import type { TaskPlannerDatabase } from '../../db';
import { updateTaskStatus, reparentTask } from '../../db/repositories/taskRepo';
import { deleteTaskWithAllocations } from '../../db/repositories/cascadeRepo';

export interface BatchActionBarProps {
  selectedCount: number;
  selectedRowKeys: string[];
  onClearSelection: () => void;
  onBatchStatus?: (status: TaskStatus) => Promise<void> | void;
  onBatchDelete?: () => Promise<void> | void;
  onBatchReparent?: (projectId?: string, milestoneId?: string) => Promise<void> | void;
  projects?: Project[];
  milestones?: Milestone[];
  db?: TaskPlannerDatabase;
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  Open: 'Mở',
  Pending: 'Chờ xử lý',
  'In Progress': 'Đang làm',
  Resolved: 'Đã giải quyết',
  'In Review': 'Đang duyệt',
  Done: 'Hoàn thành',
  Cancelled: 'Đã hủy',
};

const ALL_STATUSES: TaskStatus[] = [
  'Open',
  'Pending',
  'In Progress',
  'Resolved',
  'In Review',
  'Done',
  'Cancelled',
];

export const BatchActionBar: React.FC<BatchActionBarProps> = ({
  selectedCount,
  selectedRowKeys,
  onClearSelection,
  onBatchStatus,
  onBatchDelete,
  onBatchReparent,
  projects = [],
  milestones = [],
  db,
}) => {
  const { token } = theme.useToken();
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [targetProjectId, setTargetProjectId] = useState<string | undefined>(undefined);
  const [targetMilestoneId, setTargetMilestoneId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  if (selectedCount === 0) return null;

  const handleStatusMenuClick: MenuProps['onClick'] = async ({ key }) => {
    const nextStatus = key as TaskStatus;
    try {
      setLoading(true);
      if (onBatchStatus) {
        await onBatchStatus(nextStatus);
      } else if (db) {
        await db.transaction('rw', db.tasks, async () => {
          for (const id of selectedRowKeys) {
            await updateTaskStatus(id, nextStatus, db);
          }
        });
      }
      message.success({ content: `Đã cập nhật ${selectedCount} tác vụ sang ${STATUS_LABELS[nextStatus] || nextStatus}`, duration: 2 });
    } catch {
      message.error({ content: 'Không thể cập nhật các tác vụ đã chọn', duration: 2 });
    } finally {
      setLoading(false);
    }
  };

  const statusMenuItems: MenuProps['items'] = ALL_STATUSES.map((s) => ({
    key: s,
    label: STATUS_LABELS[s] || s,
  }));

  const handleDelete = async () => {
    try {
      setLoading(true);
      if (onBatchDelete) {
        await onBatchDelete();
      } else if (db) {
        await db.transaction('rw', [db.tasks, db.plannedAllocations], async () => {
          for (const id of selectedRowKeys) {
            await deleteTaskWithAllocations(id, db);
          }
        });
      }
      message.success({ content: `Đã xóa ${selectedCount} tác vụ`, duration: 2 });
      onClearSelection();
    } catch {
      message.error({ content: 'Không thể xóa các tác vụ đã chọn', duration: 2 });
    } finally {
      setLoading(false);
    }
  };

  const handleReparentSubmit = async () => {
    try {
      setLoading(true);
      if (onBatchReparent) {
        await onBatchReparent(targetProjectId, targetMilestoneId);
      } else if (db) {
        await db.transaction('rw', db.tasks, async () => {
          for (const id of selectedRowKeys) {
            await reparentTask(id, targetProjectId, targetMilestoneId, db);
          }
        });
      }
      message.success({ content: `Đã di chuyển ${selectedCount} tác vụ`, duration: 2 });
      setMoveModalOpen(false);
      onClearSelection();
    } catch {
      message.error({ content: 'Không thể di chuyển các tác vụ đã chọn', duration: 2 });
    } finally {
      setLoading(false);
    }
  };

  const availableMilestones = milestones.filter(
    (m) => targetProjectId && m.projectId === targetProjectId
  );

  return (
    <>
      <div
        data-testid="batch-action-bar"
        style={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: token.colorBgElevated,
          boxShadow: token.boxShadowSecondary,
          borderRadius: 8,
          padding: '8px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          zIndex: 1000,
          border: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 14, color: token.colorText }}>
          Đã chọn {selectedCount} tác vụ
        </span>

        <Space orientation="horizontal" size="small">
          <Dropdown
            menu={{ items: statusMenuItems, onClick: handleStatusMenuClick }}
            trigger={['click']}
            disabled={loading}
          >
            <Button icon={<CheckCircleOutlined />}>Trạng thái ▾</Button>
          </Dropdown>

          <Button
            icon={<FolderOutlined />}
            onClick={() => setMoveModalOpen(true)}
            disabled={loading}
          >
            Di chuyển
          </Button>

          <Popconfirm
            title={`Xóa ${selectedCount} tác vụ`}
            description={`Bạn có chắc muốn xóa vĩnh viễn ${selectedCount} tác vụ đã chọn?`}
            onConfirm={handleDelete}
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ danger: true, loading }}
          >
            <Button danger icon={<DeleteOutlined />} loading={loading}>
              Xóa
            </Button>
          </Popconfirm>

          <Button
            type="text"
            icon={<CloseOutlined />}
            onClick={onClearSelection}
            disabled={loading}
            aria-label="Bỏ chọn"
          >
            Bỏ chọn
          </Button>
        </Space>
      </div>

      <Modal
        title={`Di chuyển ${selectedCount} tác vụ`}
        open={moveModalOpen}
        onOk={handleReparentSubmit}
        onCancel={() => setMoveModalOpen(false)}
        confirmLoading={loading}
        okText="Áp dụng"
        cancelText="Hủy"
        destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
          <div>
            <div style={{ marginBottom: 4, fontWeight: 600, fontSize: 12 }}>Dự án đích:</div>
            <Select
              allowClear
              style={{ width: '100%' }}
              placeholder="Độc lập (Không thuộc dự án)"
              value={targetProjectId}
              onChange={(val) => {
                setTargetProjectId(val || undefined);
                setTargetMilestoneId(undefined);
              }}
              options={[
                { label: 'Độc lập (Không thuộc dự án)', value: '' },
                ...projects.map((p) => ({ label: p.name, value: p.id })),
              ]}
            />
          </div>

          <div>
            <div style={{ marginBottom: 4, fontWeight: 600, fontSize: 12 }}>Cột mốc đích:</div>
            <Select
              allowClear
              style={{ width: '100%' }}
              placeholder="Gốc dự án (Không thuộc cột mốc)"
              value={targetMilestoneId}
              onChange={(val) => setTargetMilestoneId(val || undefined)}
              disabled={!targetProjectId || availableMilestones.length === 0}
              options={[
                { label: 'Gốc dự án (Không thuộc cột mốc)', value: '' },
                ...availableMilestones.map((m) => ({ label: m.name, value: m.id })),
              ]}
            />
          </div>
        </div>
      </Modal>
    </>
  );
};
