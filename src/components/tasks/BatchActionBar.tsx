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

const ALL_STATUSES: TaskStatus[] = [
  'Open',
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
      message.success({ content: `Updated ${selectedCount} tasks to ${nextStatus}`, duration: 2 });
    } catch {
      message.error({ content: 'Failed to update selected tasks', duration: 2 });
    } finally {
      setLoading(false);
    }
  };

  const statusMenuItems: MenuProps['items'] = ALL_STATUSES.map((s) => ({
    key: s,
    label: s,
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
      message.success({ content: `Deleted ${selectedCount} tasks`, duration: 2 });
      onClearSelection();
    } catch {
      message.error({ content: 'Failed to delete selected tasks', duration: 2 });
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
      message.success({ content: `Reparented ${selectedCount} tasks`, duration: 2 });
      setMoveModalOpen(false);
      onClearSelection();
    } catch {
      message.error({ content: 'Failed to reparent selected tasks', duration: 2 });
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
          {selectedCount} tasks selected
        </span>

        <Space orientation="horizontal" size="small">
          <Dropdown
            menu={{ items: statusMenuItems, onClick: handleStatusMenuClick }}
            trigger={['click']}
            disabled={loading}
          >
            <Button icon={<CheckCircleOutlined />}>Status ▾</Button>
          </Dropdown>

          <Button
            icon={<FolderOutlined />}
            onClick={() => setMoveModalOpen(true)}
            disabled={loading}
          >
            Move
          </Button>

          <Popconfirm
            title={`Delete ${selectedCount} Tasks`}
            description={`Are you sure you want to permanently delete ${selectedCount} selected tasks?`}
            onConfirm={handleDelete}
            okText="Delete"
            cancelText="Cancel"
            okButtonProps={{ danger: true, loading }}
          >
            <Button danger icon={<DeleteOutlined />} loading={loading}>
              Delete
            </Button>
          </Popconfirm>

          <Button
            type="text"
            icon={<CloseOutlined />}
            onClick={onClearSelection}
            disabled={loading}
            aria-label="Clear selection"
          >
            Clear
          </Button>
        </Space>
      </div>

      <Modal
        title={`Move ${selectedCount} Tasks`}
        open={moveModalOpen}
        onOk={handleReparentSubmit}
        onCancel={() => setMoveModalOpen(false)}
        confirmLoading={loading}
        okText="Apply Move"
        destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
          <div>
            <div style={{ marginBottom: 4, fontWeight: 600, fontSize: 12 }}>Target Project:</div>
            <Select
              allowClear
              style={{ width: '100%' }}
              placeholder="Standalone (No Project)"
              value={targetProjectId}
              onChange={(val) => {
                setTargetProjectId(val || undefined);
                setTargetMilestoneId(undefined);
              }}
              options={[
                { label: 'Standalone (No Project)', value: '' },
                ...projects.map((p) => ({ label: p.name, value: p.id })),
              ]}
            />
          </div>

          <div>
            <div style={{ marginBottom: 4, fontWeight: 600, fontSize: 12 }}>Target Milestone:</div>
            <Select
              allowClear
              style={{ width: '100%' }}
              placeholder="Project Root (No Milestone)"
              value={targetMilestoneId}
              onChange={(val) => setTargetMilestoneId(val || undefined)}
              disabled={!targetProjectId || availableMilestones.length === 0}
              options={[
                { label: 'Project Root (No Milestone)', value: '' },
                ...availableMilestones.map((m) => ({ label: m.name, value: m.id })),
              ]}
            />
          </div>
        </div>
      </Modal>
    </>
  );
};
