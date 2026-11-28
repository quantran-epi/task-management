import React, { useMemo, useRef, useState } from 'react';
import { Button, Card, DatePicker, Dropdown, Empty, IconButton, Input, Modal, Popconfirm, Progress, SearchInput, Select, Space, Table, Tag, Tooltip, useMessage, useTaskMateModal, Text, Title } from '../components/ui';
import { BranchesOutlined, BugOutlined, DeleteOutlined, EditOutlined, FolderOpenOutlined, LinkOutlined, MoreOutlined, PlusOutlined, ReloadOutlined, ThunderboltOutlined, ToolOutlined } from '../components/ui/icon';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs, { type Dayjs } from 'dayjs';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import { getAllSystems } from '../db/repositories/systemRepo';
import { createCrMilestone, deleteCrMilestoneWithCascade, listCrMilestones, updateCrMilestone } from '../db/repositories/crMilestoneRepo';
import {
  appendChangeRequestLink,
  deleteChangeRequest,
  getChangeRequest,
  updateChangeRequest,
} from '../db/repositories/changeRequestRepo';
import { createTask, getTasksByCr, updateTask } from '../db/repositories/taskRepo';
import { deleteTaskWithAllocations } from '../db/repositories/cascadeRepo';
import { useTaskMenuItems } from '../hooks/useTaskMenuItems';
import { useLayoutStore } from '../workbench/store/layoutStore';
import { TaskDrawer } from '../components/tasks/TaskDrawer';
import { EntityNotesSection } from '../components/notes/EntityNotesSection';
import { ChangeRequestModal } from '../components/changeRequests/ChangeRequestModal';
import { QuickReminderModal } from '../components/common/QuickReminderModal';
import { formatMinutes } from '../utils/time';
import { isValidLinkUrl, LINK_NAME_MAX_LENGTH } from '../validation/schemas';
import { searchIncludes } from '../utils/searchText';
import { openDocumentLink, isLocalPath } from '../utils/documentLinks';
import type { CrMilestone, CrStatus, CrType, System, Task, TaskStatus } from '../types/models';

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
  const placeholderTaskIdRef = useRef<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [taskSearch, setTaskSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'ALL'>('ALL');
  const [linkName, setLinkName] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [editingLinkIndex, setEditingLinkIndex] = useState<number | null>(null);
  const [crReminderModalOpen, setCrReminderModalOpen] = useState(false);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
  // undefined = no editor, null = new milestone, CrMilestone = editing.
  const [editingMilestone, setEditingMilestone] = useState<CrMilestone | null | undefined>(undefined);
  const [milestoneName, setMilestoneName] = useState('');
  const [milestoneDate, setMilestoneDate] = useState<Dayjs | null>(null);
  const [milestoneError, setMilestoneError] = useState<string | null>(null);
  // Set by TaskDrawer's onSave so closing after a save never deletes the real task.
  const taskSavedRef = useRef(false);
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
  const milestones = useLiveQuery(
    () => (changeRequestId ? listCrMilestones(changeRequestId, db) : []),
    [changeRequestId, db]
  ) ?? [];
  const milestoneNoteCounts =
    useLiveQuery(
      async () => {
        if (!milestones.length) return new Map<string, number>();
        const notes = await db.notes
          .where('entityId')
          .anyOf(milestones.map((m) => m.id))
          .filter((n) => n.entityType === 'crMilestone' && !n.deletedAt)
          .toArray();
        const counts = new Map<string, number>();
        for (const note of notes) {
          if (!note.entityId) continue;
          counts.set(note.entityId, (counts.get(note.entityId) ?? 0) + 1);
        }
        return counts;
      },
      [milestones, db]
    ) ?? new Map<string, number>();
  const milestoneMap = useMemo(() => new Map(milestones.map((m) => [m.id, m])), [milestones]);
  const selectedMilestone = selectedMilestoneId ? milestoneMap.get(selectedMilestoneId) : undefined;
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
    linkCount: cr?.links?.length ?? 0,
    reminderCount: Math.max(cr?.reminders?.length ?? 0, cr?.reminderDate ? 1 : 0),
  }), [tasks, crNotesCount, cr]);

  // Filter only the table source — stats above always use the full task array.
  const filteredTasks = useMemo(() => {
    const needle = taskSearch.trim();
    return tasks.filter(
      (t) =>
        (!needle || searchIncludes(t.name, needle)) &&
        (statusFilter === 'ALL' || t.status === statusFilter)
    );
  }, [tasks, taskSearch, statusFilter]);

  const orderedTasks = useMemo(() => {
    const rank = new Map(milestones.map((m, index) => [m.id, index]));
    return [...filteredTasks].sort((a, b) => {
      const aRank = a.milestoneId ? rank.get(a.milestoneId) ?? milestones.length : milestones.length;
      const bRank = b.milestoneId ? rank.get(b.milestoneId) ?? milestones.length : milestones.length;
      return aRank - bRank;
    });
  }, [filteredTasks, milestones]);

  const milestoneGroupSizes = useMemo(() => {
    const sizes = new Map<string, number>();
    for (const task of orderedTasks) {
      const key = task.milestoneId ?? '';
      sizes.set(key, (sizes.get(key) ?? 0) + 1);
    }
    return sizes;
  }, [orderedTasks]);

  const openMilestoneEditor = (milestone?: CrMilestone) => {
    setEditingMilestone(milestone ?? null);
    setMilestoneName(milestone?.name ?? '');
    setMilestoneDate(milestone?.targetDate ? dayjs(milestone.targetDate, 'YYYY-MM-DD') : null);
    setMilestoneError(null);
  };

  const handleSaveMilestone = async () => {
    const trimmed = milestoneName.trim();
    if (!trimmed) {
      setMilestoneError('Nhập tên mốc');
      return;
    }
    try {
      const targetDate = milestoneDate ? milestoneDate.format('YYYY-MM-DD') : undefined;
      const saved =
        editingMilestone && editingMilestone !== null
          ? await updateCrMilestone(
              editingMilestone.id,
              { name: trimmed, ...(targetDate !== undefined ? { targetDate } : { targetDate: undefined }) },
              db
            )
          : await createCrMilestone(
              { crId: changeRequestId, name: trimmed, ...(targetDate !== undefined ? { targetDate } : {}) },
              db
            );
      message.success(editingMilestone && editingMilestone !== null ? 'Đã cập nhật mốc' : 'Đã thêm mốc');
      setSelectedMilestoneId(saved.id);
      setEditingMilestone(undefined);
      setMilestoneError(null);
    } catch {
      message.error({ content: 'Không thể lưu mốc.' });
      setMilestoneError('Thử lại. Nếu lỗi tiếp tục, kiểm tra CR rồi thử lại.');
    }
  };

  const handleDeleteMilestone = async (milestone: CrMilestone) => {
    try {
      await deleteCrMilestoneWithCascade(milestone.id, db);
      if (selectedMilestoneId === milestone.id) setSelectedMilestoneId(null);
      if (editingMilestone && editingMilestone !== null && editingMilestone.id === milestone.id) {
        setEditingMilestone(undefined);
      }
      message.success('Đã xóa mốc');
    } catch {
      message.error({ content: 'Không thể xóa mốc.' });
    }
  };

  const openTaskDrawer = (taskId: string | null, isPlaceholder = false) => {
    placeholderTaskIdRef.current = isPlaceholder ? taskId : null;
    taskSavedRef.current = false;
    setDrawerTaskId(taskId);
    setDrawerOpen(true);
  };

  const { getTaskMenuItems, reminderModal, contextHolder: taskMenuContextHolder } = useTaskMenuItems({
    db,
    onOpenDrawer: openTaskDrawer,
    onDeleted: (taskId) => {
      if (placeholderTaskIdRef.current === taskId) placeholderTaskIdRef.current = null;
    },
  });
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

  const handleRemoveLink = async (index: number) => {
    try {
      await updateChangeRequest(cr.id, { links: (cr.links ?? []).filter((_, i) => i !== index) }, db);
      message.success('Đã xóa liên kết');
    } catch {
      message.error('Không thể xóa liên kết');
    }
  };

  const handleRemoveReminder = (reminderId: string) => {
    modal.confirm({
      title: 'Xóa nhắc nhở',
      content: 'Xóa nhắc nhở này khỏi Change Request?',
      okText: 'Xóa',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: async () => {
        try {
          await updateChangeRequest(
            cr.id,
            { reminders: (cr.reminders ?? []).filter((r) => r.id !== reminderId) },
            db
          );
          message.success('Đã xóa nhắc nhở');
        } catch {
          message.error('Không thể xóa nhắc nhở');
        }
      },
    });
  };

  const openLinkEditor = (index: number | null) => {
    const link = index === null ? undefined : cr.links?.[index];
    setLinkName(link?.name ?? '');
    setLinkUrl(link?.url ?? '');
    setEditingLinkIndex(index);
    setLinkModalOpen(true);
  };

  const handleSaveLink = async () => {
    const trimmed = linkUrl.trim();
    if (!trimmed || !isValidLinkUrl(trimmed)) {
      message.error('URL không hợp lệ');
      return;
    }
    if (linkName.trim().length > LINK_NAME_MAX_LENGTH) {
      message.error('Tên liên kết tối đa 80 ký tự');
      return;
    }
    const payload = { name: linkName.trim(), url: trimmed };
    try {
      if (editingLinkIndex === null) {
        await appendChangeRequestLink(cr.id, payload, db);
      } else {
        await updateChangeRequest(
          cr.id,
          { links: (cr.links ?? []).map((link, i) => (i === editingLinkIndex ? payload : link)) },
          db
        );
      }
      message.success(editingLinkIndex === null ? 'Đã thêm liên kết' : 'Đã cập nhật liên kết');
      setLinkName('');
      setLinkUrl('');
      setEditingLinkIndex(null);
      setLinkModalOpen(false);
    } catch {
      message.error(editingLinkIndex === null ? 'Không thể thêm liên kết' : 'Không thể cập nhật liên kết');
    }
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
      key: 'reminders',
      testId: 'cr-detail-block-reminders',
      header: 'Nhắc nhở',
      count: stats.reminderCount,
      action: (
        <Button data-testid="cr-detail-reminder-add" size="small" icon={<PlusOutlined />} onClick={() => setCrReminderModalOpen(true)}>
          Thêm nhắc nhở
        </Button>
      ),
      body: (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 'var(--gap-8)' }}>
          {cr.reminders && cr.reminders.length > 0 ? (
            <Space direction="vertical" size={4}>
              {cr.reminders.map((r) => (
                <Space key={r.id} size={4} align="center">
                  <span style={{ fontSize: 'var(--font-size-small)' }}>
                    {r.date}
                    {r.time ? ` ${r.time}` : ''}
                    {r.note ? ` — ${r.note}` : ''}
                  </span>
                  <Tooltip title="Sửa nhắc nhở">
                    <Button
                      type="text"
                      size="small"
                      aria-label="Sửa nhắc nhở"
                      icon={<EditOutlined />}
                      onClick={() => setEditModalOpen(true)}
                    />
                  </Tooltip>
                  <Tooltip title="Xóa nhắc nhở">
                    <Button
                      type="text"
                      danger
                      size="small"
                      aria-label="Xóa nhắc nhở"
                      icon={<DeleteOutlined />}
                      onClick={() => handleRemoveReminder(r.id)}
                    />
                  </Tooltip>
                </Space>
              ))}
            </Space>
          ) : cr.reminderDate ? (
            <span style={{ fontSize: 'var(--font-size-small)' }}>
              {cr.reminderDate}
              {cr.reminderNote ? ` — ${cr.reminderNote}` : ''}
            </span>
          ) : (
            <span style={mutedStyle}>Chưa có</span>
          )}
        </div>
      ),
    },
    {
      key: 'links',
      testId: 'cr-detail-block-documents',
      header: 'Links',
      count: stats.linkCount,
      action: (
        <Button data-testid="cr-detail-link-add" size="small" icon={<PlusOutlined />} onClick={() => openLinkEditor(null)}>
          Thêm link
        </Button>
      ),
      body: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-8)' }}>
          {stats.linkCount > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 'var(--radius-control)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-8)', padding: '4px 8px', borderBottom: '1px solid var(--border)', ...mutedStyle, fontSize: 'var(--font-size-xs)' }}>
                <span style={{ width: 160, flexShrink: 0 }}>Tên</span>
                <span style={{ flex: 1, minWidth: 0 }}>Đường dẫn</span>
                <span style={{ width: 56, flexShrink: 0 }} />
              </div>
              {(cr.links ?? []).map((link, idx) => (
                <div key={`${idx}-${link.url}`} style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-8)', padding: '4px 8px' }}>
                  <Text ellipsis style={{ width: 160, flexShrink: 0, fontSize: 'var(--font-size-small)' }} title={link.name || link.url}>
                    {link.name || '—'}
                  </Text>
                  <Button
                    type="link"
                    size="small"
                    style={{ flex: 1, minWidth: 0, padding: 0, height: 'auto', justifyContent: 'flex-start', fontFamily: 'monospace' }}
                    title={link.url}
                    icon={isLocalPath(link.url) ? <FolderOpenOutlined /> : <LinkOutlined />}
                    onClick={(e) => void openDocumentLink(link.url, { quickClaude: e.altKey, notify: (kind, text, extra) => message[kind]({ content: text, ...(extra ?? {}) }), confirm: (cfg) => modal.confirm(cfg) })}
                  >
                    <Text ellipsis style={{ fontSize: 'var(--font-size-small)' }}>{link.url}</Text>
                  </Button>
                  <Space size={0} style={{ width: 56, flexShrink: 0 }}>
                    <Tooltip title="Sửa liên kết">
                      <Button type="text" size="small" aria-label="Sửa liên kết" icon={<EditOutlined />} onClick={() => openLinkEditor(idx)} />
                    </Tooltip>
                    <Popconfirm
                      title="Xóa liên kết này?"
                      okText="Xóa"
                      cancelText="Hủy"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => void handleRemoveLink(idx)}
                    >
                      <Button type="text" danger size="small" aria-label="Xóa liên kết" icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                </div>
              ))}
            </div>
          ) : (
            <span style={mutedStyle}>Chưa có</span>
          )}
        </div>
      ),
    },
    {
      key: 'notes',
      testId: 'cr-detail-block-notes',
      header: 'Ghi chú',
      count: crNotesCount,
      body: <EntityNotesSection entityType="cr" entityId={cr.id} db={db} />,
    },
    {
      key: 'milestones',
      testId: 'cr-detail-milestones',
      header: 'Mốc triển khai',
      count: milestones.length,
      action: (
        <Button data-testid="cr-detail-milestone-add" size="small" icon={<PlusOutlined />} onClick={() => openMilestoneEditor()}>
          Thêm mốc
        </Button>
      ),
      body: (
        <div data-testid="cr-detail-milestones-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-8)' }}>
          {milestones.length === 0 && editingMilestone === undefined ? (
            <>
              <Text strong style={{ fontSize: 'var(--font-size-small)' }}>Chưa có mốc triển khai</Text>
              <span style={mutedStyle}>Thêm mốc để nhóm tác vụ theo từng đợt triển khai.</span>
              <Button size="small" icon={<PlusOutlined />} onClick={() => openMilestoneEditor()}>Thêm mốc</Button>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 'var(--radius-control)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-8)', padding: '4px 8px', borderBottom: '1px solid var(--border)', ...mutedStyle, fontSize: 'var(--font-size-xs)' }}>
                <span style={{ flex: 1, minWidth: 0 }}>Tên mốc</span>
                <span style={{ width: 96, flexShrink: 0 }}>Ngày mục tiêu</span>
                <span style={{ width: 56, flexShrink: 0 }}>Ghi chú</span>
                <span style={{ width: 64, flexShrink: 0 }} />
              </div>
              {editingMilestone !== undefined && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-4)', padding: '4px 8px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-8)' }}>
                    <Input
                      autoFocus
                      size="small"
                      data-testid="cr-detail-milestone-name"
                      placeholder="Tên mốc"
                      value={milestoneName}
                      onChange={(e) => { setMilestoneName(e.target.value); setMilestoneError(null); }}
                      onPressEnter={() => void handleSaveMilestone()}
                      onKeyDown={(e) => { if (e.key === 'Escape') setEditingMilestone(undefined); }}
                    />
                    <DatePicker
                      size="small"
                      placeholder="Chọn ngày"
                      value={milestoneDate}
                      onChange={(date) => setMilestoneDate(date)}
                    />
                    <Button size="small" type="primary" onClick={() => void handleSaveMilestone()}>Lưu</Button>
                    <Button size="small" onClick={() => setEditingMilestone(undefined)}>Hủy</Button>
                  </div>
                  {milestoneError && (
                    <span role="alert" style={{ color: 'var(--danger)', fontSize: 'var(--font-size-xs)' }}>{milestoneError}</span>
                  )}
                </div>
              )}
              {milestones.map((milestone) => {
                const isSelected = selectedMilestoneId === milestone.id;
                return (
                  <div
                    key={milestone.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Chọn mốc ${milestone.name}`}
                    onClick={() => setSelectedMilestoneId(milestone.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedMilestoneId(milestone.id);
                      }
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 'var(--gap-8)', padding: '4px 8px',
                      background: isSelected ? 'var(--bg-selected)' : undefined,
                      boxShadow: isSelected ? 'inset 2px 0 0 var(--accent)' : undefined,
                      cursor: 'pointer',
                    }}
                  >
                    <Text ellipsis style={{ flex: 1, minWidth: 0, fontSize: 'var(--font-size-small)' }} title={milestone.name}>
                      {milestone.name}
                    </Text>
                    <span style={{ width: 96, flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-small)' }}>
                      {milestone.targetDate ?? '—'}
                    </span>
                    <span style={{ width: 56, flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-small)' }}>
                      {milestoneNoteCounts.get(milestone.id) ?? 0}
                    </span>
                    <Space size={0} style={{ width: 64, flexShrink: 0 }}>
                      <Tooltip title="Sửa mốc">
                        <IconButton
                          type="text"
                          size="small"
                          aria-label="Sửa mốc"
                          icon={<EditOutlined />}
                          onClick={(e) => { e.stopPropagation(); openMilestoneEditor(milestone); }}
                        />
                      </Tooltip>
                      <Popconfirm
                        title={`Xóa mốc «${milestone.name}»?`}
                        description="Tác vụ trong mốc này sẽ chuyển về «Chưa gán mốc» và ghi chú đính kèm sẽ bị bỏ gắn. Tác vụ và ghi chú vẫn được giữ lại."
                        okText="Xóa"
                        cancelText="Hủy"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => void handleDeleteMilestone(milestone)}
                      >
                        <span onClick={(e) => e.stopPropagation()}>
                          <IconButton type="text" size="small" danger aria-label="Xóa mốc" icon={<DeleteOutlined />} />
                        </span>
                      </Popconfirm>
                    </Space>
                  </div>
                );
              })}
            </div>
          )}
          {selectedMilestone && <EntityNotesSection entityType="crMilestone" entityId={selectedMilestone.id} db={db} />}
        </div>
      ),
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
      {taskMenuContextHolder}
      {reminderModal}
      {crReminderModalOpen && (
        <QuickReminderModal
          open
          onClose={() => setCrReminderModalOpen(false)}
          target={{ type: 'cr', entity: cr }}
          db={db}
        />
      )}
      <Modal
        title={editingLinkIndex === null ? 'Thêm liên kết' : 'Sửa liên kết'}
        open={linkModalOpen}
        footer={
          <Space>
            <Button onClick={() => setLinkModalOpen(false)}>Hủy</Button>
            <Button type="primary" onClick={() => void handleSaveLink()}>{editingLinkIndex === null ? 'Thêm link' : 'Lưu'}</Button>
          </Space>
        }
        onCancel={() => setLinkModalOpen(false)}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Input
            data-testid="cr-detail-link-name"
            placeholder="Tên (tùy chọn)"
            value={linkName}
            maxLength={LINK_NAME_MAX_LENGTH}
            onChange={(e) => setLinkName(e.target.value)}
          />
          <Input
            data-testid="cr-detail-link-url"
            placeholder="URL"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onPressEnter={() => void handleSaveLink()}
          />
        </Space>
      </Modal>
      {/* Mission header: identity + status signal + actions */}
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
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '2px 8px',
                borderRadius: 'var(--radius-control)',
                border: '1px solid var(--border)',
                fontSize: 'var(--font-size-small)',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  display: 'inline-block',
                  background:
                    cr.status === 'Done'
                      ? 'var(--success, #52c41a)'
                      : cr.status === 'Cancelled' || isOverdue(cr.deadline)
                        ? 'var(--danger, #c54e58)'
                        : cr.status === 'In Progress'
                          ? 'var(--accent)'
                          : 'var(--warning, #faad14)',
                }}
              />
              {statusMeta.label}
            </span>
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

      {/* Progress rail computed from already-loaded tasks */}
      <div style={{ padding: '8px 16px', background: 'var(--bg-island)', borderRadius: 'var(--radius-control)', border: '1px solid var(--border)' }}>
        <Progress
          percent={stats.taskCount === 0 ? 0 : Math.round((stats.doneCount / stats.taskCount) * 100)}
          size="small"
          showInfo={false}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--gap-12)', flexWrap: 'wrap', ...mutedStyle }}>
          <span>{stats.doneCount}/{stats.taskCount} tác vụ xong</span>
          <span>{tasks.filter((t) => isOverdue(t.deadline) && t.status !== 'Done').length} quá hạn · {stats.estimateLabel}</span>
        </div>
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
          ['LINKS', String(stats.linkCount)],
          ['NHẮC NHỞ', String(stats.reminderCount)],
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

      <style>{`
        .cr-detail-secondary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gap-12); align-items: start; }
        @media (max-width: 900px) { .cr-detail-secondary-grid { grid-template-columns: minmax(0, 1fr); } }
      `}</style>
      {/* Task table full width; secondary cards below in two columns */}
      <div data-testid="cr-detail-task-table" style={{ minWidth: 0, width: '100%' }}>
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

        {tasks.length > 0 && (
          <Space style={{ marginBottom: 8, width: '100%' }} wrap>
            <SearchInput
              data-testid="cr-detail-task-search"
              placeholder="Tìm tác vụ"
              allowClear
              value={taskSearch}
              onChange={(e) => setTaskSearch(e.target.value)}
              style={{ width: 240 }}
            />
            <Select
              data-testid="cr-detail-status-filter"
              size="small"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'ALL', label: 'Tất cả' },
                ...Object.entries(TASK_STATUS_LABEL).map(([value, meta]) => ({ value, label: meta.label })),
              ]}
              style={{ width: 160 }}
            />
          </Space>
        )}

        {tasks.length === 0 ? (
          <Empty description="CR này chưa có tác vụ nào" style={{ margin: '16px 0' }}>
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleCreateTask}>
              Thêm tác vụ
            </Button>
          </Empty>
        ) : filteredTasks.length === 0 ? (
          <Empty description="Không có tác vụ phù hợp" style={{ margin: '16px 0' }}>
            <Button
              size="small"
              onClick={() => {
                setTaskSearch('');
                setStatusFilter('ALL');
              }}
            >
              Xóa lọc
            </Button>
          </Empty>
        ) : (
          <Table
            dataSource={orderedTasks}
            rowKey="id"
            size="small"
            pagination={false}
            columns={[
              {
                title: 'Mốc',
                dataIndex: 'milestoneId',
                key: 'milestone',
                width: 140,
                render: (milestoneId: string | undefined, record: Task, index: number) => {
                  const milestone = milestoneId ? milestoneMap.get(milestoneId) : undefined;
                  const label = milestone?.name ?? 'Chưa gán mốc';
                  const isFirstInGroup = index === 0 || orderedTasks[index - 1]?.milestoneId !== record.milestoneId;
                  if (!isFirstInGroup) return { children: null, props: { rowSpan: 0 } };
                  const count = milestoneGroupSizes.get(record.milestoneId ?? '') ?? 1;
                  return {
                    children: (
                      <span style={{ fontSize: 'var(--font-size-small)', color: milestone ? 'var(--fg)' : 'var(--fg-muted)' }}>
                        {milestone ? <Text ellipsis title={milestone.name}>{label} ({count})</Text> : `${label} (${count})`}
                      </span>
                    ),
                    props: { rowSpan: count },
                  };
                },
              },
              {
                title: 'Task',
                dataIndex: 'name',
                key: 'name',
                render: (name: string, record: Task) => (
                  <span
                    style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, cursor: 'pointer' }}
                    title={name}
                    onClick={() => openTaskDrawer(record.id)}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-6)', overflow: 'hidden' }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          flexShrink: 0,
                          display: 'inline-block',
                          background:
                            record.status === 'Done'
                              ? '#52c41a'
                              : record.status === 'In Progress'
                                ? 'var(--accent)'
                                : 'var(--border-strong)',
                        }}
                      />
                      <Text ellipsis style={{ fontSize: 'var(--font-size-small)' }}>{name}</Text>
                    </span>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--fg-muted)' }}>
                      {`${cr.code} · ${systemMap.get(record.systemId ?? '')?.code ?? 'Chung'}`}
                    </span>
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
              {
                title: 'Thao tác',
                key: 'actions',
                width: 80,
                render: (_, record: Task) => (
                  <Dropdown menu={{ items: getTaskMenuItems(record) }} trigger={['click']}>
                    <Button type="text" size="small" icon={<MoreOutlined />} aria-label="Thao tác khác" />
                  </Dropdown>
                ),
              },
            ]}
          />
        )}
      </div>

      </div>

      <div data-testid="cr-detail-secondary-grid" className="cr-detail-secondary-grid">
        {/* Secondary blocks ordered by priority: reminders, links, notes, Jira */}
        {secondaryBlocks.map((block) => (
          <Card
            key={block.key}
            title={
              <span data-testid={block.testId} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--gap-6)' }}>
                {block.header}
                {block.count > 0 && (
                  <Tag color="blue" style={{ margin: 0, fontSize: 'var(--font-size-xs)', lineHeight: '16px' }}>
                    {block.count}
                  </Tag>
                )}
              </span>
            }
            extra={block.action}
            style={{ minWidth: 0 }}
          >
            <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{block.body}</div>
          </Card>
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
