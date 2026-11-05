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
import type { ChatMessage } from '../../../types/models';
import { normalizeToolName } from '../../../services/ai/aiTools';
import { readArtifactSnapshot, type ArtifactPatchProposal, type ArtifactToolContext } from '../../../services/ai/sdlcArtifactTools';

export const ARTIFACT_PATCH_DECISION_PREFIX = 'ARTIFACT_PATCH_DECISION ';
const DECISION_COPY = {
  approved: 'Đã chấp thuận — bản nháp bước này đã được cập nhật.',
  rejected: 'Đã từ chối đề xuất — tài liệu không thay đổi.',
};

type PatchRecord = { patch: ArtifactPatchProposal; scopeKey: string; callId?: string;
  decisionRow: ChatMessage; decision?: 'approved' | 'rejected' };
type RefusalRecord = { callId: string; scopeKey: string; message: string; step?: SdlcStepId };

function parseDecision(row: ChatMessage): { proposalId: string; decision: 'approved' | 'rejected' } | undefined {
  if (row.role !== 'system' || !row.content.startsWith(ARTIFACT_PATCH_DECISION_PREFIX)) return undefined;
  try {
    const metadata: unknown = JSON.parse(row.content.slice(ARTIFACT_PATCH_DECISION_PREFIX.length).split('\n')[0]!);
    if (metadata && typeof metadata === 'object' && 'proposalId' in metadata && typeof metadata.proposalId === 'string' &&
      'decision' in metadata && (metadata.decision === 'approved' || metadata.decision === 'rejected')) {
      return { proposalId: metadata.proposalId, decision: metadata.decision };
    }
  } catch { /* A malformed internal marker never becomes assistant content or model instructions. */ }
  return undefined;
}

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
  artifactToolContext?: ArtifactToolContext | undefined;
  onApplyArtifactPatch?: ((proposal: ArtifactPatchProposal, decision: ChatMessage) => Promise<void>) | undefined;
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

/** Explicit full-document generation verbs; these keep the complete-artifact output contract. */
const GENERATION_VERB = artifactTerm('tao|soan|sinh|viet');
/** Bounded section-edit verbs; these route to get_artifact + patch_artifact_section. */
const PATCH_VERB = artifactTerm('them|bo\\s+sung|chen|sua|cap\\s+nhat|add|append|insert|edit|replace|update');
const ARTIFACT_TERM = artifactTerm('tai\\s+lieu|solution|pl03b|pl07|cab');

export function looksLikeArtifactRequest(text: string): boolean {
  const normalized = normalizeArtifactText(text);
  return (GENERATION_VERB.test(normalized) || PATCH_VERB.test(normalized)) && ARTIFACT_TERM.test(normalized);
}

/**
 * A concrete add/edit request with an explicit artifact. Full-generation verbs win so an
 * explicit "soạn SOLUTION đầy đủ" turn is never downgraded to a section patch (D-05/D-09).
 */
export function looksLikeArtifactPatchRequest(text: string): boolean {
  const normalized = normalizeArtifactText(text);
  if (GENERATION_VERB.test(normalized)) return false;
  return PATCH_VERB.test(normalized) && ARTIFACT_TERM.test(normalized);
}

/** Only the exact artifact the user named; never a silent step default. */
export function explicitPatchKind(text: string, allowed: readonly SdlcArtifactKindForTurn[]): SdlcArtifactKindForTurn | undefined {
  const normalized = normalizeArtifactText(text);
  const named = allowed.filter((kind) => artifactTerm(kind.toLowerCase()).test(normalized));
  return named.length === 1 ? named[0] : undefined;
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
  artifactToolContext,
  onApplyArtifactPatch,
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
  // Original bounded-edit text is retained until the user names the document (D-03/D-08).
  const [patchClarification, setPatchClarification] = useState<{ text: string; targets: readonly SdlcArtifactKindForTurn[] } | null>(null);
  const artifactActions = STEP_ARTIFACT_ACTIONS[stepId] ?? [];

  useEffect(() => { setArtifactNotice(null); setPatchClarification(null); }, [scopeKey, threadId, readOnly]);

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

  const [patchRecords, setPatchRecords] = useState<Record<string, PatchRecord>>({});
  const [refusalRecords, setRefusalRecords] = useState<RefusalRecord[]>([]);
  const [approvalState, setApprovalState] = useState<{ stale?: boolean; applying?: boolean; error?: string }>({});
  const staleRef = useRef(false);
  staleRef.current = approvalState.stale === true;
  const [activeProposalId, setActiveProposalId] = useState<string | null>(null);
  const pendingProposalRef = useRef<ArtifactPatchProposal | null>(null);
  const appliedProposalIdsRef = useRef(new Set<string>());
  const freshnessGenerationRef = useRef(0);
  const liveContextRef = useRef(artifactToolContext);
  liveContextRef.current = artifactToolContext;

  useEffect(() => {
    setPatchRecords({}); setRefusalRecords([]); setApprovalState({}); setActiveProposalId(null);
    pendingProposalRef.current = null; appliedProposalIdsRef.current.clear();
    freshnessGenerationRef.current += 1;
  }, [scopeKey, threadId]);

  const turn = useChatTurn({
    scopeKey,
    deps: {
      ...createDefaultChatTurnDeps(db),
      onToolEvent: (event) => {
        setToolEvents((prev) => [...prev, event]);
        if (event.phase !== 'result' || normalizeToolName(event.name) !== 'patch_artifact_section') return;
        let parsed: { refused?: boolean; code?: string; message?: string } | undefined;
        try { parsed = JSON.parse(event.result ?? '{}'); } catch { parsed = undefined; }
        if (parsed?.refused !== true) return;
        const step = parsed.code === 'ARTIFACT_NOT_FOUND' || parsed.code === 'WORKFLOW_UNAVAILABLE' ? stepId : undefined;
        setRefusalRecords((prev) => [...prev, { callId: event.id, scopeKey, message: parsed!.message ?? '', ...(step ? { step } : {}) }]);
      },
      onAwaitingApproval: (info) => {
        if (!info.patch) return;
        const patch = info.patch;
        pendingProposalRef.current = patch;
        setActiveProposalId(patch.proposalId);
        setApprovalState({ stale: false });
        setPatchRecords((prev) => prev[patch.proposalId] ? prev : { ...prev, [patch.proposalId]: {
          patch, scopeKey, decisionRow: { id: crypto.randomUUID(), threadId: threadId ?? '', role: 'system', content: '',
            createdAt: new Date().toISOString() } } });
      },
      onError: (info) => setError(info),
    },
  });

  // Live draft text for the pending proposal; part of the freshness effect's dependency set so a
  // host-rendered edit re-checks even when it hands down the same context object.
  const liveDraft = artifactToolContext && pendingProposalRef.current
    ? artifactToolContext.getDraft(pendingProposalRef.current.kind) : undefined;
  // Freshness is checked against the live trusted context, never against a rejection.
  // The draft text is part of the dependency set so a host-rendered edit re-checks even when
  // it hands down the same context object.
  useEffect(() => {
    if (!activeProposalId || !artifactToolContext) return;
    // The generation token stops an older hash promise from re-enabling Approve after a scope switch.
    const generation = (freshnessGenerationRef.current += 1);
    void (async () => {
      const snapshot = await readArtifactSnapshot(db, artifactToolContext, pendingProposalRef.current?.kind ?? 'SOLUTION');
      if (generation !== freshnessGenerationRef.current) return;
      // Normalized hash governs staleness semantics; an exact-base change (including
      // whitespace-only) also requires a fresh proposal before replacing text (T-27-02).
      const captured = pendingProposalRef.current;
      const currentMarkdown = 'markdown' in snapshot ? snapshot.markdown : undefined;
      const stale = !('baseHash' in snapshot) || !captured || currentMarkdown === undefined ||
        snapshot.baseHash !== captured.baseHash || currentMarkdown !== captured.baseMarkdown;
      setApprovalState((prev) => prev.stale === stale ? prev : { ...prev, stale });
    })();
  }, [artifactToolContext, activeProposalId, db, liveDraft]);

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
    async (rawText: string, artifact?: SdlcArtifactKindForTurn, patchIntent = false) => {
      const text = rawText.trim();
      if (!text || !threadId) return;
      // A prelude in flight owns the step: a second send would supersede a prompt already
      // assembled and about to start.
      if (preludeTokenRef.current !== 0 || turn.runtime?.isRunning() || turn.status === 'awaiting-approval') return;

      setDraft('');
      setError(null);
      setToolEvents([]);
      setRefusalRecords([]);
      appliedProposalIdsRef.current.clear();
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
        // Trusted host gate before composition: an artifact tool is only advertised when a real
        // scoped context, a live target artifact and every prerequisite are present (T-27-13).
        const artifactScopeReady = Boolean(artifactToolContext) && artifactToolContext!.getAccess().scopeValid &&
          !artifactToolContext!.getAccess().readOnly && artifactToolContext!.getAccess().crActive;
        const prerequisitesMet = (ARTIFACT_PREREQUISITES[stepId] ?? [])
          .every(([marker]) => hasGroundingSource(stepGroundingContext, marker));
        const contextKinds = (['SOLUTION', 'PL03B', 'PL07', 'CAB'] as const)
          .filter((kind) => artifactToolContext?.getDraft(kind) !== undefined);
        const artifactsAllowed = artifactScopeReady && prerequisitesMet;
        const [config, apiKey, discovery] = await Promise.all([
          getNineRouterConfig(db),
          getNineRouterApiKey(db),
          toolbox.toolsForTurn(),
        ]);
        const { dynamicReadOnlyToolNames } = discovery;
        // Only the artifact pair is host-gated here; the discovered MCP suffix flows through.
        const tools = discovery.tools.filter((tool) => {
          const name = normalizeToolName(tool.function.name);
          if (name === 'get_artifact') return artifactsAllowed;
          if (name === 'patch_artifact_section') return artifactsAllowed && contextKinds.length > 0;
          return true;
        });

        const composed = composeSdlcTurn({
          step: stepId,
          intent: patchIntent ? 'patch' : artifact ? 'artifact' : 'qa',
          ...(artifact ? { artifact } : {}),
          grounding: groundingText,
          dynamicReadOnlyToolNames,
          availableToolNames: tools.map((tool) => normalizeToolName(tool.function.name)),
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
          ...(artifactToolContext ? { artifactContext: artifactToolContext } : {}),
        });

        if (outcome.phase === 'error') {
          if (outcome.error) setError(outcome.error);
          return;
        }
        // T-27-12: only an explicit full-generation turn may hand final text to the editor.
        // Patch and ordinary Q&A answers can never bypass the diff card.
        if (outcome.phase === 'complete' && outcome.content && artifact && !patchIntent) {
          await extractArtifactDraft(outcome.content, artifact);
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
    [threadId, messages, db, stepId, crId, groundingText, turn, scopeKey, toolbox, extractArtifactDraft, artifactToolContext]
  );

  const handleResolveArtifactApproval = useCallback(async (approved: boolean) => {
    const patch = pendingProposalRef.current;
    if (!patch) return;
    if (approved) {
      if (liveContextRef.current?.scopeKey !== patch.scopeKey) {
        setApprovalState({ stale: true });
        return;
      }
      if (approvalState.stale) return;
      if (!onApplyArtifactPatch) {
        setApprovalState({ error: 'Chưa có kết nối cập nhật bản nháp trong màn hình này. Bản nháp hiện tại vẫn nguyên vẹn — hãy mở lại bước và thử chấp thuận lại.' });
        return;
      }
      if (appliedProposalIdsRef.current.has(patch.proposalId)) return;
      appliedProposalIdsRef.current.add(patch.proposalId);
      setApprovalState({ applying: true });
      const decisionRow: ChatMessage = {
        ...patchRecords[patch.proposalId]!.decisionRow,
        content: `${ARTIFACT_PATCH_DECISION_PREFIX}${JSON.stringify({ proposalId: patch.proposalId, kind: patch.kind, sectionId: patch.sectionId, decision: 'approved' })}\n${DECISION_COPY.approved}`,
      };
      try {
        await onApplyArtifactPatch(patch, decisionRow);
        setPatchRecords((prev) => ({ ...prev, [patch.proposalId]: { ...prev[patch.proposalId]!, decision: 'approved' } }));
        setApprovalState({});
        turn.resolveApproval(true);
      } catch (cause) {
        appliedProposalIdsRef.current.delete(patch.proposalId);
        const detail = cause instanceof Error ? cause.message : String(cause);
        setApprovalState({ error: `Không thể cập nhật bản nháp: ${detail}. Bản nháp hiện tại vẫn nguyên vẹn — thử chấp thuận lại hoặc gửi yêu cầu mới trong khung chat.` });
      }
      return;
    }
    const record = patchRecords[patch.proposalId];
    setApprovalState({ applying: true });
    try {
      // Stable runtime UUID: retries rewrite the same row, never append a duplicate.
      const row: ChatMessage = { ...record!.decisionRow, threadId: threadId ?? record!.decisionRow.threadId,
        content: `${ARTIFACT_PATCH_DECISION_PREFIX}${JSON.stringify({ proposalId: patch.proposalId, kind: patch.kind, sectionId: patch.sectionId, decision: 'rejected' })}\n${DECISION_COPY.rejected}` };
      await db.transaction('rw', [db.chatMessages, db.chatThreads], async () => {
        await db.chatMessages.put(row);
        await db.chatThreads.update(row.threadId, { updatedAt: row.createdAt });
      });
      setPatchRecords((prev) => ({ ...prev, [patch.proposalId]: { ...prev[patch.proposalId]!, decision: 'rejected' } }));
      setApprovalState({});
      turn.resolveApproval(false);
    } catch {
      setApprovalState({ error: 'Không thể ghi nhận quyết định từ chối. Đề xuất vẫn đang chờ — hãy thử lại.' });
    }
  }, [approvalState.stale, onApplyArtifactPatch, patchRecords, threadId, db, turn]);

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
    // T-27-13: a bounded edit naming a document this step does not own is refused, never
    // silently downgraded to Q&A or retargeted at another step's artifact.
    if (!readOnly && artifactActions.length > 0 && looksLikeArtifactPatchRequest(text) &&
      !explicitPatchKind(text, artifactActions)) {
      const foreign = (['SOLUTION', 'PL03B', 'PL07', 'CAB'] as const).find((kind) =>
        !artifactActions.includes(kind) && artifactTerm(kind.toLowerCase()).test(normalizeArtifactText(text)));
      if (foreign) {
        const step = (Object.keys(STEP_ARTIFACT_ACTIONS) as SdlcStepId[])
          .find((candidate) => STEP_ARTIFACT_ACTIONS[candidate]?.includes(foreign));
        setArtifactNotice({ type: 'warning',
          message: `Tài liệu ${foreign} không thuộc bước này. Hãy chuyển sang bước sở hữu tài liệu đó để đề xuất chỉnh sửa.`,
          ...(step ? { step } : {}) });
        return;
      }
    }
    // D-05/D-09: a concrete add/edit request with an explicit target becomes a bounded patch turn.
    if (!readOnly && artifactToolContext && artifactActions.length > 0 && looksLikeArtifactPatchRequest(text)) {
      const kind = explicitPatchKind(text, artifactActions);
      if (kind) {
        const missing = ARTIFACT_PREREQUISITES[stepId]?.find(([marker]) => !hasGroundingSource(stepGroundingContext, marker));
        if (missing) {
          setArtifactNotice({ type: 'warning', message: formatGuardMessage(missing[1]),
            step: WORKFLOW_GUARD_MESSAGES[missing[1]].supplyingStep });
          return;
        }
        await submit(text, kind, true);
        return;
      }
      // TECH_DOCS owns two documents: ask which one instead of silently defaulting (T-27-13).
      setPatchClarification({ text, targets: artifactActions });
      return;
    }
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
        setPatchClarification(null);
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

  // Decisions are durable transcript data; pending bodies never enter `messages`.
  // The card already renders its resolved line while still mounted; the persisted row is
  // shown once the card is gone (after resolve) or after remount. Dedupe only that overlap.
  const decisionRows = (messages ?? [])
    .map(parseDecision)
    .filter((d): d is NonNullable<typeof d> => Boolean(d))
    .filter((d) => !(turn.pendingApproval?.patch?.proposalId === d.proposalId && patchRecords[d.proposalId]?.decision));
  const activeRecord = activeProposalId ? patchRecords[activeProposalId] : undefined;
  const toolEventExtensions = useMemo(
    () => Object.fromEntries(refusalRecords.map((record) => [record.callId, (
      <Alert key={record.callId} type="warning" showIcon style={{ fontSize: 12, marginTop: 4 }}
        title={record.message}
        action={record.step && onNavigateToStep ? (
          <Button size="small" style={{ minHeight: 32, fontSize: 12 }} onClick={() => onNavigateToStep(record.step!)}>
            Chuyển đến Bước {WORKFLOW_GUARD_STEP_NUMBER[record.step]}: {STEP_LABELS[record.step].replace(/^\d+\.\s*/, '')}
          </Button>
        ) : null} />
    )])),
    [refusalRecords, onNavigateToStep]
  );

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
        messages={(messages ?? []).filter((row) => !row.content.startsWith(ARTIFACT_PATCH_DECISION_PREFIX))}
        turn={{
          status: preludePending && turn.status === 'idle' ? 'preparing' : turn.status,
          streamingText: turn.streamingText,
          streamingStatusLabel: turn.streamingStatusLabel,
          pendingApproval: turn.pendingApproval && activeRecord?.decision
            ? { ...turn.pendingApproval, patch: activeRecord.patch }
            : turn.pendingApproval,
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
        onResolveApproval={(approved) => { void handleResolveArtifactApproval(approved); }}
        onRetry={() => {
          void turn.retry();
        }}
        statusExtensions={!readOnly && (artifactNotice || patchClarification || artifactActions.length > 0) ? (
          <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {patchClarification && (
              <Alert
                type="warning"
                showIcon
                closable={{ onClose: () => setPatchClarification(null) }}
                title={`Yêu cầu chỉnh sửa này áp dụng cho tài liệu nào của bước ${stepId}? Chọn một tài liệu để đề xuất chỉnh sửa: ${patchClarification.targets.join(' / ')}.`}
                action={
                  <Space size={8} wrap>
                    {patchClarification.targets.map((kind) => (
                      <Button key={kind} size="small" style={{ minHeight: 32, fontSize: 12 }}
                        disabled={preludePending || turn.runtime?.isRunning() || turn.status === 'awaiting-approval'}
                        onClick={() => {
                          const original = patchClarification.text;
                          setPatchClarification(null);
                          void submit(original, kind, true);
                        }}>
                        Chỉnh sửa {kind}
                      </Button>
                    ))}
                  </Space>
                }
              />
            )}
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
        artifactApprovalState={approvalState}
        {...(activeRecord?.decision ? { artifactDecision: activeRecord.decision } : {})}
        {...(Object.keys(toolEventExtensions).length > 0 ? { toolEventExtensions } : {})}
        transcriptExtensions={decisionRows.length > 0 ? (
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 4 }} aria-label="Quyết định đề xuất chỉnh sửa">
            {decisionRows.map((row) => (
              <div key={row.proposalId} role="status" style={{ fontSize: 12, color: token.colorTextSecondary }}>
                {row.decision === 'approved' ? 'Đã chấp thuận — bản nháp bước này đã được cập nhật.' : 'Đã từ chối đề xuất — tài liệu không thay đổi.'}
              </div>
            ))}
          </div>
        ) : undefined}
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
