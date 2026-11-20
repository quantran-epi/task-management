import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../../../src/db';
import { createEmployee, createLead } from '../../../../src/db/repositories/aiOfficeRepo';
import { addTeamLink, createTeam } from '../../../../src/db/repositories/aiTeamRepo';
import type { AiTeam } from '../../../../src/types/aiOffice';
import { makeTeamRunSnapshot } from '../../../helpers/teamRunSnapshot';
import type { TeamRunCoordinatorOptions } from '../../../../src/services/ai/office/teamRunCoordinator';

vi.mock('../../../../src/components/ai/AiChatWidget', () => ({
  AiChatWidget: () => <div data-testid="mock-chat-widget" />,
}));

const coordinatorOptionsMock = vi.fn();
vi.mock('../../../../src/services/ai/office/teamRunCoordinator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/services/ai/office/teamRunCoordinator')>();
  return {
    ...actual,
    createTeamRunCoordinator: vi.fn((options: TeamRunCoordinatorOptions) => {
      coordinatorOptionsMock(options);
      return {
        send: vi.fn(async () => 'started' as const),
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

describe('TeamWorkspace wires the persisted agent-developer worktree target (CR-02)', () => {
  let db: TaskPlannerDatabase;
  let team: AiTeam;

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
    const now = new Date().toISOString();
    const systemId = crypto.randomUUID();
    await db.systems.add({
      id: systemId, name: 'Core', code: 'CORE', parentId: null, type: 'SERVICE',
      sshConfigId: 'ssh-1', remoteRepoPath: '/srv/repo', createdAt: now, updatedAt: now,
    });
    await addTeamLink({ teamId: team.id, itemType: 'system', itemId: systemId }, db);
  });

  afterEach(async () => {
    await db.delete();
    vi.clearAllMocks();
  });

  it('passes linked System sshConfigId and remoteRepoPath into the coordinator', async () => {
    render(<TeamWorkspace team={team} lead={undefined} members={[]} employees={[]} skills={[]} db={db} />);
    await waitFor(() => {
      expect(coordinatorOptionsMock).toHaveBeenCalledWith(expect.objectContaining({
        agentDeveloperWorktree: { sshConfigId: 'ssh-1', remoteRepoPath: '/srv/repo' },
      }));
    });
  });
});
