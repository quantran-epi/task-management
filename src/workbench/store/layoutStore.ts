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
  | 'sdlc';

export interface EditorTab {
  id: string;
  title: string;
  viewType: EditorViewType;
  closable?: boolean;
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
}

export interface LayoutActions {
  toggleToolWindow: (slot: ToolWindowSlot, id: string) => void;
  setToolWindowActive: (slot: ToolWindowSlot, id: string | null) => void;
  setPanelSize: (slot: ToolWindowSlot, size: number) => void;
  openTab: (tab: EditorTab) => void;
  closeTab: (tabId: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  setActiveTabId: (tabId: string) => void;
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

      openTab: (tab: EditorTab) => {
        set((state) => {
          const existing = state.openTabs.find((t) => t.id === tab.id);
          if (existing) {
            const hasNewTitle = Boolean(tab.title && tab.title !== existing.title);
            if (hasNewTitle) {
              return {
                activeTabId: tab.id,
                openTabs: state.openTabs.map((t) =>
                  t.id === tab.id ? { ...t, title: tab.title, params: { ...t.params, ...tab.params } } : t
                ),
              };
            }
            return { activeTabId: tab.id };
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
          ? state.openTabs.slice(0, MAX_OPEN_TABS).map((tab) => ({ ...tab, closable: true }))
          : DEFAULT_LAYOUT_STATE.openTabs,
        activeTabId: typeof state.activeTabId === 'string' ? state.activeTabId : DEFAULT_LAYOUT_STATE.activeTabId,
      }),
    }
  )
);
