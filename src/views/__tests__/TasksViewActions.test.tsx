import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { message } from 'antd';
import { TasksView } from '../TasksView';

const mocks = vi.hoisted(() => ({
  startTimer: vi.fn().mockResolvedValue(undefined),
  pauseTimer: vi.fn().mockResolvedValue(undefined),
  getTimerForTask: vi.fn(),
  canAdd: true,
}));
vi.mock('dexie-react-hooks', () => ({ useLiveQuery: () => undefined }));
vi.mock('../../hooks/useTimer', () => ({ useTimer: () => mocks }));
vi.mock('../../hooks/useKeyboardShortcuts', () => ({ useKeyboardShortcuts: () => {} }));
vi.mock('../../hooks/useTaskFilters', () => ({
  useTaskFilters: () => ({
    filters: { hierarchyScope: 'all', horizon: 'all', statuses: [], priorities: [] },
    filteredTasks: [{ id: 'task-1', name: 'Selected task', status: 'Open' }],
    setFilter: vi.fn(), setFilters: vi.fn(), resetFilters: vi.fn(), setGlobalSort: vi.fn(),
    activeFilterCount: 0,
  }),
}));
vi.mock('../../components/tasks/QuickAddBar', () => ({
  QuickAddBar: ({ inputRef }: any) => <input aria-label="Quick add test" disabled={!mocks.canAdd} ref={(node) => {
    inputRef.current = node ? { input: node, focus: () => node.focus() } : null;
  }} />,
}));
vi.mock('../../components/tasks/TaskTable', () => ({
  TaskTable: ({ onSelectRows }: any) => <button onClick={() => onSelectRows(['task-1'])}>Select task</button>,
}));
vi.mock('../../components/tasks/TaskFilterBar', () => ({ TaskFilterBar: () => null }));
vi.mock('../../components/tasks/BatchActionBar', () => ({ BatchActionBar: () => null }));
vi.mock('../../components/tasks/TaskDrawer', () => ({ TaskDrawer: () => null }));
vi.mock('../../components/planner/FeasibilityModal', () => ({ FeasibilityModal: () => null }));

function toggleTimer() {
  const event = new CustomEvent('taskmate:toggle-timer', { cancelable: true });
  fireEvent(window, event);
  expect(event.defaultPrevented).toBe(true);
}

describe('TasksView workbench actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canAdd = true;
    mocks.getTimerForTask.mockReturnValue(undefined);
  });

  it('focuses quick add on initial and repeated requests', () => {
    const { rerender } = render(<TasksView quickAddRequest="first" />);
    expect(screen.getByRole('textbox', { name: 'Quick add test' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Select task' }));
    screen.getByRole('button', { name: 'Select task' }).focus();
    rerender(<TasksView quickAddRequest="second" />);
    expect(screen.getByRole('textbox', { name: 'Quick add test' })).toHaveFocus();
  });

  it('explains missing CR instead of silently focusing a disabled input', () => {
    mocks.canAdd = false;
    const info = vi.spyOn(message, 'info').mockImplementation(() => undefined as any);
    render(<TasksView quickAddRequest="first" />);
    expect(info).toHaveBeenCalledWith('Chọn CR trước khi thêm tác vụ.');
    info.mockRestore();
  });

  it('explains missing task selection without starting a timer', () => {
    const info = vi.spyOn(message, 'info').mockImplementation(() => undefined as any);
    render(<TasksView />);
    toggleTimer();
    expect(info).toHaveBeenCalledWith('Chọn một tác vụ để bật/tắt bộ đếm giờ.');
    expect(mocks.startTimer).not.toHaveBeenCalled();
    info.mockRestore();
  });

  it('starts and pauses the selected task timer, then removes listener on unmount', async () => {
    const { unmount } = render(<TasksView />);
    fireEvent.click(screen.getByRole('button', { name: 'Select task' }));
    toggleTimer();
    await waitFor(() => expect(mocks.startTimer).toHaveBeenCalledWith('task-1'));
    mocks.getTimerForTask.mockReturnValue({ status: 'running' });
    toggleTimer();
    await waitFor(() => expect(mocks.pauseTimer).toHaveBeenCalledWith('task-1'));
    unmount();
    const event = new CustomEvent('taskmate:toggle-timer', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
