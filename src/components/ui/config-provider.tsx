import { ConfigProvider as AntConfigProvider } from 'antd';
import type { ThemeConfig } from 'antd';
import type { ReactNode } from 'react';
import { getSharedControlTokens, withoutUndefined } from './tokens.contract';

export type ConfigProviderProps = {
  theme?: ThemeConfig;
  children: ReactNode;
};

/** Single swap point for AntD ConfigProvider; theme stays owned by the caller. */
export function ThemeConfigProvider({ theme, children }: ConfigProviderProps) {
  void getSharedControlTokens();
  return <AntConfigProvider {...withoutUndefined({ theme })}>{children}</AntConfigProvider>;
}
