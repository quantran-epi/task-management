import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../../src/db';
import { QuickNoteEntry } from '../../../src/components/notes/QuickNoteEntry';

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
});
