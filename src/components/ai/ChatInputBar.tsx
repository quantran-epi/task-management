import React, { useState, useRef, useEffect } from 'react';
import { Input, Button, Tooltip, theme } from 'antd';
import { SendOutlined, StopOutlined } from '@ant-design/icons';

const { TextArea } = Input;

export interface ChatInputBarProps {
  onSubmit: (text: string) => void;
  onClear?: (() => void) | undefined;
  onStop?: (() => void) | undefined;
  isStreaming?: boolean | undefined;
  disabled?: boolean | undefined;
  placeholder?: string | undefined;
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
  const submitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (submitTimerRef.current) {
        clearTimeout(submitTimerRef.current);
      }
    };
  }, []);

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
    const rawVal = value || targetEl?.value || '';
    const trimmed = rawVal.trim();
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
      const rawText = value.trim() || el?.value?.trim() || '';
      if (!rawText) return;

      isSubmittingRef.current = true;
      clearInput(el);

      if (submitTimerRef.current) {
        clearTimeout(submitTimerRef.current);
      }

      // Hold lock across microtasks and subsequent IME/browser input macrotask cycles
      submitTimerRef.current = setTimeout(() => {
        clearInput();
        isSubmittingRef.current = false;
      }, 250);

      if (rawText === '/clear') {
        onClear?.();
      } else {
        onSubmit(rawText);
      }
    }
  };

  return (
    <div
      style={{
        padding: '10px 14px',
        backgroundColor: token.colorBgContainer,
        borderTop: `1px solid ${token.colorBorderSecondary}`,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 8,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <TextArea
          ref={textAreaRef}
          value={value}
          onChange={(e) => {
            if (isSubmittingRef.current) {
              e.target.value = '';
              setValue('');
              return;
            }
            setValue(e.target.value);
          }}
          onInput={(e) => {
            if (isSubmittingRef.current) {
              const target = e.target as HTMLTextAreaElement;
              if (target) target.value = '';
              setValue('');
            }
          }}
          onCompositionEnd={(e) => {
            if (isSubmittingRef.current) {
              const target = e.target as HTMLTextAreaElement;
              if (target) target.value = '';
              clearInput();
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label="Nội dung tin nhắn trò chuyện AI"
          autoSize={{ minRows: 1, maxRows: 5 }}
          disabled={disabled || isStreaming}
          style={{
            borderRadius: 8,
            fontSize: 14,
          }}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        {isStreaming ? (
          <Tooltip title="Dừng sinh phản hồi">
            <Button
              type="primary"
              danger
              icon={<StopOutlined />}
              onClick={onStop}
              aria-label="Dừng sinh phản hồi"
              style={{ height: 32 }}
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
              style={{ height: 32 }}
            >
              Gửi
            </Button>
          </Tooltip>
        )}
      </div>
    </div>
  );
};
