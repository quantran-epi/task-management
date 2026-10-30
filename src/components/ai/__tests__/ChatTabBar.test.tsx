import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatTabBar, type ChatTabItem } from '../ChatTabBar';

describe('ChatTabBar', () => {
  const dummyTabs: ChatTabItem[] = [
    {
      id: 'sdlc',
      type: 'sdlc',
      title: '⚙️ SDLC: CR-001',
      threadId: 'thread-sdlc-1',
      createdAt: '2026-10-30T00:00:00.000Z',
    },
    {
      id: 'chat-1',
      type: 'chat',
      title: '💬 Tra cứu Oracle',
      threadId: 'thread-chat-1',
      createdAt: '2026-10-30T00:01:00.000Z',
    },
  ];

  it('render đúng các tab', () => {
    render(
      <ChatTabBar
        tabs={dummyTabs}
        activeTabId="sdlc"
        onSelectTab={vi.fn()}
        onAddTab={vi.fn()}
        onCloseTab={vi.fn()}
      />
    );

    expect(screen.getByText('⚙️ SDLC: CR-001')).toBeInTheDocument();
    expect(screen.getByText('💬 Tra cứu Oracle')).toBeInTheDocument();
  });

  it('không có nút đóng cho tab SDLC, nhưng có nút đóng cho tab chat thường', () => {
    render(
      <ChatTabBar
        tabs={dummyTabs}
        activeTabId="sdlc"
        onSelectTab={vi.fn()}
        onAddTab={vi.fn()}
        onCloseTab={vi.fn()}
      />
    );

    expect(screen.queryByLabelText('Đóng ⚙️ SDLC: CR-001')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Đóng 💬 Tra cứu Oracle')).toBeInTheDocument();
  });

  it('kích hoạt onSelectTab khi click tab', () => {
    const handleSelect = vi.fn();
    render(
      <ChatTabBar
        tabs={dummyTabs}
        activeTabId="sdlc"
        onSelectTab={handleSelect}
        onAddTab={vi.fn()}
        onCloseTab={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('💬 Tra cứu Oracle'));
    expect(handleSelect).toHaveBeenCalledWith('chat-1');
  });

  it('kích hoạt onAddTab khi click nút +', () => {
    const handleAdd = vi.fn();
    render(
      <ChatTabBar
        tabs={dummyTabs}
        activeTabId="sdlc"
        onSelectTab={vi.fn()}
        onAddTab={handleAdd}
        onCloseTab={vi.fn()}
      />
    );

    fireEvent.click(screen.getByLabelText('Mở tab chat AI mới'));
    expect(handleAdd).toHaveBeenCalled();
  });

  it('kích hoạt onCloseTab khi click nút đóng tab thường', () => {
    const handleClose = vi.fn();
    render(
      <ChatTabBar
        tabs={dummyTabs}
        activeTabId="sdlc"
        onSelectTab={vi.fn()}
        onAddTab={vi.fn()}
        onCloseTab={handleClose}
      />
    );

    fireEvent.click(screen.getByLabelText('Đóng 💬 Tra cứu Oracle'));
    expect(handleClose).toHaveBeenCalledWith('chat-1');
  });

  it('hiển thị indicator Analysis Mode cho tab SDLC và các tab chat được bật', () => {
    render(
      <ChatTabBar
        tabs={dummyTabs}
        activeTabId="sdlc"
        tabAnalysisModes={{ 'chat-1': true }}
        onSelectTab={vi.fn()}
        onAddTab={vi.fn()}
        onCloseTab={vi.fn()}
      />
    );

    const icons = screen.getAllByLabelText('Analysis Mode');
    expect(icons.length).toBe(2); // cả sdlc và chat-1 đều có
  });
});
