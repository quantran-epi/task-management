import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AssignmentPlanCard } from '../../../src/components/ai/office/AssignmentPlanCard';
import { TeamSidebar } from '../../../src/components/ai/office/TeamSidebar';
import type { AiLead, AiTeam, AiTeamMember } from '../../../src/types/aiOffice';

const plan = {
  batchIndex: 1,
  assignments: [
    { agentId: 'agent-1', agentName: 'An', skillName: 'Kiểm thử', task: 'Viết test cho luồng đăng nhập' },
    { agentId: 'agent-2', agentName: 'Bình', task: 'Rà soát migration' },
  ],
};

describe('AssignmentPlanCard', () => {
  it('renders the card, one row per assignment and both decision buttons', () => {
    render(<AssignmentPlanCard plan={plan} decision={undefined} onApprove={vi.fn()} onReject={vi.fn()} />);

    const card = screen.getByTestId('assignment-plan-card');
    expect(card).toBeInTheDocument();
    expect(card.textContent).toContain('Kế hoạch phân việc');
    expect(card.textContent).toContain('Lô 1');
    expect(card.textContent).toContain('An');
    expect(card.textContent).toContain('Kiểm thử');
    expect(card.textContent).toContain('Viết test cho luồng đăng nhập');
    expect(card.textContent).toContain('Bình');
    expect(screen.getByTestId('assignment-plan-approve')).toBeInTheDocument();
    expect(screen.getByTestId('assignment-plan-reject')).toBeInTheDocument();
  });

  it('is not warning-colored and carries a primary left border', () => {
    render(<AssignmentPlanCard plan={plan} decision={undefined} onApprove={vi.fn()} onReject={vi.fn()} />);
    const card = screen.getByTestId('assignment-plan-card');
    expect(card.style.borderLeft).toContain('3px');
    expect(card.style.backgroundColor).not.toMatch(/warning/i);
  });

  it('calls onApprove and onReject', () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    render(<AssignmentPlanCard plan={plan} decision={undefined} onApprove={onApprove} onReject={onReject} />);
    fireEvent.click(screen.getByTestId('assignment-plan-approve'));
    fireEvent.click(screen.getByTestId('assignment-plan-reject'));
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('replaces the buttons with a role=status line after approval', () => {
    render(<AssignmentPlanCard plan={plan} decision="approved" onApprove={vi.fn()} onReject={vi.fn()} />);
    expect(screen.queryByTestId('assignment-plan-approve')).toBeNull();
    expect(screen.queryByTestId('assignment-plan-reject')).toBeNull();
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Đã chấp thuận — lô việc đang chạy.');
  });

  it('replaces the buttons with a rejection status line', () => {
    render(<AssignmentPlanCard plan={plan} decision="rejected" onApprove={vi.fn()} onReject={vi.fn()} />);
    expect(screen.queryByTestId('assignment-plan-approve')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain(
      'Đã từ chối — không nhân viên nào được giao việc.'
    );
  });
});

describe('TeamSidebar live usage (WR-03, WR-04)', () => {
  const team: AiTeam = {
    id: 'team-1',
    name: 'Nhóm',
    leadId: 'lead-1',
    status: 'active',
    budgetTokens: 1000,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const lead: AiLead = {
    id: 'lead-1',
    name: 'An',
    role: 'Lead',
    capability: '',
    persona: '',
    model: 'm',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const member: AiTeamMember = {
    id: 'member-1',
    teamId: team.id,
    agentId: lead.id,
    role: 'lead',
    budgetTokens: 1000,
    usedTokens: 400,
    inputTokens: 300,
    outputTokens: 100,
  };

  function renderSidebar(liveUsage: Parameters<typeof TeamSidebar>[0]['liveUsage']) {
    return render(
      <TeamSidebar
        team={team}
        lead={lead}
        members={[member]}
        employees={[]}
        links={[]}
        snapshot={{ phase: 'batch-running', agents: [{ agentId: lead.id, status: 'running' }] }}
        budgetWarnThresholdPct={80}
        liveUsage={liveUsage}
        onTopUp={vi.fn()}
        onOpenSettings={vi.fn()}
        onToggleAutoSplit={vi.fn()}
        onToggleAutoApprove={vi.fn()}
        onAddLink={vi.fn()}
        onRemoveLink={vi.fn()}
      />
    );
  }

  // WR-03: a live record exists from dispatch with outputTokens: 0, so `??` hid the
  // persisted output for the whole turn. UAT 38: the cumulative halves are what render.
  it('keeps persisted output visible while a request is pending (WR-03)', () => {
    renderSidebar([
      {
        agentId: lead.id,
        inputTokens: 0,
        outputTokens: 0,
        estimated: false,
        provisionalInputTokens: 0,
        usedInputTokens: 300,
        usedOutputTokens: 100,
      },
    ]);
    expect(screen.getByTestId(`member-usage-${lead.id}`)).toHaveTextContent('100');
  });

  // WR-04: the provisional guess is a warning input, never a charge — it renders as its own
  // `~` figure and must not lift the group total.
  it('keeps the provisional guess out of the team aggregate (WR-04)', () => {
    renderSidebar([
      {
        agentId: lead.id,
        inputTokens: 0,
        outputTokens: 0,
        estimated: false,
        provisionalInputTokens: 900,
        usedInputTokens: 300,
        usedOutputTokens: 100,
      },
    ]);
    const panel = screen.getByTestId('team-budget-panel');
    // 400 charged / 1000 granted = 40%, not 1300/1000.
    expect(panel).toHaveTextContent('400 / 1,000 token · 40%');
    expect(screen.getByTestId('team-provisional')).toHaveTextContent('~900');
    // No team badge: the coordinator would not warn at 40%.
    expect(screen.queryByTestId('budget-badge-team')).not.toBeInTheDocument();
  });

  // UAT 38: a member that already used 152k must not read as this turn's 15k report.
  it('renders the cumulative total, not the current turn report (UAT 38)', () => {
    renderSidebar([
      {
        agentId: lead.id,
        inputTokens: 15_000,
        outputTokens: 0,
        estimated: false,
        provisionalInputTokens: 0,
        usedInputTokens: 152_076,
        usedOutputTokens: 0,
      },
    ]);
    const line = screen.getByTestId(`member-usage-${lead.id}`);
    expect(line).toHaveTextContent('152,076');
    expect(line).not.toHaveTextContent('15,000');
    expect(screen.getByTestId('budget-badge-member')).toBeInTheDocument();
  });
});
