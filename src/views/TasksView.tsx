import React, { useState, useRef } from 'react';
import { type InputRef } from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb } from '../db';
import { getAllProjects } from '../db/repositories/projectRepo';
import { getAllMilestones } from '../db/repositories/milestoneRepo';
import { QuickAddBar } from '../components/tasks/QuickAddBar';
import { TaskFilterBar } from '../components/tasks/TaskFilterBar';
import { TaskTable } from '../components/tasks/TaskTable';
import { BatchActionBar } from '../components/tasks/BatchActionBar';
import { TaskDrawer } from '../components/tasks/TaskDrawer';
import { useTaskFilters } from '../hooks/useTaskFilters';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import type { TaskPlannerDatabase } from '../db';

export interface TasksViewProps {
  db?: TaskPlannerDatabase;
}

export const TasksView: React.FC<TasksViewProps> = ({ db = defaultDb }) => {
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const searchInputRef = useRef<InputRef>(null);
  const quickAddInputRef = useRef<InputRef>(null);

  // Live queries from IndexedDB
  const tasks = useLiveQuery(() => db.tasks.toArray(), [db]) ?? [];
  const projects = useLiveQuery(() => getAllProjects(db), [db]) ?? [];
  const milestones = useLiveQuery(() => getAllMilestones(db), [db]) ?? [];

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
      {/* 1. Fast Task Creation Bar */}
      <QuickAddBar
        projects={projects}
        db={db}
        inputRef={quickAddInputRef}
      />

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
    </div>
  );
};
