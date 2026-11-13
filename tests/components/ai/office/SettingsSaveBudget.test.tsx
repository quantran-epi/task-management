import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../../../src/db';
import { createEmployee, createLead } from '../../../../src/db/repositories/aiOfficeRepo';
import { createTeam } from '../../../../src/db/repositories/aiTeamRepo';
import type { AiEmployee, AiLead, AiTeam } from '../../../../src/types/aiOffice';
import { makeTeamRunSnapshot } from '../../../helpers/teamRunSnapshot';

/**
 * Phase 38 D-19/AIO-BUDGET-07: a Settings save is ONE absolute two-table write.
 *
 * The bug this file exists to catch: `handleSaveSettings` used to compose an absolute
 * `updateTeam(total)` with a per-member additive top-up loop, so raising a 3000 team to 4000
 * stored 5000. Every assertion below reads the persisted rows, not the UI.
 */

interface StubCoordinator {
  send: ReturnType<typeof vi.fn>;
  stopAgent: ReturnType<typeof vi.fn>;
  abortAll: ReturnType<typeof vi.fn>;
  resolvePlan: ReturnType<typeof vi.fn>;
  resolveApproval: ReturnType<typeof vi.fn>;
  topUp: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  setTeamSettings: ReturnType<typeof vi.fn>;
  setTeamBudget: ReturnType<typeof vi.fn>;
  setTeamThresholdPct: ReturnType<typeof vi.fn>;
  applyBudgetSettings: ReturnType<typeof vi.fn>;
  getRunningCount: () => number;
  finalizeAttempt: ReturnType<typeof vi.fn>;
  runBatch: ReturnType<typeof vi.fn>;
  retryAssignment: ReturnType<typeof vi.fn>;
  subscribe: (fn: () => void) => () => void;
  getState: () => unknown;
}

let currentStub: StubCoordinator | null = null;

function createStub(): StubCoordinator {
  return {
    send: vi.fn(async () => 'started'),
    stopAgent: vi.fn(),
    abortAll: vi.fn(),
    resolvePlan: vi.fn(),
    resolveApproval: vi.fn(),
    topUp: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined),
    setTeamSettings: vi.fn(),
    setTeamBudget: vi.fn(),
    setTeamThresholdPct: vi.fn(),
    applyBudgetSettings: vi.fn(),
    getRunningCount: () => 0,
    finalizeAttempt: vi.fn(async () => null),
    runBatch: vi.fn(async () => ''),
    retryAssignment: vi.fn(async () => undefined),
    subscribe: () => () => {},
    getState: () => makeTeamRunSnapshot({ phase: 'ready' }),
  };
}

vi.mock('../../../../src/services/ai/office/teamRunCoordinator', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../src/services/ai/office/teamRunCoordinator')>();
  return {
    ...actual,
    createTeamRunCoordinator: vi.fn(() => currentStub),
  };
});

/** Spies on the repo module: the real writes still run, so the assertions read Dexie. */
const repoSpies = vi.hoisted(() => ({
  applyTeamBudgetSettings: vi.fn(),
  topUpMemberBudget: vi.fn(),
  setMemberBudget: vi.fn(),
  updateTeam: vi.fn(),
}));

vi.mock('../../../../src/db/repositories/aiTeamRepo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/db/repositories/aiTeamRepo')>();
  return {
    ...actual,
    applyTeamBudgetSettings: (...args: Parameters<typeof actual.applyTeamBudgetSettings>) => {
      repoSpies.applyTeamBudgetSettings(...args);
      return actual.applyTeamBudgetSettings(...args);
    },
    topUpMemberBudget: (...args: Parameters<typeof actual.topUpMemberBudget>) => {
      repoSpies.topUpMemberBudget(...args);
      return actual.topUpMemberBudget(...args);
    },
    setMemberBudget: (...args: Parameters<typeof actual.setMemberBudget>) => {
      repoSpies.setMemberBudget(...args);
      return actual.setMemberBudget(...args);
    },
    updateTeam: (...args: Parameters<typeof actual.updateTeam>) => {
      repoSpies.updateTeam(...args);
      return actual.updateTeam(...args);
    },
  };
});

import { TeamWorkspace } from '../../../../src/components/ai/office/TeamWorkspace';

describe('TeamWorkspace settings save (Phase 38 D-19, AIO-BUDGET-07)', () => {
  let db: TaskPlannerDatabase;
  let team: AiTeam;
  let lead: AiLead;
  let employee: AiEmployee;

  beforeEach(async () => {
    currentStub = createStub();
    db = new TaskPlannerDatabase('test-settings-save-' + Math.random().toString(36).slice(2));
    await db.open();
    await db.settings.put({ key: 'ninerouter_api_key', value: 'sk-test' });
    await db.settings.put({ key: 'ninerouter_endpoint', value: 'https://example.invalid/v1' });
    lead = await createLead(
      { name: 'Bình Lead', role: 'Lead', capability: 'Điều phối.', persona: 'Bạn là lead.', model: 'm' },
      db
    );
    employee = await createEmployee(
      { name: 'An', role: 'Phân tích', capability: 'Phân tích.', persona: 'Bạn là An.', model: 'm2' },
      db
    );
    team = await createTeam(
      {
        name: 'Nhóm ngân sách',
        status: 'idle',
        budgetTokens: 3000,
        leadId: lead.id,
        employeeIds: [employee.id],
      },
      db
    );
  });

  afterEach(async () => {
    await db.delete();
    vi.clearAllMocks();
  });

  const renderWorkspace = () =>
    render(
      <TeamWorkspace
        team={team}
        lead={lead}
        members={[]}
        employees={[employee]}
        skills={[]}
        db={db}
        onBack={() => {}}
      />
    );

  /**
   * Open the drawer only after the live member query has resolved: the drawer seeds its
   * rows once per open, so opening before the roster lands would save an empty `budgets`.
   */
  const openDrawer = async () => {
    fireEvent.click(await screen.findByTestId('team-open-settings'));
    await screen.findByTestId(`team-member-row-${(await db.aiTeamMembers.toArray())[0]!.id}`);
    return screen.findByLabelText('Tổng ngân sách nhóm');
  };

  /** Raise the team total in the drawer, which re-splits the member shares, then save. */
  const saveTotal = async (total: number) => {
    const input = await openDrawer();
    fireEvent.change(input, { target: { value: String(total) } });
    fireEvent.click(await screen.findByTestId('team-settings-save'));
  };

  const storedBudgets = async () => {
    const rows = await db.aiTeamMembers.where('teamId').equals(team.id).toArray();
    return {
      total: (await db.aiTeams.get(team.id))?.budgetTokens,
      memberSum: rows.reduce((sum, row) => sum + row.budgetTokens, 0),
      rows,
    };
  };

  it('persists 3000 → 4000 as 4000, not 5000 (D-19, settings-save)', async () => {
    renderWorkspace();
    await saveTotal(4000);

    await waitFor(async () => expect((await storedBudgets()).total).toBe(4000));
    const stored = await storedBudgets();
    expect(stored.total).toBe(4000);
    expect(stored.memberSum).toBe(4000);
    expect(currentStub?.applyBudgetSettings).toHaveBeenCalledTimes(1);
  });

  it('persists identical values with no coordinator (no-coordinator)', async () => {
    currentStub = null;
    renderWorkspace();
    await saveTotal(4000);

    await waitFor(async () => expect((await storedBudgets()).total).toBe(4000));
    const stored = await storedBudgets();
    expect(stored.total).toBe(4000);
    expect(stored.memberSum).toBe(4000);
  });

  it('makes exactly one repo budget call per save (atomic)', async () => {
    renderWorkspace();
    await saveTotal(4000);

    await waitFor(() => expect(repoSpies.applyTeamBudgetSettings).toHaveBeenCalledTimes(1));
    expect(repoSpies.topUpMemberBudget).not.toHaveBeenCalled();
    expect(repoSpies.setMemberBudget).not.toHaveBeenCalled();
    // `updateTeam` is still used by the sidebar toggles, but never for this save's total.
    expect(repoSpies.updateTeam).not.toHaveBeenCalled();
  });

  it('keeps an absent override absent on an unrelated save (D-04)', async () => {
    await db.settings.put({ key: 'budgetWarnThresholdPct', value: 65 });
    renderWorkspace();
    await saveTotal(4500);

    await waitFor(async () => expect((await storedBudgets()).total).toBe(4500));
    const stored = (await db.aiTeams.get(team.id))!;
    expect('budgetWarnThresholdPct' in stored).toBe(false);
    expect(currentStub?.setTeamThresholdPct).toHaveBeenCalledWith(undefined);
  });
});
