import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeAppHolder } from '../../components/ui';
import { TasksView } from '../TasksView';

const mocks = vi.hoisted(() => ({
  tasks: [{ id: 'task-1', name: 'Selected task', status: 'Open' }],
}));

vi.mock('dexie-react-hooks', () => ({ useLiveQuery: () => undefined }));
vi.mock('../../hooks/useTimer', () => ({
  useTimer: () => ({
    startTimer: vi.fn().mockResolvedValue(undefined),
    pauseTimer: vi.fn().mockResolvedValue(undefined),
    getTimerForTask: vi.fn(),
  }),
}));
vi.mock('../../hooks/useKeyboardShortcuts', () => ({ useKeyboardShortcuts: () => {} }));
vi.mock('../../hooks/useTaskFilters', () => ({
  useTaskFilters: () => ({
    filters: { hierarchyScope: 'all', horizon: 'all', statuses: [], priorities: [] },
    filteredTasks: mocks.tasks,
    setFilter: vi.fn(),
    setFilters: vi.fn(),
    resetFilters: vi.fn(),
    setGlobalSort: vi.fn(),
    activeFilterCount: 0,
  }),
}));
vi.mock('../../components/tasks/QuickAddBar', () => ({
  QuickAddBar: () => (
    <input
      id="quick-add-input"
      data-shortcut-id="quick-add-input"
      aria-label="Thêm nhanh tên tác vụ và ước tính"
      readOnly
    />
  ),
}));
vi.mock('../../components/tasks/TaskFilterBar', () => ({
  TaskFilterBar: () => <div data-testid="task-filter-bar" className="tm-tasklist__filter" />,
}));
vi.mock('../../components/tasks/TaskTable', () => ({
  readVisibleColumns: () => ['name'],
  TaskTable: ({ tasks }: { tasks: unknown[] }) => (
    <div data-testid="task-table" data-task-count={tasks.length} />
  ),
}));
vi.mock('../../components/tasks/BatchActionBar', () => ({
  BatchActionBar: () => <div data-testid="batch-action-bar" className="tm-tasklist__batch" />,
}));
vi.mock('../../components/tasks/TaskDrawer', () => ({ TaskDrawer: () => null }));
vi.mock('../../components/planner/FeasibilityModal', () => ({ FeasibilityModal: () => null }));

describe('TasksView workspace chrome', () => {
  it('keeps workspace classes and all pinned testids / shortcut ids', () => {
    const { container } = render(
      <ThemeAppHolder>
        <TasksView />
      </ThemeAppHolder>
    );
    expect(container.querySelector('.tm-tasklist')).not.toBeNull();
    expect(container.querySelector('.tm-tasklist__toolstrip')).not.toBeNull();
    expect(screen.getByTestId('task-filter-bar')).toBeTruthy();
    expect(screen.getByTestId('batch-action-bar')).toBeTruthy();
    const quickAdd = screen.getByLabelText('Thêm nhanh tên tác vụ và ước tính') as HTMLInputElement;
    expect(quickAdd.id).toBe('quick-add-input');
    expect(quickAdd.dataset.shortcutId).toBe('quick-add-input');
  });

  it('passes the filtered tasks array straight to TaskTable', () => {
    render(
      <ThemeAppHolder>
        <TasksView />
      </ThemeAppHolder>
    );
    expect(screen.getByTestId('task-table').dataset.taskCount).toBe(String(mocks.tasks.length));
  });
});
