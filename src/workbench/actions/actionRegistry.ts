import { useLayoutStore } from '../store/layoutStore';
import { useSyncExternalStore } from 'react';
import { message } from 'antd';

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
let actionSnapshot: ActionDefinition[] = [];

function notifyListeners() {
  actionSnapshot = Array.from(actionsRegistry.values());
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
  return actionSnapshot;
}

export function executeAction(id: string): void {
  const action = actionsRegistry.get(id);
  if (!action) {
    message.warning('Action không còn khả dụng.');
    return;
  }
  try {
    action.perform();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Không thể thực hiện action.');
  }
}

function dispatchHandledAction(eventName: string, unavailableMessage: string): void {
  // Mounted views acknowledge handled commands with preventDefault; no listener means unavailable.
  const unhandled = window.dispatchEvent(new CustomEvent(eventName, { cancelable: true }));
  if (unhandled) message.info(unavailableMessage);
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
      id: 'view.toggle-tool-explorer',
      title: 'Tool Windows: Toggle Tool Explorer',
      category: 'View',
      shortcut: 'Alt+9',
      perform: () => {
        useLayoutStore.getState().toggleToolWindow('right', 'tool_explorer');
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
      id: 'view.toggle-remote-explorer',
      title: 'Tool Windows: Toggle Remote Git Explorer',
      category: 'View',
      shortcut: 'Alt+5',
      perform: () => useLayoutStore.getState().toggleToolWindow('left', 'remote_explorer'),
    },
    {
      id: 'view.toggle-ai-office',
      title: 'Tool Windows: Toggle AI Office',
      category: 'View',
      shortcut: 'Alt+7',
      perform: () => useLayoutStore.getState().toggleToolWindow('left', 'ai_office'),
    },
    {
      id: 'view.toggle-ai-staff',
      title: 'Tool Windows: Toggle AI Staff',
      category: 'View',
      shortcut: 'Alt+8',
      perform: () => useLayoutStore.getState().toggleToolWindow('left', 'ai_staff'),
    },
    {
      id: 'view.toggle-terminal',
      title: 'Tool Windows: Toggle Terminal',
      category: 'View',
      shortcut: 'Alt+F12',
      perform: () => {
        useLayoutStore.getState().toggleToolWindow('bottom', 'terminal');
      },
    },
    {
      id: 'search.everywhere',
      title: 'Search Everywhere',
      category: 'Navigate',
      shortcut: 'Double Shift',
      perform: () => {
        dispatchHandledAction('taskmate:open-search-everywhere', 'Search Everywhere chưa sẵn sàng.');
      },
    },
    {
      id: 'find.inPath',
      title: 'Find in Remote Files',
      category: 'Navigate',
      perform: () => {
        dispatchHandledAction('taskmate:open-find-in-remote-files', 'Find in Remote Files chưa sẵn sàng.');
      },
    },
    {
      id: 'task.create',
      title: 'New Task',
      category: 'Task',
      shortcut: 'Alt+Insert',
      perform: () => {
        const state = useLayoutStore.getState();
        const activeTab = state.openTabs.find((tab) => tab.id === state.activeTabId);
        state.openTab({
          id: activeTab?.viewType === 'tasks' ? activeTab.id : 'tasks',
          title: activeTab?.viewType === 'tasks' ? activeTab.title : 'Tasks',
          viewType: 'tasks',
          closable: true,
          params: { quickAddRequest: crypto.randomUUID() },
        });
      },
    },
    {
      id: 'timer.toggle',
      title: 'Toggle Timer',
      category: 'Timer',
      shortcut: 'Alt+T',
      perform: () => {
        dispatchHandledAction('taskmate:toggle-timer', 'Mở Tasks và chọn một tác vụ để bật/tắt bộ đếm giờ.');
      },
    },
    {
      id: 'view.open-mermaid-studio',
      title: 'Open Mermaid Diagram Studio',
      category: 'View',
      shortcut: 'Alt+M',
      perform: () => {
        useLayoutStore.getState().openTab({
          id: 'mermaid', title: 'Diagram Studio', viewType: 'mermaid', closable: true,
        });
      },
    },
    {
      id: 'tab.reload-active',
      title: 'Reload Active Tab',
      category: 'Tab',
      shortcut: 'Alt+R',
      perform: () => {
        const state = useLayoutStore.getState();
        if (!state.openTabs.some((tab) => tab.id === state.activeTabId)) {
          message.info('Không có tab hiện tại để tải lại.');
          return;
        }
        state.reloadTab();
      },
    },
    {
      id: 'tab.reload-all',
      title: 'Reload All Tabs',
      category: 'Tab',
      perform: () => {
        const state = useLayoutStore.getState();
        if (!state.openTabs.length) {
          message.info('Không có tab nào để tải lại.');
          return;
        }
        state.reloadAllTabs();
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
