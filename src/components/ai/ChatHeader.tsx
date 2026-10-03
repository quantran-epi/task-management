import React from 'react';
import { Space, Typography, Tag, Select, Button, Tooltip, theme } from 'antd';
import {
  RobotOutlined,
  ClearOutlined,
  PushpinOutlined,
  PushpinFilled,
  CloseOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

export interface ChatHeaderProps {
  scopeLabel: string;
  selectedModel: string;
  availableModels: string[];
  onModelChange: (model: string) => void;
  isPinned: boolean;
  onTogglePin: () => void;
  onClearContext: () => void;
  onClose: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  scopeLabel,
  selectedModel,
  availableModels,
  onModelChange,
  isPinned,
  onTogglePin,
  onClearContext,
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
        <Tooltip title={scopeLabel}>
          <Tag
            color="processing"
            style={{
              maxWidth: 140,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              margin: 0,
              fontSize: 11,
              borderRadius: 4,
            }}
          >
            {scopeLabel}
          </Tag>
        </Tooltip>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <Select
          size="small"
          value={selectedModel}
          onChange={onModelChange}
          style={{ width: 110 }}
          options={
            availableModels.length > 0
              ? availableModels.map((m) => ({ label: m, value: m }))
              : [
                  { label: 'gpt-4o', value: 'gpt-4o' },
                  { label: 'gpt-4o-mini', value: 'gpt-4o-mini' },
                  { label: 'claude-3-5-sonnet', value: 'claude-3-5-sonnet' },
                  { label: 'deepseek-chat', value: 'deepseek-chat' },
                ]
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
