import { useEffect, useRef } from 'react';
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
  // Keep the listener's notify current even if the AntD holder re-mounts and
  // useMessage() returns a fresh instance (WR-02: stale-closure guard).
  const notifyRef = useRef<ActionNotify>((kind, text) => message[kind](text));
  notifyRef.current = (kind, text) => message[kind](text);
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
        executeAction('search.everywhere', notifyRef.current);
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
          executeAction('view.toggle-cr-explorer', notifyRef.current);
          return;
        }
        if (e.key === '2') {
          e.preventDefault();
          executeAction('view.toggle-docs', notifyRef.current);
          return;
        }
        if (e.key === '3') {
          e.preventDefault();
          executeAction('view.toggle-ai-chat', notifyRef.current);
          return;
        }
        if (e.key === '4') {
          e.preventDefault();
          executeAction('view.toggle-notifications', notifyRef.current);
          return;
        }
        if (e.key === '5') {
          e.preventDefault();
          executeAction('view.toggle-remote-explorer', notifyRef.current);
          return;
        }
        if (e.key === '7') {
          e.preventDefault();
          executeAction('view.toggle-ai-office', notifyRef.current);
          return;
        }
        if (e.key === '8') {
          e.preventDefault();
          executeAction('view.toggle-ai-staff', notifyRef.current);
          return;
        }
        if (e.key === '9') {
          e.preventDefault();
          executeAction('view.toggle-tool-explorer', notifyRef.current);
          return;
        }
        if (e.key === 'm' || e.key === 'M') {
          e.preventDefault();
          executeAction('view.open-mermaid-studio', notifyRef.current);
          return;
        }
        if (e.key === '6') {
          e.preventDefault();
          executeAction('view.toggle-systems', notifyRef.current);
          return;
        }
        if (e.key === 'F12') {
          e.preventDefault();
          executeAction('view.toggle-terminal', notifyRef.current);
          return;
        }
        if (e.key === 't' || e.key === 'T') {
          e.preventDefault();
          executeAction('timer.toggle', notifyRef.current);
          return;
        }
        if (e.key === 'r' || e.key === 'R') {
          e.preventDefault();
          executeAction('tab.reload-active', notifyRef.current);
          return;
        }
        if (e.key === 'Insert') {
          e.preventDefault();
          executeAction('task.create', notifyRef.current);
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
