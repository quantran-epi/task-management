import React from 'react';
import { CloseOutlined, MessageOutlined, PlusOutlined } from '@ant-design/icons';
import { Badge, Tooltip, theme } from 'antd';

export type ChatTabType = 'sdlc' | 'chat';

export interface ChatTabItem {
  id: string; // 'sdlc' hoặc uuid của chat thread
  type: ChatTabType;
  title: string;
  threadId: string;
  createdAt: string;
}

export interface ChatTabBarProps {
  tabs: ChatTabItem[];
  activeTabId: string;
  onSelectTab: (tabId: string) => void;
  onAddTab: () => void;
  onCloseTab: (tabId: string) => void;
  sdlcStatus?: 'wait' | 'process' | 'stale' | 'finish';
}

export const ChatTabBar: React.FC<ChatTabBarProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onAddTab,
  onCloseTab,
  sdlcStatus = 'wait',
}) => {
  const { token } = theme.useToken();

  return (
    <div
      role="tablist"
      aria-label="Thanh tab hội thoại AI"
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 2,
        padding: '6px 10px 0 10px',
        backgroundColor: token.colorFillAlter,
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
        overflowX: 'auto',
        scrollbarWidth: 'none',
        userSelect: 'none',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const isSdlc = tab.type === 'sdlc';

        let badgeStatus: 'default' | 'processing' | 'warning' | 'success' = 'default';
        if (isSdlc) {
          if (sdlcStatus === 'process') badgeStatus = 'processing';
          else if (sdlcStatus === 'stale') badgeStatus = 'warning';
          else if (sdlcStatus === 'finish') badgeStatus = 'success';
        }

        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelectTab(tab.id)}
            style={{
              height: 32,
              padding: '0 10px 0 12px',
              backgroundColor: isActive ? token.colorBgContainer : 'transparent',
              color: isActive ? token.colorText : token.colorTextSecondary,
              fontWeight: isActive ? 600 : 500,
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
              borderTopLeftRadius: 8,
              borderTopRightRadius: 8,
              border: isActive
                ? `1px solid ${token.colorBorderSecondary}`
                : '1px solid transparent',
              borderBottom: isActive ? `1px solid ${token.colorBgContainer}` : undefined,
              marginBottom: isActive ? -1 : 0,
              maxWidth: 170,
              minWidth: 105,
              position: 'relative',
              transition: 'background-color 0.15s, color 0.15s',
              zIndex: isActive ? 2 : 1,
            }}
          >
            {isSdlc ? (
              <Badge status={badgeStatus} style={{ flexShrink: 0 }} />
            ) : (
              <MessageOutlined style={{ fontSize: 11, color: token.colorTextTertiary, flexShrink: 0 }} />
            )}

            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
              }}
              title={tab.title}
            >
              {tab.title}
            </span>

            {/* Chỉ tab chat thường mới có nút đóng tab */}
            {!isSdlc && (
              <span
                role="button"
                aria-label={`Đóng ${tab.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  color: token.colorTextQuaternary,
                  flexShrink: 0,
                  transition: 'background-color 0.15s, color 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = token.colorFillSecondary;
                  e.currentTarget.style.color = token.colorText;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = token.colorTextQuaternary;
                }}
              >
                <CloseOutlined style={{ fontSize: 9 }} />
              </span>
            )}
          </div>
        );
      })}

      {/* Nút [+] Tạo tab chat thường mới */}
      <Tooltip title="Mở tab chat AI mới">
        <button
          type="button"
          aria-label="Mở tab chat AI mới"
          onClick={onAddTab}
          style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            background: 'transparent',
            color: token.colorTextSecondary,
            cursor: 'pointer',
            marginLeft: 4,
            marginBottom: 3,
            transition: 'background-color 0.15s, color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = token.colorFillSecondary;
            e.currentTarget.style.color = token.colorPrimary;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = token.colorTextSecondary;
          }}
        >
          <PlusOutlined style={{ fontSize: 11 }} />
        </button>
      </Tooltip>
    </div>
  );
};
