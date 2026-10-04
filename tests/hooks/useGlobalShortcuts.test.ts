import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGlobalShortcuts } from '../../src/hooks/useGlobalShortcuts';
import { isMacPlatform } from '../../src/utils/keyboard';

describe('useGlobalShortcuts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const isMac = isMacPlatform();
  const modProp = isMac ? { metaKey: true } : { ctrlKey: true };

  it('triggers navigation on Alt + 1..7', () => {
    const onNavigate = vi.fn();
    renderHook(() =>
      useGlobalShortcuts({
        currentRoute: 'dashboard',
        onNavigate,
        onTogglePalette: vi.fn(),
        onToggleAiChat: vi.fn(),
        onCreateTask: vi.fn(),
        onCreateNote: vi.fn(),
        onToggleSidebar: vi.fn(),
      })
    );

    // Alt + 2 -> tasks
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '2', altKey: true, bubbles: true }));
    expect(onNavigate).toHaveBeenCalledWith('tasks');

    // Alt + 5 -> notes
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '5', altKey: true, bubbles: true }));
    expect(onNavigate).toHaveBeenCalledWith('notes');
  });

  it('triggers global actions with Mod combinations', () => {
    const onTogglePalette = vi.fn();
    const onToggleAiChat = vi.fn();
    const onCreateTask = vi.fn();
    const onCreateNote = vi.fn();
    const onToggleSidebar = vi.fn();

    renderHook(() =>
      useGlobalShortcuts({
        currentRoute: 'tasks',
        onNavigate: vi.fn(),
        onTogglePalette,
        onToggleAiChat,
        onCreateTask,
        onCreateNote,
        onToggleSidebar,
      })
    );

    // Mod + K -> palette
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ...modProp, bubbles: true }));
    expect(onTogglePalette).toHaveBeenCalledTimes(1);

    // Mod + J -> AI chat
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', ...modProp, bubbles: true }));
    expect(onToggleAiChat).toHaveBeenCalledTimes(1);

    // Mod + N -> new task
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ...modProp, bubbles: true }));
    expect(onCreateTask).toHaveBeenCalledTimes(1);

    // Mod + Shift + N -> new note
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'n', shiftKey: true, ...modProp, bubbles: true })
    );
    expect(onCreateNote).toHaveBeenCalledTimes(1);

    // Mod + B -> toggle sidebar
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ...modProp, bubbles: true }));
    expect(onToggleSidebar).toHaveBeenCalledTimes(1);
  });

  it('opens HUD on Shift + ? and toggles with Esc', () => {
    const { result } = renderHook(() =>
      useGlobalShortcuts({
        currentRoute: 'tasks',
        onNavigate: vi.fn(),
        onTogglePalette: vi.fn(),
        onToggleAiChat: vi.fn(),
        onCreateTask: vi.fn(),
        onCreateNote: vi.fn(),
        onToggleSidebar: vi.fn(),
      })
    );

    expect(result.current.hudOpen).toBe(false);

    // Press Shift + ?
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '?', shiftKey: true, bubbles: true }));
    });
    expect(result.current.hudOpen).toBe(true);

    // Press Escape
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(result.current.hudOpen).toBe(false);
  });

  it('opens HUD after holding Alt for 200ms', () => {
    const { result } = renderHook(() =>
      useGlobalShortcuts({
        currentRoute: 'tasks',
        onNavigate: vi.fn(),
        onTogglePalette: vi.fn(),
        onToggleAiChat: vi.fn(),
        onCreateTask: vi.fn(),
        onCreateNote: vi.fn(),
        onToggleSidebar: vi.fn(),
      })
    );

    expect(result.current.hudOpen).toBe(false);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', altKey: true, bubbles: true }));
    });
    expect(result.current.hudOpen).toBe(false);

    // Advance 210ms
    act(() => {
      vi.advanceTimersByTime(210);
    });
    expect(result.current.hudOpen).toBe(true);
  });
});
