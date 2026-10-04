import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { NotesView } from '../../src/views/NotesView';
import { TaskPlannerDatabase } from '../../src/db/index';
import { createNote } from '../../src/db/repositories/noteRepo';
import { createTask } from '../../src/db/repositories/taskRepo';

describe('NotesView Search and Filter by Parent Item', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestNotesView_' + Math.random().toString(36).slice(2));
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('renders standard PageHeader and notes controls', async () => {
    render(<NotesView db={testDb} />);

    expect(await screen.findByText('Ghi chú & Tài liệu')).toBeInTheDocument();
    expect(screen.getByText('Tạo ghi chú')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Tìm theo nội dung/)).toBeInTheDocument();
  });

  it('filters notes by parent entity name in search input', async () => {
    // Create task
    const task = await createTask({ name: 'Dự án Alpha Bí Mật' }, testDb);

    // Create note attached to task
    await createNote(
      {
        title: 'Báo cáo tuần',
        body: 'Nội dung thông thường',
        entityType: 'task',
        entityId: task.id,
      },
      testDb
    );

    // Create standalone note
    await createNote(
      {
        title: 'Mua sữa',
        body: 'Đi siêu thị cuối tuần',
      },
      testDb
    );

    render(<NotesView db={testDb} />);

    // Both notes render initially
    expect(await screen.findByText('Báo cáo tuần')).toBeInTheDocument();
    expect(screen.getByText('Mua sữa')).toBeInTheDocument();

    // Type parent name into search box
    const searchInput = screen.getByPlaceholderText(/Tìm theo nội dung/);
    fireEvent.change(searchInput, { target: { value: 'Alpha Bí Mật' } });

    // Note attached to task matching 'Alpha Bí Mật' remains visible; standalone note disappears
    await waitFor(() => {
      expect(screen.getByText('Báo cáo tuần')).toBeInTheDocument();
      expect(screen.queryByText('Mua sữa')).not.toBeInTheDocument();
    });
  });

  it('filters notes by specific item when selected', async () => {
    const task1 = await createTask({ name: 'Task 1' }, testDb);
    const task2 = await createTask({ name: 'Task 2' }, testDb);

    await createNote(
      {
        title: 'Note cho Task 1',
        body: 'Chi tiết task 1',
        entityType: 'task',
        entityId: task1.id,
      },
      testDb
    );

    await createNote(
      {
        title: 'Note cho Task 2',
        body: 'Chi tiết task 2',
        entityType: 'task',
        entityId: task2.id,
      },
      testDb
    );

    render(<NotesView db={testDb} />);

    expect(await screen.findByText('Note cho Task 1')).toBeInTheDocument();
    expect(screen.getByText('Note cho Task 2')).toBeInTheDocument();
  });
});
