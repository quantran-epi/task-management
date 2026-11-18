import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  registerAction,
  executeAction,
  getAllActions,
  getAction,
  clearCustomActions,
  initStandardActions,
} from '../actions/actionRegistry';
import { useLayoutStore } from '../store/layoutStore';
import { message } from 'antd';
import { renderHook, fireEvent } from '@testing-library/react';
import { useGlobalKeymap } from '../hooks/useGlobalKeymap';

describe('actionRegistry', () => {
  beforeEach(() => {
    clearCustomActions();
    initStandardActions();
    useLayoutStore.getState().resetLayout();
  });

  it('registers and retrieves actions', () => {
    const perform = vi.fn();
    const unregister = registerAction({
      id: 'custom.test-action',
      title: 'Custom Test Action',
      category: 'Test',
      shortcut: 'Ctrl+Shift+T',
      perform,
    });

    const action = getAction('custom.test-action');
    expect(action).toBeDefined();
    expect(action?.title).toBe('Custom Test Action');
    expect(getAllActions().some((a) => a.id === 'custom.test-action')).toBe(true);

    executeAction('custom.test-action');
    expect(perform).toHaveBeenCalledTimes(1);

    unregister();
    expect(getAction('custom.test-action')).toBeUndefined();
  });

  it('reports unknown actions instead of silently ignoring them', () => {
    const warning = vi.spyOn(message, 'warning').mockImplementation(() => undefined as any);
    executeAction('non.existent.action');
    expect(warning).toHaveBeenCalledWith('Action không còn khả dụng.');
    warning.mockRestore();
  });

  it('keeps registry snapshots stable until registration changes', () => {
    expect(getAllActions()).toBe(getAllActions());
    const before = getAllActions();
    const unregister = registerAction({ id: 'test.snapshot', title: 'Snapshot', category: 'Test', perform: vi.fn() });
    expect(getAllActions()).not.toBe(before);
    unregister();
  });

  it('opens Tasks and issues a new focus request on every New Task action', () => {
    useLayoutStore.getState().closeAllTabs();
    executeAction('task.create');
    const first = useLayoutStore.getState().openTabs.find((tab) => tab.id === 'tasks');
    expect(useLayoutStore.getState().activeTabId).toBe('tasks');
    expect(first?.viewType).toBe('tasks');
    expect(first?.params?.quickAddRequest).toBeTypeOf('string');
    executeAction('task.create');
    expect(useLayoutStore.getState().openTabs[0]?.params?.quickAddRequest).not.toBe(first?.params?.quickAddRequest);
  });

  it('opens Diagram Studio without depending on an event listener', () => {
    executeAction('view.open-mermaid-studio');
    expect(useLayoutStore.getState().activeTabId).toBe('mermaid');
    expect(useLayoutStore.getState().openTabs.find((tab) => tab.id === 'mermaid')?.viewType).toBe('mermaid');
  });

  it('reports unavailable timer context but accepts acknowledged commands', () => {
    const info = vi.spyOn(message, 'info').mockImplementation(() => undefined as any);
    executeAction('timer.toggle');
    expect(info).toHaveBeenCalledOnce();
    info.mockClear();
    const handler = (event: Event) => event.preventDefault();
    window.addEventListener('taskmate:toggle-timer', handler);
    try {
      executeAction('timer.toggle');
      expect(info).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('taskmate:toggle-timer', handler);
      info.mockRestore();
    }
  });

  it('reports reload actions when no tabs are open', () => {
    const info = vi.spyOn(message, 'info').mockImplementation(() => undefined as any);
    useLayoutStore.getState().closeAllTabs();
    executeAction('tab.reload-active');
    executeAction('tab.reload-all');
    expect(info).toHaveBeenCalledTimes(2);
    info.mockRestore();
  });

  it('contains all standard actions', () => {
    const all = getAllActions();
    const ids = all.map((a) => a.id);

    expect(ids).toContain('view.toggle-cr-explorer');
    expect(ids).toContain('view.toggle-docs');
    expect(ids).toContain('view.toggle-ai-chat');
    expect(ids).toContain('view.toggle-notifications');
    expect(ids).toContain('search.everywhere');
    expect(ids).toContain('task.create');
    expect(ids).toContain('timer.toggle');
  });

  it('wires every advertised standard shortcut to the corresponding action', () => {
    const { unmount } = renderHook(() => useGlobalKeymap());
    try {
      for (const action of getAllActions()) {
        if (!action.shortcut?.startsWith('Alt+')) continue;
        const perform = vi.spyOn(action, 'perform').mockImplementation(() => {});
        fireEvent.keyDown(window, { key: action.shortcut.slice(4), altKey: true });
        expect(perform, action.id).toHaveBeenCalledOnce();
        perform.mockRestore();
      }
    } finally {
      unmount();
    }
  });

  it('toggles additional tool windows through registered actions', () => {
    for (const [action, target] of [
      ['view.toggle-remote-explorer', 'remote_explorer'],
      ['view.toggle-ai-office', 'ai_office'],
      ['view.toggle-ai-staff', 'ai_staff'],
    ]) {
      executeAction(action!);
      expect(useLayoutStore.getState().leftActiveId).toBe(target);
    }
    executeAction('view.toggle-terminal');
    expect(useLayoutStore.getState().bottomActiveId).toBe('terminal');
  });

  it('toggles tool windows via standard actions', () => {
    // Initial leftActiveId is 'cr_explorer'
    expect(useLayoutStore.getState().leftActiveId).toBe('cr_explorer');

    executeAction('view.toggle-cr-explorer'); // toggles off
    expect(useLayoutStore.getState().leftActiveId).toBeNull();

    executeAction('view.toggle-cr-explorer'); // toggles back on
    expect(useLayoutStore.getState().leftActiveId).toBe('cr_explorer');

    executeAction('view.toggle-docs'); // toggles left to docs
    expect(useLayoutStore.getState().leftActiveId).toBe('docs');

    executeAction('view.toggle-ai-chat'); // toggles right to ai_chat
    expect(useLayoutStore.getState().rightActiveId).toBe('ai_chat');

    executeAction('view.toggle-notifications'); // toggles right to notifications
    expect(useLayoutStore.getState().rightActiveId).toBe('notifications');
  });
});
