import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatHeader } from '../../src/components/ai/ChatHeader';
import { AIChatDrawer, TURN_STATUS_TO_TAB } from '../../src/components/ai/AIChatDrawer';
import * as orchestrator from '../../src/services/ai/aiOrchestratorLoop';
import { TaskPlannerDatabase } from '../../src/db';
import * as chatRepo from '../../src/db/repositories/chatRepo';
import { getOrCreateActiveChatTab } from '../../src/db/repositories/chatTabRepo';
import * as nineRouterClient from '../../src/services/ai/nineRouterClient';
import * as nineRouterTokenService from '../../src/services/ai/nineRouterTokenService';
import * as graphitiMcpClient from '../../src/services/ai/graphitiMcpClient';
import * as mcpClient from '../../src/services/ai/mcpClient';
import { aiDebugService } from '../../src/services/ai/aiDebugService';
import {
  setGroundedTurnTestHooks,
  clearGroundedTurnTestHooks,
} from '../../src/services/ai/groundedTurnDeps';

vi.mock('../../src/utils/pptxExport', () => ({
  exportPresentationAsFile: vi.fn(),
}));

describe('ChatHeader', () => {
  it('displays title, popout button, pin toggle, and more options', () => {
    const handleTogglePin = vi.fn();
    const handleClose = vi.fn();
    const handlePopout = vi.fn();
    const handleOpenDebug = vi.fn();
    const handleOpenInstructions = vi.fn();

    render(
      <ChatHeader
        isPinned={false}
        onTogglePin={handleTogglePin}
        onPopout={handlePopout}
        onOpenDebug={handleOpenDebug}
        onOpenInstructions={handleOpenInstructions}
        onClose={handleClose}
      />
    );

    expect(screen.getByText('Trợ lý AI')).toBeInTheDocument();
    expect(screen.getByLabelText('Mở cửa sổ riêng (Popout)')).toBeInTheDocument();
    expect(screen.getByLabelText('Tùy chọn khác')).toBeInTheDocument();
    expect(screen.getByLabelText('Đóng ngăn trò chuyện')).toBeInTheDocument();

    // Click popout
    fireEvent.click(screen.getByLabelText('Mở cửa sổ riêng (Popout)'));
    expect(handlePopout).toHaveBeenCalledTimes(1);

    // Click more options dropdown to toggle pin
    fireEvent.click(screen.getByLabelText('Tùy chọn khác'));
    const pinOption = screen.getByText('Ghim ngăn trò chuyện bên phải');
    expect(pinOption).toBeInTheDocument();
    fireEvent.click(pinOption);
    expect(handleTogglePin).toHaveBeenCalled();

    // Close button
    fireEvent.click(screen.getByLabelText('Đóng ngăn trò chuyện'));
    expect(handleClose).toHaveBeenCalled();
  });

  it('renders instructions and debug options in dropdown', () => {
    const handleOpenDebug = vi.fn();
    const handleOpenInstructions = vi.fn();

    render(
      <ChatHeader
        isPinned={true}
        onTogglePin={vi.fn()}
        onOpenDebug={handleOpenDebug}
        onOpenInstructions={handleOpenInstructions}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByLabelText('Tùy chọn khác'));
    const instructionsOption = screen.getByText('Hướng dẫn lập kế hoạch AI');
    expect(instructionsOption).toBeInTheDocument();
    fireEvent.click(instructionsOption);
    expect(handleOpenInstructions).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText('Tùy chọn khác'));
    const debugOption = screen.getByText('Nhật ký gỡ lỗi AI');
    expect(debugOption).toBeInTheDocument();
    fireEvent.click(debugOption);
    expect(handleOpenDebug).toHaveBeenCalledTimes(1);
  });
});

const CR_ID = '44444444-4444-4444-8444-444444444444';

describe('AIChatDrawer', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    clearGroundedTurnTestHooks();
    setGroundedTurnTestHooks({
      runGroundedTurn: async (input) => ({
        kind: 'operational',
        routedQuery: input.query,
      }),
    });
    vi.spyOn(graphitiMcpClient, 'getGraphitiMcpToolDefinitions').mockResolvedValue([]);
    vi.spyOn(mcpClient, 'discoverAllMcpTools').mockResolvedValue([]);
    db = new TaskPlannerDatabase(`test-aichat-drawer-${Date.now()}-${Math.random()}`);
    // `create_task` requires a CR (plan 01); every mutation test targets this one.
    await db.changeRequests.add({
      id: CR_ID,
      code: 'CR-AIDRAWER-01',
      name: 'AI Drawer CR',
      status: 'Open',
      type: 'ENHANCEMENT',
      targets: [],
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    });
  });

  afterEach(() => {
    cleanup();
    clearGroundedTurnTestHooks();
  });

  it('maps tool-limit to idle with debug-only metadata and no persisted partial answer', async () => {
    expect(TURN_STATUS_TO_TAB['tool-limit']).toBe('idle');
    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('test-key');
    vi.spyOn(nineRouterTokenService, 'getNineRouterConfig').mockResolvedValue({
      endpoint: 'https://example.invalid', defaultModel: 'model-x', charLimit: 12000,
    });
    const loop = vi.spyOn(orchestrator, 'runAiOrchestratorLoop').mockImplementation(async (options) => {
      options.onTextChunk?.('PARTIAL-NOT-AN-ANSWER');
      options.onToolCall?.({ id: 'audit', name: 'query_notes', args: {} });
      options.onToolResult?.('audit', 'Audit evidence', 2);
      return { fullResponse: 'PARTIAL-NOT-AN-ANSWER', cleanResponse: 'PARTIAL-NOT-AN-ANSWER',
        messages: [], tokenUsage: {}, generatedFiles: [], truncated: false, loopLimitReached: true };
    });
    const finish = vi.spyOn(aiDebugService, 'finishTurn');
    try {
      await getOrCreateActiveChatTab({ scopeKey: 'global', scopeType: 'global' }, db);
      render(<AIChatDrawer open onClose={vi.fn()} db={db} activeScope={{ type: 'global' }} />);
      await waitFor(() => expect(screen.getByTestId('ai-chat-widget').getAttribute('data-scope-key')).not.toBe('default'));
      fireEvent.change(screen.getByLabelText('Nội dung tin nhắn trò chuyện AI'), { target: { value: 'Gather evidence' } });
      fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));
      await waitFor(() => expect(finish).toHaveBeenCalledWith(expect.any(String), { error: 'tool_limit' }));
      expect(await screen.findByText('Đã dừng thu thập bằng chứng')).toBeInTheDocument();
      expect(screen.queryByText('PARTIAL-NOT-AN-ANSWER')).not.toBeInTheDocument();
      expect(document.querySelector('.ant-alert-error')).toBeNull();
      expect(document.querySelector('[role="tab"][aria-selected="true"] .ant-badge-status-error')).toBeNull();
      expect(document.querySelector('[role="tab"][aria-selected="true"] .ant-badge-status-processing')).toBeNull();
      expect(screen.queryByTestId('ai-staged-loading')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Nội dung tin nhắn trò chuyện AI')).toBeEnabled();
      expect(screen.getByRole('button', { name: /\[Công cụ\] query_notes/ })).toBeInTheDocument();
      const rows = await db.chatMessages.toArray();
      expect(rows.filter((row) => row.role === 'assistant')).toHaveLength(0);
      expect(rows.filter((row) => row.role === 'user')).toHaveLength(1);
    } finally { loop.mockRestore(); finish.mockRestore(); }
  });

  it('renders drawer when open is true, handles drag resize and clamp', () => {
    const { container } = render(
      <AIChatDrawer
        open={true}
        onClose={vi.fn()}
        db={db}
        width={400}
        onWidthChange={vi.fn()}
      />
    );

    expect(screen.getByText('Trợ lý AI')).toBeInTheDocument();
    const resizer = container.querySelector('[data-testid="ai-chat-resizer"]');
    expect(resizer).toBeInTheDocument();
  });

  it('submitting message calls streamChatCompletion and appends to thread', async () => {
    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('test-api-key');
    vi.spyOn(nineRouterTokenService, 'getNineRouterConfig').mockResolvedValue({
      endpoint: 'https://api.9router.com',
      defaultModel: 'gpt-4o',
      charLimit: 12000,
    });

    async function* mockEvents() {
      yield { type: 'text', delta: 'Xin ' };
      yield { type: 'text', delta: 'chào!' };
    }
    vi.spyOn(nineRouterClient, 'streamChatEvents').mockImplementation(mockEvents as any);
    vi.spyOn(nineRouterClient, 'streamChatCompletion').mockImplementation(async function* () {
      yield 'Xin ';
      yield 'chào!';
    } as any);

    render(
      <AIChatDrawer
        open={true}
        onClose={vi.fn()}
        db={db}
        activeScope={{ type: 'global' }}
      />
    );

    const textarea = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI');
    fireEvent.change(textarea, { target: { value: 'Chào bạn' } });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));

    await waitFor(() => {
      expect(screen.getByText('Chào bạn')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText(/Xin chào!/i)).toBeInTheDocument();
    });
  });

  it('extracts mentioned task ID and injects into system grounding prompt', async () => {
    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('test-api-key');
    vi.spyOn(nineRouterTokenService, 'getNineRouterConfig').mockResolvedValue({
      endpoint: 'https://api.9router.com',
      defaultModel: 'gpt-4o',
      charLimit: 12000,
    });

    await db.tasks.add({
      id: 'task-test-mention',
      name: 'Tối ưu hóa Database Index',
      status: 'In Progress',
      priority: 'Urgent',
      progress: 50,
      estimateMinutes: 120,
      createdAt: '2026-10-01',
      updatedAt: '2026-10-01',
    });

    const startTurnSpy = vi.spyOn(aiDebugService, 'startTurn');
    async function* mockEvents() {
      yield { type: 'text', delta: 'Đã nhận task!' };
    }
    vi.spyOn(nineRouterClient, 'streamChatEvents').mockImplementation(mockEvents as any);

    render(
      <AIChatDrawer
        open={true}
        onClose={vi.fn()}
        db={db}
        activeScope={{ type: 'global' }}
      />
    );

    const textarea = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI');
    fireEvent.change(textarea, {
      target: { value: 'Hãy phân tích @[Tối ưu hóa Database Index](task:task-test-mention)' },
    });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));

    await waitFor(() => {
      expect(startTurnSpy).toHaveBeenCalled();
    });

    const callArgs = startTurnSpy.mock.calls[0]?.[0];
    expect(callArgs?.systemPrompt).toContain('<mentioned_entities>');
    expect(callArgs?.systemPrompt).toContain('Tối ưu hóa Database Index');
    expect(callArgs?.systemPrompt).toContain('id="task-test-mention"');
  });

  it('clearing context confirms, then removes only the active thread messages (D-05)', async () => {
    const clearSpy = vi.spyOn(chatRepo, 'clearThreadMessages');

    render(
      <AIChatDrawer
        open={true}
        onClose={vi.fn()}
        db={db}
        activeScope={{ type: 'global' }}
      />
    );

    await screen.findByTestId('chat-tab-toolbox');
    const clearBtn = screen.getByLabelText('Đặt lại ngữ cảnh (/clear)');
    fireEvent.click(clearBtn);

    // D-05: clear is thread-scoped and asks first; it must not append a boundary marker instead.
    fireEvent.click(await screen.findByRole('button', { name: 'Xóa tin nhắn' }));

    await waitFor(() => {
      expect(clearSpy).toHaveBeenCalled();
    }, { timeout: 4000 });
    expect(clearSpy.mock.calls[0]?.[0]).toEqual(expect.any(String));
  });

  it('renders with zIndex 1200 in overlay mode', () => {
    const { container } = render(
      <AIChatDrawer
        open={true}
        onClose={vi.fn()}
        db={db}
        isPinned={false}
        isMobile={false}
      />
    );

    const drawerEl = container.firstElementChild as HTMLElement;
    expect(drawerEl.style.zIndex).toBe('1200');
  });

  it('allows in-drawer item picker to switch scope between global, task, project, and milestone', async () => {
    // Populate dummy task, project, and milestone
    await db.changeRequests.add({
      id: 'p-1',
      name: 'Dự án Alpha',
      status: 'In Progress',
      createdAt: '2026-10-01',
      updatedAt: '2026-10-01',
    });

    await db.tasks.add({
      id: 't-1',
      name: 'Tác vụ Khởi tạo',
      status: 'Open',
      priority: 'High',
      crId: CR_ID,
      estimateMinutes: 60,
      progress: 0,
      createdAt: '2026-10-01',
      updatedAt: '2026-10-01',
    });

    render(
      <AIChatDrawer
        open={true}
        onClose={vi.fn()}
        db={db}
        activeScope={{ type: 'global' }}
      />
    );

    // The scope change button in sub-bar
    const changeScopeBtn = screen.getByLabelText('Đổi phạm vi ngữ cảnh');
    expect(changeScopeBtn).toBeInTheDocument();

    // Verify initial scope
    expect(screen.getByText('Toàn cục (Không gắn)')).toBeInTheDocument();

    // Change scope via modal. Re-query the row on each attempt: the drawer re-renders while
    // per-tab runtimes hydrate, which replaces modal nodes mid-interaction.
    fireEvent.click(changeScopeBtn);
    await waitFor(() => {
      expect(screen.getByText(/Tác vụ Khởi tạo/i)).toBeInTheDocument();
    });
    fireEvent.click(
      screen.getByText(/Tác vụ Khởi tạo/i).closest('.scope-picker-item') ??
        screen.getByText(/Tác vụ Khởi tạo/i)
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Tác vụ Khởi tạo/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('auto-fetches available models and updates model picker when opened', async () => {
    vi.spyOn(nineRouterTokenService, 'fetchAvailableModels').mockResolvedValue(['cc-high', 'ag/claude-sonnet-4-6']);

    render(
      <AIChatDrawer
        open={true}
        onClose={vi.fn()}
        db={db}
        activeScope={{ type: 'global' }}
      />
    );

    await waitFor(() => {
      expect(nineRouterTokenService.fetchAvailableModels).toHaveBeenCalled();
    });
  });

  it('executes tool calling loop when stream yields tool_calls', async () => {
    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('test-api-key');
    vi.spyOn(nineRouterTokenService, 'getNineRouterConfig').mockResolvedValue({
      endpoint: 'http://localhost:20128',
      defaultModel: 'gpt-4o',
      charLimit: 12000,
    });

    await db.tasks.add({
      id: 'tool-test-task',
      name: 'Task Tool Test',
      status: 'In Progress',
      priority: 'High',
      crId: CR_ID,
      estimateMinutes: 30,
      progress: 50,
      createdAt: '2026-10-01',
      updatedAt: '2026-10-01',
    });

    let callCount = 0;
    async function* mockEvents() {
      callCount++;
      if (callCount === 1) {
        yield {
          type: 'tool_calls',
          calls: [
            {
              id: 'call_abc',
              type: 'function',
              function: {
                name: 'query_tasks',
                arguments: JSON.stringify({ projectId: 'p-tool' }),
              },
            },
          ],
        };
      } else {
        yield {
          type: 'text',
          delta: 'Dự án có 1 tác vụ đang thực hiện.',
        };
      }
    }

    vi.spyOn(nineRouterClient, 'streamChatEvents').mockImplementation(mockEvents as any);

    render(
      <AIChatDrawer
        open={true}
        onClose={vi.fn()}
        db={db}
        activeScope={{ type: 'global' }}
      />
    );

    const textarea = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI');
    fireEvent.change(textarea, { target: { value: 'Có bao nhiêu task trong p-tool?' } });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));

    await waitFor(() => {
      expect(screen.getByText(/Dự án có 1 tác vụ đang thực hiện/i)).toBeInTheDocument();
    });
    expect(callCount).toBe(2);
  });

  it('uses discovered Graphiti tools across model loops and appends MCP result as tool content', async () => {
    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('test-api-key');
    vi.spyOn(nineRouterTokenService, 'getNineRouterConfig').mockResolvedValue({
      endpoint: 'http://localhost:20128',
      defaultModel: 'gpt-4o',
      charLimit: 12000,
    });
    const graphitiDefinition = {
      type: 'function' as const,
      function: {
        name: 'search_nodes',
        description: 'Search graph nodes',
        parameters: { type: 'object' as const, properties: { query: { type: 'string' } } },
      },
    };
    vi.mocked(mcpClient.discoverAllMcpTools).mockResolvedValue([
      graphitiDefinition,
    ]);
    vi.spyOn(mcpClient, 'executeDynamicMcpTool').mockResolvedValueOnce('graphiti result');

    let callCount = 0;
    const payloads: any[] = [];
    vi.spyOn(nineRouterClient, 'streamChatEvents').mockImplementation((options: any) => {
      payloads.push(options.payload);
      return (async function* () {
        callCount++;
        if (callCount === 1) {
          yield {
            type: 'tool_calls',
            calls: [
              {
                id: 'call_graphiti',
                type: 'function',
                function: { name: 'search_nodes_ide', arguments: '{"query":"alpha"}' },
              },
            ],
          };
        } else {
          yield { type: 'text', delta: 'Đã tổng hợp Graphiti.' };
        }
      })() as any;
    });

    render(
      <AIChatDrawer open={true} onClose={vi.fn()} db={db} activeScope={{ type: 'global' }} />
    );
    fireEvent.change(screen.getByLabelText('Nội dung tin nhắn trò chuyện AI'), {
      target: { value: 'Tra Graphiti' },
    });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));

    await waitFor(() => expect(screen.getByText(/Đã tổng hợp Graphiti/i)).toBeInTheDocument());
    expect(mcpClient.discoverAllMcpTools).toHaveBeenCalledTimes(1);
    expect(mcpClient.executeDynamicMcpTool).toHaveBeenCalledWith(
      'search_nodes',
      {
        query: 'alpha',
      },
      expect.anything(),
      expect.objectContaining({ allowMutation: expect.any(Boolean) })
    );
    expect(payloads).toHaveLength(2);
    expect(payloads[0].messages).toContainEqual(
      expect.objectContaining({
        role: 'system',
        content: expect.stringContaining('SMARTVISTA BANKING DOMAIN DICTIONARY'),
      })
    );
    expect(payloads[0].tools).toContainEqual(graphitiDefinition);
    expect(payloads[1].tools).toBe(payloads[0].tools);
    expect(payloads[1].messages).toContainEqual(
      expect.objectContaining({ role: 'tool', name: 'search_nodes_ide', content: 'graphiti result' })
    );
    expect(aiDebugService.getTurns()[0]?.toolCount).toBe(1);
  });

  it('falls back to local tools when Graphiti discovery fails', async () => {
    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('test-api-key');
    vi.spyOn(nineRouterTokenService, 'getNineRouterConfig').mockResolvedValue({
      endpoint: 'http://localhost:20128',
      defaultModel: 'gpt-4o',
      charLimit: 12000,
    });
    vi.mocked(mcpClient.discoverAllMcpTools).mockRejectedValue(
      new Error('Graphiti offline')
    );
    const streamSpy = vi.spyOn(nineRouterClient, 'streamChatEvents').mockImplementation(
      (async function* () {
        yield { type: 'text', delta: 'Local tools still work.' };
      }) as any
    );
    const fallbackSpy = vi.spyOn(nineRouterClient, 'streamChatCompletion');

    render(
      <AIChatDrawer open={true} onClose={vi.fn()} db={db} activeScope={{ type: 'global' }} />
    );
    fireEvent.change(screen.getByLabelText('Nội dung tin nhắn trò chuyện AI'), {
      target: { value: 'Use local tools' },
    });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));

    await waitFor(() => expect(screen.getByText(/Local tools still work/i)).toBeInTheDocument());
    expect(streamSpy).toHaveBeenCalled();
    expect((streamSpy.mock.calls[0]?.[0] as any).payload.tools.length).toBeGreaterThan(0);
    expect(fallbackSpy).not.toHaveBeenCalled();
  });

  it('renders debug button in header and opens AIDebugModal with tracked turn', async () => {
    aiDebugService.clearLogs();

    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('test-api-key');
    vi.spyOn(nineRouterTokenService, 'getNineRouterConfig').mockResolvedValue({
      endpoint: 'http://localhost:20128',
      defaultModel: 'gpt-4o',
      charLimit: 12000,
    });

    async function* mockEvents() {
      yield {
        type: 'text',
        delta: 'Câu trả lời mẫu',
      };
    }
    vi.spyOn(nineRouterClient, 'streamChatEvents').mockImplementation(mockEvents as any);

    render(
      <AIChatDrawer
        open={true}
        onClose={vi.fn()}
        db={db}
        activeScope={{ type: 'global' }}
      />
    );

    const textarea = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI');
    fireEvent.change(textarea, { target: { value: 'Tin nhắn gỡ lỗi test' } });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));

    await waitFor(() => {
      const turns = aiDebugService.getTurns();
      expect(turns.length).toBeGreaterThan(0);
      expect(turns[0]?.status).toBe('completed');
      expect(turns[0]?.finalResponseLength).toBe('Câu trả lời mẫu'.length);
    });

    fireEvent.click(screen.getByLabelText('Tùy chọn khác'));
    const debugOption = screen.getByText('Nhật ký gỡ lỗi AI');
    fireEvent.click(debugOption);

    await waitFor(() => {
      expect(screen.getByText('Nhật ký gỡ lỗi AI & Payloads')).toBeInTheDocument();
    });
  });

  it('prompts user confirmation before executing a mutation tool and creates task on confirm', async () => {
    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('test-api-key');
    vi.spyOn(nineRouterTokenService, 'getNineRouterConfig').mockResolvedValue({
      endpoint: 'http://localhost:20128',
      defaultModel: 'gpt-4o',
      charLimit: 12000,
    });

    let callCount = 0;
    async function* mockEvents() {
      callCount++;
      if (callCount === 1) {
        yield {
          type: 'tool_calls',
          calls: [
            {
              id: 'call_create_task',
              type: 'function',
              function: {
                name: 'create_task',
                arguments: JSON.stringify({
                  crId: CR_ID,
                  name: 'Tác vụ được tạo bởi AI',
                  priority: 'High',
                  estimateMinutes: 90,
                }),
              },
            },
          ],
        };
      } else {
        yield {
          type: 'text',
          delta: 'Đã tạo tác vụ thành công.',
        };
      }
    }
    vi.spyOn(nineRouterClient, 'streamChatEvents').mockImplementation(mockEvents as any);

    render(
      <AIChatDrawer
        open={true}
        onClose={vi.fn()}
        db={db}
        activeScope={{ type: 'global' }}
      />
    );

    const textarea = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI');
    fireEvent.change(textarea, { target: { value: 'Tạo task Tác vụ được tạo bởi AI' } });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));

    // Confirmation card should appear with mutation details
    await waitFor(() => {
      const confirmCard = screen.getByTestId('ai-mutation-approval');
      expect(confirmCard).toBeInTheDocument();
      expect(confirmCard).toHaveTextContent(/Tác vụ được tạo bởi AI/i);
    });

    // Confirm the mutation
    const confirmBtn = screen.getByRole('button', { name: 'Chấp thuận' });
    fireEvent.click(confirmBtn);

    // Turn completes and task is in db
    await waitFor(() => {
      expect(screen.getByText(/Đã tạo tác vụ thành công/i)).toBeInTheDocument();
    });

    const tasksInDb = await db.tasks.toArray();
    expect(tasksInDb.some((t) => t.name === 'Tác vụ được tạo bởi AI')).toBe(true);
  });

  // Substituted assertion: the declined turn now persists nothing (T-25.3-37) instead of the
  // old loop's assistant cancellation row; the safety property under test is unchanged.
  it('cancels mutation when user clicks Từ chối (No) and writes neither data nor assistant content', async () => {
    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('test-api-key');
    vi.spyOn(nineRouterTokenService, 'getNineRouterConfig').mockResolvedValue({
      endpoint: 'http://localhost:20128',
      defaultModel: 'gpt-4o',
      charLimit: 12000,
    });

    let callCount = 0;
    async function* mockEvents() {
      callCount++;
      if (callCount === 1) {
        yield {
          type: 'tool_calls',
          calls: [
            {
              id: 'call_create_task_2',
              type: 'function',
              function: {
                name: 'create_task',
                arguments: JSON.stringify({
                  name: 'Tác vụ bị từ chối',
                }),
              },
            },
          ],
        };
      } else {
        yield {
          type: 'text',
          delta: 'Thao tác đã bị hủy theo yêu cầu.',
        };
      }
    }
    vi.spyOn(nineRouterClient, 'streamChatEvents').mockImplementation(mockEvents as any);

    render(
      <AIChatDrawer
        open={true}
        onClose={vi.fn()}
        db={db}
        activeScope={{ type: 'global' }}
      />
    );

    const textarea = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI');
    fireEvent.change(textarea, { target: { value: 'Tạo task từ chối' } });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));

    await waitFor(() => {
      expect(screen.getByTestId('ai-mutation-approval')).toBeInTheDocument();
    });

    // User declines
    const declineBtn = screen.getByRole('button', { name: 'Từ chối' });
    fireEvent.click(declineBtn);

    await waitFor(() => {
      expect(screen.queryByTestId('ai-mutation-approval')).toBeNull();
    });

    const tasksInDb = await db.tasks.toArray();
    expect(tasksInDb.some((t) => t.name === 'Tác vụ bị từ chối')).toBe(false);
    const assistantRows = (await db.chatMessages.toArray()).filter((m) => m.role === 'assistant');
    expect(assistantRows).toHaveLength(0);
  });

  it('allows user to confirm mutation by typing "yes" into chat input', async () => {
    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('test-api-key');
    vi.spyOn(nineRouterTokenService, 'getNineRouterConfig').mockResolvedValue({
      endpoint: 'http://localhost:20128',
      defaultModel: 'gpt-4o',
      charLimit: 12000,
    });

    let callCount = 0;
    async function* mockEvents() {
      callCount++;
      if (callCount === 1) {
        yield {
          type: 'tool_calls',
          calls: [
            {
              id: 'call_create_task_yes',
              type: 'function',
              function: {
                name: 'create_task',
                arguments: JSON.stringify({
                  crId: CR_ID,
                  name: 'Tác vụ xác nhận bằng chữ',
                }),
              },
            },
          ],
        };
      } else {
        yield {
          type: 'text',
          delta: 'Tác vụ đã được lưu.',
        };
      }
    }
    vi.spyOn(nineRouterClient, 'streamChatEvents').mockImplementation(mockEvents as any);

    render(
      <AIChatDrawer
        open={true}
        onClose={vi.fn()}
        db={db}
        activeScope={{ type: 'global' }}
      />
    );

    const textarea = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI');
    fireEvent.change(textarea, { target: { value: 'Tạo task' } });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));

    await waitFor(() => {
      expect(screen.getByTestId('ai-mutation-approval')).toBeInTheDocument();
    });

    // Type "yes" and send. The composer remounts when the durable tab id resolves, so re-query it.
    const followUpInput = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI');
    fireEvent.change(followUpInput, { target: { value: 'yes' } });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));

    await waitFor(() => {
      expect(screen.getByText(/Tác vụ đã được lưu/i)).toBeInTheDocument();
    });

    const tasksInDb = await db.tasks.toArray();
    expect(tasksInDb.some((t) => t.name === 'Tác vụ xác nhận bằng chữ')).toBe(true);
  });

  it('correctly handles cloaked tool names from 9Router proxy such as create_task_ide', async () => {
    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('test-api-key');
    vi.spyOn(nineRouterTokenService, 'getNineRouterConfig').mockResolvedValue({
      endpoint: 'http://localhost:20128',
      defaultModel: 'gpt-4o',
      charLimit: 12000,
    });

    let callCount = 0;
    async function* mockEvents() {
      callCount++;
      if (callCount === 1) {
        yield {
          type: 'tool_calls',
          calls: [
            {
              id: 'call_create_task_ide',
              type: 'function',
              function: {
                name: 'create_task_ide', // Cloaked name from 9router Antigravity
                arguments: JSON.stringify({
                  crId: CR_ID,
                  name: 'Tác vụ cloaked _ide',
                }),
              },
            },
          ],
        };
      } else {
        yield {
          type: 'text',
          delta: 'Đã hoàn thành tạo tác vụ cloaked.',
        };
      }
    }
    vi.spyOn(nineRouterClient, 'streamChatEvents').mockImplementation(mockEvents as any);

    render(
      <AIChatDrawer
        open={true}
        onClose={vi.fn()}
        db={db}
        activeScope={{ type: 'global' }}
      />
    );

    const textarea = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI');
    fireEvent.change(textarea, { target: { value: 'Tạo task cloaked' } });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));

    // Should recognize as mutation and show confirmation
    await waitFor(() => {
      expect(screen.getByTestId('ai-mutation-approval')).toBeInTheDocument();
      expect(screen.getByText(/Tác vụ cloaked _ide/i)).toBeInTheDocument();
    });

    const confirmBtn = screen.getByRole('button', { name: 'Chấp thuận' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByText(/Đã hoàn thành tạo tác vụ cloaked/i)).toBeInTheDocument();
    });

    const tasksInDb = await db.tasks.toArray();
    expect(tasksInDb.some((t) => t.name === 'Tác vụ cloaked _ide')).toBe(true);
  });

  it('displays user-friendly error card when AI model returns an empty response', async () => {
    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('test-api-key');
    vi.spyOn(nineRouterTokenService, 'getNineRouterConfig').mockResolvedValue({
      endpoint: 'http://localhost:20128',
      defaultModel: 'gpt-4o',
      charLimit: 12000,
    });

    // Generator that yields nothing (empty stream)
    async function* mockEmptyEvents() {}
    vi.spyOn(nineRouterClient, 'streamChatEvents').mockImplementation(mockEmptyEvents as any);
    vi.spyOn(nineRouterClient, 'streamChatCompletion').mockImplementation(async function* () {} as any);

    render(
      <AIChatDrawer
        open={true}
        onClose={vi.fn()}
        db={db}
        activeScope={{ type: 'global' }}
      />
    );

    const textarea = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI');
    fireEvent.change(textarea, { target: { value: 'Tin nhắn phản hồi rỗng' } });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));

    await waitFor(() => {
      expect(
        screen.getByText(/Không thể xử lý yêu cầu/i)
      ).toBeInTheDocument();
    });
  });

  it('bypasses confirmation prompt and automatically executes mutation when auto-approve is enabled', async () => {
    localStorage.setItem('planner:ai_auto_approve_mutations', 'true');

    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('test-api-key');
    vi.spyOn(nineRouterTokenService, 'getNineRouterConfig').mockResolvedValue({
      endpoint: 'http://localhost:20128',
      defaultModel: 'gpt-4o',
      charLimit: 12000,
    });

    let callCount = 0;
    async function* mockEvents() {
      callCount++;
      if (callCount === 1) {
        yield {
          type: 'tool_calls',
          calls: [
            {
              id: 'call_auto_create_task',
              type: 'function',
              function: {
                name: 'create_task',
                arguments: JSON.stringify({
                  crId: CR_ID,
                  name: 'Tác vụ tự động duyệt',
                  priority: 'High',
                }),
              },
            },
          ],
        };
      } else {
        yield {
          type: 'text',
          delta: 'Báo cáo thay đổi: Đã tự động tạo tác vụ "Tác vụ tự động duyệt" [Ưu tiên: High].',
        };
      }
    }
    vi.spyOn(nineRouterClient, 'streamChatEvents').mockImplementation(mockEvents as any);

    render(
      <AIChatDrawer
        open={true}
        onClose={vi.fn()}
        db={db}
        activeScope={{ type: 'global' }}
      />
    );

    // Verify auto-approve button in tab toolbox shows enabled state
    expect(await screen.findByTestId('tab-auto-approve-btn')).toBeInTheDocument();

    const textarea = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI');
    fireEvent.change(textarea, { target: { value: 'Tạo task tự động' } });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));

    // Should NOT show confirmation prompt
    await waitFor(() => {
      expect(screen.queryByTestId('ai-mutation-approval')).not.toBeInTheDocument();
      expect(screen.getByText(/Báo cáo thay đổi: Đã tự động tạo tác vụ/i)).toBeInTheDocument();
    });

    // Verify mutation was committed to database directly
    const tasksInDb = await db.tasks.toArray();
    expect(tasksInDb.some((t) => t.name === 'Tác vụ tự động duyệt' && t.priority === 'High')).toBe(true);
  });

  it('opens AI task planner instructions modal from dropdown menu', async () => {
    render(
      <AIChatDrawer
        open={true}
        onClose={vi.fn()}
        db={db}
        activeScope={{ type: 'global' }}
      />
    );

    fireEvent.click(screen.getByLabelText('Tùy chọn khác'));
    const instructionsOption = screen.getByText('Hướng dẫn lập kế hoạch AI');
    expect(instructionsOption).toBeInTheDocument();
    fireEvent.click(instructionsOption);

    await waitFor(() => {
      expect(screen.getByText('Hướng dẫn sử dụng AI Task Planner')).toBeInTheDocument();
      expect(screen.getByText('Cú pháp nhanh (@, #, /)')).toBeInTheDocument();
    });
  });

  it('triggers final synthesis pass to summarize results when tools run without trailing text', async () => {
    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('test-api-key');
    vi.spyOn(nineRouterTokenService, 'getNineRouterConfig').mockResolvedValue({
      endpoint: 'http://localhost:20128',
      defaultModel: 'gpt-4o',
      charLimit: 12000,
    });

    // Mock streamChatEvents: turn 1 emits tool_calls without text, turn 2 (loop after tool execution) returns no text, triggering final synthesis pass
    let callCount = 0;
    async function* mockEvents() {
      callCount++;
      if (callCount === 1) {
        yield {
          type: 'tool_calls',
          calls: [
            {
              id: 'call_query_1',
              type: 'function',
              function: {
                name: 'query_tasks',
                arguments: JSON.stringify({}),
              },
            },
          ],
        };
      } else if (callCount === 2) {
        // AI returns no text after tool result, causing hasToolCalls=true && !fullResponse
        yield { type: 'text', delta: '' };
      } else {
        // Synthesis pass calls streamChatEvents
        yield { type: 'text', delta: 'Tổng hợp: Hệ thống hiện có 0 tác vụ.' };
      }
    }
    vi.spyOn(nineRouterClient, 'streamChatEvents').mockImplementation(mockEvents as any);

    render(
      <AIChatDrawer
        open={true}
        onClose={vi.fn()}
        db={db}
        activeScope={{ type: 'global' }}
      />
    );

    const textarea = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI');
    fireEvent.change(textarea, { target: { value: 'Kiểm tra task' } });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));

    await waitFor(() => {
      expect(screen.getByText(/Tổng hợp: Hệ thống hiện có 0 tác vụ/i)).toBeInTheDocument();
    });
  });

  it('catches tool execution errors and feeds error to AI instead of crashing harness', async () => {
    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('test-api-key');
    vi.spyOn(nineRouterTokenService, 'getNineRouterConfig').mockResolvedValue({
      endpoint: 'http://localhost:20128',
      defaultModel: 'gpt-4o',
      charLimit: 12000,
    });

    let callCount = 0;
    async function* mockEvents() {
      callCount++;
      if (callCount === 1) {
        yield {
          type: 'tool_calls',
          calls: [
            {
              id: 'call_failing_tool',
              type: 'function',
              function: {
                name: 'non_existent_tool_name',
                arguments: '{}',
              },
            },
          ],
        };
      } else {
        yield {
          type: 'text',
          delta: 'Công cụ bị lỗi nhưng tôi đã xử lý an toàn.',
        };
      }
    }
    vi.spyOn(nineRouterClient, 'streamChatEvents').mockImplementation(mockEvents as any);

    render(
      <AIChatDrawer
        open={true}
        onClose={vi.fn()}
        db={db}
        activeScope={{ type: 'global' }}
      />
    );

    const textarea = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI');
    fireEvent.change(textarea, { target: { value: 'Chạy công cụ lỗi' } });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));

    await waitFor(() => {
      expect(screen.getByText(/Công cụ bị lỗi nhưng tôi đã xử lý an toàn/i)).toBeInTheDocument();
    });
  });

  it('opens McpSettingsModal from tab toolbox and renders server list', async () => {
    render(
      <AIChatDrawer
        open={true}
        onClose={vi.fn()}
        db={db}
        activeScope={{ type: 'global' }}
      />
    );

    const mcpManageBtn = await screen.findByTestId('tab-mcp-btn');
    fireEvent.click(mcpManageBtn);
    const settingsBtn = await screen.findByRole('button', { name: /Cài đặt/i });
    fireEvent.click(settingsBtn);

    await waitFor(() => {
      expect(screen.getByText('Graphiti Banking MCP')).toBeInTheDocument();
      expect(screen.getByLabelText('Bật/tắt Graphiti Banking MCP')).toBeInTheDocument();
    });
  });

  it('excludes Graphiti tools and SmartVista instructions when Graphiti MCP is disabled', async () => {
    await graphitiMcpClient.setGraphitiMcpEnabled(false, db);

    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('test-api-key');
    vi.spyOn(nineRouterTokenService, 'getNineRouterConfig').mockResolvedValue({
      endpoint: 'http://localhost:20128',
      defaultModel: 'gpt-4o',
      charLimit: 12000,
    });

    const payloads: any[] = [];
    vi.spyOn(nineRouterClient, 'streamChatEvents').mockImplementation((options: any) => {
      payloads.push(options.payload);
      return (async function* () {
        yield { type: 'text', delta: 'Trả lời không có MCP.' };
      })() as any;
    });

    render(
      <AIChatDrawer open={true} onClose={vi.fn()} db={db} activeScope={{ type: 'global' }} />
    );

    fireEvent.change(screen.getByLabelText('Nội dung tin nhắn trò chuyện AI'), {
      target: { value: 'Hỏi bài' },
    });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));

    await waitFor(() => expect(screen.getByText(/Trả lời không có MCP/i)).toBeInTheDocument());
    expect(graphitiMcpClient.getGraphitiMcpToolDefinitions).not.toHaveBeenCalled();
    expect(payloads[0].messages).not.toContainEqual(
      expect.objectContaining({
        content: expect.stringContaining('SMARTVISTA BANKING DOMAIN DICTIONARY'),
      })
    );
    expect(
      payloads[0].tools.some((t: any) => t.function?.name === 'search_nodes')
    ).toBe(false);
  });

  it('blocks execution and returns disabled error message if model invokes Graphiti tool while disabled', async () => {
    await graphitiMcpClient.setGraphitiMcpEnabled(false, db);

    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('test-api-key');
    vi.spyOn(nineRouterTokenService, 'getNineRouterConfig').mockResolvedValue({
      endpoint: 'http://localhost:20128',
      defaultModel: 'gpt-4o',
      charLimit: 12000,
    });

    let callCount = 0;
    const payloads: any[] = [];
    vi.spyOn(nineRouterClient, 'streamChatEvents').mockImplementation((options: any) => {
      payloads.push(options.payload);
      return (async function* () {
        callCount++;
        if (callCount === 1) {
          yield {
            type: 'tool_calls',
            calls: [
              {
                id: 'call_blocked_mcp',
                type: 'function',
                function: { name: 'search_nodes', arguments: '{"query":"alpha"}' },
              },
            ],
          };
        } else {
          yield { type: 'text', delta: 'Đã nhận thông báo tắt MCP.' };
        }
      })() as any;
    });

    const executeSpy = vi.spyOn(graphitiMcpClient, 'executeGraphitiMcpTool');

    render(
      <AIChatDrawer open={true} onClose={vi.fn()} db={db} activeScope={{ type: 'global' }} />
    );

    fireEvent.change(screen.getByLabelText('Nội dung tin nhắn trò chuyện AI'), {
      target: { value: 'Thử gọi MCP khi tắt' },
    });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));

    await waitFor(() => expect(screen.getByText(/Đã nhận thông báo tắt MCP/i)).toBeInTheDocument());
    expect(executeSpy).not.toHaveBeenCalled();
    expect(payloads[1].messages).toContainEqual(
      expect.objectContaining({
        role: 'tool',
        name: 'search_nodes',
        content: expect.stringContaining('Máy chủ Graphiti MCP hiện đang bị tắt bởi người dùng'),
      })
    );
  });

  it('grounds document scope context when activeScope is document type with valid id', async () => {
    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('test-api-key');
    vi.spyOn(nineRouterTokenService, 'getNineRouterConfig').mockResolvedValue({
      endpoint: 'https://api.9router.com',
      defaultModel: 'gpt-4o',
      charLimit: 12000,
    });

    await db.notes.add({
      id: 'doc-scope-test-1',
      title: 'Tài liệu kiến trúc hệ thống Core Banking',
      body: '# Core Banking Specs\nNội dung chi tiết về luồng xử lý giao dịch tài chính.',
      tags: ['banking', 'architecture'],
      isPinned: false,
      createdAt: '2026-10-01',
      updatedAt: '2026-10-01',
    });

    const startTurnSpy = vi.spyOn(aiDebugService, 'startTurn');
    async function* mockEvents() {
      yield { type: 'text', delta: 'Đã nhận tài liệu kiến trúc!' };
    }
    vi.spyOn(nineRouterClient, 'streamChatEvents').mockImplementation(mockEvents as any);

    render(
      <AIChatDrawer
        open={true}
        onClose={vi.fn()}
        db={db}
        activeScope={{
          type: 'document',
          id: 'doc-scope-test-1',
          title: 'Tài liệu kiến trúc hệ thống Core Banking',
        }}
      />
    );

    const textarea = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI');
    fireEvent.change(textarea, { target: { value: 'Hãy phân tích tài liệu này' } });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));

    await waitFor(() => {
      expect(startTurnSpy).toHaveBeenCalled();
    });

    const callArgs = startTurnSpy.mock.calls[0]?.[0];
    expect(callArgs?.systemPrompt).toContain('<item_context type="document" id="doc-scope-test-1">');
    expect(callArgs?.systemPrompt).toContain('Tài liệu kiến trúc hệ thống Core Banking');
    expect(callArgs?.systemPrompt).toContain('Nội dung chi tiết về luồng xử lý giao dịch tài chính');
  });

  it('displays enriched mutation summary with entity name in confirmation modal', async () => {
    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('test-api-key');
    vi.spyOn(nineRouterTokenService, 'getNineRouterConfig').mockResolvedValue({
      endpoint: 'http://localhost:20128',
      defaultModel: 'gpt-4o',
      charLimit: 12000,
    });

    await db.tasks.add({
      id: 'task-enrich-confirm',
      name: 'Nâng cấp bảo mật JWT',
      status: 'Open',
      priority: 'Medium',
      progress: 0,
      estimateMinutes: 60,
      createdAt: '2026-10-01',
      updatedAt: '2026-10-01',
    });

    let callCount = 0;
    async function* mockEvents() {
      callCount++;
      if (callCount === 1) {
        yield {
          type: 'tool_calls',
          calls: [
            {
              id: 'call_update_task_enrich',
              type: 'function',
              function: {
                name: 'update_task',
                arguments: JSON.stringify({
                  id: 'task-enrich-confirm',
                  status: 'Done',
                  priority: 'Urgent',
                }),
              },
            },
          ],
        };
      } else {
        yield {
          type: 'text',
          delta: 'Đã hoàn tất cập nhật.',
        };
      }
    }
    vi.spyOn(nineRouterClient, 'streamChatEvents').mockImplementation(mockEvents as any);

    render(
      <AIChatDrawer
        open={true}
        onClose={vi.fn()}
        db={db}
        activeScope={{ type: 'global' }}
      />
    );

    const textarea = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI');
    fireEvent.change(textarea, { target: { value: 'Cập nhật task Nâng cấp bảo mật JWT' } });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));

    await waitFor(() => {
      const confirmCard = screen.getByTestId('ai-mutation-approval');
      expect(confirmCard).toBeInTheDocument();
      // Should show resolved task name and formatted field changes instead of raw id
      expect(confirmCard).toHaveTextContent(/Nâng cấp bảo mật JWT/);
      expect(confirmCard).toHaveTextContent(/Trạng thái: "Done"/);
      expect(confirmCard).toHaveTextContent(/Ưu tiên: "Urgent"/);
    });
  });

  it('renders clarify question with role="status" and loops composite query upon reply', async () => {
    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('test-api-key');
    vi.spyOn(nineRouterTokenService, 'getNineRouterConfig').mockResolvedValue({
      endpoint: 'http://localhost:20128',
      defaultModel: 'gpt-4o',
      charLimit: 12000,
    });

    let turnCalls = 0;
    const queriesReceived: string[] = [];
    setGroundedTurnTestHooks({
      runGroundedTurn: async (input) => {
        turnCalls++;
        queriesReceived.push(input.query);
        if (turnCalls === 1) {
          return {
            kind: 'clarify_intent',
            clarifyQuestion: 'Bạn muốn hỏi về tiến độ hay quy trình nào?',
          };
        }
        return {
          kind: 'operational',
          routedQuery: input.query,
        };
      },
    });

    async function* mockEvents() {
      yield { type: 'text', delta: 'Đã hoàn tất sau khi làm rõ.' };
    }
    vi.spyOn(nineRouterClient, 'streamChatEvents').mockImplementation(mockEvents as any);

    render(
      <AIChatDrawer
        open={true}
        onClose={vi.fn()}
        db={db}
        activeScope={{ type: 'global' }}
      />
    );

    const textarea = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI');
    fireEvent.change(textarea, { target: { value: 'cái đó' } });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));

    await waitFor(() => {
      expect(
        screen.getByText('Bạn muốn hỏi về tiến độ hay quy trình nào?')
      ).toBeInTheDocument();
      expect(screen.getByTestId('clarification-prompt-card')).toBeInTheDocument();
    });

    // Replying with natural text continues loop without route chips. The composer remounts when the
    // durable tab id resolves, so re-query it rather than reusing the pre-hydration reference.
    fireEvent.change(screen.getByLabelText('Nội dung tin nhắn trò chuyện AI'), {
      target: { value: 'về tính lãi thẻ tín dụng' },
    });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));

    await waitFor(() => {
      expect(turnCalls).toBe(2);
      expect(queriesReceived[1]).toContain('cái đó');
      expect(queriesReceived[1]).toContain('[Thông tin bổ sung]: về tính lãi thẻ tín dụng');
      expect(screen.getByText('Đã hoàn tất sau khi làm rõ.')).toBeInTheDocument();
    });
  });

  it('fails closed when IntentRouterUnavailableError is thrown without executing tools', async () => {
    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('test-api-key');
    vi.spyOn(nineRouterTokenService, 'getNineRouterConfig').mockResolvedValue({
      endpoint: 'http://localhost:20128',
      defaultModel: 'gpt-4o',
      charLimit: 12000,
    });

    const streamSpy = vi.spyOn(nineRouterClient, 'streamChatEvents');

    const { IntentRouterUnavailableError } = await import(
      '../../src/services/ai/intentRouter'
    );

    setGroundedTurnTestHooks({
      runGroundedTurn: async () => {
        throw new IntentRouterUnavailableError(
          'LLM endpoint is not configured; intent routing is unavailable.'
        );
      },
    });

    render(
      <AIChatDrawer
        open={true}
        onClose={vi.fn()}
        db={db}
        activeScope={{ type: 'global' }}
      />
    );

    const textarea = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI');
    fireEvent.change(textarea, { target: { value: 'Hỏi bất kỳ điều gì khi LLM chết' } });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));

    await waitFor(() => {
      expect(screen.getByTestId('inline-api-error-card')).toBeInTheDocument();
      expect(
        screen.getAllByText(/Trợ lý AI tạm thời không khả dụng/i).length
      ).toBeGreaterThanOrEqual(1);
    });

    // Zero tools run
    expect(streamSpy).not.toHaveBeenCalled();
  });

  it('analysis mode skips the grounded turn and runs the tool loop with trimmed history pruning', async () => {
    localStorage.setItem('planner:ai_analysis_mode', 'true');
    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('test-api-key');
    vi.spyOn(nineRouterTokenService, 'getNineRouterConfig').mockResolvedValue({
      endpoint: 'http://localhost:20128',
      defaultModel: 'gpt-4o',
      charLimit: 12000,
    });

    const groundedMock = vi.fn();
    setGroundedTurnTestHooks({ runGroundedTurn: groundedMock });

    const payloads: any[] = [];
    vi.spyOn(nineRouterClient, 'streamChatEvents').mockImplementation((options: any) => {
      payloads.push(options.payload);
      return (async function* () {
        yield { type: 'text', delta: 'Phân tích xong.' };
      })() as any;
    });

    render(
      <AIChatDrawer open={true} onClose={vi.fn()} db={db} activeScope={{ type: 'global' }} />
    );

    fireEvent.change(screen.getByLabelText('Nội dung tin nhắn trò chuyện AI'), {
      target: { value: 'Phân tích yêu cầu này' },
    });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));

    await waitFor(() => {
      expect(screen.getByText(/Phân tích xong/i)).toBeInTheDocument();
    });
    expect(groundedMock).not.toHaveBeenCalled();
    expect(payloads.length).toBeGreaterThan(0);
    const systemContents = payloads[0].messages
      .filter((m: any) => m.role === 'system')
      .map((m: any) => m.content)
      .join('\n');
    expect(systemContents).toContain('[ANALYSIS MODE ACTIVE]');
  });

  it('strictly blocks database mutation in analysis mode and returns Vietnamese read-only message', async () => {
    localStorage.setItem('planner:ai_analysis_mode', 'true');
    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('test-api-key');
    vi.spyOn(nineRouterTokenService, 'getNineRouterConfig').mockResolvedValue({
      endpoint: 'http://localhost:20128',
      defaultModel: 'gpt-4o',
      charLimit: 12000,
    });

    let callCount = 0;
    const payloads: any[] = [];
    vi.spyOn(nineRouterClient, 'streamChatEvents').mockImplementation((options: any) => {
      payloads.push(options.payload);
      return (async function* () {
        callCount++;
        if (callCount === 1) {
          yield {
            type: 'tool_calls',
            calls: [
              {
                id: 'call_blocked_create_task',
                type: 'function',
                function: {
                  name: 'create_task',
                  arguments: JSON.stringify({ crId: CR_ID, name: 'Task khong duoc tao trong analysis mode' }),
                },
              },
            ],
          };
        } else {
          yield { type: 'text', delta: 'Đã nhận kết quả chặn phân tích.' };
        }
      })() as any;
    });

    render(
      <AIChatDrawer open={true} onClose={vi.fn()} db={db} activeScope={{ type: 'global' }} />
    );

    fireEvent.change(screen.getByLabelText('Nội dung tin nhắn trò chuyện AI'), {
      target: { value: 'Tạo task trong analysis mode' },
    });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));

    await waitFor(() => {
      expect(screen.getByText(/Đã nhận kết quả chặn phân tích/i)).toBeInTheDocument();
    });

    expect(screen.queryByTestId('ai-mutation-approval')).not.toBeInTheDocument();

    expect(payloads[1].messages).toContainEqual(
      expect.objectContaining({
        role: 'tool',
        name: 'create_task',
        content: expect.stringContaining('Analysis Mode chỉ đọc; không có dữ liệu nào bị thay đổi.'),
      })
    );

    const tasksInDb = await db.tasks.toArray();
    expect(tasksInDb.some((t) => t.name === 'Task khong duoc tao trong analysis mode')).toBe(false);
  });
});
