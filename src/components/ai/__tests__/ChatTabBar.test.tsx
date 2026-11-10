import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatTabBar, type ChatTabItem } from '../ChatTabBar';
import type { TabRuntimeStatus } from '../runtime/tabTypes';

// jsdom cannot activate dnd-kit's pointer/keyboard sensors (no layout rects), so the
// drag gesture is simulated by invoking the DndContext's onDragEnd with ids.
vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  return {
    ...actual,
    DndContext: ({
      children,
      onDragEnd,
    }: {
      children: ReactNode;
      onDragEnd: (event: { active: { id: string }; over: { id: string } }) => void;
    }) => (
      <>
        <button
          type="button"
          data-testid="simulate-drag"
          onClick={() => onDragEnd({ active: { id: 'chat-1' }, over: { id: 'chat-2' } })}
        />
        {children}
      </>
    ),
  };
});

describe('ChatTabBar', () => {
  const dummyTabs: ChatTabItem[] = [
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
        activeTabId="chat-1"
        onSelectTab={vi.fn()}
        onAddTab={vi.fn()}
        onCloseTab={vi.fn()}
      />
    );

    expect(screen.getByText('💬 Tra cứu Oracle')).toBeInTheDocument();
    expect(screen.getByText('💬 Thiết kế API')).toBeInTheDocument();
  });

  it('kích hoạt onSelectTab khi click tab', () => {
    const handleSelect = vi.fn();
    render(
      <ChatTabBar
        tabs={dummyTabs}
        activeTabId="chat-1"
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
        activeTabId="chat-1"
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
        activeTabId="chat-1"
        onSelectTab={vi.fn()}
        onAddTab={vi.fn()}
        onCloseTab={handleClose}
      />
    );

    fireEvent.click(screen.getByLabelText('Đóng 💬 Tra cứu Oracle'));
    expect(handleClose).toHaveBeenCalledWith('chat-1');
  });

  it('hiển thị indicator Analysis Mode cho tab chat được bật', () => {
    render(
      <ChatTabBar
        tabs={dummyTabs}
        activeTabId="chat-1"
        tabAnalysisModes={{ 'chat-1': true }}
        onSelectTab={vi.fn()}
        onAddTab={vi.fn()}
        onCloseTab={vi.fn()}
      />
    );

    const icons = screen.getAllByLabelText('Analysis Mode');
    expect(icons.length).toBe(1);
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
    expect(tabs[0]).toHaveAttribute('tabIndex', '0');
    expect(tabs[1]).toHaveAttribute('tabIndex', '-1');
  });

  it('hiển thị aria-label và assistive text theo trạng thái tabStatuses', () => {
    const statuses: Record<string, TabRuntimeStatus> = {
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
        activeTabId="chat-1"
        onSelectTab={handleSelect}
        onAddTab={vi.fn()}
        onCloseTab={vi.fn()}
      />
    );

    const tabs = screen.getAllByRole('tab');
    tabs[0]!.focus();

    fireEvent.keyDown(tabs[0]!, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tabs[1]);

    fireEvent.keyDown(tabs[1]!, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(tabs[0]);

    fireEvent.keyDown(tabs[0]!, { key: 'End' });
    expect(document.activeElement).toBe(tabs[1]);

    fireEvent.keyDown(tabs[1]!, { key: 'Home' });
    expect(document.activeElement).toBe(tabs[0]);
  });

  it('hỗ trợ Enter và Space để chọn tab khi focus', () => {
    const handleSelect = vi.fn();
    render(
      <ChatTabBar
        tabs={dummyTabs}
        activeTabId="chat-1"
        onSelectTab={handleSelect}
        onAddTab={vi.fn()}
        onCloseTab={vi.fn()}
      />
    );

    const tabs = screen.getAllByRole('tab');
    fireEvent.keyDown(tabs[0]!, { key: 'Enter' });
    expect(handleSelect).toHaveBeenCalledWith('chat-1');

    fireEvent.keyDown(tabs[1]!, { key: ' ' });
    expect(handleSelect).toHaveBeenCalledWith('chat-2');
  });

  it('hỗ trợ Delete và Backspace để đóng tab chat thường', () => {
    const handleClose = vi.fn();
    render(
      <ChatTabBar
        tabs={dummyTabs}
        activeTabId="chat-1"
        onSelectTab={vi.fn()}
        onAddTab={vi.fn()}
        onCloseTab={handleClose}
      />
    );

    const tabs = screen.getAllByRole('tab');
    // Tab chat thường: Delete gọi onCloseTab
    fireEvent.keyDown(tabs[0]!, { key: 'Delete' });
    expect(handleClose).toHaveBeenCalledWith('chat-1');

    // Tab chat thường: Backspace gọi onCloseTab
    fireEvent.keyDown(tabs[1]!, { key: 'Backspace' });
    expect(handleClose).toHaveBeenCalledWith('chat-2');
  });

  describe('inline rename (D-03/SC-1)', () => {
    const renderBar = (onRenameTab = vi.fn()) => {
      render(
        <ChatTabBar
          tabs={dummyTabs}
          activeTabId="chat-1"
          onSelectTab={vi.fn()}
          onAddTab={vi.fn()}
          onCloseTab={vi.fn()}
          onRenameTab={onRenameTab}
        />
      );
      return onRenameTab;
    };

    it('mở editor khi nhấn F2 và lưu bằng Enter', () => {
      const onRenameTab = renderBar();
      const tabs = screen.getAllByRole('tab');

      fireEvent.keyDown(tabs[0]!, { key: 'F2' });
      const input = screen.getByLabelText('Đổi tên tab');
      expect(input).toHaveValue('💬 Tra cứu Oracle');

      fireEvent.change(input, { target: { value: 'Tên mới' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onRenameTab).toHaveBeenCalledWith('chat-1', 'Tên mới');
      expect(screen.queryByLabelText('Đổi tên tab')).not.toBeInTheDocument();
    });

    it('mở editor bằng double-click và hủy bằng Escape', () => {
      const onRenameTab = renderBar();
      fireEvent.doubleClick(screen.getByText('💬 Tra cứu Oracle'));

      const input = screen.getByLabelText('Đổi tên tab');
      fireEvent.change(input, { target: { value: 'Không lưu' } });
      fireEvent.keyDown(input, { key: 'Escape' });

      expect(onRenameTab).not.toHaveBeenCalled();
      expect(screen.queryByLabelText('Đổi tên tab')).not.toBeInTheDocument();
    });

    it('không gọi onRenameTab khi tiêu đề rỗng hoặc không đổi', () => {
      const onRenameTab = renderBar();
      const tabs = screen.getAllByRole('tab');

      fireEvent.keyDown(tabs[0]!, { key: 'F2' });
      fireEvent.change(screen.getByLabelText('Đổi tên tab'), { target: { value: '   ' } });
      fireEvent.keyDown(screen.getByLabelText('Đổi tên tab'), { key: 'Enter' });
      expect(onRenameTab).not.toHaveBeenCalled();

      fireEvent.keyDown(tabs[0]!, { key: 'F2' });
      fireEvent.change(screen.getByLabelText('Đổi tên tab'), {
        target: { value: '💬 Tra cứu Oracle' },
      });
      fireEvent.keyDown(screen.getByLabelText('Đổi tên tab'), { key: 'Enter' });
      expect(onRenameTab).not.toHaveBeenCalled();
    });
  });

  describe('drag-and-drop & scrollable tabs', () => {
    it('mỗi tab chat thường được wire làm sortable', () => {
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
      expect(tabs[0]).toHaveAttribute('aria-roledescription', 'sortable');
      expect(tabs[1]).toHaveAttribute('aria-roledescription', 'sortable');
      expect(tabs[0]).not.toHaveAttribute('aria-disabled', 'true');
      expect(tabs[1]).not.toHaveAttribute('aria-disabled', 'true');
    });

    it('kéo thả tab thường kích hoạt onReorderTabs(fromIndex, toIndex)', () => {
      const handleReorder = vi.fn();
      render(
        <ChatTabBar
          tabs={dummyTabs}
          activeTabId="chat-1"
          onSelectTab={vi.fn()}
          onAddTab={vi.fn()}
          onCloseTab={vi.fn()}
          onReorderTabs={handleReorder}
        />
      );

      // Drag chat-1 (index 0) onto chat-2 (index 1).
      fireEvent.click(screen.getByTestId('simulate-drag'));

      expect(handleReorder).toHaveBeenCalledWith(0, 1);
    });

    it('hỗ trợ cuộn chuột ngang onWheel trên container', () => {
      render(
        <ChatTabBar
          tabs={dummyTabs}
          activeTabId="chat-1"
          onSelectTab={vi.fn()}
          onAddTab={vi.fn()}
          onCloseTab={vi.fn()}
        />
      );

      const tablist = screen.getByRole('tablist');
      // Ban đầu scrollLeft = 0
      expect(tablist.scrollLeft).toBe(0);

      fireEvent.wheel(tablist, { deltaY: 50 });
      expect(tablist.scrollLeft).toBe(50);
    });

    it('nút đóng tab có flexShrink 0', () => {
      render(
        <ChatTabBar
          tabs={dummyTabs}
          activeTabId="chat-1"
          onSelectTab={vi.fn()}
          onAddTab={vi.fn()}
          onCloseTab={vi.fn()}
        />
      );

      const closeBtn = screen.getByLabelText('Đóng 💬 Tra cứu Oracle');
      expect(closeBtn).toHaveStyle({ flexShrink: 0 });
    });
  });
});
