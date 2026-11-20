import { create } from 'zustand';

/** The active remote target captured when the dialog opens — no second target picker (D-04). */
export interface FindSeed {
  configId: string | null;
  repoPath: string;
  branch: string;
}

export interface FindStoreState {
  open: boolean;
  pinned: boolean;
  seed: FindSeed | null;
  openFind: (seed: FindSeed) => void;
  closeFind: () => void;
  togglePinned: () => void;
}

/** Ephemeral UI state only — never persisted to IndexedDB. */
export const useFindStore = create<FindStoreState>()((set) => ({
  open: false,
  pinned: false,
  seed: null,
  openFind: (seed) => set({ open: true, pinned: false, seed }),
  closeFind: () => set({ open: false }),
  togglePinned: () => set((s) => ({ pinned: !s.pinned })),
}));

/** Single-source accessible names for icon-only controls (UI-SPEC). */
export const FIND_CONTROL_LABELS = {
  fileMask: 'File mask',
  pin: 'Pin',
  unpin: 'Unpin',
  close: 'Close',
  stop: 'Stop',
} as const;

/** Single-source dialog title from the action registry / UI-SPEC. */
export const FIND_DIALOG_TITLE = 'Find in Remote Files';
