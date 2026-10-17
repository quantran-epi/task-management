import React, { useRef, useEffect } from 'react';
import { Divider, Button, theme } from 'antd';
import { SyncOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import type { ChatMessage } from '../../types/models';
import { APP_NAME } from '../../constants/app';
import { ChatMessageBubble, type GroundedAnswerCardCallbacks } from './ChatMessageBubble';
import { InlineApiErrorCard } from './InlineApiErrorCard';
import { IntentRoutingPrompt } from './grounded/IntentRoutingPrompt';

export interface PendingConfirmationInfo {
  toolName: string;
  summary: string;
  args?: Record<string, any>;
}

export interface TransientClarifyState {
  id: string;
  originalQuery: string;
  clarifyQuestion: string;
  turnCount: number;
}

export interface ChatMessageListProps {
  messages: ChatMessage[];
  streamingText?: string | undefined;
  isStreaming?: boolean | undefined;
  streamingStatus?: string | null | undefined;
  error?: string | null | undefined;
  scrollTrigger?: number | undefined;
  onRetry?: (() => void) | undefined;
  onOpenSettings?: (() => void) | undefined;
  canAddToChecklist?: boolean | undefined;
  canSaveStickyNote?: boolean | undefined;
  canRunClaudeCode?: boolean | undefined;
  onAddToChecklist?: ((items: string[]) => Promise<void> | void) | undefined;
  onSaveStickyNote?: ((content: string) => Promise<void> | void) | undefined;
  onRunClaudeCode?: (() => Promise<void> | void) | undefined;
  pendingConfirmation?: PendingConfirmationInfo | null;
  onConfirmAction?: (confirmed: boolean) => void;
  groundedCallbacks?: GroundedAnswerCardCallbacks | undefined;
  transientClarifyMessage?: TransientClarifyState | null | undefined;
  onCancelClarify?: (() => void) | undefined;
}

export const ChatMessageList: React.FC<ChatMessageListProps> = ({
  messages,
  streamingText,
  isStreaming = false,
  streamingStatus,
  error,
  scrollTrigger,
  onRetry,
  onOpenSettings,
  canAddToChecklist,
  canSaveStickyNote,
  canRunClaudeCode,
  onAddToChecklist,
  onSaveStickyNote,
  onRunClaudeCode,
  pendingConfirmation,
  onConfirmAction,
  groundedCallbacks,
  transientClarifyMessage,
  onCancelClarify,
}) => {
  const { token } = theme.useToken();
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = (instant = false) => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
    if (bottomRef.current?.scrollIntoView) {
      bottomRef.current.scrollIntoView({ behavior: instant ? 'auto' : 'smooth' });
    }
  };

  // Immediate scroll to bottom when user hits Send
  useEffect(() => {
    if (scrollTrigger) {
      scrollToBottom(true);
    }
  }, [scrollTrigger]);

  // Auto-scroll on new message added, confirmation prompt displayed, or clarify prompt shown
  useEffect(() => {
    scrollToBottom(false);
  }, [messages.length, pendingConfirmation, transientClarifyMessage]);

  // Keep pinned to bottom during streaming or errors
  useEffect(() => {
    if (isStreaming || streamingText || error || pendingConfirmation || transientClarifyMessage) {
      scrollToBottom(true);
    }
  }, [streamingText, isStreaming, error, pendingConfirmation, transientClarifyMessage]);

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
            Trợ lý AI {APP_NAME}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 360, margin: '0 auto' }}>
            Đặt câu hỏi về tác vụ hiện tại, phân tích tiến độ, gợi ý checklist hoặc tra cứu tài liệu đính kèm. Nhập câu hỏi bên dưới để bắt đầu.
          </div>
        </div>
      )}

      {messages.map((msg) => {
        if (msg.isContextBoundary) {
          const isCompacted = msg.content?.includes('Tóm tắt ngữ cảnh') || msg.content?.includes('Compact Context');
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
                {isCompacted ? 'Đã tóm tắt ngữ cảnh trước đó' : 'Ngữ cảnh đã được đặt lại'}
              </span>
            </Divider>
          );
        }

        // Pass message with grounding intact for structured rendering
        return (
          <React.Fragment key={msg.id}>
            <ChatMessageBubble
              message={msg}
              canAddToChecklist={canAddToChecklist}
              canSaveStickyNote={canSaveStickyNote}
              canRunClaudeCode={canRunClaudeCode}
              onAddToChecklist={onAddToChecklist}
              onSaveStickyNote={onSaveStickyNote}
              onRunClaudeCode={onRunClaudeCode}
              groundedCallbacks={groundedCallbacks}
            />
            {transientClarifyMessage &&
              msg.role === 'user' &&
              msg.content === transientClarifyMessage.originalQuery && (
                <div style={{ marginTop: -4, marginBottom: 12, display: 'flex', width: '100%' }}>
                  <IntentRoutingPrompt
                    question={transientClarifyMessage.clarifyQuestion}
                    originalQuery={transientClarifyMessage.originalQuery}
                    onCancel={onCancelClarify}
                  />
                </div>
              )}
          </React.Fragment>
        );
      })}

      {/* Fallback IntentRoutingPrompt if user query message not found in list */}
      {transientClarifyMessage &&
        !messages.some(
          (m) => m.role === 'user' && m.content === transientClarifyMessage.originalQuery
        ) && (
          <div style={{ marginBottom: 12, display: 'flex', width: '100%' }}>
            <IntentRoutingPrompt
              question={transientClarifyMessage.clarifyQuestion}
              originalQuery={transientClarifyMessage.originalQuery}
              onCancel={onCancelClarify}
            />
          </div>
        )}

      {/* Active SSE Streaming Assistant Bubble */}
      {isStreaming && (streamingText || !pendingConfirmation) && (
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

      {/* Mutation Action Confirmation Card */}
      {pendingConfirmation && onConfirmAction && (
        <div
          data-testid="ai-mutation-confirmation"
          style={{
            margin: '8px 0 12px',
            padding: '12px 16px',
            backgroundColor: token.colorWarningBg,
            border: `1px solid ${token.colorWarningBorder}`,
            borderRadius: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontWeight: 600,
              color: token.colorWarningText,
              fontSize: 13,
            }}
          >
            <ExclamationCircleOutlined />
            <span>Xác nhận thực hiện hành động</span>
          </div>
          <div
            style={{
              fontSize: 13,
              color: token.colorText,
              lineHeight: 1.5,
              wordBreak: 'break-word',
            }}
          >
            {pendingConfirmation.summary}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 4,
              fontSize: 12,
              color: token.colorTextSecondary,
            }}
          >
            <span>Bấm nút bên dưới hoặc gõ &quot;yes&quot; / &quot;no&quot; để tiếp tục:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Button
                size="small"
                onClick={() => onConfirmAction(false)}
                aria-label="Từ chối thao tác"
              >
                Không (No)
              </Button>
              <Button
                size="small"
                type="primary"
                onClick={() => onConfirmAction(true)}
                aria-label="Xác nhận thao tác"
              >
                Có (Yes)
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Inline API Error Card */}
      {error && onRetry && (
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
