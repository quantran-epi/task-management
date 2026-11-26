// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatHeader } from '../../src/components/ai/ChatHeader';
import { THEME_STORAGE_KEY } from '../../src/workbench/themeBroadcast';
import type { ThemeMode } from '../../src/styles/tokens';

const originalMatchMedia = window.matchMedia;

function seedMode(mode: ThemeMode): void {
  window.localStorage.setItem(THEME_STORAGE_KEY, mode);
}

function renderStandalone(onOpenSettings = vi.fn()) {
  return render(
    <ChatHeader
      isStandalone
      isPinned={false}
      onTogglePin={undefined}
      onClose={vi.fn()}
      onOpenSettings={onOpenSettings}
      connectionStatus="Knowledge · MCP sẵn sàng"
    />,
  );
}

describe('phase 51 standalone theme toggle', () => {
  beforeEach(() => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    window.localStorage.clear();
    seedMode('light');
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  });

  afterEach(() => {
    cleanup();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: originalMatchMedia,
    });
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    window.localStorage.clear();
  });

  it('light mode: Moon icon, tooltip hướng sang tối, accessible name đúng', async () => {
    const { container } = renderStandalone();
    const toggle = screen.getByTestId('chat-theme-toggle');
    expect(toggle).toHaveAccessibleName('Chuyển đổi giao diện sáng/tối');
    expect(container.querySelector('.anticon-moon')).not.toBeNull();
    expect(container.querySelector('.anticon-sun')).toBeNull();

    fireEvent.mouseEnter(toggle);
    expect((await screen.findByRole('tooltip')).textContent).toBe('Giao diện: Tối');
  });

  it('dark mode: Sun icon, tooltip hướng sang sáng', async () => {
    seedMode('dark');
    const { container } = renderStandalone();
    const toggle = screen.getByTestId('chat-theme-toggle');
    expect(container.querySelector('.anticon-sun')).not.toBeNull();
    expect(container.querySelector('.anticon-moon')).toBeNull();

    fireEvent.mouseEnter(toggle);
    expect((await screen.findByRole('tooltip')).textContent).toBe('Giao diện: Sáng');
  });

  it('click đổi mode, persist localStorage và đảo icon; chip/status/gear vẫn dùng được', () => {
    const onOpenSettings = vi.fn();
    const { container } = renderStandalone(onOpenSettings);
    const toggle = screen.getByTestId('chat-theme-toggle');

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    fireEvent.click(toggle);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(container.querySelector('.anticon-sun')).not.toBeNull();

    fireEvent.click(toggle);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(container.querySelector('.anticon-moon')).not.toBeNull();

    expect(screen.getByTestId('chat-global-scope-chip')).toBeInTheDocument();
    expect(screen.getByTestId('chat-connection-status')).toHaveTextContent('Knowledge · MCP sẵn sàng');
    fireEvent.click(screen.getByTestId('chat-settings-gear'));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('header thường không có toggle để tránh nhân đôi với TitleBar', () => {
    render(
      <ChatHeader
        isStandalone={false}
        isPinned={false}
        onTogglePin={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('chat-theme-toggle')).not.toBeInTheDocument();
  });

  it('geometry: header 34px, toggle 28x28, chip có ellipsis', () => {
    renderStandalone();
    const header = screen.getByTestId('chat-standalone-header');
    const toggle = screen.getByTestId('chat-theme-toggle');
    const chip = screen.getByTestId('chat-global-scope-chip');

    expect(header.style.height).toBe('34px');
    expect(toggle.style.width).toBe('28px');
    expect(toggle.style.height).toBe('28px');
    expect(chip.style.textOverflow).toBe('ellipsis');
    expect(chip.style.overflow).toBe('hidden');
    expect(chip.style.minWidth).toBe('0px');
  });
});
