import React, { useState, useEffect, useRef } from 'react';
import {
  Table,
  Tag,
  Space,
  Button,
  Popover,
  Tooltip,
  Modal,
  message,
  Dropdown,
  theme,
  type TableColumnsType,
  type MenuProps,
} from 'antd';
import {
  EditOutlined,
  MoreOutlined,
  DeleteOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import type { Task, Project, Milestone, TaskPriority, WorkType } from '../../types/models';
import { InlineStatusTag } from './InlineStatusTag';
import { InlineProgress } from './InlineProgress';
import { HierarchyBreadcrumb } from './HierarchyBreadcrumb';
import { EmptyState } from '../common/EmptyState';
import { formatMinutes } from '../../utils/time';
import { getTodayDateString } from '../../utils/date';
import { deleteTaskWithAllocations } from '../../db/repositories/cascadeRepo';
import { WorkTypeBadge, WORK_TYPE_CONFIG } from './WorkTypeBadge';
import { TagListDisplay } from '../common/TagListDisplay';
import { resolveInheritedTags } from '../../domain/inheritance';
import { WORK_TYPES } from '../../types/models';
import type { TaskPlannerDatabase } from '../../db';

export interface TaskTableProps {
  tasks: Task[];
  projects: Project[];
  milestones: Milestone[];
  selectedRowKeys: string[];
  onSelectRows: (keys: string[]) => void;
  onOpenDrawer: (taskId: string) => void;
  onSelectProject?: (projectId: string) => void;
  isFiltered?: boolean;
  db?: TaskPlannerDatabase;
  loading?: boolean;
}

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  Urgent: '#ff4d4f',
  High: '#fa8c16',
  Medium: '#1677ff',
  Low: '#8c8c8c',
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  Urgent: 'Khẩn cấp',
  High: 'Cao',
  Medium: 'Trung bình',
  Low: 'Thấp',
};

export const TaskTable: React.FC<TaskTableProps> = ({
  tasks,
  projects,
  milestones,
  selectedRowKeys,
  onSelectRows,
  onOpenDrawer,
  onSelectProject,
  isFiltered = false,
  db,
  loading = false,
}) => {
  const { token } = theme.useToken();
  const today = getTodayDateString();
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const tableRef = useRef<HTMLDivElement>(null);

  // Fast project and milestone lookup maps
  const projectMap = React.useMemo(() => {
    return new Map(projects.map((p) => [p.id, p]));
  }, [projects]);

  const milestoneMap = React.useMemo(() => {
    return new Map(milestones.map((m) => [m.id, m]));
  }, [milestones]);

  // Keep highlightedIndex in bounds when tasks change
  useEffect(() => {
    if (tasks.length === 0) {
      setHighlightedIndex(-1);
    } else if (highlightedIndex >= tasks.length) {
      setHighlightedIndex(tasks.length - 1);
    }
  }, [tasks.length, highlightedIndex]);

  // Keyboard navigation on table container per D-31, UX-02
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (tasks.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < tasks.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      if (highlightedIndex >= 0 && highlightedIndex < tasks.length) {
        e.preventDefault();
        const activeTask = tasks[highlightedIndex];
        if (activeTask) {
          onOpenDrawer(activeTask.id);
        }
      }
    } else if (e.key === ' ') {
      if (highlightedIndex >= 0 && highlightedIndex < tasks.length) {
        e.preventDefault();
        const activeTask = tasks[highlightedIndex];
        if (activeTask) {
          const isSelected = selectedRowKeys.includes(activeTask.id);
          const next = isSelected
            ? selectedRowKeys.filter((k) => k !== activeTask.id)
            : [...selectedRowKeys, activeTask.id];
          onSelectRows(next);
        }
      }
    }
  };

  const columns: TableColumnsType<Task> = [
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status, record) => (
        <InlineStatusTag
          taskId={record.id}
          status={status}
          estimateMinutes={record.estimateMinutes}
          db={db}
        />
      ),
    },
    {
      title: 'Độ ưu tiên',
      dataIndex: 'priority',
      key: 'priority',
      width: 105,
      render: (priority: TaskPriority) => (
        <Tag
          bordered={false}
          style={{
            color: PRIORITY_COLORS[priority] || '#8c8c8c',
            backgroundColor: `${PRIORITY_COLORS[priority] || '#8c8c8c'}15`,
            fontWeight: 600,
            margin: 0,
            fontSize: 12,
          }}
        >
          {PRIORITY_LABELS[priority] || priority}
        </Tag>
      ),
    },
    {
      title: 'Loại việc',
      dataIndex: 'workType',
      key: 'workType',
      width: 140,
      filters: WORK_TYPES.map((wt) => ({
        text: WORK_TYPE_CONFIG[wt].label,
        value: wt,
      })),
      onFilter: (value, record) => (record.workType || 'code') === value,
      render: (workType?: WorkType) => <WorkTypeBadge workType={workType || 'code'} />,
    },
    {
      title: 'Tác vụ & Phân cấp',
      dataIndex: 'name',
      key: 'name',
      render: (_, record) => {
        const project = record.projectId ? projectMap.get(record.projectId) : undefined;
        const milestone = record.milestoneId ? milestoneMap.get(record.milestoneId) : undefined;
        const linkCount = record.documentLinks?.length ?? 0;
        const notesPreview = record.notes ? record.notes.split('\n')[0] : '';

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <HierarchyBreadcrumb
                projectId={record.projectId}
                projectName={project?.name}
                milestoneName={milestone?.name}
                onSelectProject={onSelectProject}
              />
              <span
                onClick={() => onOpenDrawer(record.id)}
                style={{
                  fontWeight: 500,
                  fontSize: 14,
                  color: token.colorText,
                  cursor: 'pointer',
                }}
                className="task-name-link"
              >
                {record.name}
              </span>
              {linkCount > 0 && (
                <Popover
                  title="Tài liệu liên kết"
                  content={
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {record.documentLinks?.map((link, idx) => (
                        <a
                          key={idx}
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: 12 }}
                        >
                          <LinkOutlined style={{ marginRight: 4 }} />
                          {link}
                        </a>
                      ))}
                    </div>
                  }
                  trigger="hover"
                >
                  <Tag
                    icon={<LinkOutlined />}
                    style={{ margin: 0, cursor: 'pointer', fontSize: 11 }}
                  >
                    🔗 {linkCount}
                  </Tag>
                </Popover>
              )}
            </div>

            {notesPreview && (
              <Tooltip title={record.notes} placement="topLeft">
                <span
                  style={{
                    fontSize: 12,
                    color: token.colorTextTertiary,
                    maxWidth: 400,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: 'block',
                  }}
                >
                  {notesPreview}
                </span>
              </Tooltip>
            )}
          </div>
        );
      },
    },
    {
      title: 'Ops Owner',
      key: 'opsOwners',
      width: 140,
      render: (_, record) => {
        const project = record.projectId ? projectMap.get(record.projectId) : undefined;
        const milestone = record.milestoneId ? milestoneMap.get(record.milestoneId) : undefined;
        const res = resolveInheritedTags('opsOwners', record, {
          project: project ? { name: project.name, opsOwners: project.opsOwners } : undefined,
          milestone: milestone ? { name: milestone.name, opsOwners: milestone.opsOwners } : undefined,
        });
        return <TagListDisplay tags={res.tags} source={res.source} originName={res.originName} />;
      },
    },
    {
      title: 'BA',
      key: 'businessAnalysts',
      width: 140,
      render: (_, record) => {
        const project = record.projectId ? projectMap.get(record.projectId) : undefined;
        const milestone = record.milestoneId ? milestoneMap.get(record.milestoneId) : undefined;
        const res = resolveInheritedTags('businessAnalysts', record, {
          project: project ? { name: project.name, businessAnalysts: project.businessAnalysts } : undefined,
          milestone: milestone ? { name: milestone.name, businessAnalysts: milestone.businessAnalysts } : undefined,
        });
        return <TagListDisplay tags={res.tags} source={res.source} originName={res.originName} />;
      },
    },
    {
      title: 'Ước tính',
      dataIndex: 'estimateMinutes',
      key: 'estimateMinutes',
      width: 100,
      render: (mins: number) => (
        <span style={{ fontSize: 14, color: mins ? token.colorText : token.colorTextQuaternary }}>
          {formatMinutes(mins)}
        </span>
      ),
    },
    {
      title: 'Tiến độ',
      dataIndex: 'progress',
      key: 'progress',
      width: 110,
      render: (progress: number, record) => (
        <InlineProgress taskId={record.id} progress={progress} db={db} />
      ),
    },
    {
      title: 'Hạn chót',
      dataIndex: 'deadline',
      key: 'deadline',
      width: 120,
      render: (deadline?: string) => {
        if (!deadline) {
          return <span style={{ fontSize: 12, color: token.colorTextQuaternary }}>—</span>;
        }
        const isOverdue = deadline < today;
        return (
          <span
            style={{
              fontSize: 14,
              color: isOverdue ? token.colorError : token.colorText,
              fontWeight: isOverdue ? 600 : 400,
            }}
          >
            {deadline}
          </span>
        );
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 80,
      render: (_, record) => {
        const menuItems: MenuProps['items'] = [
          {
            key: 'edit',
            icon: <EditOutlined />,
            label: 'Sửa tác vụ',
            onClick: () => onOpenDrawer(record.id),
          },
          {
            key: 'delete',
            icon: <DeleteOutlined style={{ color: token.colorError }} />,
            danger: true,
            label: 'Xóa',
            onClick: () => {
              Modal.confirm({
                title: 'Xóa tác vụ',
                content: `Bạn có chắc muốn xóa "${record.name}"?`,
                okText: 'Xóa',
                cancelText: 'Hủy',
                okButtonProps: { danger: true },
                onOk: async () => {
                  if (!db) return;
                  try {
                    await deleteTaskWithAllocations(record.id, db);
                    message.success({ content: 'Đã xóa tác vụ', duration: 1.5 });
                  } catch {
                    message.error({ content: 'Không thể xóa tác vụ', duration: 2 });
                  }
                },
              });
            },
          },
        ];

        return (
          <Space orientation="horizontal" size={4}>
            <Tooltip title="Sửa tác vụ">
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                onClick={() => onOpenDrawer(record.id)}
                aria-label="Sửa nhanh tác vụ"
              />
            </Tooltip>
            <Dropdown menu={{ items: menuItems }} trigger={['click']}>
              <Button
                type="text"
                size="small"
                icon={<MoreOutlined />}
                aria-label="Thao tác khác"
              />
            </Dropdown>
          </Space>
        );
      },
    },
  ];

  return (
    <div
      ref={tableRef}
      data-testid="task-table-container"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{ outline: 'none' }}
    >
      <Table
        rowKey="id"
        columns={columns}
        dataSource={tasks}
        loading={loading}
        pagination={{ pageSize: 25, hideOnSinglePage: true }}
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => onSelectRows(keys as string[]),
        }}
        rowClassName={(_, index) =>
          index === highlightedIndex ? 'ant-table-row-selected keyboard-active-row' : ''
        }
        locale={{
          emptyText: isFiltered ? (
            <EmptyState
              heading="Không có tác vụ phù hợp"
              body="Không có tác vụ nào khớp với tiêu chí tìm kiếm và bộ lọc. Hãy đặt lại bộ lọc để xem tất cả."
            />
          ) : (
            <EmptyState
              heading="Chưa có tác vụ nào"
              body="Tạo tác vụ đầu tiên bằng thanh nhập phía trên hoặc xóa bộ lọc đang hoạt động."
            />
          ),
        }}
        size="middle"
      />
    </div>
  );
};
