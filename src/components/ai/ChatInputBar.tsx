import React, { useState } from 'react';
import { Input, Button, Tooltip, theme } from 'antd';
import { SendOutlined, StopOutlined } from '@ant-design/icons';

const { TextArea } = Input;

export interface ChatInputBarProps {
  onSubmit: (text: string) => void;
  onClear?: () => void;
  onStop?: () => void;
  isStreaming?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export const ChatInputBar: React.FC<ChatInputBarProps> = ({
  onSubmit,
  onClear,
  onStop,
  isStreaming = false,
  disabled = false,
  placeholder = 'Hỏi AI hoặc gõ /clear để đặt lại... (Cmd+Enter để gửi)',
}) => {
  const { token } = theme.useToken();
  const [value, setValue] = useState('');

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed) return;

    if (trimmed === '/clear') {
      setValue('');
      onClear?.();
      return;
    }

    setValue('');
    onSubmit(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      style={{
        padding: '12px 16px',
        backgroundColor: token.colorBgContainer,
        borderTop: `1px solid ${token.colorBorderSecondary}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <TextArea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label="Nội dung tin nhắn trò chuyện AI"
        autoSize={{ minRows: 2, maxRows: 6 }}
        disabled={disabled || isStreaming}
        style={{
          borderRadius: 8,
          fontSize: 14,
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
        {isStreaming ? (
          <Tooltip title="Dừng sinh phản hồi">
            <Button
              type="primary"
              danger
              icon={<StopOutlined />}
              onClick={onStop}
              aria-label="Dừng sinh phản hồi"
            >
              Dừng
            </Button>
          </Tooltip>
        ) : (
          <Tooltip title="Gửi tin nhắn (Cmd+Enter)">
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSend}
              disabled={disabled || !value.trim()}
              aria-label="Gửi tin nhắn"
            >
              Gửi
            </Button>
          </Tooltip>
        )}
      </div>
    </div>
  );
};
