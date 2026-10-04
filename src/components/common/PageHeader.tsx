import React from 'react';
import { Typography, theme } from 'antd';

const { Title, Text } = Typography;

export interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  extra?: React.ReactNode;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  extra,
  children,
  style,
  className,
}) => {
  const { token } = theme.useToken();

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        marginBottom: 16,
        ...style,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          {typeof title === 'string' ? (
            <Title
              level={4}
              style={{
                margin: 0,
                fontWeight: 600,
                letterSpacing: '-0.01em',
                color: token.colorText,
              }}
            >
              {title}
            </Title>
          ) : (
            title
          )}
          {subtitle && (
            <Text
              type="secondary"
              style={{
                fontSize: 13,
                display: 'block',
                marginTop: 2,
                color: token.colorTextSecondary,
              }}
            >
              {subtitle}
            </Text>
          )}
        </div>

        {extra && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            {extra}
          </div>
        )}
      </div>

      {children && <div>{children}</div>}
    </div>
  );
};
