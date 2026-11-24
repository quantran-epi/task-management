import { getAntdAlgorithms, type ThemeConfig } from '../components/ui/antdTheme';

/**
 * Single source of truth for the workbench palette and metrics (TOKEN-01..04, D-08/D-12).
 * ConfigProvider and CSS custom properties are both derived from these objects.
 * Hex values are locked by 49-UI-SPEC — do not invent or "harmonise" them here.
 */

export type ThemeMode = 'light' | 'dark';

/** Shared metrics: identical in both modes — only colors change. */
export const sharedTokens = {
  borderRadius: 4,
  controlHeight: 30,
  fontSize: 13, // UI-SPEC §Typography — Body/UI token (no fractional sizes).
  fontFamily: 'var(--font-ui, "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
  buttonPaddingInline: 12,
  tablePadding: 8,
  tableFontSize: 13,
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    '2xl': '48px',
    '3xl': '64px',
  },
  islandGap: '6px', // UI-SPEC §Spacing Scale exception — locked in workbench-tokens.css.
} as const;

/** D-12 status map — one map for Tag/Badge/StatusDot in every domain. */
export const statusColorMap = {
  light: {
    success: '#338555',
    warning: '#a56906',
    danger: '#d1484f',
    info: '#22d3ee',
    accent: '#2f62d8',
  },
  dark: {
    success: '#4ade80',
    warning: '#e8a13a',
    danger: '#ff8289',
    info: '#22d3ee',
    accent: '#6a9bff',
  },
} as const;

/** File-status colors stay in the same source; light/dark values are the approved CSS ones. */
export const fileStatusMap = {
  light: {
    untracked: '#16a34a',
    untrackedBg: 'rgba(22, 163, 74, 0.1)',
    added: '#0891b2',
    addedBg: 'rgba(8, 145, 178, 0.1)',
    deleted: '#dc2626',
    deletedBg: 'rgba(220, 38, 38, 0.1)',
    modified: '#2563eb',
    modifiedBg: 'rgba(37, 99, 235, 0.1)',
    folderIcon: '#c98614',
  },
  dark: {
    untracked: '#4ade80',
    untrackedBg: 'rgba(74, 222, 128, 0.1)',
    added: '#22d3ee',
    addedBg: 'rgba(34, 211, 238, 0.1)',
    deleted: '#ff8289',
    deletedBg: 'rgba(255, 130, 137, 0.1)',
    modified: '#6a9bff',
    modifiedBg: 'rgba(106, 155, 255, 0.1)',
    folderIcon: '#c98614',
  },
} as const;

const cssMetrics = {
  '--island-gap': sharedTokens.islandGap,
  // D-09: spacing gaps reach views as CSS vars, never inline literals.
  // Exact values preserve current spacing; each maps 1:1 to its old px literal.
  '--gap-1': '1px',
  '--gap-2': '2px',
  '--gap-3': '3px',
  '--gap-4': '4px',
  '--gap-5': '5px',
  '--gap-6': '6px',
  '--gap-7': '7px',
  '--gap-8': '8px',
  '--gap-10': '10px',
  '--gap-12': '12px',
  '--gap-14': '14px',
  '--gap-16': '16px',
  '--gap-24': '24px',
  '--island-radius': '8px',
  '--radius-small': '4px',
  '--radius-control': '4px',
  '--radius-popup': '8px',
  '--radius-tab': '6px',
  '--stripe-width': '36px',
  '--titlebar-height': '40px',
  '--statusbar-height': '26px',
  '--tabbar-height': '36px',
  '--font-ui': '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  '--font-mono': '"IBM Plex Mono", "SFMono-Regular", Consolas, monospace',
  '--font-size-ui': '13px',
  '--font-size-base': '13px',
  '--font-size-small': '12px',
  '--font-size-xs': '11px',
  '--row': '24px',
  '--find-row-height': '24px',
  '--tree-indent': '12px',
  '--tree-icon-size': '16px',
  '--tree-guide-width': '1px',
  '--find-field-height': '34px',
  '--find-toggle-height': '22px',
  '--find-pane-head-height': '30px',
  '--find-handle-height': '7px',
  '--find-results-height': '210px',
  '--find-preview-height': '246px',
  '--find-dialog-width': 'min(820px, calc(100% - 32px))',
  '--find-dialog-top': '22px',
  '--find-dialog-radius': '11px',
  '--find-code-line-height': '19px',
  '--find-gutter-width': '52px',
  '--find-drag-height': '38px',
  '--find-footer-height': '38px',
  '--find-gap-xs': sharedTokens.spacing.xs,
  '--find-gap-sm': sharedTokens.spacing.sm,
  '--find-gap-md': sharedTokens.spacing.md,
  '--find-mask-width': '140px',
  '--search-head-height': '38px',
  '--search-tab-height': '24px',
  '--search-row-height': '34px',
  '--status-badge-height': '14px',
  '--status-badge-pad': '4px',
} as const;

/** Light palette. `antdText` and `cssFg` intentionally differ (UI-SPEC: do not change either hex). */
export const lightTokens = {
  ...sharedTokens,
  antd: {
    colorPrimary: '#2f62d8',
    colorPrimaryHover: '#1e4bb8',
    colorBgBase: '#ffffff',
    colorBgContainer: '#ffffff',
    colorBgElevated: '#f7f8fa',
    colorBorder: '#e9eaee',
    colorBorderSecondary: '#d1d3d9',
    colorText: '#191b1f',
    colorTextSecondary: '#5f6269',
    colorTextTertiary: '#6c707e',
    colorInfo: '#22d3ee',
  },
  css: {
    ...cssMetrics,
    '--bg-frame': '#e9eaee',
    '--bg-app': '#ffffff',
    '--bg-island': '#ffffff',
    '--bg-elev': '#f7f8fa',
    '--bg-popup': '#ffffff',
    '--bg-floating-toolbar': '#ffffff',
    '--bg-hover': '#ededed',
    '--bg-selected': '#d0dffe',
    '--bg-selected-strong': '#bdd3ff',
    '--bg-current-line': '#f5f8fe',
    '--bg-backdrop': '#e9eaee',
    '--bg-input': '#ffffff',
    '--border': '#e9eaee',
    '--border-strong': '#d1d3d9',
    '--border-popup': '#d1d3d9',
    '--border-window': '#d1d3d9',
    '--control-off': '#c3c5cb',
    '--fg': '#1f2937',
    '--fg-strong': '#000000',
    '--fg-secondary': '#5f6269',
    '--fg-muted': '#6c707e',
    '--fg-subtle': '#64748b',
    '--fg-faint': '#94a3b8',
    '--fg-icon': '#6c707e',
    '--accent': '#2f62d8',
    '--accent-hover': '#1e4bb8',
    '--accent-soft': '#e4ecff',
    '--accent-fg': '#ffffff',
    '--link': '#2f62d8',
    '--link-hover': '#1e4bb8',
    '--project-color': '#22d3ee',
    '--project-color-end': '#a855f7',
    '--project-gradient-strength': '18%',
    '--bg': '#eef1f6',
    '--surface': '#f8fafc',
    '--surface-strong': '#ffffff',
    '--surface-sunken': '#e8ecf3',
    '--match': '#ffe08a',
    '--match-ink': '#2b2100',
    '--shadow': '0 24px 70px rgba(23, 35, 58, 0.24), 0 3px 12px rgba(23, 35, 58, 0.12)',
    '--find-shadow': '0 24px 70px rgba(23, 35, 58, 0.24), 0 3px 12px rgba(23, 35, 58, 0.12)',
    '--status-untracked': fileStatusMap.light.untracked,
    '--status-untracked-bg': fileStatusMap.light.untrackedBg,
    '--status-added': fileStatusMap.light.added,
    '--status-added-bg': fileStatusMap.light.addedBg,
    '--status-deleted': fileStatusMap.light.deleted,
    '--status-deleted-bg': fileStatusMap.light.deletedBg,
    '--status-modified': fileStatusMap.light.modified,
    '--status-modified-bg': fileStatusMap.light.modifiedBg,
    '--folder-icon': fileStatusMap.light.folderIcon,
    '--success': statusColorMap.light.success,
    '--warning': statusColorMap.light.warning,
    '--danger': statusColorMap.light.danger,
    '--info': statusColorMap.light.info,
  },
  status: statusColorMap.light,
  fileStatus: fileStatusMap.light,
} as const;

export const darkTokens = {
  ...sharedTokens,
  antd: {
    colorPrimary: '#6a9bff',
    colorPrimaryHover: '#8db2ff',
    colorBgBase: '#11151d',
    colorBgContainer: '#171d27',
    colorBgElevated: '#1c2330',
    colorBorder: '#2c3646',
    colorBorderSecondary: '#3d4a5f',
    colorText: '#e6ebf5',
    colorTextSecondary: '#9aa8bd',
    colorTextTertiary: '#9aa8bd',
    colorInfo: '#22d3ee',
  },
  css: {
    ...cssMetrics,
    '--bg-frame': '#11151d',
    '--bg-app': '#171d27',
    '--bg-island': '#1c2330',
    '--bg-elev': '#171d27',
    '--bg-popup': '#1c2330',
    '--bg-floating-toolbar': '#1c2330',
    '--bg-hover': '#232c3b',
    '--bg-selected': '#1e3156',
    '--bg-selected-strong': '#27406e',
    '--bg-current-line': '#1e3156',
    '--bg-backdrop': '#11151d',
    '--bg-input': '#111720',
    '--border': '#2c3646',
    '--border-strong': '#3d4a5f',
    '--border-popup': '#3d4a5f',
    '--border-window': '#3d4a5f',
    '--control-off': '#4a566b',
    '--fg': '#e6ebf5',
    '--fg-strong': '#f4f7fb',
    '--fg-secondary': '#9aa8bd',
    '--fg-muted': '#9aa8bd',
    '--fg-subtle': '#9aa8bd',
    '--fg-faint': '#71819a',
    '--fg-icon': '#9aa8bd',
    '--accent': '#6a9bff',
    '--accent-hover': '#8db2ff',
    '--accent-soft': '#1e3156',
    '--accent-fg': '#071224',
    '--link': '#6a9bff',
    '--link-hover': '#8db2ff',
    '--project-color': '#22d3ee',
    '--project-color-end': '#a855f7',
    '--project-gradient-strength': '12%',
    '--bg': '#11151d',
    '--surface': '#171d27',
    '--surface-strong': '#1c2330',
    '--surface-sunken': '#111720',
    '--match': '#a97c16',
    '--match-ink': '#fff8e1',
    '--shadow': '0 24px 70px rgba(0, 0, 0, 0.55), 0 3px 12px rgba(0, 0, 0, 0.35)',
    '--find-shadow': '0 24px 70px rgba(0, 0, 0, 0.55), 0 3px 12px rgba(0, 0, 0, 0.35)',
    '--status-untracked': fileStatusMap.dark.untracked,
    '--status-untracked-bg': fileStatusMap.dark.untrackedBg,
    '--status-added': fileStatusMap.dark.added,
    '--status-added-bg': fileStatusMap.dark.addedBg,
    '--status-deleted': fileStatusMap.dark.deleted,
    '--status-deleted-bg': fileStatusMap.dark.deletedBg,
    '--status-modified': fileStatusMap.dark.modified,
    '--status-modified-bg': fileStatusMap.dark.modifiedBg,
    '--folder-icon': fileStatusMap.dark.folderIcon,
    '--success': statusColorMap.dark.success,
    '--warning': statusColorMap.dark.warning,
    '--danger': statusColorMap.dark.danger,
    '--info': statusColorMap.dark.info,
  },
  status: statusColorMap.dark,
  fileStatus: fileStatusMap.dark,
} as const;

export function getAntdTheme(mode: ThemeMode): ThemeConfig {
  const tokens = mode === 'dark' ? darkTokens : lightTokens;
  return {
    algorithm: getAntdAlgorithms(mode).algorithm,
    token: {
      colorPrimary: tokens.antd.colorPrimary,
      colorPrimaryHover: tokens.antd.colorPrimaryHover,
      colorBgBase: tokens.antd.colorBgBase,
      colorBgContainer: tokens.antd.colorBgContainer,
      colorBgElevated: tokens.antd.colorBgElevated,
      colorBorder: tokens.antd.colorBorder,
      colorBorderSecondary: tokens.antd.colorBorderSecondary,
      colorText: tokens.antd.colorText,
      colorTextSecondary: tokens.antd.colorTextSecondary,
      colorTextTertiary: tokens.antd.colorTextTertiary,
      colorInfo: tokens.antd.colorInfo,
      borderRadius: tokens.borderRadius,
      fontSize: tokens.fontSize,
      fontFamily: tokens.fontFamily,
      controlHeight: tokens.controlHeight,
    },
    components: {
      Button: {
        controlHeight: tokens.controlHeight,
        paddingInline: tokens.buttonPaddingInline,
        borderRadius: tokens.borderRadius,
      },
      Input: {
        controlHeight: tokens.controlHeight,
        borderRadius: tokens.borderRadius,
      },
      Select: {
        controlHeight: tokens.controlHeight,
        borderRadius: tokens.borderRadius,
      },
      Table: {
        padding: tokens.tablePadding,
        fontSize: tokens.tableFontSize,
      },
    },
  };
}

/**
 * Writes only enum-derived values from the typed token objects — never a raw stored string.
 * Palette lands on the document root as well as the wrapper so AntD portals
 * (Modal/Drawer/Dropdown/Find) appended to <body> inherit the same variables (CR-02).
 */
export function applyCssVariables(mode: ThemeMode, target: HTMLElement): void {
  const tokens = mode === 'dark' ? darkTokens : lightTokens;
  const roots = [target, document.documentElement];
  for (const [name, value] of Object.entries(tokens.css)) {
    for (const root of roots) root.style.setProperty(name, value);
  }
  for (const root of roots) root.style.colorScheme = mode;
}

// CSS-only aliases kept in workbench-tokens.css because they are structural var() references,
// not palette/metric values: --handle-line-color, --handle-line-color-hover.
