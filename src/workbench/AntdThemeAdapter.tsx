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
          colorBgElevated: '#f7f8f9',
          colorBorder: '#e9eaee',
          colorBorderSecondary: '#f0f1f3',
          colorText: '#000000',
          colorTextSecondary: '#5f6269',
          colorTextTertiary: '#6c707e',
          borderRadius: 3,
          fontSize: 12.5,
          fontFamily: 'var(--font-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter Variable", sans-serif)',
          controlHeight: 26,
        },
        components: {
          Button: {
            controlHeight: 26,
            paddingInline: 8,
          },
          Input: {
            controlHeight: 26,
          },
          Select: {
            controlHeight: 26,
          },
          Table: {
            padding: 4,
            fontSize: 12,
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
