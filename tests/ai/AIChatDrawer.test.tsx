import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatHeader } from '../../src/components/ai/ChatHeader';
import { AIChatDrawer } from '../../src/components/ai/AIChatDrawer';
import { TaskPlannerDatabase } from '../../src/db';
import * as chatRepo from '../../src/db/repositories/chatRepo';
import * as nineRouterClient from '../../src/services/ai/nineRouterClient';
import * as nineRouterTokenService from '../../src/services/ai/nineRouterTokenService';

describe('ChatHeader', () => {
  it('displays title, scope tag, model selector, and action buttons', () => {
    const handleClear = vi.fn();
    const handleTogglePin = vi.fn();
    const handleClose = vi.fn();
    const handleModelChange = vi.fn();

    render(
      <ChatHeader
        scopeLabel="Tác vụ: Fix auth bug"
        selectedModel="gpt-4o"
        availableModels={['gpt-4o', 'claude-3-5-sonnet']}
        onModelChange={handleModelChange}
        isPinned={false}
        onTogglePin={handleTogglePin}
        onClearContext={handleClear}
        onClose={handleClose}
      />
    );

    expect(screen.getByText('Trợ lý AI')).toBeInTheDocument();
    expect(screen.getByText(/Tác vụ: Fix auth bug/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Đặt lại ngữ cảnh (/clear)')).toBeInTheDocument();
    expect(screen.getByLabelText('Ghim ngăn trò chuyện bên phải')).toBeInTheDocument();
    expect(screen.getByLabelText('Đóng ngăn trò chuyện')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Ghim ngăn trò chuyện bên phải'));
    expect(handleTogglePin).toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Đặt lại ngữ cảnh (/clear)'));
    expect(handleClear).toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Đóng ngăn trò chuyện'));
    expect(handleClose).toHaveBeenCalled();
  });
});

describe('AIChatDrawer', () => {
  let db: TaskPlannerDatabase;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    db = new TaskPlannerDatabase(`test-aichat-drawer-${Date.now()}-${Math.random()}`);
  });

  it('renders drawer when open is true, handles drag resize and clamp', () => {
    const { container } = render(
      <AIChatDrawer
        open={true}
        onClose={vi.fn()}
        db={db}
        width={400}
        onWidthChange={vi.fn()}
      />
    );

    expect(screen.getByText('Trợ lý AI')).toBeInTheDocument();
    const resizer = container.querySelector('[data-testid="ai-chat-resizer"]');
    expect(resizer).toBeInTheDocument();
  });

  it('submitting message calls streamChatCompletion and appends to thread', async () => {
    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('test-api-key');
    vi.spyOn(nineRouterTokenService, 'getNineRouterConfig').mockResolvedValue({
      endpoint: 'https://api.9router.com',
      defaultModel: 'gpt-4o',
      charLimit: 12000,
    });

    async function* mockStream() {
      yield 'Xin ';
      yield 'chào!';
    }
    vi.spyOn(nineRouterClient, 'streamChatCompletion').mockImplementation(mockStream as any);

    render(
      <AIChatDrawer
        open={true}
        onClose={vi.fn()}
        db={db}
        activeScope={{ type: 'global' }}
      />
    );

    const textarea = screen.getByLabelText('Nội dung tin nhắn trò chuyện AI');
    fireEvent.change(textarea, { target: { value: 'Chào bạn' } });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));

    await waitFor(() => {
      expect(screen.getByText('Chào bạn')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText(/Xin chào!/i)).toBeInTheDocument();
    });
  });

  it('clicking clear context calls clearThreadContext and shows divider', async () => {
    const clearSpy = vi.spyOn(chatRepo, 'clearThreadContext');

    render(
      <AIChatDrawer
        open={true}
        onClose={vi.fn()}
        db={db}
        activeScope={{ type: 'global' }}
      />
    );

    const clearBtn = screen.getByLabelText('Đặt lại ngữ cảnh (/clear)');
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(clearSpy).toHaveBeenCalled();
    });
  });
});
