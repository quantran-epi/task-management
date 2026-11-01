import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { message, Modal, theme } from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../../db';
import { clearThreadMessages } from '../../../db/repositories/chatRepo';
import { getStepThread } from '../../../services/wizard/sdlcCrManager';
import { getNineRouterApiKey, getNineRouterConfig } from '../../../services/ai/nineRouterTokenService';
import { useChatTurn } from '../../ai/runtime/useChatTurn';
import { createDefaultChatTurnDeps, type ChatTurnToolEvent } from '../../ai/runtime/chatTurnRuntime';
import { AiChatWidget, type AiChatArtifactEvent, type AiChatQuickPrompt } from '../../ai/AiChatWidget';
import {
  composeSdlcTurn,
  STEP_LABELS,
  STEP_QUICK_PROMPTS,
  type SdlcTurnIntent,
} from '../../../services/ai/sdlcPromptComposer';
import { extractChatSummary, extractSolutionMarkdown } from '../../../utils/sdlcSolutionParser';
import type { SdlcStepId } from '../../../services/wizard/workflowSchemas';
import { useStepChatToolbox } from './useStepChatToolbox';

export interface StepChatPanelProps {
  projectId: string;
  crId: string;
  stepId: SdlcStepId;
  stepGroundingContext?: string | undefined;
  onSolutionExtracted?: ((solutionMarkdown: string) => void) | undefined;
  db?: TaskPlannerDatabase | undefined;
  /** D-16: a chat-produced artifact is a DRAFT for the editor. It never commits a version. */
  onArtifactDraft?: ((kind: 'SOLUTION', markdown: string) => void) | undefined;
  /** Durable artifact cards already persisted in this step's thread. */
  artifactEvents?: AiChatArtifactEvent[] | undefined;
  onArtifactOpen?: ((eventId: string, readOnly: boolean) => void) | undefined;
  onArtifactCta?: ((eventId: string) => void) | undefined;
}

export interface StepChatPanelHandle {
  /** Submits a Q&A turn for the current step. */
  sendMessage: (text: string) => Promise<void>;
  /** Submits an explicit artifact-intent turn (D-16) — the editor's "analyse again" path. */
  requestArtifactAnalysis: () => void;
}

const ARTIFACT_ANALYSIS_PROMPT =
  'Hãy phân tích hồ sơ hiện tại và tạo SOLUTION.md hoàn chỉnh cho Change Request này.';

/**
 * Thin host adapter (D-25). Owns exactly one turn (`useChatTurn`) for one step scope,
 * composes every turn through the layered SDLC composer, and supplies every
 * `AiChatWidget` prop. It holds no chat loop of its own.
 */
export const StepChatPanel = React.forwardRef<StepChatPanelHandle, StepChatPanelProps>(({
  projectId,
  crId,
  stepId,
  stepGroundingContext = '',
  onSolutionExtracted,
  onArtifactDraft,
  artifactEvents,
  onArtifactOpen,
  onArtifactCta,
  db = defaultDb,
}, ref) => {
  const { token } = theme.useToken();
  const scopeKey = `sdlc:${projectId}:${crId}:${stepId}`;
  const toolbox = useStepChatToolbox(db);

  const [threadId, setThreadId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [toolEvents, setToolEvents] = useState<ChatTurnToolEvent[]>([]);

  // Isolated thread for this step: sdlc:{projectId}:{crId}:{stepId}
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!projectId || !crId || !stepId) return;
      try {
        const thread = await getStepThread(projectId, crId, stepId, db);
        if (!cancelled) setThreadId(thread.id);
      } catch {
        // A missing thread only disables sending; it must not break the step view.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, crId, stepId, db]);

  const messages = useLiveQuery(
    () => (threadId ? db.chatMessages.where('threadId').equals(threadId).sortBy('createdAt') : []),
    [threadId, db]
  );

  const [preludePending, setPreludePending] = useState(false);
  // Stop is reachable while the prelude paints 'preparing', but the runtime is still idle —
  // aborting it is a no-op. Record the cancel so the staged turn never starts.
  const preludeAbortRef = useRef(false);

  const turn = useChatTurn({
    scopeKey,
    deps: {
      ...createDefaultChatTurnDeps(db),
      onToolEvent: (event) => setToolEvents((prev) => [...prev, event]),
      onError: (info) => setError(info),
    },
  });

  /** D-07: an extracted SOLUTION is a draft for the editor, never a committed version. */
  const extractSolutionDraft = useCallback(
    async (content: string) => {
      if (stepId !== 'SOLUTION' || !content.includes('# SOLUTION')) return;
      const solutionMarkdown = extractSolutionMarkdown(content);
      if (!solutionMarkdown) return;
      if (onSolutionExtracted) onSolutionExtracted(solutionMarkdown);
      else onArtifactDraft?.('SOLUTION', solutionMarkdown);

      if (!threadId) return;
      const rows = await db.chatMessages.where('threadId').equals(threadId).sortBy('createdAt');
      const latest = rows[rows.length - 1];
      if (latest?.role === 'assistant' && latest.content === content) {
        // D-06: the artifact body lives in the editor, not in the transcript.
        await db.chatMessages.update(latest.id, {
          content: `${extractChatSummary(content)}\n\n*(Toàn bộ tài liệu kiến trúc đã được cập nhật trực tiếp vào trình soạn thảo bên trái)*`,
        });
      }
    },
    [stepId, threadId, db, onSolutionExtracted, onArtifactDraft]
  );

  const submit = useCallback(
    async (rawText: string, intent: SdlcTurnIntent) => {
      const text = rawText.trim();
      if (!text || !threadId) return;

      setDraft('');
      setError(null);
      setToolEvents([]);
      // D-19/SC5: paint the loading state before any await. Config, key and MCP discovery
      // can take a visible moment; the composer must never look dead in that window.
      preludeAbortRef.current = false;
      setPreludePending(true);

      try {
        const history = (messages ?? [])
          .filter((row) => !row.artifactEvent)
          .slice(-20)
          .map((row) => ({
            role: row.role === 'user' ? ('user' as const) : ('assistant' as const),
            content: row.content,
          }));
        const [config, apiKey, tools] = await Promise.all([
          getNineRouterConfig(db),
          getNineRouterApiKey(db),
          toolbox.toolsForTurn(),
        ]);

        const composed = composeSdlcTurn({
          step: stepId,
          intent,
          ...(intent === 'artifact' ? { artifact: 'SOLUTION' as const } : {}),
          grounding: stepGroundingContext,
          metadata: { cr: crId },
          history,
          userTurn: text,
        });
        const systemMessages = composed.messages
          .filter((msg): msg is { role: 'system'; content: string } => msg.role === 'system')
          .map((msg) => ({ role: 'system' as const, content: msg.content }));
        // The composer appends the user turn last; the runtime adds it back from `text`.
        const composedHistory = composed.messages
          .filter((msg): msg is { role: 'user' | 'assistant'; content: string } => msg.role !== 'system')
          .slice(0, -1)
          .map((msg) => ({ role: msg.role, content: msg.content }));

        setPreludePending(false);
        // Cancelled while staging: the runtime never started, so nothing may be committed.
        if (preludeAbortRef.current) return;
        const outcome = await turn.start({
          threadId,
          scopeKey,
          text,
          analysisMode: toolbox.analysisMode,
          autoApprove: toolbox.autoApproveMutations,
          model: toolbox.selectedModel || config.defaultModel,
          endpoint: config.endpoint,
          apiKey: apiKey ?? '',
          systemMessages,
          history: composedHistory,
          tools,
        });

        if (outcome.phase === 'complete' && outcome.content) {
          await extractSolutionDraft(outcome.content);
        }
      } catch {
        // TURN_IN_PROGRESS or a composition failure: the widget's own status already shows it.
      } finally {
        setPreludePending(false);
      }
    },
    [threadId, messages, db, stepId, crId, stepGroundingContext, turn, scopeKey, toolbox, extractSolutionDraft]
  );

  const handleClearThread = useCallback(() => {
    if (!threadId) return;
    // D-05: clear is thread-scoped — never workflow state, drafts or other step threads.
    // Confirmation is part of the shared clear contract, so both hosts ask before deleting.
    Modal.confirm({
      title: 'Xóa tin nhắn cuộc trò chuyện này?',
      content: 'Toàn bộ nội dung trao đổi trong bước này sẽ bị xóa khỏi lịch sử.',
      okText: 'Xóa tin nhắn',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: async () => {
        try {
          await clearThreadMessages(threadId, db);
          message.success('Đã xóa hội thoại của bước này');
        } catch {
          message.error('Không thể xóa hội thoại');
        }
      },
    });
  }, [threadId, db]);

  React.useImperativeHandle(ref, () => ({
    sendMessage: (text: string) => submit(text, 'qa'),
    requestArtifactAnalysis: () => {
      void submit(ARTIFACT_ANALYSIS_PROMPT, 'artifact');
    },
  }));

  const quickPrompts = useMemo<AiChatQuickPrompt[]>(
    () =>
      STEP_QUICK_PROMPTS[stepId].map((prompt, index) => ({
        id: `${stepId}-${index}`,
        label: prompt,
        prompt,
      })),
    [stepId]
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: token.colorBgContainer,
        borderLeft: `1px solid ${token.colorBorderSecondary}`,
      }}
    >
      <AiChatWidget
        scope={{
          kind: 'sdlc',
          threadId: threadId ?? '',
          scopeKey,
          label: `SDLC — ${STEP_LABELS[stepId]}`,
        }}
        messages={messages ?? []}
        turn={{
          status: preludePending && turn.status === 'idle' ? 'preparing' : turn.status,
          streamingText: turn.streamingText,
          streamingStatusLabel: turn.streamingStatusLabel,
          pendingApproval: turn.pendingApproval,
        }}
        onSubmit={(text) => {
          void submit(text, 'qa');
        }}
        onStop={() => {
          // A stop during the prelude cancels the staged turn; otherwise it aborts the runtime.
          // Release the staged UI now — the awaited prelude may still be running.
          if (preludePending) {
            preludeAbortRef.current = true;
            setPreludePending(false);
          }
          turn.abort();
        }}
        onResolveApproval={turn.resolveApproval}
        onRetry={() => {
          void turn.retry();
        }}
        error={error}
        toolbox={toolbox}
        quickPrompts={quickPrompts}
        {...(artifactEvents ? { artifactEvents } : {})}
        {...(onArtifactOpen ? { onArtifactOpen } : {})}
        {...(onArtifactCta ? { onArtifactCta } : {})}
        onClearThread={handleClearThread}
        emptyState={{
          heading: `Trợ lý SDLC — ${STEP_LABELS[stepId]}`,
          body: 'Chọn gợi ý bên dưới hoặc đặt câu hỏi để hoàn thiện hồ sơ cho bước này.',
        }}
        toolEvents={toolEvents}
        // D-03: the SDLC panel is a fixed 380px lane, so name it explicitly. Hosts with a
        // variable width (the drawer) omit this and let the widget measure its host.
        compact
        placeholder={`Hỏi AI trợ giúp bước này (${stepId})...`}
        draft={draft}
        onDraftChange={setDraft}
      />
    </div>
  );
});

StepChatPanel.displayName = 'StepChatPanel';
