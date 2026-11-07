import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../src/db';
import { AiChatWidget, type AiChatWidgetProps } from '../../src/components/ai/AiChatWidget';
import { prepareArtifactPatch, type ArtifactPatchProposal } from '../../src/services/ai/sdlcArtifactTools';
import { isDarkBase } from '../../src/components/ai/widget/ArtifactDiffApprovalCard';
import { createSdlcWorkflowCoordinator, defaultSha256 } from '../../src/services/wizard/workflowCoordinator';

export const proposal: ArtifactPatchProposal = {
  proposalId: '11111111-1111-4111-8111-111111111111', scopeKey: 'sdlc:p:cr:SOLUTION',
  projectId: 'p', crId: 'cr', kind: 'SOLUTION', version: 1, sectionId: '1.1',
  sectionTitle: 'Mục tiêu', baseHash: 'a'.repeat(64), baseMarkdown: '# SOLUTION\n## Mục tiêu\nCũ',
  diffText: '--- a/SOLUTION\n+++ b/SOLUTION\n@@ -1,1 +1,1 @@\n-Cũ\n+<img src=x onerror=alert(1)>',
  addedLines: 1, removedLines: 1, patchedMarkdown: '# SOLUTION\n## Mục tiêu\nMới',
};

function widgetProps(patch: ArtifactPatchProposal): AiChatWidgetProps {
  return {
    scope: { kind: 'sdlc', threadId: 't', scopeKey: patch.scopeKey, label: 'SDLC' }, messages: [],
    turn: { status: 'awaiting-approval', streamingText: '', streamingStatusLabel: null,
      pendingApproval: { toolName: 'patch_artifact_section', summary: 'Đề xuất', patch } },
    onSubmit: vi.fn(), onStop: vi.fn(), onResolveApproval: vi.fn(), onRetry: vi.fn(), error: null,
    toolbox: { selectedModel: 'test', availableModels: ['test'], onModelChange: vi.fn(),
      analysisMode: false, onToggleAnalysisMode: vi.fn(), autoApproveMutations: true,
      onToggleAutoApproveMutations: vi.fn(), mcpEnabled: false, onToggleMcpEnabled: vi.fn() },
    quickPrompts: [], onClearThread: vi.fn(), emptyState: { heading: 'SDLC', body: '' },
    draft: '', onDraftChange: vi.fn(),
  };
}

afterEach(cleanup);

describe('ArtifactDiffApprovalCard through shared widget', () => {
  it('renders a real prepared patch as verbatim diff instead of generic mutation approval', async () => {
    const db = new TaskPlannerDatabase(`patch-card-${crypto.randomUUID()}`);
    try {
      const coordinator = createSdlcWorkflowCoordinator({
        changeRequestId: crypto.randomUUID(), threadId: crypto.randomUUID(),
      });
      await coordinator.startOrUpdateIntake({ cr: 'CR', featureName: 'Test', author: 'Tester',
        requestingUnit: 'IT', date: '2026-11-05' }, 'PL01', 'PL02');
      const markdown = '# SOLUTION\n## Mục tiêu\nCũ';
      const state = await coordinator.commitSolution(markdown);
      const result = await prepareArtifactPatch(db, {
        projectId: state.projectId, crId: 'cr', scopeKey: 'sdlc:p:cr:SOLUTION', stepId: 'SOLUTION',
        getAccess: () => ({ readOnly: false, crActive: true, scopeValid: true }),
        getDraft: () => markdown, getWorkflowState: () => state,
      }, { kind: 'SOLUTION', sectionId: '1.1', expectedHeading: 'Mục tiêu',
        baseHash: await defaultSha256(markdown.trim()), operation: 'append', newContent: '<img src=x onerror=alert(1)>' });
      expect('proposalId' in result).toBe(true);
      const patch = result as ArtifactPatchProposal;
      const props = widgetProps(patch);
      const view = render(<AiChatWidget {...props} />);
      expect(screen.getByText('Đề xuất chỉnh sửa: Mục tiêu')).toBeInTheDocument();
      const region = screen.getByRole('region', { name: 'Diff đề xuất chỉnh sửa' });
      expect(region.textContent).toBe(patch.diffText);
      expect(region).toHaveStyle({ maxHeight: '240px', overflowX: 'auto', overflowY: 'auto', fontSize: '12px' });
      expect(region.querySelector('img')).toBeNull();
      expect(screen.getByText('SOLUTION · phiên bản 1 · mục 1.1')).toBeInTheDocument();
      expect(screen.getByText('+1 dòng thêm')).toBeInTheDocument();
      expect(screen.getByText('−0 dòng xóa')).toBeInTheDocument();
      // The composer stays enabled while parked so a typed yes/no can resolve the approval.
      expect(screen.getByLabelText('Nội dung tin nhắn trò chuyện AI')).not.toBeDisabled();
      expect(screen.queryByTestId('ai-staged-loading')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Chấp thuận' }));
      expect(props.onResolveApproval).toHaveBeenCalledExactlyOnceWith(true);
      view.unmount();
    } finally { await db.delete(); }
  });

  it('keeps stale diff visible, disables approve only, and leaves ordinary mutation UI unchanged', () => {
    const props = widgetProps(proposal);
    const view = render(<AiChatWidget {...props} artifactApprovalState={{ stale: true }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Tài liệu đã thay đổi sau khi đề xuất này.');
    expect(screen.getByRole('button', { name: 'Chấp thuận' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Từ chối' }));
    expect(props.onResolveApproval).toHaveBeenCalledExactlyOnceWith(false);
    expect(screen.getByRole('region', { name: 'Diff đề xuất chỉnh sửa' }).textContent).toBe(proposal.diffText);
    view.rerender(<AiChatWidget {...props} turn={{ ...props.turn,
      pendingApproval: { toolName: 'update_task', summary: 'Cập nhật A' } }} />);
    expect(screen.getByText('Yêu cầu xác nhận thay đổi dữ liệu')).toBeInTheDocument();
    expect(screen.queryByTestId('artifact-diff-approval')).not.toBeInTheDocument();
    expect(within(screen.getByTestId('ai-mutation-approval')).getByText('Cập nhật A')).toBeInTheDocument();
  });

  it('bounds long titles and stats, stays at 12px, and exposes palette and focus semantics', () => {
    const longTitle = 'T'.repeat(400);
    const huge = { ...proposal, sectionTitle: longTitle, addedLines: 500, removedLines: 500 };
    render(<AiChatWidget {...widgetProps(huge)} />);
    const title = screen.getByText(`Đề xuất chỉnh sửa: ${longTitle}`);
    expect(title).toHaveStyle({ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' });
    expect(screen.getByText('+500 dòng thêm')).toHaveStyle({ fontSize: '12px', whiteSpace: 'nowrap' });
    const region = screen.getByRole('region', { name: 'Diff đề xuất chỉnh sửa' });
    expect(region).toHaveAttribute('tabIndex', '0');
    const added = Array.from(region.querySelectorAll('span')).find((span) => span.textContent?.startsWith('+Dòng'));
    expect(added).not.toBeNull();
    expect(region.textContent).toContain('+++ b/SOLUTION');
    expect(region.textContent).toContain('@@');
    // Assert the explicit font sizes this card authors, not inherited defaults on wrappers.
    for (const element of [title, screen.getByText('+500 dòng thêm'), region]) {
      expect(Number.parseFloat((element as HTMLElement).style.fontSize)).toBeGreaterThanOrEqual(12);
    }
  });

  it('detects dark surfaces from antd base tokens, not only the legacy #141414 value', () => {
    // WR-03: antd 6 darkAlgorithm uses #000 backgrounds / #fff text.
    expect(isDarkBase('#000')).toBe(true);
    expect(isDarkBase('#000000')).toBe(true);
    expect(isDarkBase('#141414')).toBe(true);
    expect(isDarkBase('rgb(0, 0, 0)')).toBe(true);
    expect(isDarkBase('#fff')).toBe(false);
    expect(isDarkBase('#ffffff')).toBe(false);
    expect(isDarkBase(undefined)).toBe(false);
  });

  it('renders every diff row as a full-width block so its background fills the row', () => {
    render(<AiChatWidget {...widgetProps(proposal)} />);
    const rows = screen.getByRole('region', { name: 'Diff đề xuất chỉnh sửa' }).querySelectorAll('[data-diff-line]');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect((row as HTMLElement).style.display).toBe('block');
      expect((row as HTMLElement).style.width).toBe('100%');
    }
  });

  it('renders resolved decisions without buttons and announces write errors', () => {
    const props = widgetProps(proposal);
    const view = render(<AiChatWidget {...props} artifactDecision="rejected" />);
    expect(screen.getByRole('status')).toHaveTextContent('Đã từ chối đề xuất — tài liệu không thay đổi.');
    expect(screen.queryByRole('button', { name: 'Chấp thuận' })).not.toBeInTheDocument();
    view.rerender(<AiChatWidget {...props} artifactApprovalState={{ error: 'Không thể cập nhật bản nháp: lỗi. Bản nháp hiện tại vẫn nguyên vẹn.' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Bản nháp hiện tại vẫn nguyên vẹn');
    expect(screen.getByRole('button', { name: 'Chấp thuận' })).toBeEnabled();
  });
});
