import React, { useMemo } from 'react';
import {
  Table,
  Tag,
  Button,
  Space,
  Tooltip,
  theme,
  type TableColumnsType,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  FolderOutlined,
  FlagOutlined,
} from '@ant-design/icons';
import type { Project, Milestone, Task } from '../../types/models';
import { EmptyState } from '../common/EmptyState';
import { formatMinutes } from '../../utils/time';
import { getTodayDateString } from '../../utils/date';

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
}

const STATUS_TAG_COLORS: Record<string, string> = {
  Open: 'default',
  'In Progress': 'processing',
  Resolved: 'warning',
  'In Review': 'cyan',
  Done: 'success',
  Cancelled: 'default',
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
}) => {
  const { token } = theme.useToken();
  const today = getTodayDateString();

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
        title: 'Milestone',
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
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        width: 120,
        render: (status: string) => (
          <Tag color={STATUS_TAG_COLORS[status] || 'default'}>{status}</Tag>
        ),
      },
      {
        title: 'Deadline',
        dataIndex: 'deadline',
        key: 'deadline',
        width: 120,
        render: (deadline?: string) => deadline || '—',
      },
      {
        title: 'Tasks',
        key: 'tasksCount',
        width: 80,
        render: (_, record) => {
          const count = (taskMap.byMilestone.get(record.id) || []).length;
          return <span>{count}</span>;
        },
      },
      {
        title: 'Actions',
        key: 'actions',
        width: 200,
        render: (_, record) => (
          <Space orientation="horizontal" size="small">
            <Button
              size="small"
              icon={<PlusOutlined />}
              onClick={() => onAddTask(project.id, record.id)}
            >
              + Task
            </Button>
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => onEditMilestone(record)}
            />
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => onDeleteMilestone(record)}
            />
          </Space>
        ),
      },
    ];

    const milestoneExpandedRender = (ms: Milestone) => {
      const msTasks = taskMap.byMilestone.get(ms.id) || [];
      if (msTasks.length === 0) {
        return (
          <div style={{ padding: '8px 16px', color: token.colorTextTertiary, fontSize: 13 }}>
            No tasks in this milestone.
          </div>
        );
      }

      return (
        <Table
          rowKey="id"
          dataSource={msTasks}
          pagination={false}
          size="small"
          columns={[
            {
              title: 'Task Name',
              dataIndex: 'name',
              key: 'name',
              render: (name: string, record: Task) => (
                <span
                  style={{ cursor: 'pointer', color: token.colorPrimary }}
                  onClick={() => onEditTask(record.id)}
                >
                  {name}
                </span>
              ),
            },
            {
              title: 'Status',
              dataIndex: 'status',
              key: 'status',
              width: 120,
              render: (status: string) => (
                <Tag color={STATUS_TAG_COLORS[status] || 'default'}>{status}</Tag>
              ),
            },
            {
              title: 'Estimate',
              dataIndex: 'estimateMinutes',
              key: 'estimate',
              width: 100,
              render: (mins: number) => formatMinutes(mins),
            },
            {
              title: 'Deadline',
              dataIndex: 'deadline',
              key: 'deadline',
              width: 120,
              render: (deadline?: string) => deadline || '—',
            },
          ]}
        />
      );
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '12px 0' }}>
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
              Milestones ({projMilestones.length})
            </span>
            <Button
              size="small"
              icon={<PlusOutlined />}
              onClick={() => onAddMilestone(project.id)}
            >
              + Milestone
            </Button>
          </div>
          <Table
            rowKey="id"
            dataSource={projMilestones}
            columns={milestoneColumns}
            expandable={{ expandedRowRender: milestoneExpandedRender }}
            pagination={false}
            size="small"
            locale={{ emptyText: 'No milestones yet' }}
          />
        </div>

        {directTasks.length > 0 && (
          <div>
            <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 14, color: token.colorTextSecondary }}>
              Direct Project Tasks ({directTasks.length})
            </div>
            <Table
              rowKey="id"
              dataSource={directTasks}
              pagination={false}
              size="small"
              columns={[
                {
                  title: 'Task Name',
                  dataIndex: 'name',
                  key: 'name',
                  render: (name: string, record: Task) => (
                    <span
                      style={{ cursor: 'pointer', color: token.colorPrimary }}
                      onClick={() => onEditTask(record.id)}
                    >
                      {name}
                    </span>
                  ),
                },
                {
                  title: 'Status',
                  dataIndex: 'status',
                  key: 'status',
                  width: 120,
                  render: (status: string) => (
                    <Tag color={STATUS_TAG_COLORS[status] || 'default'}>{status}</Tag>
                  ),
                },
                {
                  title: 'Estimate',
                  dataIndex: 'estimateMinutes',
                  key: 'estimate',
                  width: 100,
                  render: (mins: number) => formatMinutes(mins),
                },
                {
                  title: 'Deadline',
                  dataIndex: 'deadline',
                  key: 'deadline',
                  width: 120,
                  render: (deadline?: string) => deadline || '—',
                },
              ]}
            />
          </div>
        )}
      </div>
    );
  };

  const projectColumns: TableColumnsType<Project> = [
    {
      title: 'Project',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => (
        <Space orientation="horizontal" size="small">
          <FolderOutlined style={{ color: token.colorPrimary, fontSize: 16 }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: token.colorText }}>{name}</div>
            {record.description && (
              <div style={{ fontSize: 12, color: token.colorTextTertiary }}>{record.description}</div>
            )}
          </div>
        </Space>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: string) => (
        <Tag color={STATUS_TAG_COLORS[status] || 'default'}>{status}</Tag>
      ),
    },
    {
      title: 'Deadline',
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
      title: 'Milestones',
      key: 'milestones',
      width: 110,
      render: (_, record) => {
        const count = (milestoneMap.get(record.id) || []).length;
        return <span>{count}</span>;
      },
    },
    {
      title: 'Tasks',
      key: 'tasks',
      width: 100,
      render: (_, record) => {
        const count = (taskMap.byProject.get(record.id) || []).length;
        return <span>{count}</span>;
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 220,
      render: (_, record) => (
        <Space orientation="horizontal" size="small">
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={() => onAddTask(record.id, undefined)}
          >
            + Task
          </Button>
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={() => onAddMilestone(record.id)}
          >
            + Milestone
          </Button>
          <Tooltip title="Edit project">
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => onEditProject(record)}
            />
          </Tooltip>
          <Tooltip title="Delete project">
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => onDeleteProject(record)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <Table
      rowKey="id"
      dataSource={projects}
      columns={projectColumns}
      expandable={{ expandedRowRender }}
      loading={loading}
      pagination={{ pageSize: 20, hideOnSinglePage: true }}
      locale={{
        emptyText: (
          <EmptyState
            heading="No projects yet"
            body="Click 'New Project' to organize tasks into projects and milestones."
          />
        ),
      }}
      size="middle"
    />
  );
};
