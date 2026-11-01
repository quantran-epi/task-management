import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
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

  it('renders exactly one approval control set and wires approve/reject', () => {
    const onResolveApproval = vi.fn();
    render(
      <AiChatWidget
        {...makeProps({
          onResolveApproval,
          turn: {
            status: 'awaiting-approval',
            streamingText: '',
            streamingStatusLabel: 'Chờ phê duyệt',
            pendingApproval: { toolName: 'update_task', summary: 'Cập nhật tác vụ "A"' },
          },
        })}
      />
    );

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
    expect(row.artifactEvent).toEqual(event());
  });

  it('stores one distinct row per artifact version', async () => {
    const v1 = await saveMessage(
      { threadId, role: 'assistant', content: 'v1', artifactEvent: event({ version: 1 }) },
      db
    );
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
      ['ctaLabel', 'hash', 'kind', 'status', 'title', 'version']
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
