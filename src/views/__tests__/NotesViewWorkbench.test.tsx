// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../db';
import { createNote } from '../../db/repositories/noteRepo';
import { NotesView } from '../NotesView';
import { useLayoutStore } from '../../workbench/store/layoutStore';

describe('NotesView workbench document scope', () => {
  let db: TaskPlannerDatabase;

  beforeEach(() => {
    db = new TaskPlannerDatabase(`TestDB_${Math.random()}`);
    useLayoutStore.getState().resetLayout();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('omits all global library actions and file input from document tabs', async () => {
    const doc = await createNote({ title: 'Tài liệu đang mở', body: '# Nội dung', type: 'document' }, db);
    const { container } = render(<NotesView db={db} hideFolderTree initialDocId={doc.id} />);

    expect(await screen.findByDisplayValue('Tài liệu đang mở')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Bộ tài liệu/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Nhập Zip/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Prompt AI/ })).toBeNull();
    expect(container.querySelector('input[type="file"][accept=".zip"]')).toBeNull();
    expect(screen.queryByTestId('docs-compact-toolbar')).toBeNull();
    expect(screen.queryByText('Ghi chú & Tài liệu')).toBeNull();
  });

  it('keeps global library actions alongside the tree outside the workbench', async () => {
    render(<NotesView db={db} />);

    expect(await screen.findByText('Ghi chú & Tài liệu')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bộ tài liệu/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nhập Zip/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Prompt AI/ })).toBeInTheDocument();
    expect(screen.queryByTestId('docs-compact-toolbar')).toBeNull();
  });

  it('renders the Mermaid editor without global actions for a diagram note', async () => {
    const diagram = await createNote(
      { title: 'Sơ đồ AI tạo', body: 'flowchart TD\n  A --> B', type: 'diagram', tags: ['diagram'] },
      db
    );

    render(<NotesView db={db} hideFolderTree initialDocId={diagram.id} />);

    expect(await screen.findByDisplayValue('Sơ đồ AI tạo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Bộ tài liệu|Nhập Zip|Prompt AI/ })).toBeNull();
  });
});
