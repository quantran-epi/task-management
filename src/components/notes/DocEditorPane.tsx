import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Alert,
  Button,
  Input,
  Radio,
  Space,
  Tag,
  Tooltip,
  Typography,
  message,
  Popconfirm,
  Dropdown,
} from 'antd';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import {
  EditOutlined,
  EyeOutlined,
  SplitCellsOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  RobotOutlined,
  DeleteOutlined,
  CloudSyncOutlined,
  FileTextOutlined,
  CheckSquareOutlined,
  FolderOutlined,
  UndoOutlined,
  DownloadOutlined,
  FilePptOutlined,
  FileWordOutlined,
  FileMarkdownOutlined,
} from '@ant-design/icons';
import type { Note } from '../../types/models';
import type { DocumentPublishStatus } from '../../db/repositories/documentSetRepo';
import { renderSafeMarkdown } from '../../utils/markdown';
import { extractMarkdownMetadata, detectReferencedEntities, isPlaceholderTitle, type DetectedEntity } from '../../utils/smartIngestion';
import { SmartIngestionBanner } from './SmartIngestionBanner';
import { DocOutlineToC } from './DocOutlineToC';
import { BacklinksSection } from './BacklinksSection';
import { getBacklinksForDoc, linkEntitiesToDoc, type BacklinksResult } from '../../db/repositories/documentLinkRepo';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { useAIChat } from '../../context/AIChatContext';
import { TaskDrawer } from '../tasks/TaskDrawer';
import { exportPresentationAsFile } from '../../utils/pptxExport';
import { exportContentAsFile } from '../../utils/fileExport';
import { NormalizeDocModal } from './NormalizeDocModal';
import { DocPublishBadge } from '../knowledge/DocPublishBadge';

const { Text, Title } = Typography;

export type EditorViewMode = 'edit' | 'preview' | 'split';

const TOC_PREF_KEY = 'planner:docs_toc_visible';

export interface DocEditorPaneProps {
  doc: Note | null;
  onUpdateDoc: (id: string, updates: Partial<Note>) => Promise<void> | void;
  onDeleteDoc?: (doc: Note) => void;
  onRestoreDoc?: (doc: Note) => void;
  onSelectDoc?: (docId: string) => void;
  onOpenTask?: (taskId: string) => void;
  onOpenProject?: (projectId: string) => void;
  db?: TaskPlannerDatabase;
  publishStatus?: DocumentPublishStatus | undefined;
  compactPublishBadge?: boolean | undefined;
}

export const DocEditorPane: React.FC<DocEditorPaneProps> = ({
  doc,
  onUpdateDoc,
  onDeleteDoc,
  onRestoreDoc,
  onSelectDoc,
  onOpenTask,
  onOpenProject,
  db = defaultDb,
  publishStatus,
  compactPublishBadge,
}) => {
  const [viewMode, setViewMode] = useState<EditorViewMode>('split');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<string>('');
  const [detectedEntities, setDetectedEntities] = useState<DetectedEntity[]>([]);
  const [backlinks, setBacklinks] = useState<BacklinksResult>({ tasks: [], projects: [], referencingNotes: [] });
  const [isNormalizeModalOpen, setIsNormalizeModalOpen] = useState(false);
  const [showToC, setShowToC] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(TOC_PREF_KEY);
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const toggleToC = () => {
    setShowToC((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(TOC_PREF_KEY, String(next));
      } catch {}
      return next;
    });
  };

  const hasHeadings = useMemo(() => {
    if (!body) return false;
    return /(^|\r?\n)#{1,3}\s+\S+/m.test(body);
  }, [body]);

  // Wiki-link autocomplete popup state
  interface CandidateItem {
    id: string;
    title: string;
    type: 'doc' | 'task' | 'project';
  }
  const [isAutoCompleteOpen, setIsAutoCompleteOpen] = useState(false);
  const [autoCompleteQuery, setAutoCompleteQuery] = useState('');
  const [triggerStartIndex, setTriggerStartIndex] = useState<number>(-1);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [localDrawerTaskId, setLocalDrawerTaskId] = useState<string | undefined>(undefined);
  const lastQueryRef = useRef<string | null>(null);

  // Ref tracking latest title, body, and tags to eliminate stale closure bugs during async operations
  const latestValuesRef = useRef({ title, body, tags });
  latestValuesRef.current = { title, body, tags };

  // Tracks if user explicitly edited title input; if false or placeholder, first `# Heading` auto-populates title
  const isTitleManuallyEditedRef = useRef(false);

  const textareaRef = useRef<TextAreaRef | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const aiChat = useAIChat();

  // Load active doc data
  useEffect(() => {
    if (!doc) {
      setTitle('');
      setBody('');
      setTags([]);
      setDetectedEntities([]);
      setBacklinks({ tasks: [], projects: [], referencingNotes: [] });
      setSaveStatus('');
      isTitleManuallyEditedRef.current = false;
      return;
    }

    const currentDocTitle = doc.title || '';
    setTitle(currentDocTitle);
    setBody(doc.body || '');
    setTags(doc.tags || []);
    setDetectedEntities([]);
    isTitleManuallyEditedRef.current = !isPlaceholderTitle(currentDocTitle);
    setSaveStatus(`Đã lưu lúc ${new Date(doc.updatedAt).toLocaleTimeString('vi-VN')}`);

    // Load backlinks
    getBacklinksForDoc(doc.id, db)
      .then((res) => setBacklinks(res))
      .catch((err) => console.warn('Failed to load backlinks:', err));
  }, [doc?.id, db]);

  // Debounced auto-save (500ms)
  const triggerAutoSave = useCallback(
    (newTitle: string, newBody: string, newTags: string[]) => {
      if (!doc) return;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      setSaveStatus('Đang lưu...');
      debounceTimerRef.current = setTimeout(async () => {
        try {
          await onUpdateDoc(doc.id, {
            title: newTitle,
            body: newBody,
            tags: newTags,
          });
          const timeStr = new Date().toLocaleTimeString('vi-VN');
          setSaveStatus(`Đã lưu lúc ${timeStr}`);
        } catch {
          setSaveStatus('Lỗi lưu tự động');
        }
      }, 500);
    },
    [doc?.id, onUpdateDoc]
  );

  // Query candidates from IndexedDB matching query text
  const fetchWikiCandidates = useCallback(
    async (query: string) => {
      const q = query.trim().toLowerCase();
      try {
        const [rawNotes, rawTasks, rawProjects] = await Promise.all([
          db.notes.toArray(),
          db.tasks.toArray(),
          db.projects.toArray(),
        ]);

        const noteCandidates: CandidateItem[] = rawNotes
          .filter((n) => !n.deletedAt && n.id !== doc?.id && (n.title || 'Không có tiêu đề').toLowerCase().includes(q))
          .map((n) => ({
            id: n.id,
            title: n.title || 'Không có tiêu đề',
            type: 'doc' as const,
          }));

        const taskCandidates: CandidateItem[] = rawTasks
          .filter((t) => (t.name || '').toLowerCase().includes(q))
          .map((t) => ({
            id: t.id,
            title: t.name || 'Không có tiêu đề',
            type: 'task' as const,
          }));

        const projectCandidates: CandidateItem[] = rawProjects
          .filter((p) => (p.name || '').toLowerCase().includes(q))
          .map((p) => ({
            id: p.id,
            title: p.name || 'Không có tiêu đề',
            type: 'project' as const,
          }));

        const combined = [...noteCandidates, ...taskCandidates, ...projectCandidates].slice(0, 8);
        setCandidates(combined);
        setSelectedIndex(0);
        setIsAutoCompleteOpen(combined.length > 0);
      } catch (err) {
        console.warn('Failed to query wiki candidates:', err);
        setCandidates([]);
        setIsAutoCompleteOpen(false);
      }
    },
    [db, doc?.id]
  );

  // Detect [[ trigger pattern from text up to cursor position
  const checkForWikiTrigger = (text: string, cursorPos: number) => {
    const textBeforeCursor = text.slice(0, cursorPos);
    // Matches [[ followed by zero or more non-bracket characters up to cursor, on the same line
    const match = /(?:^|[^\\])\[\[([^\]\r\n]*)$/.exec(textBeforeCursor);
    if (match && match[1] !== undefined) {
      const query = match[1];
      const matchIndex = textBeforeCursor.lastIndexOf('[[');
      setTriggerStartIndex(matchIndex);
      setAutoCompleteQuery(query);
      if (lastQueryRef.current !== query) {
        lastQueryRef.current = query;
        fetchWikiCandidates(query);
      }
    } else {
      setIsAutoCompleteOpen(false);
      setTriggerStartIndex(-1);
      setAutoCompleteQuery('');
      lastQueryRef.current = null;
    }
  };

  const handleTitleChange = (val: string) => {
    isTitleManuallyEditedRef.current = !isPlaceholderTitle(val);
    setTitle(val);
    latestValuesRef.current.title = val;
    triggerAutoSave(val, latestValuesRef.current.body, latestValuesRef.current.tags);
  };

  const handleBodyChange = (val: string, cursorPos?: number) => {
    setBody(val);
    latestValuesRef.current.body = val;

    let currentTitle = latestValuesRef.current.title;
    // Auto-detect title from first H1 (# Heading) if title is placeholder/empty or not manually set
    if (!isTitleManuallyEditedRef.current || isPlaceholderTitle(currentTitle)) {
      const extracted = extractMarkdownMetadata(val);
      if (extracted.title && extracted.title !== currentTitle) {
        currentTitle = extracted.title;
        setTitle(currentTitle);
        latestValuesRef.current.title = currentTitle;
      }
    }

    triggerAutoSave(currentTitle, val, latestValuesRef.current.tags);

    const pos = cursorPos !== undefined ? cursorPos : textareaRef.current?.resizableTextArea?.textArea?.selectionStart ?? val.length;
    checkForWikiTrigger(val, pos);
  };

  // Handle item selection in wiki-link autocomplete
  const handleSelectCandidate = async (item: CandidateItem) => {
    const currentBody = latestValuesRef.current.body;
    const startIndex = triggerStartIndex >= 0 ? triggerStartIndex : currentBody.lastIndexOf('[[');
    if (startIndex < 0) return;

    // Pattern: replace [[query with [[type:id|Title]]
    const beforeTrigger = currentBody.slice(0, startIndex);
    const triggerAndAfter = currentBody.slice(startIndex);
    const endMatch = /^\[\[[^\]\r\n]*/.exec(triggerAndAfter);
    const matchLen = endMatch ? endMatch[0].length : 2 + autoCompleteQuery.length;
    const afterTrigger = currentBody.slice(startIndex + matchLen);

    const chip = `[[${item.type}:${item.id}|${item.title}]]`;
    const newBody = `${beforeTrigger}${chip}${afterTrigger}`;
    const newCursorPos = startIndex + chip.length;

    setBody(newBody);
    latestValuesRef.current.body = newBody;
    setIsAutoCompleteOpen(false);
    setCandidates([]);
    setTriggerStartIndex(-1);
    setAutoCompleteQuery('');
    lastQueryRef.current = null;

    triggerAutoSave(latestValuesRef.current.title, newBody, latestValuesRef.current.tags);

    // Restore textarea focus and cursor position
    setTimeout(() => {
      const nativeEl = textareaRef.current?.resizableTextArea?.textArea;
      if (nativeEl) {
        nativeEl.focus();
        nativeEl.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);

    // Persist bidirectional link to the referenced entity (task, project, doc)
    if (doc) {
      try {
        await linkEntitiesToDoc(
          doc.id,
          latestValuesRef.current.title || 'Tài liệu',
          [{ id: item.id, type: item.type, title: item.title }],
          db,
          { skipDocBodyUpdate: true }
        );
        const res = await getBacklinksForDoc(doc.id, db);
        setBacklinks(res);
        message.success(`Đã liên kết với ${item.title}`);
      } catch (err) {
        console.warn('Failed to link entity:', err);
      }
    }
  };

  // Keyboard navigation for autocomplete popup
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!isAutoCompleteOpen || candidates.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % candidates.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + candidates.length) % candidates.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const selected = candidates[selectedIndex];
      if (selected) {
        handleSelectCandidate(selected);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsAutoCompleteOpen(false);
      lastQueryRef.current = null;
    }
  };

  // Handle paste for smart ingestion
  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedText = e.clipboardData.getData('text');
    if (!pastedText) return;

    // 1. Metadata extraction if doc is untitled or has placeholder title
    const metadata = extractMarkdownMetadata(pastedText);
    let nextTitle = latestValuesRef.current.title;
    let nextTags = [...latestValuesRef.current.tags];
    let metadataChanged = false;

    if ((isPlaceholderTitle(nextTitle) || !isTitleManuallyEditedRef.current) && metadata.title) {
      nextTitle = metadata.title;
      setTitle(nextTitle);
      latestValuesRef.current.title = nextTitle;
      metadataChanged = true;
    }

    if (metadata.tags.length > 0) {
      const merged = Array.from(new Set([...nextTags, ...metadata.tags]));
      if (merged.length !== nextTags.length) {
        nextTags = merged;
        setTags(nextTags);
        latestValuesRef.current.tags = nextTags;
        metadataChanged = true;
      }
    }

    // 2. Entity detection from database
    try {
      const [tasks, projects, milestones] = await Promise.all([
        db.tasks.toArray(),
        db.projects.toArray(),
        db.milestones.toArray(),
      ]);
      const entities = detectReferencedEntities(pastedText, tasks, projects, milestones);
      if (entities.length > 0) {
        setDetectedEntities(entities);
      }
    } catch (err) {
      console.warn('Entity detection failed:', err);
    }

    // Only trigger autosave if title or tags changed from extraction;
    // otherwise let handleBodyChange handle debounced save of the pasted body cleanly
    if (metadataChanged) {
      triggerAutoSave(nextTitle, latestValuesRef.current.body, nextTags);
    }
  };

  // 1-Click apply all entities
  const handleApplyEntities = async (selected: DetectedEntity[]) => {
    if (!doc) return;
    try {
      await linkEntitiesToDoc(doc.id, title || 'Tài liệu', selected, db);
      message.success(`Đã liên kết ${selected.length} mục với tài liệu`);
      setDetectedEntities([]);
      // Reload backlinks and doc
      const res = await getBacklinksForDoc(doc.id, db);
      setBacklinks(res);
      const updated = await db.notes.get(doc.id);
      if (updated) {
        setBody(updated.body);
      }
    } catch {
      message.error('Không thể áp dụng liên kết');
    }
  };

  // Ask AI about this document
  const handleAskAI = () => {
    if (!doc) return;
    if (aiChat?.openChat) {
      const wordCount = doc.body ? doc.body.trim().split(/\s+/).filter(Boolean).length : 0;
      const tagInfo = doc.tags && doc.tags.length > 0 ? ` [Tags: ${doc.tags.join(', ')}]` : '';
      const expandedPrompt = `Tôi đang xem xét tài liệu "${doc.title || 'Chưa đặt tên'}" (${wordCount} từ${tagInfo}). Hãy phân tích nội dung, tóm tắt các điểm then chốt và gợi ý các hành động tiếp theo hoặc liên kết với các tác vụ/dự án phù hợp.`;
      aiChat.openChat(
        { type: 'document', id: doc.id, title: doc.title || 'Tài liệu' },
        expandedPrompt
      );
    }
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  if (!doc) {
    return (
      <div
        style={{
          flex: 1,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#ffffff',
          color: '#8c8c8c',
          padding: 32,
        }}
      >
        <Title level={4} style={{ color: '#595959', marginBottom: 8 }}>
          Chưa có tài liệu nào được chọn
        </Title>
        <Text type="secondary" style={{ textAlign: 'center', maxWidth: 400 }}>
          Chọn một tài liệu từ danh sách bên trái hoặc nhấn "Tạo tài liệu" để bắt đầu ghi chép tri thức.
        </Text>
      </div>
    );
  }

  // Word & character counts
  const charCount = body.length;
  const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0;

  return (
    <div
      ref={containerRef}
      className={`doc-editor-pane ${isFullscreen ? 'fullscreen-mode' : ''}`}
      style={{
        flex: 1,
        minWidth: 0,
        width: '100%',
        maxWidth: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#ffffff',
        position: isFullscreen ? 'fixed' : 'relative',
        top: isFullscreen ? 0 : 'auto',
        left: isFullscreen ? 0 : 'auto',
        right: isFullscreen ? 0 : 'auto',
        bottom: isFullscreen ? 0 : 'auto',
        zIndex: isFullscreen ? 1000 : 'auto',
        overflow: 'hidden',
      }}
    >
      {/* Top Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          borderBottom: '1px solid #f0f0f0',
          backgroundColor: '#fafafa',
          gap: 12,
          flexShrink: 0,
          minWidth: 0,
        }}
      >
        {/* Left: View Mode Toggle */}
        <Radio.Group
          size="small"
          value={viewMode}
          onChange={(e) => setViewMode(e.target.value)}
          optionType="button"
          buttonStyle="solid"
          style={{ flexShrink: 0 }}
        >
          <Radio.Button value="edit">
            <EditOutlined /> Sửa
          </Radio.Button>
          <Radio.Button value="split">
            <SplitCellsOutlined /> Song song
          </Radio.Button>
          <Radio.Button value="preview">
            <EyeOutlined /> Xem
          </Radio.Button>
        </Radio.Group>

        {/* Right Actions */}
        <Space size={8} wrap={false} style={{ flexShrink: 0 }}>
          <Tooltip title={hasHeadings ? 'Mục lục bài viết' : 'Tài liệu chưa có tiêu đề để tạo mục lục'}>
            <Button
              size="small"
              type={showToC && hasHeadings ? 'primary' : 'default'}
              ghost={showToC && hasHeadings}
              disabled={!hasHeadings}
              onClick={toggleToC}
            >
              Mục lục
            </Button>
          </Tooltip>

          <Tooltip title="Chuẩn hóa nội dung tài liệu theo cấu trúc chuẩn AI Knowledge Document">
            <Button
              size="small"
              icon={<RobotOutlined style={{ color: '#0284c7' }} />}
              onClick={() => setIsNormalizeModalOpen(true)}
            >
              AI Chuẩn hóa
            </Button>
          </Tooltip>

          <Tooltip title="Hỏi AI về tài liệu này (Cmd+J)">
            <Button
              size="small"
              icon={<RobotOutlined style={{ color: '#4f46e5' }} />}
              onClick={handleAskAI}
            >
              Hỏi AI
            </Button>
          </Tooltip>

          <Dropdown
            menu={{
              items: [
                {
                  key: 'pptx',
                  icon: <FilePptOutlined style={{ color: '#d24726' }} />,
                  label: 'PowerPoint Slides (.pptx)',
                  onClick: async () => {
                    try {
                      const res = await exportPresentationAsFile(
                        body || `# ${title || 'Document'}\n\n(Không có nội dung)`,
                        `${title || 'document'}.pptx`,
                        { presentationTitle: title || 'Tài liệu' }
                      );
                      message.success(`Đã xuất ${res.filename} (${res.slideCount} slides)`);
                    } catch (err: any) {
                      message.error(`Lỗi xuất PPTX: ${err?.message || String(err)}`);
                    }
                  },
                },
                {
                  key: 'docx',
                  icon: <FileWordOutlined style={{ color: '#185abd' }} />,
                  label: 'Word Document (.docx)',
                  onClick: () => {
                    try {
                      const res = exportContentAsFile(
                        `# ${title || 'Document'}\n\n${body}`,
                        `${title || 'document'}.docx`,
                        'docx'
                      );
                      message.success(`Đã xuất ${res.filename}`);
                    } catch (err: any) {
                      message.error(`Lỗi xuất DOCX: ${err?.message || String(err)}`);
                    }
                  },
                },
                {
                  key: 'md',
                  icon: <FileMarkdownOutlined style={{ color: '#0969da' }} />,
                  label: 'Markdown (.md)',
                  onClick: () => {
                    try {
                      const res = exportContentAsFile(
                        `# ${title || 'Document'}\n\n${body}`,
                        `${title || 'document'}.md`,
                        'md'
                      );
                      message.success(`Đã xuất ${res.filename}`);
                    } catch (err: any) {
                      message.error(`Lỗi xuất MD: ${err?.message || String(err)}`);
                    }
                  },
                },
              ],
            }}
            placement="bottomRight"
          >
            <Tooltip title="Xuất tài liệu (PPTX, DOCX, MD)">
              <Button size="small" icon={<DownloadOutlined />}>
                Xuất
              </Button>
            </Tooltip>
          </Dropdown>

          <Tooltip title={isFullscreen ? 'Thu nhỏ' : 'Toàn màn hình'}>
            <Button
              size="small"
              icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
              onClick={toggleFullscreen}
            />
          </Tooltip>

          {doc.deletedAt && onRestoreDoc && (
            <Button
              size="small"
              type="primary"
              style={{ backgroundColor: '#16a34a' }}
              icon={<UndoOutlined />}
              onClick={() => onRestoreDoc(doc)}
            >
              Khôi phục
            </Button>
          )}

          {onDeleteDoc && (
            <Popconfirm
              title={doc.deletedAt ? 'Xóa vĩnh viễn tài liệu?' : 'Xóa tài liệu?'}
              description={
                doc.deletedAt
                  ? 'Tài liệu sẽ bị xóa hoàn toàn khỏi cơ sở dữ liệu. Không thể khôi phục.'
                  : 'Chuyển tài liệu này vào thùng rác?'
              }
              onConfirm={() => onDeleteDoc(doc)}
              okText={doc.deletedAt ? 'Xóa vĩnh viễn' : 'Xóa'}
              cancelText="Hủy"
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      </div>

      {/* Trash Warning Banner */}
      {doc.deletedAt && (
        <div style={{ padding: '8px 16px 0 16px' }}>
          <Alert
            type="warning"
            showIcon
            message="Tài liệu này đang nằm trong thùng rác"
            description="Nội dung đang ở chế độ xem. Bạn có thể khôi phục tài liệu để tiếp tục chỉnh sửa hoặc xóa vĩnh viễn."
            action={
              <Space>
                {onRestoreDoc && (
                  <Button
                    size="small"
                    type="primary"
                    icon={<UndoOutlined />}
                    onClick={() => onRestoreDoc(doc)}
                    style={{ backgroundColor: '#16a34a' }}
                  >
                    Khôi phục
                  </Button>
                )}
                {onDeleteDoc && (
                  <Popconfirm
                    title="Xóa vĩnh viễn tài liệu?"
                    description="Tài liệu sẽ bị xóa hoàn toàn khỏi cơ sở dữ liệu."
                    onConfirm={() => onDeleteDoc(doc)}
                    okText="Xóa vĩnh viễn"
                    cancelText="Hủy"
                  >
                    <Button size="small" danger>
                      Xóa vĩnh viễn
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            }
          />
        </div>
      )}

      {/* Smart Ingestion Banner */}
      {detectedEntities.length > 0 && !doc.deletedAt && (
        <div style={{ padding: '8px 16px 0 16px' }}>
          <SmartIngestionBanner
            detectedEntities={detectedEntities}
            onApplyAll={handleApplyEntities}
            onDismiss={() => setDetectedEntities([])}
          />
        </div>
      )}

      {/* Document Title Input */}
      <div style={{ padding: '12px 20px 4px 20px', flexShrink: 0, minWidth: 0 }}>
        <Input
          placeholder="Tiêu đề tài liệu..."
          value={title}
          disabled={Boolean(doc.deletedAt)}
          onChange={(e) => handleTitleChange(e.target.value)}
          variant="borderless"
          style={{
            fontSize: 22,
            fontWeight: 600,
            padding: 0,
            color: '#1f1f1f',
            width: '100%',
          }}
        />
        {tags.length > 0 && (
          <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
            {tags.map((t) => (
              <Tag key={t} color="purple" style={{ fontSize: 11 }}>
                #{t}
              </Tag>
            ))}
          </div>
        )}
      </div>

      {/* Main Content Area: Editor + Preview + ToC */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          overflow: 'hidden',
          padding: '0 16px',
          width: '100%',
        }}
      >
        {/* Editor Area */}
        {(viewMode === 'edit' || viewMode === 'split') && (
          <div
            style={{
              flex: viewMode === 'split' ? 1 : 1,
              minWidth: 0,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              paddingRight: viewMode === 'split' ? 8 : 0,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <Input.TextArea
              ref={textareaRef}
              value={body}
              readOnly={Boolean(doc.deletedAt)}
              onChange={(e) => handleBodyChange(e.target.value, e.target.selectionStart)}
              onKeyDown={handleKeyDown}
              onKeyUp={(e) => {
                const navKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Tab', 'Escape'];
                if (isAutoCompleteOpen && navKeys.includes(e.key)) {
                  return;
                }
                const target = e.target as HTMLTextAreaElement;
                checkForWikiTrigger(target.value, target.selectionStart);
              }}
              onClick={(e) => {
                const target = e.target as HTMLTextAreaElement;
                checkForWikiTrigger(target.value, target.selectionStart);
              }}
              onPaste={handlePaste}
              placeholder="Nhập nội dung Markdown hoặc dán văn bản vào đây... Sử dụng [[ để liên kết tác vụ/dự án."
              style={{
                flex: 1,
                resize: 'none',
                fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace',
                fontSize: 13,
                lineHeight: '1.6',
                border: 'none',
                boxShadow: 'none',
                padding: '8px 12px',
                height: '100%',
              }}
            />

            {/* Wiki-link Autocomplete Floating Popup */}
            {isAutoCompleteOpen && candidates.length > 0 && (
              <div
                className="wiki-autocomplete-popup"
                role="listbox"
                aria-label="Gợi ý liên kết [[..."
                style={{
                  position: 'absolute',
                  bottom: 16,
                  left: 16,
                  width: 320,
                  maxHeight: 280,
                  backgroundColor: '#ffffff',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)',
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                  zIndex: 1050,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '4px 0',
                }}
              >
                <div
                  style={{
                    padding: '6px 12px',
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#6b7280',
                    borderBottom: '1px solid #f3f4f6',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>LIÊN KẾT NHANH {autoCompleteQuery ? `"${autoCompleteQuery}"` : ''}</span>
                  <span style={{ fontWeight: 400 }}>↑↓ di chuyển, ↵ chọn</span>
                </div>
                {candidates.map((cand, idx) => {
                  const isSelected = idx === selectedIndex;
                  let icon = <FileTextOutlined style={{ color: '#7c3aed' }} />;
                  let typeLabel = 'Tài liệu';
                  let tagColor = 'purple';
                  if (cand.type === 'task') {
                    icon = <CheckSquareOutlined style={{ color: '#2563eb' }} />;
                    typeLabel = 'Tác vụ';
                    tagColor = 'blue';
                  } else if (cand.type === 'project') {
                    icon = <FolderOutlined style={{ color: '#d97706' }} />;
                    typeLabel = 'Dự án';
                    tagColor = 'orange';
                  }

                  return (
                    <div
                      key={`${cand.type}-${cand.id}`}
                      ref={(el) => {
                        if (isSelected && el && typeof el.scrollIntoView === 'function') {
                          el.scrollIntoView({ block: 'nearest' });
                        }
                      }}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleSelectCandidate(cand)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelectCandidate(cand);
                      }}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        backgroundColor: isSelected ? '#f5f3ff' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        borderLeft: isSelected ? '3px solid #7c3aed' : '3px solid transparent',
                        transition: 'background-color 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                        {icon}
                        <span
                          style={{
                            fontSize: 13,
                            color: '#1f2937',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {cand.title}
                        </span>
                      </div>
                      <Tag color={tagColor} style={{ fontSize: 10, margin: 0, padding: '0 4px', lineHeight: '18px' }}>
                        {typeLabel}
                      </Tag>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Preview Area */}
        {(viewMode === 'preview' || viewMode === 'split') && (
          <div
            style={{
              flex: viewMode === 'split' ? 1 : 1,
              minWidth: 0,
              maxWidth: '100%',
              height: '100%',
              overflowY: 'auto',
              overflowX: 'hidden',
              padding: '8px 16px 24px 16px',
              borderLeft: viewMode === 'split' ? '1px solid #f0f0f0' : 'none',
            }}
          >
            <div
              className="markdown-rendered-view"
              style={{
                width: '100%',
                maxWidth: '100%',
                wordBreak: 'break-word',
                overflowWrap: 'break-word',
              }}
              onClick={(e) => {
                const chip = (e.target as HTMLElement).closest('.wiki-link-chip') as HTMLElement | null;
                if (!chip) return;
                const entityType = chip.getAttribute('data-entity-type');
                const entityId = chip.getAttribute('data-entity-id');
                if (!entityType || !entityId) return;

                if (entityType === 'task') {
                  if (onOpenTask) {
                    onOpenTask(entityId);
                  } else {
                    setLocalDrawerTaskId(entityId);
                  }
                } else if (entityType === 'doc' && onSelectDoc) {
                  onSelectDoc(entityId);
                } else if (entityType === 'project' && onOpenProject) {
                  onOpenProject(entityId);
                }
              }}
              dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(body || '_Chưa có nội dung_') }}
            />
            {/* Backlinks Section */}
            <BacklinksSection
              tasks={backlinks.tasks}
              projects={backlinks.projects}
              referencingNotes={backlinks.referencingNotes}
              onOpenTask={onOpenTask || ((id) => setLocalDrawerTaskId(id))}
              onOpenProject={onOpenProject}
              onOpenNote={onSelectDoc}
            />
          </div>
        )}

        {/* Outline ToC Rail */}
        {showToC && hasHeadings && (
          <div
            style={{
              width: 180,
              minWidth: 160,
              maxWidth: 220,
              flexShrink: 0,
              height: '100%',
              borderLeft: '1px solid #f0f0f0',
              overflowY: 'auto',
              overflowX: 'hidden',
              padding: '4px 8px',
            }}
          >
            <DocOutlineToC markdown={body} />
          </div>
        )}
      </div>

      <TaskDrawer
        open={Boolean(localDrawerTaskId)}
        taskId={localDrawerTaskId ?? null}
        onClose={() => setLocalDrawerTaskId(undefined)}
        db={db}
      />

      <NormalizeDocModal
        open={isNormalizeModalOpen}
        originalContent={body}
        docTitle={title}
        onClose={() => setIsNormalizeModalOpen(false)}
        onApply={(normalizedMarkdown) => {
          handleBodyChange(normalizedMarkdown);
          message.success('Đã chuẩn hóa tài liệu thành công');
        }}
        db={db}
      />

      {/* Footer Info Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 16px',
          borderTop: '1px solid #f0f0f0',
          backgroundColor: '#fafafa',
          fontSize: 11,
          color: '#8c8c8c',
          flexShrink: 0,
          minWidth: 0,
        }}
      >
        <Space size={16}>
          <span>{charCount} ký tự</span>
          <span>{wordCount} từ</span>
        </Space>
        <div data-testid="doc-editor-status" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <DocPublishBadge status={publishStatus} compact={compactPublishBadge} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <CloudSyncOutlined style={{ color: '#52c41a' }} />
            <span>{saveStatus}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
