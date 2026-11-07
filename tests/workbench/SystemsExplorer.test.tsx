import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../src/db';
import { createSystem } from '../../src/db/repositories/systemRepo';
import { SystemsExplorer } from '../../src/workbench/toolwindows/SystemsExplorer';
import { useLayoutStore } from '../../src/workbench/store/layoutStore';

/**
 * Wave 0 contract for plan 31.2-12 Task 2 (ENT-NORM-02, D-30/D-34, T-31.2-32).
 *
 * Parent and subsystem nodes carry divergent context menus. A parent never offers `Tạo CR`;
 * a subsystem offers `Tạo CR`, `Mở Git`, `Mở Terminal`, with Git/Terminal disabled and
 * tooltip-copied when SSH/repo is unconfigured. RED until plan 12 lands.
 */
describe('SystemsExplorer — divergent action sets (ENT-NORM-02)', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase('test-systems-explorer-' + Math.random().toString(36).slice(2));
    await db.open();
    useLayoutStore.getState().resetLayout();
  });

  afterEach(async () => {
    await db.delete();
  });

  async function renderWithFixtures(opts: { withRepo: boolean }) {
    const parent = await createSystem(
      { name: 'SmartCard Core', code: 'SC-CORE', type: 'LOGICAL_GROUP' },
      db
    );
    await createSystem(
      {
        name: 'Card Auth API',
        code: 'SC-AUTH-API',
        parentId: parent.id,
        type: 'SERVICE',
        ...(opts.withRepo
          ? { sshConfigId: '11111111-1111-4111-8111-111111111111', remoteRepoPath: '/data/services/smartcard-api' }
          : {}),
      },
      db
    );
    render(<SystemsExplorer db={db} />);
    await screen.findByText('Card Auth API');
    return { parent };
  }

  async function openContextMenu(label: string) {
    fireEvent.contextMenu(screen.getByText(label), { clientX: 200, clientY: 300 });
    await waitFor(() => {
      expect(document.querySelector('.ant-dropdown-menu')).not.toBeNull();
    });
    return document.querySelector('.ant-dropdown-menu') as HTMLElement;
  }

  it('gives a parent node no Tạo CR action', async () => {
    await renderWithFixtures({ withRepo: true });
    const menu = await openContextMenu('SmartCard Core');

    expect(menu.textContent).toContain('Xem chi tiết');
    expect(menu.textContent).toContain('Thêm subsystem');
    expect(menu.textContent).toContain('Sửa');
    expect(menu.textContent).toContain('Xóa');
    expect(menu.textContent).not.toContain('Tạo CR');
  });

  it('gives a subsystem node the full subsystem action set', async () => {
    await renderWithFixtures({ withRepo: true });
    const menu = await openContextMenu('Card Auth API');

    expect(menu.textContent).toContain('Xem chi tiết');
    expect(menu.textContent).toContain('Tạo CR');
    expect(menu.textContent).toContain('Mở Git');
    expect(menu.textContent).toContain('Mở Terminal');
    expect(menu.textContent).toContain('Sửa');
    expect(menu.textContent).toContain('Xóa');
  });

  it('disables Mở Git with the unconfigured tooltip when the subsystem has no repo', async () => {
    await renderWithFixtures({ withRepo: false });
    const menu = await openContextMenu('Card Auth API');

    const gitItem = Array.from(menu.querySelectorAll<HTMLElement>('.ant-dropdown-menu-item')).find(
      (item) => item.textContent?.includes('Mở Git')
    );
    expect(gitItem).toBeDefined();
    expect(gitItem?.getAttribute('aria-disabled')).toBe('true');
    expect(gitItem?.getAttribute('title') ?? '').toContain(
      'Chưa cấu hình SSH/Repo — mở System Catalog'
    );
  });

  it('opens ChangeRequestModal pre-filled when Tạo CR is clicked on a subsystem', async () => {
    await renderWithFixtures({ withRepo: true });
    const menu = await openContextMenu('Card Auth API');

    const createCrItem = Array.from(menu.querySelectorAll<HTMLElement>('.ant-dropdown-menu-item')).find(
      (item) => item.textContent?.includes('Tạo CR')
    );
    expect(createCrItem).toBeDefined();
    fireEvent.click(createCrItem as HTMLElement);

    await waitFor(() => {
      expect(screen.getByText('Change Request mới')).toBeInTheDocument();
    });
    expect(screen.getByTestId('target-systems-selector').textContent).toContain('SC-AUTH-API');
  });
});
