import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EditorArea } from '../EditorArea';
import { useLayoutStore } from '../store/layoutStore';

// Mock views so EditorArea test stays focused and fast
vi.mock('../../views/TasksView', () => ({
  TasksView: () => <div data-testid="mock-tasks-view">Mock Tasks View</div>,
}));

vi.mock('../../views/NotesView', () => ({
  NotesView: () => <div data-testid="mock-notes-view">Mock Notes View</div>,
}));

vi.mock('../../views/PlannerView', () => ({
  PlannerView: () => <div data-testid="mock-planner-view">Mock Planner View</div>,
}));

vi.mock('../../views/AnalyticsView', () => ({
  AnalyticsView: () => <div data-testid="mock-analytics-view">Mock Analytics View</div>,
}));

vi.mock('../../views/SettingsView', () => ({
  SettingsView: () => <div data-testid="mock-settings-view">Mock Settings View</div>,
}));

vi.mock('../../views/ProjectsView', () => ({
  ProjectsView: () => <div data-testid="mock-projects-view">Mock Projects View</div>,
}));

describe('EditorArea', () => {
  beforeEach(() => {
    localStorage.clear();
    act(() => {
      useLayoutStore.getState().resetLayout();
    });
  });

  it('renders tab list with default tabs and active Tasks view', () => {
    render(<EditorArea />);

    expect(screen.getByRole('tablist')).toBeDefined();
    expect(screen.getByText('Tasks')).toBeDefined();
    expect(screen.getByText('Docs')).toBeDefined();
    expect(screen.getByText('Capacity Planner')).toBeDefined();

    // Tasks view is rendered initially
    expect(screen.getByTestId('mock-tasks-view')).toBeDefined();
  });

  it('switches active tab when clicked', () => {
    render(<EditorArea />);

    const docsTab = screen.getByText('Docs');
    fireEvent.click(docsTab);

    // Notes/Docs view rendered
    expect(screen.getByTestId('mock-notes-view')).toBeDefined();
    expect(useLayoutStore.getState().activeTabId).toBe('notes');
  });

  it('closes a closable tab and switches active tab to neighbor', () => {
    render(<EditorArea />);

    // Activate planner first
    fireEvent.click(screen.getByText('Capacity Planner'));
    expect(useLayoutStore.getState().activeTabId).toBe('planner');

    // Close planner tab
    const closePlannerBtn = screen.getByLabelText('Close Capacity Planner');
    fireEvent.click(closePlannerBtn);

    // Planner tab removed
    expect(screen.queryByText('Capacity Planner')).toBeNull();
    // Switched to neighbor tab
    expect(useLayoutStore.getState().activeTabId).toBe('notes');
  });

  it('does not render close button on non-closable tab (Tasks)', () => {
    render(<EditorArea />);

    expect(screen.queryByLabelText('Close Tasks')).toBeNull();
  });

  it('enforces maximum 20 open tabs cap (T-25.4-03)', () => {
    render(<EditorArea />);

    // Add 25 tabs
    act(() => {
      for (let i = 1; i <= 25; i++) {
        useLayoutStore.getState().openTab({
          id: `tab-${i}`,
          title: `Tab ${i}`,
          viewType: 'tasks',
          closable: true,
        });
      }
    });

    const openTabs = useLayoutStore.getState().openTabs;
    expect(openTabs.length).toBeLessThanOrEqual(20);
  });
});
