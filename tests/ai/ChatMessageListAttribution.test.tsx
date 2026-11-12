import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatMessageBubble } from '../../src/components/ai/ChatMessageBubble';
import { ChatMessageList } from '../../src/components/ai/ChatMessageList';
import {
  agentColorFor,
  agentTextColorFor,
  type AgentAttributionAgent,
} from '../../src/components/ai/office/AgentAttributionRow';
import type { ChatMessage } from '../../src/types/models';

const AGENT_ID = 'a1b2c3d4-0000-4000-8000-000000000001';

const agent: AgentAttributionAgent = {
  agentId: AGENT_ID,
  name: 'An',
  role: 'Kỹ sư',
  isLead: false,
  color: agentColorFor(AGENT_ID),
};

const lead: AgentAttributionAgent = {
  ...agent,
  agentId: 'b1b2c3d4-0000-4000-8000-000000000002',
  name: 'Bình',
  role: 'Trưởng nhóm',
  isLead: true,
  color: agentColorFor('b1b2c3d4-0000-4000-8000-000000000002'),
};

function msg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    threadId: 't1',
    role: 'assistant',
    content: 'Báo cáo tiến độ',
    createdAt: '2026-11-08T10:00:00.000Z',
    ...overrides,
  };
}

describe('agentColorFor', () => {
  it('is deterministic and drawn from the six-entry palette', () => {
    const palette = ['#5b4fe8', '#22d3ee', '#338555', '#a56906', '#c54e58', '#6c707e'];
    const first = agentColorFor(AGENT_ID);
    expect(agentColorFor(AGENT_ID)).toBe(first);
    expect(palette).toContain(first);
  });

  it('uses dark glyph text on the two light swatches only', () => {
    expect(agentTextColorFor('#22d3ee')).toBe('#1f2328');
    expect(agentTextColorFor('#338555')).toBe('#1f2328');
    expect(agentTextColorFor('#5b4fe8')).toBe('#ffffff');
  });
});

describe('ChatMessageBubble agent attribution', () => {
  it('renders the attribution row with name, role and a lead crown', () => {
    render(<ChatMessageBubble message={msg()} agent={lead} />);
    const row = screen.getByTestId(`agent-attribution-${lead.agentId}`);
    expect(row).toBeInTheDocument();
    expect(row.textContent).toContain('Bình');
    expect(row.textContent).toContain('Trưởng nhóm');
    expect(row.querySelector('.anticon-crown')).not.toBeNull();
  });

  it('renders the running badge and a stop button', () => {
    const onStop = vi.fn();
    render(<ChatMessageBubble message={msg()} agent={agent} agentStatus="running" onStopAgent={onStop} />);
    expect(screen.getByText('Đang làm việc')).toBeInTheDocument();
    const stop = screen.getByTestId(`agent-stop-${AGENT_ID}`);
    fireEvent.click(stop);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('renders the paused badge and still shows the stop button', () => {
    render(<ChatMessageBubble message={msg()} agent={agent} agentStatus="paused" onStopAgent={vi.fn()} />);
    expect(screen.getByText('Tạm dừng — cần cấp thêm token')).toBeInTheDocument();
    expect(screen.getByTestId(`agent-stop-${AGENT_ID}`)).toBeInTheDocument();
  });

  it('renders the stopped label without a stop button', () => {
    render(<ChatMessageBubble message={msg()} agent={agent} agentStatus="stopped" onStopAgent={vi.fn()} />);
    expect(screen.getByText('Chưa hoàn tất')).toBeInTheDocument();
    expect(screen.queryByText('Đã dừng giữa chừng')).toBeNull();
    expect(screen.queryByTestId(`agent-stop-${AGENT_ID}`)).toBeNull();
  });

  it('renders no badge for a done agent', () => {
    render(<ChatMessageBubble message={msg()} agent={agent} agentStatus="done" onStopAgent={vi.fn()} />);
    expect(screen.queryByText('Đang làm việc')).toBeNull();
    expect(screen.queryByText('Chưa hoàn tất')).toBeNull();
    expect(screen.queryByTestId(`agent-stop-${AGENT_ID}`)).toBeNull();
  });

  it('renders no attribution or status row when the message carries no agent', () => {
    render(<ChatMessageBubble message={msg()} />);
    expect(screen.queryByTestId(`agent-attribution-${AGENT_ID}`)).toBeNull();
    expect(screen.queryByTestId(`agent-status-${AGENT_ID}`)).toBeNull();
  });

  it('marks the agent streaming text region aria-live polite', () => {
    const { container } = render(
      <ChatMessageBubble message={msg({ content: 'Đang viết' })} agent={agent} agentStatus="running" isStreaming />
    );
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live?.getAttribute('aria-atomic')).toBe('false');
  });

  it('leaves the non-agent streaming region without aria-live', () => {
    const { container } = render(
      <ChatMessageBubble message={msg({ content: 'Đang viết' })} isStreaming />
    );
    expect(container.querySelector('[aria-live]')).toBeNull();
  });

  it('renders no status row for a done agent', () => {
    render(<ChatMessageBubble message={msg()} agent={agent} agentStatus="done" />);
    expect(screen.queryByTestId(`agent-status-${AGENT_ID}`)).toBeNull();
  });

  // 37-08 D-13: the remount case — no live snapshot, no `agentStatus` prop, only the
  // persisted link fields. Proves the gate changed from `agent && agentStatus`.
  it('renders the retry button from the persisted runStatus alone', () => {
    const onRetryAgent = vi.fn();
    render(
      <ChatMessageBubble
        message={msg({ agentId: AGENT_ID, assignmentId: 'assignment-1', runStatus: 'stopped' })}
        agent={agent}
        onRetryAgent={onRetryAgent}
      />
    );

    expect(screen.getByText('Chưa hoàn tất')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('agent-retry-assignment-1'));
    // The retry targets the ATTEMPT, never the agent.
    expect(onRetryAgent).toHaveBeenCalledTimes(1);
    expect(onRetryAgent).toHaveBeenCalledWith('assignment-1');
  });

  // WR-01: `runBatch` links the instruction row to its attempt for pairing, but attempt
  // STATUS lives on the report row. Rendering it here gave the lead a permanent queue
  // badge, a stop button that aborts the whole batch, and a retry that refuses.
  it('renders no status row, stop or retry for an instruction row', () => {
    render(
      <ChatMessageBubble
        message={msg({
          messageKind: 'instruction',
          agentId: AGENT_ID,
          assignmentId: 'assignment-1',
          attemptNo: 1,
          runStatus: 'queued',
          stopReason: 'none',
        })}
        agent={lead}
        onStopAgent={vi.fn()}
        onRetryAgent={vi.fn()}
      />
    );

    expect(screen.queryByTestId(`agent-status-${AGENT_ID}`)).toBeNull();
    expect(screen.queryByText('Đang xếp hàng')).toBeNull();
    expect(screen.queryByTestId(`agent-stop-${AGENT_ID}`)).toBeNull();
    expect(screen.queryByTestId('agent-retry-assignment-1')).toBeNull();
  });

  // The report row of the same attempt still renders its status row and retry button, so
  // the gate is the KIND, not the presence of link fields.
  it('still renders the report row of the same attempt', () => {
    const onRetry = vi.fn();
    render(
      <ChatMessageBubble
        message={msg({
          messageKind: 'report',
          agentId: AGENT_ID,
          assignmentId: 'assignment-1',
          attemptNo: 1,
          runStatus: 'stopped',
        })}
        agent={agent}
        onStopAgent={vi.fn()}
        onRetryAgent={onRetry}
      />
    );

    expect(screen.getByText('Chưa hoàn tất')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('agent-retry-assignment-1'));
    expect(onRetry).toHaveBeenCalledWith('assignment-1');
  });

  it('shows the persisted label without a button when the surface cannot retry', () => {
    render(
      <ChatMessageBubble
        message={msg({ agentId: AGENT_ID, assignmentId: 'assignment-1', runStatus: 'error' })}
        agent={agent}
      />
    );

    expect(screen.getByText('Chưa hoàn tất')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-retry-assignment-1')).toBeNull();
  });

  // Supersession is suppressed at the bubble gate: the WHOLE row is gone.
  it('renders no status row at all for a superseded report', () => {
    render(
      <ChatMessageBubble
        message={msg({
          agentId: AGENT_ID,
          assignmentId: 'assignment-1',
          runStatus: 'stopped',
          supersededByMessageId: 'synthesis-2',
        })}
        agent={agent}
        agentStatus="stopped"
        onRetryAgent={vi.fn()}
      />
    );

    expect(screen.queryByTestId(`agent-status-${AGENT_ID}`)).toBeNull();
    expect(screen.queryByText('Chưa hoàn tất')).toBeNull();
    expect(screen.queryByTestId('agent-retry-assignment-1')).toBeNull();
  });
});

describe('renderUserMessageWithMentions agent target', () => {
  it('renders an agent pill and keeps the task pill in the same string', () => {
    render(
      <ChatMessageBubble
        message={msg({
          role: 'user',
          content: `Chào @[An](agent:${AGENT_ID}) và @[Việc A](task:11111111-1111-4111-8111-111111111111)`,
        })}
      />
    );
    expect(screen.getByText('An')).toBeInTheDocument();
    expect(screen.getByText('Việc A')).toBeInTheDocument();
  });
});

describe('ChatMessageList agent directory wiring', () => {
  it('resolves the agent and forwards status and stop', () => {
    const onStopAgent = vi.fn();
    render(
      <ChatMessageList
        messages={[msg({ agentId: AGENT_ID })]}
        agentDirectory={new Map([[AGENT_ID, agent]])}
        agentStatuses={new Map([[AGENT_ID, 'running']])}
        onStopAgent={onStopAgent}
      />
    );
    expect(screen.getByTestId(`agent-attribution-${AGENT_ID}`)).toBeInTheDocument();
    expect(screen.getByText('Đang làm việc')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId(`agent-stop-${AGENT_ID}`));
    expect(onStopAgent).toHaveBeenCalledWith(AGENT_ID);
  });

  it('renders unchanged when no agent directory is supplied', () => {
    render(<ChatMessageList messages={[msg({ agentId: AGENT_ID })]} />);
    expect(screen.queryByTestId(`agent-attribution-${AGENT_ID}`)).toBeNull();
  });
});

describe('ChatMessageBubble steer row (37.1 D-03/D-15)', () => {
  const steerMsg = (overrides: Partial<ChatMessage> = {}) =>
    msg({
      id: 'steer-1',
      role: 'user',
      content: `Chỉ đạo @[An](agent:${AGENT_ID})`,
      messageKind: 'steer',
      batchId: 'batch-1',
      ...overrides,
    });

  it('captions a targeted steer with the agent name', () => {
    render(<ChatMessageBubble message={steerMsg({ targetAgentId: AGENT_ID })} agent={agent} />);

    const label = screen.getByTestId('steer-label-steer-1');
    expect(label.textContent).toContain('Chỉ đạo → An');
  });

  it('captions a leader steer with no arrow', () => {
    render(<ChatMessageBubble message={steerMsg()} />);

    const label = screen.getByTestId('steer-label-steer-1');
    expect(label.textContent).toContain('Chỉ đạo');
    expect(label.textContent).not.toContain('→');
  });

  it('falls back to a neutral label when the agent is unknown', () => {
    render(<ChatMessageBubble message={steerMsg({ targetAgentId: 'ghost-agent' })} />);

    // IN-08d: never a raw UUID in UI copy.
    const label = screen.getByTestId('steer-label-steer-1');
    expect(label.textContent).toContain('Chỉ đạo → Nhân viên');
    expect(label.textContent).not.toContain('ghost-agent');
  });

  it('renders the pending badge', () => {
    render(<ChatMessageBubble message={steerMsg()} steerState="pending" />);

    expect(screen.getByTestId('steer-badge-steer-1').textContent).toBe('chờ leader đọc');
  });

  it('renders the held badge', () => {
    render(<ChatMessageBubble message={steerMsg()} steerState="held" />);

    expect(screen.getByTestId('steer-badge-steer-1').textContent).toBe('chưa giao');
  });

  it('renders no badge once delivered', () => {
    render(<ChatMessageBubble message={steerMsg()} />);

    expect(screen.getByTestId('steer-label-steer-1')).toBeInTheDocument();
    expect(screen.queryByTestId('steer-badge-steer-1')).toBeNull();
  });

  it('renders no steer caption on a report row', () => {
    render(
      <ChatMessageBubble
        message={msg({ id: 'report-1', messageKind: 'report', agentId: AGENT_ID })}
        agent={agent}
      />
    );

    expect(screen.queryByTestId('steer-label-report-1')).toBeNull();
  });

  it('still renders the steer row through the user branch with its mention pill', () => {
    render(<ChatMessageBubble message={steerMsg({ targetAgentId: AGENT_ID })} agent={agent} />);

    expect(screen.getByTestId('steer-label-steer-1').closest('[data-role]')?.getAttribute('data-role')).toBe(
      'user'
    );
    // CR-06/D-15: a steer row renders as a USER row — no agent attribution header.
    expect(screen.queryByTestId(`agent-attribution-${AGENT_ID}`)).toBeNull();
    expect(screen.getByText('An')).toBeInTheDocument();
  });

  it('resolves the steer target name through the list directory, never the raw id', () => {
    render(
      <ChatMessageList
        messages={[steerMsg({ targetAgentId: AGENT_ID })]}
        agentDirectory={new Map([[AGENT_ID, agent]])}
      />
    );

    const label = screen.getByTestId('steer-label-steer-1');
    expect(label.textContent).toContain('Chỉ đạo → An');
    expect(label.textContent).not.toContain(AGENT_ID);
    // D-15: still a user row, so no agent attribution header appears above it.
    expect(screen.queryByTestId(`agent-attribution-${AGENT_ID}`)).toBeNull();
  });

  it('forwards steerStates from the list to the bubble', () => {
    render(
      <ChatMessageList
        messages={[steerMsg({ targetAgentId: AGENT_ID })]}
        agentDirectory={new Map([[AGENT_ID, agent]])}
        steerStates={new Map([['steer-1', 'pending']])}
      />
    );

    expect(screen.getByTestId('steer-badge-steer-1').textContent).toBe('chờ leader đọc');
  });
});
