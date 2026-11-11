import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../../../src/db';
import { createEmployee, createLead } from '../../../../src/db/repositories/aiOfficeRepo';
import { createTeam } from '../../../../src/db/repositories/aiTeamRepo';
import type { AiTeam } from '../../../../src/types/aiOffice';
import type { TeamRunCoordinator } from '../../../../src/services/ai/office/teamRunCoordinator';
import { disposeAllRuns, getOrCreateRun, peekRun } from '../../../../src/services/ai/office/teamRunManager';
import { useLayoutStore } from '../../../../src/workbench/store/layoutStore';

/**
 * Phase 37 plan 06 — D-18 / T-37-20: deleting a team disposes its run FIRST.
 *
 * The explorer never mounts `TeamWorkspace`, so this is the only path where teardown is
 * provably required. The call order is asserted, not described.
 */

const callOrder: string[] = [];
let disposeRejects = false;

vi.mock('../../../../src/db/repositories/aiTeamRepo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/db/repositories/aiTeamRepo')>();
  return {
    ...actual,
    deleteTeam: vi.fn(async (...args: Parameters<typeof actual.deleteTeam>) => {
      callOrder.push('delete');
      return actual.deleteTeam(...args);
    }),
  };
});

import { AiOfficeExplorer } from '../../../../src/workbench/toolwindows/AiOfficeExplorer';
import { getTeam } from '../../../../src/db/repositories/aiTeamRepo';

function stubCoordinator(): TeamRunCoordinator {
  return {
    dispose: vi.fn(async () => {
      callOrder.push('dispose');
      if (disposeRejects) throw new Error('dispose thất bại');
    }),
  } as unknown as TeamRunCoordinator;
}

describe('AiOfficeExplorer teardown on delete (37-06, D-18)', () => {
  let db: TaskPlannerDatabase;
  let team: AiTeam;

  beforeEach(async () => {
    callOrder.length = 0;
    disposeRejects = false;
    db = new TaskPlannerDatabase('test-office-teardown-' + Math.random().toString(36).slice(2));
    await db.open();
    useLayoutStore.getState().resetLayout();
    const lead = await createLead(
      {
        name: 'Bình Lead',
        role: 'Lead',
        capability: 'Điều phối.',
        persona: 'Bạn là lead.',
        model: 'claude-opus-4',
      },
      db
    );
    const employee = await createEmployee(
      {
        name: 'An Nhân viên',
        role: 'Phân tích',
        capability: 'Phân tích.',
        persona: 'Bạn là An.',
        model: 'claude-sonnet-4',
      },
      db
    );
    team = await createTeam(
      {
        name: 'Nhóm cần xoá',
        status: 'active',
        budgetTokens: 1000,
        leadId: lead.id,
        employeeIds: [employee.id],
      },
      db
    );
  });

  afterEach(async () => {
    await disposeAllRuns();
    await db.delete();
    vi.clearAllMocks();
  });

  const deleteThroughUi = async () => {
    render(<AiOfficeExplorer db={db} />);
    fireEvent.click(await screen.findByTestId(`ai-office-team-delete-${team.id}`));
    fireEvent.click(await screen.findByRole('button', { name: 'Xóa' }));
  };

  it('disposes the run before deleting the team row', async () => {
    await getOrCreateRun(db, team.id, 'thread-1', stubCoordinator);
    expect(peekRun(db, team.id)).toBeDefined();

    await deleteThroughUi();

    await waitFor(() => expect(callOrder).toEqual(['dispose', 'delete']));
    expect(await getTeam(team.id, db)).toBeUndefined();
    expect(peekRun(db, team.id)).toBeUndefined();
  });

  it('keeps the team row when dispose fails, and reports it', async () => {
    disposeRejects = true;
    await getOrCreateRun(db, team.id, 'thread-1', stubCoordinator);

    await deleteThroughUi();

    expect(await screen.findByTestId('ai-office-team-delete-error')).toBeInTheDocument();
    expect(await getTeam(team.id, db)).toBeDefined();
    expect(callOrder).toEqual(['dispose']);
  });
});
