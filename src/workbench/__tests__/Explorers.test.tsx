import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProjectExplorer } from '../toolwindows/ProjectExplorer';
import { DocsExplorer } from '../toolwindows/DocsExplorer';
import { useLayoutStore } from '../store/layoutStore';

// Mock dexie-react-hooks
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: (_fn: any, _deps: any, defaultVal: any) => {
    // Return sample data
    return defaultVal ?? [];
  },
}));

describe('Explorers Component Suite', () => {
  beforeEach(() => {
    act(() => {
      useLayoutStore.getState().resetLayout();
    });
  });

  it('renders ProjectExplorer search input and empty state when no projects', () => {
    render(<ProjectExplorer />);

    const searchInput = screen.getByPlaceholderText(/Filter projects, tasks.../i);
    expect(searchInput).toBeDefined();

    fireEvent.change(searchInput, { target: { value: 'Test' } });
    expect((searchInput as HTMLInputElement).value).toBe('Test');
  });

  it('renders DocsExplorer with search and new doc action', () => {
    render(<DocsExplorer />);

    const searchInput = screen.getByPlaceholderText(/Filter documents.../i);
    expect(searchInput).toBeDefined();

    const newDocBtn = screen.getByRole('button', { name: /New Document/i });
    expect(newDocBtn).toBeDefined();

    fireEvent.click(newDocBtn);
    const tabs = useLayoutStore.getState().openTabs;
    expect(tabs.some((t) => t.id === 'notes-new')).toBe(true);
  });
});
