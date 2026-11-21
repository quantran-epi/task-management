import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyCssVariables,
  darkTokens,
  fileStatusMap,
  getAntdTheme,
  lightTokens,
  statusColorMap,
  type ThemeMode,
} from '../../../styles/tokens';

const ROOT = resolve(__dirname, '../../../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

const paletteFields = [
  'colorPrimary', 'colorBgBase', 'colorBgContainer', 'colorBgElevated',
  'colorBorder', 'colorBorderSecondary', 'colorText', 'colorTextSecondary',
  'colorTextTertiary', 'colorInfo',
] as const;

describe('tokens — single source parity', () => {
  it.each<ThemeMode>(['light', 'dark'])('%s ConfigProvider palette matches the token object', (mode) => {
    const tokens = mode === 'light' ? lightTokens : darkTokens;
    const built = getAntdTheme(mode);
    for (const field of paletteFields) {
      expect(built.token?.[field]).toBe(tokens.antd[field]);
    }
    expect(built.token?.borderRadius).toBe(4);
    expect(built.token?.controlHeight).toBe(28);
    expect(built.token?.fontSize).toBe(13);
  });

  it('changes only colors between modes — metrics stay identical', () => {
    const light = getAntdTheme('light');
    const dark = getAntdTheme('dark');
    expect(light.token?.colorPrimary).toBe('#3871e1');
    expect(dark.token?.colorPrimary).toBe('#3871e1');
    for (const field of ['borderRadius', 'controlHeight', 'fontFamily', 'fontSize'] as const) {
      expect(light.token?.[field]).toEqual(dark.token?.[field]);
    }
    expect(light.components).toEqual(dark.components);
    // Locked metrics from 49-UI-SPEC — explicit values, not read back from the object under test.
    expect(lightTokens.borderRadius).toBe(4);
    expect(lightTokens.controlHeight).toBe(28);
    expect(lightTokens.smallControlHeight).toBe(24);
    expect(lightTokens.listRowHeight).toBe(24);
    expect(lightTokens.popupOffset).toBe(4);
    expect(lightTokens.fontSize).toBe(13);
    expect(lightTokens.buttonPaddingInline).toBe(16);
    expect(lightTokens.buttonPaddingInlinePrimary).toBe(16);
    expect(lightTokens.buttonPaddingInlineGhost).toBe(8);
    expect(lightTokens.buttonPaddingInlineSmall).toBe(10);
    expect(lightTokens.tablePadding).toBe(8);
    expect(lightTokens.tableFontSize).toBe(13);
    for (const css of [lightTokens.css, darkTokens.css]) {
      expect(css['--radius-popup']).toBe('10px');
      expect(css['--radius-selection']).toBe('5px');
      expect(css['--radius-toolbar-button']).toBe('6px');
      expect(css['--radius-tooltip']).toBe('6px');
      expect(css['--radius-dialog']).toBe('10px');
      expect(css['--popup-offset']).toBe('4px');
      expect(css['--h-control']).toBe('24px');
      expect(css['--h-list-row']).toBe('24px');
      expect(css['--dur-fast']).toBe('80ms');
      expect(css['--dur']).toBe('140ms');
      expect(css['--ease']).toBe('cubic-bezier(0.2,0,0,1)');
    }
    expect(lightTokens.css['--danger-control']).toBe('#c54e58');
    expect(darkTokens.css['--danger-control']).toBe('#f57e84');
    expect(lightTokens.css['--danger']).toBe(statusColorMap.light.danger);
    expect(darkTokens.css['--danger']).toBe(statusColorMap.dark.danger);
  });

  it('exposes the exact D-12 status map for both modes', () => {
    expect(statusColorMap.light).toEqual({
      success: '#338555', warning: '#a56906', danger: '#d1484f', info: '#22d3ee', accent: '#3871e1',
    });
    expect(statusColorMap.dark).toEqual({
      success: '#4ade80', warning: '#e8a13a', danger: '#ff8289', info: '#22d3ee', accent: '#3871e1',
    });
  });

  it('keeps the VCS file-status map byte-for-byte', () => {
    expect(fileStatusMap.light).toEqual({
      untracked: '#16a34a', untrackedBg: 'rgba(22, 163, 74, 0.1)',
      added: '#0891b2', addedBg: 'rgba(8, 145, 178, 0.1)',
      deleted: '#dc2626', deletedBg: 'rgba(220, 38, 38, 0.1)',
      modified: '#2563eb', modifiedBg: 'rgba(37, 99, 235, 0.1)',
      folderIcon: '#c98614',
    });
    expect(fileStatusMap.dark).toEqual({
      untracked: '#4ade80', untrackedBg: 'rgba(74, 222, 128, 0.1)',
      added: '#22d3ee', addedBg: 'rgba(34, 211, 238, 0.1)',
      deleted: '#ff8289', deletedBg: 'rgba(255, 130, 137, 0.1)',
      modified: '#6a9bff', modifiedBg: 'rgba(106, 155, 255, 0.1)',
      folderIcon: '#c98614',
    });
  });

  it('detects palette drift in the adapter and duplicate palette literals in CSS', () => {
    const adapter = read('src/workbench/AntdThemeAdapter.tsx');
    expect(adapter.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toHaveLength(0);

    const css = read('src/styles/workbench-tokens.css');
    const code = css.split('\n')
      .filter((line) => !line.trimStart().startsWith('/*') && !line.trimStart().startsWith('*'))
      .join('\n');
    for (const hex of ['#338555', '#4ade80', '#d1484f', '#ff8289']) {
      expect(code.includes(hex)).toBe(false);
    }
  });

  it.each<ThemeMode>(['light', 'dark'])('applyCssVariables writes exact %s token values', (mode) => {
    const tokens = mode === 'light' ? lightTokens : darkTokens;
    const element = document.createElement('div');
    applyCssVariables(mode, element);
    for (const name of ['--accent', '--bg-app', '--fg', '--success', '--danger', '--radius-control']) {
      expect(element.style.getPropertyValue(name)).toBe(tokens.css[name as keyof typeof tokens.css]);
    }
    expect(element.style.getPropertyValue('--accent')).toBe('#3871e1');
  });
});
