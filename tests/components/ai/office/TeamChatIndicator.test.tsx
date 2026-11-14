import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../../../src/db';
import { createEmployee, createLead } from '../../../../src/db/repositories/aiOfficeRepo';
import { createTeam } from '../../../../src/db/repositories/aiTeamRepo';
import type {
  AgentRunState,
  AiTeam,
  TeamRunPhase,
} from '../../../../src/types/aiOffice';
import {
  PHASE_ACTIVITY_VERB,
  TeamActivityIndicator,
} from '../../../../src/components/ai/office/TeamActivityIndicator';
import type { AgentAttributionAgent } from '../../../../src/components/ai/office/AgentAttributionRow';

/**
 * 37.1 D-19..D-22: no streaming bubble, one inline activity line, and a click-through
 * popover with per-agent steps and Stop. The popover is the only Stop affordance for a
 * queued agent once `liveBubbles` is gone.
 */

const LEAD_ID = 'lead-1';
const AN_ID = 'agent-an';
const BINH_ID = 'agent-binh';

const directory = new Map<string, AgentAttributionAgent>([
  [LEAD_ID, { agentId: LEAD_ID, name: 'Bình', role: 'Lead', isLead: true, color: '#5b4fe8' }],
  [AN_ID, { agentId: AN_ID, name: 'An', role: 'Phân tích', isLead: false, color: '#22d3ee' }],
  [BINH_ID, { agentId: BINH_ID, name: 'Bình 2', role: 'Kỹ sư', isLead: false, color: '#338555' }],
]);

function agentState(overrides: Partial<AgentRunState> & { agentId: string }): AgentRunState {
  return { status: 'running', streamingText: '', ...overrides };
}

const renderIndicator = (
  phase: TeamRunPhase,
  agents: AgentRunState[],
  onStopAgent?: (agentId: string) => void
) =>
  render(
    <TeamActivityIndicator
      phase={phase}
      agents={agents}
      agentDirectory={directory}
      leadId={LEAD_ID}
      {...(onStopAgent ? { onStopAgent } : {})}
    />
  );

const openPopover = () => {
  fireEvent.click(screen.getByTestId('team-activity-indicator'));
};

describe('TeamActivityIndicator — inline line (D-20/D-21)', () => {
  it.each([
    ['lead-thinking', 'đang phân tích'],
    ['awaiting-plan', 'đang lập kế hoạch'],
    ['lead-synthesizing', 'đang tổng hợp'],
    ['awaiting-budget', 'đang chờ ngân sách'],
  ] as const)('renders the %s verb for a running lead', (phase, verb) => {
    expect(PHASE_ACTIVITY_VERB[phase]).toBe(verb);
    renderIndicator(phase, [agentState({ agentId: LEAD_ID })]);

    expect(screen.getByTestId('team-activity-indicator').textContent).toContain(
      `Bình ${verb}`
    );
  });

  // 37.1 UAT gap 6: while the batch runs the lead is finishing its dispatch answer, not
  // doing batch work. Giving it the batch verb read as "the leader is still working".
  it('gives the lead its own verb while the batch runs', () => {
    renderIndicator('batch-running', [agentState({ agentId: LEAD_ID })]);

    expect(screen.getByTestId('team-activity-indicator').textContent).toBe(
      'Bình đang giao việc'
    );
  });

  it('joins two running employees with a middle dot', () => {
    renderIndicator('batch-running', [
      agentState({ agentId: AN_ID }),
      agentState({ agentId: BINH_ID }),
    ]);

    expect(screen.getByTestId('team-activity-indicator').textContent).toBe(
      'An đang làm việc · Bình 2 đang làm việc'
    );
  });

  it('renders the budget verb for a paused agent', () => {
    renderIndicator('awaiting-budget', [agentState({ agentId: AN_ID, status: 'paused' })]);

    expect(screen.getByTestId('team-activity-indicator').textContent).toContain(
      'An đang chờ ngân sách'
    );
  });

  it('leaves a queued agent out of the inline line', () => {
    renderIndicator('batch-running', [
      agentState({ agentId: AN_ID, status: 'queued' }),
      agentState({ agentId: BINH_ID }),
    ]);

    const line = screen.getByTestId('team-activity-indicator').textContent ?? '';
    expect(line).not.toContain('An');
    expect(line).toContain('Bình 2');
  });

  it.each(['idle', 'ready'] as const)('renders nothing for %s', (phase) => {
    const { container } = renderIndicator(phase, []);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders no spinner anywhere', () => {
    const { container } = renderIndicator('batch-running', [agentState({ agentId: AN_ID })]);
    expect(container.querySelector('.ant-spin')).toBeNull();
  });
});

describe('TeamActivityIndicator — detail popover (D-22)', () => {
  it('lists each active agent step label in order', () => {
    renderIndicator('batch-running', [
      agentState({
        agentId: AN_ID,
        steps: [
          { id: 'step-1', label: 'đã đọc skill', at: '2026-11-12T10:00:00.000Z' },
          { id: 'step-2', label: 'đang gọi tool search', at: '2026-11-12T10:00:01.000Z' },
        ],
      }),
    ]);

    openPopover();

    const popover = screen.getByTestId('team-activity-popover');
    expect(popover.textContent).toContain('đã đọc skill');
    expect(popover.textContent).toContain('đang gọi tool search');
    expect(popover.textContent!.indexOf('đã đọc skill')).toBeLessThan(
      popover.textContent!.indexOf('đang gọi tool search')
    );
  });

  it('falls back to the empty-step copy', () => {
    renderIndicator('batch-running', [agentState({ agentId: AN_ID })]);
    openPopover();
    expect(screen.getByTestId('team-activity-popover').textContent).toContain('Chưa có bước nào');
  });

  // 37.1 UAT gap 8: every step carries its clock.
  it('renders a timestamp per step', () => {
    renderIndicator('batch-running', [
      agentState({
        agentId: AN_ID,
        steps: [{ id: 'step-1', label: 'đã đọc skill', at: '2026-11-12T10:34:56.000Z' }],
      }),
    ]);

    openPopover();

    // Local-time rendering, so assert the shape rather than a fixed clock.
    expect(screen.getByTestId('team-activity-popover').textContent).toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  // 37.1 UAT gap 8: a step with tool args expands to show them.
  it('expands a step that carries tool arguments', () => {
    renderIndicator('batch-running', [
      agentState({
        agentId: AN_ID,
        steps: [
          {
            id: 'step-1',
            label: 'đang gọi tool search',
            at: '2026-11-12T10:00:00.000Z',
            detail: '{"query":"api docs"}',
          },
        ],
      }),
    ]);

    openPopover();
    const popover = screen.getByTestId('team-activity-popover');
    expect(popover.textContent).not.toContain('{"query":"api docs"}');

    fireEvent.click(screen.getByText(/đang gọi tool search/));
    expect(popover.textContent).toContain('{"query":"api docs"}');
  });

  // 37.1 UAT gap 8: the popover body scrolls instead of truncating the list.
  it('scrolls the popover body when steps overflow', () => {
    renderIndicator('batch-running', [
      agentState({
        agentId: AN_ID,
        steps: Array.from({ length: 40 }, (_, index) => ({
          id: `step-${index}`,
          label: `bước ${index}`,
          at: '2026-11-12T10:00:00.000Z',
        })),
      }),
    ]);

    openPopover();

    const popover = screen.getByTestId('team-activity-popover');
    expect(popover.style.overflowY).toBe('auto');
    expect(popover.style.maxHeight).not.toBe('');
    expect(popover.textContent).toContain('bước 39');
  });

  it('includes a queued agent and offers Stop for it', () => {
    const onStopAgent = vi.fn();
    renderIndicator(
      'batch-running',
      [agentState({ agentId: AN_ID, status: 'queued' })],
      onStopAgent
    );

    openPopover();

    const popover = screen.getByTestId('team-activity-popover');
    expect(popover.textContent).toContain('An');
    fireEvent.click(screen.getByTestId(`indicator-stop-${AN_ID}`));
    expect(onStopAgent).toHaveBeenCalledWith(AN_ID);
  });

  it('calls onStopAgent with the running agent id', () => {
    const onStopAgent = vi.fn();
    renderIndicator('batch-running', [agentState({ agentId: BINH_ID })], onStopAgent);

    openPopover();
    fireEvent.click(screen.getByTestId(`indicator-stop-${BINH_ID}`));

    expect(onStopAgent).toHaveBeenCalledWith(BINH_ID);
  });

  // T-37.1-06-02: partial text must never reach this surface.
  it('never renders streamingText', () => {
    renderIndicator('batch-running', [
      agentState({ agentId: AN_ID, streamingText: 'đoạn văn dở dang' }),
    ]);

    openPopover();

    expect(document.body.textContent).not.toContain('đoạn văn dở dang');
  });
});

describe('TeamWorkspace — no streaming bubble (D-19)', () => {
  let db: TaskPlannerDatabase;
  let team: AiTeam;

  beforeEach(async () => {
    db = new TaskPlannerDatabase('test-team-indicator-' + Math.random().toString(36).slice(2));
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

  it('never renders a temp-streaming-msg bubble', async () => {
    const { TeamWorkspace } = await import('../../../../src/components/ai/office/TeamWorkspace');
    render(
      <TeamWorkspace
        team={team}
        lead={undefined}
        members={[]}
        employees={[]}
        skills={[]}
        db={db}
      />
    );

    await screen.findByLabelText('Nội dung tin nhắn trò chuyện AI');
    await waitFor(() => expect(screen.queryByTestId('temp-streaming-msg')).not.toBeInTheDocument());
  });
});
