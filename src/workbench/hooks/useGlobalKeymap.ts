import { useEffect } from 'react';
import { useMessage } from '../../components/ui';
import { executeAction, type ActionNotify } from '../actions/actionRegistry';

/**
 * useGlobalKeymap
 * Global keymap listener dispatching workbench shortcuts:
 * - Alt+1..5 -> Toggle tool window slots
 * - Ctrl+K / Cmd+K -> Search everywhere
 * - Alt+T -> Toggle timer
 * - Alt+Insert -> New task
 */
export function useGlobalKeymap(): void {
  const message = useMessage();
  const notify: ActionNotify = (kind, text) => message[kind](text);
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
        executeAction('search.everywhere', notify);
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
          executeAction('view.toggle-cr-explorer', notify);
          return;
        }
        if (e.key === '2') {
          e.preventDefault();
          executeAction('view.toggle-docs', notify);
          return;
        }
        if (e.key === '3') {
          e.preventDefault();
          executeAction('view.toggle-ai-chat', notify);
          return;
        }
        if (e.key === '4') {
          e.preventDefault();
          executeAction('view.toggle-notifications', notify);
          return;
        }
        if (e.key === '5') {
          e.preventDefault();
          executeAction('view.toggle-remote-explorer', notify);
          return;
        }
        if (e.key === '7') {
          e.preventDefault();
          executeAction('view.toggle-ai-office', notify);
          return;
        }
        if (e.key === '8') {
          e.preventDefault();
          executeAction('view.toggle-ai-staff', notify);
          return;
        }
        if (e.key === '9') {
          e.preventDefault();
          executeAction('view.toggle-tool-explorer', notify);
          return;
        }
        if (e.key === 'm' || e.key === 'M') {
          e.preventDefault();
          executeAction('view.open-mermaid-studio', notify);
          return;
        }
        if (e.key === '6') {
          e.preventDefault();
          executeAction('view.toggle-systems', notify);
          return;
        }
        if (e.key === 'F12') {
          e.preventDefault();
          executeAction('view.toggle-terminal', notify);
          return;
        }
        if (e.key === 't' || e.key === 'T') {
          e.preventDefault();
          executeAction('timer.toggle', notify);
          return;
        }
        if (e.key === 'r' || e.key === 'R') {
          e.preventDefault();
          executeAction('tab.reload-active', notify);
          return;
        }
        if (e.key === 'Insert') {
          e.preventDefault();
          executeAction('task.create', notify);
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
