import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../../../src/db';
import { createEmployee, createLead } from '../../../../src/db/repositories/aiOfficeRepo';
import { createTeam } from '../../../../src/db/repositories/aiTeamRepo';
import type { AiTeam, TeamRunPhase } from '../../../../src/types/aiOffice';
import { makeTeamRunSnapshot } from '../../../helpers/teamRunSnapshot';

/**
 * 44-03 Task 3 (D-15/D-16): the Debug Prompt dropdown item and modal are gone; their content
 * lives only in the rail's Prompt log tab, reachable through the Activity affordance.
 * Mount harness mirrors TeamWorkspaceSteer.test.tsx (coordinator stub + fake-indexeddb + settings).
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
  getRunningCount: () => number;
  finalizeAttempt: ReturnType<typeof vi.fn>;
  runBatch: ReturnType<typeof vi.fn>;
  retryAssignment: ReturnType<typeof vi.fn>;
  drainSteerInbox: ReturnType<typeof vi.fn>;
  subscribe: (fn: () => void) => () => void;
  getState: () => unknown;
  setPhase: (phase: TeamRunPhase) => void;
}

function createStub(): StubCoordinator {
  let phase: TeamRunPhase = 'ready';
  const listeners = new Set<() => void>();
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
    getRunningCount: () => 0,
    finalizeAttempt: vi.fn(async () => null),
    runBatch: vi.fn(async () => ''),
    retryAssignment: vi.fn(async () => undefined),
    drainSteerInbox: vi.fn(async () => []),
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    getState: () => makeTeamRunSnapshot({ phase }),
    setPhase: (next: TeamRunPhase) => { phase = next; for (const l of listeners) l(); },
  };
}

let currentStub: StubCoordinator;
vi.mock('../../../../src/services/ai/office/teamRunCoordinator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/services/ai/office/teamRunCoordinator')>();
  return { ...actual, createTeamRunCoordinator: vi.fn(() => currentStub) };
});

import { TeamWorkspace } from '../../../../src/components/ai/office/TeamWorkspace';

describe('TeamWorkspace debug menu removal and Prompt log rail (44-03 D-15/D-16)', () => {
  let db: TaskPlannerDatabase;
  let team: AiTeam;

  beforeEach(async () => {
    currentStub = createStub();
    db = new TaskPlannerDatabase('test-team-debug-menu-' + Math.random().toString(36).slice(2));
    await db.open();
    await db.settings.put({ key: 'ninerouter_api_key', value: 'sk-test' });
    await db.settings.put({ key: 'ninerouter_endpoint', value: 'https://example.invalid/v1' });
    const lead = await createLead({
      name: 'Bình Lead', role: 'Lead', capability: 'Điều phối.', persona: 'Bạn là lead.', model: 'claude-opus-4',
    }, db);
    const employee = await createEmployee({
      name: 'An Nhân viên', role: 'Phân tích', capability: 'Phân tích.', persona: 'Bạn là An.', model: 'claude-sonnet-4',
    }, db);
    team = await createTeam({
      name: 'Nhóm thử', budgetTokens: 1000, leadId: lead.id, employeeIds: [employee.id],
    }, db);
  });

  afterEach(async () => {
    await db.delete();
    vi.clearAllMocks();
  });

  const mount = async () => {
    render(<TeamWorkspace team={team} lead={undefined} members={[]} employees={[]} skills={[]} db={db} />);
    await screen.findByLabelText('Nội dung tin nhắn trò chuyện AI');
  };

  it('has no Debug Prompt menu item and no debug modal, while the settings item remains', async () => {
    await mount();

    // Open the header overflow dropdown and inspect the rendered menu DOM.
    fireEvent.click(screen.getByLabelText('Thao tác nhóm'));
    await waitFor(() => expect(screen.getByText('Cài đặt nhóm')).toBeInTheDocument());
    expect(screen.queryByText(/Debug Prompt \(/)).not.toBeInTheDocument();
    expect(screen.queryByText('Lịch sử Prompt gửi tới AI trong nhóm')).not.toBeInTheDocument();
  });

  it('exposes the Activity affordance that opens the rail and shows the empty Prompt log', async () => {
    await mount();

    const affordance = screen.getByTestId('team-activity-affordance');
    expect(affordance).toHaveAttribute('aria-expanded', 'true');
    expect(affordance).toHaveAttribute('aria-controls', 'agent-activity-rail');
    // Rail is present and default-open on desktop.
    expect(screen.getByTestId('agent-activity-panel')).toBeInTheDocument();

    // Header close and the affordance share one open state.
    fireEvent.click(screen.getByLabelText('Đóng activity rail'));
    await waitFor(() => expect(screen.queryByTestId('agent-activity-panel')).not.toBeInTheDocument());
    expect(affordance).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(affordance);
    await waitFor(() => expect(screen.getByTestId('agent-activity-panel')).toBeInTheDocument());
    expect(affordance).toHaveAttribute('aria-expanded', 'true');

    // The migrated Prompt log is reachable through the rail with preserved empty copy.
    fireEvent.click(screen.getByRole('tab', { name: 'Prompt log' }));
    expect(screen.getByText('Chưa có lượt gửi AI nào trong phiên này.')).toBeInTheDocument();
  });
});
