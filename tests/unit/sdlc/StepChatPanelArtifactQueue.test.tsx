import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../../src/db';
import { StepChatPanel, type StepChatPanelHandle } from '../../../src/components/sdlc/chat/StepChatPanel';
import { SDLC_ARTIFACT_CONTRACTS, type SdlcArtifactKindForTurn } from '../../../src/services/ai/sdlcPromptComposer';
import type { SdlcStepId } from '../../../src/services/wizard/workflowSchemas';
import { formatGuardMessage } from '../../../src/services/wizard/workflowGuards';
import { buildSdlcStepGrounding } from '../../../src/services/sdlc/groundingBuilder';

const mocks = vi.hoisted(() => ({ start: vi.fn(), getStepThread: vi.fn(), status: 'idle', running: false, toolsForTurn: vi.fn() }));
vi.mock('../../../src/services/wizard/sdlcCrManager', () => ({ getStepThread: mocks.getStepThread }));
vi.mock('../../../src/components/ai/runtime/useChatTurn', () => ({
  useChatTurn: () => ({
    status: mocks.status, streamingText: '', streamingStatusLabel: null, pendingApproval: null,
    runtime: { isRunning: () => mocks.running },
    start: mocks.start, abort: vi.fn(), retry: vi.fn(), resolveApproval: vi.fn(),
  }),
}));
vi.mock('../../../src/components/ai/runtime/chatTurnRuntime', () => ({ createDefaultChatTurnDeps: () => ({}) }));
vi.mock('../../../src/components/ai/AiChatWidget', () => ({
  AiChatWidget: ({ scope, onSubmit, statusExtensions, onClearThread }: { scope: { threadId: string }; onSubmit: (text: string) => void; statusExtensions?: React.ReactNode; onClearThread: () => void }) => (
    <div>
      <div data-testid="thread">{scope.threadId}</div>
      {statusExtensions}
      <form onSubmit={(event) => { event.preventDefault(); onSubmit(new FormData(event.currentTarget).get('text') as string); }}>
        <input name="text" aria-label="Chat input" />
        <button type="submit">Send</button>
      </form>
      <button onClick={onClearThread}>Clear thread</button>
    </div>
  ),
}));
vi.mock('../../../src/components/sdlc/chat/useStepChatToolbox', () => ({
  useStepChatToolbox: () => ({ toolsForTurn: mocks.toolsForTurn, analysisMode: false, autoApproveMutations: false, selectedModel: 'test-model' }),
}));
vi.mock('../../../src/services/ai/nineRouterTokenService', () => ({
  getNineRouterConfig: async () => ({ defaultModel: 'test-model', endpoint: 'http://localhost' }),
  getNineRouterApiKey: async () => 'test-key',
}));

const prompt = 'Hãy phân tích hồ sơ hiện tại và tạo SOLUTION.md hoàn chỉnh cho Change Request này.';
const intakeGrounding = '[PL01]\nIntake baseline\n\n[PL02]\nFunctional baseline';

describe('StepChatPanel artifact bootstrap queue', () => {
  let db: TaskPlannerDatabase;
  let resolveThread: (thread: { id: string }) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.status = 'idle';
    mocks.running = false;
    mocks.toolsForTurn.mockResolvedValue({ tools: [], dynamicReadOnlyToolNames: [] });
    db = new TaskPlannerDatabase(`artifact-queue-${crypto.randomUUID()}`);
    mocks.getStepThread.mockReturnValue(new Promise<{ id: string }>((resolve) => { resolveThread = resolve; }));
    mocks.start.mockResolvedValue({ phase: 'complete', content: '' });
  });

  afterEach(async () => {
    cleanup();
    await db.delete();
  });

  function mount(grounding = intakeGrounding, stepId: SdlcStepId = 'SOLUTION', readOnly = false) {
    const ref = React.createRef<StepChatPanelHandle>();
    const props = { ref, projectId: 'project', crId: 'cr', stepId, db, stepGroundingContext: grounding, readOnly, onNavigateToStep: vi.fn() };
    const view = render(<StepChatPanel {...props} />);
    return { ref, props, ...view };
  }

  async function ready() {
    await act(async () => { resolveThread({ id: 'step-thread' }); });
    expect(screen.getByTestId('thread')).toHaveTextContent('step-thread');
  }

  function typeAndSend(text: string) {
    fireEvent.change(screen.getByRole('textbox', { name: 'Chat input' }), { target: { value: text } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  }

  function expectOnlyContract(kind: SdlcArtifactKindForTurn) {
    expect(mocks.start).toHaveBeenCalledTimes(1);
    const system = mocks.start.mock.calls[0]![0].systemMessages[0].content;
    for (const [target, contract] of Object.entries(SDLC_ARTIFACT_CONTRACTS)) {
      if (target === kind) expect(system).toContain(contract);
      else expect(system).not.toContain(contract);
    }
  }

  it('retains one pre-thread request and flushes it once with latest SOLUTION context', async () => {
    const { ref, props, rerender } = mount();
    act(() => {
      ref.current!.requestArtifactAnalysis();
      ref.current!.requestArtifactAnalysis();
    });
    expect(mocks.start).not.toHaveBeenCalled();
    rerender(<StepChatPanel {...props} stepGroundingContext={`${intakeGrounding}\n\nLatest evidence`} />);
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

  it.each([
    ['SOLUTION', 'SOLUTION', intakeGrounding],
    ['TECH_DOCS', 'PL03B', '[SOLUTION v2]\nApproved solution\n\n[CHANGE_PACK]\nValidated pack'],
    ['TECH_DOCS', 'PL07', '[SOLUTION v2]\nApproved solution\n\n[CHANGE_PACK]\nValidated pack'],
    ['CAB', 'CAB', '[PL03B]\nImplementation\n\n[PL07]\nReview questions'],
  ] as const)('%s action %s selects only its own output contract', async (step, kind, grounding) => {
    mount(grounding, step);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: `Soạn ${kind} bằng AI` }));
    await waitFor(() => expectOnlyContract(kind));
  });

  it.each([
    ['INTAKE', []], ['SOLUTION', ['SOLUTION']], ['CODE_GUIDE', []],
    ['CHANGE_PACK', []], ['TECH_DOCS', ['PL03B', 'PL07']], ['CAB', ['CAB']],
  ] as const)('%s renders exactly its valid artifact labels', (step, targets) => {
    mount('', step);
    for (const kind of ['SOLUTION', 'PL03B', 'PL07', 'CAB']) {
      const button = screen.queryByRole('button', { name: `Soạn ${kind} bằng AI` });
      expect(Boolean(button)).toBe((targets as readonly string[]).includes(kind));
      if (button) expect(button).toHaveStyle({ fontSize: '12px', minHeight: '32px' });
    }
  });

  it('hides historical artifact actions and refuses imperative artifact requests', async () => {
    const { ref } = mount(intakeGrounding, 'SOLUTION', true);
    await ready();
    expect(screen.queryByRole('button', { name: 'Soạn SOLUTION bằng AI' })).not.toBeInTheDocument();
    act(() => ref.current!.requestArtifact('SOLUTION'));
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('refuses invalid explicit targets with static copy and direct navigation', async () => {
    const { ref, props } = mount();
    await ready();
    act(() => ref.current!.requestArtifact('PL07'));
    expect(screen.getByRole('alert')).toHaveTextContent('Tài liệu PL07 không thuộc bước này. Bạn có thể tạo: SOLUTION.');
    fireEvent.click(screen.getByRole('button', { name: 'Chuyển đến Bước 5: Tài liệu kỹ thuật' }));
    expect(props.onNavigateToStep).toHaveBeenCalledWith('TECH_DOCS');
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.toolsForTurn).not.toHaveBeenCalled();
  });

  it('refuses missing TECH_DOCS prerequisites before composing and navigates to CHANGE_PACK', async () => {
    const { props } = mount('', 'TECH_DOCS');
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Soạn PL03B bằng AI' }));
    expect(screen.getByRole('alert')).toHaveTextContent(formatGuardMessage('SOLUTION_AND_PACK_REQUIRED_FOR_TECH_DOCS'));
    fireEvent.click(screen.getByRole('button', { name: 'Chuyển đến Bước 4: Kiểm soát Change Pack' }));
    expect(props.onNavigateToStep).toHaveBeenCalledWith('CHANGE_PACK');
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.toolsForTurn).not.toHaveBeenCalled();
  });

  it.each([
    ['SOLUTION', 'SOLUTION', intakeGrounding, 'INTAKE_PL01_REQUIRED'],
    ['TECH_DOCS', 'PL03B', '[SOLUTION v1]\nDesign\n\n[CHANGE_PACK]\nPack', 'SOLUTION_AND_PACK_REQUIRED_FOR_TECH_DOCS'],
    ['CAB', 'CAB', '[PL03B]\nImplementation\n\n[PL07]\nQuestions', 'ALL_DOCS_REQUIRED_FOR_CAB'],
  ] as const)('%s derived markers never substitute required sources', async (step, kind, required, code) => {
    const derived = '[ACCEPTANCE_CONTEXT]\nPL01 PL02 acceptance\n\n[TECH_DOCS]\nSOLUTION PL03B PL07\n\n[IMPLEMENTATION_EVIDENCE]\nCHANGE_PACK evidence';
    const { props, rerender } = mount(derived, step);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: `Soạn ${kind} bằng AI` }));
    expect(screen.getByRole('alert')).toHaveTextContent(formatGuardMessage(code));
    expect(mocks.start).not.toHaveBeenCalled();
    rerender(<StepChatPanel {...props} stepGroundingContext={`${derived}\n\n${required}`} />);
    fireEvent.click(screen.getByRole('button', { name: `Soạn ${kind} bằng AI` }));
    await waitFor(() => expectOnlyContract(kind));
  });

  it.each([
    ['SOLUTION', 'SOLUTION', '[PL01]\nBaseline', 'INTAKE_PL02_REQUIRED'],
    ['TECH_DOCS', 'PL07', '[SOLUTION v1]\nDesign', 'SOLUTION_AND_PACK_REQUIRED_FOR_TECH_DOCS'],
    ['TECH_DOCS', 'PL03B', '[CHANGE_PACK]\nPack', 'SOLUTION_AND_PACK_REQUIRED_FOR_TECH_DOCS'],
    ['CAB', 'CAB', '[PL03B]\nImplementation', 'ALL_DOCS_REQUIRED_FOR_CAB'],
    ['CAB', 'CAB', '[PL07]\nQuestions', 'ALL_DOCS_REQUIRED_FOR_CAB'],
  ] as const)('%s requires every source for %s', async (step, kind, grounding, code) => {
    mount(grounding, step);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: `Soạn ${kind} bằng AI` }));
    expect(screen.getByRole('alert')).toHaveTextContent(formatGuardMessage(code));
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('accepts production-built TECH_DOCS grounding with exact prerequisite markers', async () => {
    const artifact = (kind: 'SOLUTION' | 'CHANGE_PACK') => ({ kind, title: kind, version: 1, hash: 'a'.repeat(64), content: 'Evidence', sourceHashes: [], updatedAt: '2026-11-03T00:00:00Z' });
    mount(buildSdlcStepGrounding({ step: 'TECH_DOCS', artifacts: { solution: artifact('SOLUTION'), changePack: artifact('CHANGE_PACK') } }), 'TECH_DOCS');
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Soạn PL07 bằng AI' }));
    await waitFor(() => expectOnlyContract('PL07'));
  });

  it.each(['TẠO TÀI LIỆU', 'Tạo tài liệu', 'Soạn-pl07', 'VIẾT tài liệu'])('clarifies %s without any model or discovery call', async (text) => {
    mount('[SOLUTION v1]\nDesign\n\n[CHANGE_PACK]\nPack', 'TECH_DOCS');
    await ready();
    typeAndSend(text);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Yêu cầu này cần tạo hoặc sửa tài liệu nhưng chưa rõ loại. Chọn tài liệu bạn muốn:');
    const expected = text === 'Soạn-pl07' ? ['PL07'] : ['PL03B', 'PL07'];
    expect(within(alert).getAllByRole('button', { name: /Soạn .* bằng AI/ })).toHaveLength(expected.length);
    for (const kind of expected) expect(within(alert).getByRole('button', { name: `Soạn ${kind} bằng AI` })).toBeInTheDocument();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.toolsForTurn).not.toHaveBeenCalled();
  });

  it('clarification starts only the target explicitly clicked', async () => {
    mount('[SOLUTION v1]\nDesign\n\n[CHANGE_PACK]\nPack', 'TECH_DOCS');
    await ready();
    typeAndSend('Tạo tài liệu');
    expect(mocks.start).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Soạn PL07 bằng AI' }));
    await waitFor(() => expectOnlyContract('PL07'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each(['Hãy đọc PL07 hiện tại', 'Tạo-pl07x', 'biênsoạn PL07'])('keeps ordinary text %s as Q&A', async (text) => {
    mount('', 'TECH_DOCS');
    await ready();
    typeAndSend(text);
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    for (const contract of Object.values(SDLC_ARTIFACT_CONTRACTS)) {
      expect(mocks.start.mock.calls[0]![0].systemMessages[0].content).not.toContain(contract);
    }
  });

  it('clears notices on scope changes and keeps them out of persisted history', async () => {
    const { props, rerender } = mount('', 'TECH_DOCS');
    await ready();
    typeAndSend('Tạo tài liệu');
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(await db.chatMessages.count()).toBe(0);
    rerender(<StepChatPanel {...props} crId="next-cr" />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each(['running', 'approval', 'prelude'])('refuses artifact actions while %s owns the turn', async (state) => {
    let release: (() => void) | undefined;
    if (state === 'running') mocks.running = true;
    if (state === 'approval') mocks.status = 'awaiting-approval';
    const { ref } = mount();
    await ready();
    if (state === 'prelude') {
      mocks.toolsForTurn.mockReturnValue(new Promise((resolve) => { release = () => resolve({ tools: [], dynamicReadOnlyToolNames: [] }); }));
      typeAndSend('Ordinary question');
    }
    expect(screen.getByRole('button', { name: 'Soạn SOLUTION bằng AI' })).toBeDisabled();
    act(() => ref.current!.requestArtifact('SOLUTION'));
    expect(mocks.start).not.toHaveBeenCalled();
    if (release) {
      await act(async () => release!());
      expect(mocks.start).toHaveBeenCalledTimes(1);
      expect(mocks.start.mock.calls[0]![0].text).toBe('Ordinary question');
    }
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
