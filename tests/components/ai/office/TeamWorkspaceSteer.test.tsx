import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../../../src/db';
import { createEmployee, createLead } from '../../../../src/db/repositories/aiOfficeRepo';
import { createTeam } from '../../../../src/db/repositories/aiTeamRepo';
import type { AiTeam, TeamRunPhase } from '../../../../src/types/aiOffice';

/**
 * 37.1 D-01/D-02: the composer is always usable. A submit during a live run is a steer, not
 * a queued second turn, so there is no outbox and no phase gate. The only outcome that
 * restores the draft is `'blocked'` (D-12).
 *
 * Renamed from `TeamWorkspaceOutbox.test.tsx` by plan 06 — the outbox no longer exists, so
 * every assertion here is about steering, not queueing.
 */

type SendOutcome = 'started' | 'steered' | 'refused' | 'blocked';

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
  getRunningCount: () => number;
  finalizeAttempt: ReturnType<typeof vi.fn>;
  runBatch: ReturnType<typeof vi.fn>;
  retryAssignment: ReturnType<typeof vi.fn>;
  drainSteerInbox: ReturnType<typeof vi.fn>;
  subscribe: (fn: () => void) => () => void;
  getState: () => unknown;
  setPhase: (phase: TeamRunPhase) => void;
}

function createStub(initialPhase: TeamRunPhase = 'ready'): StubCoordinator {
  let phase: TeamRunPhase = initialPhase;
  const listeners = new Set<() => void>();
  const stub: StubCoordinator = {
    // 37.1: every submit is accepted; the coordinator decides start vs steer.
    send: vi.fn(async () => 'started' as SendOutcome),
    stopAgent: vi.fn(),
    abortAll: vi.fn(),
    resolvePlan: vi.fn(),
    resolveApproval: vi.fn(),
    topUp: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined),
    setTeamSettings: vi.fn(),
    setTeamBudget: vi.fn(),
    getRunningCount: () => 0,
    finalizeAttempt: vi.fn(async () => null),
    runBatch: vi.fn(async () => ''),
    retryAssignment: vi.fn(async () => undefined),
    drainSteerInbox: vi.fn(async () => []),
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    getState: () => ({
      phase,
      agents: [],
      pendingPlan: null,
      pendingApproval: null,
      pendingSteerMessageIds: [],
      pausedAgentId: null,
      pausedAgentName: null,
      lastPlan: null,
      lastPlanDecision: null,
    }),
    setPhase: (next: TeamRunPhase) => {
      phase = next;
      for (const listener of listeners) listener();
    },
  };
  return stub;
}

let currentStub: StubCoordinator;

vi.mock('../../../../src/services/ai/office/teamRunCoordinator', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../src/services/ai/office/teamRunCoordinator')>();
  return {
    ...actual,
    createTeamRunCoordinator: vi.fn(() => currentStub),
  };
});

/** Leader-lock failure is produced by the repo, so only that one call is stubbed. */
let lockLeaderRejects = false;
vi.mock('../../../../src/db/repositories/aiTeamRepo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/db/repositories/aiTeamRepo')>();
  return {
    ...actual,
    lockLeader: vi.fn(async (...args: Parameters<typeof actual.lockLeader>) => {
      if (lockLeaderRejects) throw new Error('raw repo detail: team 7c1f9e');
      return actual.lockLeader(...args);
    }),
  };
});

import { TeamWorkspace } from '../../../../src/components/ai/office/TeamWorkspace';
import { ensureTeamThread, saveTeamMessage } from '../../../../src/db/repositories/teamTranscriptRepo';

describe('TeamWorkspace composer (37.1 D-01/D-02/D-12)', () => {
  let db: TaskPlannerDatabase;
  let team: AiTeam;

  beforeEach(async () => {
    lockLeaderRejects = false;
    currentStub = createStub();
    db = new TaskPlannerDatabase('test-team-outbox-' + Math.random().toString(36).slice(2));
    await db.open();
    await db.settings.put({ key: 'ninerouter_api_key', value: 'sk-test' });
    await db.settings.put({ key: 'ninerouter_endpoint', value: 'https://example.invalid/v1' });
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
        name: 'Nhóm thử',
        status: 'active',
        budgetTokens: 1000,
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

  const renderWorkspace = async () => {
    render(<TeamWorkspace team={team} lead={undefined} members={[]} employees={[]} skills={[]} db={db} onBack={() => {}} />);
    return screen.findByLabelText('Nội dung tin nhắn trò chuyện AI');
  };

  const submit = async (composer: HTMLElement, text: string) => {
    fireEvent.change(composer, { target: { value: text } });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));
  };

  it.each<TeamRunPhase>([
    'idle',
    'ready',
    'lead-thinking',
    'awaiting-plan',
    'batch-running',
    'awaiting-budget',
    'awaiting-mutation-approval',
    'lead-synthesizing',
  ])('never renders an outbox panel in phase %s', async (phase) => {
    currentStub = createStub(phase);
    await renderWorkspace();
    expect(screen.queryByTestId('team-outbox')).not.toBeInTheDocument();
    expect(screen.queryByTestId('team-outbox-item')).not.toBeInTheDocument();
  });

  it('dispatches a submit during a live phase immediately, with no outbox', async () => {
    currentStub = createStub('batch-running');
    const composer = await renderWorkspace();
    await submit(composer, 'Chen ngang');

    await waitFor(() => expect(currentStub.send).toHaveBeenCalledWith('Chen ngang'));
    expect(screen.queryByTestId('team-outbox')).not.toBeInTheDocument();
    expect((composer as HTMLTextAreaElement).value).toBe('');
  });

  it('never queues: three rapid submits produce three send calls', async () => {
    currentStub = createStub('batch-running');
    const composer = await renderWorkspace();
    await submit(composer, 'Một');
    await submit(composer, 'Hai');
    await submit(composer, 'Ba');

    await waitFor(() => expect(currentStub.send).toHaveBeenCalledTimes(3));
    expect(currentStub.send.mock.calls.map((call) => call[0])).toEqual(['Một', 'Hai', 'Ba']);
    expect(screen.queryByTestId('team-outbox')).not.toBeInTheDocument();
  });

  it("leaves the input empty and shows no error on 'steered'", async () => {
    currentStub.send = vi.fn().mockResolvedValue('steered' as SendOutcome) as never;
    const composer = await renderWorkspace();
    await submit(composer, 'Chỉ đạo giữa lô');

    await waitFor(() => expect(currentStub.send).toHaveBeenCalledTimes(1));
    expect((composer as HTMLTextAreaElement).value).toBe('');
    expect(screen.queryByLabelText('Thử lại')).not.toBeInTheDocument();
  });

  it("leaves the input empty and shows no error on 'refused'", async () => {
    currentStub.send = vi.fn().mockResolvedValue('refused' as SendOutcome) as never;
    const composer = await renderWorkspace();
    await submit(composer, 'Nhân viên đã xong');

    await waitFor(() => expect(currentStub.send).toHaveBeenCalledTimes(1));
    // Plan 04 already persisted the row — restoring the draft would send it twice.
    expect((composer as HTMLTextAreaElement).value).toBe('');
    expect(screen.queryByLabelText('Thử lại')).not.toBeInTheDocument();
  });

  it('ignores a whitespace-only submit on both the click and the Cmd+Enter path', async () => {
    const composer = await renderWorkspace();
    for (const text of ['   ', '\n\t']) {
      fireEvent.change(composer, { target: { value: text } });
      fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));
      fireEvent.keyDown(composer, { key: 'Enter', ctrlKey: true });
    }
    // Give any stray async dispatch a chance to land before asserting silence.
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(currentStub.send).not.toHaveBeenCalled();
    // A no-op submit never consumes the text.
    expect((composer as HTMLTextAreaElement).value).toBe('\n\t');

    const thread = await ensureTeamThread(team.id, db);
    const userRows = (await db.chatMessages.where('threadId').equals(thread.id).toArray()).filter(
      (row) => row.role === 'user'
    );
    expect(userRows).toHaveLength(0);
  });

  it("surfaces a 'blocked' send, restores the draft, and never requeues (no loop)", async () => {
    currentStub = createStub('ready');
    currentStub.send = vi.fn().mockResolvedValue('blocked' as SendOutcome) as never;

    const composer = await renderWorkspace();
    await submit(composer, 'Nhóm đã bị xoá');

    expect(await screen.findByLabelText('Thử lại')).toBeInTheDocument();
    await waitFor(() => expect((composer as HTMLTextAreaElement).value).toBe('Nhóm đã bị xoá'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(currentStub.send).toHaveBeenCalledTimes(1);
  });

  it('shows a local warning for missing leader without claiming provider outage', async () => {
    await db.aiTeams.update(team.id, { leadId: undefined });
    const { leadId: _leadId, ...leaderless } = team;
    team = leaderless;
    currentStub.send = vi.fn().mockResolvedValue('refused') as never;
    const composer = await renderWorkspace();
    await submit(composer, 'Xin chào nhóm');
    expect(await screen.findByText('Nhóm chưa có trưởng nhóm')).toBeInTheDocument();
    expect(screen.queryByTestId('inline-api-error-card')).not.toBeInTheDocument();
    expect(screen.queryByText(/Không thể kết nối đến dịch vụ AI/)).not.toBeInTheDocument();
  });

  it('surfaces a leader-lock failure and restores the draft', async () => {
    lockLeaderRejects = true;
    const composer = await renderWorkspace();
    await submit(composer, 'Khoá leader thất bại');

    await waitFor(() => expect((composer as HTMLTextAreaElement).value).toBe('Khoá leader thất bại'));
    expect(currentStub.send).not.toHaveBeenCalled();
    // IN-05: the repo error text (which can embed ids) must never reach the UI.
    await waitFor(() =>
      expect(document.body.textContent).toContain('Không khoá được leader cho nhóm')
    );
    expect(document.body.textContent).not.toContain('raw repo detail');
  });

  it('retry from the API-error card dispatches and clears the error', async () => {
    currentStub = createStub('ready');
    currentStub.send = vi.fn().mockResolvedValue('blocked' as SendOutcome) as never;
    const composer = await renderWorkspace();
    await submit(composer, 'Thử lại khi rảnh');
    const retry = await screen.findByLabelText('Thử lại');

    currentStub.send = vi.fn(async () => 'started' as SendOutcome) as never;
    fireEvent.click(retry);

    await waitFor(() => expect(currentStub.send).toHaveBeenCalledTimes(1));
    expect(currentStub.send).toHaveBeenCalledWith('Thử lại khi rảnh');
    await waitFor(() => expect(screen.queryByLabelText('Thử lại')).not.toBeInTheDocument());
  });

  it('retry from the API-error card while a turn is live steers and clears the error', async () => {
    currentStub = createStub('ready');
    currentStub.send = vi.fn().mockResolvedValue('blocked' as SendOutcome) as never;
    const composer = await renderWorkspace();
    await submit(composer, 'Thử lại khi đang chạy');
    const retry = await screen.findByLabelText('Thử lại');

    currentStub.setPhase('batch-running');
    currentStub.send = vi.fn(async () => 'steered' as SendOutcome) as never;
    fireEvent.click(retry);

    await waitFor(() => expect(currentStub.send).toHaveBeenCalledTimes(1));
    // `runTurn` clears the error before dispatching, so the card cannot outlive its retry.
    await waitFor(() => expect(screen.queryByLabelText('Thử lại')).not.toBeInTheDocument());
    expect(screen.queryByTestId('team-outbox')).not.toBeInTheDocument();
  });

  // 37.1 §1.1: a message to an agent is an ordinary user message. There is no "Chỉ đạo"
  // caption and no delivery badge — the recipient's cursor is the only read receipt, and it
  // renders as the seen indicator on the message itself.
  it('renders a message to an agent with no steer caption and no badge', async () => {
    const thread = await ensureTeamThread(team.id, db);
    const leadRow = (await db.aiLeads.get(team.leadId!))!;
    const employee = (await db.aiEmployees.toArray())[0]!;
    await saveTeamMessage(
      {
        threadId: thread.id,
        role: 'user',
        content: `@[${employee.name}](agent:${employee.id}) làm thêm X`,
      },
      db
    );

    render(
      <TeamWorkspace
        team={team}
        lead={leadRow}
        members={[]}
        employees={[employee]}
        skills={[]}
        db={db}
        onBack={() => {}}
      />
    );

    expect(await screen.findByText(/làm thêm X/)).toBeInTheDocument();
    expect(screen.queryByTestId(/^steer-label-/)).toBeNull();
    expect(screen.queryByTestId(/^steer-badge-/)).toBeNull();
    expect(screen.queryByText('Chỉ đạo')).toBeNull();
  });

  // WR-02: `retryAssignment` throws for a busy phase / disposed run. The only call site
  // discarded it, so the user got no feedback and the app got an unhandled rejection.
  it('surfaces a refused assignment retry as fixed copy, not a rejection', async () => {
    const thread = await ensureTeamThread(team.id, db);
    // The workspace renders `employees={[]}`, so only the lead is in the agent directory —
    // attribute the failed report to the lead so the status row (and its retry) renders.
    await saveTeamMessage(
      {
        threadId: thread.id,
        role: 'assistant',
        content: 'Báo cáo lỗi',
        agentId: team.leadId!,
        agentName: 'Bình Lead',
        agentKind: 'lead',
        messageKind: 'report',
        assignmentId: 'assignment-1',
        attemptNo: 1,
        runStatus: 'error',
        stopReason: 'provider',
        incomplete: true,
      },
      db
    );
    currentStub = createStub('ready');
    currentStub.retryAssignment = vi.fn().mockRejectedValue(
      new Error('raw repo detail: assignment 9f3a2b')
    ) as never;

    const unhandled: unknown[] = [];
    const onUnhandled = (err: unknown) => unhandled.push(err);
    process.on('unhandledRejection', onUnhandled);

    try {
      // `renderWorkspace` passes no lead, so its agent directory is empty. This case needs
      // the attributed bubble, so pass the persisted lead explicitly.
      const leadRow = await db.aiLeads.get(team.leadId!);
      render(
        <TeamWorkspace
          team={team}
          lead={leadRow}
          members={[]}
          employees={[]}
          skills={[]}
          db={db}
          onBack={() => {}}
        />
      );
      const retry = await screen.findByTestId('agent-retry-assignment-1', {}, { timeout: 5000 });
      fireEvent.click(retry);

      const card = await screen.findByTestId('team-action-error');
      expect(card.textContent).toContain('Chưa thể chạy lại lần này');
      // The raw coordinator message never reaches the UI.
      expect(card.textContent).not.toContain('raw repo detail');
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(unhandled).toHaveLength(0);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});
