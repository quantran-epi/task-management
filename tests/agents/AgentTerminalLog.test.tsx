import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentTerminalLog } from '../../src/components/agents/AgentTerminalLog';
import type { GhostDevStreamChunk } from '../../src/types/agent';

describe('AgentTerminalLog Component Tests', () => {
  it('renders loading indicator when isRunning is true', () => {
    render(
      <AgentTerminalLog
        logs={[]}
        sending={false}
        isRunning={true}
        onSendFeedback={vi.fn()}
      />
    );
    expect(screen.getByText('Claude AI đang xử lý / suy nghĩ...')).toBeInTheDocument();
  });

  it('filters system hook events in human-friendly view but parses tool calls and text', () => {
    const mockLogs: GhostDevStreamChunk[] = [
      {
        taskId: 'task-1',
        source: 'master',
        timestamp: '2026-10-06T10:00:00Z',
        type: 'log',
        content: JSON.stringify({ type: 'hook_started', hook: 'on_message' }),
      },
      {
        taskId: 'task-1',
        source: 'master',
        timestamp: '2026-10-06T10:00:01Z',
        type: 'log',
        content: JSON.stringify({
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'Xin chào, tôi là Master Agent.' }],
          },
        }),
      },
      {
        taskId: 'task-1',
        source: 'master',
        timestamp: '2026-10-06T10:00:02Z',
        type: 'tool_call',
        content: JSON.stringify({
          type: 'tool_use',
          id: 'toolu_sub1',
          name: 'Task',
          input: { subagent_type: 'architect', prompt: 'Review architecture' },
        }),
      },
    ];

    render(
      <AgentTerminalLog
        logs={mockLogs}
        sending={false}
        isRunning={false}
        onSendFeedback={vi.fn()}
      />
    );

    // System hook should not be visible as text in human mode
    expect(screen.queryByText(/hook_started/)).not.toBeInTheDocument();
    // AI message should be visible
    expect(screen.getByText('Xin chào, tôi là Master Agent.')).toBeInTheDocument();
    // Tool call should be unpacked
    expect(screen.getByText('Thực thi: Task')).toBeInTheDocument();
    // Subagent should be discovered in switcher tabs
    expect(screen.getByText(/⚡ architect/)).toBeInTheDocument();
  });

  it('unpacks type:result event cleanly and replaces thinking spinner with completion message', () => {
    const mockLogs: GhostDevStreamChunk[] = [
      {
        taskId: 'task-1',
        source: 'master',
        timestamp: '2026-10-06T10:00:00Z',
        type: 'log',
        content: JSON.stringify({
          type: 'tool_result',
          content: [
            { type: 'text', text: 'Output line 1 from worker' },
            { type: 'text', text: 'Output line 2 from worker' },
          ],
        }),
      },
      {
        taskId: 'task-1',
        source: 'master',
        timestamp: '2026-10-06T10:02:36Z',
        type: 'log',
        content: JSON.stringify({
          type: 'result',
          subtype: 'success',
          duration_ms: 156344,
          total_cost_usd: 0.7419,
          result: '2 subagents created and executed successfully. All requirements met.',
        }),
      },
    ];

    render(
      <AgentTerminalLog
        logs={mockLogs}
        sending={false}
        isRunning={true}
        onSendFeedback={vi.fn()}
      />
    );

    // Should NOT show raw JSON with {"type":"result"...}
    expect(screen.queryByText(/{"type":"result"/)).not.toBeInTheDocument();
    // Should unpack tool_result array to plain text
    expect(screen.getByText(/Output line 1 from worker/)).toBeInTheDocument();
    // Should render result markdown content
    expect(
      screen.getByText('2 subagents created and executed successfully. All requirements met.')
    ).toBeInTheDocument();
    // Should NOT show thinking spinner since result is complete
    expect(screen.queryByText('Claude AI đang xử lý / suy nghĩ...')).not.toBeInTheDocument();
    // Should show completion badge with formatted duration and cost
    expect(screen.getByText(/Đã hoàn thành trong 2m 36s/)).toBeInTheDocument();
  });
});
