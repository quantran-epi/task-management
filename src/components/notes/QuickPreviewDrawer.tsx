import React, { useEffect, useRef, useState } from 'react';
import { Modal, Button, Typography, Space, Tag, Empty, Divider, Spin, Tooltip } from 'antd';
import {
  FileTextOutlined,
  ExportOutlined,
  LinkOutlined,
  CheckSquareOutlined,
  ProjectOutlined,
} from '@ant-design/icons';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { Note, Task, Project } from '../../types/models';
import { renderSafeMarkdown } from '../../utils/markdown';
import { getBacklinksForDoc, type BacklinksResult } from '../../db/repositories/documentLinkRepo';
import { computeSha256, normalizeMarkdownForHash } from '../../db/repositories/documentSetRepo';
import { GroundedBanner } from '../ai/grounded/GroundedBanner';
import { TaskDrawer } from '../tasks/TaskDrawer';

const { Title, Text } = Typography;

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
  citationAuthority?: 'server' | 'local' | undefined;
  snapshotAvailable?: boolean | undefined;
}

/**
 * Slide-out document preview reader preserving ongoing task or chat context (D-07, D-13).
 * Renders on the right edge (`width: 480px`, `zIndex: 1300` to sit above AIChatDrawer `1200`).
 * Extended with snapshot-first excerpt, mismatch banner, line-range focus/highlight (D-10, D-47, D-48).
 */
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

  const targetAnchorRef = useRef<HTMLDivElement | null>(null);

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

  // Focus + scroll + highlight on open when lineRange is provided
  useEffect(() => {
    if (!open || !lineRange || !doc) return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setIsReducedMotion(prefersReduced);

    if (targetAnchorRef.current) {
      targetAnchorRef.current.focus({ preventScroll: false });
      targetAnchorRef.current.scrollIntoView({ block: 'center' });
    }

    setIsHighlighted(true);
    const duration = prefersReduced ? 2000 : 1600;
    const timer = setTimeout(() => {
      setIsHighlighted(false);
    }, duration);

    return () => {
      clearTimeout(timer);
    };
  }, [open, lineRange, doc]);

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

  // Split raw excerpt lines for line numbering
  const excerptLines = citedExcerpt ? citedExcerpt.split('\n') : [];
  const startLineNumber = lineRange?.start ?? 1;

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

          {/* 2. Snapshot excerpt panel when citedExcerpt is present (D-47, D-48) */}
          {citedExcerpt && (
            <div
              data-testid="cited-excerpt-panel"
              style={{
                borderRadius: 6,
                border: '1px solid #d9d9d9',
                backgroundColor: '#fafafa',
                overflow: 'hidden',
              }}
            >
              {/* Header */}
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

              {/* Daemon-missing snapshot state banner (D-48) */}
              {!snapshotAvailable && (
                <div style={{ padding: '8px 12px 0 12px' }}>
                  <GroundedBanner variant="snapshot-mismatch" />
                  <div
                    style={{
                      fontSize: 12,
                      color: '#cf1322',
                      fontWeight: 600,
                      marginBottom: 8,
                    }}
                  >
                    Bản chụp không còn khả dụng
                  </div>
                </div>
              )}

              {/* Raw line-numbered pre */}
              <pre
                style={{
                  margin: 0,
                  padding: '8px 12px',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  fontSize: 13,
                  lineHeight: '20px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  overflowX: 'auto',
                }}
              >
                {excerptLines.map((line, idx) => {
                  const lineNum = startLineNumber + idx;
                  return (
                    <div key={idx} style={{ display: 'flex', gap: 12 }}>
                      <span
                        data-testid={`excerpt-line-num-${lineNum}`}
                        style={{
                          width: 32,
                          color: '#8c8c8c',
                          textAlign: 'right',
                          userSelect: 'none',
                          flexShrink: 0,
                        }}
                      >
                        {lineNum}
                      </span>
                      <span style={{ flex: 1 }}>{line || ' '}</span>
                    </div>
                  );
                })}
              </pre>
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

          {/* Target scroll/focus anchor for lineRange */}
          {lineRange && (
            <div
              ref={targetAnchorRef}
              tabIndex={-1}
              data-testid="line-range-anchor"
              aria-label={`Target line ${lineRange.start}`}
              className={
                isHighlighted
                  ? isReducedMotion
                    ? 'gsd-grounded-highlight gsd-static-highlight'
                    : 'gsd-grounded-highlight gsd-fade-highlight'
                  : undefined
              }
              style={{
                outline: 'none',
                padding: '4px 8px',
                borderRadius: 4,
                backgroundColor: isHighlighted ? 'rgba(79, 70, 229, 0.12)' : 'transparent',
                borderLeft: isHighlighted ? '3px solid #4f46e5' : '3px solid transparent',
                transition: isReducedMotion ? 'none' : 'background-color 0.4s ease',
              }}
            >
              <Text type="secondary" style={{ fontSize: 11, fontWeight: 600 }}>
                Dòng {lineRange.start}–{lineRange.end}
              </Text>
            </div>
          )}

          {/* Rendered markdown body */}
          <div
            className="chat-markdown-body quick-preview-markdown"
            dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(doc.body || '') }}
          />

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
