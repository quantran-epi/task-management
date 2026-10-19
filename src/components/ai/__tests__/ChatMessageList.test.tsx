// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatMessageList } from '../ChatMessageList';

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
