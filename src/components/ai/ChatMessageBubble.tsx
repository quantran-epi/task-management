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
} from '@ant-design/icons';
import type { ChatMessage } from '../../types/models';
import { renderSafeMarkdown } from '../../utils/markdown';
import { exportContentAsFile, type ExportFormat } from '../../utils/fileExport';
import { exportPresentationAsFile } from '../../utils/pptxExport';

const { Text } = Typography;

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
}) => {
  const { token } = theme.useToken();
  const [copied, setCopied] = useState(false);
  const [checklistAdded, setChecklistAdded] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  const isUser = msg.role === 'user';

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

  const handleExportFile = async (format: ExportFormat) => {
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
        baseName = `plannermate-ai-${new Date().toISOString().slice(0, 10)}`;
      }

      if (format === 'pptx') {
        const result = await exportPresentationAsFile(msg.content, `${baseName}.pptx`);
        message.success(`Đã tải xuống ${result.filename} (${result.slideCount} slides)`);
        return;
      }

      const result = exportContentAsFile(msg.content, `${baseName}.${format}`, format);
      message.success(`Đã tải xuống ${result.filename}`);
    } catch (err: unknown) {
      message.error(`Không thể xuất tệp: ${(err as Error)?.message || 'Lỗi không xác định'}`);
    }
  };

  const exportMenuItems: MenuProps['items'] = useMemo(() => {
    const tableHighlightStyle = hasMarkdownTable
      ? { fontWeight: 600, color: token.colorPrimary }
      : undefined;

    return [
      {
        key: 'pptx',
        icon: <FilePptOutlined style={{ color: '#d24726' }} />,
        label: 'PowerPoint Slides (.pptx)',
        onClick: () => handleExportFile('pptx'),
      },
      {
        key: 'docx',
        icon: <FileWordOutlined style={{ color: '#185abd' }} />,
        label: 'Word Document (.docx)',
        onClick: () => handleExportFile('docx'),
      },
      {
        key: 'xlsx',
        icon: <FileExcelOutlined style={{ color: '#107c41' }} />,
        label: (
          <span style={tableHighlightStyle}>
            Excel Spreadsheet (.xlsx) {hasMarkdownTable ? '★' : ''}
          </span>
        ),
        onClick: () => handleExportFile('xlsx'),
      },
      {
        key: 'csv',
        icon: <FileTextOutlined style={{ color: '#107c41' }} />,
        label: (
          <span style={tableHighlightStyle}>
            CSV Data (.csv) {hasMarkdownTable ? '★' : ''}
          </span>
        ),
        onClick: () => handleExportFile('csv'),
      },
      {
        type: 'divider',
      },
      {
        key: 'md',
        icon: <FileMarkdownOutlined style={{ color: '#0969da' }} />,
        label: 'Markdown (.md)',
        onClick: () => handleExportFile('md'),
      },
      {
        key: 'txt',
        icon: <FileTextOutlined style={{ color: '#666666' }} />,
        label: 'Văn bản thuần (.txt)',
        onClick: () => handleExportFile('txt'),
      },
    ];
  }, [hasMarkdownTable, token.colorPrimary]);

  const formattedTime = msg.createdAt
    ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  const handleMarkdownClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
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
                {streamingStatus ? 'PlannerMate AI Harness' : 'Đang xử lý qua 9router...'}
              </Text>
            </div>
          </div>
        ) : (
          <div>
            <div
              className="chat-markdown-body"
              onClick={handleMarkdownClick}
              dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(msg.content) }}
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

          <Dropdown menu={{ items: exportMenuItems }} trigger={['click']} placement="bottomLeft">
            <Button
              size="small"
              icon={<DownloadOutlined />}
              style={{ fontSize: 12, height: 24, padding: '0 8px' }}
            >
              Xuất tệp
            </Button>
          </Dropdown>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
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
        {!isUser && (
          <Tooltip title={copied ? 'Đã sao chép' : 'Sao chép nội dung'}>
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
