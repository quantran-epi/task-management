// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db';
import { createNote } from '../../src/db/repositories/noteRepo';
import { NotesView } from '../../src/views/NotesView';
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

const databases: TaskPlannerDatabase[] = [];

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(databases.splice(0).map((database) => database.delete()));
});

describe('Docs knowledge management integration', () => {
  it('opens and closes one document-set drawer and restores focus', async () => {
    const database = new TaskPlannerDatabase(`notes-knowledge-${crypto.randomUUID()}`);
    databases.push(database);
    await database.open();
    render(<NotesView db={database} />);

    const trigger = await screen.findByRole('button', { name: 'Bộ tài liệu' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(await screen.findByRole('heading', { name: 'Bộ tài liệu xuất bản' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'Bộ tài liệu xuất bản' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('keeps cached status visible and marks edits after accepted snapshot as local changes', async () => {
    vi.useFakeTimers();
    const database = new TaskPlannerDatabase(`notes-status-${crypto.randomUUID()}`);
    databases.push(database);
    await database.open();
    const created = await createNote({ title: note.title, body: note.body, type: 'document' }, database);
    await database.documentSets.add({
      id: 'set-a', name: 'Bộ nghiệp vụ', documentIds: [created.id], createdAt: NOW, updatedAt: NOW,
    });
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(note.body));
    const publishedContentHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    await database.publishedDocuments.add({
      setId: 'set-a', documentId: created.id, lastKnownRemoteAt: NOW, publishedContentHash, lastPrimaryState: 'In sync',
    });

    render(<NotesView db={database} />);
    fireEvent.click((await screen.findAllByText(note.title))[0]!);
    expect(await screen.findAllByLabelText('Trạng thái xuất bản: Đã đồng bộ')).not.toHaveLength(0);
    fireEvent.change(screen.getByPlaceholderText(/Nhập nội dung Markdown/), {
      target: { value: `${note.body}\nChỉnh sửa sau ảnh chụp`, selectionStart: 40 },
    });
    await vi.advanceTimersByTimeAsync(500);
    await waitFor(() => expect(screen.getAllByLabelText('Trạng thái xuất bản: Có thay đổi cục bộ').length).toBeGreaterThan(0));
    expect(await database.notes.get(created.id)).toMatchObject({ body: `${note.body}\nChỉnh sửa sau ảnh chụp` });
  });
});
