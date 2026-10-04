import React from 'react';
import { Typography, Select, Button, Tooltip, Dropdown, theme } from 'antd';
import type { MenuProps } from 'antd';
import {
  RobotFilled,
  ClearOutlined,
  PushpinOutlined,
  PushpinFilled,
  CloseOutlined,
  BugOutlined,
  ExportOutlined,
  ThunderboltOutlined,
  ThunderboltFilled,
  MoreOutlined,
  BookOutlined,
  DeleteOutlined,
  StarFilled,
} from '@ant-design/icons';

const { Text } = Typography;

export interface ScopeOptionItem {
  value: string; // "global" | "task:<id>" | "project:<id>" | "milestone:<id>"
  label: string;
}

export interface ScopeOptionGroup {
  label: string;
  options: ScopeOptionItem[];
}

export interface ChatHeaderProps {
  scopeLabel?: string;
  selectedScopeValue?: string;
  scopeOptions?: ScopeOptionGroup[];
  onScopeChange?: (value: string) => void;
  onOpenScopePicker?: () => void;
  selectedModel: string;
  availableModels: string[];
  onModelChange: (model: string) => void;
  autoApproveMutations?: boolean;
  onToggleAutoApproveMutations?: (() => void) | undefined;
  isPinned: boolean;
  onTogglePin: () => void;
  onClearContext: () => void;
  onClearAllHistory?: (() => void) | undefined;
  onDeleteCurrentThread?: (() => void) | undefined;
  onOpenDebug?: (() => void) | undefined;
  onPopout?: (() => void) | undefined;
  onOpenInstructions?: (() => void) | undefined;
  onClose: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  selectedModel,
  availableModels,
  onModelChange,
  autoApproveMutations = false,
  onToggleAutoApproveMutations,
  isPinned,
  onTogglePin,
  onClearContext,
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
    ...(onToggleAutoApproveMutations
      ? [
          {
            key: 'auto-approve',
            icon: autoApproveMutations ? (
              <ThunderboltFilled style={{ color: token.colorWarning }} />
            ) : (
              <ThunderboltOutlined />
            ),
            label: autoApproveMutations
              ? 'Tắt tự động duyệt thay đổi'
              : 'Bật tự động duyệt thay đổi',
            onClick: onToggleAutoApproveMutations,
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <Text strong style={{ fontSize: 14, whiteSpace: 'nowrap', color: token.colorText }}>
            Trợ lý AI
          </Text>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              fontSize: 10,
              fontWeight: 600,
              padding: '1px 6px',
              borderRadius: 10,
              backgroundColor: 'rgba(79, 70, 229, 0.1)',
              color: '#4f46e5',
              border: '1px solid rgba(79, 70, 229, 0.2)',
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
            }}
          >
            <StarFilled style={{ fontSize: 8 }} />
            Assistant
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <Select
          size="small"
          value={selectedModel}
          onChange={onModelChange}
          showSearch
          filterOption={(input, option) =>
            ((option?.label as string) ?? '').toLowerCase().includes(input.toLowerCase())
          }
          style={{ minWidth: 120, maxWidth: 165 }}
          popupMatchSelectWidth={false}
          getPopupContainer={(node) => node.parentElement || document.body}
          popupStyle={{ zIndex: 1300 }}
          aria-label="Chọn mô hình AI"
          options={
            availableModels.length > 0
              ? availableModels.map((m) => ({ label: m, value: m }))
              : selectedModel
                ? [{ label: selectedModel, value: selectedModel }]
                : []
          }
        />

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

        <Tooltip title="Đặt lại ngữ cảnh (/clear)">
          <Button
            type="text"
            size="small"
            icon={<ClearOutlined />}
            onClick={onClearContext}
            aria-label="Đặt lại ngữ cảnh (/clear)"
            style={{ minWidth: 28, minHeight: 28 }}
          />
        </Tooltip>

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
