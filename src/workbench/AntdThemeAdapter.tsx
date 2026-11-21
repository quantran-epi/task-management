import React, { useEffect, useRef } from 'react';
import { ConfigProvider } from 'antd';
import { useThemeMode } from '../hooks/useThemeMode';
import { applyCssVariables, getAntdTheme, type ThemeMode } from '../styles/tokens';

export interface AntdThemeAdapterProps {
  children: React.ReactNode;
}

export function AntdThemeAdapter({ children }: AntdThemeAdapterProps) {
  const isDark = useThemeMode();
  const mode: ThemeMode = isDark ? 'dark' : 'light';
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (wrapperRef.current) applyCssVariables(mode, wrapperRef.current);
  }, [mode]);

  return (
    <ConfigProvider theme={getAntdTheme(mode)}>
      <div
        ref={wrapperRef}
        className="taskmate-workbench-theme"
        data-theme={mode}
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
        }}
      >
        {children}
      </div>
    </ConfigProvider>
  );
}
