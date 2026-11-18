import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../../../src/db';
import { createEmployee, createLead } from '../../../../src/db/repositories/aiOfficeRepo';
import { createTeam, getTeam } from '../../../../src/db/repositories/aiTeamRepo';
import type { AiTeam } from '../../../../src/types/aiOffice';
import { makeTeamRunSnapshot } from '../../../helpers/teamRunSnapshot';

/**
 * Bug 2 regression: the settings drawer's "Tự động chia việc" (autoSplitEnabled) switch must be
 * persisted to the team row on save — not only mirrored to the transient coordinator. Otherwise
 * reopening the drawer shows the stale value and the DB→coordinator sync effect reverts runtime.
 *
 * Oracle: specified (the DB row's autoSplitEnabled must equal the saved switch state).
 * Boundary neighbours: toggling ON from off and OFF from on.
 */

vi.mock('../../../../src/components/ai/AiChatWidget', () => ({
  AiChatWidget: () => <div data-testid="mock-chat-widget" />,
}));

const setTeamSettings = vi.fn();
vi.mock('../../../../src/services/ai/office/teamRunCoordinator', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../src/services/ai/office/teamRunCoordinator')>();
  return {
    ...actual,
    createTeamRunCoordinator: vi.fn(() => ({
      send: vi.fn(async () => 'started' as const),
      stopAgent: vi.fn(),
      abortAll: vi.fn(),
      resolvePlan: vi.fn(),
      resolveApproval: vi.fn(),
      topUp: vi.fn(async () => undefined),
      dispose: vi.fn(async () => undefined),
      setTeamSettings,
      setTeamBudget: vi.fn(),
      setTeamThresholdPct: vi.fn(),
      setGlobalThresholdPct: vi.fn(),
      getRunningCount: () => 0,
      finalizeAttempt: vi.fn(async () => null),
      runBatch: vi.fn(async () => ''),
      retryAssignment: vi.fn(async () => undefined),
      subscribe: () => () => {},
      getState: () => makeTeamRunSnapshot({ phase: 'ready' }),
    })),
  };
});

import { TeamWorkspace } from '../../../../src/components/ai/office/TeamWorkspace';

describe('TeamWorkspace settings drawer persists autoSplitEnabled', () => {
  let db: TaskPlannerDatabase;
  let team: AiTeam;

  beforeEach(async () => {
    setTeamSettings.mockClear();
    db = new TaskPlannerDatabase('test-team-settings-persist-' + Math.random().toString(36).slice(2));
    await db.open();
    await db.settings.put({ key: 'ninerouter_api_key', value: 'sk-test' });
    await db.settings.put({ key: 'ninerouter_endpoint', value: 'https://example.invalid/v1' });
    const lead = await createLead(
      { name: 'Bình Lead', role: 'Lead', capability: 'Điều phối.', persona: 'Bạn là lead.', model: 'claude-opus-4' },
      db
    );
    const employee = await createEmployee(
      { name: 'An Nhân viên', role: 'Phân tích', capability: 'Phân tích.', persona: 'Bạn là An.', model: 'claude-sonnet-4' },
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

  it('persists an enabled autoSplit switch to the team row on save', async () => {
    render(<TeamWorkspace team={{ ...team, autoSplitEnabled: false }} lead={undefined} members={[]} employees={[]} skills={[]} db={db} />);

    // Open the settings drawer via the sidebar button.
    fireEvent.click(await screen.findByTestId('team-open-settings'));

    const drawer = await screen.findByTestId('team-settings-drawer');
    const toggle = within(drawer).getByRole('switch', { name: 'Tự động chia việc' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByTestId('team-settings-save'));

    await waitFor(async () => {
      const stored = await getTeam(team.id, db);
      expect(stored?.autoSplitEnabled).toBe(true);
    });
  });
});
