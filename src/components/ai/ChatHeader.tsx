import React from 'react';
import { Typography, Select, Button, Tooltip, theme } from 'antd';
import {
  RobotOutlined,
  ClearOutlined,
  PushpinOutlined,
  PushpinFilled,
  CloseOutlined,
  BugOutlined,
  ExportOutlined,
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
  isPinned: boolean;
  onTogglePin: () => void;
  onClearContext: () => void;
  onOpenDebug?: (() => void) | undefined;
  onPopout?: (() => void) | undefined;
  onClose: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  selectedModel,
  availableModels,
  onModelChange,
  isPinned,
  onTogglePin,
  onClearContext,
  onOpenDebug,
  onPopout,
  onClose,
}) => {
  const { token } = theme.useToken();

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
          style={{ minWidth: 125, maxWidth: 175 }}
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

        {onOpenDebug && (
          <Tooltip title="Nhật ký gỡ lỗi AI (Xem tin nhắn & công cụ)">
            <Button
              type="text"
              size="small"
              icon={<BugOutlined />}
              onClick={onOpenDebug}
              aria-label="Nhật ký gỡ lỗi AI"
              style={{ minWidth: 28, minHeight: 28 }}
            />
          </Tooltip>
        )}

        <Tooltip
          title={
            isPinned
              ? 'Bỏ ghim ngăn trò chuyện (Chuyển sang dạng lớp phủ)'
              : 'Ghim ngăn trò chuyện bên phải (Co hẹp giao diện chính)'
          }
        >
          <Button
            type="text"
            size="small"
            icon={
              isPinned ? (
                <PushpinFilled style={{ color: token.colorPrimary }} />
              ) : (
                <PushpinOutlined />
              )
            }
            onClick={onTogglePin}
            aria-label={
              isPinned
                ? 'Bỏ ghim ngăn trò chuyện'
                : 'Ghim ngăn trò chuyện bên phải'
            }
            style={{ minWidth: 28, minHeight: 28 }}
          />
        </Tooltip>

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
