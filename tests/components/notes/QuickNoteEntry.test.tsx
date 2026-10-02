import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../../src/db';
import { QuickNoteEntry } from '../../../src/components/notes/QuickNoteEntry';
import * as screenshotCapture from '../../../src/utils/screenshotCapture';

describe('QuickNoteEntry', () => {
  it('creates linked note on Enter, keeps Shift+Enter, and ignores empty text', async () => {
    const db = new TaskPlannerDatabase(`quick-note-${crypto.randomUUID()}`);
    await db.open();
    const onCreated = vi.fn();
    render(
      <QuickNoteEntry
        db={db}
        defaultEntityType="task"
        defaultEntityId="11111111-1111-4111-8111-111111111111"
        onCreated={onCreated}
      />
    );
    const input = screen.getByPlaceholderText('Ghi chú nhanh...');

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await db.notes.count()).toBe(0);

    fireEvent.change(input, { target: { value: 'line one' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(await db.notes.count()).toBe(0);

    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onCreated).toHaveBeenCalledOnce());
    expect(await db.notes.toArray()).toEqual([
      expect.objectContaining({
        body: 'line one',
        entityType: 'task',
        entityId: '11111111-1111-4111-8111-111111111111',
      }),
    ]);
    await db.delete();
  });

  it('clicking screenshot button directly creates note with screenshot without modal', async () => {
    const db = new TaskPlannerDatabase(`quick-note-screenshot-${crypto.randomUUID()}`);
    await db.open();
    const onCreated = vi.fn();

    const mockFile = new File(['mock-image-content'], 'test-shot.png', { type: 'image/png' });
    vi.spyOn(screenshotCapture, 'captureFocusedWindowScreenshot').mockResolvedValue(mockFile);

    render(
      <QuickNoteEntry
        db={db}
        defaultEntityType="project"
        defaultEntityId="22222222-2222-4222-8222-222222222222"
        onCreated={onCreated}
      />
    );

    const screenshotBtn = screen.getByRole('button', { name: /chụp màn hình/i });
    fireEvent.click(screenshotBtn);

    await waitFor(() => expect(onCreated).toHaveBeenCalledOnce());
    const notes = await db.notes.toArray();
    expect(notes.length).toBe(1);
    expect(notes[0]?.entityType).toBe('project');
    expect(notes[0]?.entityId).toBe('22222222-2222-4222-8222-222222222222');

    const attachments = await db.noteAttachments.where('noteId').equals(notes[0]!.id).toArray();
    expect(attachments.length).toBe(1);
    expect(attachments[0]?.fileName).toBe('test-shot.png');

    await db.delete();
  });

  it('pasting image directly creates note with attachment', async () => {
    const db = new TaskPlannerDatabase(`quick-note-paste-${crypto.randomUUID()}`);
    await db.open();
    const onCreated = vi.fn();

    render(
      <QuickNoteEntry
        db={db}
        onCreated={onCreated}
      />
    );

    const input = screen.getByPlaceholderText('Ghi chú nhanh...');
    const mockFile = new File(['pasted-data'], 'pasted.png', { type: 'image/png' });

    fireEvent.paste(input, {
      clipboardData: {
        items: [
          {
            type: 'image/png',
            getAsFile: () => mockFile,
          },
        ],
      },
    });

    await waitFor(() => expect(onCreated).toHaveBeenCalledOnce());
    const notes = await db.notes.toArray();
    expect(notes.length).toBe(1);

    const attachments = await db.noteAttachments.where('noteId').equals(notes[0]!.id).toArray();
    expect(attachments.length).toBe(1);
    expect(attachments[0]?.fileName).toBe('pasted.png');

    await db.delete();
  });
});
