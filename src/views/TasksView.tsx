import React, { useState, useRef, useMemo } from 'react';
import { Button, Modal, Select, Typography, useMessage, useTaskMateModal } from '../components/ui';
import type { InputRef } from 'antd';
import { ThunderboltOutlined } from '../components/ui/icon';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb } from '../db';
import { getAllChangeRequests } from '../db/repositories/changeRequestRepo';
import { getAllSystems } from '../db/repositories/systemRepo';
import { updateTaskStatus } from '../db/repositories/taskRepo';
import { deleteTaskWithAllocations } from '../db/repositories/cascadeRepo';
import { useTimer } from '../hooks/useTimer';
import { QuickAddBar } from '../components/tasks/QuickAddBar';
import { TaskFilterBar } from '../components/tasks/TaskFilterBar';
import { TaskTable } from '../components/tasks/TaskTable';
import { BatchActionBar } from '../components/tasks/BatchActionBar';
import { TaskDrawer } from '../components/tasks/TaskDrawer';
import { FeasibilityModal } from '../components/planner/FeasibilityModal';
import { PageHeader } from '../components/common/PageHeader';
import { useTaskFilters } from '../hooks/useTaskFilters';
import { DEFAULT_TASK_FILTER_STATE } from '../utils/filter';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import type { TaskPlannerDatabase } from '../db';
import type { Task, ChangeRequest, System } from '../types/models';
import { foldForSearch, searchIncludes } from '../utils/searchText';
import { getTodayDateString } from '../utils/date';
import '../components/tasks/tasklist-workspace.css';

const { Text } = Typography;

export interface TasksViewProps {
  db?: TaskPlannerDatabase;
  initialCrId?: string | null | undefined;
  quickAddRequest?: string | undefined;
}

export const TasksView: React.FC<TasksViewProps> = ({ db = defaultDb, initialCrId, quickAddRequest }) => {
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const message = useMessage();
  const { modal, contextHolder } = useTaskMateModal();
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [feasibilityTask, setFeasibilityTask] = useState<Task | null>(null);
  const [feasibilityOpen, setFeasibilityOpen] = useState(false);
  const [taskSelectModalOpen, setTaskSelectModalOpen] = useState(false);
  const [selectedTaskIdForFeasibility, setSelectedTaskIdForFeasibility] = useState<string | undefined>(undefined);
  const [selectedCrIdForFeasibility, setSelectedCrIdForFeasibility] = useState<string | undefined>(undefined);
  const searchInputRef = useRef<InputRef>(null);
  const quickAddInputRef = useRef<InputRef>(null);
  const filterBarRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!quickAddRequest) return;
    if (quickAddInputRef.current?.input?.disabled) {
      message.info('Chọn CR trước khi thêm tác vụ.');
    } else {
      quickAddInputRef.current?.focus();
    }
  }, [quickAddRequest]);

  // Live queries from IndexedDB
  const tasks = useLiveQuery(() => db.tasks.toArray(), [db]) ?? [];
  const changeRequests = useLiveQuery(() => getAllChangeRequests(db), [db]) ?? [];
  const systems = useLiveQuery(() => getAllSystems(db), [db]) ?? [];

  const crMap = useMemo(() => {
    return new Map<string, ChangeRequest>(changeRequests.map((cr) => [cr.id, cr]));
  }, [changeRequests]);

  const systemMap = useMemo(() => {
    return new Map<string, System>(systems.map((s) => [s.id, s]));
  }, [systems]);

  const activeTasksForFeasibility = useMemo(() => {
    return tasks
      .filter((t) => t.status !== 'Done' && t.status !== 'Cancelled')
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks]);

  const filteredTasksForFeasibility = useMemo(() => {
    if (!selectedCrIdForFeasibility) return activeTasksForFeasibility;
    return activeTasksForFeasibility.filter((t) => t.crId === selectedCrIdForFeasibility);
  }, [activeTasksForFeasibility, selectedCrIdForFeasibility]);

  // Extract distinct Ops Owners and BAs across CRs and tasks for autocomplete
  const availableOpsOwners = useMemo(() => {
    const set = new Set<string>();
    for (const cr of changeRequests) cr.opsOwners?.forEach((o) => set.add(o));
    for (const t of tasks) t.opsOwners?.forEach((o) => set.add(o));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [changeRequests, tasks]);

  const availableBAs = useMemo(() => {
    const set = new Set<string>();
    for (const cr of changeRequests) cr.businessAnalysts?.forEach((b) => set.add(b));
    for (const t of tasks) t.businessAnalysts?.forEach((b) => set.add(b));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [changeRequests, tasks]);

  const handleOpenFeasibility = async (task?: Task) => {
    setSelectedCrIdForFeasibility(undefined);
    if (task) {
      setFeasibilityTask(task);
      setFeasibilityOpen(true);
      return;
    }
    if (selectedRowKeys.length === 1) {
      const selectedTask = tasks.find((t) => t.id === selectedRowKeys[0]);
      if (selectedTask) {
        setFeasibilityTask(selectedTask);
        setFeasibilityOpen(true);
        return;
      }
    }
    const all = await db.tasks.toArray();
    const active = all
      .filter((t) => t.status !== 'Done' && t.status !== 'Cancelled')
      .sort((a, b) => a.name.localeCompare(b.name));
    const tasksWithEst = active.filter((t) => t.estimateMinutes > 0);
    if (tasksWithEst.length === 1) {
      setFeasibilityTask(tasksWithEst[0]!);
      setFeasibilityOpen(true);
    } else if (tasksWithEst.length > 1) {
      setSelectedTaskIdForFeasibility(tasksWithEst[0]?.id);
      setTaskSelectModalOpen(true);
    } else if (tasks.length > 0) {
      setSelectedTaskIdForFeasibility(tasks[0]?.id);
      setTaskSelectModalOpen(true);
    }
  };

  // Filtering & sorting pipeline
  const {
    filters,
    setFilter,
    setFilters,
    resetFilters,
    filteredTasks,
    debouncedSearch,
    activeFilterCount,
    globalSort,
    setGlobalSort,
  } = useTaskFilters({ tasks, changeRequests, systems, db });

  // Sync initialCrId prop from editor tab or caller
  React.useEffect(() => {
    if (initialCrId !== undefined) {
      setFilter('crId', initialCrId);
    }
  }, [initialCrId]);

  const { getTimerForTask, startTimer, pauseTimer } = useTimer();

  // Selected task resolution for keyboard shortcuts
  const activeSelectedTask = useMemo(() => {
    if (selectedRowKeys.length === 0) return null;
    return filteredTasks.find((t) => t.id === selectedRowKeys[0]) ?? null;
  }, [selectedRowKeys, filteredTasks]);

  const handleNextTask = () => {
    if (filteredTasks.length === 0) return;
    const currentIndex = activeSelectedTask
      ? filteredTasks.findIndex((t) => t.id === activeSelectedTask.id)
      : -1;
    const nextIndex = currentIndex < filteredTasks.length - 1 ? currentIndex + 1 : 0;
    const nextTask = filteredTasks[nextIndex];
    if (nextTask) {
      setSelectedRowKeys([nextTask.id]);
    }
  };

  const handlePrevTask = () => {
    if (filteredTasks.length === 0) return;
    const currentIndex = activeSelectedTask
      ? filteredTasks.findIndex((t) => t.id === activeSelectedTask.id)
      : -1;
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : filteredTasks.length - 1;
    const prevTask = filteredTasks[prevIndex];
    if (prevTask) {
      setSelectedRowKeys([prevTask.id]);
    }
  };

  const handleToggleStatus = async () => {
    if (!activeSelectedTask) return;
    const newStatus = activeSelectedTask.status === 'Done' ? 'Open' : 'Done';
    try {
      await updateTaskStatus(activeSelectedTask.id, newStatus, db);
      message.success(`Đã chuyển trạng thái: ${newStatus === 'Done' ? 'Hoàn thành' : 'Mở'}`);
    } catch {
      message.error('Không thể cập nhật trạng thái');
    }
  };

  const handleToggleTimer = async () => {
    if (!activeSelectedTask) {
      message.info('Chọn một tác vụ để bật/tắt bộ đếm giờ.');
      return;
    }
    const timer = getTimerForTask(activeSelectedTask.id);
    const isRunning = timer?.status === 'running';
    try {
      if (isRunning) {
        await pauseTimer(activeSelectedTask.id);
        message.info('Đã tạm dừng đếm giờ');
      } else {
        await startTimer(activeSelectedTask.id);
        message.success('Đã bắt đầu đếm giờ');
      }
    } catch {
      message.error('Không thể điều khiển bộ đếm giờ');
    }
  };

  React.useEffect(() => {
    const handleTimerAction = (event: Event) => {
      event.preventDefault();
      void handleToggleTimer();
    };
    window.addEventListener('taskmate:toggle-timer', handleTimerAction);
    return () => window.removeEventListener('taskmate:toggle-timer', handleTimerAction);
  }, [activeSelectedTask, getTimerForTask, startTimer, pauseTimer]);

  const handleEditTask = () => {
    if (!activeSelectedTask) return;
    handleOpenDrawer(activeSelectedTask.id);
  };

  const handleDeleteTask = () => {
    if (!activeSelectedTask) return;
    modal.confirm({
      title: 'Xóa tác vụ',
      content: `Bạn có chắc muốn xóa tác vụ "${activeSelectedTask.name}" không?`,
      okText: 'Xóa',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: async () => {
        try {
          await deleteTaskWithAllocations(activeSelectedTask.id, db);
          setSelectedRowKeys((prev) => prev.filter((id) => id !== activeSelectedTask.id));
          message.success('Đã xóa tác vụ');
        } catch {
          message.error('Không thể xóa tác vụ');
        }
      },
    });
  };

  // Keyboard shortcuts per D-29 and multi-key enhancements
  useKeyboardShortcuts({
    onSearch: () => {
      searchInputRef.current?.focus();
    },
    onQuickAdd: () => {
      quickAddInputRef.current?.focus();
    },
    onEscape: () => {
      setDrawerOpen(false);
    },
    onNextTask: handleNextTask,
    onPrevTask: handlePrevTask,
    onToggleStatus: handleToggleStatus,
    onToggleTimer: handleToggleTimer,
    onEditTask: handleEditTask,
    onDeleteTask: handleDeleteTask,
  });

  const handleOpenDrawer = (taskId: string) => {
    setDrawerTaskId(taskId);
    setDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setDrawerOpen(false);
    setDrawerTaskId(null);
  };

  const handleSelectCr = (crId: string) => {
    setFilter('crId', crId);
    setFilter('hierarchyScope', 'cr');
  };

  const isFiltered =
    Boolean(debouncedSearch) ||
    filters.hierarchyScope !== 'all' ||
    Boolean(filters.crId) ||
    filters.horizon !== 'all' ||
    filters.statuses.length !== DEFAULT_TASK_FILTER_STATE.statuses.length ||
    filters.priorities.length > 0 ||
    filters.includeClosed ||
    activeFilterCount > 0;

  const today = getTodayDateString();
  const deckStats = useMemo(() => {
    const open = filteredTasks.filter((t) => t.status === 'In Progress').length;
    const late = filteredTasks.filter(
      (t) => t.deadline && t.deadline < today && t.status !== 'Done' && t.status !== 'Cancelled'
    ).length;
    return { open, late, total: filteredTasks.length };
  }, [filteredTasks, today]);

  return (
    <div className="tm-tasklist">
      {contextHolder}
      {/* 1. Page Header */}
      <PageHeader
        title="Danh sách tác vụ"
        subtitle="Quản lý công việc, phân bổ thời gian và theo dõi tiến độ"
        extra={
          <Button
            icon={<ThunderboltOutlined />}
            onClick={() => handleOpenFeasibility()}
            aria-label="Tự động phân bổ"
          >
            Tự động phân bổ
          </Button>
        }
      />

      {/* 2–3. Command strip: fast creation + filter toolbar, flush with the table */}
      <div className="tm-tasklist__toolstrip">
        <QuickAddBar
          changeRequests={changeRequests}
          systems={systems}
          activeCrId={filters.crId}
          db={db}
          inputRef={quickAddInputRef}
        />

        <TaskFilterBar
          filters={filters}
          onFilterChange={setFilters}
          onResetFilters={resetFilters}
          changeRequests={changeRequests}
          systems={systems}
          availableOpsOwners={availableOpsOwners}
          availableBAs={availableBAs}
          searchInputRef={searchInputRef}
          containerRef={filterBarRef}
        />
      </div>

      {/* 3. Dense table deck — sketch 017 winner A */}
      <section className="tm-tasklist__deck" aria-label="Bảng danh sách tác vụ">
        <div className="tm-tasklist__deck-head">
          <h2 className="tm-tasklist__deck-title">Danh sách tác vụ</h2>
          <div className="tm-tasklist__deck-stats">
            <span className="tm-tasklist__deck-stat">Đang làm <b>{deckStats.open}</b></span>
            <span className="tm-tasklist__deck-stat tm-tasklist__deck-stat--late">Quá hạn <b>{deckStats.late}</b></span>
            <span className="tm-tasklist__deck-stat">Tổng <b>{deckStats.total}</b></span>
          </div>
        </div>
        <TaskTable
          tasks={filteredTasks}
          changeRequests={changeRequests}
          systems={systems}
          selectedRowKeys={selectedRowKeys}
          onSelectRows={setSelectedRowKeys}
          onOpenDrawer={handleOpenDrawer}
          onSelectCr={handleSelectCr}
          isFiltered={isFiltered}
          db={db}
          globalSort={globalSort}
          onGlobalSortChange={setGlobalSort}
          filterBarRef={filterBarRef}
        />
      </section>

      {/* 4. Floating Batch Action Bar */}
      <BatchActionBar
        selectedCount={selectedRowKeys.length}
        selectedRowKeys={selectedRowKeys}
        onClearSelection={() => setSelectedRowKeys([])}
        changeRequests={changeRequests}
        systems={systems}
        db={db}
      />

      {/* 5. Slide-out Task Detail Drawer */}
      <TaskDrawer
        taskId={drawerTaskId}
        open={drawerOpen}
        onClose={handleCloseDrawer}
        db={db}
      />

      {/* Task Selector Modal for Feasibility */}
      <Modal
        title="Chọn tác vụ để tự động phân bổ"
        open={taskSelectModalOpen}
        onCancel={() => setTaskSelectModalOpen(false)}
        onOk={() => {
          const chosen = tasks.find((t) => t.id === selectedTaskIdForFeasibility);
          if (chosen) {
            setFeasibilityTask(chosen);
            setTaskSelectModalOpen(false);
            setFeasibilityOpen(true);
          }
        }}
        okText="Tiếp tục"
        cancelText="Hủy"
        destroyOnClose
      >
        <div style={{ marginTop: 12, marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 'var(--gap-12)' }}>
          <Text type="secondary">
            Chọn tác vụ để đánh giá công suất và xem trước phân bổ khối lượng công việc:
          </Text>

          {/* CR combobox filter */}
          <div>
            <Text type="secondary" style={{ fontSize: 'var(--font-size-small)', display: 'block', marginBottom: 4 }}>
              CR:
            </Text>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Lọc theo CR (Tất cả)"
              style={{ width: '100%' }}
              value={selectedCrIdForFeasibility}
              onChange={(newCrId) => {
                setSelectedCrIdForFeasibility(newCrId);
                const matchingTasks = !newCrId
                  ? activeTasksForFeasibility
                  : activeTasksForFeasibility.filter((t) => t.crId === newCrId);
                if (!matchingTasks.some((t) => t.id === selectedTaskIdForFeasibility)) {
                  setSelectedTaskIdForFeasibility(matchingTasks[0]?.id);
                }
              }}
              options={changeRequests.map((cr) => ({
                value: cr.id,
                label: `${cr.code} · ${cr.name}`,
              }))}
              aria-label="Lọc theo CR"
            />
          </div>

          {/* Task Select */}
          <div>
            <Text type="secondary" style={{ fontSize: 'var(--font-size-small)', display: 'block', marginBottom: 4 }}>
              Tác vụ:
            </Text>
            <Select
              style={{ width: '100%' }}
              showSearch
              value={selectedTaskIdForFeasibility}
              onChange={setSelectedTaskIdForFeasibility}
              placeholder="Chọn một tác vụ"
              filterOption={(input, option) => {
                const search = foldForSearch(input);
                const task = tasks.find((t) => t.id === option?.value);
                if (!task) return false;
                const taskMatch = searchIncludes(task.name, search);
                const cr = task.crId ? crMap.get(task.crId) : undefined;
                const crMatch = cr ? searchIncludes(cr.name, search) : false;
                return taskMatch || crMatch;
              }}
              options={filteredTasksForFeasibility.map((t) => {
                const cr = t.crId ? crMap.get(t.crId) : undefined;
                const system = t.systemId ? systemMap.get(t.systemId) : undefined;
                return {
                  value: t.id,
                  label: `${t.name} (${t.estimateMinutes > 0 ? `${t.estimateMinutes}m` : 'chưa ước tính'})`,
                  crName: cr ? `${cr.code}${system ? ` · ${system.code}` : ''}` : undefined,
                };
              })}
              optionRender={(option) => {
                const crName = (option.data as { crName?: string } | undefined)?.crName;
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-2)', padding: '2px 0' }}>
                    <Text style={{ lineHeight: 1.3 }}>{option.label}</Text>
                    {crName && (
                      <Text type="secondary" style={{ fontSize: 'var(--font-size-xs)', lineHeight: 1.2 }}>
                        {crName}
                      </Text>
                    )}
                  </div>
                );
              }}
            />
          </div>
        </div>
      </Modal>

      {/* Feasibility & Workload Distribution Modal */}
      <FeasibilityModal
        open={feasibilityOpen}
        task={feasibilityTask ?? undefined}
        onCancel={() => setFeasibilityOpen(false)}
        onSuccess={() => setFeasibilityOpen(false)}
        db={db}
      />
    </div>
  );
};
