import React, { useState } from 'react';
import { Tag, Typography, theme } from 'antd';
import { SyncOutlined, CheckCircleOutlined } from '@ant-design/icons';
import type { ChatMessage } from '../../types/models';
import type { ChatTurnStatus, ChatTurnToolEvent } from './runtime/chatTurnRuntime';
import type { McpServerConfig } from '../../services/ai/mcpClient';
import { renderSafeMarkdown } from '../../utils/markdown';
import { ChatTabToolbox } from './ChatTabToolbox';
import { ChatMessageList } from './ChatMessageList';
import { ChatInputBar } from './ChatInputBar';
import { ArtifactEventCard, type ArtifactEvent } from './artifacts/ArtifactEventCard';
import { StagedLoadingIndicator, type StagedLoadingStage } from './widget/StagedLoadingIndicator';
import { MutationApprovalCard } from './widget/MutationApprovalCard';

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
}

export interface AiChatTurnSnapshot {
  status: ChatTurnStatus;
  streamingText: string;
  streamingStatusLabel: string | null;
  pendingApproval: { toolName: string; summary: string } | null;
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
    case 'awaiting-approval':
      return 'awaiting-approval';
    default:
      return null;
  }
}

/** Collapsed-by-default tool badge. Raw arguments/output never auto-expand (D-04). */
const ToolEventBadge: React.FC<{ event: ChatTurnToolEvent }> = ({ event }) => {
  const { token } = theme.useToken();
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ marginBottom: 8 }}>
      <button
        type="button"
        aria-expanded={expanded}
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
          dangerouslySetInnerHTML={{
            __html: renderSafeMarkdown(event.result ?? 'Chưa có kết quả công cụ.'),
          }}
        />
      )}
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
  const stagedStage = stagedStageFor(turn.status);
  const showQuickPrompts = messages.length === 0 && !error && !isTurnActive;

  return (
    <div
      data-testid="ai-chat-widget"
      data-scope-key={scope.scopeKey}
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
        {...(compact !== undefined ? { compact } : {})}
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
        onClearContext={onClearThread}
      />

      {headerSlot}

      <ChatMessageList
        messages={messages}
        streamingText={turn.streamingText}
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

      {toolEvents && toolEvents.length > 0 && (
        <div style={{ padding: '0 16px' }}>
          {toolEvents.map((event) => (
            <ToolEventBadge key={event.id} event={event} />
          ))}
        </div>
      )}

      {stagedStage && (
        <div style={{ padding: '0 16px' }}>
          <StagedLoadingIndicator
            stage={stagedStage}
            {...(turn.pendingApproval?.toolName
              ? { toolName: turn.pendingApproval.toolName }
              : {})}
            toolPhase="call"
          />
        </div>
      )}

      {turn.pendingApproval && (
        <div style={{ padding: '0 16px' }}>
          <MutationApprovalCard
            toolName={turn.pendingApproval.toolName}
            summary={turn.pendingApproval.summary}
            onApprove={() => onResolveApproval(true)}
            onReject={() => onResolveApproval(false)}
          />
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
        isStreaming={isTurnActive && !turn.pendingApproval}
        {...(placeholder !== undefined ? { placeholder } : {})}
        {...(autoFocus !== undefined ? { autoFocus } : {})}
        {...(disabled !== undefined ? { disabled } : {})}
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
