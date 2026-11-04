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

  it('does not crash when executing unknown action', () => {
    expect(() => executeAction('non.existent.action')).not.toThrow();
  });

  it('contains all standard actions', () => {
    const all = getAllActions();
    const ids = all.map((a) => a.id);

    expect(ids).toContain('view.toggle-projects');
    expect(ids).toContain('view.toggle-docs');
    expect(ids).toContain('view.toggle-ai-chat');
    expect(ids).toContain('view.toggle-notifications');
    expect(ids).toContain('search.everywhere');
    expect(ids).toContain('task.create');
    expect(ids).toContain('timer.toggle');
  });

  it('toggles tool windows via standard actions', () => {
    // Initial leftActiveId is 'projects'
    expect(useLayoutStore.getState().leftActiveId).toBe('projects');

    executeAction('view.toggle-projects'); // toggles off
    expect(useLayoutStore.getState().leftActiveId).toBeNull();

    executeAction('view.toggle-projects'); // toggles back on
    expect(useLayoutStore.getState().leftActiveId).toBe('projects');

    executeAction('view.toggle-docs'); // toggles left to docs
    expect(useLayoutStore.getState().leftActiveId).toBe('docs');

    executeAction('view.toggle-ai-chat'); // toggles right to ai_chat
    expect(useLayoutStore.getState().rightActiveId).toBe('ai_chat');

    executeAction('view.toggle-notifications'); // toggles right to notifications
    expect(useLayoutStore.getState().rightActiveId).toBe('notifications');
  });
});
