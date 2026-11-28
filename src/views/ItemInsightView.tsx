import React, { useMemo, useState } from 'react';
import { Card, Row, Col, Statistic, Tag, Button, Space, Typography, Divider, List, Alert, Tooltip, Breadcrumb, Empty, Input, Modal, Popconfirm, Table, useMessage, EmptyImageSimple, ListItem, useTaskMateModal, Progress } from '../components/ui';
import { ArrowLeftOutlined, PlayCircleOutlined, PauseCircleOutlined, CheckCircleOutlined, EditOutlined, CalendarOutlined, ClockCircleOutlined, ExclamationCircleOutlined, LinkOutlined, FolderOpenOutlined, ProjectOutlined, PlusOutlined, FileTextOutlined, RobotOutlined, ApartmentOutlined, DeploymentUnitOutlined, DeleteOutlined } from '../components/ui/icon';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import type { Note, System } from '../types/models';
import type { AppRoute, NavigateFunction } from '../types/navigation';
import { EntityDiagramsSection } from '../components/diagrams/EntityDiagramsSection';
import { analyzeTaskInsight, type InsightRecommendation } from '../utils/itemInsight';
import { formatMinutes } from '../utils/time';
import { openDocumentLink, isLocalPath } from '../utils/documentLinks';
import { getJiraBrowseUrl, openJiraExternalUrl } from '../services/jira/jiraApi';
import { useTimer } from '../hooks/useTimer';
import { useAIChat } from '../context/AIChatContext';
import { TaskDrawer } from '../components/tasks/TaskDrawer';
import { NoteDetailModal } from '../components/notes/NoteDetailModal';
import { NoteEditor } from '../components/notes/NoteEditor';
import { appendTaskLink, updateTask, createTask } from '../db/repositories/taskRepo';
import { QuickReminderModal } from '../components/common/QuickReminderModal';
import { getAllChangeRequests } from '../db/repositories/changeRequestRepo';
import { getAllSystems } from '../db/repositories/systemRepo';
import { isValidLinkUrl, LINK_NAME_MAX_LENGTH } from '../validation/schemas';

const { Title, Text, Paragraph } = Typography;

export type ItemInsightType = 'task' | 'cr' | 'system';

export interface ItemInsightViewProps {
  itemType: ItemInsightType;
  itemId: string;
  onNavigate: NavigateFunction;
  onOpenSystemDetail?: (system: System) => void;
  db?: TaskPlannerDatabase;
}

const STATUS_TAG_COLORS: Record<string, string> = {
  Open: 'default',
  Pending: 'gold',
  'In Progress': 'processing',
  Resolved: 'warning',
  'In Review': 'cyan',
  Done: 'success',
  Cancelled: 'default',
};

const STATUS_LABELS: Record<string, string> = {
  Open: 'Mở',
  Pending: 'Chờ xử lý',
  'In Progress': 'Đang làm',
  Resolved: 'Đã giải quyết',
  'In Review': 'Đang duyệt',
  Done: 'Hoàn thành',
  Cancelled: 'Đã hủy',
};

const PRIORITY_TAG_COLORS: Record<string, string> = {
  Low: 'default',
  Medium: 'blue',
  High: 'orange',
  Urgent: 'red',
};

const CR_TYPE_COLORS: Record<string, string> = {
  NEW_FEATURE: 'var(--accent)',
  ENHANCEMENT: '#52c41a',
  BUGFIX: '#faad14',
};

export const ItemInsightView: React.FC<ItemInsightViewProps> = ({
  itemType,
  itemId,
  onNavigate,
  onOpenSystemDetail,
  db = defaultDb,
}) => {
  const { activeTimers, startTimer, pauseTimer } = useTimer();

  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
  const message = useMessage();
  const { modal, contextHolder } = useTaskMateModal();
  const [inspectingNote, setInspectingNote] = useState<Note | null>(null);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [linkName, setLinkName] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [editingLinkIndex, setEditingLinkIndex] = useState<number | null>(null);
  const [quickReminderOpen, setQuickReminderOpen] = useState(false);

  // Live queries
  const allTasks = useLiveQuery(() => db.tasks.toArray(), [db]) ?? [];
  const allChangeRequests = useLiveQuery(() => getAllChangeRequests(db), [db]) ?? [];
  const allSystems = useLiveQuery(() => getAllSystems(db), [db]) ?? [];
  const allWorkSessions = useLiveQuery(() => db.workSessions.toArray(), [db]) ?? [];
  const allAllocations = useLiveQuery(() => db.plannedAllocations.toArray(), [db]) ?? [];
  const allNotes = useLiveQuery(() => db.notes.toArray(), [db]) ?? [];
  const jiraDomainSetting = useLiveQuery(() => db.settings.get('jira_domain'), [db]);

  const jiraDomain = typeof jiraDomainSetting?.value === 'string' ? jiraDomainSetting.value : undefined;

  const crMap = useMemo(
    () => new Map(allChangeRequests.map((cr) => [cr.id, cr])),
    [allChangeRequests]
  );
  const systemMap = useMemo(() => new Map(allSystems.map((s) => [s.id, s])), [allSystems]);

  // Selected item
  const currentTask = useMemo(
    () => (itemType === 'task' ? allTasks.find((t) => t.id === itemId) : undefined),
    [itemType, allTasks, itemId]
  );
  const currentCr = useMemo(
    () => (itemType === 'cr' ? allChangeRequests.find((cr) => cr.id === itemId) : undefined),
    [itemType, allChangeRequests, itemId]
  );
  const currentSystem = useMemo(
    () => (itemType === 'system' ? allSystems.find((s) => s.id === itemId) : undefined),
    [itemType, allSystems, itemId]
  );

  const currentItemTitle =
    (itemType === 'task'
      ? currentTask?.name
      : itemType === 'cr'
        ? currentCr?.name
        : currentSystem?.name) || itemId;

  const { registerActiveItem, openChat } = useAIChat();

  React.useEffect(() => {
    if (itemId) {
      return registerActiveItem({ type: itemType, id: itemId, title: currentItemTitle });
    }
    return undefined;
  }, [itemType, itemId, currentItemTitle, registerActiveItem]);

  const handleAskAI = () => {
    openChat({ type: itemType, id: itemId, title: currentItemTitle });
  };

  // Parent relationships — a task has a CR and an optional subsystem (D-46/D-47)
  const parentCr = useMemo(() => {
    if (currentTask?.crId) return crMap.get(currentTask.crId);
    return undefined;
  }, [currentTask, crMap]);

  const parentSystem = useMemo(() => {
    if (currentTask?.systemId) return systemMap.get(currentTask.systemId);
    return undefined;
  }, [currentTask, systemMap]);

  // Child collections
  const relatedTasks = useMemo(() => {
    if (itemType === 'cr') return allTasks.filter((t) => t.crId === itemId);
    if (itemType === 'system') return allTasks.filter((t) => t.systemId === itemId);
    return [];
  }, [itemType, allTasks, itemId]);

  const relatedNotes = useMemo(() => {
    return allNotes.filter(
      (n) =>
        (n.entityId === itemId || (n.entityType === itemType && n.entityId === itemId)) &&
        n.type !== 'diagram' &&
        !n.deletedAt
    );
  }, [allNotes, itemType, itemId]);

  const relatedDiagrams = useMemo(() => {
    return allNotes.filter(
      (n) =>
        (n.entityId === itemId || (n.entityType === itemType && n.entityId === itemId)) &&
        n.type === 'diagram' &&
        !n.deletedAt
    );
  }, [allNotes, itemType, itemId]);

  // Insight analysis (task only — CR/system use the aggregate metrics below)
  const taskAnalysis = useMemo(() => {
    if (!currentTask) return null;
    const taskSessions = allWorkSessions.filter((s) => s.taskId === currentTask.id);
    const taskAllocations = allAllocations.filter((a) => a.taskId === currentTask.id);
    return analyzeTaskInsight(currentTask, taskSessions, taskAllocations, allTasks, allNotes);
  }, [currentTask, allWorkSessions, allAllocations, allTasks, allNotes]);

  const aggregateMetrics = useMemo(() => {
    const taskIds = new Set(relatedTasks.map((t) => t.id));
    const doneTasks = relatedTasks.filter((t) => t.status === 'Done').length;
    const totalEstimatedMinutes = relatedTasks.reduce((acc, t) => acc + (t.estimateMinutes || 0), 0);
    const actualSpentMinutes = allWorkSessions
      .filter((s) => taskIds.has(s.taskId))
      .reduce((acc, s) => acc + (s.durationMinutes || 0), 0);
    const plannedMinutes = allAllocations
      .filter((a) => taskIds.has(a.taskId))
      .reduce((acc, a) => acc + (a.allocatedMinutes || 0), 0);
    return {
      totalTasks: relatedTasks.length,
      doneTasks,
      completionRate: relatedTasks.length > 0 ? Math.round((doneTasks / relatedTasks.length) * 100) : 0,
      totalEstimatedMinutes,
      actualSpentMinutes,
      plannedMinutes,
    };
  }, [relatedTasks, allWorkSessions, allAllocations]);

  // Timer helpers for current task
  const isCurrentTaskTiming = useMemo(() => {
    if (!currentTask) return false;
    return activeTimers.some((t) => t.taskId === currentTask.id);
  }, [currentTask, activeTimers]);

  const handleToggleTimer = async () => {
    if (!currentTask) return;
    try {
      if (isCurrentTaskTiming) {
        await pauseTimer(currentTask.id);
        message.info('Đã tạm dừng bấm giờ');
      } else {
        await startTimer(currentTask.id);
        message.success('Đã bắt đầu bấm giờ');
      }
    } catch (err: any) {
      message.error(err?.message || 'Lỗi điều khiển bấm giờ');
    }
  };

  const handleToggleTaskStatus = async () => {
    if (!currentTask) return;
    const nextStatus = currentTask.status === 'Done' ? 'Open' : 'Done';
    const nextProgress = nextStatus === 'Done' ? 100 : currentTask.progress === 100 ? 0 : currentTask.progress;
    try {
      await updateTask(currentTask.id, { status: nextStatus, progress: nextProgress }, db);
      message.success(`Đã cập nhật trạng thái: ${STATUS_LABELS[nextStatus]}`);
    } catch {
      message.error('Không thể cập nhật trạng thái');
    }
  };

  const handleToggleChecklistItem = async (index: number) => {
    if (!currentTask || !currentTask.checklist) return;
    const nextChecklist = currentTask.checklist.map((item, i) =>
      i === index ? { ...item, done: !item.done } : item
    );
    try {
      await updateTask(currentTask.id, { checklist: nextChecklist }, db);
    } catch {
      message.error('Không thể cập nhật checklist');
    }
  };

  const openLinkEditor = (index: number | null) => {
    const link = index === null ? undefined : (currentTask?.links ?? [])[index];
    setLinkName(link?.name ?? '');
    setLinkUrl(link?.url ?? '');
    setEditingLinkIndex(index);
    setLinkModalOpen(true);
  };

  const handleSaveLink = async () => {
    if (!currentTask) return;
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
        await appendTaskLink(currentTask.id, payload, db);
      } else {
        await updateTask(
          currentTask.id,
          { links: (currentTask.links ?? []).map((link, i) => (i === editingLinkIndex ? payload : link)) },
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

  const handleRemoveLink = async (index: number) => {
    if (!currentTask) return;
    try {
      await updateTask(
        currentTask.id,
        { links: (currentTask.links ?? []).filter((_, i) => i !== index) },
        db
      );
      message.success('Đã xóa liên kết');
    } catch {
      message.error('Không thể xóa liên kết');
    }
  };

  const handleRemoveReminder = async (reminderId: string) => {
    if (!currentTask) return;
    try {
      await updateTask(
        currentTask.id,
        { reminders: (currentTask.reminders ?? []).filter((r) => r.id !== reminderId) },
        db
      );
      message.success('Đã xóa nhắc nhở');
    } catch {
      message.error('Không thể xóa nhắc nhở');
    }
  };

  const handleRecommendationAction = (rec: InsightRecommendation) => {
    switch (rec.actionKey) {
      case 'start-timer':
        void handleToggleTimer();
        break;
      case 'edit-task':
      case 'open-checklist':
        setTaskDrawerOpen(true);
        break;
      case 'go-planner':
        onNavigate('planner');
        break;
      case 'view-tasks':
        onNavigate('tasks');
        break;
      default:
        break;
    }
  };

  const handleCreateTaskInCr = async () => {
    if (!currentCr) return;
    try {
      const created = await createTask(
        {
          crId: currentCr.id,
          name: 'Tác vụ mới',
          status: 'Open',
          priority: 'Medium',
          estimateMinutes: 0,
        },
        db
      );
      onNavigate('insight', { type: 'task', id: created.id, name: created.name });
    } catch {
      message.error('Không thể tạo tác vụ');
    }
  };

  const openCrDetail = (crId: string) => {
    // `cr_detail` is rendered by EditorArea (plan 31.2-13); AppRoute has no member yet.
    onNavigate('cr_detail' as AppRoute, { changeRequestId: crId });
  };

  // If item not found
  const hasItem =
    (itemType === 'task' && currentTask) ||
    (itemType === 'cr' && currentCr) ||
    (itemType === 'system' && currentSystem);

  if (!hasItem) {
    return (
      <>
        {contextHolder}
      <Card style={{ margin: 16 }}>
        <Empty
          description={`Không tìm thấy mục ${itemType} với ID: ${itemId}`}
          image={EmptyImageSimple}
        >
          <Button type="primary" onClick={() => onNavigate('dashboard')}>
            Quay lại Tổng quan
          </Button>
        </Empty>
      </Card>
    
  </>);
  }

  const renderRecommendationAlert = (rec: InsightRecommendation) => {
    const alertType = rec.severity === 'danger' ? 'error' : rec.severity;
    return (
      <Alert
        key={rec.id}
        type={alertType}
        showIcon
        style={{ marginBottom: 12 }}
        message={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600 }}>{rec.title}</span>
            {rec.actionText && (
              <Button
                size="small"
                type={rec.severity === 'danger' ? 'primary' : 'default'}
                danger={rec.severity === 'danger'}
                onClick={() => handleRecommendationAction(rec)}
              >
                {rec.actionText}
              </Button>
            )}
          </div>
        }
        description={rec.description}
      />
    );
  };

  return (
    <div style={{ padding: '4px 8px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Breadcrumb & Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space orientation="horizontal" size="middle">
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => {
              if (itemType === 'task') onNavigate('tasks');
              else if (itemType === 'cr' && currentCr) openCrDetail(currentCr.id);
              else onNavigate('dashboard');
            }}
          >
            Quay lại
          </Button>
          <Breadcrumb
            items={[
              { title: <a onClick={() => onNavigate('dashboard')}>Tổng quan</a> },
              ...(parentCr
                ? [
                    {
                      title: (
                        <a
                          onClick={() =>
                            onNavigate('insight', { type: 'cr', id: parentCr.id, name: parentCr.name })
                          }
                        >
                          {parentCr.code}
                        </a>
                      ),
                    },
                  ]
                : []),
              ...(parentSystem
                ? [
                    {
                      title: (
                        <a onClick={() => onOpenSystemDetail?.(parentSystem)}>
                          {parentSystem.code}
                        </a>
                      ),
                    },
                  ]
                : []),
              {
                title:
                  itemType === 'task'
                    ? currentTask?.name
                    : itemType === 'cr'
                      ? currentCr?.code
                      : currentSystem?.name,
              },
            ]}
          />
        </Space>
      </div>

      {itemType === 'task' && currentTask && taskAnalysis ? (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--gap-12)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Space size={4} wrap style={{ marginBottom: 8, fontSize: 'var(--font-size-xs)', color: 'var(--fg-muted)' }}>
                <span>Tác vụ</span>
                {parentCr && <><span>·</span><span>{parentCr.code}</span><span>{parentCr.name}</span></>}
              </Space>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-8)', flexWrap: 'wrap' }}>
                <Title level={3} style={{ margin: 0, overflowWrap: 'anywhere' }}>
                  {currentTask.name}
                </Title>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 8px', borderRadius: 'var(--radius-control)', border: '1px solid var(--border)', fontSize: 'var(--font-size-small)', whiteSpace: 'nowrap' }}>
                  <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', display: 'inline-block', background: currentTask.status === 'Done' ? 'var(--success, #52c41a)' : currentTask.status === 'Cancelled' || taskAnalysis.metrics.isOverdue ? 'var(--danger, #c54e58)' : currentTask.status === 'In Progress' ? 'var(--accent)' : 'var(--warning, #faad14)' }} />
                  {STATUS_LABELS[currentTask.status] ?? currentTask.status}
                </span>
              </div>
              {(currentTask.description || currentTask.notes) && (
                <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, maxWidth: 800, whiteSpace: 'pre-wrap' }}>
                  {currentTask.description}
                  {currentTask.description && currentTask.notes ? ' — ' : ''}
                  {currentTask.notes}
                </Paragraph>
              )}
            </div>
            <Space wrap style={{ justifyContent: 'flex-end' }}>
              <Button type={isCurrentTaskTiming ? 'default' : 'primary'} icon={isCurrentTaskTiming ? <PauseCircleOutlined /> : <PlayCircleOutlined />} onClick={handleToggleTimer}>
                {isCurrentTaskTiming ? 'Tạm dừng' : 'Bắt đầu làm'}
              </Button>
              <Button icon={<CheckCircleOutlined />} onClick={handleToggleTaskStatus}>
                {currentTask.status === 'Done' ? 'Mở lại' : 'Hoàn thành'}
              </Button>
              <Button icon={<CalendarOutlined />} onClick={() => onNavigate('planner')}>Phân bổ lịch</Button>
              <Button icon={<EditOutlined />} onClick={() => setTaskDrawerOpen(true)}>Chỉnh sửa</Button>
              <Button type="default" icon={<RobotOutlined style={{ color: 'var(--accent)' }} />} onClick={handleAskAI} aria-label="Hỏi AI về mục này">Hỏi AI</Button>
            </Space>
          </div>

          {/* Mission rail: one compact line plus progress, from data already loaded */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap', marginTop: 16, padding: '10px 12px', border: '1px solid var(--border, #e9eaee)', borderRadius: 'var(--radius-control, 6px)', background: 'var(--bg-island-soft, #f7f8fa)' }}>
            <div>
              <Text strong style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 22, display: 'block', lineHeight: 1.1 }}>{formatMinutes(taskAnalysis.metrics.estimateMinutes)}</Text>
              <Text type="secondary" style={{ fontSize: 'var(--font-size-small, 12px)' }}>Ước tính</Text>
            </div>
            <Divider type="vertical" style={{ height: 26, margin: 0 }} />
            <div><Text type="secondary" style={{ fontSize: 'var(--font-size-small, 12px)', display: 'block' }}>Đã thực hiện</Text><Text strong style={{ fontFamily: 'var(--font-mono, monospace)' }}>{formatMinutes(taskAnalysis.metrics.actualSpentMinutes)}</Text></div>
            <div><Text type="secondary" style={{ fontSize: 'var(--font-size-small, 12px)', display: 'block' }}>Còn lại</Text><Text strong style={{ fontFamily: 'var(--font-mono, monospace)' }}>{formatMinutes(Math.max(0, taskAnalysis.metrics.estimateMinutes - taskAnalysis.metrics.actualSpentMinutes))}</Text></div>
            <div><Text type="secondary" style={{ fontSize: 'var(--font-size-small, 12px)', display: 'block' }}>Hạn chót</Text><Text strong style={{ fontFamily: 'var(--font-mono, monospace)' }}>{currentTask.deadline || 'Không có'}</Text></div>
            <div style={{ flexBasis: '100%' }}>
              <Progress percent={taskAnalysis.metrics.subtaskPercent} size="small" showInfo={false} />
              <Text type="secondary" style={{ fontSize: 'var(--font-size-xs)' }}>{taskAnalysis.metrics.subtaskPercent}% checklist</Text>
            </div>
          </div>

          <Divider style={{ margin: '12px 0' }} />
          <Space wrap size={4}>
            <Tag color={PRIORITY_TAG_COLORS[currentTask.priority] ?? 'default'}>Ưu tiên {currentTask.priority}</Tag>
            {currentTask.jiraKey && (
              <Tooltip title="Mở trên Jira">
                <Tag color="cyan" icon={<LinkOutlined />} style={{ cursor: 'pointer' }} onClick={() => void openJiraExternalUrl(getJiraBrowseUrl(currentTask.jiraKey!, jiraDomain))}>{currentTask.jiraKey}</Tag>
              </Tooltip>
            )}
            {currentTask.opsOwners?.map((o) => <Tag key={o} color="blue">{o}</Tag>)}
            {currentTask.businessAnalysts?.map((b) => <Tag key={b} color="geekblue">{b}</Tag>)}
          </Space>

        </Card>
      ) : (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--gap-12)' }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <Space align="center" size="small" style={{ marginBottom: 8 }} wrap>
                {itemType === 'cr' && <Tag color="purple">Change Request</Tag>}
                {itemType === 'system' && <Tag color="cyan">Subsystem</Tag>}
                {itemType === 'cr' && currentCr && (
                  <Tag color={CR_TYPE_COLORS[currentCr.type] ?? 'default'}>
                    {currentCr.type === 'NEW_FEATURE' ? 'Tạo mới' : currentCr.type === 'ENHANCEMENT' ? 'Nâng cấp' : 'Sửa lỗi'}
                  </Tag>
                )}
                {itemType === 'system' && (
                  <Tag color={STATUS_TAG_COLORS[currentSystem?.type || 'Open'] ?? 'default'}>
                    {STATUS_LABELS[currentSystem?.type || 'Open'] ?? currentSystem?.type ?? 'Mở'}
                  </Tag>
                )}
                {itemType === 'cr' && currentCr && (
                  <Tag color={currentCr.status === 'Done' ? 'success' : 'processing'}>{currentCr.status}</Tag>
                )}
                {currentCr?.jiraEpicKey && (
                  <Tooltip title="Mở Jira Epic">
                    <Tag color="cyan" icon={<LinkOutlined />} style={{ cursor: 'pointer' }} onClick={() => void openJiraExternalUrl(getJiraBrowseUrl(currentCr.jiraEpicKey!, jiraDomain))}>
                      {currentCr.jiraEpicKey}
                    </Tag>
                  </Tooltip>
                )}
              </Space>
              <Title level={3} style={{ margin: 0 }}>
                {itemType === 'cr' && currentCr ? `${currentCr.code} · ${currentCr.name}` : currentSystem?.name}
              </Title>
              {(currentCr?.description || currentSystem?.description) && (
                <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, maxWidth: 800, whiteSpace: 'pre-wrap' }}>
                  {currentCr?.description || currentSystem?.description}
                </Paragraph>
              )}
              {itemType === 'cr' && currentCr && currentCr.targets.length > 0 && (
                <Space size={4} wrap style={{ marginTop: 8 }}>
                  <Text type="secondary">Subsystem: </Text>
                  {currentCr.targets.map((target) => {
                    const system = systemMap.get(target.systemId);
                    return (
                      <Tag key={target.systemId} bordered={false} style={{ margin: 0, fontFamily: 'monospace', color: 'var(--info-fg)' }} title={system?.name}>
                        {system?.code ?? target.systemId.slice(0, 8)}
                      </Tag>
                    );
                  })}
                </Space>
              )}
            </div>
            <Space wrap>
              {itemType === 'cr' && currentCr && (
                <>
                  <Button type="primary" icon={<ProjectOutlined />} onClick={() => openCrDetail(currentCr.id)}>Mở CR detail</Button>
                  <Button icon={<PlusOutlined />} onClick={() => void handleCreateTaskInCr()}>Thêm tác vụ</Button>
                </>
              )}
              <Button type="default" icon={<RobotOutlined style={{ color: 'var(--accent)' }} />} onClick={handleAskAI} aria-label="Hỏi AI về mục này">Hỏi AI</Button>
            </Space>
          </div>
          <Divider style={{ margin: '12px 0' }} />
          <Row gutter={[16, 8]}>
            <Col xs={24} sm={12} md={8}>
              <Text type="secondary">Hạn chót: </Text>
              <Text strong>{currentCr?.deadline || 'Không có'}</Text>
            </Col>
            {(currentCr?.opsOwners)?.length ? (
              <Col xs={24} sm={12} md={8}>
                <Text type="secondary">Ops Owners: </Text>
                <Space size={4} wrap>{currentCr.opsOwners!.map((o) => <Tag key={o} color="blue">{o}</Tag>)}</Space>
              </Col>
            ) : null}
            {(currentCr?.businessAnalysts)?.length ? (
              <Col xs={24} sm={12} md={8}>
                <Text type="secondary">BA: </Text>
                <Space size={4} wrap>{currentCr.businessAnalysts!.map((b) => <Tag key={b} color="geekblue">{b}</Tag>)}</Space>
              </Col>
            ) : null}
          </Row>
        </Card>
      )}

      {itemType !== 'task' && (currentCr?.links?.length ?? 0) > 0 && (
        <Card title={<Space><LinkOutlined /><span>Links</span></Space>} style={{ marginBottom: 16 }} data-testid="item-insight-links-section">
          <div data-testid="item-insight-links">
            <Space size={8} wrap style={{ marginTop: 4, maxWidth: '100%' }}>
              {(currentCr?.links ?? []).map((link, idx) => (
                <Button
                  key={`${idx}-${link.url}`}
                  size="small"
                  icon={isLocalPath(link.url) ? <FolderOpenOutlined /> : <LinkOutlined />}
                  onClick={(e) => void openDocumentLink(link.url, { quickClaude: e.altKey, notify: (kind, text, extra) => message[kind]({ content: text, ...(extra ?? {}) }), confirm: (cfg) => modal.confirm(cfg) })}
                  title={link.url}
                >
                  {link.name || link.url}
                </Button>
              ))}
            </Space>
          </div>
        </Card>
      )}

      {itemType === 'task' && (
        <Card
          title={<Space><DeploymentUnitOutlined /><span>Hệ thống liên kết</span></Space>}
          style={{ marginBottom: 16 }}
          data-testid="item-insight-linked-system-section"
        >
          <Space size={8} wrap>
            {parentSystem ? (
              <Tag
                color="cyan"
                data-testid="item-insight-linked-system"
                style={{ cursor: onOpenSystemDetail ? 'pointer' : 'default' }}
                onClick={() => onOpenSystemDetail?.(parentSystem)}
              >
                {parentSystem.code} — {parentSystem.name}
              </Tag>
            ) : (
              <Tag color="default" data-testid="item-insight-linked-system">
                {currentTask?.systemId ?? 'Chung (không gắn)'}
              </Tag>
            )}
          </Space>
        </Card>
      )}

      {itemType !== 'task' && (
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Tổng tác vụ"
                value={aggregateMetrics.totalTasks}
                prefix={<ProjectOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Tỉ lệ hoàn thành"
                value={aggregateMetrics.completionRate}
                suffix="%"
                prefix={<CheckCircleOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Tổng ước tính"
                value={formatMinutes(aggregateMetrics.totalEstimatedMinutes)}
                prefix={<ClockCircleOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Thời gian đã làm"
                value={formatMinutes(aggregateMetrics.actualSpentMinutes)}
                prefix={<PlayCircleOutlined />}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* Command Deck: primary analysis/checklist left, secondary cards right (task only) */}
      {itemType === 'task' && currentTask && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2.4fr) minmax(280px, 1fr)', gap: 'var(--gap-12)', alignItems: 'start', marginBottom: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-12)', minWidth: 0 }}>
            {taskAnalysis && (
              <Card title={<Space><ExclamationCircleOutlined style={{ color: 'var(--accent)' }} /><span>Gợi ý & Phân tích trước khi thực hiện</span></Space>}>
                {taskAnalysis.recommendations.map(renderRecommendationAlert)}
              </Card>
            )}
            {(currentTask.checklist?.length ?? 0) > 0 && (
              <Card title="Checklist / Tiêu chí nghiệm thu">
                <Table
                  size="small"
                  pagination={false}
                  rowKey="id"
                  dataSource={currentTask.checklist ?? []}
                  columns={[
                    {
                      title: 'Hạng mục',
                      dataIndex: 'text',
                      key: 'text',
                      render: (text: string, item: { done: boolean }) => (
                        <Text ellipsis title={text} style={{ minWidth: 320, textDecoration: item.done ? 'line-through' : 'none' }}>{text}</Text>
                      ),
                    },
                    {
                      title: 'Trạng thái',
                      dataIndex: 'done',
                      key: 'done',
                      width: 110,
                      render: (done: boolean) => <Tag color={done ? 'success' : 'default'}>{done ? 'Xong' : 'Mở'}</Tag>,
                    },
                    {
                      title: 'Thao tác',
                      key: 'actions',
                      width: 100,
                      render: (_, __, index) => (
                        <Button type="link" size="small" onClick={() => void handleToggleChecklistItem(index)}>
                          {currentTask.checklist?.[index]?.done ? 'Mở lại' : 'Hoàn thành'}
                        </Button>
                      ),
                    },
                  ]}
                />
              </Card>
            )}
            <Card title={<Space><ApartmentOutlined style={{ color: 'var(--success)' }} /><span>Biểu đồ liên quan ({relatedDiagrams.length})</span></Space>}>
              <EntityDiagramsSection entityType={itemType} entityId={itemId} db={db} embedded={true} />
            </Card>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-12)', minWidth: 0, padding: 'var(--gap-8)', border: '1px solid var(--border)', borderRadius: 'var(--radius-control)', background: 'var(--bg-island-soft, var(--bg-island))' }}>
            <Card
              title={<Space><CalendarOutlined /><span>Nhắc nhở</span></Space>}
              data-testid="item-insight-reminders"
              extra={<Button data-testid="item-insight-reminder-add" size="small" icon={<PlusOutlined />} onClick={() => setQuickReminderOpen(true)}>Thêm nhắc nhở</Button>}
            >
              {(currentTask.reminders?.length ?? 0) > 0 ? (
                <Space direction="vertical" size={4}>
                  {(currentTask.reminders ?? []).map((r) => (
                    <Space key={r.id} size={4} align="center">
                      <Text style={{ fontSize: 'var(--font-size-small)' }}>{r.date}{r.time ? ` ${r.time}` : ''}{r.note ? ` — ${r.note}` : ''}</Text>
                      <Tooltip title="Sửa nhắc nhở"><Button type="text" size="small" aria-label="Sửa nhắc nhở" icon={<EditOutlined />} onClick={() => setTaskDrawerOpen(true)} /></Tooltip>
                      <Tooltip title="Xóa nhắc nhở"><Button type="text" danger size="small" aria-label="Xóa nhắc nhở" icon={<DeleteOutlined />} onClick={() => void handleRemoveReminder(r.id)} /></Tooltip>
                    </Space>
                  ))}
                </Space>
              ) : (
                <Text type="secondary">Chưa có nhắc nhở</Text>
              )}
            </Card>

            <Card
              title={<Space><LinkOutlined /><span>Links</span></Space>}
              data-testid="item-insight-links-section"
              extra={<Button data-testid="item-insight-link-add" size="small" icon={<PlusOutlined />} onClick={() => openLinkEditor(null)}>Thêm link</Button>}
            >
              <div data-testid="item-insight-links">
                {(currentTask.links?.length ?? 0) > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 'var(--radius-control)' }}>
                    {(currentTask.links ?? []).map((link, idx) => (
                      <div key={`${idx}-${link.url}`} style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-8)', padding: '4px 8px' }}>
                        <Text ellipsis style={{ width: 120, flexShrink: 0, fontSize: 'var(--font-size-small)' }} title={link.name || link.url}>{link.name || '—'}</Text>
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
                        <Space size={0}>
                          <Tooltip title="Sửa liên kết"><Button type="text" size="small" aria-label="Sửa liên kết" icon={<EditOutlined />} onClick={() => openLinkEditor(idx)} /></Tooltip>
                          <Popconfirm title="Xóa liên kết này?" okText="Xóa" cancelText="Hủy" okButtonProps={{ danger: true }} onConfirm={() => void handleRemoveLink(idx)}>
                            <Button type="text" danger size="small" aria-label="Xóa liên kết" icon={<DeleteOutlined />} />
                          </Popconfirm>
                        </Space>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Text type="secondary">Chưa có liên kết</Text>
                )}
              </div>
            </Card>

            <Card
              title={<Space><FileTextOutlined /><span>Ghi chú liên quan ({relatedNotes.length})</span></Space>}
              extra={<Button size="small" icon={<PlusOutlined />} onClick={() => setEditingNote({ id: '', title: '', body: '', entityType: itemType, entityId: itemId, isPinned: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })}>Thêm ghi chú</Button>}
            >
              {relatedNotes.length === 0 ? (
                <Empty description="Chưa có ghi chú nào" image={EmptyImageSimple} />
              ) : (
                <List
                  dataSource={relatedNotes}
                  renderItem={(note) => (
                    <ListItem key={note.id} actions={[<Button key="view" type="link" onClick={() => setInspectingNote(note)}>Xem</Button>, <Button key="edit" type="link" onClick={() => setEditingNote(note)}>Sửa</Button>]}>
                      <ListItem.Meta title={note.title || 'Ghi chú không tiêu đề'} description={`Cập nhật: ${new Date(note.updatedAt).toLocaleDateString('vi-VN')}`} />
                    </ListItem>
                  )}
                />
              )}
            </Card>
          </div>
        </div>
      )}

      {/* Child Tasks (CR & System views) */}
      {itemType !== 'task' && (
        <Card
          title={`Danh sách tác vụ liên quan (${relatedTasks.length})`}
          style={{ marginBottom: 16 }}
        >
          {relatedTasks.length === 0 ? (
            <Empty description="Chưa có tác vụ nào" image={EmptyImageSimple} />
          ) : (
            <List
              dataSource={relatedTasks}
              renderItem={(t) => {
                const cr = crMap.get(t.crId);
                const system = t.systemId ? systemMap.get(t.systemId) : undefined;
                return (
                  <ListItem
                    key={t.id}
                    actions={[
                      <Button
                        key="insight"
                        type="link"
                        onClick={() => onNavigate('insight', { type: 'task', id: t.id, name: t.name })}
                      >
                        Xem chi tiết
                      </Button>,
                    ]}
                  >
                    <ListItem.Meta
                      title={
                        <Space>
                          <Tag color={STATUS_TAG_COLORS[t.status] ?? 'default'}>
                            {STATUS_LABELS[t.status] ?? 'Mở'}
                          </Tag>
                          <Tag color={PRIORITY_TAG_COLORS[t.priority] ?? 'default'}>
                            {t.priority}
                          </Tag>
                          {itemType === 'system' && cr && <Tag color="purple">{cr.code}</Tag>}
                          {itemType === 'cr' && system && (
                            <Tag bordered={false} style={{ fontFamily: 'monospace', color: 'var(--info-fg)' }}>
                              {system.code}
                            </Tag>
                          )}
                          <a onClick={() => onNavigate('insight', { type: 'task', id: t.id, name: t.name })}>
                            {t.name}
                          </a>
                        </Space>
                      }
                      description={`Ước tính: ${formatMinutes(t.estimateMinutes)} | Hạn chót: ${t.deadline || 'Không'}`}
                    />
                  </ListItem>
                );
              }}
            />
          )}
        </Card>
      )}

      {/* Linked Notes Section (CR/system — task version sits beside checklist above) */}
      {itemType !== 'task' && <Card
        title={
          <Space>
            <FileTextOutlined />
            <span>Ghi chú liên quan ({relatedNotes.length})</span>
          </Space>
        }
        extra={
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingNote({
                id: '',
                title: '',
                body: '',
                entityType: itemType,
                entityId: itemId,
                isPinned: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });
            }}
          >
            Thêm ghi chú
          </Button>
        }
        style={{ marginBottom: 16 }}
      >
        {relatedNotes.length === 0 ? (
          <Empty description="Chưa có ghi chú nào" image={EmptyImageSimple} />
        ) : (
          <List
            dataSource={relatedNotes}
            renderItem={(note) => (
              <ListItem
                key={note.id}
                actions={[
                  <Button key="view" type="link" onClick={() => setInspectingNote(note)}>
                    Xem
                  </Button>,
                  <Button key="edit" type="link" onClick={() => setEditingNote(note)}>
                    Sửa
                  </Button>,
                ]}
              >
                <ListItem.Meta
                  title={note.title || 'Ghi chú không tiêu đề'}
                  description={`Cập nhật: ${new Date(note.updatedAt).toLocaleDateString('vi-VN')}`}
                />
              </ListItem>
            )}
          />
        )}
      </Card>}

      {/* Linked Diagrams Section — task version sits in the left column above */}
      {itemType !== 'task' && (
        <Card
          title={<Space><ApartmentOutlined style={{ color: 'var(--success)' }} /><span>Biểu đồ liên quan ({relatedDiagrams.length})</span></Space>}
          style={{ marginBottom: 16 }}
        >
          <EntityDiagramsSection entityType={itemType} entityId={itemId} db={db} embedded={true} />
        </Card>
      )}

      {/* Modals & Drawers */}
      <Modal
        title={editingLinkIndex === null ? 'Thêm liên kết' : 'Sửa liên kết'}
        open={linkModalOpen}
        footer={
          <Space>
            <Button onClick={() => setLinkModalOpen(false)}>Hủy</Button>
            <Button type="primary" onClick={() => void handleSaveLink()}>
              {editingLinkIndex === null ? 'Thêm link' : 'Lưu'}
            </Button>
          </Space>
        }
        onCancel={() => setLinkModalOpen(false)}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Input
            data-testid="item-insight-link-name"
            placeholder="Tên (tùy chọn)"
            value={linkName}
            maxLength={LINK_NAME_MAX_LENGTH}
            onChange={(e) => setLinkName(e.target.value)}
          />
          <Input
            data-testid="item-insight-link-url"
            placeholder="URL"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onPressEnter={() => void handleSaveLink()}
          />
        </Space>
      </Modal>
      {quickReminderOpen && currentTask && (
        <QuickReminderModal
          open
          onClose={() => setQuickReminderOpen(false)}
          target={{ type: 'task', entity: currentTask }}
          db={db}
        />
      )}
      {currentTask && (
        <TaskDrawer
          taskId={taskDrawerOpen ? currentTask.id : null}
          open={taskDrawerOpen}
          onClose={() => setTaskDrawerOpen(false)}
          db={db}
        />
      )}

      {inspectingNote && (
        <NoteDetailModal
          open={Boolean(inspectingNote)}
          note={inspectingNote}
          onClose={() => setInspectingNote(null)}
          onEdit={(n) => {
            setInspectingNote(null);
            setEditingNote(n);
          }}
          db={db}
        />
      )}

      {editingNote && (
        <NoteEditor
          open={Boolean(editingNote)}
          note={editingNote.id ? editingNote : null}
          defaultEntityType={itemType}
          defaultEntityId={itemId}
          onClose={() => setEditingNote(null)}
          onSaved={() => setEditingNote(null)}
          db={db}
        />
      )}
    </div>
  );
};
