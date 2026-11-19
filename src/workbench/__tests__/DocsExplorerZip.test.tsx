// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../db';
import { createNote } from '../../db/repositories/noteRepo';
import { DocsExplorer } from '../toolwindows/DocsExplorer';
import { useLayoutStore } from '../store/layoutStore';
import * as exportFolderZip from '../../utils/exportFolderZip';
import JSZip from 'jszip';
import { AI_KNOWLEDGE_DOC_PROMPT } from '../../components/notes/DocsLibraryActions';

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
    useLayoutStore.setState({ openTabs: [], activeTabId: null });
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('opens the dedicated set library tab from the compact toolbar', async () => {
    render(<DocsExplorer db={db} />);

    expect(screen.getByTestId('docs-set-workspace')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bộ tài liệu' }));
    expect(useLayoutStore.getState().openTabs.some((tab) => tab.viewType === 'doc_set_library')).toBe(true);
    await waitFor(() =>
      expect(useLayoutStore.getState().openTabs.some((tab) => tab.viewType === 'notes')).toBe(false)
    );
  });

  it('opens and copies the standard AI prompt without a document tab', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    try {
      render(<DocsExplorer db={db} />);

      fireEvent.click(screen.getByRole('button', { name: /Prompt AI/ }));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByRole('textbox')).toHaveValue(AI_KNOWLEDGE_DOC_PROMPT);
      fireEvent.click(screen.getByRole('button', { name: 'Sao chép prompt' }));
      expect(writeText).toHaveBeenCalledWith(AI_KNOWLEDGE_DOC_PROMPT);
    } finally {
      if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('imports ZIP from the explorer only after preview confirmation and preserves folders and tags', async () => {
    const zip = new JSZip();
    zip.file('root.md', '# Tài liệu gốc\n\n#project\n\nNội dung gốc');
    zip.file('nested/child.md', '# Tài liệu con\n\n#nested\n\nNội dung con');
    const file = new File([await zip.generateAsync({ type: 'arraybuffer' })], 'import.zip', { type: 'application/zip' });
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click');
    try {
      const { container } = render(<DocsExplorer db={db} />);
      fireEvent.click(screen.getByRole('button', { name: /Nhập Zip/ }));
      const input = container.querySelector('input[type="file"][accept=".zip"]') as HTMLInputElement;
      expect(clickSpy.mock.contexts).toContain(input);
      fireEvent.change(input, { target: { files: [file] } });

      const confirm = await screen.findByRole('button', { name: /Nhập\s*2\s*tài liệu đã chọn/ }, { timeout: 5000 });
      expect(await db.notes.count()).toBe(0);
      fireEvent.click(confirm);

      await waitFor(async () => expect(await db.notes.count()).toBe(4));
      const notes = await db.notes.toArray();
      const rootFolder = notes.find((note) => note.type === 'folder' && note.title === 'import')!;
      const nestedFolder = notes.find((note) => note.type === 'folder' && note.title === 'nested')!;
      const rootDoc = notes.find((note) => note.title === 'Tài liệu gốc')!;
      const childDoc = notes.find((note) => note.title === 'Tài liệu con')!;
      expect(nestedFolder.parentId).toBe(rootFolder.id);
      expect(rootDoc.parentId).toBe(rootFolder.id);
      expect(childDoc.parentId).toBe(nestedFolder.id);
      expect(rootDoc.tags).toContain('project');
      expect(childDoc.tags).toContain('nested');
      await waitFor(() => expect(screen.getByTitle('import').closest('.doc-folder-item')).toHaveStyle({ fontWeight: 600 }));
    } finally {
      clickSpy.mockRestore();
    }
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
