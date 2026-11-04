import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WorkbenchLayout } from '../WorkbenchLayout';
import { useLayoutStore } from '../store/layoutStore';
import 'fake-indexeddb/auto';

describe('WorkbenchLayout', () => {
  beforeEach(() => {
    localStorage.clear();
    useLayoutStore.getState().resetLayout();
  });

  it('renders TitleBar, Stripes, and StatusBar cleanly', () => {
    render(
      <WorkbenchLayout>
        <div data-testid="editor-content">Main Editor Canvas</div>
      </WorkbenchLayout>
    );

    // TitleBar brand and search input
    expect(screen.getByText('TaskMate')).toBeInTheDocument();
    expect(screen.getByLabelText('Search Everywhere (Double Shift / Ctrl+K)')).toBeInTheDocument();

    // Stripes
    expect(screen.getByLabelText('left tool window stripe')).toBeInTheDocument();
    expect(screen.getByLabelText('right tool window stripe')).toBeInTheDocument();
    expect(screen.getByLabelText('bottom tool window stripe')).toBeInTheDocument();

    // StatusBar
    expect(screen.getByLabelText('Workbench Status Bar')).toBeInTheDocument();

    // Content
    expect(screen.getByTestId('editor-content')).toBeInTheDocument();
  });
});
