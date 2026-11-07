import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SubsystemContextBar } from '../../../src/components/sdlc/SubsystemContextBar';
import { ChangeRequestSdlcView } from '../../../src/views/ChangeRequestSdlcView';
import { TaskPlannerDatabase } from '../../../src/db';
import { createSystem } from '../../../src/db/repositories/systemRepo';
import { createChangeRequest } from '../../../src/db/repositories/changeRequestRepo';
import type { SdlcWorkspaceProps } from '../../../src/components/sdlc/SdlcWorkspace';
import type { CrTarget, System } from '../../../src/types/models';

const workspaceProps = vi.hoisted(() => ({
  current: undefined as SdlcWorkspaceProps | undefined,
}));
vi.mock('../../../src/components/sdlc/SdlcWorkspace', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/components/sdlc/SdlcWorkspace')>();
  return {
    ...actual,
    SdlcWorkspace: (props: SdlcWorkspaceProps) => {
      workspaceProps.current = props;
      return <div data-testid="workspace-stub" />;
    },
  };
});

const SYSTEM_A = '11111111-1111-4111-8111-111111111111';
const SYSTEM_B = '22222222-2222-4222-8222-222222222222';
const SSH_ID = '44444444-4444-4444-8444-444444444444';

const systems: System[] = [
  {
    id: SYSTEM_A,
    name: 'Payment Service',
    code: 'PAY-SVC',
    parentId: 'parent-1',
    type: 'SERVICE',
    sshConfigId: SSH_ID,
    remoteRepoPath: '/var/repos/payment-service',
    defaultBaseBranch: 'origin/main',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: SYSTEM_B,
    name: 'Billing Schema',
    code: 'BILL-DB',
    parentId: 'parent-1',
    type: 'SCHEMA',
    sshConfigId: SSH_ID,
    remoteRepoPath: '/var/repos/billing-db',
    defaultBaseBranch: 'origin/master',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

const twoTargets: CrTarget[] = [
  { systemId: SYSTEM_A, featureBranch: 'feature/CR-1' },
  { systemId: SYSTEM_B },
];

describe('SubsystemContextBar', () => {
  it('renders nothing at all for a single-subsystem CR', () => {
    const { container } = render(
      <SubsystemContextBar
        targets={[{ systemId: SYSTEM_A }]}
        systems={systems}
        selectedSystemId={SYSTEM_A}
        onSelect={vi.fn()}
      />
    );

    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('subsystem-context-bar')).not.toBeInTheDocument();
  });

  it('renders a Segmented switcher with both subsystem codes', () => {
    render(
      <SubsystemContextBar
        targets={twoTargets}
        systems={systems}
        selectedSystemId={SYSTEM_A}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByTestId('subsystem-context-bar')).toBeInTheDocument();
    expect(screen.getByText('Subsystem đang chọn:')).toBeInTheDocument();
    expect(screen.getByText('PAY-SVC (Payment Service)')).toBeInTheDocument();
    expect(screen.getByText('BILL-DB (Billing Schema)')).toBeInTheDocument();
    const selected = screen.getByText('PAY-SVC (Payment Service)').closest('label');
    expect(selected).toHaveClass('ant-segmented-item-selected');
  });

  it('is fully controlled: selecting calls onSelect and never mutates its own selection', () => {
    const onSelect = vi.fn();
    render(
      <SubsystemContextBar
        targets={twoTargets}
        systems={systems}
        selectedSystemId={SYSTEM_A}
        onSelect={onSelect}
      />
    );

    fireEvent.click(screen.getByText('BILL-DB (Billing Schema)'));
    expect(onSelect).toHaveBeenCalledWith(SYSTEM_B);
    // Prop did not change, so the highlighted option must not move.
    expect(screen.getByText('PAY-SVC (Payment Service)').closest('label')).toHaveClass(
      'ant-segmented-item-selected'
    );
  });

  it('shows the warning tag when the selected target has no featureBranch', () => {
    render(
      <SubsystemContextBar
        targets={twoTargets}
        systems={systems}
        selectedSystemId={SYSTEM_B}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText('Chưa chọn nhánh')).toBeInTheDocument();
  });

  it('shows the featureBranch of the selected target when one is set', () => {
    render(
      <SubsystemContextBar
        targets={twoTargets}
        systems={systems}
        selectedSystemId={SYSTEM_A}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText('feature/CR-1')).toBeInTheDocument();
    expect(screen.queryByText('Chưa chọn nhánh')).not.toBeInTheDocument();
  });
});

describe('ChangeRequestSdlcView subsystem selection ownership', () => {
  let db: TaskPlannerDatabase;
  let crId: string;
  let firstId: string;
  let secondId: string;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`test-ctxbar-${Math.random()}`);
    await db.open();
    const parent = await createSystem(
      { name: 'Core', code: 'CORE', parentId: null, type: 'LOGICAL_GROUP' },
      db
    );
    const a = await createSystem(
      { name: 'Payment Service', code: 'PAY-SVC', parentId: parent.id, type: 'SERVICE' },
      db
    );
    const b = await createSystem(
      { name: 'Billing Schema', code: 'BILL-DB', parentId: parent.id, type: 'SCHEMA' },
      db
    );
    firstId = a.id;
    secondId = b.id;
    const cr = await createChangeRequest(
      {
        name: 'Instant settlement',
        code: 'CR-2026-01',
        type: 'NEW_FEATURE',
        status: 'Open',
        targets: [{ systemId: a.id }, { systemId: b.id }],
      },
      db
    );
    crId = cr.id;
    workspaceProps.current = undefined;
  });

  afterEach(async () => {
    await db.delete();
  });

  it('holds selectedSystemId at view level and forwards it to the workspace for Step 3 and Step 4', async () => {
    render(<ChangeRequestSdlcView changeRequestId={crId} onBack={vi.fn()} db={db} />);

    await waitFor(() => expect(workspaceProps.current?.selectedSystemId).toBe(firstId));
    expect(workspaceProps.current?.crTargets?.map((t) => t.systemId)).toEqual([firstId, secondId]);
    expect(typeof workspaceProps.current?.onSelectSystem).toBe('function');
  });

  it('keeps the selection across a step change within the same CR', async () => {
    render(<ChangeRequestSdlcView changeRequestId={crId} onBack={vi.fn()} db={db} />);
    await waitFor(() => expect(workspaceProps.current?.selectedSystemId).toBe(firstId));

    const select = workspaceProps.current!.onSelectSystem!;
    const before = workspaceProps.current!.selectedStep;
    select(secondId);
    await waitFor(() => expect(workspaceProps.current?.selectedSystemId).toBe(secondId));

    // Same CR, different step: the selection must survive.
    const step = workspaceProps.current!.onNavigateToStep!;
    step(before === 'CODE_GUIDE' ? 'CHANGE_PACK' : 'CODE_GUIDE');
    await waitFor(() => expect(workspaceProps.current?.selectedStep).not.toBe(before));
    expect(workspaceProps.current?.selectedSystemId).toBe(secondId);
  });
});
