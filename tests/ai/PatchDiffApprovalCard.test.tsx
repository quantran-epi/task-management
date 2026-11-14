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

  it('renders the skill subtitle verbatim instead of the id line', () => {
    render(
      <PatchDiffApprovalCard
        patch={proposal}
        variant="skill"
        subtitle="Kỹ năng · Viết đặc tả · đề xuất bởi Lan"
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.getByText('Kỹ năng · Viết đặc tả · đề xuất bởi Lan')).toBeInTheDocument();
    // The default line would print the UUID; the subtitle replaces it entirely.
    expect(screen.queryByText(/Ghi chú · note-1 · mục 1\.1/)).not.toBeInTheDocument();
  });

  it('uses the skill stale copy and keeps reject enabled (D-16)', () => {
    render(
      <PatchDiffApprovalCard
        patch={proposal}
        stale
        staleReason="newer-version-approved"
        variant="skill"
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Kỹ năng đã có bản mới được duyệt sau khi đề xuất này được tạo.'
    );
    expect(screen.getByRole('button', { name: 'Chấp thuận' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Từ chối' })).not.toBeDisabled();
    expect(
      screen.getByLabelText('Không thể duyệt vì kỹ năng đã có bản mới hơn')
    ).toBeInTheDocument();
  });

  it('renders the evidence panel collapsed and as plain text', () => {
    const evidence = 'Turn 4 cho thấy thiếu bước kiểm thử.';
    render(
      <PatchDiffApprovalCard
        patch={proposal}
        variant="skill"
        evidence={evidence}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.getByText('Bằng chứng')).toBeInTheDocument();
    expect(screen.queryByText(evidence)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Bằng chứng'));
    const body = screen.getByText(evidence);
    expect(body).toBeInTheDocument();
    expect(body.querySelector('a')).toBeNull();
    expect(body.querySelector('strong')).toBeNull();
    expect(body.innerHTML).toBe(evidence);
  });

  // UAT item 1: a long diff must not push the decision buttons off screen. The diff scrolls
  // inside a bounded box, and the evidence panel sits BELOW the buttons, collapsed by default —
  // so neither can displace them. jsdom has no layout; this asserts the structure that keeps
  // them reachable, and the visual check is the ceiling.
  it('bounds the diff and keeps the decision buttons ahead of the evidence panel (UAT)', () => {
    const longDiff = Array.from({ length: 200 }, (_, i) => `+dòng thêm ${i}`).join('\n');
    render(
      <PatchDiffApprovalCard
        patch={{ ...proposal, diffText: longDiff }}
        variant="skill"
        evidence="Bằng chứng dài."
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );

    // The diff body owns a bounded, scrollable box.
    const diffBox = screen.getByText('+dòng thêm 0').parentElement;
    expect(diffBox?.getAttribute('style')).toContain('max-height');
    expect(diffBox?.getAttribute('style')).toContain('overflow-y');

    // The buttons come before the evidence panel in document order, so a collapsed panel below
    // them cannot push them down.
    const approve = screen.getByRole('button', { name: 'Chấp thuận' });
    const evidenceLabel = screen.getByText('Bằng chứng');
    expect(
      approve.compareDocumentPosition(evidenceLabel) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('renders no evidence panel when evidence is empty or whitespace', () => {
    render(
      <PatchDiffApprovalCard
        patch={proposal}
        variant="skill"
        evidence="   "
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.queryByText('Bằng chứng')).toBeNull();
  });

  it('keeps the note decision copy when variant is omitted', () => {
    render(
      <PatchDiffApprovalCard
        patch={proposal}
        decision="approved"
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Đã chấp thuận — bản nháp bước này đã được cập nhật.'
    );
  });
});
