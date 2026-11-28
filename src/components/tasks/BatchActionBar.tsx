import React, { useMemo, useState } from 'react';
import { Button, Dropdown, Popconfirm, Modal, Select, useAntdToken, useMessage } from '../ui';
import type { MenuProps } from 'antd';
import { DeleteOutlined, CheckCircleOutlined, FolderOutlined, CloseOutlined } from '../ui/icon';
import type { TaskStatus, ChangeRequest, System } from '../../types/models';
import type { TaskPlannerDatabase } from '../../db';
import { updateTaskStatus, reparentTask } from '../../db/repositories/taskRepo';
import { deleteTaskWithAllocations } from '../../db/repositories/cascadeRepo';

export interface BatchActionBarProps {
  selectedCount: number;
  selectedRowKeys: string[];
  onClearSelection: () => void;
  onBatchStatus?: (status: TaskStatus) => Promise<void> | void;
  onBatchDelete?: () => Promise<void> | void;
  onBatchReparent?: (crId: string, systemId?: string) => Promise<void> | void;
  changeRequests?: ChangeRequest[];
  systems?: System[];
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
  changeRequests = [],
  systems = [],
  db,
}) => {
  const message = useMessage();
  const { token } = useAntdToken();
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [targetCrId, setTargetCrId] = useState<string | undefined>(undefined);
  const [targetSystemId, setTargetSystemId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const availableSystems = useMemo(() => {
    const cr = changeRequests.find((c) => c.id === targetCrId);
    if (!cr) return [];
    return cr.targets
      .map((target) => systems.find((s) => s.id === target.systemId))
      .filter((s): s is System => Boolean(s));
  }, [changeRequests, systems, targetCrId]);

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
    if (!targetCrId) return;
    try {
      setLoading(true);
      if (onBatchReparent) {
        await onBatchReparent(targetCrId, targetSystemId);
      } else if (db) {
        await db.transaction('rw', db.tasks, async () => {
          for (const id of selectedRowKeys) {
            await reparentTask(id, targetCrId, targetSystemId, db);
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

  return (
    <>
      <div
        data-testid="batch-action-bar"
        className="tm-tasklist__batch"
      >
        <span className="tm-tasklist__batch-count">
          Đã chọn {selectedCount} tác vụ
        </span>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--gap-8)' }}>
          <Dropdown
            menu={{ items: statusMenuItems, onClick: handleStatusMenuClick }}
            trigger={['click']}
            disabled={loading}
          >
            <Button type="text" size="small" icon={<CheckCircleOutlined />} style={{ color: token.colorText }}>
              Trạng thái ▾
            </Button>
          </Dropdown>

          <Button
            type="text"
            size="small"
            icon={<FolderOutlined />}
            style={{ color: token.colorText }}
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
            <Button danger size="small" icon={<DeleteOutlined />} loading={loading}>
              Xóa
            </Button>
          </Popconfirm>

          <Button
            type="text"
            size="small"
            icon={<CloseOutlined />}
            style={{ color: token.colorText }}
            onClick={onClearSelection}
            disabled={loading}
            aria-label="Bỏ chọn"
          >
            Bỏ chọn
          </Button>
        </div>
      </div>

      <Modal
        title={`Di chuyển ${selectedCount} tác vụ`}
        open={moveModalOpen}
        onOk={handleReparentSubmit}
        onCancel={() => setMoveModalOpen(false)}
        confirmLoading={loading}
        okText="Áp dụng"
        cancelText="Hủy"
        okButtonProps={{ disabled: !targetCrId }}
        destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-16)', marginTop: 16 }}>
          <div>
            <div style={{ marginBottom: 4, fontWeight: 600, fontSize: 'var(--font-size-small)' }}>CR đích:</div>
            <Select
              showSearch
              optionFilterProp="label"
              style={{ width: '100%' }}
              placeholder="Chọn CR đích"
              value={targetCrId}
              onChange={(val) => {
                setTargetCrId(val || undefined);
                setTargetSystemId(undefined);
              }}
              options={changeRequests.map((cr) => ({ label: `${cr.code} · ${cr.name}`, value: cr.id }))}
              aria-label="CR đích"
            />
          </div>

          <div>
            <div style={{ marginBottom: 4, fontWeight: 600, fontSize: 'var(--font-size-small)' }}>Subsystem đích:</div>
            <Select
              allowClear
              style={{ width: '100%' }}
              placeholder="Chung (không gắn)"
              value={targetSystemId}
              onChange={(val) => setTargetSystemId(val || undefined)}
              disabled={!targetCrId || availableSystems.length === 0}
              options={availableSystems.map((s) => ({ label: s.name, value: s.id }))}
              aria-label="Subsystem đích"
            />
          </div>
        </div>
      </Modal>
    </>
  );
};
