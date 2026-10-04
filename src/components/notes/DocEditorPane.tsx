import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Button,
  Input,
  Radio,
  Space,
  Tag,
  Tooltip,
  Typography,
  message,
  Popconfirm,
} from 'antd';
import {
  EditOutlined,
  EyeOutlined,
  SplitCellsOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  RobotOutlined,
  DeleteOutlined,
  CloudSyncOutlined,
} from '@ant-design/icons';
import type { Note } from '../../types/models';
import { renderSafeMarkdown } from '../../utils/markdown';
import { extractMarkdownMetadata, detectReferencedEntities, type DetectedEntity } from '../../utils/smartIngestion';
import { SmartIngestionBanner } from './SmartIngestionBanner';
import { DocOutlineToC } from './DocOutlineToC';
import { BacklinksSection } from './BacklinksSection';
import { getBacklinksForDoc, linkEntitiesToDoc, type BacklinksResult } from '../../db/repositories/documentLinkRepo';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { useAIChat } from '../../context/AIChatContext';

const { Text, Title } = Typography;

export type EditorViewMode = 'edit' | 'preview' | 'split';

export interface DocEditorPaneProps {
  doc: Note | null;
  onUpdateDoc: (id: string, updates: Partial<Note>) => Promise<void> | void;
  onDeleteDoc?: (doc: Note) => void;
  db?: TaskPlannerDatabase;
}

export const DocEditorPane: React.FC<DocEditorPaneProps> = ({
  doc,
  onUpdateDoc,
  onDeleteDoc,
  db = defaultDb,
}) => {
  const [viewMode, setViewMode] = useState<EditorViewMode>('split');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<string>('');
  const [detectedEntities, setDetectedEntities] = useState<DetectedEntity[]>([]);
  const [backlinks, setBacklinks] = useState<BacklinksResult>({ tasks: [], projects: [], referencingNotes: [] });
  const [showToC, setShowToC] = useState(true);

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
      return;
    }

    setTitle(doc.title || '');
    setBody(doc.body || '');
    setTags(doc.tags || []);
    setDetectedEntities([]);
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

  const handleTitleChange = (val: string) => {
    setTitle(val);
    triggerAutoSave(val, body, tags);
  };

  const handleBodyChange = (val: string) => {
    setBody(val);
    triggerAutoSave(title, val, tags);
  };

  // Handle paste for smart ingestion
  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedText = e.clipboardData.getData('text');
    if (!pastedText || pastedText.length < 15) return;

    // 1. Metadata extraction if doc is untitled
    const metadata = extractMarkdownMetadata(pastedText);
    let nextTitle = title;
    let nextTags = [...tags];

    if (!nextTitle.trim() && metadata.title) {
      nextTitle = metadata.title;
      setTitle(nextTitle);
    }

    if (metadata.tags.length > 0) {
      const merged = Array.from(new Set([...nextTags, ...metadata.tags]));
      nextTags = merged;
      setTags(nextTags);
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

    triggerAutoSave(nextTitle, body, nextTags);
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
      aiChat.openChat(
        { type: 'document', id: doc.id, title: doc.title || 'Tài liệu' },
        `Hãy tóm tắt và phân tích tài liệu "${doc.title || 'này'}" giúp tôi.`
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
        }}
      >
        {/* Left: View Mode Toggle */}
        <Radio.Group
          size="small"
          value={viewMode}
          onChange={(e) => setViewMode(e.target.value)}
          optionType="button"
          buttonStyle="solid"
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
        <Space size={8}>
          <Tooltip title="Mục lục bài viết">
            <Button
              size="small"
              type={showToC ? 'primary' : 'default'}
              ghost={showToC}
              onClick={() => setShowToC(!showToC)}
            >
              Mục lục
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

          <Tooltip title={isFullscreen ? 'Thu nhỏ' : 'Toàn màn hình'}>
            <Button
              size="small"
              icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
              onClick={toggleFullscreen}
            />
          </Tooltip>

          {onDeleteDoc && (
            <Popconfirm
              title="Xóa tài liệu?"
              description="Chuyển tài liệu này vào thùng rác?"
              onConfirm={() => onDeleteDoc(doc)}
              okText="Xóa"
              cancelText="Hủy"
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      </div>

      {/* Smart Ingestion Banner */}
      {detectedEntities.length > 0 && (
        <div style={{ padding: '8px 16px 0 16px' }}>
          <SmartIngestionBanner
            detectedEntities={detectedEntities}
            onApplyAll={handleApplyEntities}
            onDismiss={() => setDetectedEntities([])}
          />
        </div>
      )}

      {/* Document Title Input */}
      <div style={{ padding: '12px 20px 4px 20px' }}>
        <Input
          placeholder="Tiêu đề tài liệu..."
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          variant="borderless"
          style={{
            fontSize: 22,
            fontWeight: 600,
            padding: 0,
            color: '#1f1f1f',
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
          minHeight: 0,
          display: 'flex',
          overflow: 'hidden',
          padding: '0 16px',
        }}
      >
        {/* Editor Area */}
        {(viewMode === 'edit' || viewMode === 'split') && (
          <div
            style={{
              flex: viewMode === 'split' ? 1 : 1,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              paddingRight: viewMode === 'split' ? 8 : 0,
            }}
          >
            <Input.TextArea
              value={body}
              onChange={(e) => handleBodyChange(e.target.value)}
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
          </div>
        )}

        {/* Preview Area */}
        {(viewMode === 'preview' || viewMode === 'split') && (
          <div
            style={{
              flex: viewMode === 'split' ? 1 : 1,
              height: '100%',
              overflowY: 'auto',
              padding: '8px 16px 24px 16px',
              borderLeft: viewMode === 'split' ? '1px solid #f0f0f0' : 'none',
            }}
          >
            <div
              className="markdown-rendered-view"
              dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(body || '_Chưa có nội dung_') }}
            />
            {/* Backlinks Section */}
            <BacklinksSection
              tasks={backlinks.tasks}
              projects={backlinks.projects}
              referencingNotes={backlinks.referencingNotes}
            />
          </div>
        )}

        {/* Outline ToC Rail */}
        {showToC && (
          <div
            style={{
              width: 180,
              minWidth: 160,
              height: '100%',
              borderLeft: '1px solid #f0f0f0',
              overflowY: 'auto',
              padding: '4px 8px',
            }}
          >
            <DocOutlineToC markdown={body} />
          </div>
        )}
      </div>

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
        }}
      >
        <Space size={16}>
          <span>{charCount} ký tự</span>
          <span>{wordCount} từ</span>
        </Space>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <CloudSyncOutlined style={{ color: '#52c41a' }} />
          <span>{saveStatus}</span>
        </div>
      </div>
    </div>
  );
};
