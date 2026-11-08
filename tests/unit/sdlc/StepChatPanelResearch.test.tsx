import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../../src/db';
import { StepChatPanel, type StepChatPanelHandle } from '../../../src/components/sdlc/chat/StepChatPanel';
import type { ChatTurnToolEvent } from '../../../src/components/ai/runtime/chatTurnRuntime';
import type { ResearchPayload } from '../../../src/services/ai/researchService';

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  getStepThread: vi.fn(),
  execute: vi.fn(),
  cancel: vi.fn(),
  onToolEvent: undefined as ((event: ChatTurnToolEvent) => void) | undefined,
}));

vi.mock('../../../src/services/wizard/sdlcCrManager', () => ({ getStepThread: mocks.getStepThread }));
vi.mock('../../../src/components/ai/runtime/useChatTurn', () => ({
  useChatTurn: (options: { deps: { onToolEvent?: (event: ChatTurnToolEvent) => void } }) => {
    mocks.onToolEvent = options.deps.onToolEvent;
    return {
      status: 'idle', streamingText: '', streamingStatusLabel: null, pendingApproval: null,
      start: mocks.start, abort: vi.fn(), retry: vi.fn(), resolveApproval: vi.fn(),
    };
  },
}));
vi.mock('../../../src/components/ai/runtime/chatTurnRuntime', () => ({ createDefaultChatTurnDeps: () => ({}) }));
vi.mock('../../../src/components/ai/AiChatWidget', () => ({
  AiChatWidget: ({ transcriptExtensions }: { transcriptExtensions?: React.ReactNode }) => (
    <div>{transcriptExtensions}</div>
  ),
}));
vi.mock('../../../src/components/sdlc/chat/useStepChatToolbox', () => ({
  useStepChatToolbox: () => ({
    toolsForTurn: async () => ({ tools: [], dynamicReadOnlyToolNames: [] }),
    analysisMode: false, autoApproveMutations: false, selectedModel: 'test-model',
  }),
}));
vi.mock('../../../src/services/ai/nineRouterTokenService', () => ({
  getNineRouterConfig: async () => ({ defaultModel: 'test-model', endpoint: 'http://localhost' }),
  getNineRouterApiKey: async () => 'test-key',
}));
vi.mock('../../../src/services/ai/researchService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/services/ai/researchService')>();
  return {
    ...actual,
    executeMultiSystemResearch: mocks.execute,
  };
});

const PROPOSAL = {
  questions: [
    { question: 'Gateway có hỗ trợ virtual threads?', systemId: 'sys-1', systemCode: 'SC-API' },
    { question: 'Timeout hiện tại là bao nhiêu?', systemId: 'sys-1', systemCode: 'SC-API' },
  ],
  targetSystemIds: ['sys-1'],
  rationale: 'Thiếu bằng chứng nội bộ về cấu hình gateway.',
  unavailableSystemIds: [],
};

const PAYLOAD: ResearchPayload = {
  summary: 'Gateway hỗ trợ virtual threads.',
  findings: [
    { claim: 'Hỗ trợ từ Boot 3.2', scope: 'web', source: 'https://docs.spring.io', confidence: 0.9 },
    { claim: 'Timeout 30s', scope: 'repo', systemCode: 'SC-API', source: 'application.yml:42', confidence: 1 },
  ],
};

describe('StepChatPanel External Research', () => {
  let db: TaskPlannerDatabase;

  beforeEach(() => {
    vi.clearAllMocks();
    db = new TaskPlannerDatabase(`research-${crypto.randomUUID()}`);
    mocks.getStepThread.mockResolvedValue({ id: 'step-thread' });
    mocks.start.mockResolvedValue({ phase: 'complete', content: '' });
    mocks.cancel.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    cleanup();
    await db.delete();
  });

  function mount() {
    const ref = React.createRef<StepChatPanelHandle>();
    render(<StepChatPanel ref={ref} changeRequestId="project" crId="cr" stepId="SOLUTION" db={db} />);
    return ref;
  }

  async function ready() {
    await waitFor(() => expect(mocks.onToolEvent).toBeDefined());
    await act(async () => {});
  }

  function emitProposal(result: unknown = PROPOSAL) {
    act(() => {
      mocks.onToolEvent!({ id: 'call-1', name: 'propose_research', phase: 'result', result: JSON.stringify(result) });
    });
  }

  it('renders the proposal card from a propose_research tool result', async () => {
    mount();
    await ready();
    emitProposal();

    const card = await screen.findByTestId('research-proposal');
    expect(within(card).getByText('Đề xuất nghiên cứu từ bên ngoài (Claude Code)')).toBeInTheDocument();
    expect(within(card).getByText('Gateway có hỗ trợ virtual threads?')).toBeInTheDocument();
    expect(within(card).getAllByText('SC-API').length).toBeGreaterThan(0);
  });

  it('ignores a malformed proposal payload', async () => {
    mount();
    await ready();
    emitProposal({ refused: true, code: 'INVALID_ARGUMENTS', message: 'bad' });

    expect(screen.queryByTestId('research-proposal')).not.toBeInTheDocument();
  });

  it('confirming the proposal starts the run and renders the streaming card', async () => {
    let resolveRun: ((payload: ResearchPayload) => void) | undefined;
    mocks.execute.mockReturnValue({
      promise: new Promise<ResearchPayload>((resolve) => { resolveRun = resolve; }),
      cancel: mocks.cancel,
    });
    mount();
    await ready();
    emitProposal();

    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận nghiên cứu' }));

    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({
      changeRequestId: 'project',
      threadId: 'step-thread',
      targetSystemIds: ['sys-1'],
      questions: ['Gateway có hỗ trợ virtual threads?', 'Timeout hiện tại là bao nhiêu?'],
      includeWeb: true,
    }));
    expect(await screen.findByTestId('research-streaming')).toBeInTheDocument();

    await act(async () => { resolveRun!(PAYLOAD); });
    expect(await screen.findByTestId('research-completion')).toBeInTheDocument();
  });

  it('cancel button invokes the run cancel handle', async () => {
    mocks.execute.mockReturnValue({ promise: new Promise<ResearchPayload>(() => {}), cancel: mocks.cancel });
    mount();
    await ready();
    emitProposal();

    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận nghiên cứu' }));
    fireEvent.click(await screen.findByRole('button', { name: /Hủy nghiên cứu/ }));

    expect(mocks.cancel).toHaveBeenCalledOnce();
  });

  it('completion CTA dispatches the follow-up message', async () => {
    mocks.execute.mockReturnValue({ promise: Promise.resolve(PAYLOAD), cancel: mocks.cancel });
    mount();
    await ready();
    emitProposal();

    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận nghiên cứu' }));
    const cta = await screen.findByRole('button', { name: 'Tiếp tục sinh Solution với bằng chứng này' });
    await act(async () => { fireEvent.click(cta); });

    await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
    expect(mocks.start.mock.calls[0]![0].text).toContain('bằng chứng nghiên cứu bên ngoài');
  });

  it('RESEARCH_UNAVAILABLE renders the unavailable alert with no retry button', async () => {
    const { ResearchRunError } = await import('../../../src/services/ai/researchService');
    let rejectRun: ((error: unknown) => void) | undefined;
    mocks.execute.mockReturnValue({
      promise: new Promise<ResearchPayload>((_resolve, reject) => { rejectRun = reject; }),
      cancel: mocks.cancel,
    });
    mount();
    await ready();
    emitProposal();

    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận nghiên cứu' }));
    await act(async () => {
      rejectRun!(new ResearchRunError('RESEARCH_UNAVAILABLE', 'Không có hệ thống nào sẵn sàng.'));
    });

    expect(await screen.findByText(/Không có hệ thống nào sẵn sàng cho nghiên cứu qua SSH/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bỏ qua, tiếp tục bằng bằng chứng nội bộ' })).toBeInTheDocument();
  });

  it('RESEARCH_TIMEOUT renders both retry and skip actions', async () => {
    const { ResearchRunError } = await import('../../../src/services/ai/researchService');
    let rejectRun: ((error: unknown) => void) | undefined;
    mocks.execute.mockReturnValue({
      promise: new Promise<ResearchPayload>((_resolve, reject) => { rejectRun = reject; }),
      cancel: mocks.cancel,
    });
    mount();
    await ready();
    emitProposal();

    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận nghiên cứu' }));
    await act(async () => {
      rejectRun!(new ResearchRunError('RESEARCH_TIMEOUT', 'Quá thời gian.'));
    });

    expect(await screen.findByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bỏ qua, tiếp tục bằng bằng chứng nội bộ' })).toBeInTheDocument();
  });

  it('startResearch through the ref streams without any proposal step', async () => {
    mocks.execute.mockReturnValue({ promise: new Promise<ResearchPayload>(() => {}), cancel: mocks.cancel });
    const ref = mount();
    await ready();

    act(() => {
      ref.current!.startResearch({ questions: ['Câu hỏi'], targetSystemIds: ['sys-1'], includeWeb: false });
    });

    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('research-proposal')).not.toBeInTheDocument();
    expect(await screen.findByTestId('research-streaming')).toBeInTheDocument();
  });

  it('does not start a run while the step thread is still loading', async () => {
    let resolveThread: ((thread: { id: string }) => void) | undefined;
    mocks.getStepThread.mockReturnValue(new Promise((resolve) => { resolveThread = resolve; }));
    const ref = mount();

    act(() => {
      ref.current!.startResearch({ questions: ['Câu hỏi'], targetSystemIds: ['sys-1'], includeWeb: true });
    });

    expect(mocks.execute).not.toHaveBeenCalled();
    expect(screen.queryByTestId('research-streaming')).not.toBeInTheDocument();

    await act(async () => { resolveThread!({ id: 'step-thread' }); });
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
