import { useEffect } from 'react';
import { executeAction } from '../actions/actionRegistry';

/**
 * useGlobalKeymap
 * Global keymap listener dispatching workbench shortcuts:
 * - Alt+1..5 -> Toggle tool window slots
 * - Ctrl+K / Cmd+K -> Search everywhere
 * - Alt+T -> Toggle timer
 * - Alt+Insert -> New task
 */
export function useGlobalKeymap(): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isInput =
        e.target instanceof HTMLElement &&
        (e.target.tagName === 'INPUT' ||
          e.target.tagName === 'TEXTAREA' ||
          e.target.isContentEditable ||
          e.target.getAttribute('role') === 'textbox');

      // Ctrl+K or Cmd+K (Search Everywhere)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        executeAction('search.everywhere');
        return;
      }

      // If user is actively typing in an input field, do not hijack Alt+key or Insert unless intended
      if (isInput) {
        return;
      }

      // Alt+1 .. Alt+5 tool windows
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        if (e.key === '1') {
          e.preventDefault();
          executeAction('view.toggle-projects');
          return;
        }
        if (e.key === '2') {
          e.preventDefault();
          executeAction('view.toggle-docs');
          return;
        }
        if (e.key === '3') {
          e.preventDefault();
          executeAction('view.toggle-ai-chat');
          return;
        }
        if (e.key === '4') {
          e.preventDefault();
          executeAction('view.toggle-notifications');
          return;
        }
        if (e.key === 't' || e.key === 'T') {
          e.preventDefault();
          executeAction('timer.toggle');
          return;
        }
        if (e.key === 'Insert') {
          e.preventDefault();
          executeAction('task.create');
          return;
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
}
