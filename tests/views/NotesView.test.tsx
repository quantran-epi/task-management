import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { NotesView } from '../../src/views/NotesView';
import { TaskPlannerDatabase } from '../../src/db/index';
import { createNote } from '../../src/db/repositories/noteRepo';

describe('NotesView 3-Column Document Workspace', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    localStorage.clear();
    testDb = new TaskPlannerDatabase('TestNotesView_' + Math.random().toString(36).slice(2));
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('renders standard PageHeader and 3-column layout components', async () => {
    render(<NotesView db={testDb} />);

    expect(await screen.findByText('Ghi chú & Tài liệu')).toBeInTheDocument();
    // 3-column elements
    expect(screen.getByText('Tạo tài liệu')).toBeInTheDocument();
    expect(screen.getByText('Tất cả tài liệu')).toBeInTheDocument();
    expect(screen.getByText('Inbox')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Tìm trong danh sách...')).toBeInTheDocument();
  });

  it('renders DocFolderTree with quick filters and counts', async () => {
    // Seed docs
    await createNote({ title: 'Inbox Doc', body: '# Inbox\nHello', type: 'document' }, testDb);
    await createNote({ title: 'Pinned Doc', body: 'Pinned', isPinned: true, type: 'document' }, testDb);
    await createNote({ title: 'Quick Sticky', body: 'Quick note', type: 'quick_note' }, testDb);

    render(<NotesView db={testDb} />);

    expect((await screen.findAllByText('Inbox Doc')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pinned Doc').length).toBeGreaterThan(0);
    expect(screen.getByText('Tất cả tài liệu')).toBeInTheDocument();
    expect(screen.getByText('Ghi chú nhanh')).toBeInTheDocument();
    expect(screen.getByText('Thùng rác')).toBeInTheDocument();
  });

  it('filters documents in DocListPane and displays selection in DocEditorPane', async () => {
    await createNote({ title: 'Design Specs', body: '# Design Specs\nUI Guidelines here', type: 'document' }, testDb);
    await createNote({ title: 'Meeting Notes', body: 'Discuss sprint goals without title heading', type: 'document' }, testDb);

    render(<NotesView db={testDb} />);

    // Wait until docs render in list pane
    await waitFor(() => {
      const designElements = screen.getAllByText('Design Specs');
      expect(designElements.length).toBeGreaterThan(0);
      expect(screen.getAllByText('Meeting Notes').length).toBeGreaterThan(0);
    });

    // Click on Design Specs in doc list to select it
    const listItems = screen.getAllByText('Design Specs');
    if (listItems[0]) {
      fireEvent.click(listItems[0]);
    }

    // Search filter
    const searchInput = screen.getByPlaceholderText('Tìm trong danh sách...');
    fireEvent.change(searchInput, { target: { value: 'Design' } });

    await waitFor(() => {
      const designElements = screen.getAllByText('Design Specs');
      expect(designElements.length).toBeGreaterThan(0);
      expect(screen.queryByText('Meeting Notes')).not.toBeInTheDocument();
    });

    // Editor displays selected document title input
    await waitFor(() => {
      const titleInputs = screen.getAllByDisplayValue('Design Specs');
      expect(titleInputs.length).toBeGreaterThan(0);
    });
  });

  it('switches between 3-Column Docs and Grid View mode', async () => {
    await createNote({ title: 'Sample Grid Note', body: 'Body content', type: 'document' }, testDb);

    render(<NotesView db={testDb} />);

    expect(await screen.findByText('Tạo tài liệu')).toBeInTheDocument();

    // Click segmented switch to Grid View
    const gridBtn = screen.getByText('Ghi chú nhanh (Grid)');
    fireEvent.click(gridBtn);

    // Grid view renders legacy "Tạo ghi chú" CTA
    expect(await screen.findByText('Tạo ghi chú')).toBeInTheDocument();
  });

  it('renders visible AI document instructions button, opens modal, and copies prompt to clipboard', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<NotesView db={testDb} />);

    const openPromptBtn = await screen.findByRole('button', { name: /prompt ai/i });
    expect(openPromptBtn).toBeInTheDocument();

    fireEvent.click(openPromptBtn);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(/hướng dẫn ai tạo tài liệu/i)).toBeInTheDocument();

    const textarea = dialog.querySelector('textarea') as HTMLTextAreaElement | null;
    expect(textarea).not.toBeNull();
    const promptValue = textarea?.value || '';

    const expectedSnippets = [
      '# Tiêu đề tài liệu',
      '#tag-one',
      'H2/H3',
      'Sources',
      'YYYY-MM-DD',
      'YAML frontmatter',
      'secret',
    ];

    for (const snippet of expectedSnippets) {
      expect(promptValue.toLowerCase()).toContain(snippet.toLowerCase());
    }

    const copyBtn = screen.getByRole('button', { name: /sao chép prompt/i });
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledTimes(1);
    });

    const copiedPayload = writeTextMock.mock.calls[0]?.[0] as string;
    expect(copiedPayload).toContain('# Tiêu đề tài liệu');
    expect(copiedPayload).toContain('YAML frontmatter');
    expect(copiedPayload).toContain('secret');
    expect(await screen.findByText(/đã sao chép prompt/i)).toBeInTheDocument();
  });

  it('creates quick_note when in quick_notes view filter', async () => {
    render(<NotesView db={testDb} />);

    // Switch to quick notes filter
    const quickNotesFilterBtn = await screen.findByText('Ghi chú nhanh');
    fireEvent.click(quickNotesFilterBtn);

    // Primary create button in tree label becomes "Tạo ghi chú nhanh"
    const createBtns = await screen.findAllByRole('button', { name: /tạo ghi chú nhanh/i });
    expect(createBtns.length).toBeGreaterThan(0);

    fireEvent.click(createBtns[0]);

    await waitFor(async () => {
      const allNotes = await testDb.notes.toArray();
      const createdQuickNote = allNotes.find((n) => n.type === 'quick_note');
      expect(createdQuickNote).toBeDefined();
      expect(createdQuickNote?.title).toBe('Ghi chú nhanh mới');
      expect(createdQuickNote?.body).toBe('');
    });
  });

  it('creates document with RECOMMENDED_DOC_TEMPLATE when in document view', async () => {
    render(<NotesView db={testDb} />);

    // Click "Tạo tài liệu"
    const createBtns = await screen.findAllByRole('button', { name: /tạo tài liệu/i });
    expect(createBtns.length).toBeGreaterThan(0);
    fireEvent.click(createBtns[0]);

    await waitFor(async () => {
      const allNotes = await testDb.notes.toArray();
      const createdDoc = allNotes.find((n) => n.type === 'document');
      expect(createdDoc).toBeDefined();
      expect(createdDoc?.title).toBe('Tài liệu mới');
      expect(createdDoc?.body).toContain('## Tóm tắt');
      expect(createdDoc?.body).toContain('## Phạm vi');
      expect(createdDoc?.body).toContain('## Quy tắc');
      expect(createdDoc?.body).toContain('## Nguồn');
    });
  });
});
