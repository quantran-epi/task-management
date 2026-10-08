// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DocumentSetForm, snapshotFolderMembers } from '../../src/components/knowledge/DocumentSetForm';
import { AttemptHistoryList } from '../../src/components/knowledge/AttemptHistoryList';
import { DocumentSetDrawer, publishStateLabel } from '../../src/components/knowledge/DocumentSetDrawer';
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
    expect(screen.getByText('Tài liệu thêm hoặc di chuyển sau này không tự thay đổi bộ này.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    expect(onSave).toHaveBeenLastCalledWith({ name: 'x'.repeat(120), documentIds: ['doc-a', 'doc-b'] });

    rerender(<DocumentSetForm notes={notes} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText('Tên bộ tài liệu'), { target: { value: 'Bộ trống' } });
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
    expect(screen.getByText(/SAFE_CODE/)).toBeVisible();
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
    expect(screen.getByText('Đang xuất bản')).toBeVisible();
    expect(screen.getByText('2 tài liệu trong ảnh chụp đang hoạt động')).toBeVisible();
    expect(screen.getByText(`Dữ liệu trạng thái gần nhất: ${NOW}`)).toBeVisible();
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
    expect(screen.getByText('Chưa cấu hình Knowledge Server.')).toBeVisible();
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
