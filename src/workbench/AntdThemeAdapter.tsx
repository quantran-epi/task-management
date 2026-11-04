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
          fontSize: 13,
          fontFamily: 'var(--font-ui, "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
          controlHeight: 28,
        },
        components: {
          Button: {
            controlHeight: 28,
            paddingInline: 12,
            borderRadius: 4,
          },
          Input: {
            controlHeight: 28,
            borderRadius: 4,
          },
          Select: {
            controlHeight: 28,
            borderRadius: 4,
          },
          Table: {
            padding: 6,
            fontSize: 12.5,
          },
        },
      }}
    >
      <div className="taskmate-workbench-theme" data-theme="light">
        {children}
      </div>
    </ConfigProvider>
  );
}
