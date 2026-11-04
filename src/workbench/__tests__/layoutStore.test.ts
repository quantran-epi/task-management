import { describe, it, expect, beforeEach } from 'vitest';
import { useLayoutStore, DEFAULT_LAYOUT_STATE } from '../store/layoutStore';

describe('useLayoutStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useLayoutStore.getState().resetLayout();
  });

  it('initializes with default state', () => {
    const state = useLayoutStore.getState();
    expect(state.leftActiveId).toBe('projects');
    expect(state.rightActiveId).toBeNull();
    expect(state.bottomActiveId).toBeNull();
    expect(state.leftPanelSize).toBe(20);
    expect(state.rightPanelSize).toBe(25);
    expect(state.bottomPanelSize).toBe(30);
  });

  it('toggles tool windows correctly', () => {
    // Toggling already active left 'projects' -> turns null
    useLayoutStore.getState().toggleToolWindow('left', 'projects');
    expect(useLayoutStore.getState().leftActiveId).toBeNull();

    // Toggling again -> turns 'projects'
    useLayoutStore.getState().toggleToolWindow('left', 'projects');
    expect(useLayoutStore.getState().leftActiveId).toBe('projects');

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

  it('persists changes to localStorage under taskmate_workbench_layout_v1', () => {
    useLayoutStore.getState().toggleToolWindow('left', 'custom_tool');
    const storedRaw = localStorage.getItem('taskmate_workbench_layout_v1');
    expect(storedRaw).toBeTruthy();
    const parsed = JSON.parse(storedRaw!);
    expect(parsed.state.leftActiveId).toBe('custom_tool');
  });
});
