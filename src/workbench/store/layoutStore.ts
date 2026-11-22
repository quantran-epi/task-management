import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type ToolWindowSlot = 'left' | 'right' | 'bottom';

export type EditorViewType =
  | 'tasks'
  | 'notes'
  | 'planner'
  | 'analytics'
  | 'settings'
  | 'config-profiles'
  | 'cr_detail'
  | 'dashboard'
  | 'telegram'
  | 'insight'
  | 'mermaid'
  | 'systems'
  | 'system_detail'
  | 'remote_file'
  | 'staff_detail'
  | 'team_workspace'
  // D-07: a document set opens as its own app tab; unknown/persisted doc_set tabs
  // survive merge/partialize without a LAYOUT_STORAGE_KEY bump.
  | 'doc_set'
  // Dedicated Docs library tab: left set list + right detail, one tab for all sets.
  | 'doc_set_library'
  // Utility tools opened from the Tool Explorer right stripe.
  | 'json_formatter'
  | 'xml_formatter'
  | 'text_compare'
  | 'markdown_viewer'
  // Database Explorer center tabs (261122-uha). Additive: persisted tabs stay valid.
  // oracle_object_view params: { connectionId, schema, objectType, objectName, mode: 'source'|'ddl'|'columns' }
  // oracle_sql_composer params: { connectionId?, composerId? }
  | 'oracle_object_view'
  | 'oracle_sql_composer';

export interface EditorTab {
  id: string;
  title: string;
  viewType: EditorViewType;
  closable?: boolean;
  pinned?: boolean;
  params?: Record<string, any>;
}

export interface PendingTerminalTarget {
  sshConfigId: string | null;
  repoPath: string;
}

/** Transient one-shot request to reveal an SSH-remote file/folder inside the left explorer. */
export interface PendingRevealTarget {
  configId: string | null;
  repoPath: string;
  branch: string;
  filePath: string;
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
  /** Transient 1-click Terminal request. Deliberately not persisted (T-31.2-19). */
  pendingTerminalTarget: PendingTerminalTarget | null;
  /** Transient 1-shot reveal request. Deliberately not persisted. */
  pendingRevealTarget: PendingRevealTarget | null;
  /** Transient per-tab reload counter. Deliberately not persisted. */
  tabReloadKeys: Record<string, number>;
}

export interface LayoutActions {
  toggleToolWindow: (slot: ToolWindowSlot, id: string) => void;
  setToolWindowActive: (slot: ToolWindowSlot, id: string | null) => void;
  setPanelSize: (slot: ToolWindowSlot, size: number) => void;
  toggleBottomMaximize: () => void;
  setBottomMaximized: (maximized: boolean) => void;
  openTab: (tab: EditorTab) => void;
  closeTab: (tabId: string) => void;
  closeOtherTabs: (tabId: string) => void;
  closeAllTabs: () => void;
  reloadTab: (tabId?: string) => void;
  reloadAllTabs: () => void;
  togglePinTab: (tabId: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  setActiveTabId: (tabId: string) => void;
  setActiveRemoteTarget: (configId: string | null, repoPath: string, branch?: string) => void;
  setActiveRemoteBranch: (branch: string) => void;
  setPendingTerminalTarget: (target: PendingTerminalTarget | null) => void;
  consumePendingTerminalTarget: () => PendingTerminalTarget | null;
  setPendingRevealTarget: (target: PendingRevealTarget | null) => void;
  consumePendingRevealTarget: () => PendingRevealTarget | null;
  resetLayout: () => void;
}

export type LayoutState = LayoutStateValues & LayoutActions;

export const DEFAULT_TABS: EditorTab[] = [
  { id: 'tasks', title: 'Tasks', viewType: 'tasks', closable: true },
  { id: 'notes', title: 'Docs', viewType: 'notes', closable: true },
  { id: 'planner', title: 'Capacity Planner', viewType: 'planner', closable: true },
];

export const DEFAULT_LAYOUT_STATE: LayoutStateValues = {
  leftActiveId: 'cr_explorer',
  rightActiveId: null,
  bottomActiveId: null,
  leftPanelSize: 20,
  rightPanelSize: 25,
  bottomPanelSize: 38,
  openTabs: DEFAULT_TABS,
  activeTabId: 'tasks',
  activeRemoteConfigId: null,
  activeRemoteRepoPath: '',
  activeRemoteBranch: '',
  isBottomMaximized: false,
  pendingTerminalTarget: null,
  pendingRevealTarget: null,
  tabReloadKeys: {},
};

export const LAYOUT_STORAGE_KEY = 'taskmate_workbench_layout_v3';
export const MAX_OPEN_TABS = 20;

/**
 * Tab params that are one-shot deeplink hints, not durable tab state. A plain reopen of an
 * existing tab omits them and MUST clear the previous value; only a fresh navigation may
 * set them again. Kept as one list so every line/highlight/message param behaves identically
 * (Phase 47 `initialLine` mirrors the pre-existing `targetMessageId` precedent).
 */
export const ONE_SHOT_TAB_PARAM_KEYS = ['targetMessageId', 'initialLine'] as const;

/** View types retired from `EditorViewType` but still possibly persisted. */
// 'agents' was the retired ghost-dev list page/tab (its staff list survives in the
// ai_office/ai_staff tool windows; shell-permission approvals now mount at the shell root).
const RETIRED_VIEW_TYPES = new Set<string>(['sdlc', 'teams', 'agents']);

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
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
            const isOpening = state.bottomActiveId !== id;
            return {
              bottomActiveId: isOpening ? id : null,
              bottomPanelSize: isOpening && state.bottomPanelSize < 38 ? 38 : state.bottomPanelSize,
            };
          }
          return state;
        });
      },

      setToolWindowActive: (slot: ToolWindowSlot, id: string | null) => {
        set((state) => {
          if (slot === 'left') return { leftActiveId: id };
          if (slot === 'right') return { rightActiveId: id };
          if (slot === 'bottom') {
            return {
              bottomActiveId: id,
              bottomPanelSize: id && state.bottomPanelSize < 38 ? 38 : state.bottomPanelSize,
            };
          }
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
              openTabs: state.openTabs.map((t) => {
                if (t.id !== tab.id) return t;
                // One-shot deeplink params (message highlight, remote initial line) are not
                // durable tab state. A plain reopen omits them and MUST clear the previous
                // value; only a fresh navigation may set them again.
                const mergedParams = { ...t.params, ...tab.params };
                const incoming = tab.params ?? {};
                for (const key of ONE_SHOT_TAB_PARAM_KEYS) {
                  if (key in mergedParams && !(key in incoming)) {
                    delete mergedParams[key];
                  }
                }
                return { ...t, title: tab.title || t.title, params: mergedParams };
              }),
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

      closeOtherTabs: (tabId: string) => {
        set((state) => {
          const remaining = state.openTabs.filter((t) => t.id === tabId || t.pinned);
          return {
            openTabs: remaining,
            activeTabId: tabId,
          };
        });
      },

      closeAllTabs: () => {
        set((state) => {
          const pinnedOnly = state.openTabs.filter((t) => t.pinned);
          return {
            openTabs: pinnedOnly,
            activeTabId: pinnedOnly[0]?.id ?? null,
          };
        });
      },

      reloadTab: (tabId?: string) => {
        set((state) => {
          const targetId = tabId ?? state.activeTabId;
          if (!targetId) return state;
          return {
            tabReloadKeys: {
              ...state.tabReloadKeys,
              [targetId]: (state.tabReloadKeys[targetId] ?? 0) + 1,
            },
          };
        });
      },

      reloadAllTabs: () => {
        set((state) => {
          const nextKeys = { ...state.tabReloadKeys };
          for (const tab of state.openTabs) {
            nextKeys[tab.id] = (nextKeys[tab.id] ?? 0) + 1;
          }
          return { tabReloadKeys: nextKeys };
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

      setPendingTerminalTarget: (target: PendingTerminalTarget | null) => {
        set(() => ({ pendingTerminalTarget: target }));
      },

      consumePendingTerminalTarget: (): PendingTerminalTarget | null => {
        const target = get().pendingTerminalTarget;
        if (target) set(() => ({ pendingTerminalTarget: null }));
        return target;
      },

      setPendingRevealTarget: (target: PendingRevealTarget | null) => {
        set(() => ({ pendingRevealTarget: target }));
      },

      consumePendingRevealTarget: (): PendingRevealTarget | null => {
        const target = get().pendingRevealTarget;
        if (target) set(() => ({ pendingRevealTarget: null }));
        return target;
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
      // T-31.2-16: the persist key moved to `_v2`, so a pre-normalization blob is never read and
      // no retired tool-window or editor-tab id can resolve.
      // Phase 35 (AIO-REMOVE-04): `_v3` retires the `sdlc` editor view type; RETIRED_VIEW_TYPES plus the filter below also guard any future unknown view type at write time.
      merge: (persisted, current) => {
        const incoming = (persisted ?? {}) as Partial<LayoutStateValues>;
        const tabs = Array.isArray(incoming.openTabs)
          ? incoming.openTabs.filter((tab) => !RETIRED_VIEW_TYPES.has(tab.viewType))
          : current.openTabs;
        const activeTabId =
          tabs.some((tab) => tab.id === incoming.activeTabId) && incoming.activeTabId
            ? incoming.activeTabId
            : (tabs[0]?.id ?? DEFAULT_LAYOUT_STATE.activeTabId);
        // 'diagrams' retired: Diagram Explorer merged into Docs Explorer. Old persisted value maps to docs.
        const leftActiveId =
          incoming.leftActiveId === 'diagrams'
            ? 'docs'
            : typeof incoming.leftActiveId === 'string'
            ? incoming.leftActiveId
            : current.leftActiveId;
        return { ...current, ...incoming, leftActiveId, openTabs: tabs, activeTabId };
      },
      partialize: (state) => ({
        leftActiveId:
          typeof state.leftActiveId === 'string' ? state.leftActiveId : null,
        rightActiveId: typeof state.rightActiveId === 'string' ? state.rightActiveId : null,
        bottomActiveId: typeof state.bottomActiveId === 'string' ? state.bottomActiveId : null,
        leftPanelSize: typeof state.leftPanelSize === 'number' && state.leftPanelSize > 0 ? state.leftPanelSize : DEFAULT_LAYOUT_STATE.leftPanelSize,
        rightPanelSize: typeof state.rightPanelSize === 'number' && state.rightPanelSize > 0 ? state.rightPanelSize : DEFAULT_LAYOUT_STATE.rightPanelSize,
        bottomPanelSize: typeof state.bottomPanelSize === 'number' && state.bottomPanelSize > 0 ? state.bottomPanelSize : DEFAULT_LAYOUT_STATE.bottomPanelSize,
        openTabs: Array.isArray(state.openTabs) && state.openTabs.length > 0
          ? state.openTabs
              .filter((tab) => !RETIRED_VIEW_TYPES.has(tab.viewType))
              .slice(0, MAX_OPEN_TABS)
              .map((tab) => ({
                ...tab,
                closable: true,
                pinned: Boolean(tab.pinned),
              }))
          : DEFAULT_LAYOUT_STATE.openTabs,
        activeTabId: (() => {
          const tabs = Array.isArray(state.openTabs)
            ? state.openTabs.filter((tab) => !RETIRED_VIEW_TYPES.has(tab.viewType))
            : [];
          return tabs.some((tab) => tab.id === state.activeTabId)
            ? state.activeTabId
            : (tabs[0]?.id ?? DEFAULT_LAYOUT_STATE.activeTabId);
        })(),
        activeRemoteConfigId: typeof state.activeRemoteConfigId === 'string' ? state.activeRemoteConfigId : null,
        activeRemoteRepoPath: typeof state.activeRemoteRepoPath === 'string' ? state.activeRemoteRepoPath : '',
        activeRemoteBranch: typeof state.activeRemoteBranch === 'string' ? state.activeRemoteBranch : '',
      }),
    }
  )
);
