import { useEffect, useRef, type ReactNode } from 'react';
import type { ThemeConfig } from 'antd';
import type { ThemeMode } from '../../styles/tokens';
import { applyCssVariables, lightTokens, darkTokens } from '../../styles/tokens';
import { useThemeMode } from '../../hooks/useThemeMode';
import { getSharedControlTokens, withoutUndefined } from './tokens.contract';

export type ConfigProviderProps = {
  theme?: ThemeConfig;
  children: ReactNode;
};

/** Detect the requested palette from the caller theme seed, falling back to the live mode. */
function resolveMode(theme: ThemeConfig | undefined, fallback: ThemeMode): ThemeMode {
  const seed = theme?.token?.colorBgBase;
  if (seed === lightTokens.antd.colorBgBase) return 'light';
  if (seed === darkTokens.antd.colorBgBase) return 'dark';
  return fallback;
}

/**
 * Single swap point for AntD ConfigProvider. Vars land on both wrapper and
 * documentElement so portals inherit the same control palette (CR-01/CR-02).
 * No runtime AntD import — `ThemeConfig` stays type-only for caller parity.
 */
export function ThemeConfigProvider({ theme, children }: ConfigProviderProps) {
  const { mode } = useThemeMode();
  const resolvedMode = resolveMode(theme, mode);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const config = withoutUndefined({ theme });

  useEffect(() => {
    void config;
    void getSharedControlTokens();
    if (wrapperRef.current) applyCssVariables(resolvedMode, wrapperRef.current);
  }, [resolvedMode]);

  return (
    <div ref={wrapperRef} className="taskmate-theme-context" data-theme={resolvedMode}>
      {children}
    </div>
  );
}
