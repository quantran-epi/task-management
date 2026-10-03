import React, { useState, useRef } from 'react';
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
  const textAreaRef = useRef<any>(null);
  const isSubmittingRef = useRef(false);

  const clearInput = (el?: HTMLTextAreaElement | null) => {
    setValue('');
    if (el && 'value' in el) {
      el.value = '';
    }
    const nativeArea = textAreaRef.current?.resizableTextArea?.textArea || textAreaRef.current?.input;
    if (nativeArea && 'value' in nativeArea) {
      nativeArea.value = '';
    }
  };

  const handleSend = (targetEl?: HTMLTextAreaElement) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    clearInput(targetEl);

    if (trimmed === '/clear') {
      onClear?.();
      return;
    }

    onSubmit(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      const el = e.currentTarget;
      if (el) {
        el.value = '';
      }
      isSubmittingRef.current = true;
      handleSend(el);
      queueMicrotask(() => {
        clearInput(el);
        isSubmittingRef.current = false;
      });
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
        ref={textAreaRef}
        value={value}
        onChange={(e) => {
          if (isSubmittingRef.current) {
            e.target.value = '';
            return;
          }
          setValue(e.target.value);
        }}
        onCompositionEnd={() => {
          if (isSubmittingRef.current) {
            clearInput();
          }
        }}
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
              onClick={() => handleSend()}
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
