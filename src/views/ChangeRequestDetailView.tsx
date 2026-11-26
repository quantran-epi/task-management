import React, { useMemo, useRef, useState } from 'react';
import { Button, Empty, Select, Space, Table, Tag, Tooltip, useMessage, useTaskMateModal, Text, Title } from '../components/ui';
import { BranchesOutlined, BugOutlined, DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, ThunderboltOutlined, ToolOutlined } from '../components/ui/icon';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import { getAllSystems } from '../db/repositories/systemRepo';
import {
  deleteChangeRequest,
  getChangeRequest,
  updateChangeRequest,
} from '../db/repositories/changeRequestRepo';
import { createTask, getTasksByCr, updateTask } from '../db/repositories/taskRepo';
import { deleteTaskWithAllocations } from '../db/repositories/cascadeRepo';
import { useLayoutStore } from '../workbench/store/layoutStore';
import { TaskDrawer } from '../components/tasks/TaskDrawer';
import { EntityNotesSection } from '../components/notes/EntityNotesSection';
import { ChangeRequestModal } from '../components/changeRequests/ChangeRequestModal';
import { formatMinutes } from '../utils/time';
import type { CrStatus, CrType, System, Task, TaskStatus } from '../types/models';

export interface ChangeRequestDetailViewProps {
  changeRequestId: string;
  db?: TaskPlannerDatabase | undefined;
}

/** Sentinel Select value for "no subsystem" — never persisted (D-32). */
export const UNATTACHED_OPTION = '__none__';

export const CR_TYPE_LABEL: Record<CrType, { label: string; color: string; icon: React.ReactNode }> = {
  NEW_FEATURE: { label: 'Tạo mới', color: 'var(--accent)', icon: <ThunderboltOutlined /> },
  ENHANCEMENT: { label: 'Nâng cấp', color: '#52c41a', icon: <ToolOutlined /> },
  BUGFIX: { label: 'Sửa lỗi', color: '#faad14', icon: <BugOutlined /> },
};

const CR_STATUS_LABEL: Record<CrStatus, { label: string; color: string }> = {
  Open: { label: 'Mở', color: 'default' },
  Pending: { label: 'Chờ xử lý', color: 'gold' },
  'In Progress': { label: 'Đang chạy', color: 'processing' },
  Done: { label: 'Hoàn tất', color: 'success' },
  Cancelled: { label: 'Đã hủy', color: 'default' },
};

const TASK_STATUS_LABEL: Record<TaskStatus, { label: string; color: string }> = {
  Open: { label: 'Mở', color: 'default' },
  Pending: { label: 'Chờ xử lý', color: 'gold' },
  'In Progress': { label: 'Đang làm', color: 'processing' },
  Resolved: { label: 'Đã giải quyết', color: 'purple' },
  'In Review': { label: 'Đang duyệt', color: 'cyan' },
  Done: { label: 'Hoàn thành', color: 'success' },
  Cancelled: { label: 'Đã hủy', color: 'default' },
};

const isOverdue = (deadline: string | undefined): boolean => {
  if (!deadline) return false;
  const today = new Date().toISOString().slice(0, 10);
  return deadline < today;
};

const mutedStyle: React.CSSProperties = { color: 'var(--fg-muted)', fontSize: 'var(--font-size-small)' };

export const ChangeRequestDetailView: React.FC<ChangeRequestDetailViewProps> = ({
  changeRequestId,
  db = defaultDb,
}) => {
  const [editModalOpen, setEditModalOpen] = useState(false);
  const message = useMessage();
  const { modal, contextHolder } = useTaskMateModal();
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Set by TaskDrawer's onSave so closing after a save never deletes the real task.
  const taskSavedRef = useRef(false);
  // ponytail: placeholderTaskIdRef tracks in-memory creation; upgrade when TaskDrawer supports unpersisted creation.
  const placeholderTaskIdRef = useRef<string | null>(null);

  const reloadTab = useLayoutStore((s) => s.reloadTab);

  const cr = useLiveQuery(
    () => (changeRequestId ? getChangeRequest(changeRequestId, db) : undefined),
    [changeRequestId, db]
  );
  const tasks = useLiveQuery(
    () => (changeRequestId ? getTasksByCr(changeRequestId, db) : []),
    [changeRequestId, db]
  ) ?? [];
  const systems = useLiveQuery(() => getAllSystems(db), [db]) ?? [];
  const crNotesCount =
    useLiveQuery(
      async () => {
        if (!changeRequestId || !db?.notes) return 0;
        return await db.notes
          .where('entityId')
          .equals(changeRequestId)
          .filter((n) => n.entityType === 'cr' && !n.deletedAt)
          .count();
      },
      [changeRequestId, db]
    ) ?? 0;

  const systemMap = useMemo(() => {
    const map = new Map<string, System>();
    for (const sys of systems) map.set(sys.id, sys);
    return map;
  }, [systems]);

  // Derived only from data already loaded in this tab — no new IndexedDB query.
  const stats = useMemo(() => ({
    taskCount: tasks.length,
    openTaskCount: tasks.filter((t) => t.status !== 'Done' && t.status !== 'Cancelled').length,
    doneCount: tasks.filter((t) => t.status === 'Done').length,
    estimateLabel: formatMinutes(tasks.reduce((sum, t) => sum + (t.estimateMinutes || 0), 0)),
    noteCount: crNotesCount,
    docCount: cr?.documentLinks?.length ?? 0,
    reminderCount: Math.max(cr?.reminders?.length ?? 0, cr?.reminderDate ? 1 : 0),
  }), [tasks, crNotesCount, cr]);

  if (!cr) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <Empty description="Không tìm thấy Change Request" />
      </div>
    );
  }

  const targetSystems = cr.targets
    .map((t) => systemMap.get(t.systemId))
    .filter((s): s is System => Boolean(s));

  const openTaskDrawer = (taskId: string | null, isPlaceholder = false) => {
    placeholderTaskIdRef.current = isPlaceholder ? taskId : null;
    taskSavedRef.current = false;
    setDrawerTaskId(taskId);
    setDrawerOpen(true);
  };

  const handleCreateTask = async () => {
    // TaskDrawer has no crId-prefill prop, so create the row first (same pattern as
    // ItemInsightView) and open the drawer on it — crId is then pre-filled from the record.
    try {
      const created = await createTask(
        { crId: cr.id, name: 'Tác vụ mới', status: 'Open', priority: 'Medium', estimateMinutes: 0 },
        db
      );
      openTaskDrawer(created.id, true);
    } catch {
      message.error('Không thể tạo tác vụ');
    }
  };

  /** WR-13: a drawer closed without saving must not leave the placeholder row behind. */
  const handleCloseTaskDrawer = async () => {
    const id = drawerTaskId;
    const isPlaceholder = Boolean(id && placeholderTaskIdRef.current === id);
    setDrawerOpen(false);
    setDrawerTaskId(null);
    placeholderTaskIdRef.current = null;

    if (!id || !isPlaceholder || taskSavedRef.current) {
      taskSavedRef.current = false;
      return;
    }
    taskSavedRef.current = false;
    try {
      await deleteTaskWithAllocations(id, db);
    } catch {
      // Leaving an unsaved placeholder is preferable to deleting real work.
    }
  };

  const handleDelete = () => {
    modal.confirm({
      title: 'Xóa Change Request',
      content: `Xóa CR '${cr.code} — ${cr.name}'? Toàn bộ ${tasks.length} tác vụ và lịch sử thảo luận của CR sẽ bị xóa vĩnh viễn.`,
      okText: 'Xóa vĩnh viễn',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: async () => {
        try {
          await deleteChangeRequest(cr.id, db);
          message.success('Đã xóa Change Request');
        } catch {
          message.error('Không thể xóa Change Request');
        }
      },
    });
  };

  const handleSubsystemChange = async (task: Task, value: string) => {
    try {
      await updateTask(
        task.id,
        { systemId: value === UNATTACHED_OPTION ? undefined : value },
        db
      );
    } catch {
      message.error('Không thể cập nhật subsystem của tác vụ');
    }
  };

  const typeMeta = CR_TYPE_LABEL[cr.type] ?? CR_TYPE_LABEL.ENHANCEMENT;
  const statusMeta = CR_STATUS_LABEL[cr.status] ?? CR_STATUS_LABEL.Open;

  const subsystemOptions = [
    ...cr.targets.map((t) => {
      const sys = systemMap.get(t.systemId);
      return {
        value: t.systemId,
        label: sys ? `${sys.name} (${sys.code})` : t.systemId,
      };
    }),
    { value: UNATTACHED_OPTION, label: 'Chung (không gắn)' },
  ];

  const secondaryBlocks = [
    {
      key: 'notes',
      testId: 'cr-detail-block-notes',
      header: 'Ghi chú',
      count: crNotesCount,
      body: <EntityNotesSection entityType="cr" entityId={cr.id} db={db} />,
    },
    {
      key: 'jira',
      testId: 'cr-detail-block-jira',
      header: 'Jira Epic',
      count: cr.jiraEpicKey ? 1 : 0,
      body: cr.jiraEpicKey ? (
        <Tag color="blue" style={{ fontFamily: 'monospace' }}>
          {cr.jiraEpicKey}
        </Tag>
      ) : (
        <span style={mutedStyle}>Chưa có</span>
      ),
    },
    {
      key: 'documents',
      testId: 'cr-detail-block-documents',
      header: 'Tài liệu liên kết',
      count: cr.documentLinks?.length ?? 0,
      body:
        cr.documentLinks && cr.documentLinks.length > 0 ? (
          <Space direction="vertical" size={2}>
            {cr.documentLinks.map((link) => (
              <a key={link} href={link} target="_blank" rel="noreferrer" style={{ fontSize: 'var(--font-size-small)' }}>
                {link}
              </a>
            ))}
          </Space>
        ) : (
          <span style={mutedStyle}>Chưa có</span>
        ),
    },
    {
      key: 'reminders',
      testId: 'cr-detail-block-reminders',
      header: 'Nhắc nhở',
      count: stats.reminderCount,
      body:
        cr.reminders && cr.reminders.length > 0 ? (
          <Space direction="vertical" size={2}>
            {cr.reminders.map((r) => (
              <span key={r.id} style={{ fontSize: 'var(--font-size-small)' }}>
                {r.date}
                {r.time ? ` ${r.time}` : ''}
                {r.note ? ` — ${r.note}` : ''}
              </span>
            ))}
          </Space>
        ) : cr.reminderDate ? (
          <span style={{ fontSize: 'var(--font-size-small)' }}>
            {cr.reminderDate}
            {cr.reminderNote ? ` — ${cr.reminderNote}` : ''}
          </span>
        ) : (
          <span style={mutedStyle}>Chưa có</span>
        ),
    },
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--gap-12)',
        padding: '12px 16px',
        maxWidth: 1400,
        margin: '0 auto',
      }}
    >
      {contextHolder}
      {/* 3a. Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 'var(--gap-12)',
          padding: '12px 16px',
          background: 'var(--bg-island)',
          borderRadius: 'var(--radius-control)',
          border: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-6)', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-8)', flexWrap: 'wrap' }}>
            <Tag
              color="blue"
              style={{ fontFamily: 'monospace', fontSize: 'var(--font-size-small)', padding: '2px 8px', margin: 0 }}
            >
              {cr.code}
            </Tag>
            <Title level={4} style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
              {cr.name}
            </Title>
            <Tag color={typeMeta.color} icon={typeMeta.icon} style={{ margin: 0 }}>
              {typeMeta.label}
            </Tag>
            <Tag color={statusMeta.color} style={{ margin: 0 }}>
              {statusMeta.label}
            </Tag>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-6)', flexWrap: 'wrap' }}>
            {targetSystems.length > 0 ? (
              targetSystems.map((sys) => (
                <Tooltip key={sys.id} title={`${sys.name} (${sys.type})`}>
                  <Tag color="cyan" icon={<BranchesOutlined />} style={{ margin: 0, fontFamily: 'monospace', fontSize: 'var(--font-size-small)' }}>
                    {sys.code}
                  </Tag>
                </Tooltip>
              ))
            ) : (
              <>
                <span style={mutedStyle}>Chưa gắn subsystem</span>
                <Button type="link" size="small" style={{ padding: 0, height: 'auto' }} onClick={() => setEditModalOpen(true)}>
                  Chọn subsystem
                </Button>
              </>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-12)', flexWrap: 'wrap', ...mutedStyle }}>
            <span>Jira Epic</span>
            <span style={{ fontFamily: 'monospace', color: 'var(--fg)' }}>{cr.jiraEpicKey ?? 'Chưa có'}</span>
            <span>Cập nhật</span>
            <span style={{ fontFamily: 'monospace', color: 'var(--fg)' }}>{cr.updatedAt.slice(0, 10)}</span>
          </div>
        </div>

        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={() => reloadTab(`cr-${cr.id}`)}>
            Tải lại
          </Button>
          <Button icon={<EditOutlined />} onClick={() => setEditModalOpen(true)}>
            Sửa
          </Button>
          <Button danger icon={<DeleteOutlined />} onClick={handleDelete}>
            Xóa
          </Button>
        </Space>
      </div>

      {/* Stats from already-loaded data — no new query */}
      <div
        data-testid="cr-detail-stats"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--gap-16)',
          flexWrap: 'wrap',
          padding: 'var(--gap-8) var(--gap-12)',
          background: 'var(--bg-island)',
          borderRadius: 'var(--radius-control)',
          border: '1px solid var(--border)',
        }}
      >
        {([
          ['TASK', String(stats.taskCount)],
          ['MỞ / PENDING', String(stats.openTaskCount)],
          ['ƯỚC TÍNH', stats.estimateLabel],
          ['HOÀN THÀNH', `${stats.doneCount}/${stats.taskCount}`],
          ['GHI CHÚ', String(stats.noteCount)],
          ['DOC / REMINDER', `${stats.docCount} / ${stats.reminderCount}`],
        ] as const).map(([label, value], index) => (
          <React.Fragment key={label}>
            {index > 0 && <span style={{ width: 1, height: 20, background: 'var(--border)' }} />}
            <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
              <span style={mutedStyle}>{label}</span>
              <span style={{ fontFamily: 'monospace', fontSize: 'var(--font-size-small)', color: 'var(--fg)' }}>{value}</span>
            </span>
          </React.Fragment>
        ))}
      </div>

      {/* Task table full width, secondary cards stacked below */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-12)', minWidth: 0 }}>
      {/* 3c. Flat task table */}
      <div
        style={{
          background: 'var(--bg-island)',
          borderRadius: 'var(--radius-control)',
          border: '1px solid var(--border)',
          padding: 12,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text strong>Tác vụ ({tasks.length})</Text>
          <Button icon={<PlusOutlined />} size="small" onClick={handleCreateTask}>
            Thêm tác vụ
          </Button>
        </div>

        {tasks.length === 0 ? (
          <Empty description="CR này chưa có tác vụ nào" style={{ margin: '16px 0' }}>
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleCreateTask}>
              Thêm tác vụ
            </Button>
          </Empty>
        ) : (
          <Table
            dataSource={tasks}
            rowKey="id"
            size="small"
            pagination={false}
            columns={[
              {
                title: 'Task',
                dataIndex: 'name',
                key: 'name',
                render: (name: string, record: Task) => (
                  <span
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--gap-6)', cursor: 'pointer' }}
                    onClick={() => openTaskDrawer(record.id)}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        display: 'inline-block',
                        background:
                          record.status === 'Done'
                            ? '#52c41a'
                            : record.status === 'In Progress'
                              ? 'var(--accent)'
                              : 'var(--border-strong)',
                      }}
                    />
                    {name}
                  </span>
                ),
              },
              {
                title: 'Subsystem',
                dataIndex: 'systemId',
                key: 'systemId',
                width: 200,
                render: (systemId: string | undefined, record: Task) => (
                  <span data-testid={`subsystem-cell-${record.id}`}>
                    <Select
                      size="small"
                      variant="borderless"
                      style={{ width: '100%' }}
                      value={systemId ?? UNATTACHED_OPTION}
                      options={subsystemOptions}
                      onChange={(value: string) => void handleSubsystemChange(record, value)}
                    />
                  </span>
                ),
              },
              {
                title: 'Status',
                dataIndex: 'status',
                key: 'status',
                width: 110,
                render: (status: TaskStatus) => {
                  const meta = TASK_STATUS_LABEL[status] ?? { label: status, color: 'default' };
                  return <Tag color={meta.color}>{meta.label}</Tag>;
                },
              },
              {
                title: 'Ước lượng',
                dataIndex: 'estimateMinutes',
                key: 'estimateMinutes',
                width: 100,
                render: (minutes: number) => formatMinutes(minutes),
              },
              {
                title: 'Hạn',
                dataIndex: 'deadline',
                key: 'deadline',
                width: 110,
                render: (deadline: string | undefined) =>
                  deadline ? (
                    <span style={{ color: isOverdue(deadline) ? 'var(--danger, #c54e58)' : undefined }}>
                      {deadline}
                    </span>
                  ) : (
                    <span style={mutedStyle}>—</span>
                  ),
              },
            ]}
          />
        )}
      </div>

      {/* 3d. Secondary blocks always visible */}
      {secondaryBlocks.map((block) => (
        <div
          key={block.key}
          style={{
            background: 'var(--bg-island)',
            borderRadius: 'var(--radius-control)',
            border: '1px solid var(--border)',
            padding: 'var(--gap-12)',
            minWidth: 0,
          }}
        >
          <span data-testid={block.testId} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--gap-6)', fontWeight: 600, marginBottom: 'var(--gap-8)' }}>
            {block.header}
            {block.count > 0 && (
              <Tag color="blue" style={{ margin: 0, fontSize: 'var(--font-size-xs)', lineHeight: '16px' }}>
                {block.count}
              </Tag>
            )}
          </span>
          <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{block.body}</div>
        </div>
      ))}
      </div>

      <ChangeRequestModal
        open={editModalOpen}
        changeRequest={cr}
        systems={systems}
        onClose={() => setEditModalOpen(false)}
        onSave={async (values) => {
          await updateChangeRequest(cr.id, values as never, db);
          message.success('Đã cập nhật Change Request');
          setEditModalOpen(false);
        }}
        db={db}
      />

      <TaskDrawer
        taskId={drawerTaskId}
        open={drawerOpen}
        onClose={() => void handleCloseTaskDrawer()}
        onSave={() => {
          taskSavedRef.current = true;
          placeholderTaskIdRef.current = null;
        }}
        db={db}
      />
    </div>
  );
};

export default ChangeRequestDetailView;
