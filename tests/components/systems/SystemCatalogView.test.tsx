import { describe, it, expect, beforeEach } from 'vitest';
import { useLayoutStore, type EditorTab } from '../../../src/workbench/store/layoutStore';
import { getAllActions, executeAction } from '../../../src/workbench/actions/actionRegistry';

describe('LayoutStore and Navigation Systems Integration (Task 1)', () => {
  beforeEach(() => {
    useLayoutStore.getState().resetLayout();
  });

  it('accepts systems as a valid EditorViewType and can open systems tab', () => {
    const tab: EditorTab = {
      id: 'systems',
      title: 'Enterprise Systems Catalog',
      viewType: 'systems',
      closable: true,
    };

    useLayoutStore.getState().openTab(tab);
    expect(useLayoutStore.getState().activeTabId).toBe('systems');
    expect(useLayoutStore.getState().openTabs.some((t) => t.viewType === 'systems')).toBe(true);
  });

  it('allows setting leftActiveId to systems tool window', () => {
    useLayoutStore.getState().setToolWindowActive('left', 'systems');
    expect(useLayoutStore.getState().leftActiveId).toBe('systems');

    useLayoutStore.getState().toggleToolWindow('left', 'systems');
    expect(useLayoutStore.getState().leftActiveId).toBeNull();
  });

  it('registers view.toggle-systems in standard action registry', () => {
    const actions = getAllActions();
    const systemsAction = actions.find((a) => a.id === 'view.toggle-systems');
    expect(systemsAction).toBeDefined();
    expect(systemsAction?.shortcut).toBe('Alt+6');

    // Executing the action should toggle left tool window to 'systems'
    useLayoutStore.getState().setToolWindowActive('left', null);
    executeAction('view.toggle-systems');
    expect(useLayoutStore.getState().leftActiveId).toBe('systems');
  });
});
