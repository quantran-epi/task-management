import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkbenchLayout } from '../WorkbenchLayout';
import { useLayoutStore } from '../store/layoutStore';

// Mock views and heavy sub-components
vi.mock('../../views/TasksView', () => ({
  TasksView: () => <div data-testid="mock-tasks-view">Mock Tasks View</div>,
}));

vi.mock('../toolwindows/CRExplorer', () => ({
  CRExplorer: () => <div data-testid="mock-cr-explorer">CR Explorer Body</div>,
}));

vi.mock('../toolwindows/DocsExplorer', () => ({
  DocsExplorer: () => <div data-testid="mock-docs-explorer">Docs Explorer Body</div>,
}));

vi.mock('dexie-react-hooks', () => {
  const EMPTY: never[] = [];
  return { useLiveQuery: () => EMPTY };
});

describe('Stripe Remote Git Explorer Integration', () => {
  beforeEach(() => {
    localStorage.clear();
    act(() => {
      useLayoutStore.getState().resetLayout();
    });
  });

  it('renders remote_explorer icon in Left Stripe below docs', () => {
    render(<WorkbenchLayout />);

    const buttons = screen.getAllByRole('button');
    const remoteExplorerBtn = screen.getByRole('button', { name: /Remote Git Explorer/i });
    expect(remoteExplorerBtn).toBeDefined();

    // Verify ordering: CR Explorer -> Docs Explorer -> Systems Explorer -> Remote Git Explorer
    const buttonLabels = buttons.map((b) => b.getAttribute('aria-label') || '');
    const docsIndex = buttonLabels.findIndex((label) => label.includes('Docs Explorer'));
    const remoteIndex = buttonLabels.findIndex((label) => label.includes('Remote Git Explorer'));
    const terminalIndex = buttonLabels.findIndex((label) => label.includes('Terminal'));

    expect(docsIndex).toBeGreaterThan(-1);
    expect(remoteIndex).toBeGreaterThan(docsIndex);
    expect(terminalIndex).toBeGreaterThan(remoteIndex);
    // Diagram Explorer merged into Docs Explorer (Phase: unify notes tree)
    expect(screen.queryByRole('button', { name: /Diagram Explorer/i })).toBeNull();
  });

  it('toggles leftActiveId to remote_explorer when clicked and renders Left Tool Window header', () => {
    render(<WorkbenchLayout />);

    const remoteExplorerBtn = screen.getByRole('button', { name: /Remote Git Explorer/i });
    fireEvent.click(remoteExplorerBtn);

    expect(useLayoutStore.getState().leftActiveId).toBe('remote_explorer');
    expect(screen.getByText('Remote Git Explorer')).toBeDefined();
    expect(screen.getByTestId('remote-git-explorer')).toBeDefined();

    // Clicking again collapses
    fireEvent.click(remoteExplorerBtn);
    expect(useLayoutStore.getState().leftActiveId).toBeNull();
  });
});
