import React, { useEffect, useState, useMemo } from 'react';
import {
  Modal,
  Typography,
  Tag,
  Progress,
  Space,
  Button,
  Divider,
  List,
  Badge,
} from 'antd';
import {
  ProjectOutlined,
  FlagOutlined,
  CheckSquareOutlined,
  EditOutlined,
  PlusOutlined,
  ExportOutlined,
  CalendarOutlined,
  LinkOutlined,
  FolderOpenOutlined,
  ClockCircleOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { Project, Milestone, Task } from '../../types/models';
import { formatMinutes } from '../../utils/time';
import { openDocumentLink, isLocalPath } from '../../utils/documentLinks';
import { useAIChat } from '../../context/AIChatContext';

const { Text, Title, Paragraph } = Typography;

export interface ProjectDetailModalProps {
  open: boolean;
  project: Project | null;
  onClose: () => void;
  onEdit: (project: Project) => void;
  onNavigateToProjects?: (projectId?: string) => void;
  onOpenTask?: (taskId: string) => void;
  onAddTask?: (projectId: string) => void;
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

export const ProjectDetailModal: React.FC<ProjectDetailModalProps> = ({
  open,
  project,
  onClose,
  onEdit,
  onNavigateToProjects,
  onOpenTask,
  onAddTask,
  db = defaultDb,
}) => {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [spentMinutes, setSpentMinutes] = useState<number>(0);

  const { registerActiveItem, openChat } = useAIChat();

  // Register active project while open for auto-follow grounding
  useEffect(() => {
    if (open && project) {
      return registerActiveItem({
        type: 'project',
        id: project.id,
        title: project.name,
      });
    }
    return undefined;
  }, [open, project, registerActiveItem]);

  const handleAskAI = () => {
    if (project) {
      openChat({
        type: 'project',
        id: project.id,
        title: project.name,
      });
    } else {
      openChat();
    }
  };

  useEffect(() => {
    let active = true;
    if (!open || !project) {
      setMilestones([]);
      setTasks([]);
      setSpentMinutes(0);
      return () => {
        active = false;
      };
    }

    const loadData = async () => {
      try {
        const [ms, ts] = await Promise.all([
          db.milestones.where('projectId').equals(project.id).toArray(),
          db.tasks.where('projectId').equals(project.id).toArray(),
        ]);

        let totalSpent = 0;
        if (ts.length > 0) {
          const taskIds = ts.map((t) => t.id);
          const sessions = await db.workSessions.where('taskId').anyOf(taskIds).toArray();
          totalSpent = sessions.reduce((sum, s) => sum + s.durationMinutes, 0);
        }

        if (active) {
          setMilestones(ms);
          setTasks(ts);
          setSpentMinutes(totalSpent);
        }
      } catch (err) {
        console.error('Failed to load project details', err);
      }
    };

    void loadData();

    return () => {
      active = false;
    };
  }, [db, project, open]);

  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter((t) => t.status === 'Done').length;
    const inProgress = tasks.filter((t) => t.status === 'In Progress').length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    const totalEstimate = tasks.reduce((sum, t) => sum + (t.estimateMinutes || 0), 0);
    return { total, completed, inProgress, percent, totalEstimate };
  }, [tasks]);

  if (!project) return null;

  const isOverdue =
    project.deadline &&
    project.status !== 'Done' &&
    project.status !== 'Cancelled' &&
    new Date(project.deadline) < new Date(new Date().toDateString());

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={720}
      title={
        <Space align="center" style={{ width: '100%', justifyContent: 'space-between', paddingRight: 24 }}>
          <Space align="center" wrap>
            <ProjectOutlined style={{ fontSize: 20, color: '#fa8c16' }} />
            <Title level={4} style={{ margin: 0 }}>
              {project.name}
            </Title>
            <Tag color={STATUS_TAG_COLORS[project.status] || 'default'}>
              {STATUS_LABELS[project.status] || project.status}
            </Tag>
          </Space>
        </Space>
      }
      footer={[
        onNavigateToProjects && (
          <Button
            key="navigate"
            icon={<ExportOutlined />}
            onClick={() => {
              onClose();
              onNavigateToProjects(project.id);
            }}
          >
            Mở trong trang Dự án
          </Button>
        ),
        onAddTask && (
          <Button
            key="addTask"
            icon={<PlusOutlined />}
            onClick={() => {
              onClose();
              onAddTask(project.id);
            }}
          >
            Thêm công việc
          </Button>
        ),
        <Button
          key="askAI"
          icon={<RobotOutlined style={{ color: '#1677ff' }} />}
          onClick={handleAskAI}
          aria-label="Hỏi AI về dự án này"
        >
          Hỏi AI
        </Button>,
        <Button key="close" onClick={onClose}>
          Đóng
        </Button>,
        <Button
          key="edit"
          type="primary"
          icon={<EditOutlined />}
          onClick={() => {
            onClose();
            onEdit(project);
          }}
        >
          Chỉnh sửa dự án
        </Button>,
      ].filter(Boolean)}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12 }}>
        {/* Progress & Quick stats */}
        <div style={{ background: '#fafafa', padding: 12, borderRadius: 6 }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text strong>Tiến độ công việc</Text>
              <Text type="secondary">
                {stats.completed}/{stats.total} hoàn thành ({stats.percent}%)
              </Text>
            </div>
            <Progress percent={stats.percent} status={stats.percent === 100 ? 'success' : 'active'} />
            <Space split={<Divider type="vertical" />} style={{ marginTop: 4 }}>
              <Text type="secondary">
                <ClockCircleOutlined /> Ước tính: {formatMinutes(stats.totalEstimate)}
              </Text>
              <Text type="secondary">
                <ClockCircleOutlined /> Thực tế: {formatMinutes(spentMinutes)}
              </Text>
              {project.deadline && (
                <Text type={isOverdue ? 'danger' : 'secondary'}>
                  <CalendarOutlined /> Hạn: {project.deadline} {isOverdue && '(Quá hạn)'}
                </Text>
              )}
            </Space>
          </Space>
        </div>

        {/* Description & Notes */}
        {project.description && (
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              Mô tả:
            </Text>
            <Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
              {project.description}
            </Paragraph>
          </div>
        )}

        {project.notes && (
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              Ghi chú:
            </Text>
            <Paragraph type="secondary" style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
              {project.notes}
            </Paragraph>
          </div>
        )}

        {/* Metadata: Jira Epic, Owners, BAs, Links */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {project.jiraEpicKey && (
            <div>
              <Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>
                Jira Epic:
              </Text>
              <Tag color="geekblue">{project.jiraEpicKey}</Tag>
            </div>
          )}

          {((project.opsOwners && project.opsOwners.length > 0) ||
            (project.businessAnalysts && project.businessAnalysts.length > 0)) && (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {project.opsOwners && project.opsOwners.length > 0 && (
                <div>
                  <Text type="secondary" style={{ fontSize: 12, marginRight: 6 }}>
                    Ops / PIC:
                  </Text>
                  <Space size={[4, 4]} wrap>
                    {project.opsOwners.map((owner) => (
                      <Tag key={owner} color="cyan">{owner}</Tag>
                    ))}
                  </Space>
                </div>
              )}
              {project.businessAnalysts && project.businessAnalysts.length > 0 && (
                <div>
                  <Text type="secondary" style={{ fontSize: 12, marginRight: 6 }}>
                    BA:
                  </Text>
                  <Space size={[4, 4]} wrap>
                    {project.businessAnalysts.map((ba) => (
                      <Tag key={ba} color="purple">{ba}</Tag>
                    ))}
                  </Space>
                </div>
              )}
            </div>
          )}

          {project.documentLinks && project.documentLinks.length > 0 && (
            <div>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                Tài liệu liên kết:
              </Text>
              <Space wrap size={[6, 6]}>
                {project.documentLinks.map((link, idx) => (
                  <Button
                    key={idx}
                    size="small"
                    icon={isLocalPath(link) ? <FolderOpenOutlined /> : <LinkOutlined />}
                    onClick={() => openDocumentLink(link)}
                    title={link}
                  >
                    {link.length > 40 ? link.slice(0, 37) + '...' : link}
                  </Button>
                ))}
              </Space>
            </div>
          )}
        </div>

        {/* Milestones */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Text strong>
              <FlagOutlined style={{ color: '#faad14', marginRight: 6 }} />
              Cột mốc ({milestones.length})
            </Text>
          </div>
          {milestones.length === 0 ? (
            <Text type="secondary" style={{ fontSize: 13 }}>Chưa có cột mốc nào trong dự án này.</Text>
          ) : (
            <List
              size="small"
              bordered
              dataSource={milestones}
              renderItem={(m) => (
                <List.Item
                  style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px' }}
                >
                  <Space>
                    <Text strong>{m.name}</Text>
                    <Tag color={STATUS_TAG_COLORS[m.status] || 'default'} style={{ fontSize: 11 }}>
                      {STATUS_LABELS[m.status] || m.status}
                    </Tag>
                  </Space>
                  {m.deadline && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      <CalendarOutlined /> {m.deadline}
                    </Text>
                  )}
                </List.Item>
              )}
            />
          )}
        </div>

        {/* Tasks snippet */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Text strong>
              <CheckSquareOutlined style={{ color: '#1677ff', marginRight: 6 }} />
              Công việc ({tasks.length})
            </Text>
          </div>
          {tasks.length === 0 ? (
            <Text type="secondary" style={{ fontSize: 13 }}>Chưa có công việc nào.</Text>
          ) : (
            <List
              size="small"
              bordered
              dataSource={tasks.slice(0, 5)}
              renderItem={(t) => (
                <List.Item
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '6px 12px',
                    cursor: onOpenTask ? 'pointer' : 'default',
                  }}
                  onClick={() => onOpenTask?.(t.id)}
                >
                  <Space>
                    <Badge status={t.status === 'Done' ? 'success' : t.status === 'In Progress' ? 'processing' : 'default'} />
                    <Text>{t.name}</Text>
                    {t.jiraKey && <Tag color="blue">{t.jiraKey}</Tag>}
                  </Space>
                  <Space>
                    <Tag color={t.priority === 'High' || t.priority === 'Urgent' ? 'red' : 'default'}>
                      {t.priority}
                    </Tag>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {formatMinutes(t.estimateMinutes || 0)}
                    </Text>
                  </Space>
                </List.Item>
              )}
            />
          )}
          {tasks.length > 5 && (
            <div style={{ textAlign: 'center', marginTop: 4 }}>
              <Button type="link" size="small" onClick={() => onNavigateToProjects?.(project.id)}>
                Xem tất cả {tasks.length} công việc trong trang Dự án...
              </Button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
