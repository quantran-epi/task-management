import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SubsystemsReposPanel } from '../../../src/components/sdlc/SubsystemsReposPanel';
import type { ChangeRequest, System } from '../../../src/types/models';
import type { SshConfig } from '../../../src/types/ssh';

const SYSTEM_A = '11111111-1111-4111-8111-111111111111';
const SYSTEM_B = '22222222-2222-4222-8222-222222222222';
const SYSTEM_C = '33333333-3333-4333-8333-333333333333';
const SSH_ID = '44444444-4444-4444-8444-444444444444';

const sshConfigs: SshConfig[] = [
  {
    id: SSH_ID,
    name: 'Prod Bastion',
    host: '10.0.0.5',
    port: 22,
    username: 'deploy',
    authType: 'key_file',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

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
  {
    id: SYSTEM_C,
    name: 'Unconfigured Worker',
    code: 'WORKER-X',
    parentId: 'parent-1',
    type: 'WORKER',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

function makeCr(targetIds: string[]): ChangeRequest {
  return {
    id: 'cr-1',
    name: 'Instant settlement',
    code: 'CR-2026-001',
    status: 'Open',
    type: 'NEW_FEATURE',
    targets: targetIds.map((systemId) => ({ systemId })),
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

describe('SubsystemsReposPanel', () => {
  it('renders one read-only row per CR target with code, name, type, SSH, repo and branch', () => {
    render(
      <SubsystemsReposPanel
        changeRequest={makeCr([SYSTEM_A, SYSTEM_B])}
        systems={systems}
        sshConfigs={sshConfigs}
        onEditSubsystem={vi.fn()}
        onChooseSubsystem={vi.fn()}
      />
    );

    expect(screen.getByText('Subsystems & Repos')).toBeInTheDocument();
    expect(screen.getByText('PAY-SVC')).toBeInTheDocument();
    expect(screen.getByText('BILL-DB')).toBeInTheDocument();
    expect(screen.getByText('Payment Service')).toBeInTheDocument();
    expect(screen.getByText('Billing Schema')).toBeInTheDocument();
    expect(screen.getByText('Service / Microservice')).toBeInTheDocument();
    expect(screen.getByText('Database Schema')).toBeInTheDocument();
    expect(screen.getAllByText('deploy@10.0.0.5:22')).toHaveLength(2);
    expect(screen.getByText('/var/repos/payment-service')).toBeInTheDocument();
    expect(screen.getByText('/var/repos/billing-db')).toBeInTheDocument();
    expect(screen.getByText('origin/main')).toBeInTheDocument();
    expect(screen.getByText('origin/master')).toBeInTheDocument();
    expect(screen.getAllByTestId(/^repo-connection-/)).toHaveLength(2);
  });

  it('contains zero form controls', () => {
    const { container } = render(
      <SubsystemsReposPanel
        changeRequest={makeCr([SYSTEM_A, SYSTEM_B])}
        systems={systems}
        sshConfigs={sshConfigs}
        onEditSubsystem={vi.fn()}
        onChooseSubsystem={vi.fn()}
      />
    );

    expect(container.querySelectorAll('input,select,textarea').length).toBe(0);
  });

  it('disables Git and Terminal with the System Catalog tooltip when the subsystem is unconfigured', () => {
    render(
      <SubsystemsReposPanel
        changeRequest={makeCr([SYSTEM_C])}
        systems={systems}
        sshConfigs={sshConfigs}
        onEditSubsystem={vi.fn()}
        onChooseSubsystem={vi.fn()}
      />
    );

    expect(screen.getAllByText('Chưa cấu hình').length).toBeGreaterThanOrEqual(1);
    const disabled = screen.getAllByLabelText('Chưa cấu hình SSH/Repo — mở System Catalog');
    expect(disabled).toHaveLength(2);
    for (const button of disabled) expect(button).toBeDisabled();
  });

  it('opens the subsystem edit modal from the footer link', () => {
    const onEditSubsystem = vi.fn();
    render(
      <SubsystemsReposPanel
        changeRequest={makeCr([SYSTEM_A])}
        systems={systems}
        sshConfigs={sshConfigs}
        onEditSubsystem={onEditSubsystem}
        onChooseSubsystem={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Chỉnh sửa trong System Catalog'));
    expect(onEditSubsystem).toHaveBeenCalledWith(expect.objectContaining({ id: SYSTEM_A }));
  });

  it('renders the empty state with a choose-subsystem link when the CR has no targets', () => {
    const onChooseSubsystem = vi.fn();
    render(
      <SubsystemsReposPanel
        changeRequest={makeCr([])}
        systems={systems}
        sshConfigs={sshConfigs}
        onEditSubsystem={vi.fn()}
        onChooseSubsystem={onChooseSubsystem}
      />
    );

    expect(screen.getByText('CR chưa gắn subsystem nào')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Chọn subsystem'));
    expect(onChooseSubsystem).toHaveBeenCalledTimes(1);
  });
});
