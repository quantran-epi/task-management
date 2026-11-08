import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../../src/db';
import { StepChatPanel, type StepChatPanelHandle, type StepChatPanelProps } from '../../../src/components/sdlc/chat/StepChatPanel';
import { createSdlcWorkflowCoordinator, defaultSha256 } from '../../../src/services/wizard/workflowCoordinator';
import { getStepThread } from '../../../src/services/wizard/sdlcCrManager';
import { prepareArtifactPatch, readArtifactSnapshot, type ArtifactToolContext } from '../../../src/services/ai/sdlcArtifactTools';

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

const BASE = '# SOLUTION\n## Mục tiêu\nNội dung gốc.';
const PREFIX = 'ARTIFACT_PATCH_DECISION ';
const callOf = (id: string, name: string, args: Record<string, unknown>) =>
  ({ id, type: 'function' as const, function: { name, arguments: JSON.stringify(args) } });

describe('Artifact patch approval real panel/hook/runtime/widget', () => {
  let db: TaskPlannerDatabase;
  let markdown: string;
  let context: ArtifactToolContext;
  let props: StepChatPanelProps;
  let patchArgs: Record<string, unknown>;
  let scriptedCalls: Array<{ name: string; args: Record<string, unknown> }>;
  let synthesisError: boolean;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`patch-approval-${crypto.randomUUID()}`);
    markdown = BASE;
    const coordinator = createSdlcWorkflowCoordinator({ changeRequestId: crypto.randomUUID(), threadId: crypto.randomUUID() });
    await coordinator.startOrUpdateIntake({ cr: 'CR', featureName: 'Test', author: 'Test', requestingUnit: 'IT', date: '2026-11-05' }, 'PL01', 'PL02');
    const state = await coordinator.commitSolution(BASE);
    context = { changeRequestId: state.projectId, crId: 'cr', stepId: 'SOLUTION',
      scopeKey: `sdlc:${state.projectId}:cr:SOLUTION`, getDraft: () => markdown,
      getWorkflowState: () => state, getAccess: () => ({ readOnly: false, crActive: true, scopeValid: true }) };
    patchArgs = { kind: 'SOLUTION', sectionId: '1.1', expectedHeading: 'Mục tiêu',
      baseHash: state.artifacts.solution!.hash, operation: 'append', newContent: 'Nội dung thêm.' };
    props = { changeRequestId: state.projectId, crId: 'cr', stepId: 'SOLUTION', db, artifactToolContext: context,
      onApplyArtifactPatch: vi.fn(async (proposal, decision) => {
        await db.transaction('rw', [db.settings, db.chatMessages], async () => {
          await db.settings.put({ key: 'test-draft', value: proposal.patchedMarkdown });
          await db.chatMessages.put(decision);
        });
        markdown = proposal.patchedMarkdown;
      }), onSolutionExtracted: vi.fn(), onNavigateToStep: vi.fn() };
    await getStepThread(props.changeRequestId, 'cr', 'SOLUTION', db);
    scriptedCalls = [{ name: 'patch_artifact_section', args: patchArgs }];
    synthesisError = false;
    stream.mockReset();
    let round = 0;
    stream.mockImplementation(async function* () {
      if (round++ === 0) {
        yield { type: 'tool_calls', calls: scriptedCalls.map((call, index) => ({ id: `call-${index}`,
          type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args) } })) };
      } else {
        if (synthesisError) throw new Error('scripted synthesis failure');
        yield { type: 'text', delta: 'Đã xử lý các đề xuất.' };
      }
    });
  });

  afterEach(async () => { cleanup(); await db.delete(); });

  async function mountAndStart() {
    const ref = React.createRef<StepChatPanelHandle>();
    const view = render(<StepChatPanel {...props} ref={ref} />);
    await waitFor(() => expect(screen.getByTestId('ai-chat-widget')).not.toHaveAttribute('data-scope-key', 'default'));
    await waitFor(() => expect(screen.getByText('test')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('tab-compact-more-btn'));
    fireEvent.click(await screen.findByText('Chế độ phân tích (ưu tiên tra cứu)'));
    fireEvent.click(screen.getByTestId('tab-compact-more-btn'));
    await waitFor(() => expect(screen.queryByText('Phân tích')).not.toBeInTheDocument());
    await act(async () => { void ref.current!.sendMessage('Xem đề xuất hiện tại'); });
    return { ref, ...view };
  }

  const decisions = async () => (await db.chatMessages.toArray()).filter((row) => row.content.startsWith(PREFIX));

  it('parks a real diff, applies only after explicit approval, and keeps metadata-only decision after remount', async () => {
    const view = await mountAndStart();
    await screen.findByRole('region', { name: 'Diff đề xuất chỉnh sửa' });
    expect(markdown).toBe(BASE);
    expect(await decisions()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Chấp thuận' }));
    await screen.findByText('Đã chấp thuận — bản nháp bước này đã được cập nhật.');
    await waitFor(() => expect(screen.getByText('Đã xử lý các đề xuất.')).toBeInTheDocument());
    expect(markdown).toBe(`${BASE}\nNội dung thêm.`);
    const rows = await decisions();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.role).toBe('system');
    expect(rows[0]!.content).not.toContain('Nội dung thêm.');
    expect(rows[0]!.content).not.toContain('@@');
    expect(props.onSolutionExtracted).not.toHaveBeenCalled();
    view.unmount();
    render(<StepChatPanel {...props} />);
    await screen.findByText('Đã chấp thuận — bản nháp bước này đã được cập nhật.');
    expect(screen.queryByText(/ARTIFACT_PATCH_DECISION/)).not.toBeInTheDocument();
  });

  it('rejects first then approves independent second against unchanged base without automatic retry', async () => {
    scriptedCalls.push({ name: 'patch_artifact_section', args: { ...patchArgs, newContent: 'Đề xuất thứ hai.' } });
    await mountAndStart();
    await screen.findByRole('region', { name: 'Diff đề xuất chỉnh sửa' });
    fireEvent.click(screen.getByRole('button', { name: 'Từ chối' }));
    await screen.findByText('Đã từ chối đề xuất — tài liệu không thay đổi.');
    await waitFor(() => expect(screen.getByRole('region', { name: 'Diff đề xuất chỉnh sửa' })).toHaveTextContent('Đề xuất thứ hai.'));
    expect(markdown).toBe(BASE);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Chấp thuận' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Chấp thuận' }));
    await screen.findByText('Đã chấp thuận — bản nháp bước này đã được cập nhật.');
    expect(props.onApplyArtifactPatch).toHaveBeenCalledTimes(1);
    expect(await decisions()).toHaveLength(2);
    expect((await db.chatMessages.toArray()).filter((row) => row.role === 'user')).toHaveLength(1);
  });

  it('keeps stale diff visible and disables approval after exact-base whitespace change', async () => {
    const view = await mountAndStart();
    const region = await screen.findByRole('region', { name: 'Diff đề xuất chỉnh sửa' });
    const diffText = region.textContent;
    markdown += '\n';
    // A live host hands down a fresh closure; identical props would not re-run the freshness check.
    view.rerender(<StepChatPanel {...props} artifactToolContext={{ ...context, getDraft: () => markdown }} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Chấp thuận' })).toBeDisabled());
    expect(region.textContent).toBe(diffText);
    expect(screen.getByRole('alert')).toHaveTextContent('Tài liệu đã thay đổi sau khi đề xuất này.');
    fireEvent.click(screen.getByRole('button', { name: 'Từ chối' }));
    await screen.findByText('Đã từ chối đề xuất — tài liệu không thay đổi.');
    expect(props.onApplyArtifactPatch).not.toHaveBeenCalled();
  });

  it('keeps pending card on host failure and serializes retry/double activation', async () => {
    const apply = props.onApplyArtifactPatch!;
    props.onApplyArtifactPatch = vi.fn().mockRejectedValueOnce(new Error('disk failure')).mockImplementation(apply);
    await mountAndStart();
    await screen.findByRole('region', { name: 'Diff đề xuất chỉnh sửa' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Chấp thuận' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Chấp thuận' }));
    await screen.findByText(/Không thể cập nhật bản nháp:/);
    expect(markdown).toBe(BASE);
    expect(await decisions()).toEqual([]);
    const approve = screen.getByRole('button', { name: 'Chấp thuận' });
    fireEvent.click(approve); fireEvent.click(approve);
    await screen.findByText('Đã chấp thuận — bản nháp bước này đã được cập nhật.');
    expect(props.onApplyArtifactPatch).toHaveBeenCalledTimes(2);
    expect(await decisions()).toHaveLength(1);
  });

  it('refuses approval without host adapter and retains rejection path', async () => {
    delete props.onApplyArtifactPatch;
    await mountAndStart();
    await screen.findByRole('region', { name: 'Diff đề xuất chỉnh sửa' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Chấp thuận' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Chấp thuận' }));
    await screen.findByText(/Chưa có kết nối cập nhật bản nháp/);
    expect(markdown).toBe(BASE);
    fireEvent.click(screen.getByRole('button', { name: 'Từ chối' }));
    await screen.findByText('Đã từ chối đề xuất — tài liệu không thay đổi.');
  });

  it('retains rejected decision when synthesis fails and excludes it from model history', async () => {
    synthesisError = true;
    const view = await mountAndStart();
    await screen.findByRole('region', { name: 'Diff đề xuất chỉnh sửa' });
    fireEvent.click(screen.getByRole('button', { name: 'Từ chối' }));
    await screen.findByText('Đã từ chối đề xuất — tài liệu không thay đổi.');
    await waitFor(() => expect(screen.getByText(/Không thể xử lý yêu cầu:/)).toBeInTheDocument());
    expect(await decisions()).toHaveLength(1);
    view.unmount();
    render(<StepChatPanel {...props} />);
    await screen.findByText('Đã từ chối đề xuất — tài liệu không thay đổi.');
    for (const [input] of stream.mock.calls) {
      expect(JSON.stringify(input.payload.messages)).not.toContain(PREFIX);
    }
  });

  it('still resolves an ordinary mutation approval (WR-02)', async () => {
    let round = 0;
    stream.mockReset();
    stream.mockImplementation(async function* () {
      if (round++ === 0) {
        yield { type: 'tool_calls', calls: [callOf('m1', 'update_task', { id: 't-1', status: 'Done' })] };
        return;
      }
      yield { type: 'text', delta: 'Đã cập nhật tác vụ xong.' };
    });
    await mountAndStart();
    // No artifact card exists for this approval; the panel must fall back to the runtime resolver.
    const approve = await screen.findByRole('button', { name: 'Chấp thuận' });
    expect(screen.queryByTestId('artifact-diff-approval')).not.toBeInTheDocument();
    fireEvent.click(approve);
    await waitFor(() => expect(screen.getByText('Đã cập nhật tác vụ xong.')).toBeInTheDocument(), { timeout: 5000 });
    expect(await decisions()).toEqual([]);
  });

  it('surfaces a get_artifact refusal with prerequisite navigation (WR-05, WR-06)', async () => {
    const baseState = context.getWorkflowState!();
    if (!baseState) throw new Error('fixture workflow state required');
    const blocked: ArtifactToolContext = { ...context, getWorkflowState: () => ({
      ...baseState, artifacts: { ...baseState.artifacts, pl01: undefined },
    }) };
    props = { ...props, artifactToolContext: blocked };
    let round = 0;
    stream.mockReset();
    stream.mockImplementation(async function* () {
      if (round++ === 0) {
        yield { type: 'tool_calls', calls: [callOf('g1', 'get_artifact', { kind: 'SOLUTION' })] };
        return;
      }
      yield { type: 'text', delta: 'Chưa thể đọc tài liệu.' };
    });
    await mountAndStart();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Chưa đủ điều kiện');
    expect(alert).toHaveTextContent('PL01');
    const cta = within(alert).getByRole('button', { name: /Chuyển đến Bước 1/ });
    fireEvent.click(cta);
    expect(props.onNavigateToStep).toHaveBeenCalledWith('INTAKE');
    expect(screen.queryByTestId('artifact-diff-approval')).not.toBeInTheDocument();
  });

  it('applies a CRLF APPROVED proposal without changing its EOL or hash identity (CR-01)', async () => {
    const crlf = ['# SOLUTION', '', '## Mục tiêu', '', 'Nội dung gốc.'].join('\r\n');
    markdown = crlf;
    context = { ...context, getDraft: () => markdown };
    const snapshot = await readArtifactSnapshot(db, context, 'SOLUTION');
    if (!('baseHash' in snapshot)) throw new Error('expected a snapshot');
    const proposal = await prepareArtifactPatch(db, context, { kind: 'SOLUTION', sectionId: '1.1',
      expectedHeading: 'Mục tiêu', baseHash: snapshot.baseHash, operation: 'append', newContent: 'Dòng CRLF.' });
    if (!('proposalId' in proposal)) throw new Error('expected a proposal');
    expect(proposal.patchedMarkdown).toContain('\r\n');
    expect(/[^\r]\n/.test(proposal.patchedMarkdown)).toBe(false);
    const decision = { id: crypto.randomUUID(), threadId: props.artifactToolContext!.getWorkflowState!()!.threadId,
      role: 'system' as const, createdAt: new Date().toISOString(),
      content: `ARTIFACT_PATCH_DECISION ${JSON.stringify({ proposalId: proposal.proposalId, kind: 'SOLUTION',
        sectionId: proposal.sectionId, decision: 'approved' })}\nĐã chấp thuận — bản nháp bước này đã được cập nhật.` };
    await act(async () => {
      await props.onApplyArtifactPatch!(proposal, decision);
    });
    expect(markdown).toBe(`${crlf}\r\nDòng CRLF.`);
    expect(await defaultSha256(markdown.trim())).not.toBe(snapshot.baseHash);
    await act(async () => {
      expect(await readArtifactSnapshot(db, { ...context, getDraft: () => markdown }, 'SOLUTION'))
        .toMatchObject({ approvalState: props.onApplyArtifactPatch ? 'unapproved' : 'unapproved' });
    });
  });

  it('shows oversized refusal inline in tool order without an empty approval card', async () => {
    scriptedCalls = [{ name: 'patch_artifact_section', args: { ...patchArgs,
      newContent: Array.from({ length: 121 }, () => 'x').join('\n') } }];
    await mountAndStart();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('121');
    expect(alert).toHaveTextContent('120');
    expect(alert).toHaveTextContent('chia nhỏ');
    expect(alert.closest('[data-tool-call-id="call-0"]')).not.toBeNull();
    expect(screen.queryByTestId('artifact-diff-approval')).not.toBeInTheDocument();
    expect(await decisions()).toEqual([]);
  });
});
