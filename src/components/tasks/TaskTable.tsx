import React, { useState, useEffect, useRef } from 'react';
import {
  Table,
  Tag,
  Space,
  Button,
  Popover,
  Tooltip,
  Modal,
  Input,
  Select,
  message,
  Dropdown,
  Progress,
  Checkbox,
  theme,
  type TableColumnsType,
  type MenuProps,
} from 'antd';
import {
  EditOutlined,
  MoreOutlined,
  DeleteOutlined,
  LinkOutlined,
  CopyOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  CheckCircleOutlined,
  SettingOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import type { Task, Project, Milestone, TaskPriority, WorkType } from '../../types/models';
import { InlineStatusTag } from './InlineStatusTag';
import { InlineProgress } from './InlineProgress';
import { HierarchyBreadcrumb } from './HierarchyBreadcrumb';
import { EmptyState } from '../common/EmptyState';
import { formatMinutes, formatElapsedTicker } from '../../utils/time';
import { getTodayDateString } from '../../utils/date';
import { deleteTaskWithAllocations } from '../../db/repositories/cascadeRepo';
import { WorkTypeBadge, WORK_TYPE_CONFIG } from './WorkTypeBadge';
import { TagListDisplay } from '../common/TagListDisplay';
import { resolveInheritedTags } from '../../domain/inheritance';
import { WORK_TYPES } from '../../types/models';
import { formatStandupSummary } from '../../utils/standup';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { getJiraBrowseUrl } from '../../services/jira/jiraApi';
import { useTimer } from '../../hooks/useTimer';
import { evaluateTaskSpentAlert } from '../../utils/timerAlerts';
import {
  TASK_SORT_OPTIONS,
  DEFAULT_TASK_SORT,
  type TaskSortKey,
} from '../../utils/filter';

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
  jiraDomain?: string;
  globalSort?: TaskSortKey;
  onGlobalSortChange?: (key: TaskSortKey) => void;
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

const PRIORITY_WEIGHTS: Record<TaskPriority, number> = {
  Urgent: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

const STATUS_WEIGHTS: Record<Task['status'], number> = {
  Open: 1,
  Pending: 2,
  'In Progress': 3,
  Resolved: 4,
  'In Review': 5,
  Done: 6,
  Cancelled: 7,
};

export const STORAGE_COLUMNS_KEY = 'planner:task_table_columns';

export interface ColumnConfig {
  key: string;
  label: string;
  fixed?: boolean;
  default: boolean;
}

export const ALL_CUSTOMIZABLE_COLUMNS: ColumnConfig[] = [
  { key: 'name', label: 'Tác vụ & Phân cấp', fixed: true, default: true },
  { key: 'status', label: 'Trạng thái', default: true },
  { key: 'priority', label: 'Độ ưu tiên', default: true },
  { key: 'workType', label: 'Loại việc', default: true },
  { key: 'opsOwners', label: 'Ops Owner', default: true },
  { key: 'businessAnalysts', label: 'Business Analyst (BA)', default: true },
  { key: 'estimateMinutes', label: 'Thời gian làm / Ước tính', default: true },
  { key: 'timer', label: 'Đồng hồ tính giờ', default: true },
  { key: 'progress', label: 'Tiến độ', default: true },
  { key: 'deadline', label: 'Hạn chót', default: true },
  { key: 'actions', label: 'Thao tác', default: true },
];

export const DEFAULT_VISIBLE_COLUMNS: string[] = ALL_CUSTOMIZABLE_COLUMNS.filter(
  (c) => c.default
).map((c) => c.key);

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
  jiraDomain,
  globalSort,
  onGlobalSortChange,
}) => {
  const { token } = theme.useToken();
  const today = getTodayDateString();
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [standupFallbackModalOpen, setStandupFallbackModalOpen] = useState<boolean>(false);
  const [standupFallbackText, setStandupFallbackText] = useState<string>('');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 25 });
  const tableRef = useRef<HTMLDivElement>(null);
  const fallbackTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Synchronous localStorage initialization to prevent FOUC per D-16, T-12.2-07
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    try {
      if (typeof window === 'undefined') return DEFAULT_VISIBLE_COLUMNS;
      const raw = localStorage.getItem(STORAGE_COLUMNS_KEY);
      if (!raw) return DEFAULT_VISIBLE_COLUMNS;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Enforce 'name' is always included
        return Array.from(new Set(['name', ...parsed.filter((k) => typeof k === 'string')]));
      }
      return DEFAULT_VISIBLE_COLUMNS;
    } catch {
      return DEFAULT_VISIBLE_COLUMNS;
    }
  });

  const handleColumnToggle = (columnKey: string, checked: boolean) => {
    if (columnKey === 'name') return; // Fixed mandatory column
    let next: string[];
    if (checked) {
      next = Array.from(new Set([...visibleColumns, columnKey]));
    } else {
      next = visibleColumns.filter((k) => k !== columnKey);
      if (!next.includes('name')) next.unshift('name');
    }
    setVisibleColumns(next);
    try {
      localStorage.setItem(STORAGE_COLUMNS_KEY, JSON.stringify(next));
    } catch (err) {
      console.warn('Failed to save task table column preferences:', err);
    }
  };

  const handleResetColumns = () => {
    setVisibleColumns(DEFAULT_VISIBLE_COLUMNS);
    try {
      localStorage.setItem(STORAGE_COLUMNS_KEY, JSON.stringify(DEFAULT_VISIBLE_COLUMNS));
    } catch (err) {
      console.warn('Failed to reset task table column preferences:', err);
    }
  };

  const effectiveDb = db || defaultDb;
  const {
    getTimerForTask,
    getElapsedSeconds,
    startTimer,
    pauseTimer,
    finishTimer,
  } = useTimer();

  // Query spent minutes for all tasks in table
  const taskSpentMap = useLiveQuery(async () => {
    if (!effectiveDb || tasks.length === 0) return new Map<string, number>();
    const taskIds = tasks.map((t) => t.id);
    const sessions = await effectiveDb.workSessions.where('taskId').anyOf(taskIds).toArray();
    const map = new Map<string, number>();
    for (const s of sessions) {
      map.set(s.taskId, (map.get(s.taskId) || 0) + s.durationMinutes);
    }
    return map;
  }, [effectiveDb, tasks]) ?? new Map<string, number>();

  const settingsDomain = useLiveQuery(async () => {
    if (!effectiveDb) return undefined;
    const rec = await effectiveDb.settings.get('jira_domain');
    return (rec?.value as string) || undefined;
  }, [effectiveDb]);

  const effectiveJiraDomain = jiraDomain || settingsDomain;

  // Fast project and milestone lookup maps
  const projectMap = React.useMemo(() => {
    return new Map(projects.map((p) => [p.id, p]));
  }, [projects]);

  const milestoneMap = React.useMemo(() => {
    return new Map(milestones.map((m) => [m.id, m]));
  }, [milestones]);

  const handleCopyStandup = async () => {
    const summary = formatStandupSummary(tasks, {
      projectMap,
      milestoneMap,
      todayStr: today,
    });

    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) {
        throw new Error('Clipboard API not available');
      }
      await navigator.clipboard.writeText(summary);
      message.success('Đã sao chép báo cáo Standup vào clipboard');
    } catch {
      // Graceful fallback for non-secure context or permission denied
      setStandupFallbackText(summary);
      setStandupFallbackModalOpen(true);
      setTimeout(() => {
        fallbackTextareaRef.current?.select();
      }, 100);
    }
  };

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
      sorter: (a, b) => (STATUS_WEIGHTS[a.status] || 0) - (STATUS_WEIGHTS[b.status] || 0),
      sortDirections: ['ascend', 'descend'],
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
      sorter: (a, b) => (PRIORITY_WEIGHTS[a.priority] || 0) - (PRIORITY_WEIGHTS[b.priority] || 0),
      sortDirections: ['ascend', 'descend'],
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
      sorter: (a, b) => a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' }),
      sortDirections: ['ascend', 'descend'],
      render: (_, record) => {
        const project = record.projectId ? projectMap.get(record.projectId) : undefined;
        const milestone = record.milestoneId ? milestoneMap.get(record.milestoneId) : undefined;
        const linkCount = record.documentLinks?.length ?? 0;
        const hasNotes = Boolean(record.notes?.trim());

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
              {record.jiraKey && (
                <Tag
                  color="processing"
                  icon={<LinkOutlined style={{ marginRight: 4 }} />}
                  style={{ cursor: 'pointer', margin: 0, fontSize: 12 }}
                  title="Mở trên Jira Web"
                  onClick={(e) => {
                    e.stopPropagation();
                    const url = getJiraBrowseUrl(record.jiraKey!, effectiveJiraDomain);
                    window.open(url, '_blank', 'noopener,noreferrer');
                  }}
                >
                  {record.jiraKey}
                </Tag>
              )}
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

            {hasNotes && (
              <Tooltip title="Có ghi chú trong chi tiết tác vụ" placement="topLeft">
                <Tag icon={<FileTextOutlined />} color="blue" style={{ width: 'fit-content', margin: 0 }}>
                  Có ghi chú
                </Tag>
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
      title: 'Đã dùng / Ước tính',
      dataIndex: 'estimateMinutes',
      key: 'estimateMinutes',
      width: 140,
      sorter: (a, b) => (a.estimateMinutes || 0) - (b.estimateMinutes || 0),
      sortDirections: ['ascend', 'descend'],
      render: (mins: number, record) => {
        const spentMinutes = taskSpentMap.get(record.id) || 0;
        const estimate = mins || 0;
        const percent = estimate > 0 ? Math.round((spentMinutes / estimate) * 100) : 0;

        let strokeColor = token.colorSuccess;
        if (percent >= 100) {
          strokeColor = token.colorError;
        } else if (percent >= 80) {
          strokeColor = token.colorWarning;
        }

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 100 }}>
            <span style={{ fontSize: 13, color: token.colorText }}>
              <strong>{formatMinutes(spentMinutes)}</strong>
              <span style={{ color: token.colorTextQuaternary }}> / {formatMinutes(estimate)}</span>
            </span>
            {estimate > 0 && (
              <Progress
                percent={Math.min(100, percent)}
                size="small"
                strokeColor={strokeColor}
                showInfo={false}
                style={{ margin: 0 }}
              />
            )}
          </div>
        );
      },
    },
    {
      title: 'Đồng hồ',
      key: 'timer',
      width: 130,
      render: (_, record) => {
        const timer = getTimerForTask(record.id);
        const isRunning = timer?.status === 'running';

        const handleStart = async (e: React.MouseEvent) => {
          e.stopPropagation();
          try {
            await startTimer(record.id);
          } catch (err: any) {
            message.error(err?.message || 'Không thể bắt đầu tính giờ');
          }
        };

        const handlePause = async (e: React.MouseEvent) => {
          e.stopPropagation();
          try {
            await pauseTimer(record.id);
          } catch (err: any) {
            message.error(err?.message || 'Không thể tạm dừng tính giờ');
          }
        };

        const handleFinish = async (e: React.MouseEvent) => {
          e.stopPropagation();
          try {
            await finishTimer(record.id);
            // Check Tier 1 toast alert
            const updatedSpent = (taskSpentMap.get(record.id) || 0) + Math.max(1, Math.round(getElapsedSeconds(record.id) / 60));
            const alert = evaluateTaskSpentAlert(record, updatedSpent);
            if (alert.shouldAlert) {
              message.warning(alert.message);
            }
          } catch (err: any) {
            message.error(err?.message || 'Không thể kết thúc phiên');
          }
        };

        if (!timer) {
          return (
            <Tooltip title="Bắt đầu tính giờ">
              <Button
                type="text"
                size="small"
                icon={<PlayCircleOutlined style={{ fontSize: 16, color: token.colorPrimary }} />}
                onClick={handleStart}
                aria-label="Bắt đầu tính giờ"
                style={{ minWidth: 28, minHeight: 28 }}
              />
            </Tooltip>
          );
        }

        const elapsedSec = getElapsedSeconds(record.id);

        return (
          <Space orientation="horizontal" size={2} onClick={(e) => e.stopPropagation()}>
            <span
              style={{
                fontVariantNumeric: 'tabular-nums',
                fontSize: 12,
                fontWeight: 600,
                color: isRunning ? token.colorSuccess : token.colorWarning,
                marginRight: 4,
              }}
            >
              {formatElapsedTicker(elapsedSec)}
            </span>
            {isRunning ? (
              <Tooltip title="Tạm dừng">
                <Button
                  type="text"
                  size="small"
                  icon={<PauseCircleOutlined style={{ fontSize: 16, color: token.colorWarning }} />}
                  onClick={handlePause}
                  aria-label="Tạm dừng"
                  style={{ minWidth: 24, minHeight: 24, padding: 0 }}
                />
              </Tooltip>
            ) : (
              <Tooltip title="Tiếp tục">
                <Button
                  type="text"
                  size="small"
                  icon={<PlayCircleOutlined style={{ fontSize: 16, color: token.colorSuccess }} />}
                  onClick={handleStart}
                  aria-label="Tiếp tục"
                  style={{ minWidth: 24, minHeight: 24, padding: 0 }}
                />
              </Tooltip>
            )}
            <Tooltip title="Kết thúc phiên">
              <Button
                type="text"
                size="small"
                icon={<CheckCircleOutlined style={{ fontSize: 16, color: token.colorPrimary }} />}
                onClick={handleFinish}
                aria-label="Kết thúc phiên"
                style={{ minWidth: 24, minHeight: 24, padding: 0 }}
              />
            </Tooltip>
          </Space>
        );
      },
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
      sorter: (a, b, sortOrder) => {
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return sortOrder === 'descend' ? -1 : 1;
        if (!b.deadline) return sortOrder === 'descend' ? 1 : -1;
        return a.deadline.localeCompare(b.deadline);
      },
      sortDirections: ['ascend', 'descend'],
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

  // Dynamic column filtering based on visibleColumns preferences per D-13, D-14
  const activeColumns = columns.filter(
    (col) => col.key === 'name' || visibleColumns.includes(col.key as string)
  );

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(tasks.length / pagination.pageSize));
    if (pagination.current > maxPage) {
      setPagination((current) => ({ ...current, current: maxPage }));
    }
  }, [tasks.length, pagination.current, pagination.pageSize]);

  const columnCustomizationContent = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 200, padding: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${token.colorBorderSecondary}`, paddingBottom: 6 }}>
        <strong style={{ fontSize: 13 }}>Cột hiển thị</strong>
        <Button type="link" size="small" onClick={handleResetColumns} style={{ padding: 0 }}>
          Mặc định
        </Button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
        {ALL_CUSTOMIZABLE_COLUMNS.map((col) => {
          const isFixed = Boolean(col.fixed);
          const isChecked = isFixed || visibleColumns.includes(col.key);
          return (
            <Checkbox
              key={col.key}
              checked={isChecked}
              disabled={isFixed}
              onChange={(e) => handleColumnToggle(col.key, e.target.checked)}
            >
              <span style={{ fontSize: 13 }}>{col.label}</span>
              {isFixed && (
                <span style={{ fontSize: 11, color: token.colorTextQuaternary, marginLeft: 4 }}>
                  (Cố định)
                </span>
              )}
            </Checkbox>
          );
        })}
      </div>
    </div>
  );

  return (
    <div
      ref={tableRef}
      data-testid="task-table-container"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{ outline: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      {/* Table Toolbar Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '4px 0',
        }}
      >
        <div style={{ fontSize: 13, color: token.colorTextSecondary }}>
          {selectedRowKeys.length > 0 ? (
            <span>Đã chọn <strong>{selectedRowKeys.length}</strong> / {tasks.length} tác vụ</span>
          ) : (
            <span>Hiển thị <strong>{tasks.length}</strong> tác vụ</span>
          )}
        </div>
        <Space size="middle">
          {/* Global sort applies to the pre-sorted dataSource; per-column sorter clicks override for that render. */}
          <span style={{ color: token.colorTextSecondary, fontSize: 13 }}>
            Sắp xếp theo
          </span>
          <Select
            size="middle"
            style={{ width: 200 }}
            value={globalSort ?? DEFAULT_TASK_SORT}
            onChange={(v) => onGlobalSortChange?.(v)}
            options={[...TASK_SORT_OPTIONS]}
            aria-label="Sắp xếp danh sách tác vụ"
          />
          <Popover
            content={columnCustomizationContent}
            title={null}
            trigger="click"
            placement="bottomRight"
          >
            <Tooltip title="Cột hiển thị">
              <Button
                icon={<SettingOutlined />}
                aria-label="Cột hiển thị"
              >
                Tùy biến cột
              </Button>
            </Tooltip>
          </Popover>
          <Button
            type="primary"
            icon={<CopyOutlined />}
            onClick={handleCopyStandup}
            aria-label="Sao chép Standup"
          >
            Sao chép Standup
          </Button>
        </Space>
      </div>

      <Table
        rowKey="id"
        columns={activeColumns}
        dataSource={tasks}
        loading={loading}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          showSizeChanger: true,
          pageSizeOptions: ['10', '25', '50', '100'],
          showTotal: (total, range) => `${range[0]}-${range[1]} / ${total} tác vụ`,
          hideOnSinglePage: false,
          onChange: (current, pageSize) => {
            setPagination((prev) => ({
              current: pageSize !== prev.pageSize ? 1 : current,
              pageSize,
            }));
          },
        }}
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

      {/* Fallback modal for clipboard copy in non-secure or restricted contexts */}
      <Modal
        title="Sao chép báo cáo Standup"
        open={standupFallbackModalOpen}
        onCancel={() => setStandupFallbackModalOpen(false)}
        footer={[
          <Button key="close" type="primary" onClick={() => setStandupFallbackModalOpen(false)}>
            Đóng
          </Button>,
        ]}
      >
        <p style={{ fontSize: 13, color: token.colorTextSecondary, marginBottom: 8 }}>
          Trình duyệt không hỗ trợ sao chép tự động hoặc chưa được cấp quyền. Vui lòng nhấn <strong>Ctrl+C</strong> (hoặc <strong>Cmd+C</strong>) để sao chép nội dung bên dưới:
        </p>
        <Input.TextArea
          ref={fallbackTextareaRef as unknown as React.Ref<any>}
          value={standupFallbackText}
          readOnly
          rows={10}
          style={{ fontFamily: 'monospace', fontSize: 12 }}
          onFocus={(e) => e.target.select()}
        />
      </Modal>
    </div>
  );
};
