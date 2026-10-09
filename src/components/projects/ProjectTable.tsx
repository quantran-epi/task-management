import React, { useEffect, useMemo, useState } from 'react';
import {
  Table,
  Tag,
  Button,
  Space,
  Tooltip,
  Popover,
  Dropdown,
  theme,
  type TableColumnsType,
  type MenuProps,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  FolderOutlined,
  FlagOutlined,
  LinkOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  RobotOutlined,
  MoreOutlined,
} from '@ant-design/icons';
import type { Project, Milestone, Task } from '../../types/models';
import { EmptyState } from '../common/EmptyState';
import { formatMinutes } from '../../utils/time';
import { getTodayDateString } from '../../utils/date';
import { TagListDisplay } from '../common/TagListDisplay';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { getJiraBrowseUrl, openJiraExternalUrl } from '../../services/jira/jiraApi';
import { openDocumentLink, isLocalPath } from '../../utils/documentLinks';
import { useAIChat } from '../../context/AIChatContext';

export interface ProjectTableProps {
  projects: Project[];
  milestones: Milestone[];
  tasks: Task[];
  onAddTask: (projectId?: string, milestoneId?: string) => void;
  onEditProject: (project: Project) => void;
  onDeleteProject: (project: Project) => void;
  onAddMilestone: (projectId: string) => void;
  onEditMilestone: (milestone: Milestone) => void;
  onDeleteMilestone: (milestone: Milestone) => void;
  onEditTask: (taskId: string) => void;
  loading?: boolean;
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

export const ProjectTable: React.FC<ProjectTableProps> = ({
  projects,
  milestones,
  tasks,
  onAddTask,
  onEditProject,
  onDeleteProject,
  onAddMilestone,
  onEditMilestone,
  onDeleteMilestone,
  onEditTask,
  loading = false,
  db = defaultDb,
}) => {
  const { token } = theme.useToken();
  const today = getTodayDateString();
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });
  const { openChat } = useAIChat();

  const [contextMenu, setContextMenu] = useState<{
    items: NonNullable<MenuProps['items']>;
    x: number;
    y: number;
  } | null>(null);

  const getProjectMenuItems = (record: Project): NonNullable<MenuProps['items']> => [
    {
      key: 'ai-chat',
      icon: <RobotOutlined style={{ color: token.colorPrimary }} />,
      label: 'Hỏi Trợ lý AI',
      onClick: () => {
        openChat({ type: 'project', id: record.id, title: record.name });
      },
    },
    {
      key: 'add-task',
      icon: <PlusOutlined />,
      label: 'Thêm tác vụ',
      onClick: () => onAddTask(record.id, undefined),
    },
    {
      key: 'add-milestone',
      icon: <PlusOutlined />,
      label: 'Thêm cột mốc',
      onClick: () => onAddMilestone(record.id),
    },
    {
      key: 'edit',
      icon: <EditOutlined />,
      label: 'Sửa dự án',
      onClick: () => onEditProject(record),
    },
    {
      type: 'divider',
    },
    {
      key: 'delete',
      icon: <DeleteOutlined style={{ color: token.colorError }} />,
      danger: true,
      label: 'Xóa dự án',
      onClick: () => onDeleteProject(record),
    },
  ];

  const getMilestoneMenuItems = (record: Milestone, projectId: string): NonNullable<MenuProps['items']> => [
    {
      key: 'ai-chat',
      icon: <RobotOutlined style={{ color: token.colorPrimary }} />,
      label: 'Hỏi Trợ lý AI',
      onClick: () => {
        openChat({ type: 'milestone', id: record.id, title: record.name });
      },
    },
    {
      key: 'add-task',
      icon: <PlusOutlined />,
      label: 'Thêm tác vụ',
      onClick: () => onAddTask(projectId, record.id),
    },
    {
      key: 'edit',
      icon: <EditOutlined />,
      label: 'Sửa cột mốc',
      onClick: () => onEditMilestone(record),
    },
    {
      type: 'divider',
    },
    {
      key: 'delete',
      icon: <DeleteOutlined style={{ color: token.colorError }} />,
      danger: true,
      label: 'Xóa cột mốc',
      onClick: () => onDeleteMilestone(record),
    },
  ];

  const getTaskMenuItems = (record: Task): NonNullable<MenuProps['items']> => [
    {
      key: 'ai-chat',
      icon: <RobotOutlined style={{ color: token.colorPrimary }} />,
      label: 'Hỏi Trợ lý AI',
      onClick: () => {
        openChat({ type: 'task', id: record.id, title: record.name });
      },
    },
    {
      key: 'edit',
      icon: <EditOutlined />,
      label: 'Sửa tác vụ',
      onClick: () => onEditTask(record.id),
    },
  ];

  // Query spent minutes map for all tasks
  const taskSpentMap = useLiveQuery(async () => {
    if (!db || tasks.length === 0) return new Map<string, number>();
    const taskIds = tasks.map((t) => t.id);
    const sessions = await db.workSessions.where('taskId').anyOf(taskIds).toArray();
    const map = new Map<string, number>();
    for (const s of sessions) {
      map.set(s.taskId, (map.get(s.taskId) || 0) + s.durationMinutes);
    }
    return map;
  }, [db, tasks]) ?? new Map<string, number>();

  // Query tasks with notes in the note feature
  const taskNotesSet = useLiveQuery(async () => {
    if (!db || tasks.length === 0) return new Set<string>();
    const taskIds = tasks.map((t) => t.id);
    const notes = await db.notes
      .where('entityId')
      .anyOf(taskIds)
      .filter((n) => n.entityType === 'task')
      .toArray();
    return new Set(notes.map((n) => n.entityId));
  }, [db, tasks]) ?? new Set<string>();

  // Maps for fast aggregation
  const milestoneMap = useMemo(() => {
    const map = new Map<string, Milestone[]>();
    for (const m of milestones) {
      const arr = map.get(m.projectId) || [];
      arr.push(m);
      map.set(m.projectId, arr);
    }
    return map;
  }, [milestones]);

  const taskMap = useMemo(() => {
    const byProject = new Map<string, Task[]>();
    const byMilestone = new Map<string, Task[]>();

    for (const t of tasks) {
      if (t.projectId) {
        const arr = byProject.get(t.projectId) || [];
        arr.push(t);
        byProject.set(t.projectId, arr);
      }
      if (t.milestoneId) {
        const arr = byMilestone.get(t.milestoneId) || [];
        arr.push(t);
        byMilestone.set(t.milestoneId, arr);
      }
    }
    return { byProject, byMilestone };
  }, [tasks]);

  // Nested expansion renderer for project row (Milestones + Direct Tasks)
  const expandedRowRender = (project: Project) => {
    const projMilestones = milestoneMap.get(project.id) || [];
    const directTasks = (taskMap.byProject.get(project.id) || []).filter((t) => !t.milestoneId);

    const milestoneColumns: TableColumnsType<Milestone> = [
      {
        title: 'Cột mốc',
        dataIndex: 'name',
        key: 'name',
        render: (name) => (
          <Space orientation="horizontal" size="small">
            <FlagOutlined style={{ color: token.colorPrimary }} />
            <span style={{ fontWeight: 600 }}>{name}</span>
          </Space>
        ),
      },
      {
        title: 'Trạng thái',
        dataIndex: 'status',
        key: 'status',
        width: 120,
        render: (status: string) => (
          <Tag color={STATUS_TAG_COLORS[status] || 'default'}>{STATUS_LABELS[status] || status}</Tag>
        ),
      },
      {
        title: 'Hạn chót',
        dataIndex: 'deadline',
        key: 'deadline',
        width: 120,
        render: (deadline?: string) => deadline || '—',
      },
      {
        title: 'Ops Owner',
        key: 'opsOwners',
        width: 130,
        render: (_, record) => {
          const direct = record.opsOwners;
          if (direct && direct.length > 0) {
            return <TagListDisplay tags={direct} source="direct" />;
          }
          if (project.opsOwners && project.opsOwners.length > 0) {
            return (
              <TagListDisplay
                tags={project.opsOwners}
                source="project"
                originName={project.name}
              />
            );
          }
          return <TagListDisplay tags={[]} />;
        },
      },
      {
        title: 'BA',
        key: 'businessAnalysts',
        width: 130,
        render: (_, record) => {
          const direct = record.businessAnalysts;
          if (direct && direct.length > 0) {
            return <TagListDisplay tags={direct} source="direct" />;
          }
          if (project.businessAnalysts && project.businessAnalysts.length > 0) {
            return (
              <TagListDisplay
                tags={project.businessAnalysts}
                source="project"
                originName={project.name}
              />
            );
          }
          return <TagListDisplay tags={[]} />;
        },
      },
      {
        title: 'Thời gian',
        key: 'spentTime',
        width: 140,
        render: (_, record) => {
          const msTasks = taskMap.byMilestone.get(record.id) || [];
          const totalEstimate = msTasks.reduce((acc, t) => acc + (t.estimateMinutes || 0), 0);
          const totalSpent = msTasks.reduce((acc, t) => acc + (taskSpentMap.get(t.id) || 0), 0);

          return (
            <span style={{ fontSize: 13 }}>
              <strong>{formatMinutes(totalSpent)}</strong>
              <span style={{ color: token.colorTextSecondary }}> / {formatMinutes(totalEstimate)}</span>
            </span>
          );
        },
      },
      {
        title: 'Tác vụ',
        key: 'tasksCount',
        width: 80,
        render: (_, record) => {
          const count = (taskMap.byMilestone.get(record.id) || []).length;
          return <span>{count}</span>;
        },
      },
      {
        title: 'Thao tác',
        key: 'actions',
        width: 140,
        render: (_, record) => (
          <Space orientation="horizontal" size="small">
            <Button
              size="small"
              icon={<PlusOutlined />}
              onClick={() => onAddTask(project.id, record.id)}
            >
              Tác vụ
            </Button>
            <Dropdown menu={{ items: getMilestoneMenuItems(record, project.id) }} trigger={['click']}>
              <Button
                type="text"
                size="small"
                icon={<MoreOutlined />}
                aria-label="Thao tác khác"
              />
            </Dropdown>
          </Space>
        ),
      },
    ];

    const milestoneExpandedRender = (ms: Milestone) => {
      const msTasks = taskMap.byMilestone.get(ms.id) || [];
      if (msTasks.length === 0) {
        return (
          <div
            style={{
              padding: '8px 16px',
              marginLeft: 8,
              borderLeft: `2px dashed ${token.colorBorderSecondary}`,
              color: token.colorTextTertiary,
              fontSize: 13,
            }}
          >
            Chưa có tác vụ nào trong cột mốc này.
          </div>
        );
      }

      return (
        <div
          style={{
            padding: '8px 12px 8px 24px',
            marginLeft: 8,
            borderLeft: `2px dashed ${token.colorBorderSecondary}`,
            background: token.colorFillQuaternary,
            borderRadius: `0 ${token.borderRadiusSM}px ${token.borderRadiusSM}px 0`,
          }}
        >
          <Table
            rowKey="id"
            dataSource={msTasks}
            pagination={false}
            size="small"
            onRow={(record) => ({
              onContextMenu: (e) => {
                e.preventDefault();
                setContextMenu({
                  items: getTaskMenuItems(record),
                  x: e.clientX,
                  y: e.clientY,
                });
              },
            })}
            columns={[
              {
                title: 'Tên tác vụ',
                dataIndex: 'name',
                key: 'name',
                render: (name: string, record: Task) => (
                  <Space size={6}>
                    <span
                      style={{ cursor: 'pointer', color: token.colorPrimary }}
                      onClick={() => onEditTask(record.id)}
                    >
                      {name}
                    </span>
                    {taskNotesSet.has(record.id) && (
                      <Tooltip title="Có ghi chú">
                        <FileTextOutlined style={{ color: token.colorPrimary, fontSize: 12 }} />
                      </Tooltip>
                    )}
                  </Space>
                ),
              },
              {
                title: 'Trạng thái',
                dataIndex: 'status',
                key: 'status',
                width: 120,
                render: (status: string) => (
                  <Tag color={STATUS_TAG_COLORS[status] || 'default'}>{STATUS_LABELS[status] || status}</Tag>
                ),
              },
              {
                title: 'Ước tính',
                dataIndex: 'estimateMinutes',
                key: 'estimate',
                width: 100,
                render: (mins: number) => formatMinutes(mins),
              },
              {
                title: 'Hạn chót',
                dataIndex: 'deadline',
                key: 'deadline',
                width: 120,
                render: (deadline?: string) => deadline || '—',
              },
              {
                title: 'Thao tác',
                key: 'actions',
                width: 80,
                render: (_, record: Task) => (
                  <Dropdown menu={{ items: getTaskMenuItems(record) }} trigger={['click']}>
                    <Button
                      type="text"
                      size="small"
                      icon={<MoreOutlined />}
                      aria-label="Thao tác khác"
                    />
                  </Dropdown>
                ),
              },
            ]}
          />
        </div>
      );
    };

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          padding: '14px 16px 14px 28px',
          marginLeft: 12,
          borderLeft: `3px solid ${token.colorPrimaryBorder}`,
          background: token.colorFillAlter,
          borderRadius: `0 ${token.borderRadiusSM}px ${token.borderRadiusSM}px 0`,
        }}
      >
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
            }}
          >
            <span style={{ fontWeight: 600, fontSize: 14, color: token.colorTextSecondary }}>
              Cột mốc ({projMilestones.length})
            </span>
            <Button
              size="small"
              icon={<PlusOutlined />}
              onClick={() => onAddMilestone(project.id)}
            >
              Cột mốc
            </Button>
          </div>
          <Table
            rowKey="id"
            dataSource={projMilestones}
            columns={milestoneColumns}
            expandable={{ expandedRowRender: milestoneExpandedRender }}
            pagination={false}
            size="small"
            locale={{ emptyText: 'Chưa có cột mốc nào' }}
            onRow={(record) => ({
              onContextMenu: (e) => {
                e.preventDefault();
                setContextMenu({
                  items: getMilestoneMenuItems(record, project.id),
                  x: e.clientX,
                  y: e.clientY,
                });
              },
            })}
          />
        </div>

        {directTasks.length > 0 && (
          <div>
            <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 14, color: token.colorTextSecondary }}>
              Tác vụ trực thuộc dự án ({directTasks.length})
            </div>
            <Table
              rowKey="id"
              dataSource={directTasks}
              pagination={false}
              size="small"
              onRow={(record) => ({
                onContextMenu: (e) => {
                  e.preventDefault();
                  setContextMenu({
                    items: getTaskMenuItems(record),
                    x: e.clientX,
                    y: e.clientY,
                  });
                },
              })}
              columns={[
                {
                  title: 'Tên tác vụ',
                  dataIndex: 'name',
                  key: 'name',
                  render: (name: string, record: Task) => (
                    <Space size={6}>
                      <span
                        style={{ cursor: 'pointer', color: token.colorPrimary }}
                        onClick={() => onEditTask(record.id)}
                      >
                        {name}
                      </span>
                      {taskNotesSet.has(record.id) && (
                        <Tooltip title="Có ghi chú">
                          <FileTextOutlined style={{ color: token.colorPrimary, fontSize: 12 }} />
                        </Tooltip>
                      )}
                    </Space>
                  ),
                },
                {
                  title: 'Trạng thái',
                  dataIndex: 'status',
                  key: 'status',
                  width: 120,
                  render: (status: string) => (
                    <Tag color={STATUS_TAG_COLORS[status] || 'default'}>{STATUS_LABELS[status] || status}</Tag>
                  ),
                },
                {
                  title: 'Ước tính',
                  dataIndex: 'estimateMinutes',
                  key: 'estimate',
                  width: 100,
                  render: (mins: number) => formatMinutes(mins),
                },
                {
                  title: 'Hạn chót',
                  dataIndex: 'deadline',
                  key: 'deadline',
                  width: 120,
                  render: (deadline?: string) => deadline || '—',
                },
                {
                  title: 'Thao tác',
                  key: 'actions',
                  width: 80,
                  render: (_, record: Task) => (
                    <Dropdown menu={{ items: getTaskMenuItems(record) }} trigger={['click']}>
                      <Button
                        type="text"
                        size="small"
                        icon={<MoreOutlined />}
                        aria-label="Thao tác khác"
                      />
                    </Dropdown>
                  ),
                },
              ]}
            />
          </div>
        )}
      </div>
    );
  };

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(projects.length / pagination.pageSize));
    if (pagination.current > maxPage) {
      setPagination((current) => ({ ...current, current: maxPage }));
    }
  }, [projects.length, pagination.current, pagination.pageSize]);

  const projectColumns: TableColumnsType<Project> = [
    {
      title: 'Dự án',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => {
        const linkCount = record.documentLinks?.length ?? 0;
        return (
          <Space orientation="horizontal" size="small">
            <FolderOutlined style={{ color: token.colorPrimary, fontSize: 16 }} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, fontSize: 14, color: token.colorText }}>{name}</span>
                {record.jiraEpicKey && (
                  <Tag
                    color="purple"
                    icon={<LinkOutlined />}
                    style={{ cursor: 'pointer', margin: 0, fontSize: 11 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      void openJiraExternalUrl(getJiraBrowseUrl(record.jiraEpicKey!));
                    }}
                    title={`Mở Jira Epic ${record.jiraEpicKey}`}
                  >
                    Epic: {record.jiraEpicKey}
                  </Tag>
                )}
                {linkCount > 0 && (
                  <Popover
                    title="Tài liệu liên kết"
                    overlayStyle={{ maxWidth: 420 }}
                    content={
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                          maxWidth: 380,
                          maxHeight: 280,
                          overflowY: 'auto',
                          paddingRight: 4,
                        }}
                      >
                        {record.documentLinks?.map((link, idx) => {
                          const local = isLocalPath(link);
                          return (
                            <a
                              key={idx}
                              href={link}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (e.altKey) {
                                  void openDocumentLink(link, { quickClaude: true });
                                } else {
                                  void openDocumentLink(link);
                                }
                              }}
                              title={local ? 'Mở trong File Explorer' : 'Mở liên kết web'}
                              style={{
                                fontSize: 12,
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 6,
                                lineHeight: 1.4,
                                color: token.colorLink,
                              }}
                            >
                              {local ? (
                                <FolderOpenOutlined style={{ color: '#fa8c16', flexShrink: 0, marginTop: 2 }} />
                              ) : (
                                <LinkOutlined style={{ color: '#1677ff', flexShrink: 0, marginTop: 2 }} />
                              )}
                              <span
                                title={link}
                                style={{
                                  flex: 1,
                                  minWidth: 0,
                                  wordBreak: 'break-all',
                                  overflowWrap: 'anywhere',
                                }}
                              >
                                {link}
                              </span>
                            </a>
                          );
                        })}
                      </div>
                    }
                    trigger="hover"
                  >
                    <Tag
                      icon={<LinkOutlined />}
                      style={{ cursor: 'pointer', margin: 0, fontSize: 11 }}
                      color="default"
                    >
                      {linkCount} link{linkCount > 1 ? 's' : ''}
                    </Tag>
                  </Popover>
                )}
              </div>
              {record.description && (
                <div style={{ fontSize: 12, color: token.colorTextTertiary }}>{record.description}</div>
              )}
            </div>
          </Space>
        );
      },
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: string) => (
        <Tag color={STATUS_TAG_COLORS[status] || 'default'}>{STATUS_LABELS[status] || status}</Tag>
      ),
    },
    {
      title: 'Hạn chót',
      dataIndex: 'deadline',
      key: 'deadline',
      width: 130,
      render: (deadline?: string) => {
        if (!deadline) return '—';
        const isOverdue = deadline < today;
        return (
          <span style={{ color: isOverdue ? token.colorError : token.colorText, fontWeight: isOverdue ? 600 : 400 }}>
            {deadline}
          </span>
        );
      },
    },
    {
      title: 'Ops Owner',
      key: 'opsOwners',
      width: 140,
      render: (_, record) => <TagListDisplay tags={record.opsOwners} source="direct" />,
    },
    {
      title: 'BA',
      key: 'businessAnalysts',
      width: 140,
      render: (_, record) => <TagListDisplay tags={record.businessAnalysts} source="direct" />,
    },
    {
      title: 'Thời gian',
      key: 'spentTime',
      width: 150,
      render: (_, record) => {
        const projTasks = taskMap.byProject.get(record.id) || [];
        const totalEstimate = projTasks.reduce((acc, t) => acc + (t.estimateMinutes || 0), 0);
        const totalSpent = projTasks.reduce((acc, t) => acc + (taskSpentMap.get(t.id) || 0), 0);

        return (
          <span style={{ fontSize: 13 }}>
            <strong>{formatMinutes(totalSpent)}</strong>
            <span style={{ color: token.colorTextSecondary }}> / {formatMinutes(totalEstimate)}</span>
          </span>
        );
      },
    },
    {
      title: 'Cột mốc',
      key: 'milestones',
      width: 110,
      render: (_, record) => {
        const count = (milestoneMap.get(record.id) || []).length;
        return <span>{count}</span>;
      },
    },
    {
      title: 'Tác vụ',
      key: 'tasks',
      width: 100,
      render: (_, record) => {
        const count = (taskMap.byProject.get(record.id) || []).length;
        return <span>{count}</span>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 140,
      render: (_, record) => (
        <Space orientation="horizontal" size="small">
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={() => onAddTask(record.id, undefined)}
          >
            Tác vụ
          </Button>
          <Dropdown menu={{ items: getProjectMenuItems(record) }} trigger={['click']}>
            <Button
              type="text"
              size="small"
              icon={<MoreOutlined />}
              aria-label="Thao tác khác"
            />
          </Dropdown>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Table
        rowKey="id"
        dataSource={projects}
        columns={projectColumns}
        expandable={{ expandedRowRender }}
        loading={loading}
        onRow={(record) => ({
          onContextMenu: (e) => {
            e.preventDefault();
            setContextMenu({
              items: getProjectMenuItems(record),
              x: e.clientX,
              y: e.clientY,
            });
          },
        })}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (total, range) => `${range[0]}-${range[1]} / ${total} dự án`,
          hideOnSinglePage: false,
          onChange: (current, pageSize) => {
            setPagination((prev) => ({
              current: pageSize !== prev.pageSize ? 1 : current,
              pageSize,
            }));
          },
        }}
        locale={{
          emptyText: (
            <EmptyState
              heading="Chưa có dự án nào"
              body="Nhấn 'Dự án mới' để sắp xếp tác vụ theo dự án và cột mốc."
            />
          ),
        }}
        size="middle"
      />

      {contextMenu && (
        <Dropdown
          menu={{
            items: contextMenu.items,
            onClick: () => setContextMenu(null),
          }}
          open={true}
          onOpenChange={(open) => {
            if (!open) setContextMenu(null);
          }}
        >
          <span
            style={{
              position: 'fixed',
              left: contextMenu.x,
              top: contextMenu.y,
              width: 1,
              height: 1,
              pointerEvents: 'none',
            }}
          />
        </Dropdown>
      )}
    </>
  );
};
