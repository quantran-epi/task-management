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
