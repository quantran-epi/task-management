import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatTabBar, type ChatTabItem } from '../ChatTabBar';
import type { TabRuntimeStatus } from '../runtime/tabTypes';

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
    {
      id: 'chat-2',
      type: 'chat',
      title: '💬 Thiết kế API',
      threadId: 'thread-chat-2',
      createdAt: '2026-10-30T00:02:00.000Z',
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

  it('gán roving tabindex: tabIndex=0 cho active tab và -1 cho tab khác', () => {
    render(
      <ChatTabBar
        tabs={dummyTabs}
        activeTabId="chat-1"
        onSelectTab={vi.fn()}
        onAddTab={vi.fn()}
        onCloseTab={vi.fn()}
      />
    );

    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveAttribute('tabIndex', '-1');
    expect(tabs[1]).toHaveAttribute('tabIndex', '0');
    expect(tabs[2]).toHaveAttribute('tabIndex', '-1');
  });

  it('hiển thị aria-label và assistive text theo trạng thái tabStatuses', () => {
    const statuses: Record<string, TabRuntimeStatus> = {
      sdlc: 'processing',
      'chat-1': 'error',
      'chat-2': 'interrupted',
    };

    render(
      <ChatTabBar
        tabs={dummyTabs}
        activeTabId="chat-1"
        tabStatuses={statuses}
        onSelectTab={vi.fn()}
        onAddTab={vi.fn()}
        onCloseTab={vi.fn()}
      />
    );

    const sdlcTab = screen.getByRole('tab', { name: /⚙️ SDLC: CR-001 — Đang xử lý/ });
    expect(sdlcTab).toBeInTheDocument();

    const chat1Tab = screen.getByRole('tab', { name: /💬 Tra cứu Oracle — Lỗi/ });
    expect(chat1Tab).toBeInTheDocument();

    const chat2Tab = screen.getByRole('tab', { name: /💬 Thiết kế API — Bị gián đoạn/ });
    expect(chat2Tab).toBeInTheDocument();
  });

  it('hỗ trợ điều hướng bàn phím ArrowRight, ArrowLeft, Home, End', () => {
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

    const tabs = screen.getAllByRole('tab');
    tabs[0]!.focus();

    fireEvent.keyDown(tabs[0]!, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tabs[1]);

    fireEvent.keyDown(tabs[1]!, { key: 'End' });
    expect(document.activeElement).toBe(tabs[2]);

    fireEvent.keyDown(tabs[2]!, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(tabs[1]);

    fireEvent.keyDown(tabs[1]!, { key: 'Home' });
    expect(document.activeElement).toBe(tabs[0]);
  });

  it('hỗ trợ Enter và Space để chọn tab khi focus', () => {
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

    const tabs = screen.getAllByRole('tab');
    fireEvent.keyDown(tabs[1]!, { key: 'Enter' });
    expect(handleSelect).toHaveBeenCalledWith('chat-1');

    fireEvent.keyDown(tabs[2]!, { key: ' ' });
    expect(handleSelect).toHaveBeenCalledWith('chat-2');
  });

  it('hỗ trợ Delete và Backspace để đóng tab chat thường, không đóng tab SDLC', () => {
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

    const tabs = screen.getAllByRole('tab');
    // Tab SDLC: Delete không làm gì
    fireEvent.keyDown(tabs[0]!, { key: 'Delete' });
    expect(handleClose).not.toHaveBeenCalled();

    // Tab chat thường: Delete gọi onCloseTab
    fireEvent.keyDown(tabs[1]!, { key: 'Delete' });
    expect(handleClose).toHaveBeenCalledWith('chat-1');

    // Tab chat thường: Backspace gọi onCloseTab
    fireEvent.keyDown(tabs[2]!, { key: 'Backspace' });
    expect(handleClose).toHaveBeenCalledWith('chat-2');
  });
});
