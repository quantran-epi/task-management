import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type ToolWindowSlot = 'left' | 'right' | 'bottom';

export interface LayoutStateValues {
  leftActiveId: string | null;
  rightActiveId: string | null;
  bottomActiveId: string | null;
  leftPanelSize: number;
  rightPanelSize: number;
  bottomPanelSize: number;
}

export interface LayoutActions {
  toggleToolWindow: (slot: ToolWindowSlot, id: string) => void;
  setToolWindowActive: (slot: ToolWindowSlot, id: string | null) => void;
  setPanelSize: (slot: ToolWindowSlot, size: number) => void;
  resetLayout: () => void;
}

export type LayoutState = LayoutStateValues & LayoutActions;

export const DEFAULT_LAYOUT_STATE: LayoutStateValues = {
  leftActiveId: 'projects',
  rightActiveId: null,
  bottomActiveId: null,
  leftPanelSize: 20,
  rightPanelSize: 25,
  bottomPanelSize: 30,
};

export const LAYOUT_STORAGE_KEY = 'taskmate_workbench_layout_v1';

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
      }),
    }
  )
);
