import React, { useState, useEffect, useRef } from 'react';
import { Table, Tag, Space, Button, Popover, Tooltip, Modal, Dropdown, Progress, Checkbox, useAntdToken, useMessage, Textarea } from '../ui';
import type { TableColumnsType } from 'antd';
import { EditOutlined, MoreOutlined, LinkOutlined, CopyOutlined, PlayCircleOutlined, PauseCircleOutlined, CheckCircleOutlined, SettingOutlined, FileTextOutlined, SyncOutlined, FolderOpenOutlined } from '../ui/icon';
import type { Task, ChangeRequest, System, TaskPriority, WorkType } from '../../types/models';
import { formatStandupSummary } from '../../utils/standup';
import { InlineStatusTag } from './InlineStatusTag';
import { InlineProgress } from './InlineProgress';
import { EmptyState } from '../common/EmptyState';
import { formatMinutes, formatElapsedTicker } from '../../utils/time';
import { getTodayDateString } from '../../utils/date';
import { WorkTypeBadge, WORK_TYPE_CONFIG } from './WorkTypeBadge';
import { TagListDisplay } from '../common/TagListDisplay';
import { resolveInheritedTags } from '../../domain/inheritance';
import { WORK_TYPES } from '../../types/models';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { getJiraBrowseUrl } from '../../services/jira/jiraApi';
import { openDocumentLink, isLocalPath } from '../../utils/documentLinks';
import { useTimer } from '../../hooks/useTimer';
import { evaluateTaskSpentAlert } from '../../utils/timerAlerts';
import { RunGhostDevModal } from '../agents/RunGhostDevModal';
import { useTaskMenuItems } from '../../hooks/useTaskMenuItems';

export interface TaskTableProps {
  tasks: Task[];
  changeRequests: ChangeRequest[];
  systems: System[];
  selectedRowKeys: string[];
  onSelectRows: (keys: string[]) => void;
  onOpenDrawer: (taskId: string) => void;
  onSelectCr?: (crId: string) => void;
  isFiltered?: boolean;
  db?: TaskPlannerDatabase;
  loading?: boolean;
  jiraDomain?: string;
  filterBarRef?: React.RefObject<HTMLDivElement | null>;
  visibleColumns?: string[];
}

/** CR type colours fixed by UI-SPEC §7 / D-32. */
const CR_TYPE_COLORS: Record<ChangeRequest['type'], string> = {
  NEW_FEATURE: 'var(--accent)',
  ENHANCEMENT: 'var(--success)',
  BUGFIX: 'var(--warning)',
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
  { key: 'name', label: 'Tên tác vụ · CR · Mốc', fixed: true, default: true },
  { key: 'status', label: 'Trạng thái', default: true },
  { key: 'priority', label: 'Độ ưu tiên', default: true },
  { key: 'workType', label: 'Loại việc', default: true },
  { key: 'opsOwners', label: 'Ops Owner', default: true },
  { key: 'businessAnalysts', label: 'Business Analyst (BA)', default: true },
  { key: 'estimateMinutes', label: 'Ước lượng', default: true },
  { key: 'timer', label: 'Đồng hồ tính giờ', default: true },
  { key: 'progress', label: 'Tiến độ', default: true },
  { key: 'deadline', label: 'Hạn', default: true },
  { key: 'actions', label: 'Thao tác', default: true },
];

/** The leading task column is fixed (UI-SPEC §7) and cannot be hidden. */
const ALWAYS_VISIBLE_COLUMNS = ['name'];

export const DEFAULT_VISIBLE_COLUMNS: string[] = ALL_CUSTOMIZABLE_COLUMNS.filter(
  (c) => c.default
).map((c) => c.key);

export const readVisibleColumns = (): string[] => {
  try {
    if (typeof window === 'undefined') return DEFAULT_VISIBLE_COLUMNS;
    const raw = localStorage.getItem(STORAGE_COLUMNS_KEY);
    if (!raw) return DEFAULT_VISIBLE_COLUMNS;
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return Array.from(
        new Set([...ALWAYS_VISIBLE_COLUMNS, ...parsed.filter((k): k is string => typeof k === 'string')])
      );
    }
  } catch (err) {
    console.warn('Failed to read task table column preferences:', err);
  }
  return DEFAULT_VISIBLE_COLUMNS;
};

export interface TaskColumnCustomizationProps {
  visibleColumns: string[];
  onChange: (keys: string[]) => void;
}

/** Column picker rendered in the command bar; toggles persist through the owner. */
export const TaskColumnCustomization: React.FC<TaskColumnCustomizationProps> = ({
  visibleColumns,
  onChange,
}) => {
  const { token } = useAntdToken();
  const toggle = (key: string, checked: boolean) => {
    if (ALWAYS_VISIBLE_COLUMNS.includes(key)) return;
    let next: string[];
    if (checked) {
      next = Array.from(new Set([...visibleColumns, key]));
    } else {
      next = visibleColumns.filter((k) => k !== key);
      for (const fixed of ALWAYS_VISIBLE_COLUMNS) {
        if (!next.includes(fixed)) next.unshift(fixed);
      }
    }
    onChange(next);
    try {
      localStorage.setItem(STORAGE_COLUMNS_KEY, JSON.stringify(next));
    } catch (err) {
      console.warn('Failed to save task table column preferences:', err);
    }
  };

  const reset = () => {
    onChange(DEFAULT_VISIBLE_COLUMNS);
    try {
      localStorage.setItem(STORAGE_COLUMNS_KEY, JSON.stringify(DEFAULT_VISIBLE_COLUMNS));
    } catch (err) {
      console.warn('Failed to reset task table column preferences:', err);
    }
  };

  return (
    <Popover
      content={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-8)', minWidth: 200, padding: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${token.colorBorderSecondary}`, paddingBottom: 6 }}>
            <strong style={{ fontSize: 13 }}>Cột hiển thị</strong>
            <Button type="link" size="small" onClick={reset} style={{ padding: 0 }}>
              Mặc định
            </Button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--island-gap)', maxHeight: 280, overflowY: 'auto' }}>
            {ALL_CUSTOMIZABLE_COLUMNS.map((col) => {
              const isFixed = Boolean(col.fixed);
              const isChecked = isFixed || visibleColumns.includes(col.key);
              return (
                <Checkbox
                  key={col.key}
                  checked={isChecked}
                  disabled={isFixed}
                  onChange={(e) => toggle(col.key, e.target.checked)}
                >
                  <span style={{ fontSize: 13 }}>{col.label}</span>
                  {isFixed && (
                    <span style={{ fontSize: 'var(--font-size-xs)', color: token.colorTextQuaternary, marginLeft: 4 }}>
                      (Cố định)
                    </span>
                  )}
                </Checkbox>
              );
            })}
          </div>
        </div>
      }
      title={null}
      trigger="click"
      placement="bottomRight"
    >
      <Tooltip title="Cột hiển thị">
        <Button size="small" icon={<SettingOutlined />} aria-label="Cột hiển thị">
          Tuỳ biến cột
        </Button>
      </Tooltip>
    </Popover>
  );
};

export const TaskTable: React.FC<TaskTableProps> = ({
  tasks,
  changeRequests,
  systems,
  selectedRowKeys,
  onSelectRows,
  onOpenDrawer,
  onSelectCr,
  isFiltered = false,
  db,
  loading = false,
  jiraDomain,
  filterBarRef,
  visibleColumns: controlledVisibleColumns,
}) => {

  const message = useMessage();
  const { token } = useAntdToken();
  const today = getTodayDateString();
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const [standupFallbackModalOpen, setStandupFallbackModalOpen] = useState(false);
  const [standupFallbackText, setStandupFallbackText] = useState('');
  const fallbackTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [ghostDevTask, setGhostDevTask] = useState<Task | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  // The filter bar pins at top:0; pin the table header just below it instead of behind it.
  // 96px is the bar's measured two-row height — fallback when ResizeObserver is absent.
  const [stickyHeaderOffset, setStickyHeaderOffset] = useState(60);
  useEffect(() => {
    const bar = filterBarRef?.current ?? document.querySelector('.tm-tasklist__deck-head');
    if (!bar || typeof ResizeObserver === 'undefined') return;
    const measure = () => setStickyHeaderOffset(Math.max(1, Math.ceil(bar.getBoundingClientRect().height)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => observer.disconnect();
  }, [filterBarRef]);

  // Synchronous localStorage initialization to prevent FOUC per D-16, T-12.2-07
  const [localVisibleColumns] = useState<string[]>(readVisibleColumns);
  const visibleColumns = controlledVisibleColumns ?? localVisibleColumns;

  const effectiveDb = db || defaultDb;
  const { getTaskMenuItems, reminderModal, modal, contextHolder } = useTaskMenuItems({ db, onOpenDrawer });
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

  // Query tasks with notes in the note feature
  const taskNotesSet = useLiveQuery(async () => {
    if (!effectiveDb || tasks.length === 0) return new Set<string>();
    const taskIds = tasks.map((t) => t.id);
    const notes = await effectiveDb.notes
      .where('entityId')
      .anyOf(taskIds)
      .filter((n) => n.entityType === 'task')
      .toArray();
    return new Set(notes.map((n) => n.entityId));
  }, [effectiveDb, tasks]) ?? new Set<string>();

  const settingsDomain = useLiveQuery(async () => {
    if (!effectiveDb) return undefined;
    const rec = await effectiveDb.settings.get('jira_domain');
    return (rec?.value as string) || undefined;
  }, [effectiveDb]);

  const effectiveJiraDomain = jiraDomain || settingsDomain;

  // Fast CR and subsystem lookup maps
  const crMap = React.useMemo(() => {
    return new Map(changeRequests.map((cr) => [cr.id, cr]));
  }, [changeRequests]);

  const systemMap = React.useMemo(() => {
    return new Map(systems.map((s) => [s.id, s]));
  }, [systems]);

  const milestoneMap = useLiveQuery(async () => {
    if (!effectiveDb) return new Map<string, string>();
    const all = await effectiveDb.crMilestones.toArray();
    return new Map(all.map((m) => [m.id, m.name]));
  }, [effectiveDb]) ?? new Map<string, string>();

  const handleCopyStandup = async () => {
    const summary = formatStandupSummary(tasks, { crMap, systemMap, todayStr: today });
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API not available');
      await navigator.clipboard.writeText(summary);
      message.success('Đã sao chép báo cáo Standup vào clipboard');
    } catch {
      setStandupFallbackText(summary);
      setStandupFallbackModalOpen(true);
      setTimeout(() => fallbackTextareaRef.current?.select(), 100);
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

  const [contextMenu, setContextMenu] = useState<{
    record: Task;
    x: number;
    y: number;
  } | null>(null);

  const columns: TableColumnsType<Task> = [
    {
      title: 'Tên tác vụ · CR · Mốc',
      dataIndex: 'name',
      key: 'name',
      width: 280,
      sorter: (a, b) => a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' }),
      sortDirections: ['ascend', 'descend'],
      render: (_, record) => {
        const linkCount = record.links?.length ?? 0;
        const hasNotes = taskNotesSet.has(record.id);
        const cr = crMap.get(record.crId);
        const milestoneName = record.milestoneId ? milestoneMap.get(record.milestoneId) : undefined;
        const system = record.systemId ? systemMap.get(record.systemId) : undefined;

        return (
          <div className="tm-tasklist__task-cell">
            <div className="tm-tasklist__task-head">
              <span
                onClick={() => onOpenDrawer(record.id)}
                className="tm-tasklist__task-name task-name-link"
              >
                {record.name}
              </span>
              {hasNotes && (
                <Tooltip title="Có ghi chú" placement="top">
                  <FileTextOutlined
                    data-testid={`task-note-indicator-${record.id}`}
                    aria-label="Có ghi chú"
                    style={{
                      color: token.colorPrimary,
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenDrawer(record.id);
                    }}
                  />
                </Tooltip>
              )}
              {record.isRecurring && (
                <Tooltip
                  title={`Lặp lại ${
                    record.recurrenceFrequency === 'daily'
                      ? 'hàng ngày'
                      : record.recurrenceFrequency === 'weekly'
                        ? 'hàng tuần'
                        : 'hàng tháng'
                  }`}
                  placement="top"
                >
                  <SyncOutlined
                    data-testid={`task-recurring-indicator-${record.id}`}
                    aria-label="Tác vụ lặp lại"
                    style={{
                      color: 'var(--accent)',
                      fontSize: 'var(--font-size-small)',
                    }}
                  />
                </Tooltip>
              )}
              {record.jiraKey && (
                <Tag
                  color="processing"
                  icon={<LinkOutlined style={{ marginRight: 4 }} />}
                  style={{ cursor: 'pointer', margin: 0, fontSize: 'var(--font-size-small)' }}
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
                  overlayStyle={{ maxWidth: 420 }}
                  content={
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--gap-8)',
                        maxWidth: 380,
                        maxHeight: 280,
                        overflowY: 'auto',
                        paddingRight: 4,
                      }}
                    >
                      {record.links?.map(({ url: link }, idx) => {
                        const local = isLocalPath(link);
                        return (
                          <a
                            key={idx}
                            href={link}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (e.altKey) {
                                void openDocumentLink(link, { quickClaude: true, notify: (kind, text, extra) => message[kind]({ content: text, ...(extra ?? {}) }), confirm: (cfg) => modal.confirm(cfg) });
                              } else {
                                void openDocumentLink(link, { notify: (kind, text, extra) => message[kind]({ content: text, ...(extra ?? {}) }), confirm: (cfg) => modal.confirm(cfg) });
                              }
                            }}
                            title={local ? 'Mở trong File Explorer' : 'Mở liên kết web'}
                            style={{
                              fontSize: 'var(--font-size-small)',
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 'var(--island-gap)',
                              lineHeight: 1.4,
                              color: token.colorLink,
                            }}
                          >
                            {local ? (
                              <FolderOpenOutlined style={{ color: '#fa8c16', flexShrink: 0, marginTop: 2 }} />
                            ) : (
                              <LinkOutlined style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
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
                    style={{ margin: 0, cursor: 'pointer', fontSize: 'var(--font-size-xs)' }}
                  >
                    🔗 {linkCount}
                  </Tag>
                </Popover>
              )}
            </div>
            <div className="tm-tasklist__meta">
              {cr ? (
                <Tag
                  className="tm-tasklist__cr-tag"
                  title={cr.name}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectCr?.(cr.id);
                  }}
                  style={{
                    margin: 0,
                    color: CR_TYPE_COLORS[cr.type],
                    cursor: onSelectCr ? 'pointer' : 'default',
                  }}
                >
                  {cr.code}
                </Tag>
              ) : (
                <Tag className="tm-tasklist__cr-tag tm-tasklist__cr-tag--generic">Chung</Tag>
              )}
              <span className="tm-tasklist__meta-milestone" title={milestoneName || 'Chưa gắn mốc'}>
                {milestoneName || 'Chưa gắn mốc'}
              </span>
              {system && (
                <span className="tm-tasklist__meta-system" title={system.name}>
                  {system.code}
                </span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      sorter: (a, b) => (STATUS_WEIGHTS[a.status] || 0) - (STATUS_WEIGHTS[b.status] || 0),
      sortDirections: ['ascend', 'descend'],
      render: (status, record) => (
        <span className="tm-tasklist__status">
          <InlineStatusTag
            taskId={record.id}
            status={status}
            estimateMinutes={record.estimateMinutes}
            db={db}
          />
        </span>
      ),
    },
    {
      title: 'Ước lượng',
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-2)', minWidth: 100 }}>
            <span style={{ fontSize: 13, color: 'var(--fg-strong)' }}>
              <strong>{formatMinutes(spentMinutes)}</strong>
              <span style={{ color: 'var(--fg-muted)' }}> / {formatMinutes(estimate)}</span>
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
      title: 'Hạn',
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
          return <span style={{ fontSize: 'var(--font-size-small)', color: 'var(--fg-muted)' }}>—</span>;
        }
        const dueClass = deadline < today ? 'tm-tasklist__due--late' : deadline === today ? 'tm-tasklist__due--today' : '';
        return <span className={`tm-tasklist__due ${dueClass}`}>{deadline}</span>;
      },
    },
    {
      title: 'Độ ưu tiên',
      dataIndex: 'priority',
      key: 'priority',
      width: 105,
      sorter: (a, b) => (PRIORITY_WEIGHTS[a.priority] || 0) - (PRIORITY_WEIGHTS[b.priority] || 0),
      sortDirections: ['ascend', 'descend'],
      render: (priority: TaskPriority) => {
        const weight = PRIORITY_WEIGHTS[priority] || 0;
        return (
          <Tooltip title={`${PRIORITY_LABELS[priority] || priority} · ${weight}/5`}>
            <span
              className="tm-tasklist__priority"
              aria-label={`Ưu tiên ${PRIORITY_LABELS[priority] || priority}/${weight}`}
            >
              {[1, 2, 3, 4, 5].map((dot) => (
                <i key={dot} className={dot <= weight ? 'on' : undefined} />
              ))}
            </span>
          </Tooltip>
        );
      },
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
      title: 'Ops Owner',
      key: 'opsOwners',
      width: 140,
      render: (_, record) => {
        const cr = crMap.get(record.crId);
        const res = resolveInheritedTags('opsOwners', record, {
          cr: cr ? { name: cr.name, opsOwners: cr.opsOwners } : undefined,
        });
        return <TagListDisplay tags={res.tags} source={res.source} originName={res.originName} />;
      },
    },
    {
      title: 'BA',
      key: 'businessAnalysts',
      width: 140,
      render: (_, record) => {
        const cr = crMap.get(record.crId);
        const res = resolveInheritedTags('businessAnalysts', record, {
          cr: cr ? { name: cr.name, businessAnalysts: cr.businessAnalysts } : undefined,
        });
        return <TagListDisplay tags={res.tags} source={res.source} originName={res.originName} />;
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
                fontSize: 'var(--font-size-small)',
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
      title: 'Thao tác',
      key: 'actions',
      width: 80,
      render: (_, record) => (
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
          <Dropdown menu={{ items: getTaskMenuItems(record) }} trigger={['click']}>
            <Button
              className="tm-tasklist__rowops"
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

  return (
    <>
      {contextHolder}
      <div
        ref={tableRef}
      data-testid="task-table-container"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{ outline: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--gap-8)' }}
    >
      {/* Countline: one compact row, no duplicate toolbar. */}
      <div className="tm-tasklist__countline">
        <div className="tm-tasklist__countline-count">
          {selectedRowKeys.length > 0 ? (
            <span>Đã chọn <strong>{selectedRowKeys.length}</strong> / {tasks.length} tác vụ</span>
          ) : (
            <span>Hiển thị <strong>{tasks.length}</strong> tác vụ</span>
          )}
        </div>
        <div className="tm-tasklist__countline-actions">
          <Button
            type="primary"
            size="small"
            icon={<CopyOutlined />}
            onClick={handleCopyStandup}
            aria-label="Sao chép Standup"
          >
            Sao chép Standup
          </Button>
          <span className="tm-tasklist__countline-hint">Sticky header · keyboard nav · testid giữ nguyên</span>
        </div>
      </div>

      {/* AntD owns header stickiness; offset clears the pinned filter bar above. */}
      <Table
        className="tm-tasklist__table"
        scroll={{ x: 'max-content' }}
        sticky={{ offsetHeader: stickyHeaderOffset }}
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
        onRow={(record) => ({
          'data-ai-context-type': 'task',
          'data-ai-context-id': record.id,
          onContextMenu: (e) => {
            e.preventDefault();
            setContextMenu({
              record,
              x: e.clientX,
              y: e.clientY,
            });
          },
        })}
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
        size="small"
      />

      {contextMenu && (
        <Dropdown
          menu={{
            items: getTaskMenuItems(contextMenu.record),
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

      {reminderModal}

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
        <Textarea
          ref={fallbackTextareaRef as unknown as React.Ref<any>}
          value={standupFallbackText}
          readOnly
          rows={10}
          autoSize={false}
          style={{ fontFamily: 'monospace', fontSize: 'var(--font-size-small)' }}
          onFocus={(e) => e.target.select()}
        />
      </Modal>

      <RunGhostDevModal
        task={ghostDevTask}
        visible={Boolean(ghostDevTask)}
        onCancel={() => setGhostDevTask(null)}
      />
      </div>
    </>
  );
};
