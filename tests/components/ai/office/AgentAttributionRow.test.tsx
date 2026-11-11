import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentStatusRow, type AgentAttributionAgent } from '../../../../src/components/ai/office/AgentAttributionRow';

/**
 * Phase 37 plan 06 — a queued agent is visible and stoppable (D-10).
 * 37-08 extends this file for the stopped/error retry affordance.
 */
const agent: AgentAttributionAgent = {
  agentId: 'agent-1',
  name: 'An Nguyễn',
  role: 'Phân tích',
  isLead: false,
  color: '#5b4fe8',
};

describe('AgentStatusRow — queued (D-10)', () => {
  it('renders the queue tag and the stop button for a queued agent', () => {
    const onStop = vi.fn();
    render(<AgentStatusRow agent={agent} status="queued" onStop={onStop} />);

    expect(screen.getByText('Đang xếp hàng')).toBeInTheDocument();
    const stop = screen.getByTestId('agent-stop-agent-1');
    expect(stop).toBeInTheDocument();

    fireEvent.click(stop);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('renders nothing for a done agent', () => {
    const { container } = render(<AgentStatusRow agent={agent} status="done" onStop={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('AgentStatusRow — retry affordance (37-08 D-13)', () => {
  it('renders the label and the retry button for a stopped assignment', () => {
    const onRetry = vi.fn();
    render(
      <AgentStatusRow
        agent={agent}
        status="stopped"
        assignmentId="assignment-A"
        onRetry={onRetry}
      />
    );

    expect(screen.getByText('Chưa hoàn tất')).toBeInTheDocument();
    // The old label was REPLACED, not stacked beside the new one.
    expect(screen.queryByText('Đã dừng giữa chừng')).toBeNull();
    const retry = screen.getByTestId('agent-retry-assignment-A');
    expect(retry).toBeInTheDocument();

    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders the label and the retry button for an errored assignment', () => {
    render(<AgentStatusRow agent={agent} status="error" assignmentId="assignment-A" onRetry={vi.fn()} />);

    expect(screen.getByText('Chưa hoàn tất')).toBeInTheDocument();
    expect(screen.queryByText('Lỗi')).toBeNull();
    expect(screen.getByTestId('agent-retry-assignment-A')).toBeInTheDocument();
  });

  it('shows the label alone when the surface cannot retry', () => {
    const { container } = render(<AgentStatusRow agent={agent} status="stopped" />);

    expect(screen.getByText('Chưa hoàn tất')).toBeInTheDocument();
    expect(container.querySelector('[data-testid^="agent-retry-"]')).toBeNull();
  });

  it('keys the retry test id by assignment so two attempts never collide', () => {
    render(
      <>
        <AgentStatusRow agent={agent} status="stopped" assignmentId="assignment-A" onRetry={vi.fn()} />
        <AgentStatusRow agent={agent} status="stopped" assignmentId="assignment-B" onRetry={vi.fn()} />
      </>
    );

    expect(screen.getByTestId('agent-retry-assignment-A')).toBeInTheDocument();
    expect(screen.getByTestId('agent-retry-assignment-B')).toBeInTheDocument();
  });

  it('renders no badge for ledger-only statuses', () => {
    for (const status of ['skipped', 'blocked', 'needs-input'] as const) {
      const { container, unmount } = render(<AgentStatusRow agent={agent} status={status} />);
      expect(container.querySelector('.ant-tag')).toBeNull();
      unmount();
    }
  });
});
