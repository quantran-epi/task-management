import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// Break the pre-existing tokens.ts -> antdTheme.ts -> tokens.contract.ts -> tokens.ts
// init cycle by loading tokens.contract first when this file runs on its own.
import '../tokens.contract';
import {
  applyCssVariables,
  darkTokens,
  getAntdTheme,
  lightTokens,
  statusColorMap,
  type ThemeMode,
} from '../../../styles/tokens';

const ROOT = resolve(__dirname, '../../../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

const paletteFields = [
  'colorPrimary', 'colorPrimaryHover', 'colorBgBase', 'colorBgContainer', 'colorBgElevated',
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
    expect(built.token?.controlHeight).toBe(30);
    expect(built.token?.fontSize).toBe(13);
  });

  it('changes only colors between modes — metrics stay identical', () => {
    const light = getAntdTheme('light');
    const dark = getAntdTheme('dark');
    expect(light.token?.colorPrimary).toBe('#2f62d8');
    expect(dark.token?.colorPrimary).toBe('#6a9bff');
    expect(light.token?.colorPrimaryHover).toBe('#1e4bb8');
    expect(dark.token?.colorPrimaryHover).toBe('#8db2ff');
    expect(light.token?.colorPrimary).not.toBe(dark.token?.colorPrimary);
    for (const field of ['borderRadius', 'controlHeight', 'fontFamily', 'fontSize'] as const) {
      expect(light.token?.[field]).toEqual(dark.token?.[field]);
    }
    expect(light.components).toEqual(dark.components);
    // Locked metrics from 49-UI-SPEC — explicit values, not read back from the object under test.
    expect(lightTokens.borderRadius).toBe(4);
    expect(lightTokens.controlHeight).toBe(30);
    expect(lightTokens.fontSize).toBe(13);
    expect(lightTokens.buttonPaddingInline).toBe(12);
    expect(lightTokens.tablePadding).toBe(8);
    expect(lightTokens.tableFontSize).toBe(13);
  });

  it('exposes the exact D-12 status map for both modes', () => {
    expect(statusColorMap.light).toEqual({
      success: '#338555', warning: '#a56906', danger: '#d1484f', info: '#22d3ee', accent: '#2f62d8',
    });
    expect(statusColorMap.dark).toEqual({
      success: '#4ade80', warning: '#e8a13a', danger: '#ff8289', info: '#22d3ee', accent: '#6a9bff',
    });
  });

  it('detects palette drift in the adapter and duplicate palette literals in CSS', () => {
    const adapter = read('src/workbench/AntdThemeAdapter.tsx');
    expect(adapter.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toHaveLength(0);

    const css = read('src/styles/workbench-tokens.css');
    const code = css.split('\n')
      .filter((line) => !line.trimStart().startsWith('/*') && !line.trimStart().startsWith('*'))
      .join('\n');
    for (const hex of ['#2f62d8', '#6a9bff', '#338555', '#4ade80', '#d1484f', '#ff8289']) {
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
    expect(element.style.getPropertyValue('--accent')).toBe(
      mode === 'light' ? '#2f62d8' : '#6a9bff'
    );
    expect(element.style.getPropertyValue('--accent-hover')).toBe(
      mode === 'light' ? '#1e4bb8' : '#8db2ff'
    );
  });
});
