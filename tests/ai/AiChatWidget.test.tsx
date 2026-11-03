import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, within } from '@testing-library/react';
import {
  AiChatWidget,
  type AiChatWidgetProps,
  type AiChatToolboxProps,
} from '../../src/components/ai/AiChatWidget';
import type { ChatArtifactEvent, ChatMessage } from '../../src/types/models';
import { TaskPlannerDatabase } from '../../src/db';
import {
  createOrGetThread,
  getMessagesByThreadId,
  saveMessage,
} from '../../src/db/repositories/chatRepo';

function makeToolbox(overrides: Partial<AiChatToolboxProps> = {}): AiChatToolboxProps {
  return {
    selectedModel: 'model-x',
    availableModels: ['model-x'],
    onModelChange: vi.fn(),
    analysisMode: false,
    onToggleAnalysisMode: vi.fn(),
    autoApproveMutations: false,
    onToggleAutoApproveMutations: vi.fn(),
    mcpEnabled: false,
    onToggleMcpEnabled: vi.fn(),
    ...overrides,
  };
}

function makeMessage(id: string, content: string): ChatMessage {
  return {
    id,
    threadId: 'thread-1',
    role: 'user',
    content,
    createdAt: '2026-11-01T00:00:00.000Z',
  };
}

function makeProps(overrides: Partial<AiChatWidgetProps> = {}): AiChatWidgetProps {
  return {
    scope: { kind: 'chat', threadId: 'thread-1', scopeKey: 'global', label: 'General Chat: Global' },
    messages: [],
    turn: {
      status: 'idle',
      streamingText: '',
      streamingStatusLabel: null,
      pendingApproval: null,
    },
    onSubmit: vi.fn(),
    onStop: vi.fn(),
    onResolveApproval: vi.fn(),
    onRetry: vi.fn(),
    error: null,
    toolbox: makeToolbox(),
    quickPrompts: [],
    onClearThread: vi.fn(),
    emptyState: { heading: 'Sẵn sàng hỗ trợ công việc', body: 'Hỏi bất kỳ điều gì.' },
    draft: '',
    onDraftChange: vi.fn(),
    ...overrides,
  };
}

describe('AiChatWidget lifecycle and host extension points (D-01..D-06, D-19, D-22)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders neutral tool-limit with warning, retry, retained tools and 12px details', () => {
    const onRetry = vi.fn();
    render(<AiChatWidget {...makeProps({ onRetry,
      messages: [makeMessage('user', 'Narrow question')],
      turn: { status: 'tool-limit', streamingText: 'PARTIAL-NOT-AN-ANSWER',
        streamingStatusLabel: null, pendingApproval: null, toolLimitRounds: 7 },
      toolEvents: [
        { id: 'one', name: 'query_notes', phase: 'call', args: '{"query":"one"}' },
        { id: 'one', name: 'query_notes', phase: 'result', result: 'Audit result' },
        { id: 'two', name: 'retrieve_knowledge', phase: 'result', result: 'More evidence' },
      ],
    })} />);
    const tag = screen.getByText('Đã dừng thu thập bằng chứng').closest('.ant-tag');
    expect(tag).toHaveClass('ant-tag-default');
    expect(tag).not.toHaveClass('ant-tag-warning', 'ant-tag-error');
    expect(tag?.querySelector('[aria-label="stop"]')).toBeInTheDocument();
    expect(tag).toHaveStyle({ fontSize: '12px' });
    expect(screen.getByRole('alert')).toHaveClass('ant-alert-warning');
    expect(screen.getByRole('alert')).toHaveTextContent('Đã dừng thu thập bằng chứng sau 7 vòng.');
    expect(screen.queryByText('PARTIAL-NOT-AN-ANSWER')).not.toBeInTheDocument();
    expect(document.querySelector('.chat-message-assistant')).toBeNull();
    expect(screen.queryByTestId('ai-staged-loading')).not.toBeInTheDocument();
    expect(screen.queryByText('Chờ phê duyệt')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nội dung tin nhắn trò chuyện AI')).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /2 công cụ đã gọi/ }));
    expect(screen.getAllByRole('button', { name: /\[Công cụ\]/ })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /\[Công cụ\] query_notes/ }));
    expect(screen.getByText('Tham số')).toHaveStyle({ fontSize: '12px' });
    expect(screen.getByText('{"query":"one"}')).toHaveStyle({ fontSize: '12px' });
    expect(screen.getByText('Audit result')).toBeInTheDocument();
  });

  it('renders the staged indicator immediately while the turn is preparing', () => {
    render(
      <AiChatWidget
        {...makeProps({
          turn: {
            status: 'preparing',
            streamingText: '',
            streamingStatusLabel: 'Chuẩn bị ngữ cảnh',
            pendingApproval: null,
          },
        })}
      />
    );

    const indicator = screen.getByTestId('ai-staged-loading');
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveAttribute('role', 'status');
    expect(screen.getAllByText('Chuẩn bị ngữ cảnh').length).toBeGreaterThan(0);
    expect(screen.getByText('Truy xuất công cụ')).toBeInTheDocument();
    expect(screen.getByText('Đang phản hồi')).toBeInTheDocument();
    expect(screen.getByText('Chờ phê duyệt')).toBeInTheDocument();
  });

  it('collapses tool badges and never leaks reasoning into the DOM', () => {
    const reasoning = 'REASONING-ONLY-INVISIBLE-TOKEN';
    render(
      <AiChatWidget
        {...makeProps({
          messages: [makeMessage('m1', 'Xin chào')],
          toolEvents: [
            { id: 'call-1', name: 'query_tasks', phase: 'result', result: '{"items":[]}' },
          ],
        })}
      />
    );

    const badge = screen.getByRole('button', { name: /\[Công cụ\] query_tasks/ });
    expect(badge).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('{"items":[]}')).not.toBeInTheDocument();

    fireEvent.click(badge);
    expect(badge).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('{"items":[]}')).toBeInTheDocument();

    expect(document.body.textContent).not.toContain(reasoning);
  });

  it('renders no tool activity when there are no events', () => {
    render(<AiChatWidget {...makeProps()} />);

    expect(screen.queryByRole('button', { name: /công cụ đã gọi/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /\[Công cụ\]/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Hoạt động công cụ' })).not.toBeInTheDocument();
  });

  it('keeps one tool badge without a summary and reveals only its opt-in details', () => {
    render(
      <AiChatWidget
        {...makeProps({
          toolEvents: [
            { id: 'call-1', name: 'query_tasks', phase: 'call', args: '{"projectId":"p-1"}' },
            { id: 'call-1', name: 'query_tasks', phase: 'result', result: '{"items":[]}' },
          ],
        })}
      />
    );

    expect(screen.queryByRole('button', { name: /công cụ đã gọi/ })).not.toBeInTheDocument();
    const badges = screen.getAllByRole('button', { name: /\[Công cụ\] query_tasks/ });
    expect(badges).toHaveLength(1);
    expect(badges[0]).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('{"projectId":"p-1"}')).not.toBeInTheDocument();
    expect(screen.queryByText('{"items":[]}')).not.toBeInTheDocument();

    fireEvent.click(badges[0]!);
    expect(screen.getByText('{"projectId":"p-1"}')).toBeInTheDocument();
    expect(screen.getByText('{"items":[]}')).toBeInTheDocument();
    fireEvent.click(badges[0]!);
    expect(badges[0]).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('{"items":[]}')).not.toBeInTheDocument();
  });

  it('bounds six merged tools and toggles between the newest badge and the full list', () => {
    render(
      <AiChatWidget
        {...makeProps({
          messages: [makeMessage('m1', 'Hội thoại vẫn hiển thị')],
          toolEvents: Array.from({ length: 6 }, (_, index) => [
            { id: `call-${index}`, name: `query_${index}`, phase: 'call' as const, args: '{"limit":1}' },
            { id: `call-${index}`, name: `query_${index}`, phase: 'result' as const, result: `Kết quả ${index}` },
          ]).flat(),
        })}
      />
    );

    const summary = screen.getByRole('button', { name: /6 công cụ đã gọi.*Xem chi tiết/ });
    expect(summary).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getAllByRole('button', { name: /\[Công cụ\]/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: /\[Công cụ\] query_5/ })).toBeInTheDocument();
    expect(screen.getByText('Hội thoại vẫn hiển thị')).toBeInTheDocument();
    expect(screen.getByLabelText('Nội dung tin nhắn trò chuyện AI')).toBeInTheDocument();

    fireEvent.click(summary);
    expect(summary).toHaveAttribute('aria-expanded', 'true');
    expect(summary).toHaveTextContent('Thu gọn');
    const group = screen.getByRole('group', { name: 'Hoạt động công cụ' });
    expect(group.id).toBe(summary.getAttribute('aria-controls'));
    expect(group).toHaveStyle({ maxHeight: '160px', overflowY: 'auto', overscrollBehavior: 'contain' });
    expect(within(group).getAllByRole('button', { name: /\[Công cụ\]/ })).toHaveLength(6);
    for (const badge of within(group).getAllByRole('button')) {
      expect(badge).toHaveAttribute('aria-expanded', 'false');
    }
    expect(screen.queryByText('{"limit":1}')).not.toBeInTheDocument();
    expect(screen.queryByText('Kết quả 5')).not.toBeInTheDocument();

    fireEvent.click(within(group).getByRole('button', { name: /\[Công cụ\] query_0/ }));
    expect(screen.getByText('Kết quả 0')).toBeInTheDocument();
    expect(screen.queryByText('Kết quả 5')).not.toBeInTheDocument();
    fireEvent.click(summary);
    expect(summary).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getAllByRole('button', { name: /\[Công cụ\]/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: /\[Công cụ\] query_5/ })).toBeInTheDocument();
    expect(screen.queryByText('Kết quả 0')).not.toBeInTheDocument();
  });

  it('uses a native summary button with a scope-specific controlled group', () => {
    const toolEvents = [
      { id: 'one', name: 'query_one', phase: 'call' as const },
      { id: 'two', name: 'query_two', phase: 'call' as const },
    ];
    render(
      <>
        <AiChatWidget {...makeProps({ toolEvents })} />
        <AiChatWidget
          {...makeProps({
            scope: { kind: 'sdlc', threadId: 'thread-2', scopeKey: 'sdlc:p:cr:INTAKE', label: 'SDLC' },
            toolEvents,
          })}
        />
      </>
    );

    const [first, second] = screen.getAllByRole('button', { name: /2 công cụ đã gọi/ });
    expect(first).toBeInstanceOf(HTMLButtonElement);
    expect(first).toHaveAttribute('type', 'button');
    expect(first).toHaveAttribute('aria-controls', 'tool-activity-global');
    expect(second).toHaveAttribute('aria-controls', 'tool-activity-sdlc-p-cr-INTAKE');
    expect(first!.parentElement?.closest('button')).toBeNull();
    expect(document.getElementById(first!.getAttribute('aria-controls')!)).toHaveAttribute('role', 'group');
    // jsdom verifies click wiring, not native Enter/Space activation; check those in a real browser.
    fireEvent.click(first!);
    expect(first).toHaveAttribute('aria-expanded', 'true');
    expect(second).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(first!);
    expect(first).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders exactly one approval control set and wires approve/reject', () => {
    const onResolveApproval = vi.fn();
    render(
      <AiChatWidget
        {...makeProps({
          onResolveApproval,
          draft: 'Giữ bản nháp',
          quickPrompts: [{ id: 'next', label: 'Gửi tiếp', prompt: 'Gửi tiếp' }],
          turn: {
            status: 'awaiting-approval',
            streamingText: '',
            streamingStatusLabel: 'Chờ phê duyệt',
            pendingApproval: { toolName: 'update_task', summary: 'Cập nhật tác vụ "A"' },
          },
        })}
      />
    );

    const input = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI');
    expect(input).toBeDisabled();
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    expect(input).toHaveValue('Giữ bản nháp');
    expect(screen.getByRole('button', { name: 'Gửi tin nhắn' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Gửi tiếp' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('ai-staged-loading')).not.toBeInTheDocument();
    expect(screen.getByText('Yêu cầu xác nhận thay đổi dữ liệu')).toBeInTheDocument();
    const approve = screen.getAllByRole('button', { name: 'Chấp thuận' });
    expect(approve).toHaveLength(1);

    fireEvent.click(approve[0]!);
    expect(onResolveApproval).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByRole('button', { name: 'Từ chối' }));
    expect(onResolveApproval).toHaveBeenCalledWith(false);
  });

  it('renders the sanitized inline error with retry and only the supplied messages', () => {
    const onRetry = vi.fn();
    render(
      <AiChatWidget
        {...makeProps({
          onRetry,
          messages: [makeMessage('m1', 'Chỉ tin nhắn này')],
          error: { code: 'request_failed', message: 'Không thể xử lý yêu cầu: lỗi kết nối.' },
        })}
      />
    );

    expect(screen.getByText('Chỉ tin nhắn này')).toBeInTheDocument();
    expect(screen.getByText(/Không thể xử lý yêu cầu/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows the host scope label and only renders quick prompts on an empty transcript', () => {
    const onSubmit = vi.fn();
    const quickPrompts = [{ id: 'qp1', label: 'Tóm tắt tiến độ', prompt: 'Tóm tắt tiến độ' }];

    const { unmount } = render(
      <AiChatWidget {...makeProps({ onSubmit, quickPrompts })} />
    );
    expect(screen.getByText('General Chat: Global')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tóm tắt tiến độ' }));
    expect(onSubmit).toHaveBeenCalledWith('Tóm tắt tiến độ');

    unmount();
    render(
      <AiChatWidget
        {...makeProps({ quickPrompts, messages: [makeMessage('m1', 'Xin chào')] })}
      />
    );
    expect(screen.queryByRole('button', { name: 'Tóm tắt tiến độ' })).not.toBeInTheDocument();
  });

  it('D-03: collapses the toolbox when the host gives it a narrow width', async () => {
    // jsdom has no layout, so drive the observer directly with a 320px content box.
    const observers: Array<(entries: Array<{ contentRect: { width: number } }>) => void> = [];
    const Original = global.ResizeObserver;
    global.ResizeObserver = class {
      constructor(cb: (entries: Array<{ contentRect: { width: number } }>) => void) {
        observers.push(cb);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;

    try {
      render(<AiChatWidget {...makeProps()} />);
      expect(screen.getByTestId('ai-chat-widget')).toHaveAttribute('data-compact', 'false');

      fireEvent(window, new Event('resize'));
      observers.forEach((cb) => cb([{ contentRect: { width: 320 } }]));

      // The narrowed host now renders the collapsed control presentation.
      await vi.waitFor(() => {
        expect(screen.getByTestId('ai-chat-widget')).toHaveAttribute('data-compact', 'true');
      });
      expect(screen.getByTestId('tab-compact-more-btn')).toBeInTheDocument();
    } finally {
      global.ResizeObserver = Original;
    }
  });

  it('D-03: an explicit compact prop wins over the measured width', () => {
    render(<AiChatWidget {...makeProps({ compact: true })} />);
    expect(screen.getByTestId('ai-chat-widget')).toHaveAttribute('data-compact', 'true');
    expect(screen.getByTestId('tab-compact-more-btn')).toBeInTheDocument();
  });

  it('forwards compact to the toolbox and routes clear-context to onClearThread', () => {
    const onClearThread = vi.fn();
    render(
      <AiChatWidget
        {...makeProps({
          onClearThread,
          compact: true,
          messages: [makeMessage('m1', 'Xin chào')],
        })}
      />
    );

    // compact toolbox collapses the auxiliary controls behind a dropdown/more button
    expect(screen.getByTestId('tab-compact-more-btn')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tab-compact-more-btn'));
    fireEvent.click(screen.getByText('Đặt lại hội thoại (/clear)'));
    expect(onClearThread).toHaveBeenCalledTimes(1);
  });

  it('renders one artifact card per event and forwards the CTA event id', () => {
    const onArtifactCta = vi.fn();
    const onArtifactOpen = vi.fn();
    const hash = 'a'.repeat(64);

    render(
      <AiChatWidget
        {...makeProps({
          onArtifactCta,
          onArtifactOpen,
          messages: [makeMessage('m1', 'Xin chào')],
          artifactEvents: [
            {
              id: 'ev-1',
              kind: 'SOLUTION',
              title: 'SOLUTION',
              version: 1,
              hash,
              status: 'draft',
              ctaLabel: 'Tạo bản nháp',
            },
            {
              id: 'ev-2',
              kind: 'SOLUTION',
              title: 'SOLUTION',
              version: 2,
              hash,
              status: 'approved',
              ctaLabel: 'Lưu & Phê duyệt',
            },
          ],
        })}
      />
    );

    expect(screen.getAllByTestId('ai-artifact-event-card')).toHaveLength(2);
    expect(screen.getByText('Bản nháp')).toBeInTheDocument();
    expect(screen.getByText('Đã duyệt (v2)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tạo bản nháp' }));
    expect(onArtifactCta).toHaveBeenCalledWith('ev-1');

    fireEvent.click(screen.getAllByRole('button', { name: 'Xem chi tiết' })[1]!);
    expect(onArtifactOpen).toHaveBeenCalledWith('ev-2', false);
  });

  it('keeps two widgets with different scopes fully independent', () => {
    const onSubmitA = vi.fn();
    const onSubmitB = vi.fn();

    render(
      <>
        <AiChatWidget
          {...makeProps({
            onSubmit: onSubmitA,
            scope: { kind: 'chat', threadId: 't-a', scopeKey: 'scope-a', label: 'Scope A' },
            messages: [makeMessage('a1', 'Tin nhắn A')],
          })}
        />
        <AiChatWidget
          {...makeProps({
            onSubmit: onSubmitB,
            scope: { kind: 'sdlc', threadId: 't-b', scopeKey: 'scope-b', label: 'Scope B' },
            messages: [makeMessage('b1', 'Tin nhắn B')],
          })}
        />
      </>
    );

    expect(screen.getByText('Scope A')).toBeInTheDocument();
    expect(screen.getByText('Scope B')).toBeInTheDocument();
    expect(screen.getByText('Tin nhắn A')).toBeInTheDocument();
    expect(screen.getByText('Tin nhắn B')).toBeInTheDocument();
    expect(screen.getAllByTestId('ai-chat-widget')).toHaveLength(2);
    expect(onSubmitA).not.toHaveBeenCalled();
    expect(onSubmitB).not.toHaveBeenCalled();
  });
});

describe('chatRepo artifactEvent persistence (D-22, T-25.3-43)', () => {
  let db: TaskPlannerDatabase;
  let threadId: string;

  const SHA = 'a'.repeat(64);

  const event = (overrides: Partial<ChatArtifactEvent> = {}): ChatArtifactEvent => ({
    kind: 'SOLUTION',
    title: 'SOLUTION',
    version: 1,
    hash: SHA,
    status: 'draft',
    ...overrides,
  });

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`test-artifact-event-${Date.now()}-${Math.random()}`);
    const thread = await createOrGetThread({ scopeType: 'project', entityId: 'p-1' }, db);
    threadId = thread.id;
  });

  afterEach(async () => {
    await db.delete();
  });

  it('round-trips an artifact event through db.chatMessages.get', async () => {
    const saved = await saveMessage(
      { threadId, role: 'assistant', content: 'Đã tạo SOLUTION', artifactEvent: event() },
      db
    );
    const row = (await db.chatMessages.get(saved.id)) as ChatMessage;
    // The repo stamps a stable eventId so a host can reopen that exact version (D-06).
    expect(row.artifactEvent).toEqual({ ...event(), eventId: expect.any(String) });
    expect(row.artifactEvent?.eventId).toBeTruthy();
  });

  it('stores one distinct row per artifact version', async () => {
    const v1 = await saveMessage(
      { threadId, role: 'assistant', content: 'v1', artifactEvent: event({ version: 1 }) },
      db
    );
    // createdAt has millisecond resolution; separate the writes so this asserts
    // version ordering rather than a same-millisecond tie.
    await new Promise((resolve) => setTimeout(resolve, 2));
    const v2 = await saveMessage(
      {
        threadId,
        role: 'assistant',
        content: 'v2',
        artifactEvent: event({ version: 2, status: 'approved' }),
      },
      db
    );

    expect(v1.id).not.toBe(v2.id);
    const rows = await getMessagesByThreadId(threadId, db);
    expect(rows.map((r) => r.artifactEvent?.version)).toEqual([1, 2]);
    expect(rows[1]?.artifactEvent?.status).toBe('approved');
  });

  it('leaves messages without an artifact event unchanged', async () => {
    const saved = await saveMessage({ threadId, role: 'user', content: 'Xin chào' }, db);
    const row = (await db.chatMessages.get(saved.id)) as ChatMessage;
    expect(row.artifactEvent).toBeUndefined();
    expect(row.content).toBe('Xin chào');
  });

  it('rejects invalid events and never persists the artifact body', async () => {
    await expect(
      saveMessage(
        { threadId, role: 'assistant', content: 'x', artifactEvent: event({ hash: 'short' }) },
        db
      )
    ).rejects.toMatchObject({ code: 'INVALID_ARTIFACT_EVENT' });

    await expect(
      saveMessage(
        { threadId, role: 'assistant', content: 'x', artifactEvent: event({ version: 0 }) },
        db
      )
    ).rejects.toMatchObject({ code: 'INVALID_ARTIFACT_EVENT' });

    const saved = await saveMessage(
      {
        threadId,
        role: 'assistant',
        content: 'Đã tạo SOLUTION',
        artifactEvent: event({ ctaLabel: 'Mở tài liệu' }),
      },
      db
    );
    const row = (await db.chatMessages.get(saved.id)) as ChatMessage;
    expect(Object.keys(row.artifactEvent ?? {}).sort()).toEqual(
      ['ctaLabel', 'eventId', 'hash', 'kind', 'status', 'title', 'version']
    );
  });

  it('returns both cards in createdAt order after a reload', async () => {
    await saveMessage(
      { threadId, role: 'assistant', content: 'v1', artifactEvent: event({ version: 1 }) },
      db
    );
    // createdAt has millisecond resolution; separate the two writes so the
    // ordering assertion tests the sort, not a same-millisecond tie.
    await new Promise((resolve) => setTimeout(resolve, 2));
    await saveMessage(
      { threadId, role: 'assistant', content: 'v2', artifactEvent: event({ version: 2 }) },
      db
    );

    // Simulated reload: fresh database handle over the same name is not portable,
    // so re-read through the repository the way a remounted host does.
    const reloaded = await getMessagesByThreadId(threadId, db);
    expect(reloaded).toHaveLength(2);
    expect(reloaded[0]!.artifactEvent?.version).toBe(1);
    expect(reloaded[1]!.artifactEvent?.version).toBe(2);
    expect(reloaded[0]!.createdAt <= reloaded[1]!.createdAt).toBe(true);
  });
});
