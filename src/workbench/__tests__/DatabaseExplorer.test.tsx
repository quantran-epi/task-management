import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkbenchLayout } from '../WorkbenchLayout';
import { EditorArea } from '../EditorArea';
import { useLayoutStore } from '../store/layoutStore';
import type { TaskPlannerDatabase } from '../../db';

vi.mock('../../views/TasksView', () => ({
  TasksView: () => <div data-testid="mock-tasks-view">Mock Tasks View</div>,
}));

vi.mock('../toolwindows/CRExplorer', () => ({
  CRExplorer: () => <div data-testid="mock-cr-explorer">CR Explorer Body</div>,
}));

vi.mock('../toolwindows/DocsExplorer', () => ({
  DocsExplorer: () => <div data-testid="mock-docs-explorer">Docs Explorer Body</div>,
}));

vi.mock('../toolwindows/DatabaseExplorer', () => ({
  DatabaseExplorer: () => <div data-testid="mock-database-explorer">Database Explorer Body</div>,
}));

vi.mock('../editor/OracleObjectViewer', () => ({
  OracleObjectViewer: ({ objectName }: { objectName?: string }) => (
    <div data-testid="mock-oracle-object-viewer">Object: {objectName}</div>
  ),
}));

vi.mock('../editor/OracleSqlComposer', () => ({
  OracleSqlComposer: () => <div data-testid="mock-oracle-composer">Composer</div>,
}));

vi.mock('dexie-react-hooks', () => {
  const EMPTY: never[] = [];
  return { useLiveQuery: () => EMPTY };
});

describe('Database Explorer workbench shell', () => {
  beforeEach(() => {
    localStorage.clear();
    act(() => {
      useLayoutStore.getState().resetLayout();
    });
  });

  it('places Database Explorer directly below Remote Git Explorer in left stripe', () => {
    render(<WorkbenchLayout />);
    const labels = screen
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label') || '');
    const remoteIndex = labels.findIndex((label) => label.includes('Remote Git Explorer'));
    const dbIndex = labels.findIndex((label) => label.includes('Database Explorer'));
    expect(remoteIndex).toBeGreaterThan(-1);
    expect(dbIndex).toBe(remoteIndex + 1);
  });

  it('activates the Database Explorer left tool window', () => {
    render(<WorkbenchLayout />);
    fireEvent.click(screen.getByRole('button', { name: /Database Explorer/i }));
    expect(useLayoutStore.getState().leftActiveId).toBe('database_explorer');
    expect(screen.getByText('Database Explorer')).toBeDefined();
    expect(screen.getByTestId('mock-database-explorer')).toBeDefined();
  });

  it('renders object/composer tabs in the center editor and keeps two objects independent', () => {
    render(<EditorArea db={{} as TaskPlannerDatabase} />);
    act(() => {
      const store = useLayoutStore.getState();
      store.openTab({
        id: 'oracle|HR|TABLE|EMPLOYEES|columns',
        title: 'HR.TABLE.EMPLOYEES',
        viewType: 'oracle_object_view',
        params: { connectionId: 'c1', schema: 'HR', objectType: 'TABLE', objectName: 'EMPLOYEES', mode: 'columns' },
      });
      store.openTab({
        id: 'oracle|HR|PACKAGE|BODY_PKG|source',
        title: 'HR.PACKAGE.BODY_PKG',
        viewType: 'oracle_object_view',
        params: { connectionId: 'c1', schema: 'HR', objectType: 'PACKAGE', objectName: 'BODY_PKG', mode: 'source' },
      });
      store.openTab({
        id: 'composer:c1',
        title: 'SQL Composer',
        viewType: 'oracle_sql_composer',
        params: { connectionId: 'c1', composerId: 'composer:c1' },
      });
    });

    const tabs = useLayoutStore.getState().openTabs.filter((t) => t.viewType.startsWith('oracle_'));
    expect(tabs).toHaveLength(3);
    expect(tabs[0]?.params).toMatchObject({ schema: 'HR', objectName: 'EMPLOYEES', mode: 'columns' });
    expect(tabs[1]?.params).toMatchObject({ objectType: 'PACKAGE', objectName: 'BODY_PKG', mode: 'source' });
    act(() => useLayoutStore.getState().setActiveTabId('oracle|HR|PACKAGE|BODY_PKG|source'));
    expect(screen.getByTestId('mock-oracle-object-viewer')).toBeDefined();
    expect(screen.getByText('Object: BODY_PKG')).toBeDefined();

    act(() => useLayoutStore.getState().setActiveTabId('composer:c1'));
    expect(screen.getByTestId('mock-oracle-composer')).toBeDefined();
  });
});
