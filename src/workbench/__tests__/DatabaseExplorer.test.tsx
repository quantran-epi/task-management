import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
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

import { DatabaseExplorer } from '../toolwindows/DatabaseExplorer';
import * as oracleService from '../../services/ai/oracleSqlclService';

vi.mock('../../services/ai/oracleSqlclService', async (importOriginal) => {
  const actual = await importOriginal<typeof oracleService>();
  return {
    ...actual,
    getOracleConnectionProfiles: vi.fn(async () => [
      {
        id: 'c1', name: 'Main SIT', environment: 'SIT', isActive: true,
        sshConfigId: 'ssh-1', connectionString: 'user/pass@secret-host:1521/SIT',
      },
    ]),
    executeOracleDescribe: vi.fn(async (args: any) =>
      JSON.stringify({
        success: true,
        action: args.action,
        data:
          args.action === 'list_schemas'
            ? [{ username: 'HR' }]
            : [{ owner: 'HR', object_name: 'EMPLOYEES', object_type: 'TABLE' }],
      })
    ),
  };
});

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

  it('hides Database Explorer from the left stripe while keeping the other entries', () => {
    render(<WorkbenchLayout />);
    expect(screen.queryAllByRole('button', { name: /Database Explorer/i })).toHaveLength(0);
    for (const name of [
      /CR Explorer/i,
      /Docs Explorer/i,
      /Systems Explorer/i,
      /Remote Git Explorer/i,
    ]) {
      expect(screen.getByRole('button', { name })).toBeDefined();
    }
  });

  it('loads tree lazily on expand, caches branches, and opens object tabs without leaking credentials', async () => {
    const describe = oracleService.executeOracleDescribe as any;
    describe.mockClear();
    render(<DatabaseExplorer />);
    await waitFor(() => expect(screen.getByText('Main SIT (SIT)')).toBeDefined());
    expect(describe).not.toHaveBeenCalled(); // lazy: no metadata fetch at mount
    // Debug: print switcher HTML on failure of next assertion.

    const root = screen.getByText('Main SIT (SIT)').closest('.ant-tree-treenode')!;
    const switcher = root.querySelector('.ant-tree-switcher')!;
    expect(switcher.className).toContain('ant-tree-switcher_close');
    fireEvent.click(switcher, { bubbles: true });
    await waitFor(() => expect(describe.mock.calls.map((c: any[]) => c[0]?.action)).toContain('list_schemas'), { timeout: 1000 });
    expect(describe).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText('HR')).toBeDefined());

    fireEvent.click(root.querySelector('.ant-tree-switcher')!); // collapse
    fireEvent.click(root.querySelector('.ant-tree-switcher')!); // expand again
    await waitFor(() => expect(screen.getByText('HR')).toBeDefined());
    expect(describe).toHaveBeenCalledTimes(1); // cache hit

    const schema = screen.getByText('HR').closest('.ant-tree-treenode')!;
    fireEvent.click(schema.querySelector('.ant-tree-switcher')!);
    await waitFor(() => expect(describe.mock.calls.map((c: any[]) => c[0]?.action)).toContain('list_objects'));
    await waitFor(() => expect(screen.getByText('TABLE')).toBeDefined());

    const type = screen.getByText('TABLE').closest('.ant-tree-treenode')!;
    fireEvent.click(type.querySelector('.ant-tree-switcher')!);
    await waitFor(() => expect(screen.getByText('EMPLOYEES')).toBeDefined());
    fireEvent.click(screen.getByText('EMPLOYEES'));

    const tab = useLayoutStore.getState().openTabs.find((t) => t.viewType === 'oracle_object_view');
    expect(tab?.params).toMatchObject({
      connectionId: 'c1', schema: 'HR', objectType: 'TABLE', objectName: 'EMPLOYEES', mode: 'ddl',
    });
    expect(document.body.textContent).not.toContain('pass@secret-host');

    fireEvent.click(screen.getByRole('button', { name: /SQL Composer/i }));
    const composer = useLayoutStore.getState().openTabs.find((t) => t.viewType === 'oracle_sql_composer');
    expect(composer?.params).toMatchObject({ composerId: 'composer:active' });
  });

  it('renders schema and object names from lowercase SQLcl result keys', async () => {
    // The default mock above already returns lowercase keys, matching real SQLcl output.
    render(<DatabaseExplorer />);
    await waitFor(() => expect(screen.getByText('Main SIT (SIT)')).toBeDefined());
    fireEvent.click(screen.getByText('Main SIT (SIT)').closest('.ant-tree-treenode')!.querySelector('.ant-tree-switcher')!);
    await waitFor(() => expect(screen.getByText('HR')).toBeDefined());
    const schema = screen.getByText('HR').closest('.ant-tree-treenode')!;
    fireEvent.click(schema.querySelector('.ant-tree-switcher')!);
    await waitFor(() => expect(screen.getByText('TABLE')).toBeDefined());
    const type = screen.getByText('TABLE').closest('.ant-tree-treenode')!;
    fireEvent.click(type.querySelector('.ant-tree-switcher')!);
    await waitFor(() => expect(screen.getByText('EMPLOYEES')).toBeDefined());
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
