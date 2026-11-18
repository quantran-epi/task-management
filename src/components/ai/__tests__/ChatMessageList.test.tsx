// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import type { ChatMessage } from '../../../types/models';
import { ChatMessageList } from '../ChatMessageList';

describe('ChatMessageList initial read position', () => {
  afterEach(() => vi.restoreAllMocks());
  const messages: ChatMessage[] = [{
    id: 'read', threadId: 'thread', role: 'user', content: 'Tin đã đọc', createdAt: '2026-11-13T00:00:00Z',
  }];
  it('waits for saved cursor then opens at bottom when everything was read', () => {
    const scroll = vi.fn();
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scroll;
    try {
      const { rerender } = render(<ChatMessageList messages={[]} readPositionReady={false} lastReadMessageId={null} onMessageRead={vi.fn()} />);
      expect(scroll).not.toHaveBeenCalled();
      rerender(<ChatMessageList messages={messages} readPositionReady lastReadMessageId="read" onMessageRead={vi.fn()} />);
      expect(scroll).toHaveBeenCalledWith({ behavior: 'auto' });
    } finally {
      HTMLElement.prototype.scrollIntoView = original;
    }
  });
});

describe('ChatMessageList scroll-to-bottom on send (team chat read-tracking host)', () => {
  afterEach(() => vi.restoreAllMocks());

  /**
   * Oracle: specified. The transcript must be pinned to bottom AFTER the user's sent row is
   * rendered. Team chat passes `onMessageRead`, so `followingRef` starts false and the passive
   * new-message scroll is disabled — the explicit send scroll is the only one available.
   * Boundary neighbours: scrollTrigger 0 (no send) and a second messages update (one row vs two).
   */
  it('scrolls after the persisted message row renders, not only when the trigger bumps', () => {
    const scroll = vi.fn();
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scroll;
    try {
      const first: ChatMessage[] = [{
        id: 'm1', threadId: 't', role: 'user', content: 'first', createdAt: '2026-11-17T00:00:00Z',
      }];
      const afterSend: ChatMessage[] = [
        ...first,
        { id: 'm2', threadId: 't', role: 'user', content: 'sent', createdAt: '2026-11-17T00:00:01Z' },
      ];
      const renderList = (messages: ChatMessage[], scrollTrigger: number) => (
        <ChatMessageList
          messages={messages}
          readPositionReady
          lastReadMessageId={null}
          onMessageRead={vi.fn()}
          scrollTrigger={scrollTrigger}
        />
      );
      const { rerender } = render(renderList(first, 0));
      scroll.mockClear();

      // Send fires: the trigger bumps before the row is persisted/visible.
      rerender(renderList(first, 1));
      // The row arrives from the live query; this is when bottom-scrolling must happen.
      scroll.mockClear();
      rerender(renderList(afterSend, 1));

      expect(scroll).toHaveBeenCalledWith({ behavior: 'auto' });
    } finally {
      HTMLElement.prototype.scrollIntoView = original;
    }
  });
});

describe('ChatMessageList notification target highlight', () => {
  afterEach(() => vi.restoreAllMocks());

  /**
   * Oracle: specified. A notification deeplink with a targetMessageId must scroll that row into
   * view and mark it with a test id so it can be visually highlighted. Boundary neighbours: no
   * target (nothing highlighted) and a target not present in the current window.
   */
  it('scrolls to and marks the target message', () => {
    const scroll = vi.fn();
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scroll;
    try {
      const messages: ChatMessage[] = [
        { id: 'm1', threadId: 't', role: 'user', content: 'first', createdAt: '2026-11-18T00:00:00Z' },
        { id: 'm2', threadId: 't', role: 'assistant', content: 'target', createdAt: '2026-11-18T00:00:01Z' },
      ];
      render(
        <ChatMessageList
          messages={messages}
          readPositionReady
          lastReadMessageId={null}
          targetMessageId="m2"
        />
      );
      expect(screen.getByTestId('chat-target-message')).toBeTruthy();
      expect(screen.getByTestId('chat-target-message').getAttribute('data-chat-message-id')).toBe('m2');
      expect(scroll).toHaveBeenCalledWith({ block: 'center', behavior: 'auto' });
    } finally {
      HTMLElement.prototype.scrollIntoView = original;
    }
  });

  it('does not scroll to the read position when a notification target is set', () => {
    const scroll = vi.fn();
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scroll;
    try {
      const messages: ChatMessage[] = [
        { id: 'm1', threadId: 't', role: 'user', content: 'first', createdAt: '2026-11-18T00:00:00Z' },
        { id: 'm2', threadId: 't', role: 'user', content: 'target', createdAt: '2026-11-18T00:00:01Z' },
      ];
      render(
        <ChatMessageList
          messages={messages}
          readPositionReady
          lastReadMessageId="m1"
          targetMessageId="m2"
        />
      );
      // Only the center-scroll for the target; never the bottom/read-anchor scroll.
      expect(scroll).toHaveBeenCalledWith({ block: 'center', behavior: 'auto' });
      expect(scroll).not.toHaveBeenCalledWith({ behavior: 'auto' });
    } finally {
      HTMLElement.prototype.scrollIntoView = original;
    }
  });

  it('marks no target when targetMessageId is absent', () => {
    const messages: ChatMessage[] = [
      { id: 'm1', threadId: 't', role: 'user', content: 'first', createdAt: '2026-11-18T00:00:00Z' },
    ];
    render(<ChatMessageList messages={messages} readPositionReady lastReadMessageId={null} />);
    expect(screen.queryByTestId('chat-target-message')).toBeNull();
  });
});

describe('ChatMessageList pendingConfirmation rendering', () => {
  it('renders markdown summary properly in confirmation card and opens popout modal', () => {
    const onConfirmAction = vi.fn();
    const markdownSummary = '### Thay đổi dự kiến\n- **Tác vụ**: Cập nhật DB\n- Ước tính: `30p`';

    render(
      <ChatMessageList
        messages={[]}
        pendingConfirmation={{
          toolName: 'update_task',
          summary: markdownSummary,
        }}
        onConfirmAction={onConfirmAction}
      />
    );

    // Confirmation card exists
    const card = screen.getByTestId('ai-mutation-confirmation');
    expect(card).toBeInTheDocument();

    // Check rendered markdown tags (strong and code tags rendered, not raw markdown)
    expect(card.querySelector('strong')?.textContent).toBe('Tác vụ');
    expect(card.querySelector('code')?.textContent).toBe('30p');

    // Popout button exists
    const expandBtn = screen.getByRole('button', { name: /mở rộng chi tiết xác nhận/i });
    expect(expandBtn).toBeInTheDocument();

    // Click popout to open modal
    fireEvent.click(expandBtn);

    // Modal opens and shows confirmation buttons inside modal
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog.querySelector('strong')?.textContent).toBe('Tác vụ');

    // Click Yes in modal
    const yesButtons = screen.getAllByRole('button', { name: /xác nhận thao tác/i });
    const targetYesButton = yesButtons[yesButtons.length - 1];
    expect(targetYesButton).toBeDefined();
    fireEvent.click(targetYesButton!);

    expect(onConfirmAction).toHaveBeenCalledWith(true);
  });

  it('handles rejection from confirmation card', () => {
    const onConfirmAction = vi.fn();
    render(
      <ChatMessageList
        messages={[]}
        pendingConfirmation={{
          toolName: 'delete_task',
          summary: 'Xóa vĩnh viễn tác vụ **Test**',
        }}
        onConfirmAction={onConfirmAction}
      />
    );

    const noBtn = screen.getByRole('button', { name: /từ chối thao tác/i });
    fireEvent.click(noBtn);
    expect(onConfirmAction).toHaveBeenCalledWith(false);
  });
});
