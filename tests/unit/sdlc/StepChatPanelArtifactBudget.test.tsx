import React from 'react';
import { message, Modal } from 'antd';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../../src/db';
import { StepChatPanel, type StepChatPanelHandle } from '../../../src/components/sdlc/chat/StepChatPanel';
import type { ChatTurnRequest } from '../../../src/components/ai/runtime/chatTurnRuntime';
import * as solutionParser from '../../../src/utils/sdlcSolutionParser';
import { buildSdlcStepGroundingResult } from '../../../src/services/sdlc/groundingBuilder';
import type { SdlcArtifactKindForTurn } from '../../../src/services/ai/sdlcPromptComposer';

const mocks = vi.hoisted(() => ({ start: vi.fn(), getStepThread: vi.fn(), config: vi.fn(), abort: vi.fn(), drain: vi.fn(), contextWindowTokens: 2000 }));
vi.mock('../../../src/services/wizard/sdlcCrManager', () => ({ getStepThread: mocks.getStepThread }));
vi.mock('../../../src/components/ai/runtime/useChatTurn', () => ({
  useChatTurn: () => ({
    status: 'idle', streamingText: '', streamingStatusLabel: null, pendingApproval: null,
    start: mocks.start, abort: mocks.abort, retry: vi.fn(), resolveApproval: vi.fn(),
    runtime: { isRunning: () => false, drainPersistence: mocks.drain },
  }),
}));
vi.mock('../../../src/components/ai/runtime/chatTurnRuntime', () => ({ createDefaultChatTurnDeps: () => ({}) }));
vi.mock('../../../src/components/ai/AiChatWidget', () => ({
  AiChatWidget: ({ scope, draft, onDraftChange, onSubmit, onClearThread, error, messages }: {
    scope: { threadId: string }; draft: string; onDraftChange: (text: string) => void;
    onSubmit: (text: string) => void; onClearThread: () => void; error: { message: string } | null;
    messages: Array<{ id: string; content: string }>;
  }) => <div>
    <span data-testid="thread">{scope.threadId}</span>
    {messages.map((row) => <p key={row.id}>{row.content}</p>)}
    {error && <p role="alert">{error.message}</p>}
    <textarea aria-label="Question" value={draft} onChange={(event) => onDraftChange(event.target.value)} />
    <button onClick={() => onSubmit(draft)}>Send</button>
    <button onClick={onClearThread}>Clear</button>
  </div>,
}));
vi.mock('../../../src/components/sdlc/chat/useStepChatToolbox', () => ({
  useStepChatToolbox: () => ({ toolsForTurn: async () => ({ tools: [], dynamicReadOnlyToolNames: [] }), analysisMode: false, autoApproveMutations: false, selectedModel: 'test-model' }),
}));
vi.mock('../../../src/services/ai/nineRouterTokenService', () => ({
  getNineRouterConfig: mocks.config,
  getNineRouterApiKey: async () => 'test-key',
}));

const document = [
  '# SOLUTION — CR-2026-18',
  '## Kiến trúc giải pháp mục tiêu',
  '```typescript',
  'const architecture = "complete";',
  '```',
  '## Kiểm thử',
  '- Xác nhận mọi phần được giữ nguyên.',
  '## Rollback',
  'Khôi phục phiên bản đã phê duyệt.',
].join('\n');
const response = `Giới thiệu giải pháp.\n\`\`\`\`markdown\n${document}\n\`\`\`\`\nXin xem bản thảo.`;

// This host suite exercises real extraction and IndexedDB summary replacement;
// provider persistence/rejection is separately covered by chatTurnRuntime.test.ts.
describe('StepChatPanel artifact context and completion safety', () => {
  let db: TaskPlannerDatabase;
  let onSolutionExtracted = vi.fn<(markdown: string) => void>();
  let onArtifactDraft = vi.fn<(kind: SdlcArtifactKindForTurn, markdown: string) => void>();

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.contextWindowTokens = 2000;
    mocks.config.mockImplementation(async () => ({ defaultModel: 'test-model', endpoint: 'http://localhost', contextWindowTokens: mocks.contextWindowTokens }));
    mocks.drain.mockResolvedValue(undefined);
    mocks.getStepThread.mockResolvedValue({ id: 'solution-thread' });
    mocks.start.mockResolvedValue({ phase: 'complete', content: '' });
    db = new TaskPlannerDatabase(`artifact-budget-${crypto.randomUUID()}`);
    onSolutionExtracted = vi.fn<(markdown: string) => void>();
    onArtifactDraft = vi.fn<(kind: SdlcArtifactKindForTurn, markdown: string) => void>();
  });

  afterEach(async () => {
    cleanup();
    act(() => message.destroy());
    vi.restoreAllMocks();
    await db.delete();
  });

  // STEP Solution requires PL01/PL02, and the gate trusts only the builder's real marker set.
  const solutionGrounding = buildSdlcStepGroundingResult({
    step: 'SOLUTION',
    artifacts: {
      pl01: { kind: 'PL01', version: 1, hash: 'a'.repeat(64), title: 'PL01', content: 'Baseline', sourceHashes: [], updatedAt: '2026-11-03T00:00:00Z' },
      pl02: { kind: 'PL02', version: 1, hash: 'a'.repeat(64), title: 'PL02', content: 'Acceptance', sourceHashes: [], updatedAt: '2026-11-03T00:00:00Z' },
    },
  });

  async function mount(useFallback = false, grounding = solutionGrounding) {
    const ref = React.createRef<StepChatPanelHandle>();
    render(<StepChatPanel ref={ref} projectId="project" crId="cr" stepId="SOLUTION" db={db}
      stepGroundingContext={grounding}
      {...(!useFallback ? { onSolutionExtracted } : {})} onArtifactDraft={onArtifactDraft} />);
    await waitFor(() => expect(screen.getByTestId('thread')).toHaveTextContent('solution-thread'));
    return ref;
  }

  it('clear hủy prelude trước khi provider bắt đầu', async () => {
    vi.spyOn(message, 'success').mockImplementation(() => undefined as never);
    let release!: (config: unknown) => void;
    mocks.config.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    const confirm = vi.spyOn(Modal, 'confirm').mockReturnValue({ destroy: vi.fn(), update: vi.fn() });
    const ref = await mount();
    await act(async () => { ref.current!.requestArtifactAnalysis(); });
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await act(async () => { await confirm.mock.calls[0]![0].onOk!(); });
    expect(mocks.abort).toHaveBeenCalledOnce();
    expect(mocks.drain).toHaveBeenCalledOnce();
    await act(async () => { release({ defaultModel: 'test', endpoint: 'http://localhost' }); });
    expect(mocks.start).not.toHaveBeenCalled();
    expect(await db.chatMessages.count()).toBe(0);
  });

  it('giữ draft khi runtime từ chối lượt gửi', async () => {
    mocks.start.mockRejectedValue(new Error('TURN_IN_PROGRESS'));
    await mount();
    fireEvent.change(screen.getByRole('textbox', { name: 'Question' }), { target: { value: 'Giữ câu hỏi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Question' })).toHaveValue('Giữ câu hỏi'));
    expect(await db.chatMessages.count()).toBe(0);
  });

  it.each([2000, 30000])('forwards configured context %i with no artifact completion cap', async (window) => {
    mocks.contextWindowTokens = window;
    const ref = await mount();
    await act(async () => { ref.current!.requestArtifactAnalysis(); });
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(1));
    const request: ChatTurnRequest = mocks.start.mock.calls[0]![0];
    expect(request.contextWindowTokens).toBe(window);
    expect('maxTokens' in request).toBe(false);
  });

  it('forwards context without maxTokens on an ordinary Q&A draft', async () => {
    await mount();
    fireEvent.change(screen.getByRole('textbox', { name: 'Question' }), { target: { value: 'Giải thích luồng dữ liệu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(1));
    const request: ChatTurnRequest = mocks.start.mock.calls[0]![0];
    expect(request.contextWindowTokens).toBe(2000);
    expect(request.text).toBe('Giải thích luồng dữ liệu');
    expect('maxTokens' in request).toBe(false);
    expect(request.systemMessages[0]!.content).not.toContain('[HỢP ĐỒNG ĐẦU RA');
  });

  it.each([false, true])('rejects truncated artifacts before parsing, handoff, or host persistence (fallback %s)', async (fallback) => {
    const extraction = vi.spyOn(solutionParser, 'extractSolutionMarkdown');
    const summary = vi.spyOn(solutionParser, 'extractChatSummary');
    const message = "Phản hồi của nhà cung cấp AI đã chạm giới hạn độ dài; nội dung chưa hoàn chỉnh không được lưu. Bấm 'Thử lại' hoặc điều chỉnh giới hạn đầu ra rồi gửi lại.";
    mocks.start.mockResolvedValue({ phase: 'error', content: response, error: { code: 'truncated', message } });
    const ref = await mount(fallback);
    await act(async () => { ref.current!.requestArtifactAnalysis(); });
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(message));
    expect(extraction).not.toHaveBeenCalled();
    expect(summary).not.toHaveBeenCalled();
    expect(onSolutionExtracted).not.toHaveBeenCalled();
    expect(onArtifactDraft).not.toHaveBeenCalled();
    expect(await db.chatMessages.count()).toBe(0);
    expect(await db.notes.count()).toBe(0);
  });

  it.each([false, true])('hands off complete nested-fence artifact while removing its transcript body (fallback %s)', async (fallback) => {
    mocks.start.mockImplementation(async () => {
      await db.chatMessages.add({ id: 'assistant', threadId: 'solution-thread', role: 'assistant', content: response, createdAt: new Date().toISOString() });
      return { phase: 'complete', content: response };
    });
    const ref = await mount(fallback);
    await act(async () => { ref.current!.requestArtifactAnalysis(); });
    await waitFor(() => {
      if (fallback) expect(onArtifactDraft).toHaveBeenCalledWith('SOLUTION', document);
      else expect(onSolutionExtracted).toHaveBeenCalledWith(document);
    });
    await waitFor(async () => {
      const row = await db.chatMessages.get('assistant');
      expect(row!.content).toContain('Giới thiệu giải pháp.');
      expect(row!.content).toContain('Xin xem bản thảo.');
      expect(row!.content).not.toContain('# SOLUTION');
      expect(row!.content).not.toContain('Kiến trúc giải pháp mục tiêu');
      expect(row!.content).not.toContain('architecture');
      expect(row!.content).not.toContain('Kiểm thử');
      expect(row!.content).not.toContain('Rollback');
      expect(row!.content).not.toContain('Khôi phục phiên bản đã phê duyệt.');
    });
    expect(await db.notes.count()).toBe(0); // Draft handoff never approves/saves a Note.
  });
});
