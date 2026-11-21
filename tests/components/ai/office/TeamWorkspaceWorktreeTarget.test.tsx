import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
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

  const addSystem = async (name: string, repo: string, ssh: string) => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.systems.add({
      id, name, code: name, parentId: null, type: 'SERVICE',
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
});
