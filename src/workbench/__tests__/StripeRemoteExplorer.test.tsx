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

vi.mock('../toolwindows/DiagramExplorer', () => ({
  DiagramExplorer: () => <div data-testid="mock-diagram-explorer">Diagram Explorer Body</div>,
}));

vi.mock('dexie-react-hooks', () => {
  const EMPTY: never[] = [];
  return { useLiveQuery: () => EMPTY };
});

describe('Stripe Remote Git Explorer Integration (SDLC-REPO-EXP-01)', () => {
  beforeEach(() => {
    localStorage.clear();
    act(() => {
      useLayoutStore.getState().resetLayout();
    });
  });

  it('renders remote_explorer icon in Left Stripe below diagrams', () => {
    render(<WorkbenchLayout />);

    const buttons = screen.getAllByRole('button');
    const remoteExplorerBtn = screen.getByRole('button', { name: /Remote Git Explorer/i });
    expect(remoteExplorerBtn).toBeDefined();

    // Verify ordering: CR Explorer -> Docs Explorer -> Diagram Explorer -> Remote Git Explorer
    const buttonLabels = buttons.map((b) => b.getAttribute('aria-label') || '');
    const diagramIndex = buttonLabels.findIndex((label) => label.includes('Diagram Explorer'));
    const remoteIndex = buttonLabels.findIndex((label) => label.includes('Remote Git Explorer'));

    expect(diagramIndex).toBeGreaterThan(-1);
    expect(remoteIndex).toBeGreaterThan(diagramIndex);
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
