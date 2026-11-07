import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { DocEditorPane } from '../../../src/components/notes/DocEditorPane';
import { TaskPlannerDatabase } from '../../../src/db/index';
import type { Note, Task, ChangeRequest } from '../../../src/types/models';

describe('DocEditorPane Linked Entity Display', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestDocEditorPane_' + Math.random().toString(36).slice(2));
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('renders linked task tag and triggers onOpenTask when clicked', async () => {
    const taskId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    const task: Task = {
      id: taskId,
      crId: 'f47ac10b-58cc-4372-a567-0e02b2c3d499',
      name: 'Phát triển tính năng Auth',
      status: 'In Progress',
      priority: 'High',
      progress: 30,
      estimateMinutes: 60,
      jiraKey: 'AUTH-101',
      createdAt: '2026-10-10T00:00:00Z',
      updatedAt: '2026-10-10T00:00:00Z',
    };
    await testDb.tasks.add(task);

    const doc: Note = {
      id: 'd47ac10b-58cc-4372-a567-0e02b2c3d480',
      title: 'Tài liệu hướng dẫn Auth',
      body: 'Chi tiết hướng dẫn',
      type: 'quick_note',
      entityType: 'task',
      entityId: taskId,
      isPinned: false,
      createdAt: '2026-10-10T00:00:00Z',
      updatedAt: '2026-10-10T00:00:00Z',
    };

    const handleOpenTask = vi.fn();

    render(
      <DocEditorPane
        doc={doc}
        onUpdateDoc={vi.fn()}
        onOpenTask={handleOpenTask}
        db={testDb}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Thuộc tác vụ:/)).toBeInTheDocument();
      expect(screen.getByText('Phát triển tính năng Auth')).toBeInTheDocument();
      expect(screen.getByText(/AUTH-101/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Thuộc tác vụ:/));
    expect(handleOpenTask).toHaveBeenCalledWith(taskId);
  });

  it('renders linked CR tag and triggers onOpenCr when clicked', async () => {
    const crId = 'e47ac10b-58cc-4372-a567-0e02b2c3d481';
    const cr: ChangeRequest = {
      id: crId,
      code: 'CR-CORE-01',
      name: 'Nâng cấp Core',
      status: 'In Progress',
      type: 'ENHANCEMENT',
      targets: [],
      createdAt: '2026-10-10T00:00:00Z',
      updatedAt: '2026-10-10T00:00:00Z',
    };
    await testDb.changeRequests.add(cr);

    const doc: Note = {
      id: 'c47ac10b-58cc-4372-a567-0e02b2c3d482',
      title: 'Ghi chú kiến trúc Core',
      body: 'Chi tiết kiến trúc',
      type: 'document',
      entityType: 'cr',
      entityId: crId,
      isPinned: false,
      createdAt: '2026-10-10T00:00:00Z',
      updatedAt: '2026-10-10T00:00:00Z',
    };

    const handleOpenCr = vi.fn();

    render(
      <DocEditorPane doc={doc} onUpdateDoc={vi.fn()} onOpenCr={handleOpenCr} db={testDb} />
    );

    await waitFor(() => {
      expect(screen.getByText(/Thuộc CR:/)).toBeInTheDocument();
      expect(screen.getByText('CR-CORE-01')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Thuộc CR:/));
    expect(handleOpenCr).toHaveBeenCalledWith(crId);
  });
});
