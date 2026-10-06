import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../../src/db';
import { DocEditorPane } from '../../../src/components/notes/DocEditorPane';
import { AIChatProvider } from '../../../src/context/AIChatContext';
import * as aiChatContextModule from '../../../src/context/AIChatContext';
import type { Note, Task, Project } from '../../../src/types/models';

describe('DocEditorPane', () => {
  let db: TaskPlannerDatabase;
  const mockDoc: Note = {
    id: 'note-1111-1111-1111-1111',
    title: 'Ghi chú ban đầu',
    body: 'Nội dung ban đầu của tài liệu',
    isPinned: false,
    createdAt: '2026-10-04T00:00:00.000Z',
    updatedAt: '2026-10-04T01:00:00.000Z',
  };

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`doc-editor-test-${crypto.randomUUID()}`);
    await db.open();
    await db.notes.add(mockDoc);
  });

  afterEach(async () => {
    await db.delete();
  });

  it('renders doc title and body initially', () => {
    render(<DocEditorPane doc={mockDoc} onUpdateDoc={vi.fn()} db={db} />);

    expect(screen.getByDisplayValue('Ghi chú ban đầu')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Nội dung ban đầu của tài liệu')).toBeInTheDocument();
  });

  it('handles paste without overwriting new body with stale closure during auto-save', async () => {
    const onUpdateDoc = vi.fn();
    render(<DocEditorPane doc={mockDoc} onUpdateDoc={onUpdateDoc} db={db} />);

    const textarea = screen.getByPlaceholderText(/Nhập nội dung Markdown hoặc dán văn bản vào đây/);

    const pastedLongText = 'Văn bản được dán vào rất dài và chứa thông tin cần lưu trữ kỹ càng.';
    const clipboardEvent = {
      clipboardData: {
        getData: (format: string) => (format === 'text' ? pastedLongText : ''),
      },
    };

    // Simulate paste event
    fireEvent.paste(textarea, clipboardEvent);

    // Simulate input change as happens in real browser upon paste
    const newBodyContent = `Nội dung ban đầu của tài liệu\n${pastedLongText}`;
    fireEvent.change(textarea, { target: { value: newBodyContent } });

    // Wait for debounced auto-save (500ms)
    await waitFor(
      () => {
        expect(onUpdateDoc).toHaveBeenCalledWith(
          mockDoc.id,
          expect.objectContaining({
            body: newBodyContent,
          })
        );
      },
      { timeout: 1500 }
    );

    // Ensure it was NOT called with the stale original body
    const calls = onUpdateDoc.mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall).toBeDefined();
    expect(lastCall![1].body).toBe(newBodyContent);
  });

  it('triggers autocomplete popup when typing [[ and displays matching tasks, projects, docs', async () => {
    // Populate DB with sample items
    const sampleTask: Task = {
      id: 'task-9999-9999',
      name: 'Triển khai tính năng Wiki',
      projectId: 'proj-1',
      status: 'In Progress',
      priority: 'High',
      progress: 50,
      estimateMinutes: 60,
      createdAt: '2026-10-04T00:00:00.000Z',
      updatedAt: '2026-10-04T00:00:00.000Z',
    };
    const sampleProject: Project = {
      id: 'proj-8888-8888',
      name: 'Dự án PlannerMate Alpha',
      status: 'In Progress',
      createdAt: '2026-10-04T00:00:00.000Z',
      updatedAt: '2026-10-04T00:00:00.000Z',
    };
    const otherDoc: Note = {
      id: 'note-2222-2222',
      title: 'Tài liệu kiến trúc hệ thống',
      body: 'Chi tiết kiến trúc',
      isPinned: false,
      createdAt: '2026-10-04T00:00:00.000Z',
      updatedAt: '2026-10-04T00:00:00.000Z',
    };

    await db.tasks.add(sampleTask);
    await db.projects.add(sampleProject);
    await db.notes.add(otherDoc);

    render(<DocEditorPane doc={mockDoc} onUpdateDoc={vi.fn()} db={db} />);

    const textarea = screen.getByPlaceholderText(/Nhập nội dung Markdown hoặc dán văn bản vào đây/);

    // Type [[ in textarea
    fireEvent.change(textarea, { target: { value: 'Tham khảo [[' } });

    // Autocomplete popup should appear
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    expect(screen.getByText('Triển khai tính năng Wiki')).toBeInTheDocument();
    expect(screen.getByText('Dự án PlannerMate Alpha')).toBeInTheDocument();
    expect(screen.getByText('Tài liệu kiến trúc hệ thống')).toBeInTheDocument();
  });

  it('selects autocomplete candidate on click and inserts [[type:id|Title]] chip', async () => {
    const onUpdateDoc = vi.fn();
    const sampleTask: Task = {
      id: 'task-7777-7777',
      name: 'Viết tài liệu API',
      status: 'Open',
      priority: 'Medium',
      progress: 0,
      estimateMinutes: 30,
      createdAt: '2026-10-04T00:00:00.000Z',
      updatedAt: '2026-10-04T00:00:00.000Z',
    };
    await db.tasks.add(sampleTask);

    render(<DocEditorPane doc={mockDoc} onUpdateDoc={onUpdateDoc} db={db} />);

    const textarea = screen.getByPlaceholderText(/Nhập nội dung Markdown hoặc dán văn bản vào đây/);

    // Trigger [[Vi
    fireEvent.change(textarea, { target: { value: 'Xem mục [[Vi' } });

    // Item should appear
    const itemOption = await screen.findByText('Viết tài liệu API');
    expect(itemOption).toBeInTheDocument();

    // Click candidate
    fireEvent.click(itemOption);

    // Expect popup to close and textarea to have [[task:task-7777-7777|Viết tài liệu API]]
    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    expect(screen.getByDisplayValue('Xem mục [[task:task-7777-7777|Viết tài liệu API]]')).toBeInTheDocument();

    // Verify debounced autosave was invoked with the inserted chip
    await waitFor(
      () => {
        expect(onUpdateDoc).toHaveBeenCalledWith(
          mockDoc.id,
          expect.objectContaining({
            body: 'Xem mục [[task:task-7777-7777|Viết tài liệu API]]',
          })
        );
      },
      { timeout: 1500 }
    );
  });

  it('supports keyboard navigation (ArrowDown, Enter, Escape) in autocomplete popup', async () => {
    const taskA: Task = {
      id: 'task-a',
      name: 'Task Alpha',
      status: 'Open',
      priority: 'Low',
      progress: 0,
      estimateMinutes: 10,
      createdAt: '2026-10-04T00:00:00.000Z',
      updatedAt: '2026-10-04T00:00:00.000Z',
    };
    const taskB: Task = {
      id: 'task-b',
      name: 'Task Beta',
      status: 'Open',
      priority: 'Low',
      progress: 0,
      estimateMinutes: 10,
      createdAt: '2026-10-04T00:00:00.000Z',
      updatedAt: '2026-10-04T00:00:00.000Z',
    };
    await db.tasks.bulkAdd([taskA, taskB]);

    render(<DocEditorPane doc={mockDoc} onUpdateDoc={vi.fn()} db={db} />);

    const textarea = screen.getByPlaceholderText(/Nhập nội dung Markdown hoặc dán văn bản vào đây/);

    // Type [[Task
    fireEvent.change(textarea, { target: { value: 'Liên kết: [[Task' } });
    expect(await screen.findByRole('listbox')).toBeInTheDocument();

    // Arrow down to Task Beta, trigger keyUp, and ensure selection doesn't bounce back to Task Alpha
    fireEvent.keyDown(textarea, { key: 'ArrowDown' });
    fireEvent.keyUp(textarea, { key: 'ArrowDown' });

    // Press Enter to select Task Beta
    fireEvent.keyDown(textarea, { key: 'Enter' });

    // Expect selected Task Beta to be inserted
    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    expect(screen.getByDisplayValue('Liên kết: [[task:task-b|Task Beta]]')).toBeInTheDocument();

    // Verify task-b was actually linked in IndexedDB
    await waitFor(async () => {
      const updatedTaskB = await db.tasks.get('task-b');
      expect(updatedTaskB?.documentLinks).toContain(mockDoc.id);
      expect(updatedTaskB?.notes).toContain(`[[doc:${mockDoc.id}`);
    });

    // Type [[Task again and test Escape dismiss
    fireEvent.change(textarea, { target: { value: 'Liên kết: [[task:task-b|Task Beta]] và [[Task' } });
    expect(await screen.findByRole('listbox')).toBeInTheDocument();

    fireEvent.keyDown(textarea, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  it('opens task drawer when clicking wiki-link chip in markdown preview', async () => {
    const onOpenTask = vi.fn();
    const docWithChip: Note = {
      ...mockDoc,
      body: 'Tham khảo [[task:task-1234|Viết API]] trong tài liệu',
    };

    render(<DocEditorPane doc={docWithChip} onUpdateDoc={vi.fn()} onOpenTask={onOpenTask} db={db} />);

    // Find rendered chip
    const chip = screen.getByRole('button', { name: /Viết API/i });
    expect(chip).toBeInTheDocument();

    fireEvent.click(chip);
    expect(onOpenTask).toHaveBeenCalledWith('task-1234');
  });

  it('renders AI Chuẩn hóa button and opens NormalizeDocModal on click', async () => {
    render(<DocEditorPane doc={mockDoc} onUpdateDoc={vi.fn()} db={db} />);

    const normalizeBtn = screen.getByRole('button', { name: /ai chuẩn hóa/i });
    expect(normalizeBtn).toBeInTheDocument();

    fireEvent.click(normalizeBtn);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/AI Chuẩn hóa tài liệu/)).toBeInTheDocument();
  });

  it('renders only one Table of Contents button with text "Mục lục"', () => {
    const docWithHeadings: Note = {
      ...mockDoc,
      body: '# Heading 1\nContent 1\n## Heading 2\nContent 2',
    };
    render(<DocEditorPane doc={docWithHeadings} onUpdateDoc={vi.fn()} db={db} />);

    const tocButtons = screen.getAllByRole('button', { name: /mục lục/i });
    expect(tocButtons).toHaveLength(1);
    expect(tocButtons[0]).toHaveTextContent('Mục lục');
  });

  it('opens AI chat with enriched prompt containing doc title, word count, tags and actionable intent on Hỏi AI click', () => {
    const openChatMock = vi.fn();
    vi.spyOn(aiChatContextModule, 'useAIChat').mockReturnValue({
      isOpen: false,
      openChat: openChatMock,
      closeChat: vi.fn(),
      toggleChat: vi.fn(),
      activeScope: { type: 'global' },
      setCustomScope: vi.fn(),
      registerActiveItem: () => () => {},
      pendingPrompt: null,
      clearPendingPrompt: vi.fn(),
    });

    const docWithMetadata: Note = {
      ...mockDoc,
      title: 'Tài liệu kiến trúc',
      body: 'Từ thứ nhất từ thứ hai từ thứ ba',
      tags: ['kien-truc', 'backend'],
    };

    render(<DocEditorPane doc={docWithMetadata} onUpdateDoc={vi.fn()} db={db} />);

    const askAiBtn = screen.getByRole('button', { name: /hỏi ai/i });
    fireEvent.click(askAiBtn);

    expect(openChatMock).toHaveBeenCalledTimes(1);
    const [scopeArg, promptArg] = openChatMock.mock.calls[0];
    expect(scopeArg).toEqual({
      type: 'document',
      id: docWithMetadata.id,
      title: 'Tài liệu kiến trúc',
    });
    expect(promptArg).toContain('Tài liệu kiến trúc');
    expect(promptArg).toContain('9 từ');
    expect(promptArg).toContain('[Tags: kien-truc, backend]');
    expect(promptArg).toContain('Hãy phân tích nội dung, tóm tắt các điểm then chốt và gợi ý các hành động tiếp theo');
  });
});
