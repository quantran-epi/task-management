import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
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
import { streamChatEvents, stripThinkingBlocks } from '../../services/ai/nineRouterClient';
import {
  AI_DATABASE_TOOLS,
  executeAiTool,
  isMutationTool,
  normalizeToolName,
} from '../../services/ai/aiTools';
import type { ChatCompletionMessage, ToolCall } from '../../services/ai/types';

export interface InlineAISelectionBarProps {
  db?: TaskPlannerDatabase;
}

export interface SelectionRectInfo {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
}

export const GAP = 8;

export function calculatePopupPosition(
  rect: SelectionRectInfo,
  popupWidth: number,
  popupHeight: number,
  viewportWidth: number = typeof window !== 'undefined' ? window.innerWidth : 1024,
  scrollX: number = typeof window !== 'undefined' ? window.scrollX : 0,
  scrollY: number = typeof window !== 'undefined' ? window.scrollY : 0
): { x: number; y: number; placedBelow: boolean } {
  // Vertical positioning:
  // Strictly above if sufficient clearance (rect.top >= popupHeight + GAP + 10)
  // Else flip strictly below (rect.bottom + GAP)
  const canFitAbove = rect.top >= popupHeight + GAP + 10;
  const placedBelow = !canFitAbove;
  const y = canFitAbove ? rect.top - popupHeight - GAP : rect.bottom + GAP;

  // Horizontal positioning:
  // Center relative to selection and clamp to viewport margins
  const rawX = rect.left + rect.width / 2 - popupWidth / 2;
  const clampedX = Math.max(16, Math.min(viewportWidth - popupWidth - 16, rawX));

  return {
    x: clampedX + scrollX,
    y: y + scrollY,
    placedBelow,
  };
}

// Read-only subset of AI_DATABASE_TOOLS to ensure safety inside inline popover
const READ_ONLY_AI_TOOLS = AI_DATABASE_TOOLS.filter((t) => !isMutationTool(t.function.name));

export const InlineAISelectionBar: React.FC<InlineAISelectionBarProps> = ({ db = defaultDb }) => {
  const { token } = theme.useToken();
  const { openChatWithDraft } = useAIChat();

  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [selectionRect, setSelectionRect] = useState<SelectionRectInfo | null>(null);
  const [currentPayload, setCurrentPayload] = useState<SelectionContextPayload | null>(null);

  // Inline ask popover mode
  const [isAskingInline, setIsAskingInline] = useState(false);
  const [inlineQuery, setInlineQuery] = useState('');
  const [inlineResponse, setInlineResponse] = useState('');
  const [inlineStatus, setInlineStatus] = useState<string | null>(null);
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
    setInlineStatus(null);
    setIsLoadingInline(false);
    setCurrentPayload(null);
    setSelectionRect(null);
  }, []);

  // Update position based on selectionRect and actual/estimated container dimensions
  const updatePosition = useCallback(() => {
    if (!selectionRect) return;

    let popupWidth = isAskingInline ? 380 : 320;
    let popupHeight = isAskingInline ? 280 : 38;

    if (containerRef.current) {
      const measured = containerRef.current.getBoundingClientRect();
      if (measured.width > 0) popupWidth = measured.width;
      if (measured.height > 0) popupHeight = measured.height;
    }

    const { x, y } = calculatePopupPosition(
      selectionRect,
      popupWidth,
      popupHeight,
      window.innerWidth,
      window.scrollX,
      window.scrollY
    );
    setPosition({ x, y });
  }, [selectionRect, isAskingInline]);

  // Recalculate position dynamically when visible, asking mode toggles, or container dimensions change
  useLayoutEffect(() => {
    if (visible && selectionRect) {
      updatePosition();
    }
  }, [visible, isAskingInline, selectionRect, updatePosition, inlineResponse, inlineStatus]);

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
          setSelectionRect(null);
        }
        return;
      }

      const text = selection.toString().trim();
      if (text.length < 3) {
        if (!isAskingInline) {
          setVisible(false);
          setSelectionRect(null);
        }
        return;
      }

      // Check if selection originates from an input or textarea
      const anchorNode = selection.anchorNode;
      const targetElement =
        anchorNode?.nodeType === Node.ELEMENT_NODE ? (anchorNode as HTMLElement) : anchorNode?.parentElement;
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

        const rectInfo: SelectionRectInfo = {
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          width: rect.width,
        };

        const domContext = getDomContextFromNode(anchorNode);
        const hierarchy = await resolveEntityHierarchy(domContext.entityType, domContext.entityId, db);

        const payload: SelectionContextPayload = {
          ...hierarchy,
          selectedText: text,
        };

        setCurrentPayload(payload);
        setSelectionRect(rectInfo);

        const initialPos = calculatePopupPosition(
          rectInfo,
          320,
          38,
          window.innerWidth,
          window.scrollX,
          window.scrollY
        );
        setPosition({ x: initialPos.x, y: initialPos.y });
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
        setSelectionRect(null);
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

    openChatWithDraft(
      {
        type: scopeType,
        id: scopeId,
        title: scopeTitle,
      },
      prompt
    );

    handleDismiss();
  };

  // Action: Run inline prompt with eager context and read-only tools
  const handleRunInlinePrompt = async (actionLabel: string, promptInstruction: string) => {
    if (!currentPayload) return;
    setIsAskingInline(true);
    setIsLoadingInline(true);
    setInlineQuery(actionLabel);
    setInlineResponse('');
    setInlineStatus(null);

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

      const systemPrompt = `Bạn là trợ lý AI súc tích trong ứng dụng TaskMate.
Nhiệm vụ: Trả lời trực diện, chính xác và hữu ích nhất cho người dùng về đoạn văn bản được chọn.
Nguyên tắc:
1. Bạn đã được cung cấp TOÀN BỘ NGỮ CẢNH GỐC (full metadata, task details, document content) của thực thể chứa đoạn trích ở bên dưới. Hãy khai thác tối đa thông tin này.
2. Nếu câu hỏi đòi hỏi tra cứu thêm dữ liệu chéo trong hệ thống (như tìm kiếm task khác, kiểm tra lịch hoặc tài liệu khác), BẠN ĐÃ CÓ CÁC CÔNG CỤ ĐỌC DỮ LIỆU (read-only tools). Hãy gọi công cụ phù hợp.
3. Trả lời súc tích, mạch lạc, dùng Markdown rõ ràng.`;

      const userContent = `Ngữ cảnh nguồn: ${currentPayload.hierarchyPath}
${currentPayload.fullContextText ? `\n[DỮ LIỆU ĐẦY ĐỦ CỦA THỰC THỂ NGUỒN]:\n${currentPayload.fullContextText}\n` : ''}
[ĐOẠN TRÍCH ĐƯỢC CHỌN]:
"${currentPayload.selectedText}"

[YÊU CẦU]: ${promptInstruction}`;

      const messages: ChatCompletionMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ];

      const targetModel = config.defaultModel || 'gpt-4o';
      let loopCount = 0;
      const MAX_LOOPS = 3;

      while (loopCount < MAX_LOOPS) {
        loopCount++;
        let turnResponse = '';
        let hasToolCalls = false;
        let toolCallsToRun: ToolCall[] = [];

        const stream = streamChatEvents({
          endpoint: config.endpoint,
          apiKey,
          payload: {
            model: targetModel,
            messages,
            tools: READ_ONLY_AI_TOOLS,
          },
          signal: controller.signal,
        });

        for await (const chunk of stream) {
          if (chunk.type === 'reasoning') {
            const cleanReasoning = chunk.delta.trim().replace(/\n+/g, ' ');
            if (cleanReasoning) {
              setInlineStatus(`Đang suy nghĩ: ${cleanReasoning.slice(0, 60)}...`);
            }
          } else if (chunk.type === 'text') {
            turnResponse += chunk.delta;
            setInlineResponse(stripThinkingBlocks(turnResponse));
            setInlineStatus(null);
          } else if (chunk.type === 'tool_calls') {
            hasToolCalls = true;
            toolCallsToRun = chunk.calls;
          }
        }

        if (!hasToolCalls) {
          // Finished generating text answer
          break;
        }

        // Execute read-only tools
        messages.push({
          role: 'assistant',
          content: turnResponse || null,
          tool_calls: toolCallsToRun,
        });

        for (const tc of toolCallsToRun) {
          const normalized = normalizeToolName(tc.function.name);
          setInlineStatus(`Đang đọc dữ liệu (${normalized})...`);

          let args: Record<string, any> = {};
          try {
            args = JSON.parse(tc.function.arguments || '{}');
          } catch {}

          let toolResult = '';
          try {
            toolResult = await executeAiTool(tc.function.name, args, db);
          } catch (err: any) {
            toolResult = JSON.stringify({ error: err?.message || String(err) });
          }

          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            name: tc.function.name,
            content: toolResult,
          });
        }

        setInlineStatus('Đang tổng hợp câu trả lời...');
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setInlineResponse(`Lỗi xử lý: ${err.message || String(err)}`);
      }
    } finally {
      setIsLoadingInline(false);
      setInlineStatus(null);
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
        maxWidth: 420,
        minWidth: 280,
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
            maxWidth: 340,
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
          <Tooltip title="Mention đoạn trích vào khung chat để chỉnh sửa trước khi gửi">
            <Button
              type="text"
              size="small"
              icon={<CommentOutlined style={{ color: token.colorPrimary }} />}
              onClick={handleMentionToDrawer}
            >
              Mention vào Chat
            </Button>
          </Tooltip>

          <Tooltip title="Giải thích ý nghĩa đoạn trích">
            <Button
              type="text"
              size="small"
              icon={<BulbOutlined style={{ color: '#faad14' }} />}
              onClick={() =>
                handleRunInlinePrompt(
                  'Giải thích',
                  'Giải thích ngắn gọn ý nghĩa của đoạn văn bản trên dựa trên toàn bộ ngữ cảnh gốc.'
                )
              }
            >
              Giải thích
            </Button>
          </Tooltip>

          <Tooltip title="Tóm tắt ý chính">
            <Button
              type="text"
              size="small"
              icon={<FileSearchOutlined style={{ color: '#52c41a' }} />}
              onClick={() =>
                handleRunInlinePrompt(
                  'Tóm tắt',
                  'Tóm tắt các ý chính của đoạn văn bản này thành 2-3 gạch đầu dòng rõ ràng.'
                )
              }
            >
              Tóm tắt
            </Button>
          </Tooltip>

          <Tooltip title="Viết lại hoặc sửa câu từ">
            <Button
              type="text"
              size="small"
              icon={<CheckCircleOutlined style={{ color: '#13c2c2' }} />}
              onClick={() =>
                handleRunInlinePrompt(
                  'Sửa câu từ',
                  'Viết lại đoạn văn bản trên cho rõ ràng, chuẩn ngữ pháp và trau chuốt hơn.'
                )
              }
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
                maxHeight: 220,
                overflowY: 'auto',
                padding: '6px 8px',
                borderRadius: 4,
                backgroundColor: token.colorFillAlter,
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              {inlineStatus && (
                <div
                  style={{
                    color: token.colorTextTertiary,
                    fontSize: 11,
                    marginBottom: 4,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Spin size="small" />
                  <span>{inlineStatus}</span>
                </div>
              )}
              {isLoadingInline && !inlineResponse && !inlineStatus && <Spin size="small" style={{ marginRight: 6 }} />}
              <Typography.Text style={{ whiteSpace: 'pre-wrap' }}>{inlineResponse}</Typography.Text>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 4 }}>
            <Button size="small" onClick={handleMentionToDrawer}>
              Mention vào Chat
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
