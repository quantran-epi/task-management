import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts } from '../../src/hooks/useKeyboardShortcuts';

describe('useKeyboardShortcuts', () => {
  it("triggers on '/' (search) and 'c' (quick-add) when focused in general body per D-29", () => {
    const onSearch = vi.fn();
    const onQuickAdd = vi.fn();
    const onEscape = vi.fn();

    renderHook(() =>
      useKeyboardShortcuts({
        onSearch,
        onQuickAdd,
        onEscape,
      })
    );

    // Trigger '/'
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    expect(onSearch).toHaveBeenCalledTimes(1);

    // Trigger 'c'
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }));
    expect(onQuickAdd).toHaveBeenCalledTimes(1);

    // Trigger 'Escape'
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('ignores shortcuts when event target is INPUT, TEXTAREA, or contentEditable per D-29 and T-02-04', () => {
    const onSearch = vi.fn();
    const onQuickAdd = vi.fn();
    const onEscape = vi.fn();

    renderHook(() =>
      useKeyboardShortcuts({
        onSearch,
        onQuickAdd,
        onEscape,
      })
    );

    const input = document.createElement('input');
    document.body.appendChild(input);

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    document.body.appendChild(editable);

    // Type 'c' inside input
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }));
    expect(onQuickAdd).not.toHaveBeenCalled();

    // Type '/' inside textarea
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    expect(onSearch).not.toHaveBeenCalled();

    // Type 'c' inside editable div
    editable.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }));
    expect(onQuickAdd).not.toHaveBeenCalled();

    // Cleanup
    document.body.removeChild(input);
    document.body.removeChild(textarea);
    document.body.removeChild(editable);
  });
});
