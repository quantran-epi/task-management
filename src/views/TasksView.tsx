import React, { useState, useRef, useMemo } from 'react';
import { Button, Modal, Select, Typography, message, type InputRef } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
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
import type { AppRoute } from '../types/navigation';

const { Text } = Typography;

export interface TasksViewProps {
  db?: TaskPlannerDatabase;
  onNavigate?: (route: AppRoute) => void;
  initialCrId?: string | null | undefined;
}

export const TasksView: React.FC<TasksViewProps> = ({ db = defaultDb, onNavigate, initialCrId }) => {
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [feasibilityTask, setFeasibilityTask] = useState<Task | null>(null);
  const [feasibilityOpen, setFeasibilityOpen] = useState(false);
  const [taskSelectModalOpen, setTaskSelectModalOpen] = useState(false);
  const [selectedTaskIdForFeasibility, setSelectedTaskIdForFeasibility] = useState<string | undefined>(undefined);
  const [selectedCrIdForFeasibility, setSelectedCrIdForFeasibility] = useState<string | undefined>(undefined);
  const searchInputRef = useRef<InputRef>(null);
  const quickAddInputRef = useRef<InputRef>(null);

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
    if (!activeSelectedTask) return;
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

  const handleEditTask = () => {
    if (!activeSelectedTask) return;
    handleOpenDrawer(activeSelectedTask.id);
  };

  const handleDeleteTask = () => {
    if (!activeSelectedTask) return;
    Modal.confirm({
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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

      {/* 2. Fast Task Creation Bar */}
      <QuickAddBar
        changeRequests={changeRequests}
        systems={systems}
        activeCrId={filters.crId}
        db={db}
        inputRef={quickAddInputRef}
      />

      {/* 3. Filter & Horizon Toolbar */}
      <TaskFilterBar
        filters={filters}
        onFilterChange={setFilters}
        onResetFilters={resetFilters}
        changeRequests={changeRequests}
        systems={systems}
        availableOpsOwners={availableOpsOwners}
        availableBAs={availableBAs}
        searchInputRef={searchInputRef}
      />

      {/* 3. Main Tasks Table */}
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
        onNavigate={onNavigate}
        globalSort={globalSort}
        onGlobalSortChange={setGlobalSort}
      />

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
        onNavigate={onNavigate}
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
        <div style={{ marginTop: 12, marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Text type="secondary">
            Chọn tác vụ để đánh giá công suất và xem trước phân bổ khối lượng công việc:
          </Text>

          {/* CR combobox filter */}
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
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
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              Tác vụ:
            </Text>
            <Select
              style={{ width: '100%' }}
              showSearch
              value={selectedTaskIdForFeasibility}
              onChange={setSelectedTaskIdForFeasibility}
              placeholder="Chọn một tác vụ"
              filterOption={(input, option) => {
                const search = input.toLowerCase();
                const task = tasks.find((t) => t.id === option?.value);
                if (!task) return false;
                const taskMatch = task.name.toLowerCase().includes(search);
                const cr = task.crId ? crMap.get(task.crId) : undefined;
                const crMatch = cr ? cr.name.toLowerCase().includes(search) : false;
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '2px 0' }}>
                    <Text style={{ lineHeight: 1.3 }}>{option.label}</Text>
                    {crName && (
                      <Text type="secondary" style={{ fontSize: 11, lineHeight: 1.2 }}>
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
