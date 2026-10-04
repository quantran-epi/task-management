import { useEffect, useRef } from 'react';
import { isInputFocused, isModPressed } from '../utils/keyboard';

export interface KeyboardShortcutHandlers {
  onSearch?: () => void;
  onQuickAdd?: () => void;
  onEscape?: () => void;
  onNextTask?: () => void;
  onPrevTask?: () => void;
  onToggleStatus?: () => void;
  onToggleTimer?: () => void;
  onEditTask?: () => void;
  onDeleteTask?: () => void;
}

/**
 * Keyboard shortcut listener supporting global and view-scoped actions.
 * Multi-key combinations work even when modifier keys are used.
 * Ignores text entry shortcuts when user is actively typing inside an editable field.
 */
export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isInput = isInputFocused(e.target);

      // Escape always works
      if (e.key === 'Escape') {
        handlersRef.current.onEscape?.();
        return;
      }

      // Ignore single character or text keys if user is typing inside an editable field
      if (isInput) {
        return;
      }

      // Mod + E: Edit selected task
      if (isModPressed(e) && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        handlersRef.current.onEditTask?.();
        return;
      }

      // Mod + Backspace / Delete: Delete selected task
      if (isModPressed(e) && (e.key === 'Backspace' || e.key === 'Delete')) {
        e.preventDefault();
        handlersRef.current.onDeleteTask?.();
        return;
      }

      // Alt + ArrowDown: Focus next task
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key === 'ArrowDown') {
        e.preventDefault();
        handlersRef.current.onNextTask?.();
        return;
      }

      // Alt + ArrowUp: Focus previous task
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key === 'ArrowUp') {
        e.preventDefault();
        handlersRef.current.onPrevTask?.();
        return;
      }

      // Alt + Enter: Toggle task complete status
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key === 'Enter') {
        e.preventDefault();
        handlersRef.current.onToggleStatus?.();
        return;
      }

      // Alt + Space: Toggle timer
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === ' ' || e.code === 'Space')) {
        e.preventDefault();
        handlersRef.current.onToggleTimer?.();
        return;
      }

      // Search: '/' or Mod+F
      if (e.key === '/' || (isModPressed(e) && e.key.toLowerCase() === 'f')) {
        e.preventDefault();
        handlersRef.current.onSearch?.();
        return;
      }

      // Quick add: 'c' / 'C'
      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        handlersRef.current.onQuickAdd?.();
        return;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
}
