import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../src/db';
import { createSystem } from '../../src/db/repositories/systemRepo';
import { createChangeRequest } from '../../src/db/repositories/changeRequestRepo';
import { SystemDetailView } from '../../src/views/SystemDetailView';
import { useLayoutStore } from '../../src/workbench/store/layoutStore';

/**
 * Wave 0 contract for plan 31.2-14 Task 1 (ENT-NORM-03, D-33/D-34).
 *
 * `SystemDetailView` becomes a 4-tab view with per-node-type visibility, divergent header
 * actions, 1-click Git/Terminal on subsystem rows, and the four `Git & Branches` states.
 * RED until plan 14 lands.
 */
describe('SystemDetailView — 4 tabs with per-type visibility (ENT-NORM-03)', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase('test-system-detail-' + Math.random().toString(36).slice(2));
    await db.open();
    useLayoutStore.getState().resetLayout();
  });

  afterEach(async () => {
    await db.delete();
    vi.restoreAllMocks();
  });

  async function seedParentAndChild(opts: { withRepo?: boolean } = {}) {
    const parent = await createSystem(
      { parentId: null, name: 'SmartCard Core', code: 'SC-CORE', type: 'LOGICAL_GROUP' },
      db
    );
    const child = await createSystem(
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
    return { parent, child };
  }

  it('renders overview, subsystems and impacted CRs tabs for a logical parent, with no Git tab', async () => {
    const { parent } = await seedParentAndChild();
    render(<SystemDetailView systemId={parent.id} db={db} />);

    expect(await screen.findByRole('tab', { name: 'Tổng quan' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Subsystems' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Impacted CRs' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Git & Branches' })).not.toBeInTheDocument();
  });

  it('renders overview, impacted CRs and Git & Branches tabs for a subsystem, with no Subsystems tab', async () => {
    const { child } = await seedParentAndChild({ withRepo: true });
    render(<SystemDetailView systemId={child.id} db={db} />);

    expect(await screen.findByRole('tab', { name: 'Tổng quan' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Impacted CRs' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Git & Branches' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Subsystems' })).not.toBeInTheDocument();
  });

  it('gives a logical parent Chỉnh sửa and Thêm subsystem, and no Tạo CR', async () => {
    const { parent } = await seedParentAndChild();
    render(<SystemDetailView systemId={parent.id} db={db} />);

    expect(await screen.findByRole('button', { name: /Chỉnh sửa/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Thêm subsystem/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tạo CR/i })).not.toBeInTheDocument();
  });

  it('gives a subsystem Chỉnh sửa and Tạo CR cho hệ thống này', async () => {
    const { child } = await seedParentAndChild({ withRepo: true });
    render(<SystemDetailView systemId={child.id} db={db} />);

    expect(await screen.findByRole('button', { name: /Chỉnh sửa/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Tạo CR cho hệ thống này/i })
    ).toBeInTheDocument();
  });

  it('shows SSH, repo path, base branch and connection status in the subsystem overview', async () => {
    const { child } = await seedParentAndChild({ withRepo: true });
    render(<SystemDetailView systemId={child.id} db={db} />);

    await screen.findByRole('tab', { name: 'Tổng quan' });
    expect(screen.getByText('/data/services/smartcard-api')).toBeInTheDocument();
    expect(screen.getByText('origin/main')).toBeInTheDocument();
    expect(screen.getByText(/Chưa cấu hình|Đã kết nối|Lỗi kết nối/)).toBeInTheDocument();
  });

  it('renders disabled Git and Terminal buttons with the unconfigured aria-label on subsystem rows', async () => {
    const { parent } = await seedParentAndChild({ withRepo: false });
    render(<SystemDetailView systemId={parent.id} db={db} />);

    fireEvent.click(await screen.findByRole('tab', { name: 'Subsystems' }));

    const disabledButtons = await screen.findAllByRole('button', {
      name: 'Chưa cấu hình SSH/Repo — mở System Catalog',
    });
    expect(disabledButtons.length).toBeGreaterThanOrEqual(2);
    for (const button of disabledButtons) {
      expect(button).toBeDisabled();
    }
  });

  it('renders the unconfigured Empty state in Git & Branches when SSH/repo is missing', async () => {
    const { child } = await seedParentAndChild({ withRepo: false });
    render(<SystemDetailView systemId={child.id} db={db} />);

    fireEvent.click(await screen.findByRole('tab', { name: 'Git & Branches' }));

    expect(await screen.findByText('Subsystem chưa cấu hình SSH/Repo')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Cấu hình SSH và đường dẫn repo trong System Catalog để xem nhánh và commit.'
      )
    ).toBeInTheDocument();
  });

  it('includes CRs targeting a child subsystem in a parent Impacted CRs tab', async () => {
    const { parent, child } = await seedParentAndChild({ withRepo: true });
    await createChangeRequest(
      {
        name: 'Child-only CR',
        code: 'CR-77',
        type: 'BUGFIX',
        status: 'Open',
        targets: [{ systemId: child.id }],
      },
      db
    );

    render(<SystemDetailView systemId={parent.id} db={db} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Impacted CRs' }));

    await waitFor(() => {
      expect(screen.getByText('Child-only CR')).toBeInTheDocument();
    });
  });
});
