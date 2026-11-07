import React, { useMemo, useState } from 'react';
import { Button, Collapse, Empty, Modal, Popconfirm, Select, Space, Table, Tag, Tooltip, Typography, message } from 'antd';
import {
  BranchesOutlined,
  BugOutlined,
  CheckCircleFilled,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  RocketOutlined,
  ThunderboltOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import { getAllSystems } from '../db/repositories/systemRepo';
import {
  deleteChangeRequest,
  getChangeRequest,
  updateChangeRequest,
} from '../db/repositories/changeRequestRepo';
import { createTask, getTasksByCr, updateTask } from '../db/repositories/taskRepo';
import { useLayoutStore } from '../workbench/store/layoutStore';
import { TaskDrawer } from '../components/tasks/TaskDrawer';
import { ChangeRequestModal } from '../components/changeRequests/ChangeRequestModal';
import { formatMinutes } from '../utils/time';
import type { CrStatus, CrType, System, Task, TaskStatus } from '../types/models';
import { SDLC_STEPS_CONFIG } from '../components/sdlc/SdlcSidebar';
import type { SdlcStepId } from '../services/wizard/workflowSchemas';

export interface ChangeRequestDetailViewProps {
  changeRequestId: string;
  db?: TaskPlannerDatabase | undefined;
}

/** Sentinel Select value for "no subsystem" — never persisted (D-32). */
export const UNATTACHED_OPTION = '__none__';

export const CR_TYPE_LABEL: Record<CrType, { label: string; color: string; icon: React.ReactNode }> = {
  NEW_FEATURE: { label: 'Tạo mới', color: '#1677ff', icon: <ThunderboltOutlined /> },
  ENHANCEMENT: { label: 'Nâng cấp', color: '#52c41a', icon: <ToolOutlined /> },
  BUGFIX: { label: 'Sửa lỗi', color: '#faad14', icon: <BugOutlined /> },
};

const CR_STATUS_LABEL: Record<CrStatus, { label: string; color: string }> = {
  Open: { label: 'Đã lập', color: 'default' },
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

/** UI-SPEC §3b: the six compact strip steps, in SDLC order. */
export const SDLC_PROGRESS_STEPS: Array<{ id: SdlcStepId; label: string }> = [
  { id: 'INTAKE', label: 'Nạp yêu cầu' },
  { id: 'SOLUTION', label: 'Giải pháp' },
  { id: 'CODE_GUIDE', label: 'Coding' },
  { id: 'CHANGE_PACK', label: 'Change Pack' },
  { id: 'TECH_DOCS', label: 'Tài liệu' },
  { id: 'CAB', label: 'CAB' },
];

function stepTitle(id: SdlcStepId): string {
  return SDLC_STEPS_CONFIG.find((s) => s.id === id)?.title ?? id;
}

const isOverdue = (deadline: string | undefined): boolean => {
  if (!deadline) return false;
  const today = new Date().toISOString().slice(0, 10);
  return deadline < today;
};

const mutedStyle: React.CSSProperties = { color: 'var(--fg-muted, #8c8c8c)', fontSize: 12 };

export const ChangeRequestDetailView: React.FC<ChangeRequestDetailViewProps> = ({
  changeRequestId,
  db = defaultDb,
}) => {
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const openTab = useLayoutStore((s) => s.openTab);

  const cr = useLiveQuery(
    () => (changeRequestId ? getChangeRequest(changeRequestId, db) : undefined),
    [changeRequestId, db]
  );
  const tasks = useLiveQuery(
    () => (changeRequestId ? getTasksByCr(changeRequestId, db) : []),
    [changeRequestId, db]
  ) ?? [];
  const systems = useLiveQuery(() => getAllSystems(db), [db]) ?? [];

  const systemMap = useMemo(() => {
    const map = new Map<string, System>();
    for (const sys of systems) map.set(sys.id, sys);
    return map;
  }, [systems]);

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

  const openSdlc = (stepId?: SdlcStepId) => {
    openTab({
      id: `sdlc-${cr.id}`,
      title: 'SDLC Studio',
      viewType: 'sdlc',
      closable: true,
      params: stepId ? { changeRequestId: cr.id, stepId } : { changeRequestId: cr.id },
    });
  };

  const openTaskDrawer = (taskId: string | null) => {
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
      openTaskDrawer(created.id);
    } catch {
      message.error('Không thể tạo tác vụ');
    }
  };

  const handleDelete = () => {
    Modal.confirm({
      title: 'Xóa Change Request',
      content: `Xóa CR '${cr.code} — ${cr.name}'? Toàn bộ ${tasks.length} tác vụ, tài liệu SDLC (SOLUTION, PL03B, CAB) và lịch sử thảo luận của CR sẽ bị xóa vĩnh viễn.`,
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
    ...cr.targets.map((t) => ({
      value: t.systemId,
      label: systemMap.get(t.systemId)?.code ?? t.systemId,
    })),
    { value: UNATTACHED_OPTION, label: 'Chung (không gắn)' },
  ];

  const secondaryBlocks = [
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
              <a key={link} href={link} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
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
      count: cr.reminders?.length ?? (cr.reminderDate ? 1 : 0),
      body:
        cr.reminders && cr.reminders.length > 0 ? (
          <Space direction="vertical" size={2}>
            {cr.reminders.map((r) => (
              <span key={r.id} style={{ fontSize: 12 }}>
                {r.date}
                {r.time ? ` ${r.time}` : ''}
                {r.note ? ` — ${r.note}` : ''}
              </span>
            ))}
          </Space>
        ) : cr.reminderDate ? (
          <span style={{ fontSize: 12 }}>
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
        gap: 16,
        padding: '16px 20px',
        maxWidth: 1400,
        margin: '0 auto',
      }}
    >
      {/* 3a. Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          padding: '16px 20px',
          background: 'var(--bg-island, #ffffff)',
          borderRadius: 8,
          border: '1px solid var(--border, #e9eaee)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Tag
              color="blue"
              style={{ fontFamily: 'monospace', fontSize: 12, padding: '2px 8px', margin: 0 }}
            >
              {cr.code}
            </Tag>
            <Typography.Title level={4} style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
              {cr.name}
            </Typography.Title>
            <Tag color={typeMeta.color} icon={typeMeta.icon} style={{ margin: 0 }}>
              {typeMeta.label}
            </Tag>
            <Tag color={statusMeta.color} style={{ margin: 0 }}>
              {statusMeta.label}
            </Tag>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {targetSystems.length > 0 ? (
              targetSystems.map((sys) => (
                <Tooltip key={sys.id} title={`${sys.name} (${sys.type})`}>
                  <Tag color="cyan" icon={<BranchesOutlined />} style={{ margin: 0, fontFamily: 'monospace', fontSize: 12 }}>
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
        </div>

        <Space wrap>
          <Button type="primary" icon={<RocketOutlined />} onClick={() => openSdlc()}>
            Mở SDLC Studio
          </Button>
          <Button icon={<EditOutlined />} onClick={() => setEditModalOpen(true)}>
            Sửa
          </Button>
          <Button danger icon={<DeleteOutlined />} onClick={handleDelete}>
            Xóa
          </Button>
        </Space>
      </div>

      {/* 3b. SDLC progress strip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, height: 24 }}>
        {SDLC_PROGRESS_STEPS.map((step, index) => (
          <React.Fragment key={step.id}>
            {index > 0 && (
              <div style={{ flex: 1, height: 1, background: 'var(--border, #e9eaee)' }} />
            )}
            <Tooltip title={stepTitle(step.id)}>
              <button
                type="button"
                aria-label={step.label}
                onClick={() => openSdlc(step.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'transparent',
                  border: 'none',
                  padding: '0 8px',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 400,
                  color: 'var(--fg-faint, #a8abb4)',
                  whiteSpace: 'nowrap',
                }}
              >
                {index === 0 ? (
                  <CheckCircleFilled style={{ color: '#52c41a' }} />
                ) : (
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: 'var(--fg-faint, #a8abb4)',
                      display: 'inline-block',
                    }}
                  />
                )}
                {step.label}
              </button>
            </Tooltip>
          </React.Fragment>
        ))}
      </div>

      {/* 3c. Flat task table */}
      <div
        style={{
          background: 'var(--bg-island, #ffffff)',
          borderRadius: 8,
          border: '1px solid var(--border, #e9eaee)',
          padding: 12,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Typography.Text strong>Tác vụ ({tasks.length})</Typography.Text>
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
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
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
                              ? '#1677ff'
                              : '#d1d3d9',
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
                width: 160,
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

      {/* 3d. Collapsible secondary blocks */}
      <Collapse
        size="small"
        ghost
        items={secondaryBlocks.map((block) => ({
          key: block.key,
          label: (
            <span data-testid={block.testId} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {block.header}
              {block.count > 0 && (
                <Tag color="blue" style={{ margin: 0, fontSize: 11, lineHeight: '16px' }}>
                  {block.count}
                </Tag>
              )}
            </span>
          ),
          children: block.body,
        }))}
      />

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
        onClose={() => setDrawerOpen(false)}
        db={db}
      />
    </div>
  );
};

export default ChangeRequestDetailView;
