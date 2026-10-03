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
  FlagOutlined,
  PlusOutlined,
  LineChartOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import type { Note } from '../types/models';
import type { NavigateFunction } from '../types/navigation';
import {
  analyzeTaskInsight,
  analyzeProjectInsight,
  analyzeMilestoneInsight,
  type InsightRecommendation,
} from '../utils/itemInsight';
import { formatMinutes } from '../utils/time';
import { openDocumentLink, isLocalPath } from '../utils/documentLinks';
import { getJiraBrowseUrl, openJiraExternalUrl } from '../services/jira/jiraApi';
import { useTimer } from '../hooks/useTimer';
import { TaskDrawer } from '../components/tasks/TaskDrawer';
import { ProjectModal } from '../components/projects/ProjectModal';
import { MilestoneModal } from '../components/projects/MilestoneModal';
import { NoteDetailModal } from '../components/notes/NoteDetailModal';
import { NoteEditor } from '../components/notes/NoteEditor';
import { updateTask, createTask } from '../db/repositories/taskRepo';
import { updateProject } from '../db/repositories/projectRepo';
import { updateMilestone } from '../db/repositories/milestoneRepo';

const { Title, Text, Paragraph } = Typography;

export interface ItemInsightViewProps {
  itemType: 'task' | 'project' | 'milestone';
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

export const ItemInsightView: React.FC<ItemInsightViewProps> = ({
  itemType,
  itemId,
  onNavigate,
  db = defaultDb,
}) => {
  const { activeTimers, startTimer, pauseTimer } = useTimer();

  // Dialog states for editing items
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [milestoneModalOpen, setMilestoneModalOpen] = useState(false);
  const [inspectingNote, setInspectingNote] = useState<Note | null>(null);
  const [editingNote, setEditingNote] = useState<Note | null>(null);

  // Live queries
  const allTasks = useLiveQuery(() => db.tasks.toArray(), [db]) ?? [];
  const allProjects = useLiveQuery(() => db.projects.toArray(), [db]) ?? [];
  const allMilestones = useLiveQuery(() => db.milestones.toArray(), [db]) ?? [];
  const allWorkSessions = useLiveQuery(() => db.workSessions.toArray(), [db]) ?? [];
  const allAllocations = useLiveQuery(() => db.plannedAllocations.toArray(), [db]) ?? [];
  const allNotes = useLiveQuery(() => db.notes.toArray(), [db]) ?? [];
  const capacityRules = useLiveQuery(() => db.capacityRules.toArray(), [db]) ?? [];
  const jiraDomainSetting = useLiveQuery(() => db.settings.get('jira_domain'), [db]);

  const jiraDomain = typeof jiraDomainSetting?.value === 'string' ? jiraDomainSetting.value : undefined;

  // Selected item
  const currentTask = useMemo(
    () => (itemType === 'task' ? allTasks.find((t) => t.id === itemId) : undefined),
    [itemType, allTasks, itemId]
  );
  const currentProject = useMemo(
    () => (itemType === 'project' ? allProjects.find((p) => p.id === itemId) : undefined),
    [itemType, allProjects, itemId]
  );
  const currentMilestone = useMemo(
    () => (itemType === 'milestone' ? allMilestones.find((m) => m.id === itemId) : undefined),
    [itemType, allMilestones, itemId]
  );

  // Parent relationships
  const parentProject = useMemo(() => {
    if (currentTask?.projectId) return allProjects.find((p) => p.id === currentTask.projectId);
    if (currentMilestone?.projectId) return allProjects.find((p) => p.id === currentMilestone.projectId);
    return undefined;
  }, [currentTask, currentMilestone, allProjects]);

  const parentMilestone = useMemo(() => {
    if (currentTask?.milestoneId) return allMilestones.find((m) => m.id === currentTask.milestoneId);
    return undefined;
  }, [currentTask, allMilestones]);

  // Child collections
  const relatedTasks = useMemo(() => {
    if (itemType === 'project') return allTasks.filter((t) => t.projectId === itemId);
    if (itemType === 'milestone') return allTasks.filter((t) => t.milestoneId === itemId);
    return [];
  }, [itemType, allTasks, itemId]);

  const relatedMilestones = useMemo(() => {
    if (itemType === 'project') return allMilestones.filter((m) => m.projectId === itemId);
    return [];
  }, [itemType, allMilestones, itemId]);

  const relatedNotes = useMemo(() => {
    return allNotes.filter((n) => n.entityId === itemId || (n.entityType === itemType && n.entityId === itemId));
  }, [allNotes, itemType, itemId]);

  // Insight analysis
  const taskAnalysis = useMemo(() => {
    if (!currentTask) return null;
    const taskSessions = allWorkSessions.filter((s) => s.taskId === currentTask.id);
    const taskAllocations = allAllocations.filter((a) => a.taskId === currentTask.id);
    return analyzeTaskInsight(currentTask, taskSessions, taskAllocations, allTasks, allNotes);
  }, [currentTask, allWorkSessions, allAllocations, allTasks, allNotes]);

  const projectAnalysis = useMemo(() => {
    if (!currentProject) return null;
    return analyzeProjectInsight(
      currentProject,
      relatedTasks,
      relatedMilestones,
      allWorkSessions,
      allAllocations
    );
  }, [currentProject, relatedTasks, relatedMilestones, allWorkSessions, allAllocations]);

  const milestoneAnalysis = useMemo(() => {
    if (!currentMilestone) return null;
    return analyzeMilestoneInsight(currentMilestone, relatedTasks, capacityRules);
  }, [currentMilestone, relatedTasks, capacityRules]);

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
      case 'create-task':
        if (itemType === 'project') {
          void createTask({ name: 'Tác vụ mới', projectId: itemId, status: 'Open', priority: 'Medium', estimateMinutes: 0 }, db)
            .then((t) => onNavigate('insight', { type: 'task', id: t.id }));
        } else if (itemType === 'milestone') {
          void createTask({
            name: 'Tác vụ mới',
            projectId: currentMilestone?.projectId,
            milestoneId: itemId,
            status: 'Open',
            priority: 'Medium',
            estimateMinutes: 0,
          }, db).then((t) => onNavigate('insight', { type: 'task', id: t.id }));
        }
        break;
      case 'view-tasks':
        onNavigate('tasks');
        break;
      case 'create-milestone':
        setMilestoneModalOpen(true);
        break;
      case 'edit-milestone':
        setMilestoneModalOpen(true);
        break;
      case 'view-burndown':
        onNavigate('analytics', currentMilestone ? { milestoneId: currentMilestone.id } : undefined);
        break;
      default:
        break;
    }
  };

  // If item not found
  const hasItem =
    (itemType === 'task' && currentTask) ||
    (itemType === 'project' && currentProject) ||
    (itemType === 'milestone' && currentMilestone);

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
              else if (itemType === 'project') onNavigate('projects');
              else if (itemType === 'milestone') onNavigate('projects');
              else onNavigate('dashboard');
            }}
          >
            Quay lại
          </Button>
          <Breadcrumb
            items={[
              { title: <a onClick={() => onNavigate('dashboard')}>Tổng quan</a> },
              ...(parentProject
                ? [
                    {
                      title: (
                        <a onClick={() => onNavigate('insight', { type: 'project', id: parentProject.id })}>
                          {parentProject.name}
                        </a>
                      ),
                    },
                  ]
                : []),
              ...(parentMilestone
                ? [
                    {
                      title: (
                        <a onClick={() => onNavigate('insight', { type: 'milestone', id: parentMilestone.id })}>
                          {parentMilestone.name}
                        </a>
                      ),
                    },
                  ]
                : []),
              {
                title:
                  itemType === 'task'
                    ? currentTask?.name
                    : itemType === 'project'
                    ? currentProject?.name
                    : currentMilestone?.name,
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
              {itemType === 'project' && <Tag color="purple">Dự án</Tag>}
              {itemType === 'milestone' && <Tag color="geekblue">Cột mốc</Tag>}

              <Tag
                color={
                  STATUS_TAG_COLORS[
                    currentTask?.status || currentProject?.status || currentMilestone?.status || 'Open'
                  ] ?? 'default'
                }
              >
                {STATUS_LABELS[
                  currentTask?.status || currentProject?.status || currentMilestone?.status || 'Open'
                ] ?? 'Mở'}
              </Tag>

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

              {currentProject?.jiraEpicKey && (
                <Tooltip title="Mở Jira Epic">
                  <Tag
                    color="cyan"
                    icon={<LinkOutlined />}
                    style={{ cursor: 'pointer' }}
                    onClick={() =>
                      void openJiraExternalUrl(getJiraBrowseUrl(currentProject.jiraEpicKey!, jiraDomain))
                    }
                  >
                    {currentProject.jiraEpicKey}
                  </Tag>
                </Tooltip>
              )}
            </Space>

            <Title level={3} style={{ margin: 0 }}>
              {currentTask?.name || currentProject?.name || currentMilestone?.name}
            </Title>

            {(currentTask?.description || currentProject?.description || currentMilestone?.description) && (
              <Paragraph
                type="secondary"
                style={{ marginTop: 8, marginBottom: 0, maxWidth: 800, whiteSpace: 'pre-wrap' }}
              >
                {currentTask?.description || currentProject?.description || currentMilestone?.description}
              </Paragraph>
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
                <Button
                  icon={<CheckCircleOutlined />}
                  onClick={handleToggleTaskStatus}
                >
                  {currentTask.status === 'Done' ? 'Mở lại' : 'Hoàn thành'}
                </Button>
                <Button
                  icon={<CalendarOutlined />}
                  onClick={() => onNavigate('planner')}
                >
                  Phân bổ lịch
                </Button>
                <Button
                  icon={<EditOutlined />}
                  onClick={() => setTaskDrawerOpen(true)}
                >
                  Chỉnh sửa
                </Button>
              </>
            )}

            {itemType === 'project' && currentProject && (
              <>
                <Button
                  type="primary"
                  icon={<EditOutlined />}
                  onClick={() => setProjectModalOpen(true)}
                >
                  Chỉnh sửa dự án
                </Button>
                <Button
                  icon={<PlusOutlined />}
                  onClick={async () => {
                    try {
                      const t = await createTask(
                        { name: 'Tác vụ mới', projectId: currentProject.id, status: 'Open', priority: 'Medium', estimateMinutes: 0 },
                        db
                      );
                      onNavigate('insight', { type: 'task', id: t.id });
                    } catch {
                      message.error('Không thể tạo tác vụ');
                    }
                  }}
                >
                  Thêm tác vụ
                </Button>
                <Button
                  icon={<FlagOutlined />}
                  onClick={() => setMilestoneModalOpen(true)}
                >
                  Thêm cột mốc
                </Button>
              </>
            )}

            {itemType === 'milestone' && currentMilestone && (
              <>
                <Button
                  type="primary"
                  icon={<EditOutlined />}
                  onClick={() => setMilestoneModalOpen(true)}
                >
                  Chỉnh sửa mốc
                </Button>
                <Button
                  icon={<LineChartOutlined />}
                  onClick={() => onNavigate('analytics', { milestoneId: currentMilestone.id })}
                >
                  Xem Burndown
                </Button>
                <Button
                  icon={<PlusOutlined />}
                  onClick={async () => {
                    try {
                      const t = await createTask(
                        {
                          name: 'Tác vụ mới',
                          projectId: currentMilestone.projectId,
                          milestoneId: currentMilestone.id,
                          status: 'Open',
                          priority: 'Medium',
                          estimateMinutes: 0,
                        },
                        db
                      );
                      onNavigate('insight', { type: 'task', id: t.id });
                    } catch {
                      message.error('Không thể tạo tác vụ');
                    }
                  }}
                >
                  Thêm tác vụ
                </Button>
              </>
            )}
          </Space>
        </div>

        {/* Detailed Item Metadata Badges & Links */}
        <Divider style={{ margin: '16px 0' }} />
        <Row gutter={[16, 8]}>
          <Col xs={24} sm={12} md={8}>
            <Text type="secondary">Hạn chót: </Text>
            <Text strong>
              {currentTask?.deadline || currentProject?.deadline || currentMilestone?.deadline || 'Không có'}
            </Text>
          </Col>
          {(currentTask?.opsOwners || currentProject?.opsOwners || currentMilestone?.opsOwners)?.length ? (
            <Col xs={24} sm={12} md={8}>
              <Text type="secondary">Ops Owners: </Text>
              <Space size={4} wrap>
                {(currentTask?.opsOwners || currentProject?.opsOwners || currentMilestone?.opsOwners)!.map((o) => (
                  <Tag key={o} color="blue">{o}</Tag>
                ))}
              </Space>
            </Col>
          ) : null}
          {(currentTask?.businessAnalysts || currentProject?.businessAnalysts || currentMilestone?.businessAnalysts)?.length ? (
            <Col xs={24} sm={12} md={8}>
              <Text type="secondary">BA: </Text>
              <Space size={4} wrap>
                {(currentTask?.businessAnalysts || currentProject?.businessAnalysts || currentMilestone?.businessAnalysts)!.map((b) => (
                  <Tag key={b} color="geekblue">{b}</Tag>
                ))}
              </Space>
            </Col>
          ) : null}
        </Row>

        {/* Document Links */}
        {((currentTask?.documentLinks || currentProject?.documentLinks)?.length ?? 0) > 0 && (
          <div style={{ marginTop: 12 }}>
            <Text type="secondary">Tài liệu liên kết: </Text>
            <Space size={8} wrap style={{ marginTop: 4 }}>
              {(currentTask?.documentLinks || currentProject?.documentLinks)!.map((link, idx) => (
                <Button
                  key={idx}
                  size="small"
                  icon={isLocalPath(link) ? <FolderOpenOutlined /> : <LinkOutlined />}
                  onClick={() => void openDocumentLink(link)}
                >
                  {link}
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

      {itemType === 'project' && projectAnalysis && (
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Tổng tác vụ"
                value={projectAnalysis.metrics.totalTasks}
                prefix={<ProjectOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Tỉ lệ hoàn thành"
                value={projectAnalysis.metrics.completionRate}
                suffix="%"
                prefix={<CheckCircleOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Tổng ước tính"
                value={formatMinutes(projectAnalysis.metrics.totalEstimatedMinutes)}
                prefix={<ClockCircleOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Thời gian đã làm"
                value={formatMinutes(projectAnalysis.metrics.actualSpentMinutes)}
                prefix={<PlayCircleOutlined />}
              />
            </Card>
          </Col>
        </Row>
      )}

      {itemType === 'milestone' && milestoneAnalysis && (
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Tổng tác vụ"
                value={milestoneAnalysis.metrics.totalTasks}
                prefix={<FlagOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Tỉ lệ hoàn tất"
                value={milestoneAnalysis.metrics.completionRate}
                suffix="%"
                prefix={<CheckCircleOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Ước tính còn lại"
                value={formatMinutes(milestoneAnalysis.metrics.remainingEstimateMinutes)}
                prefix={<ClockCircleOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Ngày còn lại"
                value={milestoneAnalysis.metrics.daysRemaining ?? 'N/A'}
                prefix={<CalendarOutlined />}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* Pre-implementation Analysis & Recommendations Panel */}
      <Card
        title={
          <Space>
            <ExclamationCircleOutlined style={{ color: '#1677ff' }} />
            <span>Gợi ý & Phân tích trước khi thực hiện</span>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        {itemType === 'task' && taskAnalysis?.recommendations.map(renderRecommendationAlert)}
        {itemType === 'project' && projectAnalysis?.recommendations.map(renderRecommendationAlert)}
        {itemType === 'milestone' && milestoneAnalysis?.recommendations.map(renderRecommendationAlert)}
      </Card>

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

      {/* Child Tasks & Milestones (Project & Milestone views) */}
      {(itemType === 'project' || itemType === 'milestone') && (
        <Card
          title={`Danh sách tác vụ liên quan (${relatedTasks.length})`}
          style={{ marginBottom: 16 }}
        >
          {relatedTasks.length === 0 ? (
            <Empty description="Chưa có tác vụ nào" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <List
              dataSource={relatedTasks}
              renderItem={(t) => (
                <List.Item
                  key={t.id}
                  actions={[
                    <Button
                      key="insight"
                      type="link"
                      onClick={() => onNavigate('insight', { type: 'task', id: t.id })}
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
                        <a onClick={() => onNavigate('insight', { type: 'task', id: t.id })}>
                          {t.name}
                        </a>
                      </Space>
                    }
                    description={`Ước tính: ${formatMinutes(t.estimateMinutes)} | Hạn chót: ${t.deadline || 'Không'}`}
                  />
                </List.Item>
              )}
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

      {/* Modals & Drawers */}
      {currentTask && (
        <TaskDrawer
          taskId={taskDrawerOpen ? currentTask.id : null}
          open={taskDrawerOpen}
          onClose={() => setTaskDrawerOpen(false)}
          db={db}
        />
      )}

      {currentProject && (
        <ProjectModal
          open={projectModalOpen}
          project={currentProject}
          onClose={() => setProjectModalOpen(false)}
          onSave={async (values) => {
            await updateProject(currentProject.id, values, db);
            setProjectModalOpen(false);
            message.success('Đã cập nhật dự án');
          }}
          db={db}
        />
      )}

      {currentMilestone && (
        <MilestoneModal
          open={milestoneModalOpen}
          projectId={currentMilestone.projectId}
          milestone={currentMilestone}
          onClose={() => setMilestoneModalOpen(false)}
          onSave={async (values) => {
            await updateMilestone(currentMilestone.id, values, db);
            setMilestoneModalOpen(false);
            message.success('Đã cập nhật mốc');
          }}
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
