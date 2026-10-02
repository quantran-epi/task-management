import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../src/db';
import { NotesPopoutView } from '../../src/views/NotesPopoutView';
import * as notesPopout from '../../src/utils/notesPopout';

describe('NotesPopoutView', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`TestNotesPopoutDB_${Date.now()}_${Math.random()}`);
    await db.open();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('closes current notes popout from header close button', async () => {
    const closeSpy = vi.spyOn(notesPopout, 'closeCurrentNotesPopoutWindow').mockResolvedValue(undefined);

    render(<NotesPopoutView db={db} />);

    fireEvent.click(screen.getByRole('button', { name: 'Đóng cửa sổ' }));

    await waitFor(() => {
      expect(closeSpy).toHaveBeenCalled();
    });
  });
});
