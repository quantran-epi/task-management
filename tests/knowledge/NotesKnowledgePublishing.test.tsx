// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DocPublishBadge } from '../../src/components/knowledge/DocPublishBadge';
import { DocEditorPane } from '../../src/components/notes/DocEditorPane';
import { DocListPane } from '../../src/components/notes/DocListPane';
import type { DocumentPublishStatus } from '../../src/db/repositories/documentSetRepo';
import type { Note, PublishPrimaryState } from '../../src/types/models';

const NOW = '2026-10-08T08:00:00.000Z';

const note: Note = {
  id: 'doc-a',
  type: 'document',
  title: 'Quy trình thẻ',
  body: '# Quy trình thẻ',
  tags: [],
  isPinned: false,
  createdAt: NOW,
  updatedAt: NOW,
};

function status(
  aggregateState: PublishPrimaryState,
  containingSets = [{ setId: 'set-a', setName: 'Bộ nghiệp vụ', state: aggregateState }],
): DocumentPublishStatus {
  return { documentId: note.id, aggregateState, containingSets };
}

describe('document publish badges', () => {
  it.each([
    ['Never published', 'Chưa xuất bản'],
    ['In sync', 'Đã đồng bộ'],
    ['Local changes', 'Có thay đổi cục bộ'],
    ['Publishing', 'Đang xuất bản'],
    ['Warning', 'Cảnh báo'],
    ['Failed', 'Thất bại'],
  ] as const)('renders %s with icon and visible text on desktop', (state, label) => {
    const { container } = render(<DocPublishBadge status={status(state)} compact={false} />);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(container.querySelector('.anticon')).toBeInTheDocument();
    expect(screen.getByLabelText(`Trạng thái xuất bản: ${label}`)).toBeInTheDocument();
  });

  it('uses aggregate priority and lists every containing set/state without content', async () => {
    render(
      <DocPublishBadge
        status={status('Failed', [
          { setId: 'set-sync', setName: 'Bộ đồng bộ', state: 'In sync' },
          { setId: 'set-failed', setName: 'Bộ lỗi', state: 'Failed' },
          { setId: 'set-local', setName: 'Bộ đang sửa', state: 'Local changes' },
        ])}
        compact={false}
      />,
    );
    fireEvent.mouseOver(screen.getByLabelText('Trạng thái xuất bản: Thất bại'));
    expect(await screen.findByText('Bộ đồng bộ: Đã đồng bộ')).toBeInTheDocument();
    expect(screen.getByText('Bộ lỗi: Thất bại')).toBeInTheDocument();
    expect(screen.getByText('Bộ đang sửa: Có thay đổi cục bộ')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(note.body);
  });

  it('renders accessible icon-only compact form below desktop width', () => {
    const { container } = render(<DocPublishBadge status={status('Warning')} compact />);
    expect(screen.getByLabelText('Trạng thái xuất bản: Cảnh báo')).toBeInTheDocument();
    expect(screen.queryByText('Cảnh báo')).not.toBeInTheDocument();
    expect(container.querySelector('.anticon')).toBeInTheDocument();
  });

  it('places list badge before date without changing row keyboard selection', () => {
    const onSelectDoc = vi.fn();
    render(
      <DocListPane
        notes={[note]}
        publishStatuses={{ [note.id]: status('Local changes') }}
        compactPublishBadges={false}
        onSelectDoc={onSelectDoc}
      />,
    );
    const row = screen.getByText(note.title).closest('[role="button"]');
    expect(row).not.toBeNull();
    const badge = within(row as HTMLElement).getByLabelText('Trạng thái xuất bản: Có thay đổi cục bộ');
    const date = within(row as HTMLElement).getByText(new Date(NOW).toLocaleDateString('vi-VN'));
    expect(badge.compareDocumentPosition(date) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.keyDown(row as HTMLElement, { key: 'Enter' });
    expect(onSelectDoc).toHaveBeenCalledWith(note);
  });

  it('keeps editor publish state separate from local save state and preserves 500ms autosave', async () => {
    vi.useFakeTimers();
    const onUpdateDoc = vi.fn().mockResolvedValue(undefined);
    render(
      <DocEditorPane
        doc={note}
        publishStatus={status('In sync')}
        compactPublishBadge={false}
        onUpdateDoc={onUpdateDoc}
      />,
    );
    const footer = screen.getByTestId('doc-editor-status');
    expect(within(footer).getByLabelText('Trạng thái xuất bản: Đã đồng bộ')).toBeInTheDocument();
    expect(within(footer).getByText(/Đã lưu lúc/)).toBeInTheDocument();
    expect(within(footer).getByText(/Đã lưu lúc/)).not.toBe(within(footer).getByLabelText('Trạng thái xuất bản: Đã đồng bộ'));

    fireEvent.change(screen.getByPlaceholderText(/Nhập nội dung Markdown/), {
      target: { value: '# Quy trình thẻ\nNội dung mới', selectionStart: 33 },
    });
    expect(onUpdateDoc).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(onUpdateDoc).toHaveBeenCalledWith(note.id, expect.objectContaining({ body: '# Quy trình thẻ\nNội dung mới' }));
    vi.useRealTimers();
  });
});
