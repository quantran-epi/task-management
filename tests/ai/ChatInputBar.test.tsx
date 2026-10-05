import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatInputBar } from '../../src/components/ai/ChatInputBar';
import { TaskPlannerDatabase } from '../../src/db';
import { extractMentionedEntityIds } from '../../src/services/ai/contextGrounding';
import { renderUserMessageWithMentions } from '../../src/components/ai/ChatMessageBubble';
import * as timerPopoutUtils from '../../src/utils/timerPopout';

const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => mockInvoke(...args),
}));

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

  it('renders default placeholder without @file reference', () => {
    render(<ChatInputBar onSubmit={vi.fn()} db={db} />);

    const textarea = screen.getByPlaceholderText('Hỏi AI... (@, #, /)');
    expect(textarea).toBeInTheDocument();
    expect(textarea).not.toHaveAttribute('placeholder', expect.stringContaining('@file'));
  });

  it('does not display file hint option or trigger file autocomplete when typing @', async () => {
    render(<ChatInputBar onSubmit={vi.fn()} db={db} />);

    const textarea = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI') as HTMLTextAreaElement;
    textarea.focus();
    fireEvent.change(textarea, { target: { value: '@', selectionStart: 1, selectionEnd: 1 } });
    fireEvent.keyUp(textarea, { key: '@', keyCode: 50 });

    // Should not contain any file autocomplete hint
    expect(screen.queryByText(/Tham chiếu tập tin máy tính/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/@file/i)).not.toBeInTheDocument();

    // Documents hint and tasks should be available
    await waitFor(() => {
      expect(document.querySelector('.ant-mentions-dropdown')).toBeInTheDocument();
      expect(screen.getByText(/Tham chiếu tài liệu tri thức... \(@doc:\)/i)).toBeInTheDocument();
      expect(screen.getByText('Fix authentication token expiry')).toBeInTheDocument();
    });
  });

  it('does not trigger file path completion or show file sandbox warning when typing @file', async () => {
    render(<ChatInputBar onSubmit={vi.fn()} db={db} />);

    const textarea = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI');
    fireEvent.change(textarea, { target: { value: '@file' } });

    // In web mode previously this rendered a warning about desktop Tauri
    expect(screen.queryByText(/Autocomplete tập tin máy tính/i)).not.toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalledWith('complete_local_path', expect.anything());
  });

  it('triggers file selection when paperclip button is clicked in Tauri app', async () => {
    vi.spyOn(timerPopoutUtils, 'isTauriApp').mockReturnValue(true);
    mockInvoke.mockResolvedValue('/Users/admin/docs/report.pdf');

    const handleAttach = vi.fn();
    render(<ChatInputBar onSubmit={vi.fn()} onAttachFile={handleAttach} db={db} />);

    const paperclipBtn = screen.getByLabelText('Tham chiếu tập tin');
    fireEvent.click(paperclipBtn);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('select_local_file');
      expect(handleAttach).toHaveBeenCalledWith('/Users/admin/docs/report.pdf');
    });
  });

  it('triggers file picker directly when submitting /file command', async () => {
    vi.spyOn(timerPopoutUtils, 'isTauriApp').mockReturnValue(true);
    mockInvoke.mockResolvedValue('/Users/admin/notes.txt');

    const handleAttach = vi.fn();
    render(<ChatInputBar onSubmit={vi.fn()} onAttachFile={handleAttach} db={db} />);

    const textarea = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI');
    fireEvent.change(textarea, { target: { value: '/file' } });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('select_local_file');
      expect(handleAttach).toHaveBeenCalledWith('/Users/admin/notes.txt');
    });
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
