import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkbenchLayout } from '../WorkbenchLayout';
import { useLayoutStore } from '../store/layoutStore';

// Mock views and child components to isolate WorkbenchLayout
vi.mock('../../views/TasksView', () => ({
  TasksView: () => <div data-testid="mock-tasks-view">Mock Tasks View</div>,
}));

vi.mock('../toolwindows/LeftToolWindow', () => ({
  LeftToolWindow: () => <div data-testid="mock-left-toolwindow">Mock Left Tool Window</div>,
}));

vi.mock('../toolwindows/RightToolWindow', () => ({
  RightToolWindow: () => <div data-testid="mock-right-toolwindow">Mock Right Tool Window</div>,
}));

describe('WorkbenchLayout Integration', () => {
  beforeEach(() => {
    localStorage.clear();
    act(() => {
      useLayoutStore.getState().resetLayout();
    });
  });

  it('mounts default LeftToolWindow and EditorArea', () => {
    render(<WorkbenchLayout />);

    // Left is active by default ('projects')
    expect(screen.getByTestId('mock-left-toolwindow')).toBeDefined();
    // Center Editor Area with Tasks view
    expect(screen.getByTestId('mock-tasks-view')).toBeDefined();
  });

  it('mounts RightToolWindow when rightActiveId is set to ai_chat', () => {
    render(<WorkbenchLayout />);

    expect(screen.queryByTestId('mock-right-toolwindow')).toBeNull();

    act(() => {
      useLayoutStore.getState().setToolWindowActive('right', 'ai_chat');
    });

    expect(screen.getByTestId('mock-right-toolwindow')).toBeDefined();
  });

  it('opens SearchEverywhereModal when search button in TitleBar is clicked', () => {
    render(<WorkbenchLayout />);

    expect(screen.queryByRole('dialog', { name: 'Search Everywhere' })).toBeNull();

    const searchBtn = screen.getByRole('button', { name: /Search Everywhere/i });
    fireEvent.click(searchBtn);

    expect(screen.getByRole('dialog', { name: 'Search Everywhere' })).toBeDefined();
  });

  it('opens quick view tabs when clicked in TitleBar', () => {
    render(<WorkbenchLayout />);

    const plannerBtn = screen.getByRole('button', { name: /Open Capacity Planner/i });
    fireEvent.click(plannerBtn);

    const openTabs = useLayoutStore.getState().openTabs;
    expect(openTabs.some((t) => t.id === 'planner')).toBe(true);
  });
});
