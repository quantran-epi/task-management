import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

  it('deduplicates return display when assistant text and result event match, and displays tokens not dollar cost', () => {
    const returnText = 'hello from agent 1 to master hello from agent 2 to master';
    const mockLogs: GhostDevStreamChunk[] = [
      {
        taskId: 'task-1',
        source: 'master',
        timestamp: '2026-10-06T21:55:50Z',
        type: 'log',
        content: JSON.stringify({
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: returnText }],
          },
        }),
      },
      {
        taskId: 'task-1',
        source: 'master',
        timestamp: '2026-10-06T21:55:50Z',
        type: 'log',
        content: JSON.stringify({
          type: 'result',
          subtype: 'success',
          duration_ms: 168000,
          total_cost_usd: 0.6584,
          usage: {
            input_tokens: 10000,
            output_tokens: 2450,
          },
          result: returnText,
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

    // Return text must be rendered exactly once (no duplicate card)
    const matchingElements = screen.getAllByText(returnText);
    expect(matchingElements).toHaveLength(1);

    // Displays token count, not dollar cost
    expect(screen.getAllByText(/12,450 tokens/).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/\$0\.6584/)).not.toBeInTheDocument();
  });

  it('parses assistant thinking block without text cleanly without dumping raw JSON in human view', () => {
    const rawThinkingChunk = JSON.stringify({
      type: 'assistant',
      message: {
        id: 'naTFaq_sBdiN1e8Po-74iAk',
        type: 'message',
        role: 'assistant',
        model: 'gemini-3.8-flash-n',
        content: [
          {
            type: 'thinking',
            thinking: 'The user intent is a test run to confirm successful subagent spawning.',
            signature: '',
          },
        ],
      },
      thinking_duration_ms: 1649,
    });

    const mockLogs: GhostDevStreamChunk[] = [
      {
        taskId: 'task-1',
        source: 'master',
        timestamp: '2026-10-07T01:47:20.905Z',
        type: 'log',
        content: rawThinkingChunk,
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

    // Should NOT show raw unparsed JSON string
    expect(screen.queryByText(/naTFaq_sBdiN1e8Po-74iAk/)).not.toBeInTheDocument();
    // Should render thinking badge/title cleanly
    expect(screen.getByText(/Suy nghĩ AI \(Thinking\)/)).toBeInTheDocument();
    expect(screen.getByText(/Xem chuỗi suy nghĩ/)).toBeInTheDocument();
  });

  it('shows exited status for subagent when completed and allows removing it from terminal UI', () => {
    const mockLogs: GhostDevStreamChunk[] = [
      {
        taskId: 'task-1',
        source: 'master',
        timestamp: '2026-10-06T10:00:00Z',
        type: 'tool_call',
        content: JSON.stringify({
          type: 'tool_use',
          id: 'subagent_worker_1',
          name: 'Task',
          input: { subagent_type: 'tester', prompt: 'Run test suite' },
        }),
      },
      {
        taskId: 'task-1',
        source: 'master',
        timestamp: '2026-10-06T10:01:00Z',
        type: 'tool_result',
        content: JSON.stringify({
          type: 'tool_result',
          tool_use_id: 'subagent_worker_1',
          content: 'Tests passed',
        }),
      },
    ];

    const onRemoveMock = vi.fn();

    render(
      <AgentTerminalLog
        logs={mockLogs}
        sending={false}
        isRunning={true}
        onSendFeedback={vi.fn()}
        onRemoveWorker={onRemoveMock}
      />
    );

    // Subagent should show "Đã thoát" tag indicating exit
    expect(screen.getByText('Đã thoát')).toBeInTheDocument();
    expect(screen.getByText(/tester \(subage\)/)).toBeInTheDocument();

    // Remove button should be present
    const removeBtn = screen.getByRole('button', { name: 'Xóa subagent subagent_worker_1' });
    expect(removeBtn).toBeInTheDocument();

    // Click remove
    fireEvent.click(removeBtn);

    // Callback should be fired
    expect(onRemoveMock).toHaveBeenCalledWith('subagent_worker_1');

    // Subagent should no longer be in the tab list
    expect(screen.queryByText(/tester \(subage\)/)).not.toBeInTheDocument();
  });
});
