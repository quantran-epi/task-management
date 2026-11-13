import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Divider, Button, Modal, Tooltip, theme } from 'antd';
import { SyncOutlined, ExclamationCircleOutlined, ExpandAltOutlined } from '@ant-design/icons';
import type { ChatMessage } from '../../types/models';
import { APP_NAME } from '../../constants/app';
import { renderSafeMarkdown } from '../../utils/markdown';
import { ChatMessageBubble, type GroundedAnswerCardCallbacks } from './ChatMessageBubble';
import type { AgentAttributionAgent } from './office/AgentAttributionRow';
import type { AgentRunStatus } from '../../types/aiOffice';
import type { MessageSeenEntry } from '../../types/teamChat';
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
  /** Host-supplied empty state. Falls back to the app default when omitted. */
  emptyState?: { heading: string; body: string } | undefined;
  /** Phase 34 D-07: agent identity lookup for attributed messages. */
  agentDirectory?: Map<string, AgentAttributionAgent> | undefined;
  agentStatuses?: Map<string, AgentRunStatus> | undefined;
  onStopAgent?: ((agentId: string) => void) | undefined;
  /** 37-08 D-13: retry one assignment attempt, read from the persisted message row. */
  onRetryAgent?: ((assignmentId: string) => void) | undefined;
  /** 37.1 rework: read receipts, keyed by message id. Absent = nobody has read it. */
  seenStates?: Map<string, MessageSeenEntry[]> | undefined;
  /** 37.1 R13: the first message the user has not read — a "Tin mới" divider sits above it. */
  firstUnreadMessageId?: string | undefined;
  /** Initial saved read position; null means no message has been read. */
  lastReadMessageId?: string | null | undefined;
  readPositionReady?: boolean | undefined;
  onMessageRead?: ((messageId: string) => void) | undefined;
  /**
   * 37.1 R11/R13: whether the viewport is pinned to the newest message. Reading happens at
   * the bottom, so the host advances the user's cursor only while this is true.
   */
  onAtBottomChange?: ((atBottom: boolean) => void) | undefined;
  /** 37.1: recipients per message id, read from the log's `to[]`. */
  addressedTo?: Map<string, Array<{ id: string; name: string }>> | undefined;
}

// The composer draft lives above this list, so without a memo every keystroke re-rendered
// every row. Its props are identity-stable at both call sites.
export const ChatMessageList: React.FC<ChatMessageListProps> = React.memo(({
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
  emptyState,
  agentDirectory,
  agentStatuses,
  onStopAgent,
  onRetryAgent,
  seenStates,
  firstUnreadMessageId,
  lastReadMessageId,
  readPositionReady = true,
  onMessageRead,
  onAtBottomChange,
  addressedTo,
}) => {
  const { token } = theme.useToken();
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPopoutOpen, setIsPopoutOpen] = useState(false);

  const renderedSummaryHtml = useMemo(() => {
    return pendingConfirmation?.summary ? renderSafeMarkdown(pendingConfirmation.summary) : '';
  }, [pendingConfirmation?.summary]);

  /**
   * 37.1 R11/R13: only a scroll the USER performed counts as reading. The transcript
   * auto-scrolls on every new message, and treating that as "read" made the unread badge
   * flash and vanish the instant a hidden tab was focused again.
   */
  const programmaticScrollRef = useRef(false);
  const userScrollRef = useRef(false);
  const followingRef = useRef(onMessageRead === undefined && onAtBottomChange === undefined);
  const initiallyPositionedRef = useRef(false);
  const lastReadRef = useRef<HTMLDivElement>(null);

  const reportAtBottom = () => {
    const node = containerRef.current;
    if (!node || programmaticScrollRef.current) return;
    const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
    followingRef.current = atBottom;
    if (userScrollRef.current && document.hasFocus()) onAtBottomChange?.(atBottom);
  };

  const scrollToBottom = (instant = false) => {
    programmaticScrollRef.current = true;
    requestAnimationFrame(() => {
      programmaticScrollRef.current = false;
    });
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

  // Restore saved reading position once, without consuming unread messages.
  useEffect(() => {
    if (!readPositionReady) return;
    if (!initiallyPositionedRef.current && messages.length > 0) {
      if (lastReadMessageId && !lastReadRef.current) return;
      initiallyPositionedRef.current = true;
      followingRef.current = !firstUnreadMessageId && lastReadMessageId !== null;
      if (lastReadMessageId && firstUnreadMessageId) {
        programmaticScrollRef.current = true;
        lastReadRef.current?.scrollIntoView?.({ block: 'start', behavior: 'auto' });
        requestAnimationFrame(() => { programmaticScrollRef.current = false; });
      } else if (lastReadMessageId !== null) {
        scrollToBottom(true);
      }
      return;
    }
    if (!firstUnreadMessageId && followingRef.current) scrollToBottom(false);
  }, [messages.length, firstUnreadMessageId, lastReadMessageId, readPositionReady, pendingConfirmation, transientClarifyMessage]);

  useEffect(() => {
    const unpin = () => {
      followingRef.current = false;
      userScrollRef.current = false;
    };
    window.addEventListener('blur', unpin);
    return () => window.removeEventListener('blur', unpin);
  }, []);

  // Keep pinned to bottom during streaming or errors
  useEffect(() => {
    if (!firstUnreadMessageId && followingRef.current &&
      (isStreaming || streamingText || error || pendingConfirmation || transientClarifyMessage)) {
      scrollToBottom(true);
    }
  }, [streamingText, isStreaming, error, pendingConfirmation, transientClarifyMessage, firstUnreadMessageId]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root || !onMessageRead || !readPositionReady || typeof IntersectionObserver === 'undefined') return;
    const visible = new Set<Element>();
    const reportVisible = () => {
      if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
      const lastVisible = Array.from(root.querySelectorAll<HTMLElement>('[data-chat-message-id]'))
        .findLast((row) => visible.has(row));
      if (lastVisible) onMessageRead(lastVisible.dataset.chatMessageId!);
    };
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRect.height > 0) visible.add(entry.target);
        else visible.delete(entry.target);
      }
      reportVisible();
    }, { root, threshold: 0 });
    root.querySelectorAll('[data-chat-message-id]').forEach((row) => observer.observe(row));
    window.addEventListener('focus', reportVisible);
    document.addEventListener('visibilitychange', reportVisible);
    return () => {
      observer.disconnect();
      window.removeEventListener('focus', reportVisible);
      document.removeEventListener('visibilitychange', reportVisible);
    };
  }, [messages, onMessageRead, readPositionReady]);

  return (
    <div
      ref={containerRef}
      onScroll={reportAtBottom}
      onWheel={() => { userScrollRef.current = true; }}
      onPointerDown={() => { userScrollRef.current = true; }}
      onTouchStart={() => { userScrollRef.current = true; }}
      tabIndex={0}
      onKeyDown={(event) => {
        if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'End', 'Home', ' '].includes(event.key)) {
          userScrollRef.current = true;
        }
      }}
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
            {emptyState?.heading ?? `Trợ lý AI ${APP_NAME}`}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 360, margin: '0 auto' }}>
            {emptyState?.body ??
              'Đặt câu hỏi về tác vụ hiện tại, phân tích tiến độ, gợi ý checklist hoặc tra cứu tài liệu đính kèm. Nhập câu hỏi bên dưới để bắt đầu.'}
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

        // Pass message with grounding intact for structured rendering.
        // CR-06: a steer row deliberately carries NO `agentId` (D-15 — it must render as a
        // user row), so its caption's target must be resolved from `targetAgentId` here.
        // Without this the label fell back to a raw UUID in production (IN-08d).
        const agent = msg.agentId
          ? agentDirectory?.get(msg.agentId)
          : msg.targetAgentId
            ? agentDirectory?.get(msg.targetAgentId)
            : undefined;
        const agentStatus = msg.agentId ? agentStatuses?.get(msg.agentId) : undefined;
        // 37.1 R14: resolve the quoted row from the same list being rendered. A message whose
        // parent is outside the window still shows what it answers — the text is on the row.
        const quoted = msg.replyToId
          ? messages.find((row) => row.id === msg.replyToId)
          : undefined;
        return (
          <div key={msg.id} data-chat-message-id={msg.id} style={{ flexShrink: 0 }}>
            {msg.id === lastReadMessageId && <div ref={lastReadRef} data-testid="team-last-read-anchor" />}
            {msg.id === firstUnreadMessageId && (
              <div>
                <Divider
                  data-testid="team-new-divider"
                  style={{ margin: '8px 0', fontSize: 12, color: token.colorError }}
                >
                  Tin mới
                </Divider>
              </div>
            )}
            <ChatMessageBubble
              message={msg}
              canAddToChecklist={canAddToChecklist}
              canSaveStickyNote={canSaveStickyNote}
              canRunClaudeCode={canRunClaudeCode}
              onAddToChecklist={onAddToChecklist}
              onSaveStickyNote={onSaveStickyNote}
              onRunClaudeCode={onRunClaudeCode}
              groundedCallbacks={groundedCallbacks}
              agent={agent}
              agentStatus={agentStatus}
              onStopAgent={
                msg.agentId && onStopAgent ? () => onStopAgent(msg.agentId!) : undefined
              }
              {...(onRetryAgent ? { onRetryAgent } : {})}
              seenBy={seenStates?.get(msg.id)}
              {...(addressedTo?.get(msg.id) !== undefined
                ? { addressedTo: addressedTo.get(msg.id) }
                : {})}
              {...(quoted
                ? {
                    replyTo: {
                      id: quoted.id,
                      authorName:
                        quoted.agentName ?? (quoted.role === 'user' ? 'Bạn' : 'Trợ lý'),
                      content: quoted.content,
                    },
                  }
                : {})}
            />
          </div>
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
});
