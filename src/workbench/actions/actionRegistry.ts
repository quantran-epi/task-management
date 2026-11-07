import { useLayoutStore } from '../store/layoutStore';
import { useSyncExternalStore } from 'react';

export interface ActionDefinition {
  id: string;
  title: string;
  category: string;
  shortcut?: string;
  icon?: string;
  perform: () => void;
}

const actionsRegistry = new Map<string, ActionDefinition>();
const listeners = new Set<() => void>();

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Register an action. Returns an unregister function.
 * T-25.4-05: Only invoke pre-registered, strictly whitelisted action IDs; never accept dynamic eval strings.
 */
export function registerAction(action: ActionDefinition): () => void {
  actionsRegistry.set(action.id, action);
  notifyListeners();
  return () => {
    actionsRegistry.delete(action.id);
    notifyListeners();
  };
}

export function getAction(id: string): ActionDefinition | undefined {
  return actionsRegistry.get(id);
}

export function getAllActions(): ActionDefinition[] {
  return Array.from(actionsRegistry.values());
}

export function executeAction(id: string): void {
  const action = actionsRegistry.get(id);
  if (action && typeof action.perform === 'function') {
    action.perform();
  }
}

export function clearCustomActions(): void {
  actionsRegistry.clear();
  notifyListeners();
}

/**
 * React hook to observe registered actions.
 */
export function useActionRegistry(): ActionDefinition[] {
  return useSyncExternalStore(
    (onStoreChange) => {
      listeners.add(onStoreChange);
      return () => {
        listeners.delete(onStoreChange);
      };
    },
    () => getAllActions(),
    () => getAllActions()
  );
}

/**
 * Standard workbench actions
 */
export function initStandardActions(): void {
  const standardActions: ActionDefinition[] = [
    {
      id: 'view.toggle-cr-explorer',
      title: 'Tool Windows: Toggle CR Explorer',
      category: 'View',
      shortcut: 'Alt+1',
      perform: () => {
        useLayoutStore.getState().toggleToolWindow('left', 'cr_explorer');
      },
    },
    {
      id: 'view.toggle-docs',
      title: 'Tool Windows: Toggle Docs',
      category: 'View',
      shortcut: 'Alt+2',
      perform: () => {
        useLayoutStore.getState().toggleToolWindow('left', 'docs');
      },
    },
    {
      id: 'view.toggle-ai-chat',
      title: 'Tool Windows: Toggle AI Chat',
      category: 'View',
      shortcut: 'Alt+3',
      perform: () => {
        useLayoutStore.getState().toggleToolWindow('right', 'ai_chat');
      },
    },
    {
      id: 'view.toggle-notifications',
      title: 'Tool Windows: Toggle Notifications',
      category: 'View',
      shortcut: 'Alt+4',
      perform: () => {
        useLayoutStore.getState().toggleToolWindow('right', 'notifications');
      },
    },
    {
      id: 'view.toggle-systems',
      title: 'Tool Windows: Toggle Systems Explorer',
      category: 'View',
      shortcut: 'Alt+6',
      perform: () => {
        useLayoutStore.getState().toggleToolWindow('left', 'systems');
      },
    },
    {
      id: 'search.everywhere',
      title: 'Search Everywhere',
      category: 'Navigate',
      shortcut: 'Double Shift',
      perform: () => {
        const event = new CustomEvent('taskmate:open-search-everywhere');
        window.dispatchEvent(event);
      },
    },
    {
      id: 'task.create',
      title: 'New Task',
      category: 'Task',
      shortcut: 'Alt+Insert',
      perform: () => {
        const event = new CustomEvent('taskmate:create-task');
        window.dispatchEvent(event);
      },
    },
    {
      id: 'timer.toggle',
      title: 'Toggle Timer',
      category: 'Timer',
      shortcut: 'Alt+T',
      perform: () => {
        const event = new CustomEvent('taskmate:toggle-timer');
        window.dispatchEvent(event);
      },
    },
    {
      id: 'view.open-mermaid-studio',
      title: 'Open Mermaid Diagram Studio',
      category: 'View',
      shortcut: 'Alt+M',
      perform: () => {
        window.dispatchEvent(new CustomEvent('taskmate:open-mermaid-studio'));
      },
    },
  ];

  for (const action of standardActions) {
    actionsRegistry.set(action.id, action);
  }
  notifyListeners();
}

// Auto-initialize standard actions on module load
initStandardActions();
