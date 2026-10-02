import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../../src/db';
import { NoteDetailModal } from '../../../src/components/notes/NoteDetailModal';
import type { Note } from '../../../src/types/models';

describe('NoteDetailModal', () => {
  let db: TaskPlannerDatabase;
  const note: Note = {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Release note',
    body: '**Safe body**',
    isPinned: false,
    entityType: 'task',
    entityId: '22222222-2222-4222-8222-222222222222',
    createdAt: '2026-10-02T00:00:00.000Z',
    updatedAt: '2026-10-02T01:00:00.000Z',
  };

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`note-detail-${crypto.randomUUID()}`);
    await db.open();
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(async () => db.delete());

  it('renders safe note detail, attachment preview, and edit action', async () => {
    await db.noteAttachments.add({
      id: '33333333-3333-4333-8333-333333333333',
      noteId: note.id,
      fileName: 'capture.png',
      mimeType: 'image/png',
      sizeBytes: 4,
      createdAt: note.createdAt,
      data: new Blob(['png'], { type: 'image/png' }),
    });
    const onEdit = vi.fn();

    render(
      <NoteDetailModal open note={note} onClose={vi.fn()} onEdit={onEdit} db={db} />
    );

    expect(screen.getByText('Release note')).toBeInTheDocument();
    expect(screen.getByText('Safe body')).toBeInTheDocument();
    expect(await screen.findByAltText('capture.png')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thêm ảnh' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa đầy đủ' }));
    await waitFor(() => expect(onEdit).toHaveBeenCalledWith(note));
  });
});
