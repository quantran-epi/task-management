import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type ToolWindowSlot = 'left' | 'right' | 'bottom';

export type EditorViewType =
  | 'tasks'
  | 'notes'
  | 'planner'
  | 'analytics'
  | 'settings'
  | 'projects'
  | 'dashboard'
  | 'agents'
  | 'telegram'
  | 'insight'
  | 'sdlc'
  | 'mermaid'
  | 'remote_file';

export interface EditorTab {
  id: string;
  title: string;
  viewType: EditorViewType;
  closable?: boolean;
  pinned?: boolean;
  params?: Record<string, any>;
}

export interface LayoutStateValues {
  leftActiveId: string | null;
  rightActiveId: string | null;
  bottomActiveId: string | null;
  leftPanelSize: number;
  rightPanelSize: number;
  bottomPanelSize: number;
  openTabs: EditorTab[];
  activeTabId: string | null;
  activeRemoteConfigId: string | null;
  activeRemoteRepoPath: string;
  activeRemoteBranch: string;
  isBottomMaximized: boolean;
}

export interface LayoutActions {
  toggleToolWindow: (slot: ToolWindowSlot, id: string) => void;
  setToolWindowActive: (slot: ToolWindowSlot, id: string | null) => void;
  setPanelSize: (slot: ToolWindowSlot, size: number) => void;
  toggleBottomMaximize: () => void;
  setBottomMaximized: (maximized: boolean) => void;
  openTab: (tab: EditorTab) => void;
  closeTab: (tabId: string) => void;
  togglePinTab: (tabId: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  setActiveTabId: (tabId: string) => void;
  setActiveRemoteTarget: (configId: string | null, repoPath: string, branch?: string) => void;
  setActiveRemoteBranch: (branch: string) => void;
  resetLayout: () => void;
}

export type LayoutState = LayoutStateValues & LayoutActions;

export const DEFAULT_TABS: EditorTab[] = [
  { id: 'tasks', title: 'Tasks', viewType: 'tasks', closable: true },
  { id: 'notes', title: 'Docs', viewType: 'notes', closable: true },
  { id: 'planner', title: 'Capacity Planner', viewType: 'planner', closable: true },
];

export const DEFAULT_LAYOUT_STATE: LayoutStateValues = {
  leftActiveId: 'projects',
  rightActiveId: null,
  bottomActiveId: null,
  leftPanelSize: 20,
  rightPanelSize: 25,
  bottomPanelSize: 30,
  openTabs: DEFAULT_TABS,
  activeTabId: 'tasks',
  activeRemoteConfigId: null,
  activeRemoteRepoPath: '',
  activeRemoteBranch: '',
  isBottomMaximized: false,
};

export const LAYOUT_STORAGE_KEY = 'taskmate_workbench_layout_v1';
export const MAX_OPEN_TABS = 20;

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      ...DEFAULT_LAYOUT_STATE,

      toggleToolWindow: (slot: ToolWindowSlot, id: string) => {
        set((state) => {
          if (slot === 'left') {
            return { leftActiveId: state.leftActiveId === id ? null : id };
          }
          if (slot === 'right') {
            return { rightActiveId: state.rightActiveId === id ? null : id };
          }
          if (slot === 'bottom') {
            return { bottomActiveId: state.bottomActiveId === id ? null : id };
          }
          return state;
        });
      },

      setToolWindowActive: (slot: ToolWindowSlot, id: string | null) => {
        set((state) => {
          if (slot === 'left') return { leftActiveId: id };
          if (slot === 'right') return { rightActiveId: id };
          if (slot === 'bottom') return { bottomActiveId: id };
          return state;
        });
      },

      setPanelSize: (slot: ToolWindowSlot, size: number) => {
        set((state) => {
          if (slot === 'left') return { leftPanelSize: size };
          if (slot === 'right') return { rightPanelSize: size };
          if (slot === 'bottom') return { bottomPanelSize: size };
          return state;
        });
      },

      toggleBottomMaximize: () => {
        set((state) => ({ isBottomMaximized: !state.isBottomMaximized }));
      },

      setBottomMaximized: (maximized: boolean) => {
        set(() => ({ isBottomMaximized: maximized }));
      },

      openTab: (tab: EditorTab) => {
        set((state) => {
          const existing = state.openTabs.find((t) => t.id === tab.id);
          if (existing) {
            return {
              activeTabId: tab.id,
              openTabs: state.openTabs.map((t) =>
                t.id === tab.id
                  ? {
                      ...t,
                      title: tab.title || t.title,
                      params: { ...t.params, ...tab.params },
                    }
                  : t
              ),
            };
          }
          // T-25.4-03: Cap maximum open tabs (20) to prevent DOM bloat and memory leaks
          let updatedTabs = [...state.openTabs, tab];
          if (updatedTabs.length > MAX_OPEN_TABS) {
            // Evict first closable tab that is not active
            const closableIndex = updatedTabs.findIndex((t) => t.closable && t.id !== state.activeTabId);
            if (closableIndex >= 0) {
              updatedTabs.splice(closableIndex, 1);
            } else {
              updatedTabs = updatedTabs.slice(updatedTabs.length - MAX_OPEN_TABS);
            }
          }
          return {
            openTabs: updatedTabs,
            activeTabId: tab.id,
          };
        });
      },

      closeTab: (tabId: string) => {
        set((state) => {
          const index = state.openTabs.findIndex((t) => t.id === tabId);
          if (index === -1) return state;

          const newTabs = state.openTabs.filter((t) => t.id !== tabId);
          let newActiveId = state.activeTabId;

          if (state.activeTabId === tabId) {
            if (newTabs.length === 0) {
              newActiveId = null;
            } else {
              const nextIndex = Math.min(index, newTabs.length - 1);
              newActiveId = newTabs[nextIndex]?.id ?? null;
            }
          }

          return {
            openTabs: newTabs,
            activeTabId: newActiveId,
          };
        });
      },

      togglePinTab: (tabId: string) => {
        set((state) => {
          const tabIndex = state.openTabs.findIndex((t) => t.id === tabId);
          if (tabIndex === -1) return state;

          const currentTab = state.openTabs[tabIndex];
          if (!currentTab) return state;
          const nextPinned = !currentTab.pinned;

          // Clone tabs array and update pinned status
          const updated = state.openTabs.map((t) =>
            t.id === tabId ? { ...t, pinned: nextPinned } : t
          );

          // Stable partition: pinned tabs first, followed by unpinned tabs
          const pinnedTabs = updated.filter((t) => t.pinned);
          const unpinnedTabs = updated.filter((t) => !t.pinned);

          return {
            openTabs: [...pinnedTabs, ...unpinnedTabs],
          };
        });
      },

      reorderTabs: (fromIndex: number, toIndex: number) => {
        set((state) => {
          if (
            fromIndex < 0 ||
            toIndex < 0 ||
            fromIndex >= state.openTabs.length ||
            toIndex >= state.openTabs.length ||
            fromIndex === toIndex
          ) {
            return state;
          }
          const updated = [...state.openTabs];
          const [moved] = updated.splice(fromIndex, 1);
          if (!moved) return state;
          updated.splice(toIndex, 0, moved);
          return { openTabs: updated };
        });
      },

      setActiveTabId: (tabId: string) => {
        set(() => ({ activeTabId: tabId }));
      },

      setActiveRemoteTarget: (configId: string | null, repoPath: string, branch?: string) => {
        set(() => ({
          activeRemoteConfigId: configId,
          activeRemoteRepoPath: repoPath,
          ...(branch !== undefined ? { activeRemoteBranch: branch } : {}),
        }));
      },

      setActiveRemoteBranch: (branch: string) => {
        set(() => ({ activeRemoteBranch: branch }));
      },

      resetLayout: () => {
        set(() => ({
          ...DEFAULT_LAYOUT_STATE,
        }));
      },
    }),
    {
      name: LAYOUT_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      // T-25.4-01: Validate stored state against schema/shape with fallback to defaults on corrupt data
      partialize: (state) => ({
        leftActiveId: typeof state.leftActiveId === 'string' ? state.leftActiveId : null,
        rightActiveId: typeof state.rightActiveId === 'string' ? state.rightActiveId : null,
        bottomActiveId: typeof state.bottomActiveId === 'string' ? state.bottomActiveId : null,
        leftPanelSize: typeof state.leftPanelSize === 'number' && state.leftPanelSize > 0 ? state.leftPanelSize : DEFAULT_LAYOUT_STATE.leftPanelSize,
        rightPanelSize: typeof state.rightPanelSize === 'number' && state.rightPanelSize > 0 ? state.rightPanelSize : DEFAULT_LAYOUT_STATE.rightPanelSize,
        bottomPanelSize: typeof state.bottomPanelSize === 'number' && state.bottomPanelSize > 0 ? state.bottomPanelSize : DEFAULT_LAYOUT_STATE.bottomPanelSize,
        openTabs: Array.isArray(state.openTabs) && state.openTabs.length > 0
          ? state.openTabs.slice(0, MAX_OPEN_TABS).map((tab) => ({
              ...tab,
              closable: true,
              pinned: Boolean(tab.pinned),
            }))
          : DEFAULT_LAYOUT_STATE.openTabs,
        activeTabId: typeof state.activeTabId === 'string' ? state.activeTabId : DEFAULT_LAYOUT_STATE.activeTabId,
        activeRemoteConfigId: typeof state.activeRemoteConfigId === 'string' ? state.activeRemoteConfigId : null,
        activeRemoteRepoPath: typeof state.activeRemoteRepoPath === 'string' ? state.activeRemoteRepoPath : '',
        activeRemoteBranch: typeof state.activeRemoteBranch === 'string' ? state.activeRemoteBranch : '',
      }),
    }
  )
);
