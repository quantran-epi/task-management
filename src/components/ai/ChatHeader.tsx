import React from 'react';
import { Typography, Select, Button, Tooltip, Dropdown, theme } from 'antd';
import type { MenuProps } from 'antd';
import {
  RobotOutlined,
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
        padding: '12px 16px',
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
        backgroundColor: token.colorBgContainer,
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
        <RobotOutlined style={{ fontSize: 18, color: token.colorPrimary, flexShrink: 0 }} />
        <Text strong style={{ fontSize: 15, whiteSpace: 'nowrap' }}>
          Trợ lý AI
        </Text>
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
