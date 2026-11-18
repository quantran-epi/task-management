import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../../../src/db';
import { createEmployee, createLead } from '../../../../src/db/repositories/aiOfficeRepo';
import { createTeam } from '../../../../src/db/repositories/aiTeamRepo';
import { addTeamMember } from '../../../../src/db/repositories/aiTeamRepo';
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
  setGlobalThresholdPct: ReturnType<typeof vi.fn>;
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
    setGlobalThresholdPct: vi.fn(),
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

  const renderWorkspace = (extraEmployees: AiEmployee[] = []) =>
    render(
      <TeamWorkspace
        team={team}
        lead={lead}
        members={[]}
        employees={[employee, ...extraEmployees]}
        skills={[]}
        db={db}
      />
    );

  /**
   * Open the drawer only after the live member query has resolved: the drawer seeds its
   * rows once per open, so opening before the roster lands would save an empty `budgets`.
   */
  const openDrawer = async () => {
    // The composer only renders once the coordinator exists, and every coordinator-side
    // assertion below depends on it. Waiting here removes the bootstrap race. With no
    // coordinator (the no-coordinator case) there is nothing to wait for.
    if (currentStub) await screen.findByLabelText('Nội dung tin nhắn trò chuyện AI');
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

  it('clears a per-team override in ONE repo call and reaches Dexie (D-04, drawer clear)', async () => {
    await db.settings.put({ key: 'budgetWarnThresholdPct', value: 80 });
    await db.aiTeams.update(team.id, { budgetWarnThresholdPct: 65 });
    team = (await db.aiTeams.get(team.id))!;

    renderWorkspace();
    await screen.findByLabelText('Nội dung tin nhắn trò chuyện AI');
    fireEvent.click(await screen.findByTestId('team-open-settings'));
    await screen.findByTestId('team-threshold-input');
    fireEvent.click(screen.getByTestId('team-threshold-clear'));
    fireEvent.click(await screen.findByTestId('team-settings-save'));

    await waitFor(() => expect(repoSpies.applyTeamBudgetSettings).toHaveBeenCalledTimes(1));
    const payload = repoSpies.applyTeamBudgetSettings.mock.calls[0]![1] as {
      budgetWarnThresholdPct?: number | null | undefined;
    };
    expect(payload.budgetWarnThresholdPct).toBeNull();
    await waitFor(
      () => expect(currentStub?.setTeamThresholdPct).toHaveBeenCalledWith(undefined),
      { timeout: 5000 }
    );

    await waitFor(async () => {
      const row = (await db.aiTeams.get(team.id))!;
      expect('budgetWarnThresholdPct' in row).toBe(false);
    });
  });

  it('leaves a stored override untouched when only the total changes (D-04, drawer untouched)', async () => {
    await db.settings.put({ key: 'budgetWarnThresholdPct', value: 80 });
    await db.aiTeams.update(team.id, { budgetWarnThresholdPct: 65 });
    team = (await db.aiTeams.get(team.id))!;

    renderWorkspace();
    await saveTotal(2000);

    await waitFor(() => expect(repoSpies.applyTeamBudgetSettings).toHaveBeenCalledTimes(1));
    const payload = repoSpies.applyTeamBudgetSettings.mock.calls[0]![1] as {
      budgetWarnThresholdPct?: number | null | undefined;
    };
    expect(payload.budgetWarnThresholdPct).toBeUndefined();
    await waitFor(async () => expect((await db.aiTeams.get(team.id))?.budgetWarnThresholdPct).toBe(65));
    // CR-04: the live mirror follows the STORED override. Passing the untouched `undefined`
    // input here reverted the live threshold to the global default while Dexie kept 65.
    await waitFor(() => expect(currentStub?.setTeamThresholdPct).toHaveBeenCalledWith(65), {
      timeout: 5000,
    });
    expect(currentStub?.setTeamThresholdPct).not.toHaveBeenCalledWith(undefined);
  });

  // WR-11: `rows` is seeded once per open, so a member added while the drawer is open had no
  // row and was absent from the save payload — it stayed at 0 forever.
  it('includes a member added while the drawer is open in the save payload (WR-11)', async () => {
    renderWorkspace();
    const input = await openDrawer();

    const late = await createEmployee(
      { name: 'Muộn', role: 'Phân tích', capability: 'c', persona: 'p', model: 'm3' },
      db
    );
    const lateMember = await addTeamMember(
      { teamId: team.id, agentId: late.id, role: 'employee', budgetTokens: 250 },
      db
    );
    // The drawer's roster is a live query; wait for it to see the new row before saving.
    await screen.findByTestId(`team-member-row-${lateMember.id}`);

    fireEvent.change(input, { target: { value: '4000' } });
    fireEvent.click(await screen.findByTestId('team-settings-save'));

    await waitFor(async () => {
      const row = await db.aiTeamMembers.get(lateMember.id);
      expect(row?.budgetTokens).toBe(250);
    });
    const payload = repoSpies.applyTeamBudgetSettings.mock.calls[0]![1] as {
      budgets: Record<string, number>;
    };
    expect(payload.budgets[lateMember.id]).toBe(250);
  });

  // The reported bug: a member added while the drawer is open had no budget row, so the
  // allocation table did not show it until the drawer was closed and reopened.
  it('shows a member added while the drawer is open in the allocation table', async () => {
    const late = await createEmployee(
      { name: 'Muộn', role: 'Phân tích', capability: 'c', persona: 'p', model: 'm3' },
      db
    );
    renderWorkspace([late]);
    await openDrawer();

    const lateMember = await addTeamMember(
      { teamId: team.id, agentId: late.id, role: 'employee', budgetTokens: 250 },
      db
    );

    const row = await screen.findByTestId(`team-member-row-${lateMember.id}`);
    expect(row).toBeInTheDocument();
    expect(await screen.findByLabelText('Ngân sách Muộn')).toBeInTheDocument();
  });

  // The reported bug: allocating to a member raised only that member's budget, not the total.
  it('raises the team total when a member budget is raised (D-19)', async () => {
    renderWorkspace();
    await openDrawer();

    const employeeRow = (await db.aiTeamMembers.toArray()).find((row) => row.role === 'employee')!;
    const before = (await db.aiTeams.get(team.id))!.budgetTokens;

    fireEvent.change(screen.getByLabelText(`Ngân sách ${employee.name}`), {
      target: { value: String(employeeRow.budgetTokens + 700) },
    });
    fireEvent.click(await screen.findByTestId('team-settings-save'));

    await waitFor(async () => {
      expect((await db.aiTeams.get(team.id))?.budgetTokens).toBe(before + 700);
    });
    const stored = await db.aiTeamMembers.get(employeeRow.id);
    expect(stored?.budgetTokens).toBe(employeeRow.budgetTokens + 700);
  });

  // The reported bug: removing a member left its share in the team total.
  it('lowers the team total when a member is removed from the drawer', async () => {
    renderWorkspace();
    await openDrawer();

    const employeeRow = (await db.aiTeamMembers.toArray()).find((row) => row.role === 'employee')!;
    const before = (await db.aiTeams.get(team.id))!.budgetTokens;

    fireEvent.click(screen.getByTestId(`team-member-remove-${employeeRow.id}`));
    fireEvent.click(await screen.findByText('Gỡ'));

    await waitFor(async () => {
      expect((await db.aiTeams.get(team.id))?.budgetTokens).toBe(
        before - employeeRow.budgetTokens
      );
    });
  });

  // WR-13: the top-up confirm was fire-and-forget, so a refusal was an unhandled rejection
  // with the modal already closed.
  it('surfaces a refused top-up in the action-error channel (WR-13)', async () => {
    currentStub!.topUp = vi.fn(async () => {
      throw new Error('Không tìm thấy thành viên trong nhóm.');
    });
    renderWorkspace();

    await screen.findByLabelText('Nội dung tin nhắn trò chuyện AI');
    fireEvent.click(await screen.findByTestId('team-topup-button'));
    const amountInput = await screen.findByRole('spinbutton');
    fireEvent.change(amountInput, { target: { value: '1000' } });
    fireEvent.click(await screen.findByTestId('budget-topup-confirm'));

    expect(
      await screen.findByTestId('team-action-error', undefined, { timeout: 5000 })
    ).toBeInTheDocument();
  });
});
