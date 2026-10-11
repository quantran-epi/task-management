import React from 'react';
import { Tag, theme } from 'antd';
import { BookOutlined, AppstoreOutlined } from '@ant-design/icons';

export interface IntentRoutingPromptProps {
  onSelect: (route: 'knowledge' | 'operational') => void;
}

export const IntentRoutingPrompt: React.FC<IntentRoutingPromptProps> = ({ onSelect }) => {
  const { token } = theme.useToken();

  const handleActivate = (route: 'knowledge' | 'operational') => {
    onSelect(route);
  };

  const handleKeyDown = (e: React.KeyboardEvent, route: 'knowledge' | 'operational') => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(route);
    }
  };

  return (
    <div
      className="intent-routing-prompt"
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 8,
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 500, color: token.colorTextSecondary }}>
        Bạn muốn:
      </span>

      <Tag
        role="button"
        tabIndex={0}
        aria-label="Tra cứu tài liệu"
        icon={<BookOutlined />}
        onClick={() => handleActivate('knowledge')}
        onKeyDown={(e) => handleKeyDown(e, 'knowledge')}
        style={{
          cursor: 'pointer',
          margin: 0,
          padding: '4px 10px',
          borderRadius: token.borderRadiusSM,
          background: token.colorBgContainer,
          borderColor: token.colorPrimaryBorder ?? token.colorPrimary,
          color: token.colorPrimary,
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        Tra cứu tài liệu
      </Tag>

      <Tag
        role="button"
        tabIndex={0}
        aria-label="Thao tác PlannerMate"
        icon={<AppstoreOutlined />}
        onClick={() => handleActivate('operational')}
        onKeyDown={(e) => handleKeyDown(e, 'operational')}
        style={{
          cursor: 'pointer',
          margin: 0,
          padding: '4px 10px',
          borderRadius: token.borderRadiusSM,
          background: token.colorBgContainer,
          borderColor: token.colorBorder,
          color: token.colorText,
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        Thao tác PlannerMate
      </Tag>
    </div>
  );
};
