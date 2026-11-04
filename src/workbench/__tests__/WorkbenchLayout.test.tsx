import React from 'react';
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

vi.mock('../toolwindows/BottomToolWindow', () => ({
  BottomToolWindow: () => <div data-testid="mock-bottom-toolwindow">Mock Bottom Tool Window</div>,
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

  it('mounts BottomToolWindow when bottomActiveId is set', () => {
    render(<WorkbenchLayout />);

    expect(screen.queryByTestId('mock-bottom-toolwindow')).toBeNull();

    act(() => {
      useLayoutStore.getState().setToolWindowActive('bottom', 'ai_chat');
    });

    expect(screen.getByTestId('mock-bottom-toolwindow')).toBeDefined();
  });

  it('mounts RightToolWindow when rightActiveId is set', () => {
    render(<WorkbenchLayout />);

    expect(screen.queryByTestId('mock-right-toolwindow')).toBeNull();

    act(() => {
      useLayoutStore.getState().setToolWindowActive('right', 'calendar');
    });

    expect(screen.getByTestId('mock-right-toolwindow')).toBeDefined();
  });
});
