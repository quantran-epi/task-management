import React, { useEffect, useRef, useState } from 'react';
import { Modal, Button, Typography, Space, Tag, Empty, Divider, Spin, Tooltip, Segmented } from 'antd';
import {
  FileTextOutlined,
  ExportOutlined,
  LinkOutlined,
  CheckSquareOutlined,
  ProjectOutlined,
} from '@ant-design/icons';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { Note, Task, Project } from '../../types/models';
import { renderSafeMarkdown, renderInlineFormatting } from '../../utils/markdown';
import { getBacklinksForDoc, type BacklinksResult } from '../../db/repositories/documentLinkRepo';
import { computeSha256, normalizeMarkdownForHash } from '../../db/repositories/documentSetRepo';
import { GroundedBanner } from '../ai/grounded/GroundedBanner';
import { TaskDrawer } from '../tasks/TaskDrawer';

const { Title, Text } = Typography;

export function resolveTargetLineRange(
  body: string,
  lineRange?: { start: number; end: number },
  citedExcerpt?: string
): { start: number; end: number } | null {
  if (!body) {
    return lineRange ? { start: lineRange.start, end: Math.max(lineRange.end, lineRange.start) } : null;
  }

  const bodyLines = body.split(/\r?\n/);
  const totalLines = bodyLines.length;

  if (lineRange && lineRange.start >= 1 && lineRange.start <= totalLines) {
    const end = Math.min(Math.max(lineRange.end, lineRange.start), totalLines);
    return { start: lineRange.start, end };
  }

  if (citedExcerpt && citedExcerpt.trim().length > 0) {
    const excerptLines = citedExcerpt
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (excerptLines.length > 0) {
      const firstSubstantive = excerptLines.find((l) => l.length >= 6) || excerptLines[0]!;
      for (let i = 0; i < bodyLines.length; i++) {
        const bodyLine = bodyLines[i]!.trim();
        if (bodyLine.includes(firstSubstantive) || firstSubstantive.includes(bodyLine)) {
          const start = i + 1;
          const end = Math.min(start + excerptLines.length - 1, totalLines);
          return { start, end };
        }
      }
    }
  }

  return lineRange ? { start: lineRange.start, end: Math.max(lineRange.end, lineRange.start) } : null;
}

export interface QuickPreviewDrawerProps {
  open: boolean;
  docId: string | null;
  onClose: () => void;
  onNavigateToDocs?: ((docId: string) => void) | undefined;
  db?: TaskPlannerDatabase | undefined;

  // Plan 13 extensions (D-10, D-47, D-48, ANSWER-07)
  sectionAnchor?: string | undefined;
  lineRange?: { start: number; end: number } | undefined;
  citedSnapshotId?: string | undefined;
  citedExcerpt?: string | undefined;
  citedContentHash?: string | undefined;
  relevanceReason?: string | undefined;
  citationAuthority?: 'server' | 'local' | undefined;
  snapshotAvailable?: boolean | undefined;
}

/**
 * Slide-out document preview reader preserving ongoing task or chat context (D-07, D-13).
 * Renders on the right edge (`width: 480px`, `zIndex: 1300` to sit above AIChatDrawer `1200`).
 * Extended with snapshot-first excerpt, mismatch banner, line-range focus/highlight (D-10, D-47, D-48).
 */
function highlightTextInElement(container: HTMLElement, phrase: string): boolean {
  if (!phrase || phrase.trim().length < 4) return false;
  const target = phrase.trim();
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const matchedNodes: { node: Text; index: number }[] = [];

  let currentNode: Node | null = walker.nextNode();
  while (currentNode) {
    const textNode = currentNode as Text;
    const parent = textNode.parentElement;
    if (parent && parent.tagName !== 'MARK' && parent.tagName !== 'SCRIPT' && parent.tagName !== 'STYLE') {
      const idx = textNode.nodeValue ? textNode.nodeValue.toLowerCase().indexOf(target.toLowerCase()) : -1;
      if (idx !== -1) {
        matchedNodes.push({ node: textNode, index: idx });
        break; // Match first occurrence
      }
    }
    currentNode = walker.nextNode();
  }

  if (matchedNodes.length === 0) return false;

  for (const { node, index } of matchedNodes) {
    const origText = node.nodeValue || '';
    const matchedText = origText.slice(index, index + target.length);
    const afterText = origText.slice(index + target.length);
    node.nodeValue = origText.slice(0, index);

    const mark = document.createElement('mark');
    mark.className = 'gsd-citation-mark';
    mark.style.cssText = 'background: #ffe58f; color: #000; padding: 2px 4px; border-radius: 3px; border: 1px solid #d48806; font-weight: 500;';
    mark.textContent = matchedText;

    const parent = node.parentNode;
    if (parent) {
      const nextSibling = node.nextSibling;
      parent.insertBefore(mark, nextSibling);
      if (afterText) {
        const textAfter = document.createTextNode(afterText);
        parent.insertBefore(textAfter, mark.nextSibling);
      }
    }
  }

  return true;
}

export const QuickPreviewDrawer: React.FC<QuickPreviewDrawerProps> = ({
  open,
  docId,
  onClose,
  onNavigateToDocs,
  db = defaultDb,
  sectionAnchor: _sectionAnchor,
  lineRange,
  citedSnapshotId,
  citedExcerpt,
  citedContentHash,
  relevanceReason,
  citationAuthority,
  snapshotAvailable = true,
}) => {
  const [doc, setDoc] = useState<Note | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [backlinks, setBacklinks] = useState<BacklinksResult>({
    tasks: [],
    projects: [],
    referencingNotes: [],
  });
  const [hashMismatch, setHashMismatch] = useState<boolean>(false);
  const [isHighlighted, setIsHighlighted] = useState<boolean>(false);
  const [isReducedMotion, setIsReducedMotion] = useState<boolean>(false);
  const [linkedParentTask, setLinkedParentTask] = useState<Task | null>(null);
  const [linkedParentProject, setLinkedParentProject] = useState<Project | null>(null);
  const [activeDrawerTaskId, setActiveDrawerTaskId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'lines' | 'markdown'>('lines');

  const targetAnchorRef = useRef<HTMLDivElement | null>(null);
  const targetLineRef = useRef<HTMLDivElement | null>(null);
  const markdownContainerRef = useRef<HTMLDivElement | null>(null);

  const effectiveAuthority =
    citationAuthority ??
    (citedSnapshotId || citedExcerpt || citedContentHash ? 'server' : 'local');

  useEffect(() => {
    let active = true;
    if (!open || !docId) {
      setDoc(null);
      setBacklinks({ tasks: [], projects: [], referencingNotes: [] });
      setLinkedParentTask(null);
      setLinkedParentProject(null);
      setHashMismatch(false);
      setIsHighlighted(false);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    void Promise.all([
      db.notes.get(docId),
      getBacklinksForDoc(docId, db),
    ])
      .then(async ([noteData, backlinksData]) => {
        if (!active) return;
        setDoc(noteData || null);
        setBacklinks(backlinksData);

        // Fetch direct parent entity if note belongs to task or project
        if (noteData?.entityType === 'task' && noteData.entityId) {
          const t = await db.tasks.get(noteData.entityId);
          if (active) setLinkedParentTask(t || null);
        } else {
          if (active) setLinkedParentTask(null);
        }

        if (noteData?.entityType === 'project' && noteData.entityId) {
          const p = await db.projects.get(noteData.entityId);
          if (active) setLinkedParentProject(p || null);
        } else {
          if (active) setLinkedParentProject(null);
        }

        // Check hash mismatch only for server authority when citedContentHash is present (D-10, D-21)
        if (effectiveAuthority === 'server' && citedContentHash && noteData?.body !== undefined) {
          try {
            const currentHash = await computeSha256(normalizeMarkdownForHash(noteData.body));
            if (active) {
              setHashMismatch(currentHash !== citedContentHash);
            }
          } catch (err) {
            console.error('[QuickPreviewDrawer] Hash check failed:', err);
          }
        } else {
          setHashMismatch(false);
        }
      })
      .catch((err) => {
        console.error('[QuickPreviewDrawer] Failed to load document:', err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [db, docId, open, effectiveAuthority, citedContentHash]);

  const targetRange = doc ? resolveTargetLineRange(doc.body || '', lineRange, citedExcerpt) : null;
  const lines = React.useMemo(() => (doc?.body ? doc.body.split(/\r?\n/) : []), [doc?.body]);

  // Focus + scroll + highlight on open when targetRange is resolved
  useEffect(() => {
    if (!open || !doc) return;

    const resolved = resolveTargetLineRange(doc.body || '', lineRange, citedExcerpt);
    if (!resolved) return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setIsReducedMotion(prefersReduced);

    if (targetAnchorRef.current) {
      targetAnchorRef.current.focus({ preventScroll: false });
    }

    const container = markdownContainerRef.current;
    if (container) {
      // 1. Clear previous highlights
      const prevHighlighted = container.querySelectorAll('.gsd-citation-highlight-block');
      prevHighlighted.forEach((el) => el.classList.remove('gsd-citation-highlight-block'));

      // 2. Query all elements with line data attributes
      const candidates = Array.from(container.querySelectorAll<HTMLElement>('[data-line-start]'));
      let firstMatchedEl: HTMLElement | null = null;

      for (const el of candidates) {
        const lineStart = parseInt(el.getAttribute('data-line-start') || '0', 10);
        const lineEnd = parseInt(el.getAttribute('data-line-end') || String(lineStart), 10);

        if (lineStart <= resolved.end && lineEnd >= resolved.start) {
          el.classList.add('gsd-citation-highlight-block');
          if (!firstMatchedEl) {
            firstMatchedEl = el;
          }
        }
      }

      // 3. Highlight substantive candidate phrases from citedExcerpt inside container
      if (citedExcerpt) {
        const rawLines = citedExcerpt
          .replace(/\r\n/g, '\n')
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.length >= 6);

        const candidatePhrases: string[] = [];
        for (const line of rawLines) {
          candidatePhrases.push(line);
          const stripped = line
            .replace(/^#{1,6}\s+/, '')
            .replace(/^[-*•]\s+(\[[ xX]\]\s+)?/, '')
            .replace(/^\|\s*/, '')
            .replace(/\s*\|$/, '')
            .replace(/[*`_~]/g, '')
            .trim();
          if (stripped.length >= 6 && stripped !== line) {
            candidatePhrases.push(stripped);
          }
          if (line.includes('|')) {
            const cells = line
              .split('|')
              .map((c) => c.replace(/[*`_~]/g, '').trim())
              .filter((c) => c.length >= 6 && !/^[-\s:]+$/.test(c));
            candidatePhrases.push(...cells);
          }
        }

        const uniqueCandidates = Array.from(new Set(candidatePhrases))
          .filter((p) => p.length >= 6)
          .sort((a, b) => b.length - a.length);

        for (const phrase of uniqueCandidates) {
          highlightTextInElement(container, phrase);
        }
      }

      // 4. Scroll to first highlighted DOM block or mark
      const firstMark = container.querySelector('mark.gsd-citation-mark') as HTMLElement | null;
      const targetEl = targetLineRef.current || firstMark || firstMatchedEl || targetAnchorRef.current;
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'center' });
      }
    } else if (targetLineRef.current) {
      targetLineRef.current.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'center' });
    }

    setIsHighlighted(true);
    const duration = prefersReduced ? 2000 : 1600;
    const timer = setTimeout(() => {
      setIsHighlighted(false);
    }, duration);

    return () => {
      clearTimeout(timer);
    };
  }, [open, lineRange, citedExcerpt, doc]);

  const handleOpenInDocs = () => {
    if (!docId) return;
    if (onNavigateToDocs) {
      onNavigateToDocs(docId);
    } else {
      window.location.hash = `#/notes?doc=${encodeURIComponent(docId)}`;
    }
    onClose();
  };

  const hasBacklinks =
    backlinks.tasks.length > 0 ||
    backlinks.projects.length > 0 ||
    backlinks.referencingNotes.length > 0;

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 24, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <FileTextOutlined style={{ color: '#1677ff', flexShrink: 0 }} />
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 'calc(92vw - 240px)',
                fontWeight: 600,
              }}
            >
              {doc?.title || 'Xem nhanh tài liệu'}
            </span>
          </div>
          <Space size="small">
            <Button
              type="primary"
              size="small"
              icon={<ExportOutlined />}
              onClick={handleOpenInDocs}
              disabled={!doc}
            >
              Mở trong Docs
            </Button>
          </Space>
        </div>
      }
      width="min(1240px, 94vw)"
      style={{ top: 20, maxWidth: '96vw' }}
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnClose
      styles={{
        body: { maxHeight: 'calc(85vh - 110px)', overflowY: 'auto', padding: '16px 24px' },
      }}
      zIndex={1300}
    >
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
          <Spin tip="Đang tải tài liệu..." />
        </div>
      ) : !doc ? (
        <Empty description="Không tìm thấy tài liệu hoặc đã bị xóa" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 1. Snapshot-mismatch banner when currentHash !== citedContentHash (D-10) */}
          {hashMismatch && (
            <div data-testid="snapshot-mismatch-banner">
              <GroundedBanner variant="snapshot-mismatch" />
            </div>
          )}

          {/* 2. Relevance Reason & Citation Meta (NO bulky raw excerpt code box) */}
          {(relevanceReason || citedExcerpt || citedSnapshotId) && (
            <div
              data-testid="cited-excerpt-panel"
              style={{
                borderRadius: 8,
                border: '1px solid #d9d9d9',
                backgroundColor: '#fafafa',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 12px',
                  backgroundColor: '#f0f0f0',
                  borderBottom: '1px solid #d9d9d9',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                <span>
                  {effectiveAuthority === 'server' ? 'Trích dẫn từ bản chụp' : 'Trích dẫn cục bộ'}
                </span>
                {effectiveAuthority === 'server' && citedSnapshotId && (
                  <Tooltip title={citedSnapshotId}>
                    <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace' }}>
                      {citedSnapshotId.slice(0, 7)}…
                    </Text>
                  </Tooltip>
                )}
              </div>

              {/* Relevance reason banner */}
              <div
                data-testid="citation-relevance-summary"
                style={{
                  padding: '10px 14px',
                  backgroundColor: '#e6f4ff',
                  borderBottom: !snapshotAvailable ? '1px solid #91caff' : 'none',
                  fontSize: 13,
                  color: '#0958d9',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  lineHeight: 1.5,
                }}
              >
                <span style={{ fontWeight: 600, flexShrink: 0 }}>💡 Căn cứ trích dẫn:</span>
                <span style={{ flex: 1 }}>{relevanceReason || 'Đoạn văn bản được trích xuất làm căn cứ đối chiếu cho câu trả lời của trợ lý AI.'}</span>
              </div>

              {/* Daemon-missing snapshot state banner (D-48) */}
              {!snapshotAvailable && (
                <div style={{ padding: '8px 12px' }}>
                  <GroundedBanner variant="snapshot-mismatch" />
                  <div
                    style={{
                      fontSize: 12,
                      color: '#cf1322',
                      fontWeight: 600,
                      marginTop: 4,
                    }}
                  >
                    Bản chụp không còn khả dụng
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 3. Header metadata */}
          <div>
            <Title level={4} style={{ marginTop: 0, marginBottom: 8 }}>
              {doc.title || 'Untitled Document'}
            </Title>
            <Space size={[4, 6]} wrap>
              {/* Parent linked entity badge */}
              {linkedParentTask && (
                <Tag
                  color="blue"
                  icon={<CheckSquareOutlined />}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setActiveDrawerTaskId(linkedParentTask.id)}
                >
                  Tác vụ: {linkedParentTask.name}
                  {linkedParentTask.jiraKey ? ` (${linkedParentTask.jiraKey})` : ''}
                </Tag>
              )}
              {linkedParentProject && (
                <Tag color="purple" icon={<ProjectOutlined />}>
                  Dự án: {linkedParentProject.name}
                </Tag>
              )}
              {doc.tags?.map((tag) => (
                <Tag key={tag} color="blue">
                  {tag}
                </Tag>
              ))}
              {doc.updatedAt && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Cập nhật: {new Date(doc.updatedAt).toLocaleDateString()}
                </Text>
              )}
            </Space>
          </div>

          <Divider style={{ margin: '8px 0' }} />

          {/* Target scroll/focus anchor for targetRange */}
          {targetRange && (
            <div
              ref={targetAnchorRef}
              tabIndex={-1}
              data-testid="line-range-anchor"
              aria-label={`Target line ${targetRange.start}`}
              className={
                isHighlighted
                  ? isReducedMotion
                    ? 'gsd-grounded-highlight gsd-static-highlight'
                    : 'gsd-grounded-highlight gsd-fade-highlight'
                  : undefined
              }
              style={{
                outline: 'none',
                padding: '6px 12px',
                borderRadius: 6,
                backgroundColor: isHighlighted ? 'rgba(250, 173, 20, 0.15)' : 'rgba(0, 0, 0, 0.02)',
                borderLeft: '4px solid #faad14',
                transition: isReducedMotion ? 'none' : 'background-color 0.4s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: 600, color: '#d48806' }}>
                📍 Vị trí trích dẫn: Dòng {targetRange.start}–{targetRange.end}
              </Text>
            </div>
          )}

          {/* View mode switcher */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#595959' }}>
              Nội dung tài liệu ({lines.length} dòng):
            </span>
            <Segmented
              size="small"
              options={[
                { label: `Kèm số dòng (1–${lines.length})`, value: 'lines' },
                { label: 'Định dạng Markdown', value: 'markdown' },
              ]}
              value={viewMode}
              onChange={(val) => setViewMode(val as 'lines' | 'markdown')}
            />
          </div>

          {viewMode === 'lines' ? (
            <div
              ref={markdownContainerRef}
              data-testid="quick-preview-lines-container"
              className="quick-preview-lines-container"
              style={{
                borderRadius: 6,
                border: '1px solid #d9d9d9',
                backgroundColor: '#ffffff',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                fontSize: 13,
                lineHeight: '22px',
                overflowX: 'auto',
                maxHeight: 'calc(85vh - 260px)',
                overflowY: 'auto',
              }}
            >
              {lines.map((line, idx) => {
                const lineNum = idx + 1;
                const isLineHighlighted =
                  targetRange && lineNum >= targetRange.start && lineNum <= targetRange.end;

                const headingH1 = line.match(/^#\s+(.*)$/);
                const headingH2 = line.match(/^##\s+(.*)$/);
                const headingH3 = line.match(/^###\s+(.*)$/);

                return (
                  <div
                    key={lineNum}
                    ref={isLineHighlighted && lineNum === targetRange.start ? targetLineRef : undefined}
                    data-line-start={lineNum}
                    data-line-end={lineNum}
                    data-testid={`document-line-row-${lineNum}`}
                    className={
                      isLineHighlighted
                        ? 'gsd-line-row gsd-citation-highlight-block gsd-citation-highlight-line'
                        : 'gsd-line-row'
                    }
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      backgroundColor: isLineHighlighted ? 'rgba(255, 229, 143, 0.45)' : 'transparent',
                      borderLeft: isLineHighlighted ? '4px solid #faad14' : '4px solid transparent',
                    }}
                  >
                    <span
                      data-testid={`document-line-num-${lineNum}`}
                      className="gsd-line-number"
                      style={{
                        width: 44,
                        color: isLineHighlighted ? '#d48806' : '#8c8c8c',
                        fontWeight: isLineHighlighted ? 700 : 400,
                        textAlign: 'right',
                        paddingRight: 10,
                        userSelect: 'none',
                        flexShrink: 0,
                        borderRight: isLineHighlighted ? '2px solid #faad14' : '1px solid #f0f0f0',
                        background: isLineHighlighted ? 'rgba(250, 173, 20, 0.12)' : '#fafafa',
                      }}
                    >
                      {lineNum}
                    </span>
                    <span
                      style={{
                        paddingLeft: 12,
                        paddingRight: 12,
                        flex: 1,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {headingH1 ? (
                        <h1
                          style={{ margin: 0, fontSize: 16, fontWeight: 700 }}
                          dangerouslySetInnerHTML={{ __html: renderInlineFormatting(headingH1[1] || '') }}
                        />
                      ) : headingH2 ? (
                        <h2
                          style={{ margin: 0, fontSize: 15, fontWeight: 600 }}
                          dangerouslySetInnerHTML={{ __html: renderInlineFormatting(headingH2[1] || '') }}
                        />
                      ) : headingH3 ? (
                        <h3
                          style={{ margin: 0, fontSize: 14, fontWeight: 600 }}
                          dangerouslySetInnerHTML={{ __html: renderInlineFormatting(headingH3[1] || '') }}
                        />
                      ) : (
                        <span dangerouslySetInnerHTML={{ __html: renderInlineFormatting(line || ' ') }} />
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div
              ref={markdownContainerRef}
              className="chat-markdown-body quick-preview-markdown"
              dangerouslySetInnerHTML={{
                __html: renderSafeMarkdown(doc.body || '', { sourceLines: true }),
              }}
            />
          )}

          <style>{`
            .quick-preview-markdown .gsd-citation-highlight-block,
            .quick-preview-lines-container .gsd-citation-highlight-block {
              background-color: rgba(255, 229, 143, 0.45) !important;
              border-left: 4px solid #faad14 !important;
              border-radius: 4px;
              padding-left: 10px !important;
              padding-right: 10px !important;
              margin-top: 2px;
              margin-bottom: 2px;
              box-shadow: 0 0 0 1px rgba(250, 173, 20, 0.35);
              transition: background-color 0.4s ease;
            }
          `}</style>

          {/* Backlinks Section */}
          {hasBacklinks && (
            <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 10,
                  fontWeight: 600,
                  fontSize: 13,
                  color: '#595959',
                }}
              >
                <LinkOutlined />
                <span>
                  Liên kết đến tài liệu này (
                  {backlinks.tasks.length + backlinks.projects.length + backlinks.referencingNotes.length}
                  )
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {backlinks.tasks.map((task: Task) => (
                  <div
                    key={`task-backlink-${task.id}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setActiveDrawerTaskId(task.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 12,
                      padding: '4px 8px',
                      backgroundColor: '#f5f5f5',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                  >
                    <CheckSquareOutlined style={{ color: '#1677ff' }} />
                    <span style={{ fontWeight: 500, color: '#1677ff' }}>{task.name}</span>
                    {task.jiraKey && (
                      <Tag color="blue" style={{ fontSize: 10, margin: 0, padding: '0 4px' }}>
                        {task.jiraKey}
                      </Tag>
                    )}
                  </div>
                ))}

                {backlinks.projects.map((proj: Project) => (
                  <div
                    key={`proj-backlink-${proj.id}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 12,
                      padding: '4px 8px',
                      backgroundColor: '#f5f5f5',
                      borderRadius: 4,
                    }}
                  >
                    <ProjectOutlined style={{ color: '#722ed1' }} />
                    <span style={{ fontWeight: 500 }}>{proj.name}</span>
                  </div>
                ))}

                {backlinks.referencingNotes.map((refDoc: Note) => (
                  <div
                    key={`doc-backlink-${refDoc.id}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 12,
                      padding: '4px 8px',
                      backgroundColor: '#f5f5f5',
                      borderRadius: 4,
                    }}
                  >
                    <FileTextOutlined style={{ color: '#52c41a' }} />
                    <span style={{ fontWeight: 500 }}>{refDoc.title || 'Untitled Note'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Task Drawer to inspect linked task details */}
      <TaskDrawer
        open={Boolean(activeDrawerTaskId)}
        taskId={activeDrawerTaskId}
        onClose={() => setActiveDrawerTaskId(null)}
        db={db}
      />
    </Modal>
  );
};
