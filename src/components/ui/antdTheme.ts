// Internal AntD theme bridge (D-01/D-03/D-17/D-19): the only module outside
// AntD that imports runtime `theme`. src/styles/tokens.ts calls this function
// instead of importing AntD directly, so GUARD-01 stays green. Not a bare
// re-export: the shared control metrics are applied to the algorithm config.
import { theme, type ThemeConfig } from 'antd';
import { getSharedControlTokens } from './tokens.contract';

export type { ThemeConfig };

export type ThemeMode = 'light' | 'dark';

export function getAntdAlgorithms(mode: ThemeMode) {
  const controlTokens = getSharedControlTokens();
  return {
    algorithm: [
      mode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
      theme.compactAlgorithm,
    ],
    controlHeight: controlTokens.controlHeight,
  };
}
