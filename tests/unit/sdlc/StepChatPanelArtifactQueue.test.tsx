import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../../src/db';
import { StepChatPanel, type StepChatPanelHandle } from '../../../src/components/sdlc/chat/StepChatPanel';
import { SDLC_ARTIFACT_CONTRACTS } from '../../../src/services/ai/sdlcPromptComposer';

const mocks = vi.hoisted(() => ({ start: vi.fn(), getStepThread: vi.fn() }));
vi.mock('../../../src/services/wizard/sdlcCrManager', () => ({ getStepThread: mocks.getStepThread }));
vi.mock('../../../src/components/ai/runtime/useChatTurn', () => ({
  useChatTurn: () => ({
    status: 'idle', streamingText: '', streamingStatusLabel: null, pendingApproval: null,
    start: mocks.start, abort: vi.fn(), retry: vi.fn(), resolveApproval: vi.fn(),
  }),
}));
vi.mock('../../../src/components/ai/runtime/chatTurnRuntime', () => ({ createDefaultChatTurnDeps: () => ({}) }));
vi.mock('../../../src/components/ai/AiChatWidget', () => ({
  AiChatWidget: ({ scope }: { scope: { threadId: string } }) => <div data-testid="thread">{scope.threadId}</div>,
}));
vi.mock('../../../src/components/sdlc/chat/useStepChatToolbox', () => ({
  useStepChatToolbox: () => ({ toolsForTurn: async () => [], analysisMode: false, autoApproveMutations: false, selectedModel: 'test-model' }),
}));
vi.mock('../../../src/services/ai/nineRouterTokenService', () => ({
  getNineRouterConfig: async () => ({ defaultModel: 'test-model', endpoint: 'http://localhost' }),
  getNineRouterApiKey: async () => 'test-key',
}));

const prompt = 'Hãy phân tích hồ sơ hiện tại và tạo SOLUTION.md hoàn chỉnh cho Change Request này.';

describe('StepChatPanel artifact bootstrap queue', () => {
  let db: TaskPlannerDatabase;
  let resolveThread: (thread: { id: string }) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    db = new TaskPlannerDatabase(`artifact-queue-${crypto.randomUUID()}`);
    mocks.getStepThread.mockReturnValue(new Promise<{ id: string }>((resolve) => { resolveThread = resolve; }));
    mocks.start.mockResolvedValue({ phase: 'complete', content: '' });
  });

  afterEach(async () => {
    cleanup();
    await db.delete();
  });

  function mount(grounding = 'Initial evidence') {
    const ref = React.createRef<StepChatPanelHandle>();
    const props = { ref, projectId: 'project', crId: 'cr', stepId: 'SOLUTION' as const, db };
    const view = render(<StepChatPanel {...props} stepGroundingContext={grounding} />);
    return { ref, props, ...view };
  }

  it('retains one pre-thread request and flushes it once with latest SOLUTION context', async () => {
    const { ref, props, rerender } = mount();
    act(() => {
      ref.current!.requestArtifactAnalysis();
      ref.current!.requestArtifactAnalysis();
    });
    expect(mocks.start).not.toHaveBeenCalled();
    rerender(<StepChatPanel {...props} stepGroundingContext="Latest evidence" />);
    await act(async () => { resolveThread({ id: 'solution-thread' }); });
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(1));
    const request = mocks.start.mock.calls[0]![0];
    expect(request).toMatchObject({ threadId: 'solution-thread', scopeKey: 'sdlc:project:cr:SOLUTION', text: prompt });
    expect(request.systemMessages[0].content).toContain(SDLC_ARTIFACT_CONTRACTS.SOLUTION);
    expect(request.systemMessages[0].content).toContain('Latest evidence');
    rerender(<StepChatPanel {...props} stepGroundingContext="Later evidence" />);
    await act(async () => {});
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });

  it('starts immediately once thread exists without leaving a queued duplicate', async () => {
    const { ref, props, rerender } = mount();
    await act(async () => { resolveThread({ id: 'solution-thread' }); });
    await waitFor(() => expect(screen.getByTestId('thread')).toHaveTextContent('solution-thread'));
    expect(mocks.start).not.toHaveBeenCalled();
    await act(async () => { ref.current!.requestArtifactAnalysis(); });
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(mocks.start.mock.calls[0]![0].text).toBe(prompt);
    rerender(<StepChatPanel {...props} stepGroundingContext="Changed evidence" />);
    await act(async () => {});
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });

  it('does not queue ordinary Q&A before thread resolves', async () => {
    const { ref } = mount();
    await act(async () => { await ref.current!.sendMessage('Ordinary question'); });
    await act(async () => { resolveThread({ id: 'solution-thread' }); });
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('waits for the new scope thread instead of sending into the previous step thread', async () => {
    const { ref, props, rerender } = mount();
    await act(async () => { resolveThread({ id: 'solution-thread' }); });
    mocks.getStepThread.mockReturnValue(new Promise<{ id: string }>((resolve) => { resolveThread = resolve; }));
    rerender(<StepChatPanel {...props} crId="next-cr" />);
    act(() => { ref.current!.requestArtifactAnalysis(); });
    expect(mocks.start).not.toHaveBeenCalled();
    await act(async () => { resolveThread({ id: 'next-thread' }); });
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(1));
    expect(mocks.start.mock.calls[0]![0]).toMatchObject({ threadId: 'next-thread', scopeKey: 'sdlc:project:next-cr:SOLUTION' });
  });

  it('cancels queued intent when leaving its scope before bootstrap completes', async () => {
    const { ref, props, rerender } = mount();
    act(() => { ref.current!.requestArtifactAnalysis(); });
    const resolveOldThread = resolveThread;
    mocks.getStepThread.mockReturnValue(new Promise<{ id: string }>((resolve) => { resolveThread = resolve; }));
    rerender(<StepChatPanel {...props} stepId="INTAKE" />);
    await act(async () => {
      resolveOldThread({ id: 'old-solution-thread' });
      resolveThread({ id: 'intake-thread' });
    });
    expect(screen.getByTestId('thread')).toHaveTextContent('intake-thread');
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('drops pending intent on unmount rather than leaking into another panel', async () => {
    const { ref, unmount } = mount();
    act(() => { ref.current!.requestArtifactAnalysis(); });
    unmount();
    await act(async () => { resolveThread({ id: 'old-thread' }); });
    mount();
    await act(async () => {});
    expect(mocks.start).not.toHaveBeenCalled();
  });
});
