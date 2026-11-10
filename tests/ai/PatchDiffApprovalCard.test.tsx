import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  PatchDiffApprovalCard,
  isDarkBase,
} from '../../src/components/ai/widget/PatchDiffApprovalCard';
import type { ArtifactPatchProposal } from '../../src/services/ai/patchProposal';

const proposal: ArtifactPatchProposal = {
  proposalId: '11111111-1111-4111-8111-111111111111',
  target: 'note',
  id: 'note-1',
  version: 0,
  sectionId: '1.1',
  sectionTitle: 'Mục tiêu',
  baseHash: 'a'.repeat(64),
  baseMarkdown: '# NOTE\n## Mục tiêu\nCũ',
  diffText: '--- a/note:note-1\n+++ b/note:note-1\n@@ -1,1 +1,1 @@\n-Cũ\n+Mới',
  addedLines: 1,
  removedLines: 1,
  patchedMarkdown: '# NOTE\n## Mục tiêu\nMới',
};

afterEach(cleanup);

describe('PatchDiffApprovalCard', () => {
  it('detects dark surfaces from antd base tokens, not only the legacy #141414 value', () => {
    expect(isDarkBase('#141414')).toBe(true);
    expect(isDarkBase('#000')).toBe(true);
    expect(isDarkBase('rgb(10,10,10)')).toBe(true);
    expect(isDarkBase('#ffffff')).toBe(false);
    expect(isDarkBase(undefined)).toBe(false);
  });

  it('renders the section title, line counters, and one row per diff line', () => {
    render(<PatchDiffApprovalCard patch={proposal} onApprove={vi.fn()} onReject={vi.fn()} />);
    expect(screen.getByText('Đề xuất chỉnh sửa: Mục tiêu')).toBeInTheDocument();
    expect(screen.getByText('+1 dòng thêm')).toBeInTheDocument();
    expect(screen.getByText('−1 dòng xóa')).toBeInTheDocument();
    const region = screen.getByRole('region', { name: 'Diff đề xuất chỉnh sửa' });
    expect(region.textContent).toBe(proposal.diffText);
    expect(region.querySelectorAll('[data-diff-line]').length).toBe(
      proposal.diffText.split(/(?<=\n)/).length
    );
  });

  it('reports approve and reject decisions', () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    render(<PatchDiffApprovalCard patch={proposal} onApprove={onApprove} onReject={onReject} />);
    fireEvent.click(screen.getByRole('button', { name: 'Chấp thuận' }));
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onReject).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Từ chối' }));
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('disables approve and warns when the proposal is stale', () => {
    render(<PatchDiffApprovalCard patch={proposal} stale onApprove={vi.fn()} onReject={vi.fn()} />);
    expect(screen.getByTestId('patch-diff-approval')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Tài liệu đã thay đổi sau khi đề xuất này.');
    expect(screen.getByRole('button', { name: 'Chấp thuận' })).toBeDisabled();
  });

  it('renders an approved decision and hides both buttons', () => {
    render(
      <PatchDiffApprovalCard
        patch={proposal}
        decision="approved"
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.getByRole('status')).toHaveTextContent('Đã chấp thuận');
    expect(screen.queryByRole('button', { name: 'Chấp thuận' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Từ chối' })).not.toBeInTheDocument();
  });
});
