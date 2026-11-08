import { describe, it, expect, beforeEach } from 'vitest';
import { useLayoutStore, DEFAULT_LAYOUT_STATE, LAYOUT_STORAGE_KEY } from '../store/layoutStore';

describe('useLayoutStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useLayoutStore.getState().resetLayout();
  });

  it('initializes with default state', () => {
    const state = useLayoutStore.getState();
    expect(state.leftActiveId).toBe('cr_explorer');
    expect(state.rightActiveId).toBeNull();
    expect(state.bottomActiveId).toBeNull();
    expect(state.leftPanelSize).toBe(20);
    expect(state.rightPanelSize).toBe(25);
    expect(state.bottomPanelSize).toBe(38);
  });

  it('uses the v2 persist key so a stale v1 layout cannot resolve', () => {
    expect(LAYOUT_STORAGE_KEY).toBe('taskmate_workbench_layout_v2');
  });

  it('toggles tool windows correctly', () => {
    // Toggling already active left 'cr_explorer' -> turns null
    useLayoutStore.getState().toggleToolWindow('left', 'cr_explorer');
    expect(useLayoutStore.getState().leftActiveId).toBeNull();

    // Toggling again -> turns 'cr_explorer'
    useLayoutStore.getState().toggleToolWindow('left', 'cr_explorer');
    expect(useLayoutStore.getState().leftActiveId).toBe('cr_explorer');

    // Switching left to another id
    useLayoutStore.getState().toggleToolWindow('left', 'outline');
    expect(useLayoutStore.getState().leftActiveId).toBe('outline');

    // Right slot
    useLayoutStore.getState().toggleToolWindow('right', 'ai_chat');
    expect(useLayoutStore.getState().rightActiveId).toBe('ai_chat');

    // Bottom slot
    useLayoutStore.getState().toggleToolWindow('bottom', 'logs');
    expect(useLayoutStore.getState().bottomActiveId).toBe('logs');
  });

  it('updates panel sizes', () => {
    useLayoutStore.getState().setPanelSize('left', 28);
    useLayoutStore.getState().setPanelSize('right', 33);
    useLayoutStore.getState().setPanelSize('bottom', 40);

    const state = useLayoutStore.getState();
    expect(state.leftPanelSize).toBe(28);
    expect(state.rightPanelSize).toBe(33);
    expect(state.bottomPanelSize).toBe(40);
  });

  it('resets layout to defaults', () => {
    useLayoutStore.getState().toggleToolWindow('left', 'outline');
    useLayoutStore.getState().setPanelSize('left', 45);
    useLayoutStore.getState().resetLayout();

    const state = useLayoutStore.getState();
    expect(state.leftActiveId).toBe(DEFAULT_LAYOUT_STATE.leftActiveId);
    expect(state.leftPanelSize).toBe(DEFAULT_LAYOUT_STATE.leftPanelSize);
  });

  it('pins and unpins tabs keeping pinned tabs on the left', () => {
    // Initial tabs: tasks, notes, planner
    expect(useLayoutStore.getState().openTabs.map((t) => t.id)).toEqual(['tasks', 'notes', 'planner']);

    // Pin 'planner' (currently at index 2)
    useLayoutStore.getState().togglePinTab('planner');
    let tabs = useLayoutStore.getState().openTabs;
    expect(tabs.find((t) => t.id === 'planner')?.pinned).toBe(true);
    // Planner should be moved to front (leftmost)
    expect(tabs[0]?.id).toBe('planner');

    // Pin 'notes'
    useLayoutStore.getState().togglePinTab('notes');
    tabs = useLayoutStore.getState().openTabs;
    expect(tabs.filter((t) => t.pinned).map((t) => t.id)).toEqual(['planner', 'notes']);
    expect(tabs[2]?.id).toBe('tasks'); // unpinned tab remains after pinned ones

    // Unpin 'planner'
    useLayoutStore.getState().togglePinTab('planner');
    tabs = useLayoutStore.getState().openTabs;
    expect(tabs[0]?.id).toBe('notes'); // only notes remains pinned on left
    expect(tabs.find((t) => t.id === 'planner')?.pinned).toBe(false);
  });

  it('sets active remote target and branch correctly', () => {
    useLayoutStore.getState().setActiveRemoteTarget('ssh-1', '/var/www/repo', 'feature/login');
    let state = useLayoutStore.getState();
    expect(state.activeRemoteConfigId).toBe('ssh-1');
    expect(state.activeRemoteRepoPath).toBe('/var/www/repo');
    expect(state.activeRemoteBranch).toBe('feature/login');

    useLayoutStore.getState().setActiveRemoteBranch('main');
    state = useLayoutStore.getState();
    expect(state.activeRemoteBranch).toBe('main');
  });
});
