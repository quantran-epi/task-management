import { useCallback } from 'react';
import { create } from 'zustand';

export type Indent = '2' | '4' | 'tab';

type JsonContent = { input: string; output: string; error: string | null; formatted: boolean; indent: Indent };
type TextContent = { a: string; b: string; mode: 'lines' | 'words'; ignoreCase: boolean; ignoreSpace: boolean };
type MarkdownContent = { source: string };

/** Shape đồng nhất cho 8 tool mới: input/aux là field chính, option/option2 là chế độ. */
export type DevToolContent = {
  input: string;
  aux: string;
  option: string;
  option2: string;
  output: string;
  error: string | null;
};

const emptyDevTool = (): DevToolContent => ({ input: '', aux: '', option: '', option2: '', output: '', error: null });

export type UtilityToolContentMap = {
  json_formatter: JsonContent;
  xml_formatter: JsonContent;
  text_compare: TextContent;
  markdown_viewer: MarkdownContent;
  encoder_decoder: DevToolContent;
  regex_tester: DevToolContent;
  timestamp_converter: DevToolContent;
  date_calculation: DevToolContent;
  text_utilities: DevToolContent;
  cron_expression: DevToolContent;
  hash_uuid: DevToolContent;
  jwt_decoder: DevToolContent;
};

type ToolId = keyof UtilityToolContentMap;

const initialContent = (): UtilityToolContentMap => ({
  json_formatter: { input: '', output: '', error: null, formatted: false, indent: '2' },
  xml_formatter: { input: '', output: '', error: null, formatted: false, indent: '2' },
  text_compare: { a: '', b: '', mode: 'lines', ignoreCase: false, ignoreSpace: false },
  markdown_viewer: { source: '' },
  encoder_decoder: emptyDevTool(),
  regex_tester: emptyDevTool(),
  timestamp_converter: emptyDevTool(),
  date_calculation: emptyDevTool(),
  text_utilities: emptyDevTool(),
  cron_expression: emptyDevTool(),
  hash_uuid: emptyDevTool(),
  jwt_decoder: emptyDevTool(),
});

/** Instance-scoped buffer key. Legacy tabs (no instanceKey) keep the original viewType key. */
export function utilityContentKey(key: ToolId, instanceKey?: string): string {
  return instanceKey ? `${key}:${instanceKey}` : key;
}

type Store = {
  values: Record<string, UtilityToolContentMap[ToolId]>;
  patch: <K extends ToolId>(key: K, patch: Partial<UtilityToolContentMap[K]>, instanceKey?: string) => void;
  clear: (key: ToolId, instanceKey?: string) => void;
  resetAll: () => void;
};

/** Session-only editor content. Unmount/remount of an inactive pane must not lose work. */
export const useUtilityToolContent = create<Store>((set) => ({
  values: initialContent(),
  patch: (key, patch, instanceKey) => set((s) => {
    const ck = utilityContentKey(key, instanceKey);
    const seed = s.values[ck] ?? s.values[key] ?? initialContent()[key];
    return { values: { ...s.values, [ck]: { ...seed, ...patch } } };
  }),
  clear: (key, instanceKey) => set((s) => ({
    values: { ...s.values, [utilityContentKey(key, instanceKey)]: initialContent()[key] },
  })),
  resetAll: () => set({ values: initialContent() }),
}));

/** Fresh value outside React render — actions must not read a stale input closure. */
export function getUtilityContent<K extends ToolId>(key: K, instanceKey?: string): UtilityToolContentMap[K] {
  const ck = utilityContentKey(key, instanceKey);
  return (useUtilityToolContent.getState().values[ck] ?? useUtilityToolContent.getState().values[key]) as UtilityToolContentMap[K];
}

export function useUtilityContent<K extends ToolId>(key: K, instanceKey?: string) {
  const ck = utilityContentKey(key, instanceKey);
  const value = useUtilityToolContent((s) => s.values[ck] ?? s.values[key]) as UtilityToolContentMap[K];
  const patch = useCallback(
    (p: Partial<UtilityToolContentMap[K]>) => useUtilityToolContent.getState().patch(key, p, instanceKey),
    [key, instanceKey]
  );
  const clear = useCallback(() => useUtilityToolContent.getState().clear(key, instanceKey), [key, instanceKey]);
  return [value, patch, clear] as const;
}
