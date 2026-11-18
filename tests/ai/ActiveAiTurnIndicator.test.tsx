import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { ActiveAiTurnIndicator } from '../../src/components/ai/ActiveAiTurnIndicator';
import { BudgetTopUpModal } from '../../src/components/ai/office/BudgetTopUpModal';
import { aiTurnManager } from '../../src/services/ai/aiTurnManager';
import { useLayoutStore } from '../../src/workbench/store/layoutStore';

// The tab label must come from the authoritative team row, not the turn's agent-derived title.
vi.mock('../../src/db/repositories/aiTeamRepo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/db/repositories/aiTeamRepo')>();
  return {
    ...actual,
    getTeam: vi.fn(async (id: string) => ({ id, name: 'Nhóm Alpha' } as any)),
  };
});

describe('ActiveAiTurnIndicator', () => {
  beforeEach(() => {
    aiTurnManager.abortAll();
  });

  it('renders nothing when no turns are active', () => {
    const { container } = render(<ActiveAiTurnIndicator />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a single active turn capsule with spinner, title, and abort button', () => {
    const abortFn = vi.fn();
    act(() => {
      aiTurnManager.registerTurn({
        id: 'turn-1',
        scopeKey: 'global',
        title: 'Tra cứu tài liệu',
        status: 'streaming',
        streamingStatusLabel: 'Đang phản hồi...',
        abort: abortFn,
      });
    });

    render(<ActiveAiTurnIndicator />);

    const capsule = screen.getByTestId('active-ai-turn-capsule');
    expect(capsule).toBeInTheDocument();
    expect(screen.getByText('Tra cứu tài liệu')).toBeInTheDocument();
    expect(screen.getByTestId('ai-turn-spinner')).toBeInTheDocument();

    const abortBtn = screen.getByTestId('abort-ai-turn-btn');
    expect(abortBtn).toBeInTheDocument();

    fireEvent.click(abortBtn);
    expect(abortFn).toHaveBeenCalledTimes(1);
  });

  it('renders multi-capsule badge when multiple turns are active', () => {
    act(() => {
      aiTurnManager.registerTurn({
        id: 'turn-1',
        scopeKey: 'global',
        title: 'Task 1',
        status: 'streaming',
        streamingStatusLabel: 'Đang phản hồi',
        abort: vi.fn(),
      });
      aiTurnManager.registerTurn({
        id: 'turn-2',
        scopeKey: 'chat:intake',
        title: 'Task 2',
        status: 'tool',
        streamingStatusLabel: 'Truy xuất',
        abort: vi.fn(),
      });
    });

    render(<ActiveAiTurnIndicator />);

    const multiCapsule = screen.getByTestId('active-ai-turns-multi-capsule');
    expect(multiCapsule).toBeInTheDocument();
    expect(screen.getByText('2 tiến trình AI')).toBeInTheDocument();
  });

  it('renders a team capsule with the team icon and a confirmed global stop', async () => {
    const abortFn = vi.fn();
    act(() => {
      aiTurnManager.registerTurn({
        id: 'team:team-1',
        scopeKey: 'team-1',
        title: 'Nhóm Alpha',
        status: 'streaming',
        streamingStatusLabel: 'Lead đang phân việc',
        abort: abortFn,
      });
    });

    render(<ActiveAiTurnIndicator />);

    const capsule = screen.getByTestId('team-run-capsule');
    expect(capsule).toBeInTheDocument();
    expect(capsule.querySelector('.anticon-team')).not.toBeNull();
    expect(screen.queryByTestId('ai-turn-spinner')).toBeNull();

    const stopBtn = screen.getByTestId('abort-ai-turn-btn');
    fireEvent.click(stopBtn);
    expect(abortFn).not.toHaveBeenCalled();

    expect(await screen.findByText('Dừng toàn bộ nhóm?')).toBeInTheDocument();
  });

  it('does not mark a non-team turn as a team capsule', () => {
    act(() => {
      aiTurnManager.registerTurn({
        id: 'turn-1',
        scopeKey: 'global',
        title: 'Tra cứu tài liệu',
        status: 'streaming',
        streamingStatusLabel: 'Đang phản hồi...',
        abort: vi.fn(),
      });
    });

    render(<ActiveAiTurnIndicator />);

    expect(screen.queryByTestId('team-run-capsule')).toBeNull();
    expect(screen.getByTestId('ai-turn-spinner')).toBeInTheDocument();
  });

  /**
   * Regression: clicking an individual AGENT's progress turn used to name the
   * team_workspace tab after the agent (`turn.title`), not after the chat group.
   * Both the compact footer indicator and the default (chat-panel) indicator
   * share this handler, so both mount modes are asserted.
   */
  it.each([
    ['footer compact', true],
    ['chat panel default', false],
  ])('opens the chat group tab named after the team from the %s indicator', async (_label, compact) => {
    useLayoutStore.getState().resetLayout();
    act(() => {
      aiTurnManager.registerTurn({
        id: 'team:team-1:agent:agent-1',
        scopeKey: 'team-1',
        title: 'An', // agent name — must NOT become the tab label
        status: 'streaming',
        streamingStatusLabel: 'Đang làm việc',
        abort: vi.fn(),
      });
    });

    render(<ActiveAiTurnIndicator compact={compact} />);
    fireEvent.click(screen.getByTestId('active-ai-turn-capsule'));

    await waitFor(() => {
      const tab = useLayoutStore.getState().openTabs.find((t) => t.id === 'team_workspace:team-1');
      expect(tab).toBeDefined();
      expect(tab!.title).toBe('Nhóm Alpha'); // authoritative team name
      expect(tab!.title).not.toBe('An');
    });
    expect(useLayoutStore.getState().activeTabId).toBe('team_workspace:team-1');
  });

  it('corrects a stale agent-named tab to the team name when clicked', async () => {
    useLayoutStore.getState().resetLayout();
    act(() => {
      useLayoutStore.getState().openTab({
        id: 'team_workspace:team-1',
        title: 'An',
        viewType: 'team_workspace',
        closable: true,
        params: { teamId: 'team-1' },
      });
      aiTurnManager.registerTurn({
        id: 'team:team-1:agent:agent-1',
        scopeKey: 'team-1',
        title: 'An',
        status: 'streaming',
        streamingStatusLabel: 'Đang làm việc',
        abort: vi.fn(),
      });
    });

    render(<ActiveAiTurnIndicator compact />);
    fireEvent.click(screen.getByTestId('active-ai-turn-capsule'));

    await waitFor(() => {
      const tab = useLayoutStore.getState().openTabs.find((t) => t.id === 'team_workspace:team-1');
      expect(tab!.title).toBe('Nhóm Alpha');
    });
  });
});

describe('BudgetTopUpModal', () => {
  const baseProps = {
    open: true,
    scope: { kind: 'agent' as const, name: 'An' },
    used: 8000,
    budget: 10000,
    thresholdPct: 80,
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
  };

  it('renders the usage rows and the threshold label from the prop', () => {
    const { rerender } = render(<BudgetTopUpModal {...baseProps} />);
    const modal = screen.getByTestId('budget-topup-modal');
    expect(modal).toBeInTheDocument();
    expect(modal.textContent).toContain('Đã dùng');
    expect(modal.textContent).toContain('Ngân sách hiện tại');
    expect(modal.textContent).toContain('Ngưỡng cảnh báo (80%)');
    expect(modal.textContent).toContain('8,000 token');
    expect(modal.textContent).not.toContain('Đang xử lý');

    // D-04: the label is prop-driven, not coincidentally 80.
    rerender(<BudgetTopUpModal {...baseProps} thresholdPct={65} />);
    const after = screen.getByTestId('budget-topup-modal');
    expect(after.textContent).toContain('Ngưỡng cảnh báo (65%)');
    expect(after.textContent).not.toContain('(80%)');
    expect(after.textContent).toContain('6,500 token');
  });

  it('disables the confirm below 1000 and enables it at 1000', () => {
    const { rerender } = render(<BudgetTopUpModal {...baseProps} />);
    expect(screen.getByTestId('budget-topup-confirm')).toBeDisabled();

    rerender(<BudgetTopUpModal {...baseProps} />);
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '1000' } });
    expect(screen.getByTestId('budget-topup-confirm')).toBeEnabled();
  });

  it('shows the new-budget preview line and confirms with the amount', () => {
    const onConfirm = vi.fn();
    render(<BudgetTopUpModal {...baseProps} onConfirm={onConfirm} />);

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2000' } });
    expect(screen.getByText(/Ngân sách mới: 12000 token/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('budget-topup-confirm'));
    expect(onConfirm).toHaveBeenCalledWith(2000);
  });
});
