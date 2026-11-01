import React from 'react';
import { Typography, Button, Tooltip, Dropdown, Popover, Badge, Switch, theme } from 'antd';
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
  ApiOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import type { McpServerConfig } from '../../services/ai/mcpClient';

const { Text } = Typography;

export interface ChatHeaderProps {
  isPinned: boolean;
  onTogglePin: () => void;
  onClearAllHistory?: () => void;
  onDeleteCurrentThread?: () => void;
  onOpenDebug?: () => void;
  onOpenMcpSettings?: () => void;
  onPopout?: () => void;
  onOpenInstructions?: () => void;
  onClose: () => void;
  mcpServers?: McpServerConfig[];
  onToggleMcpServer?: (id: string, enabled: boolean) => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  isPinned,
  onTogglePin,
  onClearAllHistory,
  onDeleteCurrentThread,
  onOpenDebug,
  onOpenMcpSettings,
  onPopout,
  onOpenInstructions,
  onClose,
  mcpServers = [],
  onToggleMcpServer,
}) => {
  const { token } = theme.useToken();

  const enabledMcpCount = mcpServers.filter((s) => s.enabled).length;

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
    ...(onOpenMcpSettings
      ? [
          {
            key: 'mcp-settings',
            icon: <ApiOutlined />,
            label: 'Quản lý máy chủ MCP',
            onClick: onOpenMcpSettings,
          },
        ]
      : []),
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

  const mcpPopoverContent = (
    <div style={{ width: 260 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
          paddingBottom: 6,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <Text strong style={{ fontSize: 12 }}>
          Máy chủ MCP
        </Text>
        {onOpenMcpSettings && (
          <Button
            type="link"
            size="small"
            icon={<SettingOutlined />}
            onClick={onOpenMcpSettings}
            style={{ padding: 0, fontSize: 11 }}
          >
            Cài đặt
          </Button>
        )}
      </div>

      {mcpServers.length === 0 ? (
        <Text type="secondary" style={{ fontSize: 12, display: 'block', padding: '8px 0' }}>
          Chưa có máy chủ MCP nào. Thêm trong Cài đặt.
        </Text>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
          {mcpServers.map((server) => (
            <div
              key={server.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '4px 0',
              }}
            >
              <div style={{ minWidth: 0, flex: 1, marginRight: 8 }}>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {server.name}
                </Text>
                <Text
                  type="secondary"
                  style={{
                    fontSize: 10,
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {server.url}
                </Text>
              </div>
              <Switch
                size="small"
                checked={server.enabled}
                onChange={(checked) => onToggleMcpServer?.(server.id, checked)}
                aria-label={`Bật/tắt ${server.name}`}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        borderBottom: `1px solid rgba(79, 70, 229, 0.12)`,
        background: `linear-gradient(to right, rgba(79, 70, 229, 0.07) 0%, rgba(124, 58, 237, 0.04) 50%, ${token.colorBgContainer} 100%)`,
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              boxShadow: '0 2px 8px rgba(79, 70, 229, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              flexShrink: 0,
            }}
          >
            <RobotFilled style={{ fontSize: 18 }} />
          </div>
          <span
            style={{
              position: 'absolute',
              bottom: -1,
              right: -1,
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: '#10b981',
              border: '1.5px solid #ffffff',
              boxShadow: '0 0 4px rgba(16, 185, 129, 0.6)',
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
          <Text strong style={{ fontSize: 14, whiteSpace: 'nowrap', color: token.colorText }}>
            Trợ lý AI
          </Text>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        {/* Quick MCP Toggle Popover */}
        <Popover
          content={mcpPopoverContent}
          title={null}
          trigger="click"
          placement="bottomRight"
          getPopupContainer={(node) => node.parentElement || document.body}
        >
          <Tooltip title={`Máy chủ MCP (${enabledMcpCount} đang bật)`}>
            <Badge
              count={enabledMcpCount}
              size="small"
              offset={[-2, 4]}
              style={{ backgroundColor: enabledMcpCount > 0 ? '#10b981' : token.colorTextQuaternary }}
            >
              <Button
                type="text"
                size="small"
                icon={<ApiOutlined style={{ color: enabledMcpCount > 0 ? token.colorPrimary : undefined }} />}
                aria-label="Bật/tắt nhanh máy chủ MCP"
                style={{ minWidth: 28, minHeight: 28 }}
              />
            </Badge>
          </Tooltip>
        </Popover>

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
