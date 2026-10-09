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
    expect(screen.getAllByText(/12\.4k tokens/).length).toBeGreaterThanOrEqual(1);
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

  it('supports ArrowUp and ArrowDown command history navigation', () => {
    const onSendMock = vi.fn().mockResolvedValue(undefined);

    render(
      <AgentTerminalLog
        logs={[]}
        sending={false}
        isRunning={false}
        onSendFeedback={onSendMock}
      />
    );

    const input = screen.getByRole('textbox', { name: /Nhập hướng dẫn cho Master Agent/i });
    const sendBtn = screen.getByRole('button', { name: /Gửi chỉ đạo/i });

    // Send first message
    fireEvent.change(input, { target: { value: 'npm run test' } });
    fireEvent.click(sendBtn);

    // Send second message
    fireEvent.change(input, { target: { value: 'git status' } });
    fireEvent.click(sendBtn);

    expect(onSendMock).toHaveBeenCalledTimes(2);

    // Press ArrowUp: should retrieve 'git status'
    fireEvent.keyDown(input, { key: 'ArrowUp', code: 'ArrowUp' });
    expect(input).toHaveValue('git status');

    // Press ArrowUp: should retrieve 'npm run test'
    fireEvent.keyDown(input, { key: 'ArrowUp', code: 'ArrowUp' });
    expect(input).toHaveValue('npm run test');

    // Press ArrowDown: should go back to 'git status'
    fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    expect(input).toHaveValue('git status');

    // Press ArrowDown: should restore draft text (empty)
    fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    expect(input).toHaveValue('');
  });

  it('displays skill autocomplete overlay when starting with slash and accepts tab/click', async () => {
    render(
      <AgentTerminalLog
        logs={[]}
        sending={false}
        isRunning={false}
        onSendFeedback={vi.fn()}
      />
    );

    const input = screen.getByRole('textbox', { name: /Nhập hướng dẫn cho Master Agent/i });

    // Type /gsd
    fireEvent.change(input, { target: { value: '/gsd' } });

    // Autocomplete dropdown should be rendered
    expect(await screen.findByText(/GỢI Ý KỸ NĂNG/i)).toBeInTheDocument();
    expect(screen.getByText('/gsd-quick')).toBeInTheDocument();

    // Press Tab to autocomplete selected skill
    fireEvent.keyDown(input, { key: 'Tab', code: 'Tab' });
    expect(input).toHaveValue('/gsd-quick ');
  });

  it('includes built-in Claude Code commands like /status and /goal in autocomplete', async () => {
    render(
      <AgentTerminalLog
        logs={[]}
        sending={false}
        isRunning={false}
        onSendFeedback={vi.fn()}
      />
    );

    const input = screen.getByRole('textbox', { name: /Nhập hướng dẫn cho Master Agent/i });

    // Type /goal
    fireEvent.change(input, { target: { value: '/goal' } });
    expect(await screen.findByText('/goal')).toBeInTheDocument();

    // Type /status
    fireEvent.change(input, { target: { value: '/status' } });
    expect(await screen.findByText('/status')).toBeInTheDocument();
  });

  it('inserts mentioned file path into chat input and triggers onClearMentionedFile', () => {
    const onClearMock = vi.fn();
    const { rerender } = render(
      <AgentTerminalLog
        logs={[]}
        sending={false}
        isRunning={false}
        onSendFeedback={vi.fn()}
        mentionedFilePath={null}
        onClearMentionedFile={onClearMock}
      />
    );

    const input = screen.getByRole('textbox', { name: /Nhập hướng dẫn cho Master Agent/i });
    expect(input).toHaveValue('');

    // Mention a file
    rerender(
      <AgentTerminalLog
        logs={[]}
        sending={false}
        isRunning={false}
        onSendFeedback={vi.fn()}
        mentionedFilePath="src/components/App.tsx"
        onClearMentionedFile={onClearMock}
      />
    );

    expect(input).toHaveValue('@src/components/App.tsx ');
    expect(onClearMock).toHaveBeenCalled();
  });

  it('does not display thinking status or run timer when logs are cleared in running agent', () => {
    const onClearMock = vi.fn();
    const { rerender } = render(
      <AgentTerminalLog
        logs={[
          {
            taskId: 'task-1',
            source: 'master',
            timestamp: '2026-10-08T10:00:00Z',
            type: 'log',
            content: JSON.stringify({
              type: 'result',
              duration_ms: 25000,
              result: 'Turn completed successfully',
            }),
          },
        ]}
        sending={false}
        isRunning={true}
        onSendFeedback={vi.fn()}
        onClearLogs={onClearMock}
      />
    );

    // Initial state: turn completed
    expect(screen.queryByText('Claude AI đang xử lý / suy nghĩ...')).not.toBeInTheDocument();
    expect(screen.getByText(/Đã hoàn thành/)).toBeInTheDocument();

    // Click clear logs button
    const clearBtn = screen.getByRole('button', { name: 'Xóa nhật ký terminal' });
    fireEvent.click(clearBtn);
    expect(onClearMock).toHaveBeenCalled();

    // Re-render with cleared logs (logs: []) and isCleared={true}
    rerender(
      <AgentTerminalLog
        logs={[]}
        sending={false}
        isRunning={true}
        isCleared={true}
        onSendFeedback={vi.fn()}
        onClearLogs={onClearMock}
      />
    );

    // MUST NOT show false thinking status
    expect(screen.queryByText('Claude AI đang xử lý / suy nghĩ...')).not.toBeInTheDocument();
    // Completed banner is also cleared since logs are empty
    expect(screen.queryByText(/Đã hoàn thành/)).not.toBeInTheDocument();
  });

  it('persists idle state when switching to cleared session and restores thinking when user sends feedback', () => {
    const onSendMock = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <AgentTerminalLog
        logs={[]}
        sending={false}
        isRunning={true}
        isCleared={true}
        taskTitle="Task 2 (Idle/Cleared)"
        onSendFeedback={onSendMock}
      />
    );

    // Cleared session must be idle, not thinking
    expect(screen.queryByText('Claude AI đang xử lý / suy nghĩ...')).not.toBeInTheDocument();

    // Now user sends feedback in this session
    rerender(
      <AgentTerminalLog
        logs={[
          {
            taskId: 'task-2',
            source: 'master',
            timestamp: '2026-10-08T10:10:00Z',
            type: 'log',
            content: '[User Feedback]: fix this issue',
          },
        ]}
        sending={false}
        isRunning={true}
        isCleared={false}
        taskTitle="Task 2 (Idle/Cleared)"
        onSendFeedback={onSendMock}
      />
    );

    // Now agent should be actively thinking
    expect(screen.getByText('Claude AI đang xử lý / suy nghĩ...')).toBeInTheDocument();
  });

  it('stops live timer and shows completed tag when agent finishes turn while process is running', () => {
    render(
      <AgentTerminalLog
        logs={[
          {
            taskId: 'task-1',
            source: 'master',
            timestamp: '2026-10-08T10:00:00Z',
            type: 'log',
            content: JSON.stringify({
              type: 'result',
              duration_ms: 18000,
              result: 'Done',
            }),
          },
        ]}
        sending={false}
        isRunning={true}
        startedAt="2026-10-08T10:00:00Z"
        onSendFeedback={vi.fn()}
      />
    );

    // Should not show thinking spinner
    expect(screen.queryByText('Claude AI đang xử lý / suy nghĩ...')).not.toBeInTheDocument();
    // Should show completed message with 18s duration
    expect(screen.getByText(/Đã hoàn thành trong 18s/)).toBeInTheDocument();
  });
});
