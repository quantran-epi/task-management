import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatInputBar } from '../../src/components/ai/ChatInputBar';
import { TaskPlannerDatabase } from '../../src/db';
import { extractMentionedEntityIds } from '../../src/services/ai/contextGrounding';
import { renderUserMessageWithMentions } from '../../src/components/ai/ChatMessageBubble';

describe('ChatInputBar - Mentions & Command Palette', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = new TaskPlannerDatabase(`test-chat-input-${Date.now()}-${Math.random()}`);

    await db.projects.bulkAdd([
      {
        id: 'proj-1',
        name: 'Task Management App',
        status: 'In Progress',
        jiraEpicKey: 'PROJ-101',
        createdAt: '2026-10-01',
        updatedAt: '2026-10-01',
      },
      {
        id: 'proj-2',
        name: 'Infrastructure & DevOps',
        status: 'Pending',
        createdAt: '2026-10-01',
        updatedAt: '2026-10-01',
      },
    ]);

    await db.tasks.bulkAdd([
      {
        id: 'task-1',
        name: 'Fix authentication token expiry',
        status: 'Open',
        priority: 'High',
        jiraKey: 'AUTH-12',
        projectId: 'proj-1',
        progress: 0,
        estimateMinutes: 60,
        createdAt: '2026-10-01',
        updatedAt: '2026-10-01',
      },
      {
        id: 'task-2',
        name: 'Design command palette UI',
        status: 'In Progress',
        priority: 'Medium',
        projectId: 'proj-1',
        progress: 25,
        estimateMinutes: 90,
        createdAt: '2026-10-01',
        updatedAt: '2026-10-01',
      },
    ]);
  });

  it('renders mentions textarea and submit button', () => {
    render(<ChatInputBar onSubmit={vi.fn()} db={db} />);

    const textarea = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI');
    expect(textarea).toBeInTheDocument();
    expect(screen.getByLabelText('Gửi tin nhắn')).toBeInTheDocument();
  });

  it('triggers onClear callback when typing /clear and clicking send', () => {
    const handleClear = vi.fn();
    const handleSubmit = vi.fn();

    render(<ChatInputBar onSubmit={handleSubmit} onClear={handleClear} db={db} />);

    const textarea = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI');
    fireEvent.change(textarea, { target: { value: '/clear' } });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));

    expect(handleClear).toHaveBeenCalledTimes(1);
    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it('submits regular messages on Cmd+Enter', () => {
    const handleSubmit = vi.fn();

    render(<ChatInputBar onSubmit={handleSubmit} db={db} />);

    const textarea = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI');
    fireEvent.change(textarea, { target: { value: 'Phân tích tiến độ @[Fix auth](task:task-1)' } });
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });

    expect(handleSubmit).toHaveBeenCalledWith('Phân tích tiến độ @[Fix auth](task:task-1)');
  });

  it('submits document mentions with @doc: syntax', () => {
    const handleSubmit = vi.fn();

    render(<ChatInputBar onSubmit={handleSubmit} db={db} />);

    const textarea = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI');
    fireEvent.change(textarea, { target: { value: 'Tóm tắt @[Core Banking](doc:doc-1)' } });
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });

    expect(handleSubmit).toHaveBeenCalledWith('Tóm tắt @[Core Banking](doc:doc-1)');
  });
});

describe('extractMentionedEntityIds', () => {
  it('extracts task and project IDs from markdown links and shorthand', () => {
    const text = 'Kiểm tra @[Fix auth](task:task-123) và #[DevOps Infra](project:proj-999) cùng @task:task-456';
    const result = extractMentionedEntityIds(text);

    expect(result.taskIds).toEqual(['task-123', 'task-456']);
    expect(result.projectIds).toEqual(['proj-999']);
  });

  it('extracts document IDs from @doc:uuid (Title) and @[Title](doc:uuid)', () => {
    const text = 'Tra cứu @doc:doc-123 (Architecture Doc) và @[Runbook](doc:doc-456)';
    const result = extractMentionedEntityIds(text);

    expect(result.docIds).toEqual(['doc-123', 'doc-456']);
  });

  it('returns empty arrays when no mentions exist', () => {
    const text = 'Tin nhắn bình thường không chứa tag';
    const result = extractMentionedEntityIds(text);

    expect(result.taskIds).toEqual([]);
    expect(result.projectIds).toEqual([]);
  });

  it('deduplicates duplicate IDs', () => {
    const text = '@[Task 1](task:t-1) xem lại @[Task 1](task:t-1) và @task:t-1';
    const result = extractMentionedEntityIds(text);

    expect(result.taskIds).toEqual(['t-1']);
  });
});

describe('renderUserMessageWithMentions', () => {
  it('returns plain string when no mentions present', () => {
    const rendered = renderUserMessageWithMentions('Xin chào');
    expect(rendered).toBe('Xin chào');
  });

  it('renders pills for task, project, and document mentions', () => {
    const { container } = render(
      <div>{renderUserMessageWithMentions('Xem @[Fix auth](task:t-1), #[Dự án](project:p-1) và @[Sổ tay kiến trúc](doc:d-1)')}</div>
    );

    expect(container.textContent).toContain('Fix auth');
    expect(container.textContent).toContain('#Dự án');
    expect(container.textContent).toContain('Sổ tay kiến trúc');
  });
});
