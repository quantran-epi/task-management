import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Tag, Typography, theme } from 'antd';
import { SyncOutlined, CheckCircleOutlined, StopOutlined } from '@ant-design/icons';
import type { ChatMessage } from '../../types/models';
import { formatToolLimitMessage, type ChatTurnStatus, type ChatTurnToolEvent } from './runtime/chatTurnRuntime';
import type { McpServerConfig } from '../../services/ai/mcpClient';
import { renderSafeMarkdown } from '../../utils/markdown';
import { ChatTabToolbox } from './ChatTabToolbox';
import { ChatMessageList } from './ChatMessageList';
import { ChatInputBar } from './ChatInputBar';
import { ArtifactEventCard, type ArtifactEvent } from './artifacts/ArtifactEventCard';
import { StagedLoadingIndicator, type StagedLoadingStage } from './widget/StagedLoadingIndicator';
import { MutationApprovalCard } from './widget/MutationApprovalCard';
import { ArtifactDiffApprovalCard } from './widget/ArtifactDiffApprovalCard';
import type { ChatTurnApprovalInfo } from './runtime/chatTurnRuntime';

export type AiChatScopeKind = 'chat' | 'sdlc';

export interface AiChatScope {
  kind: AiChatScopeKind;
  threadId: string;
  scopeKey: string;
  label: string;
}

export interface AiChatQuickPrompt {
  id: string;
  label: string;
  prompt: string;
}

export interface AiChatArtifactEvent extends ArtifactEvent {
  ctaLabel?: string;
}

/**
 * Mirrors `ChatTabToolboxProps` minus `compact` (the widget sets that) and minus
 * `onClearContext` (the widget forwards its single `onClearThread` instead, so a
 * host can never hand the widget two different clear behaviours).
 */
export interface AiChatToolboxProps {
  selectedModel: string;
  availableModels: string[];
  onModelChange: (model: string) => void;
  onRefreshModels?: (() => Promise<void> | void) | undefined;
  isRefreshingModels?: boolean | undefined;
  analysisMode: boolean;
  onToggleAnalysisMode: (tabId: string) => void;
  autoApproveMutations: boolean;
  onToggleAutoApproveMutations: (tabId: string) => void;
  mcpEnabled: boolean;
  onToggleMcpEnabled: (tabId: string) => void;
  mcpServers?: McpServerConfig[] | undefined;
  onToggleMcpServer?: ((id: string, enabled: boolean) => void) | undefined;
  onOpenMcpSettings?: (() => void) | undefined;
  onOpenOracleSettings?: (() => void) | undefined;
  oracleToolEnabled?: boolean | undefined;
  onOpenSshFsSettings?: (() => void) | undefined;
  sshFsToolEnabled?: boolean | undefined;
}

export interface AiChatTurnSnapshot {
  status: ChatTurnStatus;
  streamingText: string;
  streamingStatusLabel: string | null;
  pendingApproval: ChatTurnApprovalInfo | null;
  toolLimitRounds?: number | null;
}

export interface AiChatWidgetProps {
  scope: AiChatScope;
  messages: ChatMessage[];
  /** Snapshot computed by the host's turn runtime. The widget never owns one. */
  turn: AiChatTurnSnapshot;
  /** Fire-and-forget: the host owns the turn hook and the composed messages. */
  onSubmit: (text: string) => void;
  onStop: () => void;
  onResolveApproval: (approved: boolean) => void;
  artifactApprovalState?: { stale?: boolean; applying?: boolean; error?: string } | undefined;
  artifactDecision?: 'approved' | 'rejected' | undefined;
  toolEventExtensions?: Record<string, React.ReactNode> | undefined;
  onRetry: () => void;
  error: { code: string; message: string } | null;
  toolbox: AiChatToolboxProps;
  quickPrompts: AiChatQuickPrompt[];
  artifactEvents?: AiChatArtifactEvent[] | undefined;
  onArtifactOpen?: ((eventId: string, readOnly: boolean) => void) | undefined;
  onArtifactCta?: ((eventId: string) => void) | undefined;
  /** Thread-scoped clear only: never workflow state, drafts or other threads. */
  onClearThread: () => void;
  /** Optional "clear everything" affordance; hosts that own global history pass it. */
  onClearAllHistory?: (() => void) | undefined;
  onOpenSettings?: (() => void) | undefined;
  /** Host-business render slots. The widget never knows what they mean (D-25). */
  messageListExtensions?: Record<string, unknown> | undefined;
  transcriptExtensions?: React.ReactNode;
  statusExtensions?: React.ReactNode;
  headerSlot?: React.ReactNode;
  attachedFiles?: string[] | undefined;
  onAttachFile?: ((filePath: string) => void) | undefined;
  onRemoveFile?: ((filePath: string) => void) | undefined;
  autoFocus?: boolean | undefined;
  disabled?: boolean | undefined;
  emptyState: { heading: string; body: string };
  /** Tool badges published by the host runtime; details stay collapsed. */
  toolEvents?: ChatTurnToolEvent[] | undefined;
  compact?: boolean | undefined;
  placeholder?: string | undefined;
  externalValue?: string | undefined;
  onExternalValueConsumed?: (() => void) | undefined;
  draft: string;
  onDraftChange: (next: string) => void;
}

/**
 * Statuses that mean "the model is producing output". `awaiting-approval` is deliberately
 * excluded: D-22 makes the approval card the wait state, so no spinner/streaming bubble renders.
 */
const ACTIVE_STAGES = new Set<ChatTurnStatus>([
  'preparing',
  'tool',
  'streaming',
  'synthesizing',
]);

function stagedStageFor(status: ChatTurnStatus): StagedLoadingStage | null {
  switch (status) {
    case 'preparing':
      return 'preparing';
    case 'tool':
      return 'tool';
    case 'streaming':
      return 'streaming';
    case 'synthesizing':
      return 'synthesizing';
    // D-22: the approval card IS the wait state; a staged loader here would read as a spinner.
    default:
      return null;
  }
}

/**
 * One badge per tool call: the loop publishes `call` (with args) and then `result` (with output)
 * under the same id, so hosts may forward both without rendering two badges.
 */
function mergeToolEvents(events: ChatTurnToolEvent[]): ChatTurnToolEvent[] {
  const byId = new Map<string, ChatTurnToolEvent>();
  for (const event of events) {
    const previous = byId.get(event.id);
    byId.set(event.id, { ...previous, ...event });
  }
  return [...byId.values()];
}

const ARTIFACT_DETAIL_CAP = 2000;
const isArtifactToolName = (name: string) => name === 'get_artifact' || name === 'patch_artifact_section';

/** Collapsed-by-default tool badge. Raw arguments/output never auto-expand (D-04). */
const ToolEventBadge: React.FC<{ event: ChatTurnToolEvent; extension?: React.ReactNode }> = ({ event, extension }) => {
  const { token } = theme.useToken();
  const [expanded, setExpanded] = useState(false);
  const detailsId = `tool-event-${event.id.replace(/[^A-Za-z0-9_-]/g, '-')}`;

  return (
    <div style={{ marginBottom: 8 }} data-tool-call-id={event.id}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={() => setExpanded((prev) => !prev)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 8px',
          fontSize: 12,
          background: token.colorFillAlter,
          border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: 8,
          cursor: 'pointer',
          color: token.colorTextSecondary,
        }}
      >
        {event.phase === 'result' ? (
          <CheckCircleOutlined style={{ color: token.colorSuccess }} />
        ) : (
          <SyncOutlined spin style={{ color: token.colorPrimary }} />
        )}
        {`[Công cụ] ${event.name}`}
      </button>

      {expanded && (
        <div
          id={detailsId}
          className="chat-markdown-body"
          style={{
            marginTop: 4,
            padding: '8px 16px',
            fontSize: 12,
            lineHeight: 1.5,
            background: token.colorFillAlter,
            borderRadius: 8,
            wordBreak: 'break-word',
            maxHeight: 240,
            overflowY: 'auto',
          }}
        >
          {event.args && (
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Tham số
              </Typography.Text>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12 }}>{event.args}</pre>
            </div>
          )}
          <div
            dangerouslySetInnerHTML={{
              // T-27-08: an artifact read can be a whole document; the badge shows a bounded
              // preview while the model still receives the untouched tool result.
              __html: renderSafeMarkdown(
                isArtifactToolName(event.name) && (event.result ?? '').length > ARTIFACT_DETAIL_CAP
                  ? `${(event.result ?? '').slice(0, ARTIFACT_DETAIL_CAP)}\n\n… (đã rút gọn hiển thị, kết quả đầy đủ vẫn được gửi cho mô hình)`
                  : event.result ?? 'Chưa có kết quả công cụ.'
              ),
            }}
          />
        </div>
      )}
      {extension}
    </div>
  );
};

/**
 * The one chat surface both hosts render. Purely presentational: it never
 * constructs a runtime, never calls the orchestrator, never composes prompts.
 */
export const AiChatWidget: React.FC<AiChatWidgetProps> = ({
  scope,
  messages,
  turn,
  onSubmit,
  onStop,
  onResolveApproval,
  artifactApprovalState,
  artifactDecision,
  toolEventExtensions,
  onRetry,
  error,
  toolbox,
  quickPrompts,
  artifactEvents,
  onArtifactOpen,
  onArtifactCta,
  onClearThread,
  onClearAllHistory,
  onOpenSettings,
  messageListExtensions,
  transcriptExtensions,
  statusExtensions,
  headerSlot,
  attachedFiles,
  onAttachFile,
  onRemoveFile,
  autoFocus,
  disabled,
  emptyState,
  toolEvents,
  compact,
  placeholder,
  externalValue,
  onExternalValueConsumed,
  draft,
  onDraftChange,
}) => {
  const { token } = theme.useToken();
  const isTurnActive = ACTIVE_STAGES.has(turn.status);
  // D-03: derive compact from the space the host actually gives us, so narrow hosts
  // (drawer at 320px, a squeezed step panel) collapse instead of overflowing. An explicit
  // `compact` prop still wins — it lets a host state the answer without measuring.
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [measuredNarrow, setMeasuredNarrow] = useState(false);
  const [toolActivityExpanded, setToolActivityExpanded] = useState(false);
  const toolActivityId = `tool-activity-${scope.scopeKey.replace(/[^A-Za-z0-9]/g, '-')}`;
  const resolvedCompact = compact ?? measuredNarrow;

  useEffect(() => {
    const node = hostRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      // Below 680px the full control bar cannot fit without clipping model selector (UI-SPEC §1).
      setMeasuredNarrow(width > 0 && width < 680);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const stagedStage = stagedStageFor(turn.status);
  const awaitingApproval = turn.status === 'awaiting-approval';
  const showQuickPrompts = messages.length === 0 && !error && !isTurnActive && !awaitingApproval;
  const mergedToolEvents = useMemo(() => mergeToolEvents(toolEvents ?? []), [toolEvents]);
  // The in-flight tool name comes from the newest tool event; approval's own copy wins while parked.
  const activeToolName =
    turn.pendingApproval?.toolName ?? mergedToolEvents[mergedToolEvents.length - 1]?.name ?? null;

  return (
    <div
      ref={hostRef}
      data-testid="ai-chat-widget"
      data-scope-key={scope.scopeKey}
      data-compact={resolvedCompact ? 'true' : 'false'}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        background: token.colorBgContainer,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '8px 16px',
          fontWeight: 600,
          fontSize: 14,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <Typography.Text
          strong
          style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {scope.label}
        </Typography.Text>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {turn.status === 'tool-limit' && (
            <Tag color="default" icon={<StopOutlined />} style={{ margin: 0, fontSize: 12 }}>
              Đã dừng thu thập bằng chứng
            </Tag>
          )}
          {turn.pendingApproval && (
            <Tag color="warning" style={{ margin: 0, fontSize: 12 }}>
              Chờ phê duyệt
            </Tag>
          )}
          {isTurnActive && turn.streamingStatusLabel && !turn.pendingApproval && (
            <Tag color="processing" style={{ margin: 0, fontSize: 12 }}>
              {turn.streamingStatusLabel}
            </Tag>
          )}
          {toolbox.analysisMode && (
            <Tag color="purple" style={{ margin: 0, fontSize: 12 }}>
              Phân tích
            </Tag>
          )}
        </div>
      </div>

      <ChatTabToolbox
        activeTabId={scope.scopeKey}
        compact={resolvedCompact}
        selectedModel={toolbox.selectedModel}
        availableModels={toolbox.availableModels}
        onModelChange={toolbox.onModelChange}
        {...(toolbox.onRefreshModels ? { onRefreshModels: toolbox.onRefreshModels } : {})}
        {...(toolbox.isRefreshingModels !== undefined
          ? { isRefreshingModels: toolbox.isRefreshingModels }
          : {})}
        analysisMode={toolbox.analysisMode}
        onToggleAnalysisMode={toolbox.onToggleAnalysisMode}
        autoApproveMutations={toolbox.autoApproveMutations}
        onToggleAutoApproveMutations={toolbox.onToggleAutoApproveMutations}
        mcpEnabled={toolbox.mcpEnabled}
        onToggleMcpEnabled={toolbox.onToggleMcpEnabled}
        {...(toolbox.mcpServers ? { mcpServers: toolbox.mcpServers } : {})}
        {...(toolbox.onToggleMcpServer ? { onToggleMcpServer: toolbox.onToggleMcpServer } : {})}
        {...(toolbox.onOpenMcpSettings ? { onOpenMcpSettings: toolbox.onOpenMcpSettings } : {})}
        {...(toolbox.onOpenOracleSettings ? { onOpenOracleSettings: toolbox.onOpenOracleSettings } : {})}
        {...(toolbox.oracleToolEnabled !== undefined ? { oracleToolEnabled: toolbox.oracleToolEnabled } : {})}
        {...(toolbox.onOpenSshFsSettings ? { onOpenSshFsSettings: toolbox.onOpenSshFsSettings } : {})}
        {...(toolbox.sshFsToolEnabled !== undefined ? { sshFsToolEnabled: toolbox.sshFsToolEnabled } : {})}
        onClearContext={onClearThread}
      />

      {headerSlot}

      <ChatMessageList
        messages={messages}
        streamingText={turn.status === 'tool-limit' ? '' : turn.streamingText}
        isStreaming={isTurnActive}
        streamingStatus={turn.streamingStatusLabel}
        error={error?.message ?? null}
        onRetry={onRetry}
        {...(onOpenSettings ? { onOpenSettings } : {})}
        // MutationApprovalCard below is the sole approval renderer (T-25.3-27):
        // pendingConfirmation/onConfirmAction are deliberately not passed here.
        emptyState={emptyState}
        {...(messageListExtensions ?? {})}
      />

      {transcriptExtensions}

      {mergedToolEvents.length > 0 && (
        <div style={{ padding: '0 16px' }}>
          {mergedToolEvents.length > 1 ? (
            <>
              <button
                type="button"
                aria-expanded={toolActivityExpanded}
                aria-controls={toolActivityId}
                onClick={() => setToolActivityExpanded((prev) => !prev)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  minHeight: 32,
                  marginBottom: 4,
                  padding: '4px 8px',
                  fontSize: 12,
                  color: token.colorTextSecondary,
                  background: token.colorFillAlter,
                  border: `1px solid ${token.colorBorderSecondary}`,
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                <span>{mergedToolEvents.length} công cụ đã gọi</span>
                <span>{toolActivityExpanded ? 'Thu gọn' : 'Xem chi tiết'}</span>
              </button>
              <div
                id={toolActivityId}
                role="group"
                aria-label="Hoạt động công cụ"
                style={{ maxHeight: 160, overflowY: 'auto', overscrollBehavior: 'contain' }}
              >
                {(toolActivityExpanded ? mergedToolEvents : mergedToolEvents.slice(-1)).map((event) => (
                  <ToolEventBadge key={event.id} event={event} {...(toolEventExtensions?.[event.id] ? { extension: toolEventExtensions[event.id] } : {})} />
                ))}
              </div>
            </>
          ) : (
            mergedToolEvents.map((event) => (
              <ToolEventBadge key={event.id} event={event} {...(toolEventExtensions?.[event.id] ? { extension: toolEventExtensions[event.id] } : {})} />
            ))
          )}
        </div>
      )}

      {turn.status === 'tool-limit' && turn.toolLimitRounds != null && (
        <div style={{ padding: '0 16px' }}>
          <Alert
            type="warning"
            showIcon
            title={formatToolLimitMessage(turn.toolLimitRounds)}
            action={<Button size="small" onClick={onRetry}>Thử lại</Button>}
          />
        </div>
      )}

      {stagedStage && (
        <div style={{ padding: '0 16px' }}>
          <StagedLoadingIndicator
            stage={stagedStage}
            {...(activeToolName ? { toolName: activeToolName } : {})}
            toolPhase="call"
          />
        </div>
      )}

      {turn.pendingApproval && (
        <div style={{ padding: '0 16px' }}>
          {turn.pendingApproval.patch ? (
            <ArtifactDiffApprovalCard patch={turn.pendingApproval.patch} {...artifactApprovalState}
              {...(artifactDecision ? { decision: artifactDecision } : {})}
              onApprove={() => onResolveApproval(true)} onReject={() => onResolveApproval(false)} />
          ) : (
            <MutationApprovalCard
              toolName={turn.pendingApproval.toolName}
              summary={turn.pendingApproval.summary}
              onApprove={() => onResolveApproval(true)}
              onReject={() => onResolveApproval(false)}
            />
          )}
        </div>
      )}

      {artifactEvents && artifactEvents.length > 0 && (
        <div style={{ padding: '8px 16px 0' }}>
          {artifactEvents.map((event) => (
            <ArtifactEventCard
              key={event.id}
              event={event}
              onOpen={(eventId) => onArtifactOpen?.(eventId, event.readOnly === true)}
              {...(onArtifactCta ? { onCta: onArtifactCta } : {})}
            />
          ))}
        </div>
      )}

      {showQuickPrompts && quickPrompts.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            padding: '8px 16px',
            justifyContent: 'center',
          }}
        >
          {quickPrompts.map((prompt) => (
            <button
              key={prompt.id}
              type="button"
              onClick={() => onSubmit(prompt.prompt)}
              style={{
                padding: '4px 8px',
                fontSize: 12,
                color: token.colorPrimary,
                background: token.colorFillAlter,
                border: `1px solid ${token.colorPrimaryBorder}`,
                borderRadius: 16,
                cursor: 'pointer',
              }}
            >
              {prompt.label}
            </button>
          ))}
        </div>
      )}

      {statusExtensions}

      <ChatInputBar
        onSubmit={onSubmit}
        onClear={onClearThread}
        {...(onClearAllHistory ? { onClearAll: onClearAllHistory } : {})}
        onStop={onStop}
        isStreaming={isTurnActive}
        {...(placeholder !== undefined ? { placeholder } : {})}
        {...(autoFocus !== undefined ? { autoFocus } : {})}
        // Approval is answerable two ways: the card buttons, or typing yes/no (the placeholder
        // says so and `handleSendTurn` intercepts it). Disabling the composer here made the
        // typed path unreachable.
        disabled={disabled}
        {...(attachedFiles ? { attachedFiles } : {})}
        {...(onAttachFile ? { onAttachFile } : {})}
        {...(onRemoveFile ? { onRemoveFile } : {})}
        {...(externalValue !== undefined ? { externalValue } : {})}
        {...(onExternalValueConsumed ? { onExternalValueConsumed } : {})}
        value={draft}
        onValueChange={onDraftChange}
      />
    </div>
  );
};

export default AiChatWidget;
