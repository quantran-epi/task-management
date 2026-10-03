import React, { useState } from 'react';
import { Typography, Button, Tooltip, theme, message } from 'antd';
import { CopyOutlined, CheckOutlined } from '@ant-design/icons';
import type { ChatMessage } from '../../types/models';
import { renderSafeMarkdown } from '../../utils/markdown';

const { Text } = Typography;

export interface ChatMessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
}

export const ChatMessageBubble: React.FC<ChatMessageBubbleProps> = ({
  message: msg,
  isStreaming = false,
}) => {
  const { token } = theme.useToken();
  const [copied, setCopied] = useState(false);

  const isUser = msg.role === 'user';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopied(true);
      message.success('Đã sao chép nội dung');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      message.error('Không thể sao chép');
    }
  };

  const formattedTime = msg.createdAt
    ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div
      data-role={msg.role}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 12,
        width: '100%',
      }}
    >
      <div
        style={{
          maxWidth: isUser ? '85%' : '95%',
          backgroundColor: isUser ? token.colorPrimary : token.colorFillAlter,
          color: isUser ? '#ffffff' : token.colorText,
          borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
          border: isUser ? 'none' : `1px solid ${token.colorBorderSecondary}`,
          padding: isUser ? '8px 12px' : '12px 16px',
          wordBreak: 'break-word',
          fontSize: 14,
          lineHeight: 1.57,
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        }}
      >
        {isUser ? (
          <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
        ) : (
          <div>
            <div
              className="chat-markdown-body"
              dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(msg.content) }}
            />
            {isStreaming && (
              <span
                style={{
                  display: 'inline-block',
                  color: token.colorPrimary,
                  fontWeight: 'bold',
                  marginLeft: 2,
                  animation: 'blink 1s infinite',
                }}
              >
                ▋
              </span>
            )}
          </div>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginTop: 4,
          paddingLeft: isUser ? 0 : 4,
          paddingRight: isUser ? 4 : 0,
        }}
      >
        {formattedTime && (
          <Text type="secondary" style={{ fontSize: 11 }}>
            {formattedTime}
          </Text>
        )}
        {!isUser && (
          <Tooltip title={copied ? 'Đã sao chép' : 'Sao chép nội dung'}>
            <Button
              type="text"
              size="small"
              icon={copied ? <CheckOutlined style={{ color: token.colorSuccess, fontSize: 12 }} /> : <CopyOutlined style={{ fontSize: 12 }} />}
              onClick={handleCopy}
              aria-label="Sao chép nội dung"
              style={{ minHeight: 20, minWidth: 20, padding: 0 }}
            />
          </Tooltip>
        )}
      </div>
    </div>
  );
};
