import React, { useMemo, useState } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Tag,
  Button,
  Space,
  Typography,
  Divider,
  List,
  Checkbox,
  Alert,
  Tooltip,
  Breadcrumb,
  Empty,
  message,
} from 'antd';
import {
  ArrowLeftOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  CheckCircleOutlined,
  EditOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  LinkOutlined,
  FolderOpenOutlined,
  ProjectOutlined,
  PlusOutlined,
  FileTextOutlined,
  RobotOutlined,
  ApartmentOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import type { Note } from '../types/models';
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
import { updateTask, createTask } from '../db/repositories/taskRepo';
import { getAllChangeRequests } from '../db/repositories/changeRequestRepo';
import { getAllSystems } from '../db/repositories/systemRepo';

const { Title, Text, Paragraph } = Typography;

export type ItemInsightType = 'task' | 'cr' | 'system';

export interface ItemInsightViewProps {
  itemType: ItemInsightType;
  itemId: string;
  onNavigate: NavigateFunction;
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
  NEW_FEATURE: '#1677ff',
  ENHANCEMENT: '#52c41a',
  BUGFIX: '#faad14',
};

export const ItemInsightView: React.FC<ItemInsightViewProps> = ({
  itemType,
  itemId,
  onNavigate,
  db = defaultDb,
}) => {
  const { activeTimers, startTimer, pauseTimer } = useTimer();

  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
  const [inspectingNote, setInspectingNote] = useState<Note | null>(null);
  const [editingNote, setEditingNote] = useState<Note | null>(null);

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
      <Card style={{ margin: 16 }}>
        <Empty
          description={`Không tìm thấy mục ${itemType} với ID: ${itemId}`}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <Button type="primary" onClick={() => onNavigate('dashboard')}>
            Quay lại Tổng quan
          </Button>
        </Empty>
      </Card>
    );
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
                        <a
                          onClick={() =>
                            onNavigate('insight', {
                              type: 'system',
                              id: parentSystem.id,
                              name: parentSystem.name,
                            })
                          }
                        >
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

      {/* Main Header Card */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <Space align="center" size="small" style={{ marginBottom: 8 }} wrap>
              {itemType === 'task' && <Tag color="blue">Tác vụ</Tag>}
              {itemType === 'cr' && <Tag color="purple">Change Request</Tag>}
              {itemType === 'system' && <Tag color="cyan">Subsystem</Tag>}

              {itemType === 'cr' && currentCr && (
                <Tag color={CR_TYPE_COLORS[currentCr.type] ?? 'default'}>
                  {currentCr.type === 'NEW_FEATURE'
                    ? 'Tạo mới'
                    : currentCr.type === 'ENHANCEMENT'
                      ? 'Nâng cấp'
                      : 'Sửa lỗi'}
                </Tag>
              )}

              {itemType !== 'cr' && (
                <Tag
                  color={
                    STATUS_TAG_COLORS[
                      currentTask?.status || currentSystem?.type || 'Open'
                    ] ?? 'default'
                  }
                >
                  {STATUS_LABELS[
                    currentTask?.status || currentSystem?.type || 'Open'
                  ] ?? currentTask?.status ?? currentSystem?.type ?? 'Mở'}
                </Tag>
              )}

              {itemType === 'cr' && currentCr && (
                <Tag color={currentCr.status === 'Done' ? 'success' : 'processing'}>
                  {currentCr.status}
                </Tag>
              )}

              {currentTask && (
                <Tag color={PRIORITY_TAG_COLORS[currentTask.priority] ?? 'default'}>
                  Ưu tiên {currentTask.priority}
                </Tag>
              )}

              {currentTask?.jiraKey && (
                <Tooltip title="Mở trên Jira">
                  <Tag
                    color="cyan"
                    icon={<LinkOutlined />}
                    style={{ cursor: 'pointer' }}
                    onClick={() =>
                      void openJiraExternalUrl(getJiraBrowseUrl(currentTask.jiraKey!, jiraDomain))
                    }
                  >
                    {currentTask.jiraKey}
                  </Tag>
                </Tooltip>
              )}

              {currentCr?.jiraEpicKey && (
                <Tooltip title="Mở Jira Epic">
                  <Tag
                    color="cyan"
                    icon={<LinkOutlined />}
                    style={{ cursor: 'pointer' }}
                    onClick={() =>
                      void openJiraExternalUrl(getJiraBrowseUrl(currentCr.jiraEpicKey!, jiraDomain))
                    }
                  >
                    {currentCr.jiraEpicKey}
                  </Tag>
                </Tooltip>
              )}
            </Space>

            <Title level={3} style={{ margin: 0 }}>
              {itemType === 'cr' && currentCr ? `${currentCr.code} · ${currentCr.name}` : currentTask?.name || currentSystem?.name}
            </Title>

            {(currentTask?.description || currentCr?.description || currentSystem?.description) && (
              <Paragraph
                type="secondary"
                style={{ marginTop: 8, marginBottom: 0, maxWidth: 800, whiteSpace: 'pre-wrap' }}
              >
                {currentTask?.description || currentCr?.description || currentSystem?.description}
              </Paragraph>
            )}

            {currentTask?.notes && (
              <Paragraph
                type="secondary"
                style={{ marginTop: 4, marginBottom: 0, maxWidth: 800, whiteSpace: 'pre-wrap', fontStyle: 'italic' }}
              >
                <Text strong>Ghi chú: </Text>
                {currentTask.notes}
              </Paragraph>
            )}

            {itemType === 'cr' && currentCr && currentCr.targets.length > 0 && (
              <Space size={4} wrap style={{ marginTop: 8 }}>
                <Text type="secondary">Subsystem: </Text>
                {currentCr.targets.map((target) => {
                  const system = systemMap.get(target.systemId);
                  return (
                    <Tag
                      key={target.systemId}
                      bordered={false}
                      style={{ margin: 0, fontFamily: 'monospace', color: '#13c2c2' }}
                      title={system?.name}
                    >
                      {system?.code ?? target.systemId.slice(0, 8)}
                    </Tag>
                  );
                })}
              </Space>
            )}
          </div>

          {/* Action Toolbar */}
          <Space wrap>
            {itemType === 'task' && currentTask && (
              <>
                <Button
                  type={isCurrentTaskTiming ? 'default' : 'primary'}
                  icon={isCurrentTaskTiming ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                  onClick={handleToggleTimer}
                >
                  {isCurrentTaskTiming ? 'Tạm dừng' : 'Bắt đầu làm'}
                </Button>
                <Button icon={<CheckCircleOutlined />} onClick={handleToggleTaskStatus}>
                  {currentTask.status === 'Done' ? 'Mở lại' : 'Hoàn thành'}
                </Button>
                <Button icon={<CalendarOutlined />} onClick={() => onNavigate('planner')}>
                  Phân bổ lịch
                </Button>
                <Button icon={<EditOutlined />} onClick={() => setTaskDrawerOpen(true)}>
                  Chỉnh sửa
                </Button>
              </>
            )}

            {itemType === 'cr' && currentCr && (
              <>
                <Button
                  type="primary"
                  icon={<ProjectOutlined />}
                  onClick={() => openCrDetail(currentCr.id)}
                >
                  Mở CR detail
                </Button>
                <Button icon={<PlusOutlined />} onClick={() => void handleCreateTaskInCr()}>
                  Thêm tác vụ
                </Button>
              </>
            )}

            <Button
              type="default"
              icon={<RobotOutlined style={{ color: '#1677ff' }} />}
              onClick={handleAskAI}
              aria-label="Hỏi AI về mục này"
            >
              Hỏi AI
            </Button>
          </Space>
        </div>

        {/* Detailed Item Metadata Badges & Links */}
        <Divider style={{ margin: '16px 0' }} />
        <Row gutter={[16, 8]}>
          <Col xs={24} sm={12} md={8}>
            <Text type="secondary">Hạn chót: </Text>
            <Text strong>
              {currentTask?.deadline || currentCr?.deadline || 'Không có'}
            </Text>
          </Col>
          {(currentTask?.opsOwners || currentCr?.opsOwners)?.length ? (
            <Col xs={24} sm={12} md={8}>
              <Text type="secondary">Ops Owners: </Text>
              <Space size={4} wrap>
                {(currentTask?.opsOwners || currentCr?.opsOwners)!.map((o) => (
                  <Tag key={o} color="blue">{o}</Tag>
                ))}
              </Space>
            </Col>
          ) : null}
          {(currentTask?.businessAnalysts || currentCr?.businessAnalysts)?.length ? (
            <Col xs={24} sm={12} md={8}>
              <Text type="secondary">BA: </Text>
              <Space size={4} wrap>
                {(currentTask?.businessAnalysts || currentCr?.businessAnalysts)!.map((b) => (
                  <Tag key={b} color="geekblue">{b}</Tag>
                ))}
              </Space>
            </Col>
          ) : null}
        </Row>

        {/* Document Links */}
        {((currentTask?.documentLinks || currentCr?.documentLinks)?.length ?? 0) > 0 && (
          <div style={{ marginTop: 12 }}>
            <Text type="secondary">Tài liệu liên kết: </Text>
            <Space size={8} wrap style={{ marginTop: 4, maxWidth: '100%' }}>
              {(currentTask?.documentLinks || currentCr?.documentLinks)!.map((link, idx) => (
                <Button
                  key={idx}
                  size="small"
                  style={{
                    maxWidth: '100%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    overflow: 'hidden',
                  }}
                  icon={isLocalPath(link) ? <FolderOpenOutlined /> : <LinkOutlined />}
                  onClick={(e) => void openDocumentLink(link, { quickClaude: e.altKey })}
                  title={isLocalPath(link) ? `${link} (Alt+Click để mở Claude Code)` : link}
                >
                  <span
                    style={{
                      maxWidth: 320,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      display: 'inline-block',
                      verticalAlign: 'bottom',
                    }}
                  >
                    {link}
                  </span>
                </Button>
              ))}
            </Space>
          </div>
        )}
      </Card>

      {/* Metrics Row */}
      {itemType === 'task' && taskAnalysis && (
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Ước tính"
                value={formatMinutes(taskAnalysis.metrics.estimateMinutes)}
                prefix={<ClockCircleOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Đã thực hiện"
                value={formatMinutes(taskAnalysis.metrics.actualSpentMinutes)}
                prefix={<PlayCircleOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Đã phân bổ"
                value={formatMinutes(taskAnalysis.metrics.plannedMinutes)}
                prefix={<CalendarOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Tiến độ checklist"
                value={taskAnalysis.metrics.subtaskPercent}
                suffix="%"
                prefix={<CheckCircleOutlined />}
              />
            </Card>
          </Col>
        </Row>
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

      {/* Pre-implementation Analysis & Recommendations Panel (task only) */}
      {itemType === 'task' && taskAnalysis && (
        <Card
          title={
            <Space>
              <ExclamationCircleOutlined style={{ color: '#1677ff' }} />
              <span>Gợi ý & Phân tích trước khi thực hiện</span>
            </Space>
          }
          style={{ marginBottom: 16 }}
        >
          {taskAnalysis.recommendations.map(renderRecommendationAlert)}
        </Card>
      )}

      {/* Subtasks / Checklist (Task view only) */}
      {itemType === 'task' && currentTask?.checklist && currentTask.checklist.length > 0 && (
        <Card title="Checklist / Tiêu chí nghiệm thu" style={{ marginBottom: 16 }}>
          <List
            dataSource={currentTask.checklist}
            renderItem={(item, index) => (
              <List.Item key={item.id}>
                <Checkbox
                  checked={item.done}
                  onChange={() => void handleToggleChecklistItem(index)}
                >
                  <span style={{ textDecoration: item.done ? 'line-through' : 'none' }}>
                    {item.text}
                  </span>
                </Checkbox>
              </List.Item>
            )}
          />
        </Card>
      )}

      {/* Child Tasks (CR & System views) */}
      {itemType !== 'task' && (
        <Card
          title={`Danh sách tác vụ liên quan (${relatedTasks.length})`}
          style={{ marginBottom: 16 }}
        >
          {relatedTasks.length === 0 ? (
            <Empty description="Chưa có tác vụ nào" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <List
              dataSource={relatedTasks}
              renderItem={(t) => {
                const cr = crMap.get(t.crId);
                const system = t.systemId ? systemMap.get(t.systemId) : undefined;
                return (
                  <List.Item
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
                    <List.Item.Meta
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
                            <Tag bordered={false} style={{ fontFamily: 'monospace', color: '#13c2c2' }}>
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
                  </List.Item>
                );
              }}
            />
          )}
        </Card>
      )}

      {/* Linked Notes Section */}
      <Card
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
          <Empty description="Chưa có ghi chú nào" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <List
            dataSource={relatedNotes}
            renderItem={(note) => (
              <List.Item
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
                <List.Item.Meta
                  title={note.title || 'Ghi chú không tiêu đề'}
                  description={`Cập nhật: ${new Date(note.updatedAt).toLocaleDateString('vi-VN')}`}
                />
              </List.Item>
            )}
          />
        )}
      </Card>

      {/* Linked Diagrams Section */}
      <Card
        title={
          <Space>
            <ApartmentOutlined style={{ color: '#10b981' }} />
            <span>Biểu đồ liên quan ({relatedDiagrams.length})</span>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <EntityDiagramsSection entityType={itemType} entityId={itemId} db={db} embedded={true} />
      </Card>

      {/* Modals & Drawers */}
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
