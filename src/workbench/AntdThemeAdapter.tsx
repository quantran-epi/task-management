import React from 'react';
import { ConfigProvider, theme } from 'antd';
import { useThemeMode } from '../hooks/useThemeMode';

export interface AntdThemeAdapterProps {
  children: React.ReactNode;
}

// IN-01: light values mirror workbench-tokens.css; dark values mirror its dark block so the
// Antd controls and the CSS-token surfaces switch together under an OS dark preference.
const LIGHT_TOKENS = {
  colorPrimary: '#2f62d8',
  colorBgBase: '#ffffff',
  colorBgContainer: '#ffffff',
  colorBgElevated: '#f7f8fa',
  colorBorder: '#e9eaee',
  colorBorderSecondary: '#d1d3d9',
  colorText: '#191b1f',
  colorTextSecondary: '#5f6269',
  colorTextTertiary: '#6c707e',
} as const;

const DARK_TOKENS = {
  colorPrimary: '#6a9bff',
  colorBgBase: '#11151d',
  colorBgContainer: '#171d27',
  colorBgElevated: '#1c2330',
  colorBorder: '#2c3646',
  colorBorderSecondary: '#3d4a5f',
  colorText: '#e6ebf5',
  colorTextSecondary: '#9aa8bd',
  colorTextTertiary: '#9aa8bd',
} as const;

export function AntdThemeAdapter({ children }: AntdThemeAdapterProps) {
  const isDark = useThemeMode();
  const palette = isDark ? DARK_TOKENS : LIGHT_TOKENS;
  return (
    <ConfigProvider
      theme={{
        algorithm: [isDark ? theme.darkAlgorithm : theme.defaultAlgorithm, theme.compactAlgorithm],
        token: {
          colorInfo: '#22d3ee',
          ...palette,
          borderRadius: 4,
          fontSize: 13.5,
          fontFamily: 'var(--font-ui, "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
          controlHeight: 30,
        },
        components: {
          Button: {
            controlHeight: 30,
            paddingInline: 12,
            borderRadius: 4,
          },
          Input: {
            controlHeight: 30,
            borderRadius: 4,
          },
          Select: {
            controlHeight: 30,
            borderRadius: 4,
          },
          Table: {
            padding: 8,
            fontSize: 13,
          },
        },
      }}
    >
      <div
        className="taskmate-workbench-theme"
        data-theme={isDark ? 'dark' : 'light'}
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
