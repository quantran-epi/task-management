import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

  it('renders quick filters and folder items with badge counts', () => {
    render(
      <DocFolderTree
        notes={mockNotes}
        activeFilter="inbox"
        onSelectFilter={vi.fn()}
        onCreateDoc={vi.fn()}
      />
    );

    expect(screen.getByText('Inbox')).toBeInTheDocument();
    expect(screen.getByText('Tất cả tài liệu')).toBeInTheDocument();
    expect(screen.getByText('Kỹ thuật & Kiến trúc')).toBeInTheDocument();
  });

  it('selects folder when folder row is clicked', () => {
    const handleSelectFilter = vi.fn();
    render(
      <DocFolderTree
        notes={mockNotes}
        activeFilter="inbox"
        onSelectFilter={handleSelectFilter}
        onCreateDoc={vi.fn()}
      />
    );

    const folderRow = screen.getByText('Kỹ thuật & Kiến trúc');
    fireEvent.click(folderRow);
    expect(handleSelectFilter).toHaveBeenCalledWith('folder-1');
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
});
