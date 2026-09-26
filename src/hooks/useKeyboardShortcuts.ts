import { useEffect, useRef } from 'react';

export interface KeyboardShortcutHandlers {
  onSearch?: () => void;
  onQuickAdd?: () => void;
  onEscape?: () => void;
}

/**
 * Global keyboard shortcut listener for '/', 'c', and 'Escape' (D-29, T-02-04).
 * Ignores keystrokes when the event target is inside an input, textarea, or contentEditable element.
 */
export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          Boolean(target.isContentEditable) ||
          target.getAttribute?.('contenteditable') === 'true' ||
          target.getAttribute?.('contenteditable') === '' ||
          Boolean(target.closest?.('[contenteditable="true"], [contenteditable=""]')) ||
          target.getAttribute?.('role') === 'textbox');

      if (e.key === 'Escape') {
        if (handlersRef.current.onEscape) {
          handlersRef.current.onEscape();
        }
        return;
      }

      // Ignore text entry keys if user is typing inside an editable field
      if (isInput) {
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        handlersRef.current.onSearch?.();
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        handlersRef.current.onQuickAdd?.();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
}
