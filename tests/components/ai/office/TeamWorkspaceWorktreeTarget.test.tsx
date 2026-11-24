import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../../../src/db';
import { createEmployee, createLead } from '../../../../src/db/repositories/aiOfficeRepo';
import { addTeamLink, createTeam, listTeamLinks, removeTeamLink } from '../../../../src/db/repositories/aiTeamRepo';
import type { AiTeam } from '../../../../src/types/aiOffice';
import { makeTeamRunSnapshot } from '../../../helpers/teamRunSnapshot';
import type { TeamRunCoordinatorOptions } from '../../../../src/services/ai/office/teamRunCoordinator';

vi.mock('../../../../src/components/ai/AiChatWidget', () => ({
  AiChatWidget: () => <div data-testid="mock-chat-widget" />,
}));

const coordinatorOptionsMock = vi.fn();
const setAgentDeveloperWorktreeMock = vi.fn(() => true);
const setWorktreeAmbiguousSystemsMock = vi.fn();
vi.mock('../../../../src/services/ai/office/teamRunCoordinator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/services/ai/office/teamRunCoordinator')>();
  return {
    ...actual,
    createTeamRunCoordinator: vi.fn((options: TeamRunCoordinatorOptions) => {
      coordinatorOptionsMock(options);
      return {
        send: vi.fn(async () => 'started' as const),
        setAgentDeveloperWorktree: setAgentDeveloperWorktreeMock,
        setWorktreeAmbiguousSystems: setWorktreeAmbiguousSystemsMock,
        stopAgent: vi.fn(), abortAll: vi.fn(), resolvePlan: vi.fn(), resolveApproval: vi.fn(),
        topUp: vi.fn(async () => undefined), dispose: vi.fn(async () => undefined),
        setTeamSettings: vi.fn(), setTeamBudget: vi.fn(), setTeamThresholdPct: vi.fn(), setGlobalThresholdPct: vi.fn(),
        getRunningCount: () => 0, finalizeAttempt: vi.fn(async () => null),
        runBatch: vi.fn(async () => ''), retryAssignment: vi.fn(async () => undefined),
        subscribe: () => () => {}, getState: () => makeTeamRunSnapshot({ phase: 'ready' }),
      };
    }),
  };
});

vi.mock('../../../../src/services/ai/office/teamRunManager', () => ({
  getOrCreateRun: vi.fn(async (_db: unknown, _teamId: string, _threadId: string, factory: () => unknown) => factory()),
}));

import { TeamWorkspace } from '../../../../src/components/ai/office/TeamWorkspace';

describe('TeamWorkspace wires the persisted agent-developer worktree target (CR-02, 261121-qpp)', () => {
  let db: TaskPlannerDatabase;
  let team: AiTeam;

  const addSystem = async (name: string, repo: string, ssh: string, code = name) => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.systems.add({
      id, name, code, parentId: null, type: 'SERVICE',
      sshConfigId: ssh, remoteRepoPath: repo, createdAt: now, updatedAt: now,
    });
    return id;
  };
  const addCrWithTargets = async (targets: { systemId: string }[]) => {
    const now = new Date().toISOString();
    const crId = crypto.randomUUID();
    await db.changeRequests.add({
      id: crId, name: 'CR', code: 'CR-2026-001', status: 'Open', type: 'ENHANCEMENT',
      targets, createdAt: now, updatedAt: now,
    });
    await addTeamLink({ teamId: team.id, itemType: 'cr', itemId: crId }, db);
  };
  const renderWorkspace = () =>
    render(<TeamWorkspace team={team} lead={undefined} members={[]} employees={[]} skills={[]} db={db} />);

  beforeEach(async () => {
    coordinatorOptionsMock.mockClear();
    db = new TaskPlannerDatabase('test-team-worktree-target-' + Math.random().toString(36).slice(2));
    await db.open();
    await db.settings.put({ key: 'ninerouter_api_key', value: 'sk-test' });
    await db.settings.put({ key: 'ninerouter_endpoint', value: 'https://example.invalid/v1' });
    const lead = await createLead(
      { name: 'Lead', role: 'Lead', capability: 'Điều phối.', persona: 'Bạn là lead.', model: 'claude-opus-4' },
      db
    );
    const employee = await createEmployee(
      { name: 'An', role: 'Phân tích', capability: 'Phân tích.', persona: 'Bạn là An.', model: 'claude-sonnet-4' },
      db
    );
    team = await createTeam(
      { name: 'Nhóm thử', budgetTokens: 1000, leadId: lead.id, employeeIds: [employee.id] },
      db
    );
  });

  afterEach(async () => {
    await db.delete();
    vi.clearAllMocks();
  });

  it('passes linked System sshConfigId and remoteRepoPath into the coordinator (direct link)', async () => {
    const systemId = await addSystem('Core', '/srv/repo', 'ssh-1');
    await addTeamLink({ teamId: team.id, itemType: 'system', itemId: systemId }, db);

    renderWorkspace();
    await waitFor(() => {
      expect(coordinatorOptionsMock).toHaveBeenCalledWith(expect.objectContaining({
        agentDeveloperWorktree: { sshConfigId: 'ssh-1', remoteRepoPath: '/srv/repo' },
      }));
    });
  });

  it('resolves a usable system reachable only through a CR target (regression)', async () => {
    const systemId = await addSystem('Core', '/srv/repo', 'ssh-1');
    await addCrWithTargets([{ systemId }]);
    // No direct system link: remove any seeded one if present.
    for (const link of await listTeamLinks(team.id, db)) {
      if (link.itemType === 'system') await removeTeamLink(link.id, db);
    }

    renderWorkspace();
    await waitFor(() => {
      expect(coordinatorOptionsMock).toHaveBeenCalledWith(expect.objectContaining({
        agentDeveloperWorktree: { sshConfigId: 'ssh-1', remoteRepoPath: '/srv/repo' },
      }));
    });
  });

  it('dedupes a system linked both directly and via a CR', async () => {
    const systemId = await addSystem('Core', '/srv/repo', 'ssh-1');
    await addTeamLink({ teamId: team.id, itemType: 'system', itemId: systemId }, db);
    await addCrWithTargets([{ systemId }]);

    renderWorkspace();
    await waitFor(() => {
      const opts = coordinatorOptionsMock.mock.calls.at(-1)?.[0] as TeamRunCoordinatorOptions;
      expect(opts.agentDeveloperWorktree).toEqual({ sshConfigId: 'ssh-1', remoteRepoPath: '/srv/repo' });
      expect(opts.worktreeAmbiguousSystems).toBeUndefined();
    });
  });

  it('passes ambiguity names only and no worktree for two usable systems', async () => {
    const first = await addSystem('Core', '/srv/repo', 'ssh-1');
    const second = await addSystem('Payments', '/srv/pay', 'ssh-2');
    await addTeamLink({ teamId: team.id, itemType: 'system', itemId: first }, db);
    await addTeamLink({ teamId: team.id, itemType: 'system', itemId: second }, db);

    renderWorkspace();
    await waitFor(() => {
      const opts = coordinatorOptionsMock.mock.calls.at(-1)?.[0] as TeamRunCoordinatorOptions;
      expect(opts.agentDeveloperWorktree).toBeUndefined();
      expect(opts.worktreeAmbiguousSystems).toHaveLength(2);
      expect(opts.worktreeAmbiguousSystems).toEqual(expect.arrayContaining(['Core', 'Payments']));
    });
  });

  it('pushes a changed resolver target into the live coordinator without recreating it (WR-02)', async () => {
    const first = await addSystem('Core', '/srv/repo', 'ssh-1');
    const firstLink = await addTeamLink({ teamId: team.id, itemType: 'system', itemId: first }, db);
    renderWorkspace();
    await waitFor(() => {
      expect(setAgentDeveloperWorktreeMock).toHaveBeenCalledWith({
        sshConfigId: 'ssh-1', remoteRepoPath: '/srv/repo',
      });
    });
    const creationCount = coordinatorOptionsMock.mock.calls.length;

    const second = await addSystem('Payments', '/srv/payments', 'ssh-2');
    await addTeamLink({ teamId: team.id, itemType: 'system', itemId: second }, db);
    await removeTeamLink(firstLink.id, db);

    await waitFor(() => {
      expect(setAgentDeveloperWorktreeMock).toHaveBeenCalledWith({
        sshConfigId: 'ssh-2', remoteRepoPath: '/srv/payments',
      });
    });
    expect(coordinatorOptionsMock.mock.calls.length).toBe(creationCount);
  });

  it('clears a stale target in the live coordinator when the resolver becomes ambiguous (WR-02)', async () => {
    const first = await addSystem('Core', '/srv/repo', 'ssh-1');
    await addTeamLink({ teamId: team.id, itemType: 'system', itemId: first }, db);
    renderWorkspace();
    await waitFor(() => {
      expect(setAgentDeveloperWorktreeMock).toHaveBeenCalledWith({
        sshConfigId: 'ssh-1', remoteRepoPath: '/srv/repo',
      });
    });
    const creationCount = coordinatorOptionsMock.mock.calls.length;

    const second = await addSystem('Payments', '/srv/payments', 'ssh-2');
    await addTeamLink({ teamId: team.id, itemType: 'system', itemId: second }, db);

    await waitFor(() => {
      expect(setWorktreeAmbiguousSystemsMock).toHaveBeenCalledWith(
        expect.arrayContaining(['Core', 'Payments'])
      );
      expect(setAgentDeveloperWorktreeMock).toHaveBeenCalledWith(undefined);
    });
    expect(coordinatorOptionsMock.mock.calls.length).toBe(creationCount);
  });
});

describe('TeamWorkspace worktree system picker (261124-uuo)', () => {
  let db: TaskPlannerDatabase;
  let team: AiTeam;

  const addSystem = async (name: string, repo: string, ssh: string, code: string) => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.systems.add({
      id, name, code, parentId: null, type: 'SERVICE',
      sshConfigId: ssh, remoteRepoPath: repo, createdAt: now, updatedAt: now,
    });
    return id;
  };
  const linkSystem = async (systemId: string) => {
    const link = await addTeamLink({ teamId: team.id, itemType: 'system', itemId: systemId }, db);
    return link.id;
  };
  const renderWorkspace = () =>
    render(<TeamWorkspace team={team} lead={undefined} members={[]} employees={[]} skills={[]} db={db} />);
  const openPicker = async () => {
    const picker = await screen.findByTestId('worktree-system-picker');
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Chọn hệ thống worktree' }));
    return picker;
  };
  const selectSystem = async (label: string) => {
    await openPicker();
    fireEvent.click(await screen.findByText(label, { selector: '.ant-select-item-option-content' }));
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    db = new TaskPlannerDatabase('test-uuo-picker-' + Math.random().toString(36).slice(2));
    await db.open();
    await db.settings.put({ key: 'ninerouter_api_key', value: 'sk-test' });
    await db.settings.put({ key: 'ninerouter_endpoint', value: 'https://example.invalid/v1' });
    const lead = await createLead(
      { name: 'Lead', role: 'Lead', capability: 'Điều phối.', persona: 'Bạn là lead.', model: 'claude-opus-4' },
      db
    );
    const employee = await createEmployee(
      { name: 'An', role: 'Phân tích', capability: 'Phân tích.', persona: 'Bạn là An.', model: 'claude-sonnet-4' },
      db
    );
    team = await createTeam(
      { name: 'Nhóm thử', budgetTokens: 1000, leadId: lead.id, employeeIds: [employee.id] },
      db
    );
  });

  afterEach(async () => {
    await db.delete();
  });

  it('shows the picker with all usable candidates and does not auto-select', async () => {
    await linkSystem(await addSystem('Core', '/srv/repo', 'ssh-1', 'CORE'));
    await linkSystem(await addSystem('Payments', '/srv/payments', 'ssh-2', 'PAY'));

    renderWorkspace();
    await screen.findByTestId('worktree-system-picker');
    await openPicker();
    expect(await screen.findByText('Core (CORE)', { selector: '.ant-select-item-option-content' })).toBeInTheDocument();
    expect(screen.getByText('Payments (PAY)', { selector: '.ant-select-item-option-content' })).toBeInTheDocument();
    await waitFor(() => {
      expect(setAgentDeveloperWorktreeMock).toHaveBeenCalledWith(undefined);
      expect(setWorktreeAmbiguousSystemsMock).toHaveBeenCalledWith(
        expect.arrayContaining(['Core', 'Payments'])
      );
    });
    expect(setAgentDeveloperWorktreeMock).not.toHaveBeenCalledWith({
      sshConfigId: 'ssh-1', remoteRepoPath: '/srv/repo',
    });
    expect(setAgentDeveloperWorktreeMock).not.toHaveBeenCalledWith({
      sshConfigId: 'ssh-2', remoteRepoPath: '/srv/payments',
    });
  });

  it('pushes the selected target live without changing AiTeam', async () => {
    await linkSystem(await addSystem('Core', '/srv/repo', 'ssh-1', 'CORE'));
    await linkSystem(await addSystem('Payments', '/srv/payments', 'ssh-2', 'PAY'));
    const before = await db.aiTeams.get(team.id);

    renderWorkspace();
    await selectSystem('Payments (PAY)');

    await waitFor(() => {
      expect(setAgentDeveloperWorktreeMock).toHaveBeenCalledWith({
        sshConfigId: 'ssh-2', remoteRepoPath: '/srv/payments',
      });
      expect(setWorktreeAmbiguousSystemsMock).toHaveBeenCalledWith([]);
    });
    expect(await db.aiTeams.get(team.id)).toEqual(before);
  });

  it('keeps the override uncommitted when the live coordinator refuses the swap', async () => {
    await linkSystem(await addSystem('Core', '/srv/repo', 'ssh-1', 'CORE'));
    await linkSystem(await addSystem('Payments', '/srv/payments', 'ssh-2', 'PAY'));
    renderWorkspace();
    await waitFor(() => {
      expect(setAgentDeveloperWorktreeMock).toHaveBeenCalledWith(undefined);
    });
    setAgentDeveloperWorktreeMock.mockReturnValueOnce(false);

    await selectSystem('Payments (PAY)');
    expect(await screen.findByText('Không đổi được hệ thống khi Agent Developer đang chạy. Hãy dừng phiên rồi chọn lại.')).toBeInTheDocument();
    const targetCalls = () => setAgentDeveloperWorktreeMock.mock.calls.filter(
      (args) => (args as unknown as { sshConfigId?: string }[])[0]?.sshConfigId === 'ssh-2'
    ).length;
    expect(targetCalls()).toBe(1); // only the refused apply — no committed push

    await selectSystem('Payments (PAY)');
    await waitFor(() => {
      expect(setAgentDeveloperWorktreeMock).toHaveBeenCalledWith({
        sshConfigId: 'ssh-2', remoteRepoPath: '/srv/payments',
      });
    });
  });

  it('clears a stale override and restores ambiguity when the selected candidate disappears', async () => {
    await linkSystem(await addSystem('Core', '/srv/repo', 'ssh-1', 'CORE'));
    const paymentsLinkId = await linkSystem(
      await addSystem('Payments', '/srv/payments', 'ssh-2', 'PAY')
    );
    renderWorkspace();
    await selectSystem('Payments (PAY)');
    await waitFor(() => {
      expect(setAgentDeveloperWorktreeMock).toHaveBeenCalledWith({
        sshConfigId: 'ssh-2', remoteRepoPath: '/srv/payments',
      });
    });
    const pushCount = setAgentDeveloperWorktreeMock.mock.calls.length;

    await linkSystem(await addSystem('Billing', '/srv/billing', 'ssh-3', 'BIL'));
    await removeTeamLink(paymentsLinkId, db);

    await waitFor(() => {
      expect(setAgentDeveloperWorktreeMock.mock.calls.length).toBeGreaterThan(pushCount);
      expect(setAgentDeveloperWorktreeMock.mock.calls.at(-1)?.[0 as never]).toBeUndefined();
      expect(setWorktreeAmbiguousSystemsMock).toHaveBeenCalledWith(
        expect.arrayContaining(['Core', 'Billing'])
      );
    });
  });
});
