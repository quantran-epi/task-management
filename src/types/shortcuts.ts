export type ShortcutCategory = 'navigation' | 'global' | 'tasks' | 'notes';

export interface ShortcutItem {
  id: string;
  category: ShortcutCategory;
  categoryLabel: string;
  title: string;
  description: string;
  keys: string[]; // e.g. ['Alt', '1'], ['Mod', 'N'], ['Mod', 'Shift', 'S']
  keywords?: string[];
  action: () => void | Promise<void>;
  scope?: string; // undefined means global; otherwise matches current route like 'tasks' | 'notes'
}
