import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DocFolderTree } from '../../../src/components/notes/DocFolderTree';
import type { Note } from '../../../src/types/models';

describe('DocFolderTree Component', () => {
  const mockNotes: Note[] = [
    {
      id: 'folder-1',
      title: 'Kỹ thuật & Kiến trúc',
      body: '',
      type: 'folder',
      isPinned: false,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    },
    {
      id: 'doc-1',
      title: 'Database Schema Spec',
      body: '# Database Schema',
      type: 'document',
      parentId: 'folder-1',
      isPinned: false,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    },
    {
      id: 'doc-inbox',
      title: 'Inbox Document',
      body: '# Inbox',
      type: 'document',
      isPinned: false,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    },
  ];

  it('renders special folders and user folder items with badge counts', () => {
    render(
      <DocFolderTree
        notes={mockNotes}
        activeFilter="root_docs"
        onSelectFilter={vi.fn()}
        onCreateDoc={vi.fn()}
      />
    );

    expect(screen.getByText('Đã ghim')).toBeInTheDocument();
    expect(screen.getByText('Ghi chú nhanh')).toBeInTheDocument();
    expect(screen.getByText('Thùng rác')).toBeInTheDocument();
    expect(screen.getByText('Kỹ thuật & Kiến trúc')).toBeInTheDocument();
  });

  it('selects folder and expands it when folder row is clicked, without triggering onSelectDoc', () => {
    const handleSelectFilter = vi.fn();
    const handleSelectDoc = vi.fn();
    render(
      <DocFolderTree
        notes={mockNotes}
        activeFilter="inbox"
        onSelectFilter={handleSelectFilter}
        onSelectDoc={handleSelectDoc}
        onCreateDoc={vi.fn()}
      />
    );

    const folderRow = screen.getByText('Kỹ thuật & Kiến trúc');
    fireEvent.click(folderRow);
    expect(handleSelectFilter).toHaveBeenCalledWith('folder-1');
    expect(handleSelectDoc).not.toHaveBeenCalled();

    // After expanding folder, child doc becomes visible
    expect(screen.getByText('Database Schema Spec')).toBeInTheDocument();
  });

  it('calls onSelectDoc when document inside folder is clicked', () => {
    const handleSelectDoc = vi.fn();
    render(
      <DocFolderTree
        notes={mockNotes}
        activeFilter="folder-1"
        onSelectFilter={vi.fn()}
        onSelectDoc={handleSelectDoc}
        onCreateDoc={vi.fn()}
      />
    );

    // Click folder to expand
    const folderRow = screen.getByText('Kỹ thuật & Kiến trúc');
    fireEvent.click(folderRow);

    const docItem = screen.getByText('Database Schema Spec');
    fireEvent.click(docItem);

    expect(handleSelectDoc).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'doc-1', title: 'Database Schema Spec' })
    );
  });

  it('triggers onCreateDoc with target folder id when clicking folder add button', () => {
    const handleCreateDoc = vi.fn();
    render(
      <DocFolderTree
        notes={mockNotes}
        activeFilter="inbox"
        onSelectFilter={vi.fn()}
        onCreateDoc={handleCreateDoc}
      />
    );

    // Find the quick add doc button inside the folder row
    const folderItem = screen.getByText('Kỹ thuật & Kiến trúc').closest('.doc-folder-item');
    expect(folderItem).toBeInTheDocument();

    const quickAddBtn = folderItem?.querySelector('button');
    expect(quickAddBtn).toBeInTheDocument();
    if (quickAddBtn) {
      fireEvent.click(quickAddBtn);
      expect(handleCreateDoc).toHaveBeenCalledWith('folder-1');
    }
  });

  it('opens new folder modal and triggers onCreateFolder', () => {
    const handleCreateFolder = vi.fn();
    render(
      <DocFolderTree
        notes={mockNotes}
        activeFilter="inbox"
        onSelectFilter={vi.fn()}
        onCreateDoc={vi.fn()}
        onCreateFolder={handleCreateFolder}
      />
    );

    // Click the top folder create button (button containing folder-add icon)
    const folderButtons = screen.getAllByRole('button');
    const folderIconBtn = folderButtons.find((btn) => btn.querySelector('.anticon-folder-add'));
    expect(folderIconBtn).toBeDefined();

    if (folderIconBtn) {
      fireEvent.click(folderIconBtn);
      expect(screen.getByText('Tạo thư mục mới')).toBeInTheDocument();
      const input = screen.getByPlaceholderText(/tên thư mục/i);
      fireEvent.change(input, { target: { value: 'Thư mục thử nghiệm' } });
      const submitBtn = screen.getByRole('button', { name: 'Tạo thư mục' });
      fireEvent.click(submitBtn);
      expect(handleCreateFolder).toHaveBeenCalledWith('Thư mục thử nghiệm', undefined);
    }
  });

  it('renders root documents in special folder and only reveals folder documents after expansion', () => {
    render(
      <DocFolderTree
        notes={mockNotes.map((note) => ({ ...note, body: '' }))}
        activeFilter="root_docs"
        onSelectFilter={vi.fn()}
        onCreateDoc={vi.fn()}
      />
    );

    // Expand root_docs
    fireEvent.click(screen.getByText('Tài liệu chung (Chưa phân loại)'));
    expect(screen.getByText('Inbox Document')).toBeInTheDocument();
    expect(screen.queryByText('Database Schema Spec')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Kỹ thuật & Kiến trúc'));
    expect(screen.getByText('Database Schema Spec')).toBeInTheDocument();
  });

  it('loads folder documents in pages of 20 with accessible fallback', () => {
    const pagedNotes = [
      mockNotes[0]!,
      ...Array.from({ length: 21 }, (_, index) => ({
        ...mockNotes[1]!,
        id: `doc-${index}`,
        title: `Paged document ${index}`,
      })),
    ];
    render(
      <DocFolderTree
        notes={pagedNotes}
        activeFilter="inbox"
        onSelectFilter={vi.fn()}
        onCreateDoc={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Kỹ thuật & Kiến trúc'));
    expect(screen.getByText('Paged document 19')).toBeInTheDocument();
    expect(screen.queryByText('Paged document 20')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Xem thêm/ }));
    expect(screen.getByText('Paged document 20')).toBeInTheDocument();
  });

  it('searches documents using BM25 worker and displays search results', async () => {
    const handleSelectDoc = vi.fn();
    render(
      <DocFolderTree
        notes={mockNotes.map((note) => ({ ...note, body: '' }))}
        loadSearchNotes={async () => mockNotes}
        activeFilter="inbox"
        onSelectFilter={vi.fn()}
        onSelectDoc={handleSelectDoc}
        onCreateDoc={vi.fn()}
      />
    );

    const searchInput = screen.getByPlaceholderText('Tìm kiếm tài liệu (BM25)...');
    fireEvent.change(searchInput, { target: { value: 'Database' } });

    await waitFor(() => {
      expect(screen.getByText(/KẾT QUẢ TÌM KIẾM/i)).toBeInTheDocument();
      expect(screen.getByText('Database Schema Spec')).toBeInTheDocument();
    });

    // Clicking document from search result opens editor
    fireEvent.click(screen.getByText('Database Schema Spec'));
    expect(handleSelectDoc).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'doc-1' })
    );
  });

  it('indents documents inside special folders with sufficient visual hierarchy', () => {
    const specialMockNotes: Note[] = [
      {
        id: 'pinned-doc-1',
        title: 'Pinned Guide',
        body: '',
        type: 'document',
        isPinned: true,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      },
      {
        id: 'trash-doc-1',
        title: 'Deleted Draft',
        body: '',
        type: 'document',
        isPinned: false,
        deletedAt: '2026-10-02T00:00:00Z',
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      },
    ];

    render(
      <DocFolderTree
        notes={specialMockNotes}
        activeFilter="pinned"
        onSelectFilter={vi.fn()}
        onCreateDoc={vi.fn()}
      />
    );

    // Expand pinned
    fireEvent.click(screen.getByText('Đã ghim'));
    const pinnedItem = screen.getByText('Pinned Guide').closest('.doc-tree-item');
    expect(pinnedItem).toBeInTheDocument();
    expect(pinnedItem).toHaveStyle({ paddingLeft: '34px' });

    // Expand trash
    fireEvent.click(screen.getByText('Thùng rác'));
    const trashItem = screen.getByText('Deleted Draft').closest('.doc-tree-item');
    expect(trashItem).toBeInTheDocument();
    expect(trashItem).toHaveStyle({ paddingLeft: '34px' });
  });
});
