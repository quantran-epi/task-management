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

  it('renders the stopped badge without a stop button', () => {
    render(<ChatMessageBubble message={msg()} agent={agent} agentStatus="stopped" onStopAgent={vi.fn()} />);
    expect(screen.getByText('Đã dừng giữa chừng')).toBeInTheDocument();
    expect(screen.queryByTestId(`agent-stop-${AGENT_ID}`)).toBeNull();
  });

  it('renders no badge for a done agent', () => {
    render(<ChatMessageBubble message={msg()} agent={agent} agentStatus="done" onStopAgent={vi.fn()} />);
    expect(screen.queryByText('Đang làm việc')).toBeNull();
    expect(screen.queryByText('Đã dừng giữa chừng')).toBeNull();
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
