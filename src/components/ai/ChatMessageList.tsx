import React, { useRef, useEffect } from 'react';
import { Divider, theme } from 'antd';
import { SyncOutlined } from '@ant-design/icons';
import type { ChatMessage } from '../../types/models';
import { ChatMessageBubble } from './ChatMessageBubble';
import { InlineApiErrorCard } from './InlineApiErrorCard';

export interface ChatMessageListProps {
  messages: ChatMessage[];
  streamingText?: string | undefined;
  isStreaming?: boolean | undefined;
  streamingStatus?: string | null | undefined;
  error?: string | null | undefined;
  onRetry?: (() => void) | undefined;
  onOpenSettings?: (() => void) | undefined;
  canAddToChecklist?: boolean | undefined;
  canSaveStickyNote?: boolean | undefined;
  canRunClaudeCode?: boolean | undefined;
  onAddToChecklist?: ((items: string[]) => Promise<void> | void) | undefined;
  onSaveStickyNote?: ((content: string) => Promise<void> | void) | undefined;
  onRunClaudeCode?: (() => Promise<void> | void) | undefined;
}

export const ChatMessageList: React.FC<ChatMessageListProps> = ({
  messages,
  streamingText,
  isStreaming = false,
  streamingStatus,
  error,
  onRetry,
  onOpenSettings,
  canAddToChecklist,
  canSaveStickyNote,
  canRunClaudeCode,
  onAddToChecklist,
  onSaveStickyNote,
  onRunClaudeCode,
}) => {
  const { token } = theme.useToken();
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on message change or streaming text chunk
  useEffect(() => {
    if (typeof bottomRef.current?.scrollIntoView === 'function') {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingText, error]);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {messages.length === 0 && !streamingText && !error && (
        <div
          style={{
            margin: 'auto',
            textAlign: 'center',
            padding: '32px 16px',
            color: token.colorTextSecondary,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: token.colorText }}>
            Trợ lý AI Task Planner
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 360, margin: '0 auto' }}>
            Đặt câu hỏi về tác vụ hiện tại, phân tích tiến độ, gợi ý checklist hoặc tra cứu tài liệu đính kèm. Nhập câu hỏi bên dưới để bắt đầu.
          </div>
        </div>
      )}

      {messages.map((msg) => {
        if (msg.isContextBoundary) {
          return (
            <Divider
              key={msg.id}
              dashed
              style={{
                margin: '16px 0',
                color: token.colorTextSecondary,
                fontSize: 12,
                borderColor: token.colorBorderSecondary,
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <SyncOutlined spin={false} style={{ fontSize: 11 }} />
                Ngữ cảnh đã được đặt lại
              </span>
            </Divider>
          );
        }

        return (
          <ChatMessageBubble
            key={msg.id}
            message={msg}
            canAddToChecklist={canAddToChecklist}
            canSaveStickyNote={canSaveStickyNote}
            canRunClaudeCode={canRunClaudeCode}
            onAddToChecklist={onAddToChecklist}
            onSaveStickyNote={onSaveStickyNote}
            onRunClaudeCode={onRunClaudeCode}
          />
        );
      })}

      {/* Active SSE Streaming Assistant Bubble */}
      {isStreaming && (
        <ChatMessageBubble
          message={{
            id: 'temp-streaming-msg',
            threadId: 'active',
            role: 'assistant',
            content: streamingText || '',
            createdAt: new Date().toISOString(),
          }}
          isStreaming={true}
          streamingStatus={streamingStatus}
        />
      )}

      {/* Inline API Error Card */}
      {error && onRetry && onOpenSettings && (
        <InlineApiErrorCard
          errorMessage={error}
          onRetry={onRetry}
          onOpenSettings={onOpenSettings}
        />
      )}

      <div ref={bottomRef} style={{ height: 1 }} />
    </div>
  );
};
