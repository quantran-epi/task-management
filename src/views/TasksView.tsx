import React, { useState, useRef } from 'react';
import { Button, Modal, Select, Typography, type InputRef } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb } from '../db';
import { getAllProjects } from '../db/repositories/projectRepo';
import { getAllMilestones } from '../db/repositories/milestoneRepo';
import { QuickAddBar } from '../components/tasks/QuickAddBar';
import { TaskFilterBar } from '../components/tasks/TaskFilterBar';
import { TaskTable } from '../components/tasks/TaskTable';
import { BatchActionBar } from '../components/tasks/BatchActionBar';
import { TaskDrawer } from '../components/tasks/TaskDrawer';
import { FeasibilityModal } from '../components/planner/FeasibilityModal';
import { useTaskFilters } from '../hooks/useTaskFilters';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import type { TaskPlannerDatabase } from '../db';
import type { Task } from '../types/models';

const { Text } = Typography;

export interface TasksViewProps {
  db?: TaskPlannerDatabase;
}

export const TasksView: React.FC<TasksViewProps> = ({ db = defaultDb }) => {
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [feasibilityTask, setFeasibilityTask] = useState<Task | null>(null);
  const [feasibilityOpen, setFeasibilityOpen] = useState(false);
  const [taskSelectModalOpen, setTaskSelectModalOpen] = useState(false);
  const [selectedTaskIdForFeasibility, setSelectedTaskIdForFeasibility] = useState<string | undefined>(undefined);
  const searchInputRef = useRef<InputRef>(null);
  const quickAddInputRef = useRef<InputRef>(null);

  // Live queries from IndexedDB
  const tasks = useLiveQuery(() => db.tasks.toArray(), [db]) ?? [];
  const projects = useLiveQuery(() => getAllProjects(db), [db]) ?? [];
  const milestones = useLiveQuery(() => getAllMilestones(db), [db]) ?? [];

  const handleOpenFeasibility = async (task?: Task) => {
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
    filteredTasks,
    debouncedSearch,
  } = useTaskFilters(tasks);

  // Global keyboard shortcuts per D-29
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
  });

  const handleOpenDrawer = (taskId: string) => {
    setDrawerTaskId(taskId);
    setDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setDrawerOpen(false);
    setDrawerTaskId(null);
  };

  const handleSelectProject = (projectId: string) => {
    setFilter('projectId', projectId);
    setFilter('hierarchyScope', 'projects');
  };

  const isFiltered =
    Boolean(debouncedSearch) ||
    filters.hierarchyScope !== 'all' ||
    Boolean(filters.projectId) ||
    filters.horizon !== 'all' ||
    filters.statuses.length > 0 ||
    filters.priorities.length > 0 ||
    filters.includeClosed;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 1. Fast Task Creation Bar + Toolbar Action */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <QuickAddBar
            projects={projects}
            db={db}
            inputRef={quickAddInputRef}
          />
        </div>
        <Button
          icon={<ThunderboltOutlined />}
          onClick={() => handleOpenFeasibility()}
          aria-label="Tự động phân bổ"
        >
          Tự động phân bổ
        </Button>
      </div>

      {/* 2. Filter & Horizon Toolbar */}
      <TaskFilterBar
        filters={filters}
        onFilterChange={setFilters}
        projects={projects}
        searchInputRef={searchInputRef}
      />

      {/* 3. Main Tasks Table */}
      <TaskTable
        tasks={filteredTasks}
        projects={projects}
        milestones={milestones}
        selectedRowKeys={selectedRowKeys}
        onSelectRows={setSelectedRowKeys}
        onOpenDrawer={handleOpenDrawer}
        onSelectProject={handleSelectProject}
        isFiltered={isFiltered}
        db={db}
      />

      {/* 4. Floating Batch Action Bar */}
      <BatchActionBar
        selectedCount={selectedRowKeys.length}
        selectedRowKeys={selectedRowKeys}
        onClearSelection={() => setSelectedRowKeys([])}
        projects={projects}
        milestones={milestones}
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
        <div style={{ marginTop: 12, marginBottom: 8 }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            Chọn tác vụ để đánh giá công suất và xem trước phân bổ khối lượng công việc:
          </Text>
          <Select
            style={{ width: '100%' }}
            value={selectedTaskIdForFeasibility}
            onChange={setSelectedTaskIdForFeasibility}
            options={tasks.map((t) => ({
              value: t.id,
              label: `${t.name} (${t.estimateMinutes > 0 ? `${t.estimateMinutes}m` : 'chưa ước tính'})`,
            }))}
            placeholder="Chọn một tác vụ"
          />
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
