import React from 'react';
import { ConfigProvider, theme } from 'antd';

export interface AntdThemeAdapterProps {
  children: React.ReactNode;
}

export function AntdThemeAdapter({ children }: AntdThemeAdapterProps) {
  return (
    <ConfigProvider
      theme={{
        algorithm: [theme.defaultAlgorithm, theme.compactAlgorithm],
        token: {
          colorPrimary: '#3871e1',
          colorBgBase: '#ffffff',
          colorBgContainer: '#ffffff',
          colorBgElevated: '#f7f8fa',
          colorBorder: '#e9eaee',
          colorBorderSecondary: '#d1d3d9',
          colorText: '#191b1f',
          colorTextSecondary: '#5f6269',
          colorTextTertiary: '#6c707e',
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
        data-theme="light"
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
