import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Divider, Button, Modal, Tooltip, theme } from 'antd';
import { SyncOutlined, ExclamationCircleOutlined, ExpandAltOutlined } from '@ant-design/icons';
import type { ChatMessage } from '../../types/models';
import { APP_NAME } from '../../constants/app';
import { renderSafeMarkdown } from '../../utils/markdown';
import { ChatMessageBubble, type GroundedAnswerCardCallbacks, type WizardMessageCallbacks } from './ChatMessageBubble';
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
  wizardCallbacks?: WizardMessageCallbacks | undefined;
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
  wizardCallbacks,
  transientClarifyMessage,
  onCancelClarify,
}) => {
  const { token } = theme.useToken();
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPopoutOpen, setIsPopoutOpen] = useState(false);

  const renderedSummaryHtml = useMemo(() => {
    return pendingConfirmation?.summary ? renderSafeMarkdown(pendingConfirmation.summary) : '';
  }, [pendingConfirmation?.summary]);

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
              wizardCallbacks={wizardCallbacks}
            />
          </React.Fragment>
        );
      })}

      {/* Clarify state is owned by the tab that produced it, so it renders once, after the transcript. */}
      {transientClarifyMessage && (
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
              justifyContent: 'space-between',
              fontWeight: 600,
              color: token.colorWarningText,
              fontSize: 13,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ExclamationCircleOutlined />
              <span>Xác nhận thực hiện hành động</span>
            </div>
            <Tooltip title="Mở rộng xem chi tiết" placement="top">
              <Button
                type="text"
                size="small"
                icon={<ExpandAltOutlined />}
                onClick={() => setIsPopoutOpen(true)}
                aria-label="Mở rộng chi tiết xác nhận"
                style={{ color: token.colorWarningText, padding: '0 4px', height: 22 }}
              />
            </Tooltip>
          </div>
          <div
            className="chat-markdown-body"
            style={{
              fontSize: 13,
              color: token.colorText,
              lineHeight: 1.5,
              wordBreak: 'break-word',
              maxHeight: 260,
              overflowY: 'auto',
            }}
            dangerouslySetInnerHTML={{ __html: renderedSummaryHtml }}
          />
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

          <Modal
            open={isPopoutOpen}
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: token.colorWarningText }}>
                <ExclamationCircleOutlined />
                <span>Xác nhận thực hiện hành động</span>
              </div>
            }
            onCancel={() => setIsPopoutOpen(false)}
            footer={[
              <Button
                key="cancel"
                onClick={() => {
                  setIsPopoutOpen(false);
                  onConfirmAction(false);
                }}
                aria-label="Từ chối thao tác"
              >
                Không (No)
              </Button>,
              <Button
                key="confirm"
                type="primary"
                onClick={() => {
                  setIsPopoutOpen(false);
                  onConfirmAction(true);
                }}
                aria-label="Xác nhận thao tác"
              >
                Có (Yes)
              </Button>,
            ]}
            width={720}
            destroyOnClose
          >
            <div
              className="chat-markdown-body"
              style={{
                maxHeight: '65vh',
                overflowY: 'auto',
                padding: '12px 4px',
                fontSize: 14,
                lineHeight: 1.6,
                color: token.colorText,
              }}
              dangerouslySetInnerHTML={{ __html: renderedSummaryHtml }}
            />
          </Modal>
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
