import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../src/db';
import { createSystem } from '../../src/db/repositories/systemRepo';
import { createChangeRequest } from '../../src/db/repositories/changeRequestRepo';
import { CRExplorer } from '../../src/workbench/toolwindows/CRExplorer';
import { useLayoutStore } from '../../src/workbench/store/layoutStore';
import { ThemeAppHolder } from '../../src/components/ui';
import type { Task } from '../../src/types/models';

/**
 * `CRExplorer` is a flat CR → Task tree: no Milestone tier, no subsystem grouping,
 * a `cr_detail` tab on CR click, an insight tab on task click, a CR context menu,
 * an empty state, and a search filter.
 */
const NOW = '2026-01-01T00:00:00.000Z';

describe('CRExplorer — CR → Task tree (ENT-NORM-04)', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase('test-cr-explorer-' + Math.random().toString(36).slice(2));
    await db.open();
    useLayoutStore.getState().resetLayout();
  });

  afterEach(async () => {
    await db.delete();
  });

  async function seed() {
    const parent = await createSystem(
      { parentId: null, name: 'SmartCard Core', code: 'SC-CORE', type: 'LOGICAL_GROUP' },
      db
    );
    const subsystem = await createSystem(
      { name: 'Card Auth API', code: 'SC-AUTH-API', parentId: parent.id, type: 'SERVICE' },
      db
    );
    const cr = await createChangeRequest(
      {
        name: 'Instant Payment',
        code: 'CR-1',
        type: 'NEW_FEATURE',
        status: 'In Progress',
        targets: [{ systemId: subsystem.id }],
      },
      db
    );
    const attached = {
      id: '11111111-1111-4111-8111-111111111111',
      crId: cr.id,
      systemId: subsystem.id,
      name: 'Attached task',
      status: 'Open',
      progress: 0,
      priority: 'Medium',
      estimateMinutes: 60,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const unattached = {
      id: '22222222-2222-4222-8222-222222222222',
      crId: cr.id,
      name: 'Unattached task',
      status: 'Open',
      progress: 0,
      priority: 'Medium',
      estimateMinutes: 30,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await db.tasks.bulkAdd([attached, unattached] as unknown as Task[]);
    return { cr, subsystem };
  }

  async function expandCr(name: string) {
    const label = await screen.findByText(name);
    const treenode = label.closest('.ant-tree-treenode') as HTMLElement;
    const switcher = treenode.querySelector('.ant-tree-switcher') as HTMLElement;
    fireEvent.click(switcher);
  }

  it('renders a CR node collapsed, with its tasks as direct children once expanded', async () => {
    await seed();
    render(<CRExplorer db={db} />);

    expect(await screen.findByText('Instant Payment')).toBeInTheDocument();
    expect(screen.queryByText('Attached task')).not.toBeInTheDocument();

    await expandCr('Instant Payment');

    expect(await screen.findByText('Attached task')).toBeInTheDocument();
    expect(await screen.findByText('Unattached task')).toBeInTheDocument();
    expect(screen.queryByText('SC-AUTH-API')).not.toBeInTheDocument();
    expect(screen.queryByText('Chung (không gắn)')).not.toBeInTheDocument();
  });

  it('renders no Milestone tier', async () => {
    await seed();
    render(<CRExplorer db={db} />);
    await screen.findByText('Instant Payment');

    expect(document.body.textContent).not.toContain('Milestone');
    expect(document.body.textContent).not.toContain('Cột mốc');
  });

  it('opens a cr_detail tab with params.changeRequestId on CR click', async () => {
    const { cr } = await seed();
    render(<CRExplorer db={db} />);

    fireEvent.click(await screen.findByText('Instant Payment'));

    await waitFor(() => {
      const tab = useLayoutStore.getState().openTabs.find((t) => t.viewType === 'cr_detail');
      expect(tab).toBeDefined();
      expect(tab?.params?.changeRequestId).toBe(cr.id);
    });
  });

  it('opens an insight tab for a task click', async () => {
    await seed();
    render(<CRExplorer db={db} />);

    await expandCr('Instant Payment');
    fireEvent.click(await screen.findByText('Attached task'));

    await waitFor(() => {
      const tab = useLayoutStore.getState().openTabs.find((t) => t.viewType === 'insight');
      expect(tab).toBeDefined();
      expect(tab?.params?.itemId).toBe('11111111-1111-4111-8111-111111111111');
    });
  });

  it('renders the CR context menu with the exact entries', async () => {
    await seed();
    render(<CRExplorer db={db} />);

    fireEvent.contextMenu(await screen.findByText('Instant Payment'), { clientX: 200, clientY: 300 });

    await waitFor(() => {
      expect(document.querySelector('.ant-dropdown-menu')).not.toBeNull();
    });
    const menu = document.querySelector('.ant-dropdown-menu') as HTMLElement;
    expect(menu.textContent).toContain('Mở CR Detail');
    expect(menu.textContent).toContain('Sửa');
    expect(menu.textContent).toContain('Xóa');
  });

  it('CR menu has SystemsExplorer parity: create CR, Git/Terminal disabled with reason', async () => {
    await seed();
    render(<ThemeAppHolder><CRExplorer db={db} /></ThemeAppHolder>);

    fireEvent.contextMenu(await screen.findByText('Instant Payment'), { clientX: 200, clientY: 300 });
    await waitFor(() => expect(document.querySelector('.ant-dropdown-menu')).not.toBeNull());
    const menu = document.querySelector('.ant-dropdown-menu') as HTMLElement;
    const labels = Array.from(menu.querySelectorAll('.ant-dropdown-menu-title-content')).map((n) => n.textContent);
    expect(labels).toEqual([
      'Mở CR Detail',
      'Tạo CR',
      'Mở Git',
      'Mở Terminal',
      'Sửa',
      'Xóa',
    ]);
    const gitItem = Array.from(menu.querySelectorAll('li')).find((n) => n.textContent?.includes('Mở Git'))!;
    expect(gitItem.getAttribute('title')).toContain('Chưa cấu hình SSH/Repo');
    expect(gitItem.className).toContain('ant-dropdown-menu-item-disabled');
  }, 30000);

  it('multi-target CR menu uses submenus and activates the selected system', async () => {
    const { cr } = await seed();
    const sysB = await createSystem(
      {
        name: 'Ledger API',
        code: 'LEDGER-API',
        parentId: null,
        type: 'SERVICE',
        sshConfigId: '33333333-3333-4333-8333-333333333333',
        remoteRepoPath: '/srv/ledger',
      },
      db
    );
    await db.changeRequests.update(cr.id, {
      targets: [
        { systemId: (await db.systems.where('code').equals('SC-AUTH-API').first())!.id },
        { systemId: sysB.id },
      ],
    });

    render(<ThemeAppHolder><CRExplorer db={db} /></ThemeAppHolder>);
    fireEvent.contextMenu(await screen.findByText('Instant Payment'), { clientX: 200, clientY: 300 });
    await waitFor(() => expect(document.querySelector('.ant-dropdown-menu')).not.toBeNull());
    fireEvent.mouseEnter(screen.getByText('Mở Git'));
    const target = await screen.findByText('LEDGER-API — Ledger API');
    fireEvent.click(target);

    await waitFor(() => {
      const state = useLayoutStore.getState();
      expect(state.activeRemoteConfigId).toBe('33333333-3333-4333-8333-333333333333');
      expect(state.activeRemoteRepoPath).toBe('/srv/ledger');
    });
  }, 30000);

  it('task leaf context menu offers shared task actions and opens insight', async () => {
    await seed();
    render(<ThemeAppHolder><CRExplorer db={db} /></ThemeAppHolder>);
    await expandCr('Instant Payment');
    const task = await screen.findByText('Attached task');
    fireEvent.contextMenu(task, { clientX: 220, clientY: 340 });

    await waitFor(() => expect(document.querySelector('.ant-dropdown-menu')).not.toBeNull());
    const menu = document.querySelector('.ant-dropdown-menu') as HTMLElement;
    expect(menu.textContent).toContain('Hỏi Trợ lý AI');
    expect(menu.textContent).toContain('Thêm nhắc nhở');
    expect(menu.textContent).toContain('Sửa tác vụ');
    expect(menu.textContent).toContain('Xóa');

    fireEvent.click(screen.getByText('Sửa tác vụ'));
    await waitFor(() => {
      const tab = useLayoutStore.getState().openTabs.find((t) => t.viewType === 'insight');
      expect(tab?.params?.itemId).toBe('11111111-1111-4111-8111-111111111111');
    });
  }, 30000);

  it('renders the zero-CR empty state with heading and CTA', async () => {
    render(<CRExplorer db={db} />);

    expect(await screen.findByText('Chưa có Change Request nào')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tạo Change Request/i })).toBeInTheDocument();
  });

  it('renders the no-tasks muted row', async () => {
    await createChangeRequest(
      { name: 'Empty CR', code: 'CR-2', type: 'BUGFIX', status: 'Open', targets: [] },
      db
    );
    render(<CRExplorer db={db} />);

    expect(await screen.findByText('Empty CR')).toBeInTheDocument();

    await expandCr('Empty CR');
    expect(await screen.findByText('Chưa có tác vụ')).toBeInTheDocument();
  });

  it('filters by CR name, CR code and task name', async () => {
    await seed();
    render(<CRExplorer db={db} />);
    await screen.findByText('Instant Payment');

    const search = screen.getByPlaceholderText('Lọc CR, tác vụ...');

    fireEvent.change(search, { target: { value: 'CR-1' } });
    expect(screen.getByText('Instant Payment')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'Attached task' } });
    expect(screen.getByText('Instant Payment')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'no-such-thing' } });
    expect(screen.queryByText('Instant Payment')).not.toBeInTheDocument();
  });
});
