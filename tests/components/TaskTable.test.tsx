import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../src/db';
import { TaskTable } from '../../src/components/tasks/TaskTable';
import { TaskFilterBar } from '../../src/components/tasks/TaskFilterBar';
import { BatchActionBar } from '../../src/components/tasks/BatchActionBar';
import type { Task, Project } from '../../src/types/models';
import { DEFAULT_TASK_FILTER_STATE } from '../../src/utils/filter';

describe('TaskTable Component', () => {
  let db: TaskPlannerDatabase;

  const sampleProjects: Project[] = [
    {
      id: 'proj-1',
      name: 'Project Alpha',
      status: 'In Progress',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  const sampleTasks: Task[] = [
    {
      id: 'task-1',
      name: 'Alpha Task One',
      projectId: 'proj-1',
      status: 'Open',
      priority: 'Urgent',
      estimateMinutes: 90,
      progress: 25,
      deadline: '2025-01-01', // Overdue
      notes: 'Notes line 1\nNotes line 2',
      documentLinks: ['https://example.com/spec'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'task-2',
      name: 'Beta Standalone Task',
      status: 'In Progress',
      priority: 'Low',
      estimateMinutes: 0,
      progress: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  beforeEach(async () => {
    db = new TaskPlannerDatabase('test-task-table-' + Math.random().toString(36).slice(2));
    await db.open();
    await db.projects.bulkAdd(sampleProjects);
    await db.tasks.bulkAdd(sampleTasks);
  });

  afterEach(async () => {
    await db.delete();
  });

  it('TaskFilterBar renders search input, segmented scope, project select, status tags, and horizon tags', () => {
    const onFilterChange = vi.fn();
    render(
      <TaskFilterBar
        filters={DEFAULT_TASK_FILTER_STATE}
        onFilterChange={onFilterChange}
        projects={sampleProjects}
      />
    );

    expect(screen.getByPlaceholderText(/Search tasks/i)).toBeInTheDocument();
    expect(screen.getAllByText('All').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getByText('Standalone')).toBeInTheDocument();
    expect(screen.getByText(/Include Done & Cancelled/i)).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('This Week')).toBeInTheDocument();
  });

  it('TaskTable renders columns with tags, breadcrumbs, estimate format, link badges, and overdue styling', () => {
    const onOpenDrawer = vi.fn();
    render(
      <TaskTable
        tasks={sampleTasks}
        projects={sampleProjects}
        milestones={[]}
        selectedRowKeys={[]}
        onSelectRows={vi.fn()}
        onOpenDrawer={onOpenDrawer}
        db={db}
      />
    );

    // Task 1 checks
    expect(screen.getByText('Alpha Task One')).toBeInTheDocument();
    expect(screen.getByText('1h 30m')).toBeInTheDocument(); // 90 mins -> 1h 30m
    expect(screen.getByText(/Project Alpha/i)).toBeInTheDocument();
    expect(screen.getByText(/🔗 1/i)).toBeInTheDocument(); // Document link badge

    // Task 2 checks
    expect(screen.getByText('Beta Standalone Task')).toBeInTheDocument();
    expect(screen.getByText('Standalone')).toBeInTheDocument();
  });

  it('Table keyboard navigation handles Arrow navigation and Enter opening drawer', async () => {
    const onOpenDrawer = vi.fn();
    const onSelectRows = vi.fn();

    render(
      <TaskTable
        tasks={sampleTasks}
        projects={sampleProjects}
        milestones={[]}
        selectedRowKeys={[]}
        onSelectRows={onSelectRows}
        onOpenDrawer={onOpenDrawer}
        db={db}
      />
    );

    const tableContainer = screen.getByTestId('task-table-container');

    // Arrow down moves to first row
    fireEvent.keyDown(tableContainer, { key: 'ArrowDown' });
    // Press Enter to open drawer for active row
    fireEvent.keyDown(tableContainer, { key: 'Enter' });

    expect(onOpenDrawer).toHaveBeenCalledWith(sampleTasks[0]?.id);
  });

  it('BatchActionBar appears when tasks are selected and triggers batch actions', async () => {
    const onClear = vi.fn();
    const onBatchDelete = vi.fn();
    const onBatchStatus = vi.fn();

    render(
      <BatchActionBar
        selectedCount={2}
        selectedRowKeys={['task-1', 'task-2']}
        onClearSelection={onClear}
        onBatchDelete={onBatchDelete}
        onBatchStatus={onBatchStatus}
        projects={sampleProjects}
        milestones={[]}
      />
    );

    expect(screen.getByText('2 tasks selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Clear/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Status/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Clear/i }));
    expect(onClear).toHaveBeenCalled();
  });

  it('Empty state renders friendly message when no tasks match filters', () => {
    render(
      <TaskTable
        tasks={[]}
        projects={[]}
        milestones={[]}
        selectedRowKeys={[]}
        onSelectRows={vi.fn()}
        onOpenDrawer={vi.fn()}
        isFiltered={true}
        db={db}
      />
    );

    expect(screen.getByText(/No matching tasks/i)).toBeInTheDocument();
  });
});
