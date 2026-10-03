import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AIDebugModal } from '../../src/components/ai/AIDebugModal';
import { ChatMessageList } from '../../src/components/ai/ChatMessageList';
import { ChatInputBar } from '../../src/components/ai/ChatInputBar';
import type { ChatMessage } from '../../src/types/models';

describe('AI Chat UI Bugfix & Enhancements', () => {
  describe('AIDebugModal modeless behavior', () => {
    it('renders modal with mask disabled and focus trap disabled so background input stays accessible', () => {
      const { baseElement } = render(
        <AIDebugModal open={true} onClose={vi.fn()} />
      );

      // Verify modal is rendered
      expect(screen.getByText('Nhật ký gỡ lỗi AI & Payloads')).toBeInTheDocument();

      // Mask should not be present when mask={false}
      const mask = baseElement.querySelector('.ant-modal-mask');
      expect(mask).toBeNull();

      // Modal wrap should allow clicks through to drawer
      const wrap = baseElement.querySelector('.ant-modal-wrap');
      expect(wrap).not.toBeNull();
      expect((wrap as HTMLElement).style.pointerEvents).toBe('none');
    });
  });

  describe('ChatMessageList scroll triggers', () => {
    it('renders messages and scrolls container', () => {
      const messages: ChatMessage[] = [
        {
          id: 'm1',
          threadId: 't1',
          role: 'user',
          content: 'Hello AI',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'm2',
          threadId: 't1',
          role: 'assistant',
          content: 'Hello! **I am ready**\n\n```js\nconst ok = true;\n```',
          createdAt: new Date().toISOString(),
        },
      ];

      const { container } = render(
        <ChatMessageList
          messages={messages}
          scrollTrigger={1}
        />
      );

      // Check that markdown content is rendered
      expect(screen.getByText('Hello AI')).toBeInTheDocument();
      expect(screen.getByText('I am ready')).toBeInTheDocument();
      expect(container.querySelector('pre.code-block')).not.toBeNull();
      expect(container.querySelector('code.language-js')).not.toBeNull();
    });

    it('renders mutation action confirmation card when pendingConfirmation is passed', () => {
      const handleConfirm = vi.fn();
      render(
        <ChatMessageList
          messages={[]}
          pendingConfirmation={{
            toolName: 'create_task',
            summary: 'Tạo tác vụ mới: "Fix login" [Ưu tiên: High] [Ước tính: 60p]',
          }}
          onConfirmAction={handleConfirm}
        />
      );

      expect(screen.getByTestId('ai-mutation-confirmation')).toBeInTheDocument();
      expect(screen.getByText('Xác nhận thực hiện hành động')).toBeInTheDocument();
      expect(screen.getByText(/Tạo tác vụ mới: "Fix login"/i)).toBeInTheDocument();
      expect(screen.getByLabelText('Xác nhận thao tác')).toBeInTheDocument();
      expect(screen.getByLabelText('Từ chối thao tác')).toBeInTheDocument();
    });
  });

  describe('ChatInputBar inline layout', () => {
    it('renders textarea and send button inline within a flex-row container', () => {
      const handleSubmit = vi.fn();
      const { container } = render(
        <ChatInputBar onSubmit={handleSubmit} />
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveStyle({ display: 'flex', 'flex-direction': 'row' });

      const textarea = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI');
      const sendBtn = screen.getByLabelText('Gửi tin nhắn');
      expect(textarea).toBeInTheDocument();
      expect(sendBtn).toBeInTheDocument();

      fireEvent.change(textarea, { target: { value: 'Test inline send' } });
      fireEvent.click(sendBtn);
      expect(handleSubmit).toHaveBeenCalledWith('Test inline send');
    });
  });
});
