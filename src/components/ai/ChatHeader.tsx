import React from 'react';
import { Typography, Button, Tooltip, Dropdown, theme } from 'antd';
import type { MenuProps } from 'antd';
import {
  RobotFilled,
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
import type { ActiveScope } from '../../context/AIChatContext';

const { Text } = Typography;

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
        padding: '8px 14px',
        borderBottom: `1px solid rgba(79, 70, 229, 0.12)`,
        background: `linear-gradient(to right, rgba(79, 70, 229, 0.07) 0%, rgba(124, 58, 237, 0.04) 50%, ${token.colorBgContainer} 100%)`,
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              boxShadow: '0 2px 6px rgba(79, 70, 229, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              flexShrink: 0,
            }}
          >
            <RobotFilled style={{ fontSize: 16 }} />
          </div>
          <span
            style={{
              position: 'absolute',
              bottom: -1,
              right: -1,
              width: 7,
              height: 7,
              borderRadius: '50%',
              backgroundColor: '#10b981',
              border: '1.5px solid #ffffff',
              boxShadow: '0 0 4px rgba(16, 185, 129, 0.6)',
            }}
          />
        </div>

        <Text strong style={{ fontSize: 13, whiteSpace: 'nowrap', color: token.colorText, flexShrink: 0 }}>
          Trợ lý AI
        </Text>

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
