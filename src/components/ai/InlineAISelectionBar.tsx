import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button, Input, Space, Tooltip, Typography, Spin, theme } from 'antd';
import {
  RobotOutlined,
  CommentOutlined,
  FileSearchOutlined,
  BulbOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { useAIChat } from '../../context/AIChatContext';
import {
  getDomContextFromNode,
  resolveEntityHierarchy,
  formatSelectionMentionPrompt,
  type SelectionContextPayload,
} from '../../utils/selectionContext';
import { getNineRouterApiKey, getNineRouterConfig } from '../../services/ai/nineRouterTokenService';
import { streamChatCompletion } from '../../services/ai/nineRouterClient';

export interface InlineAISelectionBarProps {
  db?: TaskPlannerDatabase;
}

export const InlineAISelectionBar: React.FC<InlineAISelectionBarProps> = ({ db = defaultDb }) => {
  const { token } = theme.useToken();
  const { openChat } = useAIChat();

  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [currentPayload, setCurrentPayload] = useState<SelectionContextPayload | null>(null);

  // Inline ask popover mode
  const [isAskingInline, setIsAskingInline] = useState(false);
  const [inlineQuery, setInlineQuery] = useState('');
  const [inlineResponse, setInlineResponse] = useState('');
  const [isLoadingInline, setIsLoadingInline] = useState(false);
  const inlineAbortRef = useRef<AbortController | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Clear state and hide
  const handleDismiss = useCallback(() => {
    if (inlineAbortRef.current) {
      inlineAbortRef.current.abort();
      inlineAbortRef.current = null;
    }
    setVisible(false);
    setIsAskingInline(false);
    setInlineQuery('');
    setInlineResponse('');
    setIsLoadingInline(false);
    setCurrentPayload(null);
  }, []);

  // Listen to mouseup & selectionchange
  useEffect(() => {
    const handleMouseUp = async (e: MouseEvent) => {
      // Ignore clicks inside our own floating popover
      if (containerRef.current && containerRef.current.contains(e.target as Node)) {
        return;
      }

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        if (!isAskingInline) {
          setVisible(false);
        }
        return;
      }

      const text = selection.toString().trim();
      if (text.length < 3) {
        if (!isAskingInline) setVisible(false);
        return;
      }

      // Check if selection originates from an input or textarea
      const anchorNode = selection.anchorNode;
      const targetElement = anchorNode?.nodeType === Node.ELEMENT_NODE ? (anchorNode as HTMLElement) : anchorNode?.parentElement;
      if (
        targetElement?.tagName === 'INPUT' ||
        targetElement?.closest('.ant-input') ||
        targetElement?.closest('.ant-mentions')
      ) {
        // Do not intercept input boxes
        return;
      }

      try {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;

        const domContext = getDomContextFromNode(anchorNode);
        const hierarchy = await resolveEntityHierarchy(domContext.entityType, domContext.entityId, db);

        const payload: SelectionContextPayload = {
          ...hierarchy,
          selectedText: text,
        };

        setCurrentPayload(payload);

        // Calculate position above selection or below if near top
        const x = Math.max(16, Math.min(window.innerWidth - 320, rect.left + rect.width / 2 - 140));
        const y = rect.top > 80 ? rect.top - 48 : rect.bottom + 8;

        setPosition({ x, y: y + window.scrollY });
        setVisible(true);
      } catch (err) {
        console.warn('[InlineAISelectionBar] Error getting selection range:', err);
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && containerRef.current.contains(e.target as Node)) {
        return;
      }
      if (!isAskingInline) {
        setVisible(false);
      }
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [db, isAskingInline]);

  // Action: Mention to Chat Drawer
  const handleMentionToDrawer = () => {
    if (!currentPayload) return;
    const prompt = formatSelectionMentionPrompt(currentPayload);

    // Switch scope appropriately if attached to task or project
    let scopeType: 'task' | 'project' | 'global' = 'global';
    let scopeId: string | undefined = undefined;
    let scopeTitle: string | undefined = undefined;

    if (currentPayload.targetType === 'task') {
      scopeType = 'task';
      scopeId = currentPayload.targetId;
      scopeTitle = currentPayload.targetTitle;
    } else if (currentPayload.targetType === 'project') {
      scopeType = 'project';
      scopeId = currentPayload.targetId;
      scopeTitle = currentPayload.targetTitle;
    } else if (currentPayload.parentTask) {
      scopeType = 'task';
      scopeId = currentPayload.parentTask.id;
      scopeTitle = currentPayload.parentTask.name;
    } else if (currentPayload.parentProject) {
      scopeType = 'project';
      scopeId = currentPayload.parentProject.id;
      scopeTitle = currentPayload.parentProject.name;
    }

    openChat(
      {
        type: scopeType,
        id: scopeId,
        title: scopeTitle,
      },
      prompt
    );

    handleDismiss();
  };

  // Action: Run inline quick prompt
  const handleRunInlinePrompt = async (actionLabel: string, promptInstruction: string) => {
    if (!currentPayload) return;
    setIsAskingInline(true);
    setIsLoadingInline(true);
    setInlineQuery(actionLabel);
    setInlineResponse('');

    try {
      const apiKey = await getNineRouterApiKey(db);
      const config = await getNineRouterConfig(db);

      if (!apiKey || !config.endpoint) {
        setInlineResponse('Chưa cấu hình API Key 9router. Vui lòng mở Cài đặt AI.');
        setIsLoadingInline(false);
        return;
      }

      const controller = new AbortController();
      inlineAbortRef.current = controller;

      const stream = streamChatCompletion({
        endpoint: config.endpoint,
        apiKey,
        payload: {
          model: config.defaultModel || 'gpt-4o',
          messages: [
            {
              role: 'system',
              content:
                'Bạn là trợ lý AI súc tích, giải quyết trực tiếp yêu cầu của người dùng về đoạn văn bản được chọn. Trả lời ngắn gọn, trực diện, không dài dòng.',
            },
            {
              role: 'user',
              content: `Ngữ cảnh nguồn: ${currentPayload.hierarchyPath}\n\nĐoạn trích:\n"${currentPayload.selectedText}"\n\nYêu cầu: ${promptInstruction}`,
            },
          ],
        },
        signal: controller.signal,
      });

      let full = '';
      for await (const chunk of stream) {
        full += chunk;
        setInlineResponse(full);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setInlineResponse(`Lỗi xử lý: ${err.message || String(err)}`);
      }
    } finally {
      setIsLoadingInline(false);
      inlineAbortRef.current = null;
    }
  };

  if (!visible || !currentPayload) return null;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        zIndex: 2000,
        backgroundColor: token.colorBgElevated,
        borderRadius: 8,
        boxShadow: '0 6px 20px rgba(0, 0, 0, 0.15)',
        border: `1px solid ${token.colorBorderSecondary}`,
        padding: isAskingInline ? 12 : 4,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        maxWidth: 380,
        minWidth: 260,
      }}
    >
      {/* Context Breadcrumb Badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '2px 6px',
          borderBottom: `1px solid ${token.colorSplit}`,
          fontSize: 11,
          color: token.colorTextSecondary,
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 300,
            fontWeight: 500,
          }}
          title={currentPayload.hierarchyPath}
        >
          📍 {currentPayload.hierarchyPath}
        </span>
        <Button
          type="text"
          size="small"
          icon={<CloseOutlined style={{ fontSize: 10 }} />}
          onClick={handleDismiss}
          style={{ width: 18, height: 18, padding: 0 }}
        />
      </div>

      {!isAskingInline ? (
        /* Floating Toolbar Quick Actions */
        <Space size={2} wrap>
          <Tooltip title="Đưa vào AI Chat Drawer với đầy đủ ngữ cảnh">
            <Button
              type="text"
              size="small"
              icon={<CommentOutlined style={{ color: token.colorPrimary }} />}
              onClick={handleMentionToDrawer}
            >
              Hỏi Chat Drawer
            </Button>
          </Tooltip>

          <Tooltip title="Giải thích ý nghĩa đoạn trích">
            <Button
              type="text"
              size="small"
              icon={<BulbOutlined style={{ color: '#faad14' }} />}
              onClick={() => handleRunInlinePrompt('Giải thích', 'Giải thích ngắn gọn ý nghĩa của đoạn văn bản trên.')}
            >
              Giải thích
            </Button>
          </Tooltip>

          <Tooltip title="Tóm tắt ý chính">
            <Button
              type="text"
              size="small"
              icon={<FileSearchOutlined style={{ color: '#52c41a' }} />}
              onClick={() => handleRunInlinePrompt('Tóm tắt', 'Tóm tắt các ý chính của đoạn văn bản này thành 2-3 gạch đầu dòng.')}
            >
              Tóm tắt
            </Button>
          </Tooltip>

          <Tooltip title="Viết lại hoặc sửa câu từ">
            <Button
              type="text"
              size="small"
              icon={<CheckCircleOutlined style={{ color: '#13c2c2' }} />}
              onClick={() => handleRunInlinePrompt('Sửa câu từ', 'Viết lại đoạn văn bản trên cho rõ ràng, chuẩn ngữ pháp và trau chuốt hơn.')}
            >
              Viết lại
            </Button>
          </Tooltip>

          <Tooltip title="Hỏi câu hỏi tùy chỉnh">
            <Button
              type="text"
              size="small"
              icon={<RobotOutlined style={{ color: token.colorPrimary }} />}
              onClick={() => setIsAskingInline(true)}
            >
              Hỏi...
            </Button>
          </Tooltip>
        </Space>
      ) : (
        /* Inline Query & Stream Area */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <Input
              size="small"
              placeholder="Nhập câu hỏi về đoạn này..."
              value={inlineQuery}
              onChange={(e) => setInlineQuery(e.target.value)}
              onPressEnter={() => {
                if (inlineQuery.trim()) {
                  handleRunInlinePrompt(inlineQuery, inlineQuery);
                }
              }}
              autoFocus
            />
            <Button
              type="primary"
              size="small"
              icon={<SendOutlined />}
              loading={isLoadingInline}
              onClick={() => {
                if (inlineQuery.trim()) {
                  handleRunInlinePrompt(inlineQuery, inlineQuery);
                }
              }}
            />
          </div>

          {(isLoadingInline || inlineResponse) && (
            <div
              style={{
                maxHeight: 180,
                overflowY: 'auto',
                padding: '6px 8px',
                borderRadius: 4,
                backgroundColor: token.colorFillAlter,
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              {isLoadingInline && !inlineResponse && <Spin size="small" style={{ marginRight: 6 }} />}
              <Typography.Text style={{ whiteSpace: 'pre-wrap' }}>{inlineResponse}</Typography.Text>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 4 }}>
            <Button size="small" onClick={handleMentionToDrawer}>
              Mở trong Chat Drawer
            </Button>
            <Button size="small" type="text" onClick={() => setIsAskingInline(false)}>
              Quay lại
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
