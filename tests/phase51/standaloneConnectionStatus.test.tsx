// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatHeader } from '../../src/components/ai/ChatHeader';

describe('phase 51 standalone connection status (WR-06)', () => {
  afterEach(() => {
    cleanup();
  });

  it('standalone header có node trạng thái kết nối aria-live và giữ chip/gear', () => {
    render(
      <ChatHeader
        isPinned={false}
        onTogglePin={undefined}
        onClose={vi.fn()}
        onOpenSettings={vi.fn()}
        connectionStatus="Knowledge · MCP sẵn sàng"
      />
    );

    const status = screen.getByTestId('chat-connection-status');
    expect(status).toHaveAttribute('role', 'status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Knowledge · MCP sẵn sàng');
    expect(screen.getByText('Global · không có ngữ cảnh TaskMate')).toBeInTheDocument();
    expect(screen.getByLabelText('Mở Cài đặt AI')).toBeInTheDocument();
  });

  it('workbench header shows settings gear when onOpenSettings is provided without standalone chip', () => {
    const onOpenSettings = vi.fn();
    render(
      <ChatHeader
        isPinned={false}
        onTogglePin={vi.fn()}
        onClose={vi.fn()}
        onOpenSettings={onOpenSettings}
      />
    );

    const gear = screen.getByTestId('chat-settings-gear');
    expect(gear).toHaveAccessibleName('Mở Cài đặt AI');
    fireEvent.click(gear);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('chat-global-scope-chip')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chat-connection-status')).not.toBeInTheDocument();
  });

  it('explicit isStandalone keeps standalone header even when other host props are present', () => {
    render(
      <ChatHeader
        isStandalone
        isPinned={false}
        onTogglePin={undefined}
        onClose={vi.fn()}
        onOpenSettings={vi.fn()}
        connectionStatus="Knowledge · MCP sẵn sàng"
      />
    );

    expect(screen.getByTestId('chat-global-scope-chip')).toBeInTheDocument();
    expect(screen.getByTestId('chat-settings-gear')).toHaveAccessibleName('Mở Cài đặt AI');
  });

  it('legacy header giữ control cũ, không có node trạng thái mới', () => {
    render(
      <ChatHeader
        isPinned={false}
        onTogglePin={vi.fn()}
        onClose={vi.fn()}
        onPopout={vi.fn()}
      />
    );

    expect(screen.queryByTestId('chat-connection-status')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Mở cửa sổ riêng (Popout)')).toBeInTheDocument();
    expect(screen.getByLabelText('Tùy chọn khác')).toBeInTheDocument();
  });
});
