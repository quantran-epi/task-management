import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../../src/db';
import { StepChatPanel, looksLikeArtifactPatchRequest } from '../../../src/components/sdlc/chat/StepChatPanel';
import { createSdlcWorkflowCoordinator } from '../../../src/services/wizard/workflowCoordinator';
import { getStepThread } from '../../../src/services/wizard/sdlcCrManager';
import type { ArtifactPatchProposal, ArtifactToolContext } from '../../../src/services/ai/sdlcArtifactTools';
import type { ChatMessage } from '../../../src/types/models';
import { composeSdlcTurn, SDLC_STEP_ALLOWED_TOOLS } from '../../../src/services/ai/sdlcPromptComposer';

const { stream } = vi.hoisted(() => ({ stream: vi.fn() }));
vi.mock('../../../src/services/ai/nineRouterClient', async (original) => ({
  ...await original<typeof import('../../../src/services/ai/nineRouterClient')>(),
  streamChatEvents: (input: unknown) => stream(input),
}));
vi.mock('../../../src/services/ai/nineRouterTokenService', async (original) => ({
  ...await original<typeof import('../../../src/services/ai/nineRouterTokenService')>(),
  getNineRouterConfig: async () => ({ endpoint: 'http://localhost', defaultModel: 'test' }),
  getNineRouterApiKey: async () => 'test-key',
}));

const BASE = ['# SOLUTION', '', '## Bối cảnh', '', 'Nội dung bối cảnh.', '', '## Kiểm tra đầu vào', '', 'Quy tắc hiện có.'].join('\n');
const PREFIX = 'ARTIFACT_PATCH_DECISION ';
/** SOLUTION's real prerequisites: the guard trusts markers, not rendered text. */
const GROUNDING = { text: 'PL01 evidence\nPL02 evidence', present: new Set(['PL01', 'PL02'] as const) };

type Call = { id: string; type: 'function'; function: { name: string; arguments: string } };
const callOf = (id: string, name: string, args: Record<string, unknown>): Call =>
  ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });

describe('patch intent routing (SDLC-ART-05)', () => {
  it.each([
    'Thêm nội dung kiểm tra đầu vào vào SOLUTION',
    'Bổ sung quy tắc kiểm tra đầu vào cho SOLUTION',
    'Chèn thêm mục kiểm tra đầu vào vào SOLUTION',
    'Sửa mục kiểm tra đầu vào trong SOLUTION',
    'Cập nhật SOLUTION: thêm quy tắc kiểm tra đầu vào',
    'Add this content to the solution',
    'append this to SOLUTION',
    'Edit the SOLUTION input-check section',
  ])('detects bounded edit request: %s', (text) => {
    expect(looksLikeArtifactPatchRequest(text)).toBe(true);
  });

  it.each([
    'Soạn SOLUTION đầy đủ cho CR này',
    'Tạo tài liệu PL03B hoàn chỉnh',
    'Sinh lại toàn bộ SOLUTION.md',
    'Giải thích bằng chứng PL02',
    'Giải thích quy tắc kiểm tra đầu vào',
  ])('does not treat full generation or Q&A as a patch: %s', (text) => {
    expect(looksLikeArtifactPatchRequest(text)).toBe(false);
  });

  it('adds patch intent to the pure composer with prompt-only policy and no full-document contract', () => {
    const composed = composeSdlcTurn({ step: 'SOLUTION', intent: 'patch', artifact: 'SOLUTION',
      userTurn: 'Thêm nội dung kiểm tra đầu vào vào SOLUTION', availableToolNames: ['get_artifact', 'patch_artifact_section'] });
    expect(composed.segments.outputContract).toBe('');
    expect(composed.segments.toolPolicy).toContain('get_artifact');
    expect(composed.segments.toolPolicy).toContain('patch_artifact_section');
    expect(composed.segments.toolPolicy).toContain('sectionId');
    expect(composed.segments.toolPolicy).toContain('baseHash');
    expect(composed.segments.toolPolicy).toContain('120');
    expect(composed.segments.toolPolicy).toContain('chấp thuận');
    expect(composed.segments.toolPolicy).toContain('không áp dụng toàn bộ tài liệu');
    expect(composed.segments.toolPolicy).not.toContain('HỢP ĐỒNG ĐẦU RA');
  });

  it('names exactly the supplied payload tools when availability is given', () => {
    const on = composeSdlcTurn({ step: 'SOLUTION', intent: 'patch', artifact: 'SOLUTION', userTurn: 'x',
      availableToolNames: ['query_notes', 'get_artifact', 'patch_artifact_section'] });
    const off = composeSdlcTurn({ step: 'SOLUTION', intent: 'patch', artifact: 'SOLUTION', userTurn: 'x',
      availableToolNames: ['query_notes', 'get_artifact'] });
    expect(on.segments.toolPolicy).toContain('patch_artifact_section');
    expect(off.segments.toolPolicy).toContain('Analysis Mode đang bật');
    expect(off.segments.toolPolicy).toContain('Analysis Mode');
    expect(composeSdlcTurn({ step: 'INTAKE', intent: 'qa', userTurn: 'x' }).segments.toolPolicy)
      .toBe(composeSdlcTurn({ step: 'INTAKE', intent: 'qa', userTurn: 'x' }).segments.toolPolicy);
  });

  it('advertises artifact tools only on owning steps', () => {
    for (const step of ['SOLUTION', 'TECH_DOCS', 'CAB'] as const) {
      expect(SDLC_STEP_ALLOWED_TOOLS[step]).toEqual(expect.arrayContaining(['get_artifact', 'patch_artifact_section']));
    }
    for (const step of ['INTAKE', 'CODE_GUIDE', 'CHANGE_PACK'] as const) {
      expect(SDLC_STEP_ALLOWED_TOOLS[step]).not.toContain('get_artifact');
    }
  });
});

describe('real scripted get → patch → approve path', () => {
  let db: TaskPlannerDatabase;
  let context: ArtifactToolContext;
  let markdown: string;
  let projectId: string;
  let onApply: (proposal: ArtifactPatchProposal, decision: ChatMessage) => Promise<void>;
  let finalText: string;
  let patchContent: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = new TaskPlannerDatabase(`patch-intent-${crypto.randomUUID()}`);
    projectId = crypto.randomUUID();
    markdown = BASE;
    patchContent = 'Dòng kiểm tra đầu vào mới.';
    finalText = 'Đã đề xuất một chỉnh sửa nhỏ vào mục kiểm tra đầu vào.';
    const coordinator = createSdlcWorkflowCoordinator({ changeRequestId: projectId, threadId: crypto.randomUUID() });
    await coordinator.startOrUpdateIntake({ cr: 'CR', featureName: 'Test', author: 'T', requestingUnit: 'IT', date: '2026-11-05' }, 'PL01', 'PL02');
    const state = await coordinator.commitSolution(BASE);
    context = { projectId: state.projectId, crId: 'cr', stepId: 'SOLUTION',
      scopeKey: `sdlc:${state.projectId}:cr:SOLUTION`, getDraft: () => markdown, getWorkflowState: () => state,
      getAccess: () => ({ readOnly: false, crActive: true, scopeValid: true }) };
    const apply = async (proposal: ArtifactPatchProposal, decision: ChatMessage) => {
      await db.transaction('rw', [db.settings, db.chatMessages], async () => {
        await db.settings.put({ key: 'test-draft', value: proposal.patchedMarkdown });
        await db.chatMessages.put(decision);
      });
      markdown = proposal.patchedMarkdown;
    };
    onApply = vi.fn(apply);
    await getStepThread(state.projectId, 'cr', 'SOLUTION', db);
    stream.mockReset();
    let round = 0;
    stream.mockImplementation(async function* (input: { payload: { messages: Array<{ role: string; name?: string; content?: string }> } }) {
      if (round++ === 0) {
        yield { type: 'tool_calls', calls: [callOf('g1', 'get_artifact', { kind: 'SOLUTION' })] };
        return;
      }
      if (round === 2) {
        const read = [...input.payload.messages].reverse().find((m) => m.role === 'tool' && m.name === 'get_artifact');
        const snapshot = JSON.parse(read?.content ?? '{}');
        const section = snapshot.sectionIndex.find((s: { title: string }) => s.title === 'Kiểm tra đầu vào');
        yield { type: 'tool_calls', calls: [callOf('p1', 'patch_artifact_section', { kind: 'SOLUTION',
          sectionId: section.id, expectedHeading: section.title, baseHash: snapshot.baseHash,
          operation: 'append', newContent: patchContent })] };
        return;
      }
      yield { type: 'text', delta: finalText };
    });
  });

  afterEach(async () => { cleanup(); await db.delete(); });

  async function startTurn(text: string) {
    const view = render(<StepChatPanel projectId={projectId} crId="cr" stepId="SOLUTION" db={db}
      stepGroundingContext={GROUNDING} artifactToolContext={context} onApplyArtifactPatch={onApply} />);
    // Sending requires the step thread; its scope key also proves the panel is bound.
    await waitFor(async () => expect(await db.chatThreads.where('scopeKey')
      .equals(`sdlc:${projectId}:cr:SOLUTION`).first()).toBeDefined());
    fireEvent.click(screen.getByTestId('tab-compact-more-btn'));
    fireEvent.click(await screen.findByText('Chế độ phân tích (chỉ đọc)'));
    fireEvent.click(screen.getByTestId('tab-compact-more-btn'));
    await waitFor(() => expect(screen.queryByText('Phân tích')).not.toBeInTheDocument());
    const composer = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI');
    // A send clicked while the panel is still binding its step thread is dropped by design.
    await waitFor(() => expect(screen.getByTestId('ai-chat-widget').getAttribute('data-scope-key'))
      .toBe(`sdlc:${projectId}:cr:SOLUTION`));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    fireEvent.change(composer, { target: { value: text } });
    await waitFor(() => expect(screen.getByLabelText('Gửi tin nhắn')).toBeEnabled(), { timeout: 5000 });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));
    return view;
  }

  function toolNames(): string[] {
    const requests = stream.mock.calls.map(([input]) => input as { payload: { tools?: Array<{ function: { name: string } }> } });
    return [...new Set(requests.flatMap((r) => (r.payload.tools ?? []).map((t) => t.function.name)))];
  }

  it('calls real get then patch, shows a +1/−0 card and changes the editor only after approve', async () => {
    await startTurn('Thêm nội dung kiểm tra đầu vào vào SOLUTION');
    await waitFor(() => expect(stream).toHaveBeenCalled());
    await waitFor(() => expect(stream.mock.calls.length).toBeGreaterThanOrEqual(2));
    const region = await screen.findByRole('region', { name: 'Diff đề xuất chỉnh sửa' });
    expect(region.textContent).toContain(`+${patchContent}`);
    expect(screen.getByText('+1 dòng thêm')).toBeInTheDocument();
    expect(screen.getByText('−0 dòng xóa')).toBeInTheDocument();
    expect(markdown).toBe(BASE);
    expect(toolNames()).toEqual(expect.arrayContaining(['get_artifact', 'patch_artifact_section']));

    fireEvent.click(screen.getByRole('button', { name: 'Chấp thuận' }));
    await screen.findByText('Đã chấp thuận — bản nháp bước này đã được cập nhật.');
    await waitFor(() => expect(markdown).toBe(`${BASE}\n${patchContent}`));
    // Only the target section grew; the neighbouring section is byte-identical.
    expect(markdown.indexOf('Nội dung bối cảnh.')).toBe(BASE.indexOf('Nội dung bối cảnh.'));
    // The append lands after a newline; everything before the added text is the original document.
    expect(markdown.slice(0, markdown.indexOf(patchContent))).toBe(`${BASE}\n`);
    const decisions = (await db.chatMessages.toArray()).filter((row) => row.content.startsWith(PREFIX));
    expect(decisions).toHaveLength(1);
    expect(decisions[0]!.content).not.toContain(patchContent);
  });

  it('never lets a complete # SOLUTION assistant answer bypass patch approval', async () => {
    finalText = `# SOLUTION\n\n## Bối cảnh\n\nToàn bộ tài liệu bị thay thế.\n\n## Kiểm tra đầu vào\n\nBị ghi đè.`;
    await startTurn('Thêm nội dung kiểm tra đầu vào vào SOLUTION');
    await screen.findByRole('region', { name: 'Diff đề xuất chỉnh sửa' });
    expect(markdown).toBe(BASE);
    // A complete document in the final assistant text is narrative only; the editor stays untouched.
    await waitFor(() => expect(stream.mock.calls.length).toBeGreaterThanOrEqual(2));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    expect(markdown).toBe(BASE);
    fireEvent.click(screen.getByRole('button', { name: 'Chấp thuận' }));
    await waitFor(() => expect(markdown).toBe(`${BASE}\n${patchContent}`));
    expect(markdown).not.toContain('Bị ghi đè.');
  });

  it('re-reads after a prior approval invalidated the second call base, instead of applying it', async () => {
    let round = 0;
    let readAgain = 0;
    stream.mockReset();
    stream.mockImplementation(async function* (input: { payload: { messages: Array<{ role: string; name?: string; content?: string }> } }) {
      if (round++ === 0) { yield { type: 'tool_calls', calls: [callOf('g1', 'get_artifact', { kind: 'SOLUTION' })] }; return; }
      const read = [...input.payload.messages].reverse().find((m) => m.role === 'tool' && m.name === 'get_artifact');
      const snapshot = JSON.parse(read?.content ?? '{}');
      const section = snapshot.sectionIndex.find((s: { title: string }) => s.title === 'Kiểm tra đầu vào');
      if (round === 2) { yield { type: 'tool_calls', calls: [callOf('p1', 'patch_artifact_section', { kind: 'SOLUTION', sectionId: section.id,
        expectedHeading: section.title, baseHash: snapshot.baseHash, operation: 'append', newContent: 'Dòng thứ nhất.' })] }; return; }
      if (round === 3) { readAgain += 1; yield { type: 'tool_calls', calls: [callOf('g2', 'get_artifact', { kind: 'SOLUTION' })] }; return; }
      if (round === 4) {
        const fresh = JSON.parse([...input.payload.messages].reverse().find((m) => m.role === 'tool' && m.name === 'get_artifact')?.content ?? '{}');
        yield { type: 'tool_calls', calls: [callOf('p2', 'patch_artifact_section', { kind: 'SOLUTION', sectionId: section.id,
          expectedHeading: section.title, baseHash: fresh.baseHash, operation: 'append', newContent: 'Dòng thứ hai.' })] };
        return;
      }
      yield { type: 'text', delta: 'Đã đề xuất chỉnh sửa tiếp theo.' };
    });
    await startTurn('Thêm nội dung kiểm tra đầu vào vào SOLUTION');
    await screen.findByRole('region', { name: 'Diff đề xuất chỉnh sửa' });
    fireEvent.click(screen.getByRole('button', { name: 'Chấp thuận' }));
    await screen.findByText('Đã chấp thuận — bản nháp bước này đã được cập nhật.');
    await waitFor(() => expect(markdown).toBe(`${BASE}\nDòng thứ nhất.`));
    // A second proposal must be computed against the fresh base, never the pre-approval one.
    expect(readAgain).toBeGreaterThan(0);
    expect(markdown).toBe(`${BASE}\nDòng thứ nhất.`);
  });

  it('keeps an independent second patch fresh after rejecting the first', async () => {
    let round = 0;
    stream.mockReset();
    stream.mockImplementation(async function* (input: { payload: { messages: Array<{ role: string; name?: string; content?: string }> } }) {
      if (round++ === 0) { yield { type: 'tool_calls', calls: [callOf('g1', 'get_artifact', { kind: 'SOLUTION' })] }; return; }
      const read = [...input.payload.messages].reverse().find((m) => m.role === 'tool' && m.name === 'get_artifact');
      const snapshot = JSON.parse(read?.content ?? '{}');
      const section = snapshot.sectionIndex.find((s: { title: string }) => s.title === 'Kiểm tra đầu vào');
      if (round === 2) { yield { type: 'tool_calls', calls: [callOf('p1', 'patch_artifact_section', { kind: 'SOLUTION', sectionId: section.id,
        expectedHeading: section.title, baseHash: snapshot.baseHash, operation: 'append', newContent: 'Đề xuất một.' }),
        callOf('p2', 'patch_artifact_section', { kind: 'SOLUTION', sectionId: section.id,
          expectedHeading: section.title, baseHash: snapshot.baseHash, operation: 'append', newContent: 'Đề xuất hai.' })] };
        return; }
      yield { type: 'text', delta: 'Đã xử lý hai đề xuất.' };
    });
    await startTurn('Thêm nội dung kiểm tra đầu vào vào SOLUTION');
    fireEvent.click(await screen.findByRole('button', { name: 'Từ chối' }));
    await screen.findByText('Đã từ chối đề xuất — tài liệu không thay đổi.');
    const approve = await screen.findByRole('button', { name: 'Chấp thuận' });
    await waitFor(() => expect(approve).toBeEnabled());
    expect(markdown).toBe(BASE);
    fireEvent.click(approve);
    await waitFor(() => expect(markdown).toBe(`${BASE}\nĐề xuất hai.`));
  });

  it('omits patch from the payload in Analysis Mode and keeps get_artifact', async () => {
    render(<StepChatPanel projectId={projectId} crId="cr" stepId="SOLUTION" db={db}
      stepGroundingContext={GROUNDING} artifactToolContext={context} onApplyArtifactPatch={onApply} />);
    // Sending before the panel binds its thread is dropped by design, so wait for the bound scope.
    await waitFor(() => expect(screen.getByTestId('ai-chat-widget').getAttribute('data-scope-key'))
      .toBe(`sdlc:${projectId}:cr:SOLUTION`));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const analysisComposer = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI');
    fireEvent.change(analysisComposer, { target: { value: 'Thêm nội dung kiểm tra đầu vào vào SOLUTION' } });
    await waitFor(() => expect(screen.getByLabelText('Gửi tin nhắn')).toBeEnabled(), { timeout: 5000 });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));
    await waitFor(() => expect(stream).toHaveBeenCalled(), { timeout: 5000 });
    const tools = toolNames();
    expect(tools).toContain('get_artifact');
    expect(tools).not.toContain('patch_artifact_section');
  });
});
