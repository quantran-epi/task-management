// Internal AntD theme bridge (D-01/D-03/D-17/D-19): the only module outside
// AntD that imports runtime `theme`. src/styles/tokens.ts calls this function
// instead of importing AntD directly, so GUARD-01 stays green. Not a bare
// re-export: the shared control metrics are applied to the algorithm config.
import { theme as AntTheme, type ThemeConfig } from 'antd';
import { useMemo } from 'react';
import { useThemeMode } from '../../hooks/useThemeMode';
import { getAntdTheme } from '../../styles/tokens';
import { getSharedControlTokens } from './tokens.contract';

export type { ThemeConfig };

/** Token type returned by useAntdToken, for helper signatures in view files. */
export type AntdToken = ReturnType<typeof AntTheme.useToken>['token'];

/**
 * Themed token hook for view files. Derives the resolved AntD token object from
 * the same theme config the adapter uses; callers never import `theme` from antd.
 */
export function useAntdToken() {
  const { mode } = useThemeMode();
  const descriptor = useMemo(() => AntTheme.getDesignToken(getAntdTheme(mode)), [mode]);
  return { token: descriptor as AntdToken, hashed: '', hashId: '' };
}

export const darkAlgorithm = AntTheme.darkAlgorithm;

export type ThemeMode = 'light' | 'dark';

export function getAntdAlgorithms(mode: ThemeMode) {
  const controlTokens = getSharedControlTokens();
  return {
    algorithm: [
      mode === 'dark' ? AntTheme.darkAlgorithm : AntTheme.defaultAlgorithm,
      AntTheme.compactAlgorithm,
    ],
    controlHeight: controlTokens.controlHeight,
  };
}
