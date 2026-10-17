import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import * as fileExportModule from '../../src/utils/fileExport';
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

  it('downloads generated file using file.content and does not leak assistant conversation text', () => {
    const exportSpy = vi.spyOn(fileExportModule, 'exportContentAsFile');
    vi.spyOn(fileExportModule, 'downloadBlob').mockImplementation(() => {});

    const fileMsg: ChatMessage = {
      id: 'msg-file-isolate',
      threadId: 'thread-1',
      role: 'assistant',
      content: 'Hello! I have created the document for you as requested.',
      generatedFiles: [
        {
          id: 'file-2',
          filename: 'tasks.docx',
          sizeBytes: 2048,
          format: 'docx',
          content: '# Genuine Document Content\n- Task 1',
        },
      ],
      createdAt: '2026-10-03T10:06:00Z',
    };

    render(<ChatMessageBubble message={fileMsg} />);
    const downloadBtn = screen.getByRole('button', { name: /Tải về/i });
    fireEvent.click(downloadBtn);

    expect(exportSpy).toHaveBeenCalledWith(
      '# Genuine Document Content\n- Task 1',
      'tasks.docx',
      'docx',
      false
    );
    expect(exportSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Hello! I have created'),
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
  });

  it('renders grounded message with inline interactive citation chips and calls onCitationActivate', () => {
    const handleActivate = vi.fn();
    const groundedMsg: ChatMessage = {
      id: 'msg-grounded',
      threadId: 'thread-1',
      role: 'assistant',
      content: '',
      grounding: {
        schemaVersion: 1,
        authority: 'server',
        outcome: 'READY',
        answer: {
          schemaVersion: 1,
          language: 'vi',
          conclusion: 'Tiến trình 60000004 chạy phân bổ nợ [S1].',
          claims: [
            {
              id: 'C1',
              text: 'Quy trình apply_payment xử lý cấn trừ.',
              classification: 'DIRECT',
              citationIds: ['S1'],
              pathId: null,
            },
          ],
          unsupportedParts: [],
        },
        citations: [
          {
            citationId: 'S1',
            documentId: '00000000-0000-0000-0000-000000000001',
            documentTitle: '03 - Call chain',
            sectionAnchor: 'Billing',
            lineStart: 10,
            lineEnd: 25,
            authority: 'server',
            evidenceClass: 'OBSERVED',
            snapshotId: 'gsnap_123',
            publishedContentHash: 'a'.repeat(64),
            citedExcerpt: 'Billing dispatch code',
          },
        ],
        paths: [],
        conflicts: [],
        scope: null,
        modalityDiagnostics: null,
        coverageWarnings: [],
        fallbackReason: 'NONE',
        routerVersion: null,
        promptVersion: 'v1',
        modelId: 'gpt-4o',
        createdAt: new Date().toISOString(),
      },
      createdAt: '2026-10-03T10:07:00Z',
    };

    const { container } = render(
      <ChatMessageBubble
        message={groundedMsg}
        groundedCallbacks={{ onCitationActivate: handleActivate }}
      />
    );

    expect(screen.getByText('Nguồn tài liệu:')).toBeInTheDocument();
    const chip = container.querySelector('.grounded-inline-chip');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveTextContent('[1]');

    if (chip) {
      fireEvent.click(chip);
      expect(handleActivate).toHaveBeenCalledWith(groundedMsg.grounding!.citations[0]);
    }
  });

  it('automatically attributes un-bracketed conclusion lines with matching citation chips', () => {
    const handleActivate = vi.fn();
    const messageWithoutBrackets: ChatMessage = {
      id: 'msg-auto-attribute',
      threadId: 'thread-1',
      role: 'assistant',
      content: '',
      grounding: {
        schemaVersion: 1,
        authority: 'server',
        outcome: 'READY',
        answer: {
          schemaVersion: 1,
          language: 'vi',
          conclusion: 'Tiến trình quy tắc 60000004 xử lý phân bổ thanh toán từ MAIN1.OPR_OPERATION.\n1. MAIN1.OPR_API_RULE_PROC_PKG: Xác định tài khoản, ghi Có Ledger BLTP0001.',
          claims: [],
          unsupportedParts: [],
        },
        citations: [
          {
            citationId: 'S1',
            documentId: '00000000-0000-0000-0000-000000000001',
            documentTitle: '01 - Luồng xử lý',
            sectionAnchor: 'Luồng xử lý',
            lineStart: 1,
            lineEnd: 10,
            authority: 'server',
            evidenceClass: 'OBSERVED',
            snapshotId: 'gsnap_1',
            publishedContentHash: 'a'.repeat(64),
            citedExcerpt: 'Tiến trình quy tắc 60000004 kích hoạt từ chỉ thị MAIN1.OPR_OPERATION OPST0100',
          },
          {
            citationId: 'S2',
            documentId: '00000000-0000-0000-0000-000000000002',
            documentTitle: '02 - Các bước thực thi',
            sectionAnchor: 'Các bước thực thi',
            lineStart: 1,
            lineEnd: 10,
            authority: 'server',
            evidenceClass: 'OBSERVED',
            snapshotId: 'gsnap_2',
            publishedContentHash: 'b'.repeat(64),
            citedExcerpt: 'MAIN1.OPR_API_RULE_PROC_PKG.SELECT_OBJECT_ACCOUNT ghi Có Ledger BLTP0001',
          },
        ],
        paths: [],
        conflicts: [],
        scope: null,
        modalityDiagnostics: null,
        coverageWarnings: [],
        fallbackReason: 'NONE',
        routerVersion: null,
        promptVersion: 'v1',
        modelId: 'gpt-4o',
        createdAt: new Date().toISOString(),
      },
      createdAt: '2026-10-03T10:08:00Z',
    };

    const { container } = render(
      <ChatMessageBubble
        message={messageWithoutBrackets}
        groundedCallbacks={{ onCitationActivate: handleActivate }}
      />
    );

    const chips = container.querySelectorAll('.grounded-inline-chip');
    expect(chips.length).toBeGreaterThanOrEqual(2);
    expect(chips[0]).toHaveTextContent('[1]');
    expect(chips[1]).toHaveTextContent('[2]');

    fireEvent.click(chips[0]!);
    expect(handleActivate).toHaveBeenCalledWith(messageWithoutBrackets.grounding!.citations[0]);

    fireEvent.click(chips[1]!);
    expect(handleActivate).toHaveBeenCalledWith(messageWithoutBrackets.grounding!.citations[1]);
  });

  it('guarantees inline citation chips appear for vector-only retrieval with natural Vietnamese text and bracketed numbers', () => {
    const handleActivate = vi.fn();
    const vectorOnlyMessage: ChatMessage = {
      id: 'msg-vector-only',
      threadId: 'thread-1',
      role: 'assistant',
      content: '',
      grounding: {
        schemaVersion: 1,
        authority: 'server',
        outcome: 'READY',
        answer: {
          schemaVersion: 1,
          language: 'vi',
          conclusion: 'Dự án TaskMate theo quy định [2024] quản lý tác vụ và năng suất cá nhân hoàn toàn cục bộ.',
          claims: [],
          unsupportedParts: [],
        },
        citations: [
          {
            citationId: 'S1',
            documentId: '00000000-0000-0000-0000-000000000003',
            documentTitle: 'Giới thiệu TaskMate',
            sectionAnchor: 'Tổng quan',
            lineStart: 1,
            lineEnd: 5,
            authority: 'server',
            evidenceClass: 'OBSERVED',
            snapshotId: 'gsnap_3',
            publishedContentHash: 'c'.repeat(64),
            citedExcerpt: 'TaskMate là ứng dụng quản lý tác vụ cá nhân và năng suất làm việc.',
          },
        ],
        paths: [], // 0 graph paths (vector/fulltext only)
        conflicts: [],
        scope: null,
        modalityDiagnostics: null,
        coverageWarnings: [],
        fallbackReason: 'NONE',
        routerVersion: null,
        promptVersion: 'v1',
        modelId: 'gpt-4o',
        createdAt: new Date().toISOString(),
      },
      createdAt: '2026-10-03T10:09:00Z',
    };

    const { container } = render(
      <ChatMessageBubble
        message={vectorOnlyMessage}
        groundedCallbacks={{ onCitationActivate: handleActivate }}
      />
    );

    // [2024] is preserved in the text
    expect(screen.getByText(/\[2024\]/)).toBeInTheDocument();

    // Inline citation chip [1] MUST be rendered in the answer body
    const chips = container.querySelectorAll('.grounded-inline-chip');
    expect(chips.length).toBeGreaterThanOrEqual(1);
    expect(chips[0]).toHaveTextContent('[1]');

    fireEvent.click(chips[0]!);
    expect(handleActivate).toHaveBeenCalledWith(vectorOnlyMessage.grounding!.citations[0]);
  });

  it('renders unified and consistent border styling across all citation tags in Nguồn tài liệu', () => {
    const graphMessageWithMultipleCitations: ChatMessage = {
      id: 'msg-graph-consistent-style',
      threadId: 'thread-1',
      role: 'assistant',
      content: '',
      grounding: {
        schemaVersion: 1,
        authority: 'server',
        outcome: 'READY',
        answer: {
          schemaVersion: 1,
          language: 'vi',
          conclusion: 'Tiến trình 60000004 xử lý dữ liệu [1].',
          claims: [
            {
              id: 'C1',
              text: 'Bước 1 thực thi.',
              classification: 'DIRECT',
              citationIds: ['S1'],
              pathId: null,
            },
          ],
          unsupportedParts: [],
        },
        citations: [
          {
            citationId: 'S1', // cited
            documentId: '00000000-0000-0000-0000-000000000001',
            documentTitle: 'Doc Server 1',
            sectionAnchor: 'Sec 1',
            lineStart: 1,
            lineEnd: 5,
            authority: 'server',
            evidenceClass: 'OBSERVED',
            snapshotId: 'gsnap_1',
            publishedContentHash: 'a'.repeat(64),
            citedExcerpt: 'Server excerpt 1',
          },
          {
            citationId: 'S2', // uncited
            documentId: '00000000-0000-0000-0000-000000000002',
            documentTitle: 'Doc Server 2',
            sectionAnchor: 'Sec 2',
            lineStart: 1,
            lineEnd: 5,
            authority: 'server',
            evidenceClass: 'OBSERVED',
            snapshotId: 'gsnap_2',
            publishedContentHash: 'b'.repeat(64),
            citedExcerpt: 'Server excerpt 2',
          },
          {
            citationId: 'L1', // local
            documentId: '00000000-0000-0000-0000-000000000003',
            documentTitle: 'Doc Local 1',
            sectionAnchor: 'Sec 3',
            lineStart: 1,
            lineEnd: 5,
            authority: 'local',
            evidenceClass: 'LOCAL',
            snapshotId: null,
            publishedContentHash: null,
            citedExcerpt: 'Local excerpt 1',
          },
        ],
        paths: [
          {
            pathId: 'P1',
            snapshotId: 'gsnap_1',
            nodeUrns: ['urn:1', 'urn:2'],
            edgeFactKeys: ['fact:1'],
            hopClassifications: ['OBSERVED'],
            hopCitationIds: [['S1']],
            classification: 'OBSERVED',
            hasConflict: false,
          },
        ],
        conflicts: [],
        scope: null,
        modalityDiagnostics: null,
        coverageWarnings: [],
        fallbackReason: 'NONE',
        routerVersion: null,
        promptVersion: 'v1',
        modelId: 'gpt-4o',
        createdAt: new Date().toISOString(),
      },
      createdAt: '2026-10-03T10:10:00Z',
    };

    const { container } = render(
      <ChatMessageBubble message={graphMessageWithMultipleCitations} />
    );

    const sourceTags = container.querySelectorAll('.ant-tag');
    expect(sourceTags.length).toBe(3);

    // Verify all 3 tags have identical unified border color (no dark blue vs gray mismatch)
    const borderColors = Array.from(sourceTags).map((tag) => (tag as HTMLElement).style.borderColor);
    expect(new Set(borderColors).size).toBe(1);
    expect(borderColors[0]).toBeTruthy();

    // Verify all 3 tags have identical unified background
    const bgColors = Array.from(sourceTags).map((tag) => (tag as HTMLElement).style.background);
    expect(new Set(bgColors).size).toBe(1);
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
    const retryBtn = screen.getByText('Thử lại');
    fireEvent.click(retryBtn);
    expect(handleRetry).toHaveBeenCalled();

    const settingsBtn = screen.getByText('Mở Cài đặt AI');
    fireEvent.click(settingsBtn);
    expect(handleOpenSettings).toHaveBeenCalled();
  });
});
