// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../db';
import { createNote } from '../../db/repositories/noteRepo';
import { DocsExplorer } from '../toolwindows/DocsExplorer';
import { useLayoutStore } from '../store/layoutStore';
import * as exportFolderZip from '../../utils/exportFolderZip';

vi.mock('../../utils/exportFolderZip', () => ({
  exportFolderAsZip: vi.fn().mockResolvedValue(undefined),
  downloadFolderAsZip: vi.fn().mockResolvedValue(undefined),
  getFolderDescendantNotes: vi.fn().mockReturnValue({ docs: [], folders: [] }),
}));

describe('DocsExplorer folder ZIP download', () => {
  let db: TaskPlannerDatabase;

  beforeEach(() => {
    db = new TaskPlannerDatabase(`TestDB_${Math.random()}`);
    useLayoutStore.getState().resetLayout();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('offers Tải thư mục (ZIP) on a folder row and calls downloadFolderAsZip', async () => {
    const folder = await createNote({ title: 'Dự án A', body: '', type: 'folder' }, db);
    await createNote(
      { title: 'Tài liệu con', body: '# Nội dung', type: 'document', parentId: folder.id },
      db
    );

    render(<DocsExplorer db={db} />);

    const rowTitle = await screen.findByText('Dự án A');
    const row = rowTitle.closest('.doc-folder-item') as HTMLElement;
    expect(row).not.toBeNull();

    const buttons = row.querySelectorAll('button');
    fireEvent.click(buttons[buttons.length - 1] as HTMLButtonElement);

    const downloadItem = await screen.findByText('Tải thư mục (ZIP)');
    fireEvent.click(downloadItem);

    await waitFor(() => {
      expect(exportFolderZip.downloadFolderAsZip).toHaveBeenCalledTimes(1);
    });

    const [calledFolder, calledNotes] = vi.mocked(exportFolderZip.downloadFolderAsZip).mock.calls[0]!;
    expect(calledFolder.id).toBe(folder.id);
    expect(calledNotes.some((n) => n.title === 'Tài liệu con')).toBe(true);
  });
});
