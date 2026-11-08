import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { CRExplorer } from '../toolwindows/CRExplorer';
import { DocsExplorer } from '../toolwindows/DocsExplorer';
import { useLayoutStore } from '../store/layoutStore';

// Mock dexie-react-hooks. The value must be referentially stable: DocsExplorer's
// publish-status effect depends on `allNotes`, and its `useLiveQuery` default is an inline
// `[]` literal — returning that would hand back a fresh array every render and loop forever.
vi.mock('dexie-react-hooks', () => {
  const EMPTY: never[] = [];
  return { useLiveQuery: () => EMPTY };
});

describe('Explorers Component Suite', () => {
  beforeEach(() => {
    act(() => {
      useLayoutStore.getState().resetLayout();
    });
  });

  it('renders CRExplorer search input and new-CR action', () => {
    render(<CRExplorer />);

    const searchInput = screen.getByPlaceholderText(/Lọc CR, tác vụ.../i);
    expect(searchInput).toBeDefined();

    fireEvent.change(searchInput, { target: { value: 'Test' } });
    expect((searchInput as HTMLInputElement).value).toBe('Test');

    expect(screen.getByTestId('cr-explorer-btn-new-cr')).toBeDefined();
  });

  it('renders DocsExplorer with search and new doc action', async () => {
    render(<DocsExplorer />);

    expect(screen.getByPlaceholderText(/Tìm kiếm tài liệu/i)).toBeDefined();

    const newDocBtn = screen.getByRole('button', { name: /Tạo tài liệu/i });
    expect(newDocBtn).toBeDefined();

    fireEvent.click(newDocBtn);
    await waitFor(() => {
      const tabs = useLayoutStore.getState().openTabs;
      expect(tabs.some((t) => t.viewType === 'notes')).toBe(true);
    });
  });
});
