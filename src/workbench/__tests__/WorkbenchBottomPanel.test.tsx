import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { WorkbenchLayout } from '../WorkbenchLayout';
import { useLayoutStore } from '../store/layoutStore';

// Mock components that touch complex dependencies
vi.mock('../hooks/useNotifications', () => ({
  useNotifications: () => ({ activeCount: 0 }),
}));

vi.mock('../context/AIChatContext', () => ({
  useAIChat: () => ({ isOpen: false }),
}));

vi.mock('../hooks/useTimer', () => ({
  useTimer: () => ({ activeTimers: [] }),
}));

vi.mock('../components/timer/ActiveTimerWidget', () => ({
  ActiveTimerWidget: () => <div data-testid="active-timer-widget" />,
}));

vi.mock('../components/ai/InlineAISelectionBar', () => ({
  InlineAISelectionBar: () => null,
}));

vi.mock('../components/common/GlobalDiagramViewer', () => ({
  GlobalDiagramViewer: () => null,
}));

vi.mock('../search/SearchEverywhereModal', () => ({
  SearchEverywhereModal: () => null,
}));

vi.mock('../EditorArea', () => ({
  EditorArea: () => <div data-testid="editor-area-mock">Editor Area</div>,
}));

describe('WorkbenchBottomPanel Integration', () => {
  beforeEach(() => {
    act(() => {
      useLayoutStore.getState().resetLayout();
    });
  });

  it('does not render bottom tool window when bottomActiveId is null', () => {
    act(() => {
      useLayoutStore.getState().setToolWindowActive('bottom', null);
    });

    render(<WorkbenchLayout />);

    expect(screen.queryByTestId('bottom-tool-window')).not.toBeInTheDocument();
    expect(screen.getByTestId('editor-area-mock')).toBeInTheDocument();
  });

  it('renders BottomToolWindow when bottomActiveId is terminal', () => {
    act(() => {
      useLayoutStore.getState().setToolWindowActive('bottom', 'terminal');
    });

    render(<WorkbenchLayout />);

    expect(screen.getByTestId('bottom-tool-window')).toBeInTheDocument();
    expect(screen.getByTestId('bottom-tab-terminal')).toBeInTheDocument();
    expect(screen.getByTestId('bottom-tab-output')).toBeInTheDocument();
  });

  it('toggles bottom panel when StatusBar Terminal button is clicked', () => {
    render(<WorkbenchLayout />);

    const terminalBtn = screen.getByTestId('statusbar-terminal-btn');
    expect(screen.queryByTestId('bottom-tool-window')).not.toBeInTheDocument();

    // Click to open
    act(() => {
      fireEvent.click(terminalBtn);
    });

    expect(useLayoutStore.getState().bottomActiveId).toBe('terminal');
    expect(screen.getByTestId('bottom-tool-window')).toBeInTheDocument();

    // Click to close
    act(() => {
      fireEvent.click(terminalBtn);
    });

    expect(useLayoutStore.getState().bottomActiveId).toBeNull();
    expect(screen.queryByTestId('bottom-tool-window')).not.toBeInTheDocument();
  });

  it('closes bottom panel when close button on panel header is clicked', () => {
    act(() => {
      useLayoutStore.getState().setToolWindowActive('bottom', 'terminal');
    });

    render(<WorkbenchLayout />);

    expect(screen.getByTestId('bottom-tool-window')).toBeInTheDocument();

    const closeBtn = screen.getByTestId('bottom-panel-close-btn');
    act(() => {
      fireEvent.click(closeBtn);
    });

    expect(useLayoutStore.getState().bottomActiveId).toBeNull();
    expect(screen.queryByTestId('bottom-tool-window')).not.toBeInTheDocument();
  });

  it('updates panel size in store when setPanelSize is invoked', () => {
    act(() => {
      useLayoutStore.getState().setPanelSize('bottom', 42);
    });

    expect(useLayoutStore.getState().bottomPanelSize).toBe(42);
  });
});
