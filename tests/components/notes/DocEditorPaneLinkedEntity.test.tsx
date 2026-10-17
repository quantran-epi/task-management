import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { DocEditorPane } from '../../../src/components/notes/DocEditorPane';
import { TaskPlannerDatabase } from '../../../src/db/index';
import type { Note, Task, Project } from '../../../src/types/models';

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

  it('renders linked project tag and triggers onOpenProject when clicked', async () => {
    const projectId = 'e47ac10b-58cc-4372-a567-0e02b2c3d481';
    const project: Project = {
      id: projectId,
      name: 'Dự án Nâng cấp Core',
      description: 'Mô tả dự án',
      status: 'In Progress',
      createdAt: '2026-10-10T00:00:00Z',
      updatedAt: '2026-10-10T00:00:00Z',
    };
    await testDb.projects.add(project);

    const doc: Note = {
      id: 'c47ac10b-58cc-4372-a567-0e02b2c3d482',
      title: 'Ghi chú kiến trúc Core',
      body: 'Chi tiết kiến trúc',
      type: 'document',
      entityType: 'project',
      entityId: projectId,
      isPinned: false,
      createdAt: '2026-10-10T00:00:00Z',
      updatedAt: '2026-10-10T00:00:00Z',
    };

    const handleOpenProject = vi.fn();

    render(
      <DocEditorPane
        doc={doc}
        onUpdateDoc={vi.fn()}
        onOpenProject={handleOpenProject}
        db={testDb}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Thuộc dự án:/)).toBeInTheDocument();
      expect(screen.getByText('Dự án Nâng cấp Core')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Thuộc dự án:/));
    expect(handleOpenProject).toHaveBeenCalledWith(projectId);
  });
});
