import React, { useState, useMemo } from 'react';
import { Typography, Button, Tooltip, theme, message, Spin, Tag, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import {
  CopyOutlined,
  CheckOutlined,
  CheckSquareOutlined,
  ProjectOutlined,
  FileTextOutlined,
  FileAddOutlined,
  CodeOutlined,
  LoadingOutlined,
  SyncOutlined,
  DownloadOutlined,
  FileWordOutlined,
  FileExcelOutlined,
  FilePptOutlined,
  FileMarkdownOutlined,
  FolderOpenOutlined,
} from '@ant-design/icons';
import type { ChatMessage, ChatGeneratedFile } from '../../types/models';
import { APP_NAME, APP_SLUG } from '../../constants/app';
import { renderSafeMarkdown } from '../../utils/markdown';
import {
  exportContentAsFile,
  saveFileWithPicker,
  downloadBlob,
  inferFormatFromFilename,
  type ExportFormat,
} from '../../utils/fileExport';
import { exportPresentationAsFile } from '../../utils/pptxExport';
import { executeDynamicFileScript } from '../../utils/dynamicFileSandbox';
import type { PersistedCitation } from '../../services/ai/groundedAnswerSchemas';
import { GroundedAnswerCard } from './grounded/GroundedAnswerCard';
import { GraphPathCard } from './grounded/GraphPathCard';
import { SourcesPanel } from './grounded/SourcesPanel';
import { DiagnosticsPanel } from './grounded/DiagnosticsPanel';
import { CandidateChipList } from './grounded/CandidateChipList';
import { EvidenceOnlyCard } from './grounded/EvidenceOnlyCard';
import { SeedEntityCard } from './grounded/SeedEntityCard';
import type { PersistedEntityRef } from '../../services/ai/groundedAnswerSchemas';
import { MermaidViewer } from './MermaidViewer';
import { DocumentPreviewCard, type DocumentPreviewPayload } from './wizard/DocumentPreviewCard';
import { SolutionReviewCard, type SolutionReviewPayload } from './wizard/SolutionReviewCard';
import { GapFillQuestionCard } from './wizard/GapFillQuestionCard';
import { WizardProgressStrip } from './wizard/WizardProgressStrip';
import type { ChangePackManifest } from '../../services/wizard/changePack';

export interface WizardMessageCallbacks {
  onSuggestion?: ((messageId: string, questionId: string, suggestion: string) => void) | undefined;
  onSkip?: ((messageId: string, questionId: string, outcome: 'omitted' | 'unknown') => void) | undefined;
  onRequestEdit?: ((messageId: string, draftRevision: number) => void) | undefined;
  onSaveSolution?: ((messageId: string, draftRevision: number) => void | Promise<void>) | undefined;
  onApproveExport?: ((messageId: string, draftRevision: number) => void | Promise<void>) | undefined;
  onOpenNote?: ((noteId: string) => void) | undefined;
  onConfirmPack?: ((messageId: string, manifest: Readonly<ChangePackManifest>) => void) | undefined;
  onReplacePack?: ((messageId: string) => void) | undefined;
  pendingKeys?: ReadonlySet<string> | undefined;
}

const { Text } = Typography;

function escapeAttr(text?: string | null): string {
  return (text || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface GroundedAnswerCardCallbacks {
  onCitationActivate?: ((c: PersistedCitation) => void) | undefined;
  onCandidateSelect?: ((urn: string) => void) | undefined;
  onRefinementSelect?: ((refinement: string) => void) | undefined;
  onEvidenceOnlySynthesize?: (() => void) | undefined;
  onFreshLookup?: (() => void) | undefined;
  onInvalidRetry?: (() => void) | undefined;
  onAuthRepair?: (() => void) | undefined;
  onConfigRepair?: (() => void) | undefined;
  onFindRelated?:
    | ((entity: PersistedEntityRef, sourceMessageId: string) => void)
    | undefined;
  findingRelatedKey?: string | null | undefined;
  synthesizingEvidenceId?: string | null | undefined;
  evidenceSynthesisError?: {
    id: string;
    message: string;
    requiresConfig: boolean;
  } | null | undefined;
}

export interface ChatMessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean | undefined;
  streamingStatus?: string | null | undefined;
  canAddToChecklist?: boolean | undefined;
  canSaveStickyNote?: boolean | undefined;
  canRunClaudeCode?: boolean | undefined;
  onAddToChecklist?: ((items: string[]) => Promise<void> | void) | undefined;
  onSaveStickyNote?: ((content: string) => Promise<void> | void) | undefined;
  onRunClaudeCode?: (() => Promise<void> | void) | undefined;
  groundedCallbacks?: GroundedAnswerCardCallbacks | undefined;
  wizardCallbacks?: WizardMessageCallbacks | undefined;
}

/**
 * Extracts action bullet items from markdown text.
 * Matches lines starting with `- `, `* `, or `1. `
 */
export function parseChecklistFromText(text: string): string[] {
  const lines = text.split('\n');
  const items: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Match bullet points like - item, * item, - [ ] item
    const match = trimmed.match(/^[-*]\s+(?:\[[ xX]\]\s+)?(.+)$/) || trimmed.match(/^\d+\.\s+(.+)$/);
    if (match && match[1]) {
      const cleanItem = match[1].trim();
      if (cleanItem.length > 0 && !cleanItem.startsWith('#')) {
        items.push(cleanItem);
      }
    }
  }

  return items;
}

/**
 * Parses markdown mentions (@[Task](task:id) and #[Project](project:id))
 * and renders them as sleek visual pill tags inside user messages.
 */
export function renderUserMessageWithMentions(content: string): React.ReactNode {
  const mentionRegex = /(@\[([^\]]+)\]\(task:([a-zA-Z0-9_-]+)\))|(#\[([^\]]+)\]\(project:([a-zA-Z0-9_-]+)\))|(@\[([^\]]+)\]\(doc:([a-zA-Z0-9_-]+)\))/g;
  if (!mentionRegex.test(content)) {
    return content;
  }
  mentionRegex.lastIndex = 0;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = mentionRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.substring(lastIndex, match.index));
    }
    if (match[1]) {
      // Task mention
      const taskName = match[2];
      const taskId = match[3];
      parts.push(
        <Tag
          key={`task-pill-${taskId}-${match.index}`}
          icon={<CheckSquareOutlined style={{ color: '#ffffff', marginRight: 4 }} />}
          style={{
            margin: '0 3px',
            verticalAlign: 'middle',
            borderRadius: 4,
            fontWeight: 500,
            backgroundColor: 'rgba(255, 255, 255, 0.22)',
            color: '#ffffff',
            border: '1px solid rgba(255, 255, 255, 0.45)',
            fontSize: 12,
            padding: '1px 6px',
          }}
        >
          {taskName}
        </Tag>
      );
    } else if (match[4]) {
      // Project mention
      const projName = match[5];
      const projId = match[6];
      parts.push(
        <Tag
          key={`proj-pill-${projId}-${match.index}`}
          icon={<ProjectOutlined style={{ color: '#ffffff', marginRight: 4 }} />}
          style={{
            margin: '0 3px',
            verticalAlign: 'middle',
            borderRadius: 4,
            fontWeight: 500,
            backgroundColor: 'rgba(255, 255, 255, 0.22)',
            color: '#ffffff',
            border: '1px solid rgba(255, 255, 255, 0.45)',
            fontSize: 12,
            padding: '1px 6px',
          }}
        >
          #{projName}
        </Tag>
      );
    } else if (match[7]) {
      // Doc mention
      const docTitle = match[8];
      const docId = match[9];
      parts.push(
        <Tag
          key={`doc-pill-${docId}-${match.index}`}
          icon={<FileTextOutlined style={{ color: '#ffffff', marginRight: 4 }} />}
          style={{
            margin: '0 3px',
            verticalAlign: 'middle',
            borderRadius: 4,
            fontWeight: 500,
            backgroundColor: 'rgba(255, 255, 255, 0.22)',
            color: '#ffffff',
            border: '1px solid rgba(255, 255, 255, 0.45)',
            fontSize: 12,
            padding: '1px 6px',
          }}
        >
          {docTitle}
        </Tag>
      );
    }
    lastIndex = mentionRegex.lastIndex;
  }

  if (lastIndex < content.length) {
    parts.push(content.substring(lastIndex));
  }

  return parts;
}

export interface MarkdownSegment {
  type: 'markdown' | 'mermaid';
  content: string;
}

export function parseMarkdownSegments(text: string): MarkdownSegment[] {
  if (!text) return [];
  const segments: MarkdownSegment[] = [];
  const regex = /```mermaid\s*\r?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const md = text.substring(lastIndex, match.index);
      if (md.trim()) {
        segments.push({ type: 'markdown', content: md });
      }
    }
    const code = match[1]?.trim() || '';
    if (code) {
      segments.push({ type: 'mermaid', content: code });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    const trailing = text.substring(lastIndex);
    if (trailing.trim()) {
      segments.push({ type: 'markdown', content: trailing });
    }
  }

  return segments;
}

export const MarkdownContentRenderer: React.FC<{
  content: string;
  onMarkdownClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  transformHtml?: (html: string) => string;
}> = ({ content, onMarkdownClick, transformHtml }) => {
  const segments = useMemo(() => parseMarkdownSegments(content), [content]);

  // If no mermaid blocks, render straight markdown
  if (segments.length === 0 || (segments.length === 1 && segments[0]?.type === 'markdown')) {
    let html = renderSafeMarkdown(content);
    if (transformHtml) html = transformHtml(html);
    return (
      <div
        className="chat-markdown-body"
        onClick={onMarkdownClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <div>
      {segments.map((seg, idx) => {
        if (seg.type === 'mermaid') {
          return <MermaidViewer key={`mermaid-${idx}`} code={seg.content} />;
        }
        let html = renderSafeMarkdown(seg.content);
        if (transformHtml) html = transformHtml(html);
        return (
          <div
            key={`md-${idx}`}
            className="chat-markdown-body"
            onClick={onMarkdownClick}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      })}
    </div>
  );
};

export const ChatMessageBubble: React.FC<ChatMessageBubbleProps> = ({
  message: msg,
  isStreaming = false,
  streamingStatus,
  canAddToChecklist = false,
  canSaveStickyNote = false,
  canRunClaudeCode = false,
  onAddToChecklist,
  onSaveStickyNote,
  onRunClaudeCode,
  groundedCallbacks,
  wizardCallbacks,
}) => {
  const { token } = theme.useToken();
  const [copied, setCopied] = useState(false);
  const [checklistAdded, setChecklistAdded] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const [diagnosticsForcedOpen, setDiagnosticsForcedOpen] = useState(false);

  const isUser = msg.role === 'user';
  const formattedTime = msg.createdAt
    ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  const handleMarkdownClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const citationChip = target.closest('.grounded-inline-chip') as HTMLElement | null;
    if (citationChip) {
      const cid = citationChip.getAttribute('data-citation-id');
      const citation = msg.grounding?.citations?.find((c) => c.citationId === cid);
      if (citation) {
        groundedCallbacks?.onCitationActivate?.(citation);
        return;
      }
    }

    const copyBtn = target.closest('.code-copy-btn');
    if (copyBtn) {
      const wrapper = copyBtn.closest('.code-block-wrapper');
      const codeEl = wrapper?.querySelector('code');
      if (codeEl) {
        navigator.clipboard.writeText(codeEl.innerText).then(() => {
          copyBtn.textContent = 'Copied!';
          setTimeout(() => {
            copyBtn.textContent = 'Copy';
          }, 2000);
        });
      }
    }
  };

  if (!isUser && !isStreaming && msg.wizard && wizardCallbacks) {
    const snapshot = msg.wizard;
    const payload = snapshot.renderPayload;
    const wizardCard = (() => {
      if (snapshot.status === 'gap_fill') {
        return (
          <div style={GapFillQuestionCard.stackStyle}>
            <WizardProgressStrip snapshot={snapshot} />
            <GapFillQuestionCard
              question={{
                id: msg.id,
                topic: payload.title,
                description: msg.content,
                templateSection: payload.title,
                suggestions: [],
                evidenceSources: [],
                answer: null,
                outcome: 'open',
              }}
              onSuggestion={(questionId, suggestion) => wizardCallbacks.onSuggestion?.(msg.id, questionId, suggestion)}
              onSkip={(questionId, outcome) => wizardCallbacks.onSkip?.(msg.id, questionId, outcome)}
            />
          </div>
        );
      }
      if (snapshot.skill === 'SOLUTION' && snapshot.status === 'review' && snapshot.draftRevision !== null) {
        const solution: SolutionReviewPayload = {
          messageId: msg.id,
          version: snapshot.draftRevision,
          title: payload.title,
          featureMode: 'featureMode' in payload ? payload.featureMode : 'new',
          currentSystem: 'currentSystem' in payload ? payload.currentSystem : undefined,
          affectedSurfaces: 'affectedSurfaces' in payload ? payload.affectedSurfaces : undefined,
          markdown: 'markdown' in payload && payload.markdown ? payload.markdown : msg.content,
        };
        return <SolutionReviewCard solution={solution} onSave={() => wizardCallbacks.onSaveSolution?.(msg.id, snapshot.draftRevision)} onRequestEdit={() => wizardCallbacks.onRequestEdit?.(msg.id, snapshot.draftRevision)} onOpenNote={(noteId) => wizardCallbacks.onOpenNote?.(noteId)} />;
      }
      if (snapshot.status === 'review' && snapshot.draftRevision !== null) {
        const preview: DocumentPreviewPayload = {
          messageId: msg.id,
          draftRevision: snapshot.draftRevision,
          skill: snapshot.skill === 'SOLUTION' ? 'PL03' : snapshot.skill,
          title: payload.title,
          metadata: { cr: payload.title, requestingUnit: '', author: '', date: snapshot.createdAt.slice(0, 10) },
          markdown: 'markdown' in payload && payload.markdown ? payload.markdown : msg.content,
          exportedFile: undefined,
          exportError: undefined,
        };
        return <DocumentPreviewCard preview={preview} onApproveExport={() => wizardCallbacks.onApproveExport?.(msg.id, snapshot.draftRevision)} onRequestEdit={() => wizardCallbacks.onRequestEdit?.(msg.id, snapshot.draftRevision)} />;
      }
      return null;
    })();
    if (wizardCard) {
      return <div data-role="assistant" data-testid="wizard-bubble" style={{ width: '100%', marginBottom: 12 }}>{wizardCard}</div>;
    }
  }

  // Branch assistant display on message.grounding payload
  if (!isUser && msg.grounding) {
    const g = msg.grounding;

    // Render friendly markdown answer with inline citation tags instead of bulky technical card
    if (g.answer && (g.answer.conclusion || (g.answer.claims && g.answer.claims.length > 0))) {
      const isAbstention =
        ('confidence' in g.answer && g.answer.confidence === 'unknown') ||
        (typeof g.answer.conclusion === 'string' &&
          /(không tìm thấy|không có thông tin|không có dữ liệu|chưa có thông tin|no relevant information|no evidence found|insufficient evidence)/i.test(
            g.answer.conclusion
          ));

      let formattedConclusion = g.answer.conclusion || '';
      if (isAbstention) {
        formattedConclusion = formattedConclusion.replace(/\[\s*[SL]?\d+\s*\]/gi, '').trim();
      } else {
        formattedConclusion = formattedConclusion.replace(
          /\[\s*([SL]?\d+(?:\s*,\s*[SL]?\d+)+)\s*\]/gi,
          (_match, inner) => inner.split(/\s*,\s*/).map((tag: string) => `[${tag}]`).join(' ')
        );
      }

      // Collect only citations actually referenced by the AI (claims, conclusion, citationReasons)
      const citedIds = new Set<string>();
      if (!isAbstention) {
        (g.answer.claims || []).forEach((c) => {
          (c.citationIds || []).forEach((id) => citedIds.add(id.toUpperCase()));
        });
        const inlineMatches = Array.from((formattedConclusion + ' ' + (msg.content || '')).matchAll(/\[([SL]?\d+)\]/gi));
        inlineMatches.forEach((m) => {
          if (m[1]) citedIds.add(m[1].toUpperCase());
        });
        const answerReasons = (g.answer as any).citationReasons;
        if (answerReasons && typeof answerReasons === 'object') {
          Object.keys(answerReasons).forEach((k) => citedIds.add(k.toUpperCase()));
        }
      }

      // Filter to ONLY cited citations to eliminate irrelevant retrieval clutter
      const citedCitations = isAbstention
        ? []
        : (g.citations || []).filter((c) => {
            const cleanId = c.citationId.toUpperCase();
            const numOnly = cleanId.replace(/^[SL]/, '');
            return (
              citedIds.has(cleanId) ||
              citedIds.has(`S${numOnly}`) ||
              citedIds.has(`L${numOnly}`) ||
              citedIds.has(numOnly)
            );
          });

      const activeCitations = isAbstention
        ? []
        : citedCitations.length > 0
          ? citedCitations
          : (g.citations || []);

      const citationMap = new Map<string, { num: number; isLocal: boolean; citation: PersistedCitation }>();
      activeCitations.forEach((c, idx) => {
        const entry = { num: idx + 1, isLocal: c.authority === 'local', citation: c };
        const cleanId = c.citationId.toUpperCase();
        const numOnly = cleanId.replace(/^[SL]/, '');
        citationMap.set(cleanId, entry);
        citationMap.set(`S${numOnly}`, entry);
        citationMap.set(`L${numOnly}`, entry);
        citationMap.set(numOnly, entry);
        citationMap.set(`S${idx + 1}`, entry);
        citationMap.set(`L${idx + 1}`, entry);
        citationMap.set(String(idx + 1), entry);
      });

      // Format claims with inline citation tags
      const formattedClaims = isAbstention
        ? []
        : (g.answer.claims || []).map((c) => {
            let citedBadges = (c.citationIds || [])
              .map((cid) => {
                const info = citationMap.get(cid.toUpperCase()) || citationMap.get(cid);
                if (!info) return null;
                return info.isLocal ? `[L${info.num}]` : `[${info.num}]`;
              })
              .filter(Boolean);

            const suffix = citedBadges.length > 0 ? ` ${citedBadges.join(' ')}` : '';
            return `${c.text}${suffix}`;
          });

      // Prose is rendered exactly as the model wrote it: no inferred attribution.
      formattedConclusion = formattedConclusion.replace(/\[(S|L)?(\d+)\]/gi, (match, prefix, numStr) => {
        const cleanTag = prefix ? `${prefix.toUpperCase()}${numStr}` : numStr;
        const info = citationMap.get(cleanTag);
        if (info) {
          return info.isLocal ? `[L${info.num}]` : `[${info.num}]`;
        }
        return match;
      });

      const fullText = formattedConclusion || formattedClaims.join('\n\n');
      const chipBg = token.colorPrimaryBg ?? '#e6f4ff';
      const chipBorder = token.colorPrimaryBorder ?? '#91caff';
      const chipColor = token.colorPrimary ?? '#1677ff';

      const applyCitationChips = (html: string) => {
        if (activeCitations.length === 0) return html;
        let res = html.replace(
          /\[\s*([SL]?[0-9]+(?:\s*,\s*[SL]?[0-9]+)+)\s*\]/gi,
          (_match, inner) => inner.split(/\s*,\s*/).map((tag: string) => `[${tag}]`).join(' ')
        );
        res = res.replace(/\[(L?[0-9]+|S[0-9]+)\]/gi, (match, tag) => {
          const cleanTag = tag.toUpperCase();
          const info = citationMap.get(cleanTag) || citationMap.get(tag);
          if (!info) return match;
          const label = info.isLocal ? `L${info.num}` : `${info.num}`;
          const tooltipText = info.citation.relevanceReason
            ? `${info.citation.documentTitle}\n\n💡 Căn cứ: ${info.citation.relevanceReason}`
            : info.citation.documentTitle;
          return `<span class="grounded-inline-chip" data-citation-id="${info.citation.citationId}" style="cursor:pointer;margin:0 2px;padding:0 5px;border-radius:4px;font-weight:600;font-size:11px;line-height:16px;display:inline-flex;align-items:center;vertical-align:baseline;background:${chipBg};border:1px solid ${chipBorder};color:${chipColor};" title="${escapeAttr(tooltipText)}">[${label}]</span>`;
        });
        return res;
      };

      return (
        <div
          data-role={msg.role}
          data-testid="grounded-bubble"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            marginBottom: 12,
            width: '100%',
          }}
        >
          <div
            style={{
              maxWidth: '95%',
              backgroundColor: token.colorFillAlter,
              color: token.colorText,
              borderRadius: '12px 12px 12px 2px',
              border: `1px solid ${token.colorBorderSecondary}`,
              padding: '12px 16px',
              wordBreak: 'break-word',
              fontSize: 14,
              lineHeight: 1.57,
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            }}
          >
            <MarkdownContentRenderer
              content={fullText}
              onMarkdownClick={handleMarkdownClick}
              transformHtml={applyCitationChips}
            />

            {activeCitations.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px dashed ${token.colorBorderSecondary}` }}>
                <span style={{ fontSize: 11, color: token.colorTextSecondary, marginRight: 6 }}>
                  Nguồn tài liệu:
                </span>
                <span
                  style={{
                    display: 'inline-flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  {activeCitations.map((c) => {
                    const isLocal = c.authority === 'local';
                    const cleanId = c.citationId.toUpperCase();
                    const info = citationMap.get(cleanId) || citationMap.get(c.citationId);
                    const num = info ? info.num : 1;
                    const label = isLocal ? `[L${num}]` : `[${num}]`;

                    return (
                      <Tooltip
                        key={c.citationId}
                        title={
                          <div style={{ maxWidth: 360, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            <div style={{ fontWeight: 600 }}>{c.documentTitle || ''}</div>
                            {c.relevanceReason && (
                              <div style={{ marginTop: 4, fontSize: 12 }}>
                                💡 Căn cứ: {c.relevanceReason}
                              </div>
                            )}
                          </div>
                        }
                        zIndex={1500}
                        getPopupContainer={(node) => node.parentElement || document.body}
                      >
                        <Tag
                          style={{
                            cursor: 'pointer',
                            margin: '0 2px',
                            padding: '0 6px',
                            borderRadius: 4,
                            fontWeight: 600,
                            fontSize: 11,
                            lineHeight: '18px',
                            height: 18,
                            maxWidth: 220,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            verticalAlign: 'middle',
                            display: 'inline-block',
                            background: chipBg,
                            borderColor: chipBorder,
                            color: chipColor,
                          }}
                          onClick={() => groundedCallbacks?.onCitationActivate?.(c)}
                          role="button"
                          tabIndex={0}
                          aria-label={`${label} ${c.documentTitle}`}
                        >
                          {`${label} ${c.documentTitle || ''}`.trim()}
                        </Tag>
                      </Tooltip>
                    );
                  })}
                </span>
              </div>
            )}
          </div>

          {/* Footer duration & tokens for grounded knowledge messages */}
          {((!isStreaming && msg.durationMs !== undefined) || (!isStreaming && msg.tokenUsage && (msg.tokenUsage.totalTokens || msg.tokenUsage.completionTokens))) && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 4,
                paddingLeft: 4,
              }}
            >
              {formattedTime && (
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {formattedTime}
                </Text>
              )}
              {msg.durationMs !== undefined && (
                <Tooltip
                  title={`Thời gian tra cứu & phản hồi: ${(msg.durationMs / 1000).toFixed(2)}s`}
                  zIndex={1500}
                  getPopupContainer={(node) => node.parentElement || document.body}
                >
                  <span
                    style={{
                      fontSize: 11,
                      color: token.colorTextQuaternary,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 2,
                      cursor: 'default',
                    }}
                  >
                    ⏱ {(msg.durationMs / 1000).toFixed(1)}s
                  </span>
                </Tooltip>
              )}
              {msg.tokenUsage && (msg.tokenUsage.totalTokens || msg.tokenUsage.completionTokens) && (
                <Tooltip
                  title={`Tổng token: ${(msg.tokenUsage.totalTokens ?? ((msg.tokenUsage.promptTokens || 0) + (msg.tokenUsage.completionTokens || 0))).toLocaleString()} (Vào: ${(msg.tokenUsage.promptTokens || 0).toLocaleString()}, Ra: ${(msg.tokenUsage.completionTokens || 0).toLocaleString()})`}
                  zIndex={1500}
                  getPopupContainer={(node) => node.parentElement || document.body}
                >
                  <span
                    style={{
                      fontSize: 11,
                      color: token.colorTextQuaternary,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 2,
                      cursor: 'default',
                    }}
                  >
                    🪙 {(msg.tokenUsage.totalTokens ?? ((msg.tokenUsage.promptTokens || 0) + (msg.tokenUsage.completionTokens || 0))).toLocaleString()} tokens
                  </span>
                </Tooltip>
              )}
            </div>
          )}
        </div>
      );
    }

    const pathsSlot = g.paths && g.paths.length > 0 ? (
      <GraphPathCard
        paths={g.paths}
        citations={g.citations}
        conflictGroups={g.conflicts ?? []}
        onCitationActivate={(c) => groundedCallbacks?.onCitationActivate?.(c)}
      />
    ) : undefined;

    const sourcesSlot = g.citations && g.citations.length > 0 ? (
      <SourcesPanel
        citations={g.citations}
        onOpenCitation={(c) => groundedCallbacks?.onCitationActivate?.(c)}
      />
    ) : undefined;

    const diagnosticsSlot = g.modalityDiagnostics ? (
      <DiagnosticsPanel
        diagnostics={g.modalityDiagnostics}
        scope={g.scope}
        coverageWarnings={g.coverageWarnings}
        fallbackReason={g.fallbackReason}
        routerSource={g.routerVersion ?? undefined}
        promptVersion={g.promptVersion}
        schemaVersion={g.schemaVersion}
        graphCounts={g.graphCounts}
        stages={g.stageDiagnostics}
        forceOpen={diagnosticsForcedOpen}
      />
    ) : undefined;

    const seedEntities = (g.entities ?? []).slice(0, 5);
    const entitiesSlot =
      seedEntities.length > 0 ? (
        <>
          {seedEntities.map((entity) => (
            <SeedEntityCard
              key={`${entity.snapshotId}:${entity.urn}`}
              entity={entity}
              graphCounts={g.graphCounts ?? { entity: 0, edge: 0, path: 0 }}
              onFindRelated={(selected) =>
                groundedCallbacks?.onFindRelated?.(selected, msg.id)
              }
              isFindingRelated={
                groundedCallbacks?.findingRelatedKey === `${msg.id}:${entity.urn}`
              }
            />
          ))}
        </>
      ) : undefined;

    const candidateChips = (g.citations ?? []).map((c) => ({
      id: c.documentId,
      label: c.documentTitle,
      urn: c.sectionAnchor || c.citedExcerpt || `urn:plannermate:docs:doc:${c.documentId}`,
    }));

    const candidatesSlot = g.outcome === 'NEEDS_CLARIFICATION' ? (
      <CandidateChipList
        items={candidateChips}
        variant="candidate"
        onSelect={(item) => groundedCallbacks?.onCandidateSelect?.(item.urn || item.id)}
      />
    ) : undefined;

    const refinementChips = (g.coverageWarnings ?? []).map((w, idx) => ({
      id: `refine-${idx}`,
      label: w,
    }));

    const refinementsSlot = (g.outcome === 'NO_EVIDENCE' || g.outcome === 'UNSUPPORTED') ? (
      <CandidateChipList
        items={refinementChips.length > 0 ? refinementChips : [
          { id: 'r1', label: 'Thử với tên quy trình khác' },
          { id: 'r2', label: 'Mở rộng phạm vi tìm kiếm' },
        ]}
        variant="refinement"
        onSelect={(item) => groundedCallbacks?.onRefinementSelect?.(item.label)}
      />
    ) : undefined;

    const resultsSlot = (g.outcome === 'LOCAL_FALLBACK_RESULTS' && g.citations && g.citations.length > 0) ? (
      <div style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, opacity: 0.85 }}>
          Tài liệu cục bộ tìm thấy ({g.citations.length})
        </div>
        <SourcesPanel
          citations={g.citations}
          onOpenCitation={(c) => groundedCallbacks?.onCitationActivate?.(c)}
        />
      </div>
    ) : undefined;

    return (
      <div
        data-role="assistant"
        data-testid="grounded-bubble"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          marginBottom: 12,
          width: '100%',
        }}
      >
        <div
          style={{
            maxWidth: '95%',
            backgroundColor: token.colorFillAlter,
            color: token.colorText,
            borderRadius: '12px 12px 12px 2px',
            border: `1px solid ${token.colorBorderSecondary}`,
            padding: '12px 16px',
            wordBreak: 'break-word',
            fontSize: 14,
            lineHeight: 1.57,
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          }}
        >
          {g.outcome === 'MODEL_UNAVAILABLE' ? (
            <EvidenceOnlyCard
              grounding={g}
              onSynthesizeFromStored={() => groundedCallbacks?.onEvidenceOnlySynthesize?.()}
              onCitationActivate={(c) => groundedCallbacks?.onCitationActivate?.(c)}
              isSynthesizing={groundedCallbacks?.synthesizingEvidenceId === g.createdAt}
              synthesisError={
                groundedCallbacks?.evidenceSynthesisError?.id === g.createdAt
                  ? groundedCallbacks.evidenceSynthesisError
                  : null
              }
              onConfigRepair={() => groundedCallbacks?.onConfigRepair?.()}
              sourcesSlot={sourcesSlot}
              pathsSlot={pathsSlot}
            />
          ) : (
            <GroundedAnswerCard
              grounding={g}
              onCitationActivate={(c) => groundedCallbacks?.onCitationActivate?.(c)}
              onCandidateSelect={(urn) => groundedCallbacks?.onCandidateSelect?.(urn)}
              onRefinementSelect={(ref) => groundedCallbacks?.onRefinementSelect?.(ref)}
              onEvidenceOnlySynthesize={() => groundedCallbacks?.onEvidenceOnlySynthesize?.()}
              onInvalidRetry={() => groundedCallbacks?.onInvalidRetry?.()}
              onAuthRepair={() => groundedCallbacks?.onAuthRepair?.()}
              onConfigRepair={() => groundedCallbacks?.onConfigRepair?.()}
              pathsSlot={pathsSlot}
              sourcesSlot={sourcesSlot}
              diagnosticsSlot={diagnosticsSlot}
              candidatesSlot={candidatesSlot}
              refinementsSlot={refinementsSlot}
              resultsSlot={resultsSlot}
              entitiesSlot={entitiesSlot}
              failedSeeds={g.failedSeeds}
              graphCounts={g.graphCounts}
              onOpenDiagnostics={() => setDiagnosticsForcedOpen(true)}
            />
          )}
        </div>

        {/* Duration and Token badges for grounded messages */}
        {((!isStreaming && msg.durationMs !== undefined) || (!isStreaming && msg.tokenUsage && (msg.tokenUsage.totalTokens || msg.tokenUsage.completionTokens))) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 4,
              paddingLeft: 4,
            }}
          >
            {formattedTime && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                {formattedTime}
              </Text>
            )}
            {msg.durationMs !== undefined && (
              <Tooltip
                title={`Thời gian tra cứu & phản hồi: ${(msg.durationMs / 1000).toFixed(2)}s`}
                zIndex={1500}
                getPopupContainer={(node) => node.parentElement || document.body}
              >
                <span
                  style={{
                    fontSize: 11,
                    color: token.colorTextQuaternary,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 2,
                    cursor: 'default',
                  }}
                >
                  ⏱ {(msg.durationMs / 1000).toFixed(1)}s
                </span>
              </Tooltip>
            )}
            {msg.tokenUsage && (msg.tokenUsage.totalTokens || msg.tokenUsage.completionTokens) && (
              <Tooltip
                title={`Tổng token: ${(msg.tokenUsage.totalTokens ?? ((msg.tokenUsage.promptTokens || 0) + (msg.tokenUsage.completionTokens || 0))).toLocaleString()} (Vào: ${(msg.tokenUsage.promptTokens || 0).toLocaleString()}, Ra: ${(msg.tokenUsage.completionTokens || 0).toLocaleString()})`}
                zIndex={1500}
                getPopupContainer={(node) => node.parentElement || document.body}
              >
                <span
                  style={{
                    fontSize: 11,
                    color: token.colorTextQuaternary,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 2,
                    cursor: 'default',
                  }}
                >
                  🪙 {(msg.tokenUsage.totalTokens ?? ((msg.tokenUsage.promptTokens || 0) + (msg.tokenUsage.completionTokens || 0))).toLocaleString()} tokens
                </span>
              </Tooltip>
            )}
          </div>
        )}
      </div>
    );
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopied(true);
      message.success('Đã sao chép nội dung');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      message.error('Không thể sao chép');
    }
  };

  const handleAddToChecklist = async () => {
    if (!onAddToChecklist) return;
    const items = parseChecklistFromText(msg.content);
    if (items.length === 0) {
      // If no bullet points found, use first non-empty paragraph
      const firstLine = msg.content.trim().split('\n')[0]?.trim();
      if (firstLine) {
        await onAddToChecklist([firstLine]);
        setChecklistAdded(true);
      }
    } else {
      await onAddToChecklist(items);
      setChecklistAdded(true);
    }
  };

  const handleSaveStickyNote = async () => {
    if (!onSaveStickyNote) return;
    await onSaveStickyNote(msg.content);
    setNoteSaved(true);
  };

  const hasMarkdownTable = useMemo(() => {
    return /\|.+?\|.+?\|/.test(msg.content);
  }, [msg.content]);

  const handleExportFile = async (format: ExportFormat, directDownload: boolean = false) => {
    try {
      // Derive clean base filename: check first heading (# Title) or fallback to timestamp
      const firstHeadingMatch = msg.content.match(/^#{1,3}\s+(.+)$/m);
      let baseName = '';
      if (firstHeadingMatch && firstHeadingMatch[1]) {
        baseName = firstHeadingMatch[1]
          .trim()
          .replace(/[\\/:*?"<>|#]/g, '')
          .replace(/\s+/g, '-')
          .slice(0, 40);
      }
      if (!baseName) {
        baseName = `${APP_SLUG}-ai-${new Date().toISOString().slice(0, 10)}`;
      }

      if (format === 'pptx') {
        const result = await exportPresentationAsFile(
          msg.content,
          `${baseName}.pptx`,
          undefined,
          false
        );
        if (directDownload) {
          downloadBlob(result.filename, result.blob);
          message.success(`Đã tải xuống ${result.filename} (${result.slideCount} slides)`);
          return;
        }
        const saveRes = await saveFileWithPicker(result.filename, result.blob);
        if (saveRes.saved) {
          message.success(`Đã lưu ${result.filename} (${result.slideCount} slides)`);
        }
        return;
      }

      const result = await exportContentAsFile(msg.content, `${baseName}.${format}`, format, false);
      if (directDownload) {
        downloadBlob(result.filename, result.blob);
        message.success(`Đã tải xuống ${result.filename}`);
        return;
      }
      const saveRes = await saveFileWithPicker(result.filename, result.blob);
      if (saveRes.saved) {
        message.success(`Đã lưu ${result.filename}`);
      }
    } catch (err: unknown) {
      message.error(`Không thể xuất tệp: ${(err as Error)?.message || 'Lỗi không xác định'}`);
    }
  };

  const handleDownloadGeneratedFile = async (file: ChatGeneratedFile, directDownload: boolean = false) => {
    try {
      const format = (file.format as ExportFormat) || inferFormatFromFilename(file.filename);
      let blob: Blob;

      // Extract file content. Never fall back to conversational chat dialogue (msg.content)
      let resolvedContent = file.content?.trim();
      if (!resolvedContent) {
        // Fallback: extract code block contents from message if tool did not capture content directly
        const codeBlockRegex = /```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g;
        const blocks: string[] = [];
        let match: RegExpExecArray | null;
        while ((match = codeBlockRegex.exec(msg.content)) !== null) {
          if (match[1]?.trim()) {
            blocks.push(match[1].trim());
          }
        }
        if (blocks.length > 0) {
          resolvedContent = blocks.join('\n\n');
        }
      }

      if (!resolvedContent) {
        message.error('Không tìm thấy nội dung tệp đã tạo để lưu. Vui lòng yêu cầu AI tạo lại.');
        return;
      }

      if (
        resolvedContent.includes('ExcelJS') ||
        resolvedContent.includes('docx.') ||
        resolvedContent.includes('new docx') ||
        resolvedContent.includes('pptxgen')
      ) {
        blob = await executeDynamicFileScript(resolvedContent, format, file.filename);
      } else if (format === 'pptx') {
        const result = await exportPresentationAsFile(
          resolvedContent,
          file.filename,
          undefined,
          false
        );
        blob = result.blob;
      } else {
        const result = await exportContentAsFile(
          resolvedContent,
          file.filename,
          format,
          false
        );
        blob = result.blob;
      }

      if (directDownload) {
        downloadBlob(file.filename, blob);
        message.success(`Đã tải xuống tệp ${file.filename}`);
        return;
      }

      const saveRes = await saveFileWithPicker(file.filename, blob);
      if (saveRes.saved) {
        message.success(`Đã lưu tệp ${file.filename}`);
      }
    } catch (err: unknown) {
      message.error(`Không thể lưu tệp: ${(err as Error)?.message || 'Lỗi không xác định'}`);
    }
  };

  const buildExportMenuItems = (directDownload: boolean): NonNullable<MenuProps['items']> => {
    const tableHighlightStyle = hasMarkdownTable
      ? { fontWeight: 600, color: token.colorPrimary }
      : undefined;

    return [
      {
        key: `${directDownload ? 'dl' : 'save'}-pptx`,
        icon: <FilePptOutlined style={{ color: '#d24726' }} />,
        label: 'PowerPoint Slides (.pptx)',
        onClick: () => handleExportFile('pptx', directDownload),
      },
      {
        key: `${directDownload ? 'dl' : 'save'}-docx`,
        icon: <FileWordOutlined style={{ color: '#185abd' }} />,
        label: 'Word Document (.docx)',
        onClick: () => handleExportFile('docx', directDownload),
      },
      {
        key: `${directDownload ? 'dl' : 'save'}-xlsx`,
        icon: <FileExcelOutlined style={{ color: '#107c41' }} />,
        label: (
          <span style={tableHighlightStyle}>
            Excel Spreadsheet (.xlsx) {hasMarkdownTable ? '★' : ''}
          </span>
        ),
        onClick: () => handleExportFile('xlsx', directDownload),
      },
      {
        key: `${directDownload ? 'dl' : 'save'}-csv`,
        icon: <FileTextOutlined style={{ color: '#107c41' }} />,
        label: (
          <span style={tableHighlightStyle}>
            CSV Data (.csv) {hasMarkdownTable ? '★' : ''}
          </span>
        ),
        onClick: () => handleExportFile('csv', directDownload),
      },
      {
        type: 'divider',
      },
      {
        key: `${directDownload ? 'dl' : 'save'}-md`,
        icon: <FileMarkdownOutlined style={{ color: '#0969da' }} />,
        label: 'Markdown (.md)',
        onClick: () => handleExportFile('md', directDownload),
      },
      {
        key: `${directDownload ? 'dl' : 'save'}-txt`,
        icon: <FileTextOutlined style={{ color: '#666666' }} />,
        label: 'Văn bản thuần (.txt)',
        onClick: () => handleExportFile('txt', directDownload),
      },
    ];
  };

  const directDownloadMenuItems = useMemo(
    () => buildExportMenuItems(true),
    [hasMarkdownTable, token.colorPrimary, msg.content]
  );

  const saveAsMenuItems = useMemo(
    () => buildExportMenuItems(false),
    [hasMarkdownTable, token.colorPrimary, msg.content]
  );

  return (
    <div
      data-role={msg.role}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 12,
        width: '100%',
      }}
    >
      <div
        style={{
          maxWidth: isUser ? '85%' : '95%',
          backgroundColor: isUser ? token.colorPrimary : token.colorFillAlter,
          color: isUser ? '#ffffff' : token.colorText,
          borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
          border: isUser ? 'none' : `1px solid ${token.colorBorderSecondary}`,
          padding: isUser ? '8px 12px' : '12px 16px',
          wordBreak: 'break-word',
          fontSize: 14,
          lineHeight: 1.57,
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        }}
      >
        {isUser ? (
          <div style={{ whiteSpace: 'pre-wrap' }}>{renderUserMessageWithMentions(msg.content)}</div>
        ) : isStreaming && !msg.content ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
            <Spin
              indicator={<LoadingOutlined style={{ fontSize: 16, color: token.colorPrimary }} spin />}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Text strong style={{ fontSize: 13, color: token.colorText }}>
                {streamingStatus || 'Đang suy nghĩ câu trả lời...'}
              </Text>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {streamingStatus ? `${APP_NAME} AI Harness` : 'Đang xử lý qua 9router...'}
              </Text>
            </div>
          </div>
        ) : (
          <div>
            <MarkdownContentRenderer
              content={msg.content}
              onMarkdownClick={handleMarkdownClick}
            />
            {isStreaming && (
              <span
                style={{
                  display: 'inline-block',
                  color: token.colorPrimary,
                  fontWeight: 'bold',
                  marginLeft: 2,
                  animation: 'blink 1s infinite',
                }}
              >
                ▋
              </span>
            )}
            {isStreaming && (
              <div style={{ marginTop: 8 }}>
                <Tag
                  icon={<SyncOutlined spin />}
                  color="processing"
                  style={{ borderRadius: 10, padding: '2px 8px', fontSize: 11 }}
                >
                  {streamingStatus || 'Đang tạo câu trả lời...'}
                </Tag>
              </div>
            )}
          </div>
        )}
      </div>

      {/* AI-Generated Files Cards */}
      {!isUser && !isStreaming && msg.generatedFiles && msg.generatedFiles.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          {msg.generatedFiles.map((file) => {
            const formatLower = file.format?.toLowerCase() || '';
            const isImage =
              formatLower === 'png' ||
              file.content?.startsWith('data:image/') ||
              (formatLower === 'png' && /^https?:\/\//.test(file.content || ''));
            if (isImage && file.content) {
              return (
                <div
                  key={file.id}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    backgroundColor: token.colorFillAlter,
                  }}
                >
                  <img
                    src={file.content}
                    alt={file.filename}
                    style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 6, display: 'block' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 12 }}>
                    <Text strong ellipsis style={{ fontSize: 13 }}>{file.filename}</Text>
                    <a href={file.content} download={file.filename}>
                      <Button size="small" icon={<DownloadOutlined />} style={{ fontSize: 12, height: 26 }}>
                        Tải về
                      </Button>
                    </a>
                  </div>
                </div>
              );
            }
            let fileIcon = <FileTextOutlined style={{ color: '#107c41', fontSize: 20 }} />;
            if (formatLower.includes('docx') || formatLower.includes('doc')) {
              fileIcon = <FileWordOutlined style={{ color: '#185abd', fontSize: 20 }} />;
            } else if (formatLower.includes('xlsx') || formatLower.includes('xls') || formatLower.includes('csv')) {
              fileIcon = <FileExcelOutlined style={{ color: '#107c41', fontSize: 20 }} />;
            } else if (formatLower.includes('pptx') || formatLower.includes('ppt')) {
              fileIcon = <FilePptOutlined style={{ color: '#d24726', fontSize: 20 }} />;
            } else if (formatLower.includes('md')) {
              fileIcon = <FileMarkdownOutlined style={{ color: '#0969da', fontSize: 20 }} />;
            }

            const formatSize = (bytes: number): string => {
              if (bytes <= 0) return '0 B';
              const k = 1024;
              const sizes = ['B', 'KB', 'MB', 'GB'];
              const i = Math.floor(Math.log(bytes) / Math.log(k));
              return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
            };

            return (
              <div
                key={file.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: `1px solid ${token.colorBorderSecondary}`,
                  backgroundColor: token.colorFillAlter,
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
                  {fileIcon}
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <Text strong ellipsis style={{ fontSize: 13 }}>
                      {file.filename}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {formatSize(file.sizeBytes)}{file.slideCount ? ` · ${file.slideCount} slides` : ''}
                    </Text>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <Button
                    size="small"
                    icon={<DownloadOutlined />}
                    onClick={() => handleDownloadGeneratedFile(file, true)}
                    style={{ fontSize: 12, height: 26 }}
                    title="Tải tệp trực tiếp qua trình duyệt"
                  >
                    Tải về
                  </Button>
                  <Button
                    type="primary"
                    size="small"
                    icon={<FolderOpenOutlined />}
                    onClick={() => handleDownloadGeneratedFile(file, false)}
                    style={{ fontSize: 12, height: 26 }}
                    title="Lưu tệp và chọn thư mục (Save As)"
                  >
                    Lưu tệp...
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Action Chips for Assistant messages per D-18 */}
      {!isUser && !isStreaming && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            marginTop: 6,
            paddingLeft: 4,
          }}
        >
          {canAddToChecklist && onAddToChecklist && (
            <Button
              size="small"
              icon={checklistAdded ? <CheckOutlined style={{ color: token.colorSuccess }} /> : <CheckSquareOutlined />}
              onClick={handleAddToChecklist}
              disabled={checklistAdded}
              style={{ fontSize: 12, height: 24, padding: '0 8px' }}
            >
              {checklistAdded ? 'Đã thêm vào Checklist' : 'Thêm vào Checklist'}
            </Button>
          )}

          {canSaveStickyNote && onSaveStickyNote && (
            <Button
              size="small"
              icon={noteSaved ? <CheckOutlined style={{ color: token.colorSuccess }} /> : <FileAddOutlined />}
              onClick={handleSaveStickyNote}
              disabled={noteSaved}
              style={{ fontSize: 12, height: 24, padding: '0 8px' }}
            >
              {noteSaved ? 'Đã lưu vào Ghi chú' : 'Lưu vào Sticky Notes'}
            </Button>
          )}

          {canRunClaudeCode && onRunClaudeCode && (
            <Button
              size="small"
              icon={<CodeOutlined />}
              onClick={onRunClaudeCode}
              style={{ fontSize: 12, height: 24, padding: '0 8px' }}
            >
              Chạy với Claude Code
            </Button>
          )}

          <Dropdown
            menu={{ items: directDownloadMenuItems }}
            trigger={['click']}
            placement="bottomLeft"
            getPopupContainer={(node) => node.parentElement || document.body}
            overlayStyle={{ zIndex: 1500 }}
          >
            <Button
              size="small"
              icon={<DownloadOutlined />}
              style={{ fontSize: 12, height: 24, padding: '0 8px' }}
              title="Tải toàn bộ văn bản hội thoại chat"
            >
              Xuất đoạn chat
            </Button>
          </Dropdown>

          <Dropdown
            menu={{ items: saveAsMenuItems }}
            trigger={['click']}
            placement="bottomLeft"
            getPopupContainer={(node) => node.parentElement || document.body}
            overlayStyle={{ zIndex: 1500 }}
          >
            <Button
              size="small"
              icon={<FolderOpenOutlined />}
              style={{ fontSize: 12, height: 24, padding: '0 8px' }}
              title="Lưu toàn bộ văn bản hội thoại chat (Save As)"
            >
              Lưu đoạn chat...
            </Button>
          </Dropdown>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 4,
          paddingLeft: isUser ? 0 : 4,
          paddingRight: isUser ? 4 : 0,
        }}
      >
        {formattedTime && (
          <Text type="secondary" style={{ fontSize: 11 }}>
            {formattedTime}
          </Text>
        )}
        {!isUser && !isStreaming && msg.durationMs !== undefined && (
          <Tooltip
            title={`Thời gian chạy phản hồi: ${(msg.durationMs / 1000).toFixed(2)}s`}
            zIndex={1500}
            getPopupContainer={(node) => node.parentElement || document.body}
          >
            <span
              style={{
                fontSize: 11,
                color: token.colorTextQuaternary,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 2,
                cursor: 'default',
              }}
            >
              ⏱ {(msg.durationMs / 1000).toFixed(1)}s
            </span>
          </Tooltip>
        )}
        {!isUser && !isStreaming && msg.tokenUsage && (msg.tokenUsage.totalTokens || msg.tokenUsage.completionTokens) && (
          <Tooltip
            title={`Tổng token: ${(msg.tokenUsage.totalTokens ?? ((msg.tokenUsage.promptTokens || 0) + (msg.tokenUsage.completionTokens || 0))).toLocaleString()} (Vào: ${(msg.tokenUsage.promptTokens || 0).toLocaleString()}, Ra: ${(msg.tokenUsage.completionTokens || 0).toLocaleString()})`}
            zIndex={1500}
            getPopupContainer={(node) => node.parentElement || document.body}
          >
            <span
              style={{
                fontSize: 11,
                color: token.colorTextQuaternary,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 2,
                cursor: 'default',
              }}
            >
              🪙 {(msg.tokenUsage.totalTokens ?? ((msg.tokenUsage.promptTokens || 0) + (msg.tokenUsage.completionTokens || 0))).toLocaleString()} tokens
            </span>
          </Tooltip>
        )}
        {!isUser && (
          <Tooltip
            title={copied ? 'Đã sao chép' : 'Sao chép nội dung'}
            zIndex={1500}
            getPopupContainer={(node) => node.parentElement || document.body}
          >
            <Button
              type="text"
              size="small"
              icon={copied ? <CheckOutlined style={{ color: token.colorSuccess, fontSize: 12 }} /> : <CopyOutlined style={{ fontSize: 12 }} />}
              onClick={handleCopy}
              aria-label="Sao chép nội dung"
              style={{ minHeight: 20, minWidth: 20, padding: 0 }}
            />
          </Tooltip>
        )}
      </div>
    </div>
  );
};
