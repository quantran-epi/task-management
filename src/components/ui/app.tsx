import { App as AntApp, type AppProps as AntAppProps } from 'antd';
import type { ReactNode } from 'react';
import { getSharedControlTokens } from './tokens.contract';

export type AppProps<P = Record<string, unknown>> = AntAppProps<P>;

/**
 * Single swap point for AntD App. Kept separate from message.tsx's ThemeAppHolder
 * so every value import name from `antd` has a real wrapper (D-04/D-03).
 */
export function App<P = Record<string, unknown>>({ children, style, ...rest }: AppProps<P>) {
  const { fontSize } = getSharedControlTokens();
  const tokenStyle = { '--ui-app-font-size': `${fontSize}px` } as React.CSSProperties;
  return (
    <AntApp {...rest} style={{ ...tokenStyle, ...style }}>
      {children as ReactNode}
    </AntApp>
  );
}

/** Context holder hook lives here as the AntD App surface; message.tsx reuses it. */
export function useApp() {
  return AntApp.useApp();
}
