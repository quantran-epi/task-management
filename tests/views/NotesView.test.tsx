import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { NotesView } from '../../src/views/NotesView';
import { TaskPlannerDatabase } from '../../src/db/index';
import { createNote } from '../../src/db/repositories/noteRepo';

describe('NotesView 2-Column Document Workspace', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    localStorage.clear();
    testDb = new TaskPlannerDatabase('TestNotesView_' + Math.random().toString(36).slice(2));
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('renders standard PageHeader and 2-column layout components', async () => {
    render(<NotesView db={testDb} />);

    expect(await screen.findByText('Ghi chú & Tài liệu')).toBeInTheDocument();
    // 2-column tree elements
    expect(screen.getByText('Tạo tài liệu')).toBeInTheDocument();
    expect(screen.getByText('Đã ghim')).toBeInTheDocument();
    expect(screen.getByText('Ghi chú nhanh')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Tìm kiếm tài liệu (BM25)...')).toBeInTheDocument();
    // Empty state when no document is selected
    expect(screen.getByText('Chưa chọn tài liệu')).toBeInTheDocument();
  });

  it('renders DocFolderTree with special folders and counts', async () => {
    // Seed docs
    await createNote({ title: 'Inbox Doc', body: '# Inbox\nHello', type: 'document' }, testDb);
    await createNote({ title: 'Pinned Doc', body: 'Pinned', isPinned: true, type: 'document' }, testDb);
    await createNote({ title: 'Quick Sticky', body: 'Quick note', type: 'quick_note' }, testDb);

    render(<NotesView db={testDb} />);

    expect(await screen.findByText('Đã ghim')).toBeInTheDocument();
    expect(screen.getByText('Ghi chú nhanh')).toBeInTheDocument();
    expect(screen.getByText('Thùng rác')).toBeInTheDocument();
  });

  it('selects document from tree and opens in DocEditorPane', async () => {
    await createNote({ title: 'Design Specs', body: '# Design Specs\nUI Guidelines here', type: 'document' }, testDb);
    await createNote({ title: 'Meeting Notes', body: 'Discuss sprint goals', type: 'document' }, testDb);

    render(<NotesView db={testDb} />);

    // Wait until docs render in tree
    await waitFor(() => {
      expect(screen.getByText('Tài liệu chung (Chưa phân loại)')).toBeInTheDocument();
    });

    // Expand root_docs
    fireEvent.click(screen.getByText('Tài liệu chung (Chưa phân loại)'));

    await waitFor(() => {
      expect(screen.getByText('Design Specs')).toBeInTheDocument();
      expect(screen.getByText('Meeting Notes')).toBeInTheDocument();
    });

    // Initially shows empty state
    expect(screen.getByText('Chưa chọn tài liệu')).toBeInTheDocument();

    // Click on Design Specs in tree to select it
    const designItem = screen.getByText('Design Specs');
    fireEvent.click(designItem);

    // Editor displays selected document title input
    await waitFor(() => {
      const titleInputs = screen.getAllByDisplayValue('Design Specs');
      expect(titleInputs.length).toBeGreaterThan(0);
    });
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

    fireEvent.click(createBtns[0]!);

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
    fireEvent.click(createBtns[0]!);

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

  it('supports BM25 search in tree panel to filter documents', async () => {
    await createNote({
      title: 'Kế hoạch phát triển 2026',
      body: 'Tài liệu kiến trúc hệ thống và hướng dẫn API chi tiết',
      tags: ['kien-truc'],
      type: 'document',
    }, testDb);

    await createNote({
      title: 'Báo cáo tài chính quý 1',
      body: 'Ngân sách và kế hoạch chi tiêu hàng tháng',
      tags: ['tai-chinh'],
      type: 'document',
    }, testDb);

    render(<NotesView db={testDb} />);

    // Wait until tree renders
    await waitFor(() => {
      expect(screen.getByText('Tài liệu chung (Chưa phân loại)')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Tìm kiếm tài liệu (BM25)...');

    // Search for "tài chính"
    fireEvent.change(searchInput, { target: { value: 'tài chính' } });

    await waitFor(() => {
      expect(screen.getByText('Báo cáo tài chính quý 1')).toBeInTheDocument();
      expect(screen.queryByText('Kế hoạch phát triển 2026')).not.toBeInTheDocument();
    });

    // Click search result opens in editor
    fireEvent.click(screen.getByText('Báo cáo tài chính quý 1'));

    await waitFor(() => {
      const titleInputs = screen.getAllByDisplayValue('Báo cáo tài chính quý 1');
      expect(titleInputs.length).toBeGreaterThan(0);
    });
  });

  it('selects and focuses document when initialDocId is provided', async () => {
    const note = await createNote(
      { title: 'Tài liệu hướng dẫn', body: 'Nội dung chi tiết', type: 'document' },
      testDb
    );

    render(<NotesView db={testDb} initialDocId={note.id} />);

    await waitFor(() => {
      const titleInputs = screen.getAllByDisplayValue('Tài liệu hướng dẫn');
      expect(titleInputs.length).toBeGreaterThan(0);
    });
  });
});
