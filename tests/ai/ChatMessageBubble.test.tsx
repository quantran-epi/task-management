import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatMessageBubble } from '../../src/components/ai/ChatMessageBubble';
import { ChatMessageList } from '../../src/components/ai/ChatMessageList';
import { ChatInputBar } from '../../src/components/ai/ChatInputBar';
import { InlineApiErrorCard } from '../../src/components/ai/InlineApiErrorCard';
import type { ChatMessage } from '../../src/types/models';

describe('ChatMessageBubble', () => {
  it('renders user messages with accent styling and user content', () => {
    const userMessage: ChatMessage = {
      id: 'msg-1',
      threadId: 'thread-1',
      role: 'user',
      content: 'Hello AI assistant',
      createdAt: '2026-10-03T10:00:00Z',
    };

    const { container } = render(<ChatMessageBubble message={userMessage} />);
    expect(screen.getByText('Hello AI assistant')).toBeInTheDocument();

    const bubble = container.querySelector('[data-role="user"]');
    expect(bubble).toBeInTheDocument();
  });

  it('renders assistant messages with secondary styling and copy button', () => {
    const assistantMessage: ChatMessage = {
      id: 'msg-2',
      threadId: 'thread-1',
      role: 'assistant',
      content: 'Here is some advice',
      createdAt: '2026-10-03T10:01:00Z',
    };

    const { container } = render(<ChatMessageBubble message={assistantMessage} />);
    expect(screen.getByText('Here is some advice')).toBeInTheDocument();

    const bubble = container.querySelector('[data-role="assistant"]');
    expect(bubble).toBeInTheDocument();
    expect(screen.getByLabelText('Sao chép nội dung')).toBeInTheDocument();
  });

  it('sanitizes and renders markdown content safely without XSS', () => {
    const messageWithXss: ChatMessage = {
      id: 'msg-3',
      threadId: 'thread-1',
      role: 'assistant',
      content: 'Safe **bold** text <script>alert("hack")</script> and [Safe Link](https://example.com)',
      createdAt: '2026-10-03T10:02:00Z',
    };

    const { container } = render(<ChatMessageBubble message={messageWithXss} />);
    expect(container.querySelector('strong')).toHaveTextContent('bold');
    expect(container.querySelector('script')).toBeNull();
    const link = container.querySelector('a');
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders streaming cursor when isStreaming is true', () => {
    const streamingMessage: ChatMessage = {
      id: 'msg-streaming',
      threadId: 'thread-1',
      role: 'assistant',
      content: 'Generating content',
      createdAt: '2026-10-03T10:03:00Z',
    };

    render(<ChatMessageBubble message={streamingMessage} isStreaming />);
    expect(screen.getByText('▋')).toBeInTheDocument();
  });

  it('renders duration and token metrics with tooltips on assistant message', () => {
    const assistantMsg: ChatMessage = {
      id: 'msg-metrics',
      threadId: 'thread-1',
      role: 'assistant',
      content: 'Finished response',
      durationMs: 3420,
      tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      createdAt: '2026-10-03T10:04:00Z',
    };

    render(<ChatMessageBubble message={assistantMsg} />);
    expect(screen.getByText('⏱ 3.4s')).toBeInTheDocument();
    expect(screen.getByText('🪙 150 tokens')).toBeInTheDocument();
  });

  it('renders both browser download and save as buttons for generated files and export actions', () => {
    const fileMsg: ChatMessage = {
      id: 'msg-file',
      threadId: 'thread-1',
      role: 'assistant',
      content: 'Here is your file',
      generatedFiles: [
        {
          id: 'file-1',
          filename: 'report.docx',
          sizeBytes: 1024,
          format: 'docx',
          content: 'File content',
        },
      ],
      createdAt: '2026-10-03T10:05:00Z',
    };

    render(<ChatMessageBubble message={fileMsg} />);
    expect(screen.getByText('report.docx')).toBeInTheDocument();

    // Check generated file card download actions
    const downloadBtns = screen.getAllByRole('button', { name: /Tải về/i });
    expect(downloadBtns.length).toBeGreaterThanOrEqual(1);

    const saveBtns = screen.getAllByRole('button', { name: /Lưu tệp/i });
    expect(saveBtns.length).toBeGreaterThanOrEqual(1);
  });
});

describe('ChatMessageList', () => {
  it('renders context divider when isContextBoundary is true', () => {
    const messages: ChatMessage[] = [
      {
        id: 'msg-1',
        threadId: 'thread-1',
        role: 'user',
        content: 'Previous query',
        createdAt: '2026-10-03T09:00:00Z',
      },
      {
        id: 'msg-2',
        threadId: 'thread-1',
        role: 'system',
        content: '--- Ngữ cảnh đã được đặt lại ---',
        isContextBoundary: true,
        createdAt: '2026-10-03T09:05:00Z',
      },
      {
        id: 'msg-3',
        threadId: 'thread-1',
        role: 'user',
        content: 'Fresh query',
        createdAt: '2026-10-03T09:10:00Z',
      },
    ];

    render(<ChatMessageList messages={messages} />);
    expect(screen.getByText('Previous query')).toBeInTheDocument();
    expect(screen.getByText(/Ngữ cảnh đã được đặt lại/i)).toBeInTheDocument();
    expect(screen.getByText('Fresh query')).toBeInTheDocument();
  });
});

describe('ChatInputBar', () => {
  it('handles typing, submit via Send button or Cmd+Enter, and triggers onClear on /clear', () => {
    const handleSubmit = vi.fn();
    const handleClear = vi.fn();

    render(
      <ChatInputBar
        onSubmit={handleSubmit}
        onClear={handleClear}
        isStreaming={false}
      />
    );

    const textarea = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI');
    fireEvent.change(textarea, { target: { value: 'Test prompt' } });

    // Submit via Send button
    const sendBtn = screen.getByLabelText('Gửi tin nhắn');
    fireEvent.click(sendBtn);
    expect(handleSubmit).toHaveBeenCalledWith('Test prompt');

    // Test /clear command
    fireEvent.change(textarea, { target: { value: '/clear' } });
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });
    expect(handleClear).toHaveBeenCalled();
  });

  it('clears input completely on Cmd+Enter and suppresses trailing IME input', () => {
    const handleSubmit = vi.fn();

    render(
      <ChatInputBar
        onSubmit={handleSubmit}
        isStreaming={false}
      />
    );

    const textarea = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Kế hoạch phát triển dự án' } });
    expect(textarea.value).toBe('Kế hoạch phát triển dự án');

    // Press Cmd+Enter
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });
    expect(handleSubmit).toHaveBeenCalledWith('Kế hoạch phát triển dự án');
    expect(textarea.value).toBe('');

    // Simulate trailing IME input event that commonly arrives on macOS right after Cmd+Enter
    fireEvent.change(textarea, { target: { value: 'án' } });
    expect(textarea.value).toBe('');

    // Simulate trailing native input and composition events
    fireEvent.input(textarea, { target: { value: 'n' } });
    expect(textarea.value).toBe('');
    fireEvent.compositionEnd(textarea, { target: { value: 'n' } });
    expect(textarea.value).toBe('');
  });

  it('renders Stop Generation button when isStreaming is true', () => {
    const handleStop = vi.fn();

    render(
      <ChatInputBar
        onSubmit={vi.fn()}
        onStop={handleStop}
        isStreaming={true}
      />
    );

    const stopBtn = screen.getByLabelText('Dừng sinh phản hồi');
    expect(stopBtn).toBeInTheDocument();
    fireEvent.click(stopBtn);
    expect(handleStop).toHaveBeenCalled();
  });
});

describe('InlineApiErrorCard', () => {
  it('renders error message, retry button, and settings button', () => {
    const handleRetry = vi.fn();
    const handleOpenSettings = vi.fn();

    render(
      <InlineApiErrorCard
        errorMessage="Unauthorized 401"
        onRetry={handleRetry}
        onOpenSettings={handleOpenSettings}
      />
    );

    expect(screen.getByText(/Unauthorized 401/i)).toBeInTheDocument();
    const retryBtn = screen.getByText('Thử lại tin nhắn');
    fireEvent.click(retryBtn);
    expect(handleRetry).toHaveBeenCalled();

    const settingsBtn = screen.getByText('Cài đặt AI');
    fireEvent.click(settingsBtn);
    expect(handleOpenSettings).toHaveBeenCalled();
  });
});
