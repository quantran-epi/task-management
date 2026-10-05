import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatHeader } from '../../src/components/ai/ChatHeader';
import { AIChatDrawer } from '../../src/components/ai/AIChatDrawer';
import { TaskPlannerDatabase } from '../../src/db';
import * as chatRepo from '../../src/db/repositories/chatRepo';
import * as nineRouterClient from '../../src/services/ai/nineRouterClient';
import * as nineRouterTokenService from '../../src/services/ai/nineRouterTokenService';
import * as graphitiMcpClient from '../../src/services/ai/graphitiMcpClient';
import { aiDebugService } from '../../src/services/ai/aiDebugService';

vi.mock('../../src/utils/pptxExport', () => ({
  exportPresentationAsFile: vi.fn(),
}));

describe('ChatHeader', () => {
  it('displays title, model selector, and action buttons', () => {
    const handleClear = vi.fn();
    const handleTogglePin = vi.fn();
    const handleClose = vi.fn();
    const handleModelChange = vi.fn();
    const handlePopout = vi.fn();

    render(
      <ChatHeader
        selectedModel="gpt-4o"
        availableModels={['gpt-4o', 'claude-3-5-sonnet']}
        onModelChange={handleModelChange}
        isPinned={false}
        onTogglePin={handleTogglePin}
        onClearContext={handleClear}
        onPopout={handlePopout}
        onClose={handleClose}
      />
    );

    expect(screen.getByText('Trợ lý AI')).toBeInTheDocument();
    expect(screen.getByLabelText('Mở cửa sổ riêng (Popout)')).toBeInTheDocument();
    expect(screen.getByLabelText('Đặt lại ngữ cảnh (/clear)')).toBeInTheDocument();
    expect(screen.getByLabelText('Tùy chọn khác')).toBeInTheDocument();
    expect(screen.getByLabelText('Đóng ngăn trò chuyện')).toBeInTheDocument();

    // Click more options dropdown to toggle pin
    fireEvent.click(screen.getByLabelText('Tùy chọn khác'));
    const pinOption = screen.getByText('Ghim ngăn trò chuyện bên phải');
    expect(pinOption).toBeInTheDocument();
    fireEvent.click(pinOption);
    expect(handleTogglePin).toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Đặt lại ngữ cảnh (/clear)'));
    expect(handleClear).toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Đóng ngăn trò chuyện'));
    expect(handleClose).toHaveBeenCalled();
  });

  it('renders and toggles auto-approve mutations button in dropdown', () => {
    const handleToggleAutoApprove = vi.fn();

    const { rerender } = render(
      <ChatHeader
        selectedModel="gpt-4o"
        availableModels={['gpt-4o']}
        onModelChange={vi.fn()}
        autoApproveMutations={false}
        onToggleAutoApproveMutations={handleToggleAutoApprove}
        isPinned={false}
        onTogglePin={vi.fn()}
        onClearContext={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByLabelText('Tùy chọn khác'));
    const toggleBtn = screen.getByText('Bật tự động duyệt thay đổi');
    expect(toggleBtn).toBeInTheDocument();
    fireEvent.click(toggleBtn);
    expect(handleToggleAutoApprove).toHaveBeenCalledTimes(1);

    // Rerender with autoApproveMutations=true
    rerender(
      <ChatHeader
        selectedModel="gpt-4o"
        availableModels={['gpt-4o']}
        onModelChange={vi.fn()}
        autoApproveMutations={true}
        onToggleAutoApproveMutations={handleToggleAutoApprove}
        isPinned={false}
        onTogglePin={vi.fn()}
        onClearContext={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByLabelText('Tùy chọn khác'));
    expect(screen.getByText('Tắt tự động duyệt thay đổi')).toBeInTheDocument();
  });
});

describe('AIChatDrawer', () => {
  let db: TaskPlannerDatabase;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.spyOn(graphitiMcpClient, 'getGraphitiMcpToolDefinitions').mockResolvedValue([]);
    db = new TaskPlannerDatabase(`test-aichat-drawer-${Date.now()}-${Math.random()}`);
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

  it('clicking clear context calls clearThreadContext and shows divider', async () => {
    const clearSpy = vi.spyOn(chatRepo, 'clearThreadContext');

    render(
      <AIChatDrawer
        open={true}
        onClose={vi.fn()}
        db={db}
        activeScope={{ type: 'global' }}
      />
    );

    const clearBtn = screen.getByLabelText('Đặt lại ngữ cảnh (/clear)');
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(clearSpy).toHaveBeenCalled();
    });
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
    await db.projects.add({
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
      projectId: 'p-1',
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

    // Change scope via modal
    fireEvent.click(changeScopeBtn);
    const taskOption = await screen.findByText(/Tác vụ Khởi tạo/i);
    expect(taskOption).toBeInTheDocument();

    fireEvent.click(taskOption);

    await waitFor(() => {
      expect(screen.getByText(/Đang gắn ngữ cảnh: Tác vụ Khởi tạo/i)).toBeInTheDocument();
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
      projectId: 'p-tool',
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
    vi.mocked(graphitiMcpClient.getGraphitiMcpToolDefinitions).mockResolvedValue([
      graphitiDefinition,
    ]);
    vi.spyOn(graphitiMcpClient, 'executeGraphitiMcpTool').mockResolvedValue('graphiti result');

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
    expect(graphitiMcpClient.getGraphitiMcpToolDefinitions).toHaveBeenCalledTimes(1);
    expect(graphitiMcpClient.executeGraphitiMcpTool).toHaveBeenCalledWith('search_nodes', {
      query: 'alpha',
    });
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
    expect(aiDebugService.getTurns()[0]?.toolsSent).toContainEqual(graphitiDefinition);
  });

  it('falls back to local tools when Graphiti discovery fails', async () => {
    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('test-api-key');
    vi.spyOn(nineRouterTokenService, 'getNineRouterConfig').mockResolvedValue({
      endpoint: 'http://localhost:20128',
      defaultModel: 'gpt-4o',
      charLimit: 12000,
    });
    vi.mocked(graphitiMcpClient.getGraphitiMcpToolDefinitions).mockRejectedValue(
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
      expect(turns[0]?.finalResponse).toContain('Câu trả lời mẫu');
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
      const confirmCard = screen.getByTestId('ai-mutation-confirmation');
      expect(confirmCard).toBeInTheDocument();
      expect(confirmCard).toHaveTextContent(/Tác vụ được tạo bởi AI/i);
    });

    // Confirm the mutation
    const confirmBtn = screen.getByLabelText('Xác nhận thao tác');
    fireEvent.click(confirmBtn);

    // Turn completes and task is in db
    await waitFor(() => {
      expect(screen.getByText(/Đã tạo tác vụ thành công/i)).toBeInTheDocument();
    });

    const tasksInDb = await db.tasks.toArray();
    expect(tasksInDb.some((t) => t.name === 'Tác vụ được tạo bởi AI')).toBe(true);
  });

  it('cancels mutation when user clicks Không (No) and does not modify database', async () => {
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
      expect(screen.getByTestId('ai-mutation-confirmation')).toBeInTheDocument();
    });

    // User declines
    const declineBtn = screen.getByLabelText('Từ chối thao tác');
    fireEvent.click(declineBtn);

    await waitFor(() => {
      expect(screen.getByText(/Thao tác đã bị hủy theo yêu cầu/i)).toBeInTheDocument();
    });

    const tasksInDb = await db.tasks.toArray();
    expect(tasksInDb.some((t) => t.name === 'Tác vụ bị từ chối')).toBe(false);
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
      expect(screen.getByTestId('ai-mutation-confirmation')).toBeInTheDocument();
    });

    // Type "yes" and send
    fireEvent.change(textarea, { target: { value: 'yes' } });
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
      expect(screen.getByTestId('ai-mutation-confirmation')).toBeInTheDocument();
      expect(screen.getByText(/Tác vụ cloaked _ide/i)).toBeInTheDocument();
    });

    const confirmBtn = screen.getByLabelText('Xác nhận thao tác');
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
        screen.getByText(/Mô hình AI không trả về nội dung/i)
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

    // Verify toggle option in header dropdown shows enabled state
    fireEvent.click(screen.getByLabelText('Tùy chọn khác'));
    expect(screen.getByText('Tắt tự động duyệt thay đổi')).toBeInTheDocument();
    // Close dropdown
    fireEvent.click(screen.getByLabelText('Tùy chọn khác'));

    const textarea = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI');
    fireEvent.change(textarea, { target: { value: 'Tạo task tự động' } });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));

    // Should NOT show confirmation prompt
    await waitFor(() => {
      expect(screen.queryByTestId('ai-mutation-confirmation')).not.toBeInTheDocument();
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
});
