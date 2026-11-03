import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, message, Modal, Space, theme } from 'antd';
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
  type SdlcArtifactKindForTurn,
} from '../../../services/ai/sdlcPromptComposer';
import { hasGroundingSource, type SdlcGroundingMarker, type SdlcGroundingResult } from '../../../services/sdlc/groundingBuilder';
import { formatGuardMessage, WORKFLOW_GUARD_MESSAGES, WORKFLOW_GUARD_STEP_NUMBER, type WorkflowGuardCode } from '../../../services/wizard/workflowGuards';
import { extractChatSummary, extractSolutionMarkdown } from '../../../utils/sdlcSolutionParser';
import type { SdlcStepId } from '../../../services/wizard/workflowSchemas';
import { useStepChatToolbox } from './useStepChatToolbox';

export type SdlcGroundingSource = SdlcGroundingResult;

const EMPTY_GROUNDING: SdlcGroundingSource = { text: '', present: new Set() };

export interface StepChatPanelProps {
  projectId: string;
  crId: string;
  stepId: SdlcStepId;
  /**
   * Builder result: `text` feeds the prompt, `present` is the real marker set the artifact
   * prerequisite gate trusts. A rendered string can never prove a source (CR-01).
   */
  stepGroundingContext?: SdlcGroundingSource | undefined;
  onNavigateToStep?: ((step: SdlcStepId) => void) | undefined;
  readOnly?: boolean | undefined;
  onSolutionExtracted?: ((solutionMarkdown: string) => void) | undefined;
  db?: TaskPlannerDatabase | undefined;
  /** D-16: a chat-produced artifact is a DRAFT for the editor. It never commits a version. */
  onArtifactDraft?: ((kind: SdlcArtifactKindForTurn, markdown: string) => void) | undefined;
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
  requestArtifact: (kind: SdlcArtifactKindForTurn) => void;
}

const ARTIFACT_ANALYSIS_PROMPT =
  'Hãy phân tích hồ sơ hiện tại và tạo SOLUTION.md hoàn chỉnh cho Change Request này.';

const ARTIFACT_PROMPTS: Record<SdlcArtifactKindForTurn, string> = {
  SOLUTION: ARTIFACT_ANALYSIS_PROMPT,
  PL03B: 'Hãy soạn PL03B đầy đủ theo bằng chứng triển khai trong Change Pack hiện tại.',
  PL07: 'Hãy soạn checklist PL07 đầy đủ với các câu hỏi review và để trống cột kết luận.',
  CAB: 'Hãy soạn tờ trình CAB đầy đủ theo PL03B, PL07 và bằng chứng triển khai hiện tại.',
};

export const STEP_ARTIFACT_ACTIONS: Partial<Record<SdlcStepId, readonly SdlcArtifactKindForTurn[]>> = {
  SOLUTION: ['SOLUTION'],
  TECH_DOCS: ['PL03B', 'PL07'],
  CAB: ['CAB'],
};

const ARTIFACT_LABELS: Record<SdlcArtifactKindForTurn, string> = {
  SOLUTION: 'Soạn SOLUTION bằng AI', PL03B: 'Soạn PL03B bằng AI',
  PL07: 'Soạn PL07 bằng AI', CAB: 'Soạn CAB bằng AI',
};

const ARTIFACT_PREREQUISITES: Partial<Record<SdlcStepId, readonly [SdlcGroundingMarker, WorkflowGuardCode][]>> = {
  SOLUTION: [['PL01', 'INTAKE_PL01_REQUIRED'], ['PL02', 'INTAKE_PL02_REQUIRED']],
  TECH_DOCS: [['SOLUTION', 'SOLUTION_AND_PACK_REQUIRED_FOR_TECH_DOCS'], ['CHANGE_PACK', 'SOLUTION_AND_PACK_REQUIRED_FOR_TECH_DOCS']],
  CAB: [['PL03B', 'ALL_DOCS_REQUIRED_FOR_CAB'], ['PL07', 'ALL_DOCS_REQUIRED_FOR_CAB']],
};

const normalizeArtifactText = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('vi-VN');
const artifactTerm = (term: string) => new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${term})(?=$|[^\\p{L}\\p{N}])`, 'u');

export function looksLikeArtifactRequest(text: string): boolean {
  const normalized = normalizeArtifactText(text);
  return artifactTerm('tao|soan|sinh|viet|cap\\s+nhat|sua').test(normalized)
    && artifactTerm('tai\\s+lieu|solution|pl03b|pl07|cab').test(normalized);
}

type ArtifactNotice =
  | { type: 'warning'; message: string; step?: SdlcStepId }
  | { type: 'info'; targets: readonly SdlcArtifactKindForTurn[] };

/**
 * Thin host adapter (D-25). Owns exactly one turn (`useChatTurn`) for one step scope,
 * composes every turn through the layered SDLC composer, and supplies every
 * `AiChatWidget` prop. It holds no chat loop of its own.
 */
export const StepChatPanel = React.forwardRef<StepChatPanelHandle, StepChatPanelProps>(({
  projectId,
  crId,
  stepId,
  stepGroundingContext = EMPTY_GROUNDING,
  onNavigateToStep,
  readOnly = false,
  onSolutionExtracted,
  onArtifactDraft,
  artifactEvents,
  onArtifactOpen,
  onArtifactCta,
  db = defaultDb,
}, ref) => {
  const { token } = theme.useToken();
  const scopeKey = `sdlc:${projectId}:${crId}:${stepId}`;
  const toolbox = useStepChatToolbox(db, stepId);
  const groundingText = stepGroundingContext.text;

  const [thread, setThread] = useState<{ scopeKey: string; id: string } | null>(null);
  const threadId = thread?.scopeKey === scopeKey ? thread.id : null;
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [toolEvents, setToolEvents] = useState<ChatTurnToolEvent[]>([]);
  const [artifactNotice, setArtifactNotice] = useState<ArtifactNotice | null>(null);
  const artifactActions = STEP_ARTIFACT_ACTIONS[stepId] ?? [];

  useEffect(() => { setArtifactNotice(null); }, [scopeKey, threadId, readOnly]);

  // Isolated thread for this step: sdlc:{projectId}:{crId}:{stepId}
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!projectId || !crId || !stepId) return;
      try {
        const thread = await getStepThread(projectId, crId, stepId, db);
        if (!cancelled) setThread({ scopeKey, id: thread.id });
      } catch {
        // A missing thread only disables sending; it must not break the step view.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, crId, stepId, scopeKey, db]);

  const messages = useLiveQuery(
    () => (threadId ? db.chatMessages.where('threadId').equals(threadId).sortBy('createdAt') : []),
    [threadId, db]
  );

  const [preludePending, setPreludePending] = useState(false);
  // Stop is reachable while the prelude paints 'preparing', but the runtime is still idle —
  // aborting it is a no-op. Each send takes a token; Stop or a newer send drops the panel's
  // token, and only the send still holding it may reach `turn.start()`.
  const preludeTokenRef = useRef<number>(0);
  const preludeSeqRef = useRef(0);
  const pendingArtifactRef = useRef<SdlcArtifactKindForTurn | null>(null);
  const pendingArtifactScopeRef = useRef<string | null>(null);

  useEffect(() => {
    setPreludePending(false);
    return () => {
      pendingArtifactRef.current = null;
      pendingArtifactScopeRef.current = null;
      preludeTokenRef.current = 0;
    };
  }, [scopeKey]);

  const turn = useChatTurn({
    scopeKey,
    deps: {
      ...createDefaultChatTurnDeps(db),
      onToolEvent: (event) => setToolEvents((prev) => [...prev, event]),
      onError: (info) => setError(info),
    },
  });

  /**
   * D-07/D-16: a chat-produced artifact is a draft for the editor, never a committed version.
   * SOLUTION keeps its `# SOLUTION` heading detector; PL03B/PL07/CAB keep the full body (their
   * output contract is the document itself) so the handoff never depends on a heading guess.
   */
  const extractArtifactDraft = useCallback(
    async (content: string, kind: SdlcArtifactKindForTurn) => {
      const solution = kind === 'SOLUTION';
      if (solution && !content.includes('# SOLUTION')) return;
      const markdown = solution
        ? extractSolutionMarkdown(content)
        : content.replace(/^ {0,3}(?:`{3,}|~{3,})[^\n]*$/gm, '').trim();
      if (!markdown) return;
      if (solution && onSolutionExtracted) onSolutionExtracted(markdown);
      else onArtifactDraft?.(kind, markdown);

      if (!threadId) return;
      const rows = await db.chatMessages.where('threadId').equals(threadId).sortBy('createdAt');
      const latest = rows[rows.length - 1];
      if (latest?.role === 'assistant' && latest.content === content) {
        // D-06: the artifact body lives in the editor, not in the transcript.
        await db.chatMessages.update(latest.id, {
          content: `${extractChatSummary(content)}\n\n*(Toàn bộ tài liệu đã được chuyển trực tiếp vào trình soạn thảo bên trái)*`,
        });
      }
    },
    [threadId, db, onSolutionExtracted, onArtifactDraft]
  );

  const submit = useCallback(
    async (rawText: string, artifact?: SdlcArtifactKindForTurn) => {
      const text = rawText.trim();
      if (!text || !threadId) return;
      // A prelude in flight owns the step: a second send would supersede a prompt already
      // assembled and about to start.
      if (preludeTokenRef.current !== 0 || turn.runtime?.isRunning() || turn.status === 'awaiting-approval') return;

      setDraft('');
      setError(null);
      setToolEvents([]);
      // D-19/SC5: paint the loading state before any await. Config, key and MCP discovery
      // can take a visible moment; the composer must never look dead in that window.
      const preludeToken = (preludeSeqRef.current += 1);
      preludeTokenRef.current = preludeToken;
      setPreludePending(true);

      try {
        const history = (messages ?? [])
          .filter((row) => !row.artifactEvent)
          .slice(-20)
          .map((row) => ({
            role: row.role === 'user' ? ('user' as const) : ('assistant' as const),
            content: row.content,
          }));
        const [config, apiKey, { tools, dynamicReadOnlyToolNames }] = await Promise.all([
          getNineRouterConfig(db),
          getNineRouterApiKey(db),
          toolbox.toolsForTurn(),
        ]);

        const composed = composeSdlcTurn({
          step: stepId,
          intent: artifact ? 'artifact' : 'qa',
          ...(artifact ? { artifact } : {}),
          grounding: groundingText,
          dynamicReadOnlyToolNames,
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

        // Cancelled (Stop) or superseded (a newer send) while staging: nothing may start.
        if (preludeTokenRef.current !== preludeToken) return;
        // The prelude is over and the runtime owns the turn from here.
        preludeTokenRef.current = 0;
        setPreludePending(false);
        const outcome = await turn.start({
          threadId,
          scopeKey,
          text,
          analysisMode: toolbox.analysisMode,
          autoApprove: toolbox.autoApproveMutations,
          model: toolbox.selectedModel || config.defaultModel,
          endpoint: config.endpoint,
          ...(config.contextWindowTokens !== undefined ? { contextWindowTokens: config.contextWindowTokens } : {}),
          apiKey: apiKey ?? '',
          systemMessages,
          history: composedHistory,
          tools,
        });

        if (outcome.phase === 'error') {
          if (outcome.error) setError(outcome.error);
          return;
        }
        if (outcome.phase === 'complete' && outcome.content) {
          await extractArtifactDraft(outcome.content, artifact ?? 'SOLUTION');
        }
      } catch {
        setDraft((current) => current || rawText);
      } finally {
        // Only the send that still owns the token may release; a stale one must not clear the
        // staged state of the turn that superseded it.
        if (preludeTokenRef.current === preludeToken) {
          preludeTokenRef.current = 0;
          setPreludePending(false);
        }
      }
    },
    [threadId, messages, db, stepId, crId, groundingText, turn, scopeKey, toolbox, extractArtifactDraft]
  );

  const launchArtifact = (kind: SdlcArtifactKindForTurn) => {
    if (readOnly || preludeTokenRef.current !== 0 || turn.runtime?.isRunning() || turn.status === 'awaiting-approval') return;
    setArtifactNotice(null);
    const targets = STEP_ARTIFACT_ACTIONS[stepId] ?? [];
    if (!targets.includes(kind)) {
      const step = (Object.keys(STEP_ARTIFACT_ACTIONS) as SdlcStepId[])
        .find((candidate) => STEP_ARTIFACT_ACTIONS[candidate]?.includes(kind));
      setArtifactNotice({
        type: 'warning',
        message: `Tài liệu ${kind} không thuộc bước này. Bạn có thể tạo: ${targets.join(' / ') || 'không có tài liệu tại bước này'}.`,
        ...(step ? { step } : {}),
      });
      return;
    }
    // Keep one explicit target until bootstrap completes; validate against latest grounding then.
    if (!threadId) {
      pendingArtifactRef.current = kind;
      pendingArtifactScopeRef.current = scopeKey;
      return;
    }
    const missing = ARTIFACT_PREREQUISITES[stepId]?.find(([marker]) => !hasGroundingSource(stepGroundingContext, marker));
    if (missing) {
      const code = missing[1];
      setArtifactNotice({ type: 'warning', message: formatGuardMessage(code), step: WORKFLOW_GUARD_MESSAGES[code].supplyingStep });
      return;
    }
    void submit(ARTIFACT_PROMPTS[kind], kind);
  };
  const launchArtifactRef = useRef(launchArtifact);
  launchArtifactRef.current = launchArtifact;

  useEffect(() => {
    if (!threadId || !pendingArtifactRef.current || pendingArtifactScopeRef.current !== scopeKey) return;
    const kind = pendingArtifactRef.current;
    pendingArtifactRef.current = null;
    pendingArtifactScopeRef.current = null;
    launchArtifactRef.current(kind);
  }, [threadId, scopeKey]);

  const sendMessage = async (text: string) => {
    // A clarify prompt needs somewhere to go: without targets (no artifact action at this
    // step) or in read-only history view it would dead-end, so the turn stays ordinary Q&A.
    if (!readOnly && artifactActions.length > 0 && looksLikeArtifactRequest(text)) {
      const exact = artifactActions.filter((kind) => artifactTerm(kind.toLowerCase()).test(normalizeArtifactText(text)));
      setArtifactNotice({ type: 'info', targets: exact.length ? exact : artifactActions });
      return;
    }
    await submit(text);
  };

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
        preludeTokenRef.current = 0;
        pendingArtifactRef.current = null;
        pendingArtifactScopeRef.current = null;
        setPreludePending(false);
        setArtifactNotice(null);
        turn.abort();
        try {
          await turn.runtime?.drainPersistence();
          await clearThreadMessages(threadId, db);
          message.success('Đã xóa hội thoại của bước này');
        } catch {
          message.error('Không thể xóa hội thoại');
        }
      },
    });
  }, [threadId, db, turn.abort, turn.runtime]);

  React.useImperativeHandle(ref, () => ({
    sendMessage,
    requestArtifactAnalysis: () => launchArtifact('SOLUTION'),
    requestArtifact: launchArtifact,
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
          toolLimitRounds: turn.runtime?.getToolLimitRounds?.() ?? null,
        }}
        onSubmit={(text) => {
          void sendMessage(text);
        }}
        onStop={() => {
          // A stop during the prelude cancels the staged turn; otherwise it aborts the runtime.
          // Release the staged UI now — the awaited prelude may still be running.
          if (preludePending) {
            preludeTokenRef.current = 0;
            setPreludePending(false);
          }
          turn.abort();
        }}
        onResolveApproval={turn.resolveApproval}
        onRetry={() => {
          void turn.retry();
        }}
        statusExtensions={!readOnly && (artifactNotice || artifactActions.length > 0) ? (
          <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {artifactNotice && (
              <Alert
                type={artifactNotice.type}
                showIcon
                closable={{ onClose: () => setArtifactNotice(null) }}
                title={artifactNotice.type === 'warning' ? artifactNotice.message :
                  `Yêu cầu này cần tạo hoặc sửa tài liệu nhưng chưa rõ loại. Chọn tài liệu bạn muốn: ${artifactNotice.targets.join(' / ')}.`}
                action={artifactNotice.type === 'warning' ? (
                  artifactNotice.step && onNavigateToStep ? (
                    <Button size="small" style={{ minHeight: 32, fontSize: 12 }} onClick={() => onNavigateToStep(artifactNotice.step!)}>
                      Chuyển đến Bước {WORKFLOW_GUARD_STEP_NUMBER[artifactNotice.step]}: {STEP_LABELS[artifactNotice.step].replace(/^\d+\.\s*/, '')}
                    </Button>
                  ) : null
                ) : (
                  <Space size={8} wrap>
                    {artifactNotice.targets.map((kind) => (
                      <Button key={kind} size="small" style={{ minHeight: 32, fontSize: 12 }} disabled={preludePending || turn.runtime?.isRunning() || turn.status === 'awaiting-approval'} onClick={() => launchArtifact(kind)}>
                        {ARTIFACT_LABELS[kind]}
                      </Button>
                    ))}
                  </Space>
                )}
              />
            )}
            <Space size={8} wrap aria-label="Soạn tài liệu bằng AI">
              {artifactActions.map((kind) => (
                <Button key={kind} size="small" style={{ minHeight: 32, fontSize: 12 }} disabled={preludePending || turn.runtime?.isRunning() || turn.status === 'awaiting-approval'} onClick={() => launchArtifact(kind)}>
                  {ARTIFACT_LABELS[kind]}
                </Button>
              ))}
            </Space>
          </div>
        ) : undefined}
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
