import React from 'react';
import { Button, Tooltip, Dropdown, theme } from 'antd';
import type { MenuProps } from 'antd';
import {
  PushpinOutlined,
  PushpinFilled,
  CloseOutlined,
  BugOutlined,
  ExportOutlined,
  MoreOutlined,
  BookOutlined,
  DeleteOutlined,
  DisconnectOutlined,
} from '@ant-design/icons';
import { JetBrainsAIIcon } from '../icons/JetBrainsIcons';
import type { ActiveScope } from '../../context/AIChatContext';

export interface ChatHeaderProps {
  currentScope?: ActiveScope | undefined;
  onOpenScopePicker?: (() => void) | undefined;
  onDetachScope?: (() => void) | undefined;
  isPinned: boolean;
  onTogglePin: () => void;
  onClearAllHistory?: (() => void) | undefined;
  onDeleteCurrentThread?: (() => void) | undefined;
  onOpenDebug?: (() => void) | undefined;
  onPopout?: (() => void) | undefined;
  onOpenInstructions?: (() => void) | undefined;
  onClose: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  currentScope,
  onOpenScopePicker,
  onDetachScope,
  isPinned,
  onTogglePin,
  onClearAllHistory,
  onDeleteCurrentThread,
  onOpenDebug,
  onPopout,
  onOpenInstructions,
  onClose,
}) => {
  const { token } = theme.useToken();

  const menuItems: MenuProps['items'] = [
    ...(onOpenInstructions
      ? [
          {
            key: 'instructions',
            icon: <BookOutlined style={{ color: token.colorPrimary }} />,
            label: 'Hướng dẫn lập kế hoạch AI',
            onClick: onOpenInstructions,
          },
        ]
      : []),
    {
      key: 'pin',
      icon: isPinned ? (
        <PushpinFilled style={{ color: token.colorPrimary }} />
      ) : (
        <PushpinOutlined />
      ),
      label: isPinned ? 'Bỏ ghim ngăn trò chuyện' : 'Ghim ngăn trò chuyện bên phải',
      onClick: onTogglePin,
    },
    ...(onOpenDebug
      ? [
          {
            key: 'debug',
            icon: <BugOutlined />,
            label: 'Nhật ký gỡ lỗi AI',
            onClick: onOpenDebug,
          },
        ]
      : []),
    ...(onDeleteCurrentThread
      ? [
          {
            type: 'divider' as const,
          },
          {
            key: 'delete-thread',
            icon: <DeleteOutlined style={{ color: token.colorWarning }} />,
            label: 'Xóa tin nhắn hội thoại này',
            onClick: onDeleteCurrentThread,
          },
        ]
      : []),
    ...(onClearAllHistory
      ? [
          {
            key: 'clear-all-history',
            icon: <DeleteOutlined style={{ color: token.colorError }} />,
            danger: true,
            label: 'Xóa toàn bộ lịch sử AI',
            onClick: onClearAllHistory,
          },
        ]
      : []),
  ];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 34,
        padding: '0 10px',
        borderBottom: `1px solid var(--border, #e9eaee)`,
        background: `var(--bg-elev, #f7f8fa)`,
        gap: 6,
        userSelect: 'none',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
        <JetBrainsAIIcon size={14} />
        <span style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', color: 'var(--fg-strong, #000000)', flexShrink: 0 }}>
          Trợ lý AI
        </span>

        {/* Scope Pill at Header Level */}
        {currentScope && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              background: token.colorBgContainer,
              border: `1px solid ${token.colorBorderSecondary}`,
              borderRadius: token.borderRadiusSM,
              maxWidth: 180,
              minWidth: 0,
            }}
          >
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: 11,
                fontWeight: 500,
                color: currentScope.type === 'global' ? token.colorTextSecondary : token.colorPrimary,
              }}
              title={currentScope.title || currentScope.type}
            >
              {currentScope.type === 'global'
                ? 'Toàn cục (Không gắn)'
                : currentScope.title || currentScope.id}
            </span>
            {onOpenScopePicker && (
              <Button
                type="link"
                size="small"
                onClick={onOpenScopePicker}
                aria-label="Đổi phạm vi ngữ cảnh"
                style={{ padding: 0, height: 'auto', fontSize: 11 }}
              >
                Đổi
              </Button>
            )}
            {currentScope.type !== 'global' && onDetachScope && (
              <Button
                type="text"
                size="small"
                icon={<DisconnectOutlined style={{ fontSize: 10 }} />}
                onClick={onDetachScope}
                title="Gỡ gắn ngữ cảnh"
                style={{ padding: 0, height: 'auto', width: 14, color: token.colorTextSecondary }}
              />
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        {onPopout && (
          <Tooltip title="Mở cửa sổ riêng (Popout)">
            <Button
              type="text"
              size="small"
              icon={<ExportOutlined />}
              onClick={onPopout}
              aria-label="Mở cửa sổ riêng (Popout)"
              style={{ minWidth: 28, minHeight: 28 }}
            />
          </Tooltip>
        )}

        <Dropdown
          menu={{ items: menuItems }}
          trigger={['click']}
          placement="bottomRight"
          getPopupContainer={(node) => node.parentElement || document.body}
        >
          <Tooltip title="Tùy chọn khác">
            <Button
              type="text"
              size="small"
              icon={<MoreOutlined />}
              aria-label="Tùy chọn khác"
              data-testid="chat-header-more-btn"
              style={{ minWidth: 28, minHeight: 28 }}
            />
          </Tooltip>
        </Dropdown>

        <Tooltip title="Đóng ngăn trò chuyện">
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined />}
            onClick={onClose}
            aria-label="Đóng ngăn trò chuyện"
            style={{ minWidth: 28, minHeight: 28 }}
          />
        </Tooltip>
      </div>
    </div>
  );
};
