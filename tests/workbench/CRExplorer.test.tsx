import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../src/db';
import { createSystem } from '../../src/db/repositories/systemRepo';
import { createChangeRequest } from '../../src/db/repositories/changeRequestRepo';
import { CRExplorer } from '../../src/workbench/toolwindows/CRExplorer';
import { useLayoutStore } from '../../src/workbench/store/layoutStore';
import type { Task } from '../../src/types/models';

/**
 * Wave 0 contract for plan 31.2-06 Task 2 (ENT-NORM-04, D-29/D-31).
 *
 * `CRExplorer` becomes a real CR → Subsystem pill → Task tree: no Milestone tier, a
 * `cr_detail` tab on CR click, an `sdlc` tab on pill click, both context menus, three empty
 * states, and a search filter. Today the module is a 3-line re-export of `ProjectExplorer`,
 * so these assertions are RED — that is the intended state, not a collection error.
 */
const NOW = '2026-01-01T00:00:00.000Z';

describe('CRExplorer — CR → Subsystem → Task tree (ENT-NORM-04)', () => {
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
      { name: 'SmartCard Core', code: 'SC-CORE', type: 'LOGICAL_GROUP' },
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
    // `crId`/`systemId` are the post-normalization Task shape (plan 01); the current Task
    // type still carries `projectId`, so the fixture is asserted into place rather than
    // widening the production type from a Wave 0 test.
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

  it('renders a CR node, a subsystem pill, and tasks split by systemId', async () => {
    await seed();
    render(<CRExplorer db={db} />);

    expect(await screen.findByText('Instant Payment')).toBeInTheDocument();
    expect(await screen.findByText('SC-AUTH-API')).toBeInTheDocument();
    expect(await screen.findByText('Attached task')).toBeInTheDocument();
    expect(await screen.findByText('Chung (không gắn)')).toBeInTheDocument();
    expect(await screen.findByText('Unattached task')).toBeInTheDocument();
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

  it('opens an sdlc tab with params.systemId on subsystem pill click', async () => {
    const { cr, subsystem } = await seed();
    render(<CRExplorer db={db} />);

    fireEvent.click(await screen.findByText('SC-AUTH-API'));

    await waitFor(() => {
      const tab = useLayoutStore.getState().openTabs.find((t) => t.viewType === 'sdlc');
      expect(tab).toBeDefined();
      expect(tab?.params?.changeRequestId).toBe(cr.id);
      expect(tab?.params?.systemId).toBe(subsystem.id);
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
    expect(menu.textContent).toContain('Mở SDLC Studio');
    expect(menu.textContent).toContain('Sửa');
    expect(menu.textContent).toContain('Xóa');
  });

  it('renders the subsystem context menu with the exact entries', async () => {
    await seed();
    render(<CRExplorer db={db} />);

    fireEvent.contextMenu(await screen.findByText('SC-AUTH-API'), { clientX: 200, clientY: 300 });

    await waitFor(() => {
      expect(document.querySelector('.ant-dropdown-menu')).not.toBeNull();
    });
    const menu = document.querySelector('.ant-dropdown-menu') as HTMLElement;
    expect(menu.textContent).toContain('Mở Git Explorer');
    expect(menu.textContent).toContain('Mở SSH Terminal');
    expect(menu.textContent).toContain('Mở SDLC tại subsystem này');
    expect(menu.textContent).toContain('Gỡ khỏi CR');
  });

  it('renders the zero-CR empty state with heading and CTA', async () => {
    render(<CRExplorer db={db} />);

    expect(await screen.findByText('Chưa có Change Request nào')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tạo Change Request/i })).toBeInTheDocument();
  });

  it('renders the no-targets and no-tasks muted rows', async () => {
    await createChangeRequest(
      { name: 'Empty CR', code: 'CR-2', type: 'BUGFIX', status: 'Open', targets: [] },
      db
    );
    render(<CRExplorer db={db} />);

    expect(await screen.findByText('Empty CR')).toBeInTheDocument();
    expect(screen.getByText('Chưa gắn subsystem')).toBeInTheDocument();
    expect(screen.getByText('Chưa có tác vụ')).toBeInTheDocument();
  });

  it('filters by CR name, CR code, subsystem code and task name', async () => {
    await seed();
    render(<CRExplorer db={db} />);
    await screen.findByText('Instant Payment');

    const search = screen.getByPlaceholderText('Lọc CR, subsystem, tác vụ...');

    fireEvent.change(search, { target: { value: 'CR-1' } });
    expect(screen.getByText('Instant Payment')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'SC-AUTH-API' } });
    expect(screen.getByText('Instant Payment')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'Attached task' } });
    expect(screen.getByText('Instant Payment')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'no-such-thing' } });
    expect(screen.queryByText('Instant Payment')).not.toBeInTheDocument();
  });
});
