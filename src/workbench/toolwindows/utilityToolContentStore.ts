import { create } from 'zustand';

export type Indent = '2' | '4' | 'tab';

type JsonContent = { input: string; output: string; error: string | null; formatted: boolean; indent: Indent };
type TextContent = { a: string; b: string; mode: 'lines' | 'words'; ignoreCase: boolean; ignoreSpace: boolean };
type MarkdownContent = { source: string };

export type UtilityToolContentMap = {
  json_formatter: JsonContent;
  xml_formatter: JsonContent;
  text_compare: TextContent;
  markdown_viewer: MarkdownContent;
};

type ToolId = keyof UtilityToolContentMap;

const initialContent = (): UtilityToolContentMap => ({
  json_formatter: { input: '', output: '', error: null, formatted: false, indent: '2' },
  xml_formatter: { input: '', output: '', error: null, formatted: false, indent: '2' },
  text_compare: { a: '', b: '', mode: 'lines', ignoreCase: false, ignoreSpace: false },
  markdown_viewer: { source: '' },
});

type Store = {
  values: UtilityToolContentMap;
  patch: <K extends ToolId>(key: K, patch: Partial<UtilityToolContentMap[K]>) => void;
  clear: (key: ToolId) => void;
  resetAll: () => void;
};

/** Session-only editor content. Unmount/remount of an inactive pane must not lose work. */
export const useUtilityToolContent = create<Store>((set) => ({
  values: initialContent(),
  patch: (key, patch) => set((s) => ({ values: { ...s.values, [key]: { ...s.values[key], ...patch } } })),
  clear: (key) => set((s) => ({ values: { ...s.values, [key]: initialContent()[key] } })),
  resetAll: () => set({ values: initialContent() }),
}));

export function useUtilityContent<K extends ToolId>(key: K) {
  const value = useUtilityToolContent((s) => s.values[key]);
  const patch = useUtilityToolContent((s) => s.patch);
  const clear = useUtilityToolContent((s) => s.clear);
  return [value, (p: Partial<UtilityToolContentMap[K]>) => patch(key, p), () => clear(key)] as const;
}
