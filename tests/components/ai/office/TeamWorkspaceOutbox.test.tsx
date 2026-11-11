import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../../../src/db';
import { createEmployee, createLead } from '../../../../src/db/repositories/aiOfficeRepo';
import { createTeam } from '../../../../src/db/repositories/aiTeamRepo';
import type { AiTeam, TeamRunPhase } from '../../../../src/types/aiOffice';

/**
 * Phase 37 plan 06 — D-20/D-21 outbox (AIO-RUNTIME-02 as overridden).
 *
 * The composer never rejects and never loses text: a submit while the coordinator is busy
 * queues, a busy/blocked outcome lands in the outbox or the draft, and every dispatch path
 * (composer, outbox release, API-error-card retry) goes through `runTurn`.
 */

type SendOutcome = 'started' | 'busy' | 'blocked';

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
  subscribe: (fn: () => void) => () => void;
  getState: () => unknown;
  setPhase: (phase: TeamRunPhase) => void;
}

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

function createStub(initialPhase: TeamRunPhase = 'ready'): StubCoordinator {
  let phase: TeamRunPhase = initialPhase;
  const listeners = new Set<() => void>();
  const stub: StubCoordinator = {
    // Mirrors the real coordinator (37-03): a busy phase resolves 'busy', never a turn.
    send: vi.fn(async () => (BUSY.has(phase) ? 'busy' : 'started') as SendOutcome),
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
import { BUSY_PHASES as BUSY } from '../../../../src/services/ai/office/teamRunCoordinator';
import { ensureTeamThread, saveTeamMessage } from '../../../../src/db/repositories/teamTranscriptRepo';

describe('TeamWorkspace outbox (37-06, D-20/D-21)', () => {
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

  it('queues a second submit, renders it above the composer, and dispatches it once the first settles', async () => {
    const first = deferred<SendOutcome>();
    currentStub.send = vi.fn(() => first.promise) as never;

    const composer = await renderWorkspace();
    await submit(composer, 'A');
    await waitFor(() => expect(currentStub.send).toHaveBeenCalledTimes(1));
    expect(currentStub.send).toHaveBeenCalledWith('A');

    await submit(composer, 'B');
    // The second submit is queued, not dropped, and not sent concurrently.
    expect(currentStub.send).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('B')).toBeInTheDocument();
    expect(screen.getAllByTestId('team-outbox-item')).toHaveLength(1);
    expect((composer as HTMLTextAreaElement).value).toBe('');

    first.resolve('started');
    await waitFor(() => expect(currentStub.send).toHaveBeenCalledTimes(2));
    expect(currentStub.send).toHaveBeenLastCalledWith('B');
    await waitFor(() => expect(screen.queryAllByTestId('team-outbox-item')).toHaveLength(0));
  });

  it('queues while the coordinator is parked on a budget gate (D-21)', async () => {
    currentStub = createStub('awaiting-budget');
    const composer = await renderWorkspace();
    await submit(composer, 'Trong lúc chờ ngân sách');

    expect(currentStub.send).not.toHaveBeenCalled();
    expect(screen.getAllByTestId('team-outbox-item')).toHaveLength(1);
  });

  it('queues when a turn this component never started holds the phase', async () => {
    currentStub = createStub('batch-running');
    const composer = await renderWorkspace();
    await submit(composer, 'C');

    expect(currentStub.send).not.toHaveBeenCalled();
    expect(await screen.findByText('C')).toBeInTheDocument();
    expect(screen.getAllByTestId('team-outbox-item')).toHaveLength(1);
  });

  it("puts the text back in the outbox when send resolves 'busy', and dispatches it later", async () => {
    currentStub = createStub('ready');
    // The snapshot said `ready`, the coordinator disagrees — a turn started elsewhere in the
    // same tick. That is exactly the requeue edge `runTurn` owns.
    currentStub.send = vi.fn(async () => {
      currentStub.setPhase('batch-running');
      return 'busy' as SendOutcome;
    }) as never;

    const composer = await renderWorkspace();
    await submit(composer, 'Chen ngang');

    await waitFor(() => expect(screen.getAllByTestId('team-outbox-item')).toHaveLength(1));
    expect(screen.getByTestId('team-outbox-item').textContent).toContain('Chen ngang');
    expect(currentStub.send).toHaveBeenCalledTimes(1);

    // The live turn settles; now the queued text may run.
    currentStub.send = vi.fn(async () => 'started' as SendOutcome) as never;
    currentStub.setPhase('ready');

    await waitFor(() => expect(currentStub.send).toHaveBeenCalledTimes(1));
    expect(currentStub.send).toHaveBeenCalledWith('Chen ngang');
    await waitFor(() => expect(screen.queryAllByTestId('team-outbox-item')).toHaveLength(0));
  });

  it("surfaces a 'blocked' send, restores the draft, and never requeues (no loop)", async () => {
    currentStub = createStub('ready');
    currentStub.send = vi.fn().mockResolvedValue('blocked' as SendOutcome) as never;

    const composer = await renderWorkspace();
    await submit(composer, 'Nhóm đã bị xoá');

    expect(await screen.findByLabelText('Thử lại')).toBeInTheDocument();
    await waitFor(() => expect((composer as HTMLTextAreaElement).value).toBe('Nhóm đã bị xoá'));
    expect(screen.queryAllByTestId('team-outbox-item')).toHaveLength(0);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(currentStub.send).toHaveBeenCalledTimes(1);
  });

  it('surfaces a leader-lock failure and restores the draft', async () => {
    lockLeaderRejects = true;
    const composer = await renderWorkspace();
    await submit(composer, 'Khoá leader thất bại');

    await waitFor(() => expect((composer as HTMLTextAreaElement).value).toBe('Khoá leader thất bại'));
    expect(currentStub.send).not.toHaveBeenCalled();
    expect(screen.queryAllByTestId('team-outbox-item')).toHaveLength(0);
    // IN-05: the repo error text (which can embed ids) must never reach the UI.
    await waitFor(() =>
      expect(document.body.textContent).toContain('Không khoá được leader cho nhóm')
    );
    expect(document.body.textContent).not.toContain('raw repo detail');
  });

  it('renders three queued entries, cancels the middle one, and keeps the rest in order', async () => {
    currentStub = createStub('batch-running');
    const composer = await renderWorkspace();
    await submit(composer, 'Một');

    // Type into the draft again: the composer stays usable while a turn runs (WR-11).
    fireEvent.change(composer, { target: { value: 'Hai' } });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));
    fireEvent.change(composer, { target: { value: 'Ba' } });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));

    const items = () => screen.getAllByTestId('team-outbox-item');
    await waitFor(() => expect(items()).toHaveLength(3));
    expect(screen.getByTestId('team-outbox').textContent).toContain('Đang xếp hàng (3)');
    expect(items().map((el) => el.textContent)).toEqual([
      expect.stringContaining('Một'),
      expect.stringContaining('Hai'),
      expect.stringContaining('Ba'),
    ]);

    fireEvent.click(screen.getAllByTestId('team-outbox-cancel')[1]!);

    await waitFor(() => expect(items()).toHaveLength(2));
    expect(screen.getByTestId('team-outbox').textContent).toContain('Đang xếp hàng (2)');
    expect(items().map((el) => el.textContent)).toEqual([
      expect.stringContaining('Một'),
      expect.stringContaining('Ba'),
    ]);
    expect(screen.queryByText('Hai')).not.toBeInTheDocument();
    expect(currentStub.send).not.toHaveBeenCalled();
  });

  it('retry from the API-error card while a turn is live lands in the outbox and clears the error', async () => {
    currentStub = createStub('ready');
    currentStub.send = vi.fn().mockResolvedValue('blocked' as SendOutcome) as never;
    const composer = await renderWorkspace();
    await submit(composer, 'Thử lại khi đang chạy');
    const retry = await screen.findByLabelText('Thử lại');

    currentStub.setPhase('batch-running');
    // 37-03 contract: a submit during a live phase resolves 'busy', so this is the requeue edge.
    currentStub.send = vi.fn(async () => 'busy' as SendOutcome) as never;
    fireEvent.click(retry);

    await waitFor(() => expect(screen.getAllByTestId('team-outbox-item')).toHaveLength(1));
    // `runTurn` clears the error before dispatching, so the card cannot outlive its retry.
    await waitFor(() => expect(screen.queryByLabelText('Thử lại')).not.toBeInTheDocument());
  });

  it('retry from the API-error card on a free phase dispatches and clears the error', async () => {
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
      const retry = await screen.findByTestId('agent-retry-assignment-1');
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
