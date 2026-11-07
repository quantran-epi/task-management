import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../../src/db';
import { useLayoutStore, type EditorTab } from '../../../src/workbench/store/layoutStore';
import { getAllActions, executeAction } from '../../../src/workbench/actions/actionRegistry';
import { SystemCatalogView } from '../../../src/views/SystemCatalogView';
import { SystemDetailView } from '../../../src/views/SystemDetailView';
import { SystemTable } from '../../../src/components/systems/SystemTable';
import { SystemModal } from '../../../src/components/systems/SystemModal';
import { createSystem } from '../../../src/db/repositories/systemRepo';
import type { System } from '../../../src/types/models';

describe('LayoutStore and Navigation Systems Integration (Task 1)', () => {
  beforeEach(() => {
    useLayoutStore.getState().resetLayout();
  });

  it('accepts systems as a valid EditorViewType and can open systems tab', () => {
    const tab: EditorTab = {
      id: 'systems',
      title: 'Enterprise Systems Catalog',
      viewType: 'systems',
      closable: true,
    };

    useLayoutStore.getState().openTab(tab);
    expect(useLayoutStore.getState().activeTabId).toBe('systems');
    expect(useLayoutStore.getState().openTabs.some((t) => t.viewType === 'systems')).toBe(true);
  });

  it('allows setting leftActiveId to systems tool window', () => {
    useLayoutStore.getState().setToolWindowActive('left', 'systems');
    expect(useLayoutStore.getState().leftActiveId).toBe('systems');

    useLayoutStore.getState().toggleToolWindow('left', 'systems');
    expect(useLayoutStore.getState().leftActiveId).toBeNull();
  });

  it('registers view.toggle-systems in standard action registry', () => {
    const actions = getAllActions();
    const systemsAction = actions.find((a) => a.id === 'view.toggle-systems');
    expect(systemsAction).toBeDefined();
    expect(systemsAction?.shortcut).toBe('Alt+6');

    // Executing the action should toggle left tool window to 'systems'
    useLayoutStore.getState().setToolWindowActive('left', null);
    executeAction('view.toggle-systems');
    expect(useLayoutStore.getState().leftActiveId).toBe('systems');
  });
});

describe('SystemCatalogView, SystemTable, and SystemModal (Task 2)', () => {
  let db: TaskPlannerDatabase;

  const sampleParent: System = {
    id: 'sys-parent-1',
    name: 'SmartCard Core System',
    code: 'SC-CORE',
    parentId: null,
    type: 'LOGICAL_GROUP',
    description: 'Main banking logical system',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const sampleSubsystem: System = {
    id: 'sys-child-1',
    name: 'Card Authorization API',
    code: 'SC-AUTH-API',
    parentId: 'sys-parent-1',
    type: 'SERVICE',
    remoteRepoPath: '/data/services/smartcard-api',
    defaultBaseBranch: 'origin/main',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(async () => {
    db = new TaskPlannerDatabase('test-sys-view-' + Math.random().toString(36).slice(2));
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('SystemTable renders parent and nested subsystem with badges and monospace codes', () => {
    const onAddSubsystem = vi.fn();
    const onEditSystem = vi.fn();
    const onDeleteSystem = vi.fn();

    render(
      <SystemTable
        systems={[sampleParent, sampleSubsystem]}
        sshConfigs={[]}
        onAddSubsystem={onAddSubsystem}
        onEditSystem={onEditSystem}
        onDeleteSystem={onDeleteSystem}
      />
    );

    // Parent system verification
    expect(screen.getByText('SmartCard Core System')).toBeInTheDocument();
    expect(screen.getByText('SC-CORE')).toBeInTheDocument();
    expect(screen.getByText('Parent System')).toBeInTheDocument();

    // Subsystem verification
    expect(screen.getByText('Card Authorization API')).toBeInTheDocument();
    expect(screen.getByText('SC-AUTH-API')).toBeInTheDocument();
    expect(screen.getByText('Service')).toBeInTheDocument();
    expect(screen.getByText('/data/services/smartcard-api')).toBeInTheDocument();
  });

  it('SystemCatalogView renders empty state when no systems exist', async () => {
    render(<SystemCatalogView db={db} />);

    expect(await screen.findByText('Chưa có hệ thống nào trong danh mục')).toBeInTheDocument();
    expect(screen.getByText('Danh mục hệ thống (Enterprise Systems Catalog)')).toBeInTheDocument();
    expect(screen.getByTestId('btn-create-system')).toBeInTheDocument();
  });

  it('SystemCatalogView renders tree table when systems exist in db', async () => {
    await createSystem(
      {
        name: 'Enterprise Core Group',
        code: 'ENT-CORE',
        parentId: null,
        type: 'LOGICAL_GROUP',
      },
      db
    );

    render(<SystemCatalogView db={db} />);

    expect(await screen.findByText('Enterprise Core Group')).toBeInTheDocument();
    expect(screen.getByText('ENT-CORE')).toBeInTheDocument();
  });

  it('SystemModal handles form validation and submission for Logical Group vs Subsystem', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <SystemModal
        open={true}
        onClose={onClose}
        onSave={onSave}
        db={db}
      />
    );

    // Initial default type is LOGICAL_GROUP
    expect(screen.getByText('Tạo hệ thống mới')).toBeInTheDocument();

    // Fill form for Logical Group
    fireEvent.change(screen.getByPlaceholderText('VD: SmartCard Core API'), {
      target: { value: 'Payment Core' },
    });
    fireEvent.change(screen.getByPlaceholderText('VD: SC-API'), {
      target: { value: 'PAY-CORE' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Tạo hệ thống' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Payment Core',
          code: 'PAY-CORE',
          type: 'LOGICAL_GROUP',
          parentId: null,
        })
      );
    });
  });

  it('SystemModal renders repo path picker button for subsystems', () => {
    render(
      <SystemModal
        open={true}
        system={sampleSubsystem}
        onClose={vi.fn()}
        onSave={vi.fn()}
        db={db}
      />
    );

    expect(screen.getByPlaceholderText('VD: /data/services/smartcard-api')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Duyệt SSH.../i })).toBeInTheDocument();
  });

  it('SystemDetailView renders full system details, remote repo, and related CRs', async () => {
    const parent = await createSystem(sampleParent, db);
    const child = await createSystem({ ...sampleSubsystem, parentId: parent.id }, db);

    render(<SystemDetailView systemId={child.id} db={db} />);

    expect(await screen.findByText('Card Authorization API')).toBeInTheDocument();
    expect(screen.getByText('SC-AUTH-API')).toBeInTheDocument();
    expect(screen.getByText('/data/services/smartcard-api')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Chỉnh sửa/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tạo CR cho hệ thống này/i })).toBeInTheDocument();
  });
});
