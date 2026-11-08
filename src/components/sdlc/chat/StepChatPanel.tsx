import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Checkbox, Collapse, message, Modal, Space, Tag, theme } from 'antd';
import { BulbOutlined, CheckCircleFilled, ExperimentOutlined, StopOutlined, SyncOutlined } from '@ant-design/icons';
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
import { readArtifactSnapshot, type ArtifactPatchProposal, type ArtifactToolContext, type ResearchProposalResult, type SubsystemProposalResult } from '../../../services/ai/sdlcArtifactTools';
import { getChangeRequest, updateChangeRequest } from '../../../db/repositories/changeRequestRepo';
import { SubsystemProposalCard, dismissProposal } from '../common/SubsystemProposalCard';
import { ResearchDetailModal } from '../common/ResearchSummaryCard';
import {
  executeMultiSystemResearch,
  ResearchPayloadSchema,
  ResearchRunError,
  type ResearchErrorCode,
  type ResearchPayload,
} from '../../../services/ai/researchService';
import { loadLatestResearchArtifact } from '../../../services/wizard/artifactRepo';

export const ARTIFACT_PATCH_DECISION_PREFIX = 'ARTIFACT_PATCH_DECISION ';
const DECISION_COPY = {
  approved: 'Đã chấp thuận — bản nháp bước này đã được cập nhật.',
  rejected: 'Đã từ chối đề xuất — tài liệu không thay đổi.',
};

type PatchRecord = { patch: ArtifactPatchProposal; scopeKey: string; callId?: string;
  decisionRow: ChatMessage; decision?: 'approved' | 'rejected' };
type RefusalRecord = { callId: string; scopeKey: string; message: string; step?: SdlcStepId };
/** D-41/D-42: a proposal is data until the user confirms it in the card. */
type ProposalRecord = { proposal: SubsystemProposalResult; scopeKey: string; decision?: 'approved' | 'skipped' };
/** D-08: the research proposal is likewise data — nothing runs until the card is confirmed. */
type ResearchProposalRecord = { proposal: ResearchProposalResult; scopeKey: string; decision?: 'approved' | 'skipped' };

export interface ResearchStartPayload {
  questions: string[];
  targetSystemIds: string[];
  includeWeb: boolean;
}

type ResearchRunState =
  | { phase: 'idle' }
  | { phase: 'streaming'; lines: string[]; startedAt: number }
  | { phase: 'completed'; payload: ResearchPayload }
  | { phase: 'error'; code: ResearchErrorCode; message: string; retry?: ResearchStartPayload };

/** T-32-09: the live console keeps only the newest lines, so a chatty run cannot bloat the DOM. */
export const RESEARCH_LOG_LINE_CAP = 500;

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
  changeRequestId: string;
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
  conventions?: {
    global?: string | undefined;
    repo?: string | undefined;
    repoPath?: string | undefined;
  } | undefined;
}

export interface StepChatPanelHandle {
  /** Submits a Q&A turn for the current step. */
  sendMessage: (text: string) => Promise<void>;
  /** Submits an explicit artifact-intent turn (D-16) — the editor's "analyse again" path. */
  requestArtifactAnalysis: () => void;
  requestArtifact: (kind: SdlcArtifactKindForTurn) => void;
  /** D-08: starts a research run from the step-view toolbar through this panel's state machine. */
  startResearch: (payload: ResearchStartPayload) => void;
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

// -------------------------------------------------------------------------------------------------
// External research cards (D-08, D-09, D-11, UI-SPEC §1/§3/§4/§5)
// -------------------------------------------------------------------------------------------------

/** D-11: the follow-up turn the completion CTA dispatches — never sent automatically. */
export const PROCEED_WITH_RESEARCH_PROMPT =
  'Áp dụng bằng chứng nghiên cứu bên ngoài vừa thu thập để hoàn thiện giải pháp hiện tại (xếp sau bằng chứng nội bộ, giữ nguyên trích dẫn nguồn).';

export interface ResearchProposalCardProps {
  proposal: ResearchProposalResult;
  applying?: boolean | undefined;
  decision?: 'approved' | 'skipped' | undefined;
  onConfirm: (payload: ResearchStartPayload) => void;
  onSkip: () => void;
}

/**
 * D-08 / T-32-12: questions and system codes come only from the `propose_research` result,
 * which already re-resolved both against the catalog and the CR targets. The card never
 * trusts a model-supplied name and never starts a run on mount.
 */
export const ResearchProposalCard: React.FC<ResearchProposalCardProps> = ({
  proposal, applying = false, decision, onConfirm, onSkip,
}) => {
  const { token } = theme.useToken();
  const [checked, setChecked] = useState<string[]>(() => proposal.targetSystemIds);

  // The card instance is reused when a new proposal replaces the old one, so the selection
  // must follow the proposal — otherwise confirming sends ids the card never displayed.
  useEffect(() => {
    setChecked(proposal.targetSystemIds);
  }, [proposal]);

  if (decision) {
    return (
      <section data-testid="research-proposal" aria-label="Đề xuất nghiên cứu" role="status"
        style={{ padding: '8px 12px', margin: '8px 0 16px', fontSize: 12, color: token.colorTextSecondary }}>
        {decision === 'approved' ? 'Đã xác nhận nghiên cứu bên ngoài' : 'Đã bỏ qua đề xuất nghiên cứu'}
      </section>
    );
  }

  // A proposal with no resolvable target system can never start a run; say so instead.
  const unavailable = new Set(proposal.unavailableSystemIds);

  return (
    <section data-testid="research-proposal" aria-label="Đề xuất nghiên cứu"
      style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, maxWidth: '100%',
        backgroundColor: '#ffffff', border: '1px solid #e9eaee', borderLeft: '3px solid #faad14',
        borderRadius: 4, margin: '8px 0 16px', color: token.colorText }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 16, fontWeight: 600 }}>
        <BulbOutlined style={{ color: '#faad14', flexShrink: 0 }} />
        <span>Đề xuất nghiên cứu từ bên ngoài (Claude Code)</span>
      </div>
      {proposal.rationale && (
        <div style={{ fontSize: 12, color: token.colorTextSecondary }}>{proposal.rationale}</div>
      )}
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {proposal.questions.map((entry, index) => (
          <li key={`${index}:${entry.question}`}>
            {entry.question}
            {entry.systemCode && (
              <Tag color="cyan" style={{ marginLeft: 6, fontFamily: 'monospace' }}>{entry.systemCode}</Tag>
            )}
          </li>
        ))}
      </ul>
      {proposal.targetSystemIds.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Hệ thống mục tiêu</span>
          <Checkbox.Group
            value={checked}
            onChange={(values) => setChecked(values as string[])}
            options={proposal.targetSystemIds.map((systemId) => {
              const code = proposal.questions.find((entry) => entry.systemId === systemId)?.systemCode ?? systemId;
              return {
                label: unavailable.has(systemId) ? `${code} (chưa cấu hình SSH)` : code,
                value: systemId,
              };
            })}
          />
        </div>
      )}
      {unavailable.size > 0 && (
        <div role="alert" style={{ fontSize: 12, color: '#ad6800' }}>
          Không thể nghiên cứu: {[...unavailable].map((systemId) =>
            proposal.questions.find((entry) => entry.systemId === systemId)?.systemCode ?? systemId).join(', ')}.
          Bạn vẫn có thể tiếp tục bằng bằng chứng nội bộ.
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
        <Button disabled={applying} onClick={onSkip} style={{ minHeight: 32, fontSize: 12 }}>
          Tiếp tục bằng bằng chứng nội bộ
        </Button>
        <Button type="primary" disabled={checked.length === 0 || applying} style={{ minHeight: 32, fontSize: 12 }}
          onClick={() => onConfirm({
            questions: proposal.questions.map((entry) => entry.question),
            targetSystemIds: checked,
            includeWeb: true,
          })}>
          Xác nhận nghiên cứu
        </Button>
      </div>
    </section>
  );
};

export interface ResearchStreamingCardProps {
  lines: readonly string[];
  startedAt: number;
  cancelling?: boolean | undefined;
  onCancel: () => void;
}

/** D-09 / T-32-09: elapsed timer, line count, and a capped live console. */
export const ResearchStreamingCard: React.FC<ResearchStreamingCardProps> = ({
  lines, startedAt, cancelling = false, onCancel,
}) => {
  const { token } = theme.useToken();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const elapsedSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const elapsed = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')}:${String(elapsedSeconds % 60).padStart(2, '0')}`;
  const visible = lines.slice(-RESEARCH_LOG_LINE_CAP);

  return (
    <section data-testid="research-streaming" aria-label="Đang nghiên cứu bên ngoài"
      style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, maxWidth: '100%',
        backgroundColor: '#ffffff', border: '1px solid #e9eaee', borderRadius: 4, margin: '8px 0 16px', color: token.colorText }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, fontWeight: 600 }}>
        <SyncOutlined spin style={{ color: token.colorPrimary }} />
        <span>Đang thực thi Claude Code headless...</span>
      </div>
      <Space size={8} wrap>
        <Tag color="processing" style={{ margin: 0, fontFamily: 'monospace' }}>{elapsed}</Tag>
        <Tag style={{ margin: 0 }}>{lines.length} dòng</Tag>
      </Space>
      <Collapse size="small" items={[{
        key: 'stdout',
        label: 'Xem nhật ký stdout theo thời gian thực',
        children: (
          <pre style={{ margin: 0, maxHeight: 200, overflowY: 'auto', padding: 8, background: '#1e1f22',
            color: '#d1d3d9', fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, Consolas, monospace",
            fontSize: 12, lineHeight: 1.4 }}>
            {visible.join('\n')}
          </pre>
        ),
      }]} />
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button danger icon={<StopOutlined />} loading={cancelling} onClick={onCancel} style={{ minHeight: 32, fontSize: 12 }}>
          Hủy nghiên cứu
        </Button>
      </div>
    </section>
  );
};

export interface ResearchCompletionCardProps {
  payload: ResearchPayload;
  elapsedMs?: number | undefined;
  onProceed: () => void;
  onViewDetail?: (() => void) | undefined;
}

/** D-11: the follow-up turn is dispatched only by this explicit CTA. */
export const ResearchCompletionCard: React.FC<ResearchCompletionCardProps> = ({
  payload, elapsedMs, onProceed, onViewDetail,
}) => {
  const { token } = theme.useToken();
  const webCount = payload.findings.filter((finding) => finding.scope === 'web').length;
  const repoCount = payload.findings.filter((finding) => finding.scope === 'repo').length;

  return (
    <section data-testid="research-completion" aria-label="Hoàn thành nghiên cứu bên ngoài"
      style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, maxWidth: '100%',
        backgroundColor: '#ffffff', border: '1px solid #e9eaee', borderRadius: 4, margin: '8px 0 16px', color: token.colorText }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, fontWeight: 600 }}>
        <CheckCircleFilled style={{ color: '#52c41a' }} />
        <span>Hoàn thành nghiên cứu bên ngoài</span>
      </div>
      <Space size={8} wrap>
        <Tag color="blue" style={{ margin: 0 }}>[EXTERNAL:WEB] {webCount} phát hiện</Tag>
        <Tag color="cyan" style={{ margin: 0 }}>[EXTERNAL:REPO] {repoCount} phát hiện</Tag>
        {elapsedMs !== undefined && (
          <Tag style={{ margin: 0 }}>{Math.max(1, Math.round(elapsedMs / 1000))}s</Tag>
        )}
      </Space>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
        {onViewDetail && (
          <Button icon={<ExperimentOutlined />} onClick={onViewDetail} style={{ minHeight: 32, fontSize: 12 }}>
            Xem chi tiết phát hiện
          </Button>
        )}
        <Button type="primary" onClick={onProceed} style={{ minHeight: 32, fontSize: 12 }}>
          Tiếp tục sinh Solution với bằng chứng này
        </Button>
      </div>
    </section>
  );
};

export interface ResearchErrorAlertProps {
  code: ResearchErrorCode;
  message: string;
  onRetry?: (() => void) | undefined;
  onSkip: () => void;
}

/** D-03: unavailable, timeout/SSH, and cancelled each get their own copy and CTAs. */
export const ResearchErrorAlert: React.FC<ResearchErrorAlertProps> = ({ code, message, onRetry, onSkip }) => {
  if (code === 'RESEARCH_CANCELLED') {
    return (
      <div role="status" data-testid="research-cancelled"
        style={{ padding: '8px 12px', margin: '8px 0 16px', fontSize: 12, color: 'rgba(0, 0, 0, 0.65)' }}>
        Tiến trình nghiên cứu đã được hủy bỏ an toàn
      </div>
    );
  }

  const unavailable = code === 'RESEARCH_UNAVAILABLE';
  return (
    <Alert
      type="warning"
      showIcon
      style={{ margin: '8px 0 16px' }}
      title={unavailable
        ? `Không có hệ thống nào sẵn sàng cho nghiên cứu qua SSH. ${message}`
        : 'Không thể hoàn thành nghiên cứu qua SSH (quá thời gian 300s hoặc mất kết nối). Kiểm tra lại kết nối mạng hoặc thử lại.'}
      action={
        <Space size={8} wrap>
          {!unavailable && onRetry && (
            <Button size="small" style={{ minHeight: 32, fontSize: 12 }} onClick={onRetry}>Thử lại</Button>
          )}
          <Button size="small" style={{ minHeight: 32, fontSize: 12 }} onClick={onSkip}>
            Bỏ qua, tiếp tục bằng bằng chứng nội bộ
          </Button>
        </Space>
      }
    />
  );
};

/**
 * Thin host adapter (D-25). Owns exactly one turn (`useChatTurn`) for one step scope,
 * composes every turn through the layered SDLC composer, and supplies every
 * `AiChatWidget` prop. It holds no chat loop of its own.
 */
export const StepChatPanel = React.forwardRef<StepChatPanelHandle, StepChatPanelProps>(({
  changeRequestId,
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
  conventions,
  db = defaultDb,
}, ref) => {
  const { token } = theme.useToken();
  const scopeKey = `sdlc:${changeRequestId}:${crId}:${stepId}`;
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

  // Isolated thread for this step: sdlc:{changeRequestId}:{crId}:{stepId}
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!changeRequestId || !crId || !stepId) return;
      try {
        const thread = await getStepThread(changeRequestId, crId, stepId, db);
        if (!cancelled) setThread({ scopeKey, id: thread.id });
      } catch {
        // A missing thread only disables sending; it must not break the step view.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [changeRequestId, crId, stepId, scopeKey, db]);

  const messages = useLiveQuery(
    () => (threadId ? db.chatMessages.where('threadId').equals(threadId).sortBy('createdAt') : []),
    [threadId, db]
  );
  // D-43: additive proposals filter against the live targets, so a second confirm is a no-op.
  const liveCr = useLiveQuery(() => getChangeRequest(crId, db), [crId, db]);

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
  const [proposalRecord, setProposalRecord] = useState<ProposalRecord | null>(null);
  const [proposalApproval, setProposalApproval] = useState<{ applying?: boolean; error?: string }>({});
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

  const [researchProposal, setResearchProposal] = useState<ResearchProposalRecord | null>(null);
  const [researchRun, setResearchRun] = useState<ResearchRunState>({ phase: 'idle' });
  const [researchCancelling, setResearchCancelling] = useState(false);
  const [researchDetailOpen, setResearchDetailOpen] = useState(false);
  const researchCancelRef = useRef<(() => Promise<void>) | null>(null);
  const researchRunIdRef = useRef(0);
  // D-07: the latest persisted payload feeds the composer as subordinate external evidence.
  const latestResearch = useLiveQuery(
    () => loadLatestResearchArtifact(changeRequestId, db),
    [changeRequestId, db]
  );
  const externalResearch = useMemo(() => {
    const parsed = ResearchPayloadSchema.safeParse(latestResearch?.payload);
    return parsed.success ? parsed.data : null;
  }, [latestResearch]);

  useEffect(() => {
    setPatchRecords({}); setRefusalRecords([]); setApprovalState({}); setActiveProposalId(null);
    setProposalRecord(null); setProposalApproval({});
    pendingProposalRef.current = null; appliedProposalIdsRef.current.clear();
    freshnessGenerationRef.current += 1;
    // A run belongs to the scope that started it; leaving the scope drops the card and handle.
    researchRunIdRef.current += 1;
    researchCancelRef.current = null;
    setResearchProposal(null);
    setResearchRun({ phase: 'idle' });
    setResearchCancelling(false);
  }, [scopeKey, threadId]);

  const turn = useChatTurn({
    scopeKey,
    background: true,
    deps: {
      ...createDefaultChatTurnDeps(db),
      onToolEvent: (event) => {
        setToolEvents((prev) => [...prev, event]);
        const toolName = normalizeToolName(event.name);
        if (event.phase !== 'result') return;
        if (toolName === 'propose_subsystems') {
          // D-42: parse and render only — the CR is untouched until the user clicks.
          try {
            const parsed = JSON.parse(event.result ?? '{}') as SubsystemProposalResult & { refused?: boolean };
            if (!parsed.refused && Array.isArray(parsed.items) && parsed.items.length > 0) {
              setProposalRecord({ proposal: { items: parsed.items, evidence: parsed.evidence ?? [] }, scopeKey });
              setProposalApproval({});
            }
          } catch { /* A malformed proposal never becomes a card. */ }
          return;
        }
        if (toolName === 'propose_research') {
          // D-08/T-32-12: parse and render only — nothing runs until the user confirms.
          try {
            const parsed = JSON.parse(event.result ?? '{}') as ResearchProposalResult & { refused?: boolean };
            if (!parsed.refused && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
              setResearchProposal({
                proposal: {
                  questions: parsed.questions,
                  targetSystemIds: parsed.targetSystemIds ?? [],
                  rationale: parsed.rationale ?? '',
                  unavailableSystemIds: parsed.unavailableSystemIds ?? [],
                },
                scopeKey,
              });
            }
          } catch { /* A malformed proposal never becomes a card. */ }
          return;
        }
        if (toolName !== 'patch_artifact_section' && toolName !== 'get_artifact') return;
        let parsed: { refused?: boolean; code?: string; message?: string; supplyingStep?: SdlcStepId;
          stepNumber?: number; missingArtifact?: string } | undefined;
        try { parsed = JSON.parse(event.result ?? '{}'); } catch { parsed = undefined; }
        if (parsed?.refused !== true) return;
        // WR-06: the service already reports the supplying step; surface its navigation CTA.
        const step = parsed.supplyingStep ?? (
          parsed.code === 'ARTIFACT_NOT_FOUND' || parsed.code === 'WORKFLOW_UNAVAILABLE' ? stepId : undefined);
        setRefusalRecords((prev) => [...prev, { callId: event.id, scopeKey, message: parsed!.message ?? '',
          ...(step ? { step } : {}) }]);
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
          // D-41: a proposal is only meaningful inside a live CR scope; without one the tool
          // would refuse anyway, so it must not be advertised.
          if (name === 'propose_subsystems') return artifactsAllowed;
          // D-08: same gate — a research proposal outside a live CR scope would refuse anyway.
          if (name === 'propose_research') return artifactsAllowed;
          return true;
        });

        const composed = composeSdlcTurn({
          step: stepId,
          intent: patchIntent ? 'patch' : artifact ? 'artifact' : 'qa',
          ...(artifact ? { artifact } : {}),
          grounding: groundingText,
          ...(conventions ? { conventions } : {}),
          dynamicReadOnlyToolNames,
          availableToolNames: tools.map((tool) => normalizeToolName(tool.function.name)),
          metadata: { cr: crId },
          externalResearch,
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
    [threadId, messages, db, stepId, crId, groundingText, turn, scopeKey, toolbox, extractArtifactDraft, artifactToolContext, externalResearch]
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

  const handleApproveProposal = useCallback(async (systemIds: string[]) => {
    const record = proposalRecord;
    if (!record || record.decision) return;
    // A proposal from a scope that is no longer live must never write this CR.
    if (liveContextRef.current?.scopeKey !== record.scopeKey) {
      setProposalApproval({ error: 'Phạm vi quy trình đã thay đổi. Hãy mở lại CR và đề xuất lại.' });
      return;
    }
    setProposalApproval({ applying: true });
    try {
      const cr = await getChangeRequest(crId, db);
      if (!cr) throw new Error('Không tìm thấy CR');
      const existing = new Set(cr.targets.map((target) => target.systemId));
      const added = systemIds.filter((systemId) => !existing.has(systemId));
      if (added.length > 0) {
        // The repo re-validates every id against the catalog and applies branch defaults (D-25).
        await updateChangeRequest(crId, {
          targets: [...cr.targets.map((target) => ({ systemId: target.systemId, ...(target.featureBranch !== undefined ? { featureBranch: target.featureBranch } : {}) })),
            ...added.map((systemId) => ({ systemId }))],
        }, db);
      }
      setProposalRecord({ ...record, decision: 'approved' });
      setProposalApproval({});
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      setProposalApproval({ error: `Không thể thêm subsystem vào CR: ${detail}` });
    }
  }, [proposalRecord, crId, db]);

  const handleSkipProposal = useCallback(() => {
    // D-42: persisted as the settings key `sdlc_proposal_dismissed:<crId>`; that key is what
    // stops the same CR from showing the card again (the card reads it on mount).
    void dismissProposal(crId, db);
    setProposalRecord((prev) => (prev ? { ...prev, decision: 'skipped' } : prev));
    setProposalApproval({});
  }, [crId, db]);

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

  /**
   * D-08/D-09/D-11: the single research entry point for both trigger paths.
   *
   * T-32-15: the run is gated on a non-null `threadId`, so an artifact can never be persisted
   * against a thread this panel is not actually showing.
   */
  const startResearch = useCallback((payload: ResearchStartPayload) => {
    if (!threadId) return;
    if (readOnly) return;
    // One run at a time: two live runs would share the SSH event names and the remote
    // PID registry key, so one run's exit would resolve the other's promise.
    if (researchRun.phase === 'streaming') return;
    if (payload.questions.length === 0 || payload.targetSystemIds.length === 0) return;

    const runId = (researchRunIdRef.current += 1);
    const startedAt = Date.now();
    // Per run, not per step scope — the session id keys the SSH stream listeners.
    const runSessionId = crypto.randomUUID();
    setResearchProposal((prev) => (prev ? { ...prev, decision: 'approved' } : prev));
    setResearchRun({ phase: 'streaming', lines: [], startedAt });
    setResearchCancelling(false);

    const { promise, cancel } = executeMultiSystemResearch({
      changeRequestId,
      threadId,
      sessionId: runSessionId,
      targetSystemIds: payload.targetSystemIds,
      questions: payload.questions,
      includeWeb: payload.includeWeb,
      onLog: (line) => {
        if (researchRunIdRef.current !== runId) return;
        setResearchRun((prev) => prev.phase === 'streaming'
          ? { ...prev, lines: [...prev.lines, line].slice(-RESEARCH_LOG_LINE_CAP) }
          : prev);
      },
    });
    researchCancelRef.current = cancel;

    void promise.then(
      (result) => {
        if (researchRunIdRef.current !== runId) return;
        researchCancelRef.current = null;
        setResearchCancelling(false);
        setResearchRun({ phase: 'completed', payload: result });
      },
      (cause: unknown) => {
        if (researchRunIdRef.current !== runId) return;
        researchCancelRef.current = null;
        setResearchCancelling(false);
        if (cause instanceof ResearchRunError) {
          setResearchRun({
            phase: 'error',
            code: cause.code,
            message: cause.message,
            ...(cause.code === 'RESEARCH_CANCELLED' ? {} : { retry: payload }),
          });
          return;
        }
        setResearchRun({
          phase: 'error',
          code: 'RESEARCH_SSH_ERROR',
          message: cause instanceof Error ? cause.message : String(cause),
          retry: payload,
        });
      }
    );
  }, [threadId, readOnly, changeRequestId, researchRun.phase]);

  const handleCancelResearch = useCallback(() => {
    const cancel = researchCancelRef.current;
    if (!cancel) return;
    setResearchCancelling(true);
    void cancel();
  }, []);

  const handleSkipResearch = useCallback(() => {
    setResearchRun({ phase: 'idle' });
    setResearchProposal((prev) => (prev ? { ...prev, decision: 'skipped' } : prev));
  }, []);

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
    startResearch,
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
        onResolveApproval={(approved) => {
          // WR-02: only a live artifact proposal owns the artifact path; ordinary mutation
          // approvals resolve directly so the turn never hangs with a disabled composer.
          const proposal = pendingProposalRef.current;
          if (proposal && patchRecords[proposal.proposalId] && !patchRecords[proposal.proposalId]?.decision) {
            void handleResolveArtifactApproval(approved);
            return;
          }
          turn.resolveApproval(approved);
        }}
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
        transcriptExtensions={(proposalRecord || decisionRows.length > 0 || researchProposal || researchRun.phase !== 'idle') ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {researchProposal && (
              <div style={{ padding: '0 16px' }}>
                <ResearchProposalCard
                  proposal={researchProposal.proposal}
                  applying={researchRun.phase === 'streaming'}
                  {...(researchProposal.decision !== undefined ? { decision: researchProposal.decision } : {})}
                  onConfirm={startResearch}
                  onSkip={handleSkipResearch}
                />
              </div>
            )}
            {researchRun.phase === 'streaming' && (
              <div style={{ padding: '0 16px' }}>
                <ResearchStreamingCard
                  lines={researchRun.lines}
                  startedAt={researchRun.startedAt}
                  cancelling={researchCancelling}
                  onCancel={handleCancelResearch}
                />
              </div>
            )}
            {researchRun.phase === 'completed' && (
              <div style={{ padding: '0 16px' }}>
                <ResearchCompletionCard
                  payload={researchRun.payload}
                  onProceed={() => {
                    setResearchRun({ phase: 'idle' });
                    void sendMessage(PROCEED_WITH_RESEARCH_PROMPT);
                  }}
                  onViewDetail={() => setResearchDetailOpen(true)}
                />
              </div>
            )}
            {researchRun.phase === 'error' && (
              <div style={{ padding: '0 16px' }}>
                <ResearchErrorAlert
                  code={researchRun.code}
                  message={researchRun.message}
                  {...(researchRun.retry ? { onRetry: () => startResearch(researchRun.retry!) } : {})}
                  onSkip={handleSkipResearch}
                />
              </div>
            )}
            {proposalRecord && liveCr && (
              <div style={{ padding: '0 16px' }}>
                <SubsystemProposalCard
                  proposal={proposalRecord.proposal}
                  changeRequest={liveCr}
                  db={db}
                  applying={proposalApproval.applying === true}
                  {...(proposalApproval.error !== undefined ? { error: proposalApproval.error } : {})}
                  {...(proposalRecord.decision !== undefined ? { decision: proposalRecord.decision } : {})}
                  onApprove={(systemIds) => { void handleApproveProposal(systemIds); }}
                  onSkip={handleSkipProposal}
                />
              </div>
            )}
            {decisionRows.length > 0 && (
              <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 4 }} aria-label="Quyết định đề xuất chỉnh sửa">
                {decisionRows.map((row) => (
                  <div key={row.proposalId} role="status" style={{ fontSize: 12, color: token.colorTextSecondary }}>
                    {row.decision === 'approved' ? 'Đã chấp thuận — bản nháp bước này đã được cập nhật.' : 'Đã từ chối đề xuất — tài liệu không thay đổi.'}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : undefined}
        // D-03: the SDLC panel is a fixed 380px lane, so name it explicitly. Hosts with a
        // variable width (the drawer) omit this and let the widget measure its host.
        compact
        placeholder={`Hỏi AI trợ giúp bước này (${stepId})...`}
        draft={draft}
        onDraftChange={setDraft}
      />
      <ResearchDetailModal
        open={researchDetailOpen}
        research={researchRun.phase === 'completed' ? researchRun.payload : externalResearch}
        {...(latestResearch ? { version: latestResearch.version } : {})}
        onCancel={() => setResearchDetailOpen(false)}
        {...(liveCr?.code ? { crCode: liveCr.code } : {})}
      />
    </div>
  );
});

StepChatPanel.displayName = 'StepChatPanel';
