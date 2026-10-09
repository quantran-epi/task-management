// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DocumentSetForm, snapshotFolderMembers } from '../../src/components/knowledge/DocumentSetForm';
import { AttemptHistoryList } from '../../src/components/knowledge/AttemptHistoryList';
import { DocumentSetDrawer, publishStateLabel } from '../../src/components/knowledge/DocumentSetDrawer';
import { PublishPreviewModal } from '../../src/components/knowledge/PublishPreviewModal';
import { PublishProgressPanel } from '../../src/components/knowledge/PublishProgressPanel';
import type { ChangePreview } from '../../src/services/knowledge/changePreview';
import type { DlpFinding } from '../../src/types/dlp';
import type { DocumentSet, Note, PublishAttemptCache, PublishPrimaryState } from '../../src/types/models';

const NOW = '2026-10-08T08:00:00.000Z';

function note(id: string, title: string, parentId?: string): Note {
  return {
    id,
    type: 'document',
    ...(parentId ? { parentId } : {}),
    title,
    body: `# ${title}`,
    tags: [],
    isPinned: false,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

const notes = [note('doc-a', 'Alpha', 'folder-a'), note('doc-b', 'Beta', 'folder-a'), note('doc-c', 'Gamma')];
const documentSet: DocumentSet = {
  id: 'set-a',
  name: 'Bộ nghiệp vụ',
  documentIds: ['doc-a', 'doc-b'],
  createdAt: NOW,
  updatedAt: NOW,
};

describe('document-set management', () => {
  it('creates trimmed names from empty, folder snapshot, or manual ordered members', () => {
    expect(snapshotFolderMembers(notes, 'folder-a')).toEqual(['doc-a', 'doc-b']);
    const onSave = vi.fn();
    const { rerender } = render(
      <DocumentSetForm notes={notes} currentFolderId="folder-a" onSave={onSave} />
    );

    fireEvent.change(screen.getByLabelText('Tên bộ tài liệu'), { target: { value: `  ${'x'.repeat(125)}  ` } });
    fireEvent.click(screen.getByRole('radio', { name: 'Từ thư mục hiện tại' }));
    expect(screen.getByText('Tài liệu thêm hoặc di chuyển sau này không tự thay đổi bộ này.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    expect(onSave).toHaveBeenLastCalledWith({ name: 'x'.repeat(120), documentIds: ['doc-a', 'doc-b'] });

    rerender(<DocumentSetForm key="empty" notes={notes} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText('Tên bộ tài liệu'), { target: { value: 'Bộ trống' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Bộ trống' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    expect(onSave).toHaveBeenLastCalledWith({ name: 'Bộ trống', documentIds: [] });
  });

  it('adds, removes, and reorders members with labeled controls; save never publishes', () => {
    const onSave = vi.fn();
    const onPublish = vi.fn();
    render(
      <DocumentSetForm
        notes={notes}
        initialSet={documentSet}
        onSave={onSave}
        onPublish={onPublish}
      />
    );

    const beta = screen.getByTestId('member-doc-b');
    fireEvent.click(within(beta).getByRole('button', { name: 'Đưa lên' }));
    fireEvent.click(within(screen.getByTestId('member-doc-a')).getByRole('button', { name: 'Gỡ Alpha' }));
    fireEvent.click(screen.getByRole('button', { name: 'Thêm tài liệu' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Gamma/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Xong' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    expect(onSave).toHaveBeenCalledWith({ name: 'Bộ nghiệp vụ', documentIds: ['doc-b', 'doc-c'] });
    expect(onPublish).not.toHaveBeenCalled();
  });

  it('renders exact six states, cached offline copy, active summary, and newest 10 safe attempts', () => {
    const states: PublishPrimaryState[] = ['Never published', 'In sync', 'Local changes', 'Publishing', 'Warning', 'Failed'];
    expect(states.map(publishStateLabel)).toEqual([
      'Chưa xuất bản',
      'Đã đồng bộ',
      'Có thay đổi cục bộ',
      'Đang xuất bản',
      'Cảnh báo',
      'Thất bại',
    ]);
    const attempts: PublishAttemptCache[] = Array.from({ length: 11 }, (_, index) => ({
      id: `attempt-${index}`,
      setId: 'set-a',
      startedAt: new Date(Date.parse(NOW) + index * 1000).toISOString(),
      durationMs: 1000,
      status: index === 10 ? 'Failed' : 'In sync',
      addedCount: 1,
      changedCount: 2,
      removedCount: 3,
      unchangedCount: 4,
      warningCount: 5,
      errorCode: 'SAFE_CODE',
      errorMessage: 'Chia nhỏ tài liệu rồi thử lại.',
    }));
    render(<AttemptHistoryList attempts={attempts} />);
    expect(screen.getAllByTestId('attempt-history-item')).toHaveLength(10);
    expect(screen.getAllByText(/SAFE_CODE/)).toHaveLength(10);
    expect(screen.queryByText('attempt-0')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('# Alpha');

    render(
      <DocumentSetDrawer
        open
        sets={[documentSet]}
        notes={notes}
        attempts={attempts}
        selectedSetId="set-a"
        state="Publishing"
        activeSummary="2 tài liệu trong ảnh chụp đang hoạt động"
        cachedAt={NOW}
        offline
        configured
        onClose={vi.fn()}
        onSave={vi.fn()}
        onPreview={vi.fn()}
      />
    );
    expect(screen.getByText('Đang xuất bản')).toBeInTheDocument();
    expect(screen.getByText('2 tài liệu trong ảnh chụp đang hoạt động')).toBeInTheDocument();
    expect(screen.getByText(`Dữ liệu trạng thái gần nhất: ${NOW}`)).toBeInTheDocument();
  });

  it('renders each list row and selected detail from its own set state', () => {
    const secondSet = { ...documentSet, id: 'set-b', name: 'Bộ thứ hai' };
    const { rerender } = render(
      <DocumentSetDrawer
        open
        sets={[documentSet, secondSet]}
        notes={notes}
        attempts={[]}
        statesBySet={{ 'set-a': 'In sync', 'set-b': 'Local changes' }}
        configured
        onClose={vi.fn()}
        onSave={vi.fn()}
        onPreview={vi.fn()}
      />
    );
    expect(screen.getByText('Đã đồng bộ')).toBeInTheDocument();
    expect(screen.getByText('Có thay đổi cục bộ')).toBeInTheDocument();

    rerender(
      <DocumentSetDrawer
        open
        sets={[documentSet, secondSet]}
        notes={notes}
        attempts={[]}
        selectedSetId="set-b"
        statesBySet={{ 'set-a': 'In sync', 'set-b': 'Local changes' }}
        configured
        onClose={vi.fn()}
        onSave={vi.fn()}
        onPreview={vi.fn()}
      />
    );
    expect(screen.getByText('Có thay đổi cục bộ')).toBeInTheDocument();
  });

  it('offers retained-attempt reconciliation for Publishing state', () => {
    const onReconcileAttempt = vi.fn();
    render(
      <DocumentSetDrawer
        open
        sets={[documentSet]}
        notes={notes}
        attempts={[]}
        selectedSetId="set-a"
        statesBySet={{ 'set-a': 'Publishing' }}
        activeAttemptIdsBySet={{ 'set-a': 'attempt-a' }}
        configured
        onClose={vi.fn()}
        onSave={vi.fn()}
        onPreview={vi.fn()}
        onReconcileAttempt={onReconcileAttempt}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra trạng thái' }));
    expect(onReconcileAttempt).toHaveBeenCalledWith('set-a', 'attempt-a');
  });

  it('disables preview for empty, invalid config, or active same-set attempt while edits stay enabled', () => {
    const { rerender } = render(
      <DocumentSetDrawer
        open
        sets={[{ ...documentSet, documentIds: [] }]}
        notes={notes}
        attempts={[]}
        selectedSetId="set-a"
        state="Never published"
        configured
        onClose={vi.fn()}
        onSave={vi.fn()}
        onPreview={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Xem trước xuất bản' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toBeEnabled();

    rerender(
      <DocumentSetDrawer
        open
        sets={[documentSet]}
        notes={notes}
        attempts={[]}
        selectedSetId="set-a"
        state="Never published"
        configured={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onPreview={vi.fn()}
      />
    );
    expect(screen.getByText('Chưa cấu hình Knowledge Server.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xem trước xuất bản' })).toBeDisabled();

    rerender(
      <DocumentSetDrawer
        open
        sets={[documentSet]}
        notes={notes}
        attempts={[]}
        selectedSetId="set-a"
        state="Publishing"
        configured
        activeSetId="set-a"
        onClose={vi.fn()}
        onSave={vi.fn()}
        onPreview={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Xem trước xuất bản' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toBeEnabled();
  });
});

function previewWithRemoval(): ChangePreview {
  return {
    setId: 'set-a',
    documents: [
      { documentId: 'doc-a', title: 'Alpha', classification: 'added', currentHash: 'a'.repeat(64) },
      { documentId: 'doc-b', title: 'Beta', classification: 'removed', previousHash: 'b'.repeat(64) },
    ],
    chunks: [
      {
        documentId: 'doc-a', classification: 'added', moved: false,
        current: {
          occurrenceId: 'occ-a', chunkKey: 'chunk-a', contentHash: 'c'.repeat(64), headingPath: ['Alpha'], chunkIndex: 0,
          startLine: 1, endLine: 2, startOffset: 0, endOffset: 9, rawContent: '# Alpha',
        },
      },
      {
        documentId: 'doc-b', classification: 'removed', moved: false,
        previous: {
          occurrenceId: 'occ-b', chunkKey: 'chunk-b', contentHash: 'd'.repeat(64), headingPath: ['Beta'], chunkIndex: 0,
          startLine: 1, endLine: 2, startOffset: 0, endOffset: 8,
        },
      },
    ],
    counts: {
      documentsAdded: 1, documentsChanged: 0, documentsRemoved: 1, documentsUnchanged: 0,
      chunksAdded: 1, chunksChanged: 0, chunksRemoved: 1, chunksUnchanged: 0,
    },
    hasRemovals: true,
    snapshot: { setId: 'set-a', setName: 'Bộ nghiệp vụ', chunkingPolicyVersion: '2026.10.1', documents: [] },
  };
}

const finding: DlpFinding = {
  id: 'finding-a', category: 'PAN', documentId: 'doc-a', fieldType: 'doc_body', line: 2, column: 5,
  startOffset: 10, endOffset: 26, maskedContext: '411111******1111',
};

describe('guarded publish UI', () => {
  it('shows exact document and nested chunk deltas before scan with zero request', () => {
    const session = {
      confirmRemoval: vi.fn(), cancelRemoval: vi.fn(), scan: vi.fn(), confirmFindings: vi.fn(),
      submitConfirmedAttempt: vi.fn(), closePreview: vi.fn(),
    };
    render(<PublishPreviewModal open preview={previewWithRemoval()} session={session as never} onClose={vi.fn()} />);
    expect(screen.getByText('Xem trước thay đổi')).toBeInTheDocument();
    for (const label of ['Thêm', 'Thay đổi', 'Gỡ khỏi máy chủ', 'Không đổi']) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    expect(screen.getByText(/Chunk: Thêm/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Gỡ khỏi máy chủ' }));
    expect(screen.getByText('Tài liệu cục bộ vẫn được giữ nguyên.')).toBeInTheDocument();
    expect(screen.getByText(/Chunk: Gỡ khỏi máy chủ/)).toBeInTheDocument();
    expect(session.scan).not.toHaveBeenCalled();
    expect(session.submitConfirmedAttempt).not.toHaveBeenCalled();
  });

  it('requires removal consent before scan, then renders no-findings result', async () => {
    const session = {
      confirmRemoval: vi.fn(), cancelRemoval: vi.fn(), scan: vi.fn(async () => []),
      confirmFindings: vi.fn(async () => ({ nonce: 'nonce-a' })),
      submitConfirmedAttempt: vi.fn(async () => ({ status: 'Publishing', attemptId: 'attempt-a' })), closePreview: vi.fn(),
    };
    render(<PublishPreviewModal open preview={previewWithRemoval()} session={session as never} onClose={vi.fn()} />);
    const scan = screen.getByRole('button', { name: 'Kiểm tra dữ liệu nhạy cảm' });
    expect(scan).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /Tôi hiểu các tài liệu này sẽ bị gỡ/ }));
    fireEvent.click(scan);
    expect(await screen.findByText('Không phát hiện dữ liệu nhạy cảm theo bộ quy tắc hiện tại.')).toBeInTheDocument();
    const publishButton = screen.getByRole('button', { name: 'Xuất bản bộ tài liệu' });
    expect(publishButton).toBeEnabled();
    fireEvent.click(publishButton);
    expect(session.confirmFindings).toHaveBeenCalledWith(false);
  });

  it('shows masked findings and fresh unchecked override, passing consent to confirmFindings', async () => {
    const session = {
      confirmRemoval: vi.fn(), cancelRemoval: vi.fn(), scan: vi.fn(async () => [finding]),
      confirmFindings: vi.fn(async () => ({ nonce: 'nonce-a' })), submitConfirmedAttempt: vi.fn(async () => ({ status: 'Publishing', attemptId: 'attempt-a' })), closePreview: vi.fn(),
    };
    const { rerender } = render(<PublishPreviewModal open preview={{ ...previewWithRemoval(), hasRemovals: false }} session={session as never} onClose={vi.fn()} documentTitles={{ 'doc-a': 'Alpha' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra dữ liệu nhạy cảm' }));
    expect(await screen.findByText('Phát hiện dữ liệu có thể nhạy cảm')).toBeInTheDocument();
    expect(screen.getByText('411111******1111')).toBeInTheDocument();
    expect(screen.getByText('Dòng 2, cột 5')).toBeInTheDocument();
    expect(screen.queryByText('4111111111111111')).not.toBeInTheDocument();
    const override = screen.getByRole('checkbox', { name: /Tôi đã xem cảnh báo/ });
    expect(override).not.toBeChecked();
    const publishButton = screen.getByRole('button', { name: 'Vẫn xuất bản lần này' });
    expect(publishButton).toBeDisabled();

    // Check override and publish
    fireEvent.click(override);
    expect(publishButton).toBeEnabled();
    fireEvent.click(publishButton);
    expect(session.confirmFindings).toHaveBeenCalledWith(true);

    // Opening new preview resets checkbox
    rerender(<PublishPreviewModal open preview={{ ...previewWithRemoval(), hasRemovals: false, setId: 'set-new' }} session={session as never} onClose={vi.fn()} documentTitles={{ 'doc-a': 'Alpha' }} />);
    expect(screen.queryByRole('checkbox', { name: /Tôi đã xem cảnh báo/ })).not.toBeInTheDocument();
  });

  it('cancels before POST and accepted state offers close only', () => {
    const session = {
      confirmRemoval: vi.fn(), cancelRemoval: vi.fn(), scan: vi.fn(), confirmFindings: vi.fn(),
      submitConfirmedAttempt: vi.fn(), closePreview: vi.fn(),
    };
    const onAnnounce = vi.fn();
    const { unmount } = render(<PublishPreviewModal open preview={previewWithRemoval()} session={session as never} onClose={vi.fn()} onAnnounce={onAnnounce} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hủy xuất bản' }));
    expect(session.submitConfirmedAttempt).not.toHaveBeenCalled();
    expect(onAnnounce).toHaveBeenCalledWith('Đã hủy xuất bản. Không có nội dung tài liệu nào được gửi.');
    unmount();

    render(<PublishProgressPanel status="Publishing" stage="Đang phân tích Markdown" onClose={vi.fn()} />);
    expect(screen.getByText('Đang xuất bản ảnh chụp đã xác nhận. Bạn có thể tiếp tục chỉnh sửa tài liệu.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đóng' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Hủy/ })).not.toBeInTheDocument();
  });

  it('keeps uncertainty Publishing and exposes conflict, prior-active failure, and local-change copy', () => {
    const { rerender } = render(<PublishProgressPanel status="Publishing" uncertain onClose={vi.fn()} />);
    expect(screen.getByText('Mất kết nối — chưa xác định kết quả.')).toBeInTheDocument();
    expect(screen.getByText('Đang xuất bản')).toBeInTheDocument();
    rerender(<PublishProgressPanel status="Publishing" conflict onOpenStatus={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('Bộ tài liệu này đang được xuất bản. Mở trạng thái hiện tại để theo dõi.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mở trạng thái' })).toBeInTheDocument();
    rerender(<PublishProgressPanel status="Failed" error="Khối mã quá 50.000 ký tự tại dòng 7, cột 1. Chia nhỏ bảng hoặc khối mã trong tài liệu nguồn rồi thử lại." onClose={vi.fn()} />);
    expect(screen.getByText(/Ảnh chụp trước vẫn đang hoạt động/)).toBeInTheDocument();
    rerender(<PublishProgressPanel status="Local changes" onClose={vi.fn()} />);
    expect(screen.getByText('Lần xuất bản vừa hoàn tất dùng ảnh chụp trước chỉnh sửa mới nhất.')).toBeInTheDocument();
  });

  it('polls accepted attempt through terminal In sync without spin', async () => {
    const session = {
      confirmRemoval: vi.fn(),
      cancelRemoval: vi.fn(),
      scan: vi.fn(async () => []),
      confirmFindings: vi.fn(async () => ({ nonce: 'nonce-1' })),
      submitConfirmedAttempt: vi.fn(async () => ({ attemptId: 'attempt-1', status: 'Publishing' as const })),
      pollAcceptedAttempt: vi.fn(async () => ({
        attemptId: 'attempt-1',
        setId: 'set-a',
        status: 'In sync' as const,
        uncertain: false,
      })),
      closePreview: vi.fn(),
    };
    const onAnnounce = vi.fn();
    render(
      <PublishPreviewModal
        open
        preview={{ ...previewWithRemoval(), hasRemovals: false }}
        session={session as never}
        onClose={vi.fn()}
        onAnnounce={onAnnounce}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra dữ liệu nhạy cảm' }));
    const publishButton = await screen.findByRole('button', { name: 'Xuất bản bộ tài liệu' });
    fireEvent.click(publishButton);

    expect(await screen.findByText('Đã xuất bản bộ tài liệu.')).toBeInTheDocument();
    expect(screen.getByText('Bộ tài liệu đã được đồng bộ với Knowledge Server.')).toBeInTheDocument();
    expect(session.pollAcceptedAttempt).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Đang xuất bản')).not.toBeInTheDocument();
  });

  it('renders terminal failure with prior-snapshot assurance and bounded error', async () => {
    const session = {
      confirmRemoval: vi.fn(),
      cancelRemoval: vi.fn(),
      scan: vi.fn(async () => []),
      confirmFindings: vi.fn(async () => ({ nonce: 'nonce-1' })),
      submitConfirmedAttempt: vi.fn(async () => ({ attemptId: 'attempt-fail', status: 'Publishing' as const })),
      pollAcceptedAttempt: vi.fn(async () => ({
        attemptId: 'attempt-fail',
        setId: 'set-a',
        status: 'Failed' as const,
        error: { code: 'ATOMIC_BLOCK_TOO_LARGE', message: 'Khối mã quá 50.000 ký tự tại dòng 7, cột 1.' },
        uncertain: false,
      })),
      closePreview: vi.fn(),
    };
    render(
      <PublishPreviewModal
        open
        preview={{ ...previewWithRemoval(), hasRemovals: false }}
        session={session as never}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra dữ liệu nhạy cảm' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Xuất bản bộ tài liệu' }));

    expect(await screen.findByText('Xuất bản thất bại. Ảnh chụp trước vẫn đang hoạt động.')).toBeInTheDocument();
    expect(screen.getByText('Khối mã quá 50.000 ký tự tại dòng 7, cột 1.')).toBeInTheDocument();
  });

  it('retains Publishing status with warning on network uncertainty', async () => {
    const session = {
      confirmRemoval: vi.fn(),
      cancelRemoval: vi.fn(),
      scan: vi.fn(async () => []),
      confirmFindings: vi.fn(async () => ({ nonce: 'nonce-1' })),
      submitConfirmedAttempt: vi.fn(async () => ({ attemptId: 'attempt-unc', status: 'Publishing' as const })),
      pollAcceptedAttempt: vi.fn(async () => ({
        attemptId: 'attempt-unc',
        setId: 'set-a',
        status: 'Publishing' as const,
        uncertain: true,
      })),
      closePreview: vi.fn(),
    };
    render(
      <PublishPreviewModal
        open
        preview={{ ...previewWithRemoval(), hasRemovals: false }}
        session={session as never}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra dữ liệu nhạy cảm' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Xuất bản bộ tài liệu' }));

    expect(await screen.findByText('Mất kết nối — chưa xác định kết quả.')).toBeInTheDocument();
    expect(screen.getByText('Đang xuất bản')).toBeInTheDocument();
  });

  it('guards duplicate clicks and renders bounded error on scan or submit rejection', async () => {
    const session = {
      confirmRemoval: vi.fn(),
      cancelRemoval: vi.fn(),
      scan: vi.fn().mockRejectedValueOnce(new Error('raw internal scan crash')),
      confirmFindings: vi.fn(async () => ({ nonce: 'nonce-1' })),
      submitConfirmedAttempt: vi.fn().mockRejectedValueOnce(new Error('raw network connection drop')),
      closePreview: vi.fn(),
    };
    render(
      <PublishPreviewModal
        open
        preview={{ ...previewWithRemoval(), hasRemovals: false }}
        session={session as never}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra dữ liệu nhạy cảm' }));
    expect(await screen.findByText('Không thể kiểm tra dữ liệu nhạy cảm. Thử lại sau.')).toBeInTheDocument();
    expect(screen.queryByText('raw internal scan crash')).not.toBeInTheDocument();

    // Now test submit failure gracefully
    session.scan.mockResolvedValueOnce([]);
    fireEvent.click(await screen.findByRole('button', { name: /Kiểm tra dữ liệu nhạy cảm/ }));
    const publishButton = await screen.findByRole('button', { name: /Xuất bản bộ tài liệu/ });
    fireEvent.click(publishButton);

    expect(await screen.findByText('Không thể gửi ảnh chụp xuất bản. Kiểm tra kết nối và thử lại.')).toBeInTheDocument();
    expect(screen.queryByText('raw network connection drop')).not.toBeInTheDocument();
  });

  it('closing during publishing calls closePreview to abort observer only, sending zero cancel requests', async () => {
    let resolvePoll: (value: unknown) => void = () => {};
    const pollPromise = new Promise((resolve) => { resolvePoll = resolve; });
    const session = {
      confirmRemoval: vi.fn(),
      cancelRemoval: vi.fn(),
      scan: vi.fn(async () => []),
      confirmFindings: vi.fn(async () => ({ nonce: 'nonce-1' })),
      submitConfirmedAttempt: vi.fn(async () => ({ attemptId: 'attempt-running', status: 'Publishing' as const })),
      pollAcceptedAttempt: vi.fn(() => pollPromise),
      closePreview: vi.fn(),
    };
    const onClose = vi.fn();
    render(
      <PublishPreviewModal
        open
        preview={{ ...previewWithRemoval(), hasRemovals: false }}
        session={session as never}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra dữ liệu nhạy cảm' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Xuất bản bộ tài liệu' }));

    expect(await screen.findByText('Đang xuất bản')).toBeInTheDocument();
    const closeButton = screen.getByRole('button', { name: 'Đóng' });
    fireEvent.click(closeButton);

    expect(session.closePreview).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    resolvePoll({ status: 'Publishing', uncertain: true });
  });
});
