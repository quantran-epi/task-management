import React, { useState, useEffect, useRef, useCallback } from 'react';
import { theme, Button, Input, Typography, Tooltip, Popconfirm, message } from 'antd';
import {
  SendOutlined,
  RobotFilled,
  ClearOutlined,
  SyncOutlined,
  DownOutlined,
  UpOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../../db';
import { getStepThread } from '../../../services/wizard/sdlcCrManager';
import { saveMessage, clearThreadMessages } from '../../../db/repositories/chatRepo';
import {
  getNineRouterConfig,
  getNineRouterApiKey,
  fetchAvailableModels,
  setNineRouterConfig,
} from '../../../services/ai/nineRouterTokenService';
import type { SdlcStepId } from '../../../services/wizard/workflowSchemas';
import { renderSafeMarkdown } from '../../../utils/markdown';
import { stripThinkingBlocks } from '../../../services/ai/nineRouterClient';
import {
  runAiOrchestratorLoop,
  dispatchAiToolCall,
} from '../../../services/ai/aiOrchestratorLoop';
import {
  getToolsForTurn,
} from '../../ai/AIChatDrawer';
import {
  getMcpServers,
  saveMcpServers,
  discoverAllMcpTools,
  type McpServerConfig,
} from '../../../services/ai/mcpClient';
import { describeToolMutationWithContext } from '../../../services/ai/aiTools';
import { ChatTabToolbox } from '../../ai/ChatTabToolbox';
import { extractSolutionMarkdown, extractChatSummary } from '../../../utils/sdlcSolutionParser';

export interface StepChatPanelProps {
  projectId: string;
  crId: string;
  stepId: SdlcStepId;
  stepGroundingContext?: string;
  onSolutionExtracted?: (solutionMarkdown: string) => void;
  onRequestAiAnalysis?: () => void;
  db?: TaskPlannerDatabase | undefined;
}

export interface StepChatPanelHandle {
  sendMessage: (text: string) => Promise<void>;
}

const STEP_LABELS: Record<SdlcStepId, string> = {
  INTAKE: '1. Hồ sơ đầu vào',
  SOLUTION: '2. Thiết kế giải pháp',
  CODE_GUIDE: '3. Coding ngoài',
  CHANGE_PACK: '4. Kiểm soát Change Pack',
  TECH_DOCS: '5. Tài liệu kỹ thuật',
  CAB: '6. Tờ trình CAB',
};

const STEP_QUICK_PROMPTS: Record<SdlcStepId, string[]> = {
  INTAKE: [
    'Thẩm định tính đầy đủ của PL01 & PL02',
    'Chỉ ra các trường nghiệp vụ còn thiếu',
    'Tóm tắt yêu cầu chính của tính năng',
  ],
  SOLUTION: [
    'Đề xuất cấu trúc cơ sở dữ liệu cho giải pháp',
    'Phân tích rủi ro và các kịch bản kiểm thử',
    'Gợi ý thiết kế API và màn hình liên quan',
  ],
  CODE_GUIDE: [
    'Hướng dẫn cấu trúc thư mục change-pack',
    'Lệnh đóng gói zip và các cờ tham số',
    'Quy tắc đối soát file modified/added',
  ],
  CHANGE_PACK: [
    'Giải thích các lỗi trong ma trận drift',
    'Hướng dẫn khắc phục mục outside-solution',
    'Kiểm tra tính an toàn của các tệp thay đổi',
  ],
  TECH_DOCS: [
    'Kiểm tra tính khớp giữa PL03B và SOLUTION',
    'Soát các điều kiện kiểm thử trong PL07',
    'Tóm tắt tài liệu bàn giao',
  ],
  CAB: [
    'Đánh giá rủi ro triển khai production',
    'Kế hoạch rollback khẩn cấp nếu gặp sự cố',
    'Soát lại hồ sơ đóng CR',
  ],
};

interface CollapsibleMessageContentProps {
  content: string;
  isUser: boolean;
}

function CollapsibleMessageContent({ content, isUser }: CollapsibleMessageContentProps) {
  const [expanded, setExpanded] = useState(false);
  const isLong = content.length > 300 || content.split('\n').length > 6;

  return (
    <div>
      <div
        style={{
          maxHeight: isLong && !expanded ? 140 : 'none',
          overflow: isLong && !expanded ? 'hidden' : 'visible',
          position: 'relative',
        }}
      >
        {isUser ? (
          <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>
        ) : (
          <div
            dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(content) }}
            style={{ overflowWrap: 'break-word' }}
          />
        )}
      </div>

      {isLong && (
        <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-start' }}>
          <Button
            type="link"
            size="small"
            onClick={() => setExpanded((prev) => !prev)}
            style={{
              padding: 0,
              height: 'auto',
              fontSize: 12,
              color: isUser ? '#e0e7ff' : undefined,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {expanded ? (
              <>
                <UpOutlined style={{ fontSize: 10 }} /> Thu gọn
              </>
            ) : (
              <>
                <DownOutlined style={{ fontSize: 10 }} /> Xem thêm
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

export const StepChatPanel = React.forwardRef<StepChatPanelHandle, StepChatPanelProps>(({
  projectId,
  crId,
  stepId,
  stepGroundingContext = '',
  onSolutionExtracted,
  onRequestAiAnalysis,
  db = defaultDb,
}, ref) => {
  const { token } = theme.useToken();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [streamingStatus, setStreamingStatus] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Toolbox state per D-04
  const [analysisMode, setAnalysisMode] = useState<boolean>(true); // default true for SDLC step inspection
  const [autoApproveMutations, setAutoApproveMutations] = useState<boolean>(false);
  const [mcpEnabled, setMcpEnabled] = useState<boolean>(true);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isRefreshingModels, setIsRefreshingModels] = useState(false);
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([]);

  // Pending mutation confirmation state
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    toolName: string;
    summary: string;
    args: Record<string, any>;
    resolve: (proceed: boolean) => void;
  } | null>(null);

  // Initialize or fetch isolated thread for this step
  useEffect(() => {
    let cancelled = false;
    async function loadThread() {
      if (!projectId || !crId || !stepId) return;
      try {
        const thread = await getStepThread(projectId, crId, stepId, db);
        if (!cancelled) {
          setThreadId(thread.id);
        }
      } catch {
        // Handled silently
      }
    }
    loadThread();
    return () => {
      cancelled = true;
    };
  }, [projectId, crId, stepId, db]);

  // Load models and MCP servers configuration
  const loadModelsAndServers = useCallback(async () => {
    try {
      const config = await getNineRouterConfig(db);
      if (config.defaultModel) {
        setSelectedModel(config.defaultModel);
      }
      const [models, servers] = await Promise.all([
        fetchAvailableModels(db).catch(() => []),
        getMcpServers(db).catch(() => []),
      ]);
      setAvailableModels(models);
      setMcpServers(servers);
      if (!config.defaultModel && models.length > 0 && models[0]) {
        setSelectedModel(models[0]);
      }
    } catch {
      // Ignored
    }
  }, [db]);

  useEffect(() => {
    void loadModelsAndServers();
  }, [loadModelsAndServers]);

  const handleRefreshModels = async () => {
    setIsRefreshingModels(true);
    try {
      const models = await fetchAvailableModels(db);
      setAvailableModels(models);
      message.success('Đã làm mới danh sách mô hình');
    } catch {
      message.error('Không thể tải danh sách mô hình');
    } finally {
      setIsRefreshingModels(false);
    }
  };

  const handleToggleMcpServer = async (id: string, enabled: boolean) => {
    const updated = mcpServers.map((s) => (s.id === id ? { ...s, enabled } : s));
    setMcpServers(updated);
    await saveMcpServers(updated, db);
    if (enabled && !mcpEnabled) {
      setMcpEnabled(true);
    }
  };

  // Read messages strictly bound to this isolated step threadId
  const messages = useLiveQuery(
    () => (threadId ? db.chatMessages.where('threadId').equals(threadId).sortBy('createdAt') : []),
    [threadId, db]
  ) ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamingText]);

  const handleClearHistory = async () => {
    if (!threadId) return;
    try {
      await clearThreadMessages(threadId, db);
      message.success('Đã xóa hội thoại của bước này');
    } catch {
      message.error('Không thể xóa hội thoại');
    }
  };

  const handleSendMessage = async (customText?: string) => {
    const text = (customText ?? inputText).trim();
    if (!text || !threadId || isStreaming) return;

    // Immediately activate loading indicators before any async storage or network work
    setIsStreaming(true);
    setStreamingText('');
    setStreamingStatus('Khởi động AI...');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (!customText) setInputText('');

    try {
      await saveMessage(
        {
          threadId,
          role: 'user',
          content: text,
        },
        db
      );

      const config = await getNineRouterConfig(db);
      const apiKey = await getNineRouterApiKey(db);
      const targetModel = selectedModel || config.defaultModel || 'gpt-4o';

      const systemPrompt = `Bạn là trợ lý AI chuyên gia hỗ trợ quy trình SDLC tại bước [${stepId} - ${STEP_LABELS[stepId] || ''}].
Dự án ID: ${projectId}
Mã CR: ${crId}
Ngữ cảnh kỹ thuật bước hiện tại:
${stepGroundingContext}

Hãy trả lời súc tích, đi thẳng vào giải pháp kỹ thuật, phân tích kiến trúc chính xác và hỗ trợ người dùng đạt chuẩn bàn giao.
Khi được yêu cầu phân tích kiến trúc hoặc chỉnh sửa SOLUTION.md, hãy luôn cấu trúc phản hồi gồm 2 phần:
1) Đoạn tóm tắt ngắn gọn thân thiện (2-4 câu) ở trên cùng giải thích những điểm chính đã thiết kế/chỉnh sửa và thông báo cho người dùng xem chi tiết tại trình soạn thảo bên trái.
2) Toàn bộ nội dung văn bản Markdown SOLUTION.md hoàn chỉnh được bao bọc trong khối code \`\`\`markdown có tiêu đề "# SOLUTION".`;

      const historyMsgs = messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      const dynamicMcpTools = mcpEnabled ? await discoverAllMcpTools(db).catch(() => []) : [];
      const toolsForTurn = getToolsForTurn(analysisMode, dynamicMcpTools);

      let fullResponse = '';

      const loopResult = await runAiOrchestratorLoop({
        endpoint: config.endpoint,
        apiKey: apiKey ?? '',
        model: targetModel,
        messages: [
          { role: 'system', content: systemPrompt },
          ...historyMsgs,
          { role: 'user', content: text },
        ],
        tools: toolsForTurn,
        maxLoops: 30,
        db,
        signal: controller.signal,
        ...(analysisMode ? { keepRecentToolOutputs: 20, maxOldToolChars: 100_000 } : {}),
        compactAtRatio: analysisMode ? 0.9 : 0.75,
        executeToolFn: (name, args, toolDb, signal) =>
          dispatchAiToolCall(name, args, toolDb, signal, { allowMutation: autoApproveMutations }),
        onTextChunk: (delta) => {
          fullResponse += delta;
          const stripped = stripThinkingBlocks(fullResponse);
          setStreamingText(stripped);
        },
        onStatusChange: (status) => {
          setStreamingStatus(status);
        },
        onMutationCheck: async (toolName, args) => {
          if (analysisMode) {
            return {
              proceed: false,
              cancellationResult: JSON.stringify({
                cancelled: true,
                message: 'Analysis Mode chỉ đọc; không có dữ liệu nào bị thay đổi.',
              }),
            };
          }
          if (autoApproveMutations) {
            return { proceed: true };
          }
          const summary = await describeToolMutationWithContext(toolName, args, db);
          setStreamingStatus('Chờ xác nhận hành động...');
          const confirmed = await new Promise<boolean>((resolve) => {
            setPendingConfirmation({
              toolName,
              summary,
              args,
              resolve,
            });
          });
          setPendingConfirmation(null);
          return confirmed
            ? { proceed: true }
            : {
                proceed: false,
                cancellationResult: JSON.stringify({
                  cancelled: true,
                  message: 'Người dùng đã từ chối thao tác này. Không có dữ liệu nào bị thay đổi.',
                }),
              };
        },
      });

      const cleanCommittedResponse = stripThinkingBlocks(loopResult.fullResponse || fullResponse).trim();

      if (cleanCommittedResponse) {
        let messageToSave = cleanCommittedResponse;

        // Auto-extract solution if in SOLUTION step
        if (stepId === 'SOLUTION' && onSolutionExtracted) {
          const solutionMarkdown = extractSolutionMarkdown(cleanCommittedResponse);
          if (solutionMarkdown) {
            onSolutionExtracted(solutionMarkdown);
            // In chat thread, save clean conversational summary + guidance instead of massive markdown dump
            const chatSummary = extractChatSummary(cleanCommittedResponse);
            messageToSave = `${chatSummary}\n\n*(Toàn bộ tài liệu kiến trúc đã được cập nhật trực tiếp vào trình soạn thảo bên trái)*`;
          }
        }

        await saveMessage(
          {
            threadId,
            role: 'assistant',
            content: messageToSave,
          },
          db
        );
      }
    } catch (err: any) {
      if (controller.signal.aborted) {
        // User aborted
      } else {
        await saveMessage(
          {
            threadId,
            role: 'assistant',
            content: `Lỗi kết nối AI: ${err?.message || 'Không thể tạo phản hồi'}`,
          },
          db
        );
      }
    } finally {
      setIsStreaming(false);
      setStreamingText('');
      setStreamingStatus(null);
      abortControllerRef.current = null;
    }
  };

  React.useImperativeHandle(ref, () => ({
    sendMessage: (text: string) => handleSendMessage(text),
  }));

  const quickPrompts = STEP_QUICK_PROMPTS[stepId] ?? [];

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
      {/* Header */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          background: token.colorFillAlter,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                flexShrink: 0,
                boxShadow: '0 2px 4px rgba(79, 70, 229, 0.2)',
              }}
            >
              <RobotFilled style={{ fontSize: 13 }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <Typography.Text
                strong
                style={{
                  fontSize: 12,
                  display: 'block',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                Trợ lý AI • {STEP_LABELS[stepId] || stepId}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 10, display: 'block' }}>
                Ngữ cảnh cô lập ({stepId})
              </Typography.Text>
            </div>
          </div>

          {messages.length > 0 && (
            <Popconfirm
              title="Xóa hội thoại bước này?"
              okText="Xóa"
              cancelText="Hủy"
              onConfirm={handleClearHistory}
            >
              <Tooltip title="Làm sạch hội thoại bước này">
                <Button
                  type="text"
                  size="small"
                  icon={<ClearOutlined />}
                  style={{ color: token.colorTextSecondary }}
                />
              </Tooltip>
            </Popconfirm>
          )}
        </div>

        {/* Compact Parity ChatTabToolbox */}
        <ChatTabToolbox
          activeTabId={threadId || 'sdlc-step-tab'}
          compact
          selectedModel={selectedModel}
          availableModels={availableModels}
          onModelChange={(m) => {
            setSelectedModel(m);
            void setNineRouterConfig({ defaultModel: m }, db);
          }}
          onRefreshModels={handleRefreshModels}
          isRefreshingModels={isRefreshingModels}
          analysisMode={analysisMode}
          onToggleAnalysisMode={() => setAnalysisMode((prev) => !prev)}
          autoApproveMutations={autoApproveMutations}
          onToggleAutoApproveMutations={() => setAutoApproveMutations((prev) => !prev)}
          mcpEnabled={mcpEnabled}
          onToggleMcpEnabled={() => setMcpEnabled((prev) => !prev)}
          mcpServers={mcpServers}
          onToggleMcpServer={handleToggleMcpServer}
          onClearContext={handleClearHistory}
        />
      </div>

      {/* Messages Transcript */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          background: token.colorBgContainer,
        }}
      >
        {messages.length === 0 && !streamingText && (
          <div
            style={{
              textAlign: 'center',
              margin: 'auto 0',
              padding: '16px 8px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: token.colorFillAlter,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: token.colorPrimary,
                fontSize: 20,
              }}
            >
              <RobotFilled />
            </div>
            <div>
              <Typography.Text strong style={{ fontSize: 13, display: 'block' }}>
                Hỗ trợ chuyên môn cho {STEP_LABELS[stepId] || stepId}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
                Đặt câu hỏi kỹ thuật hoặc chọn nhanh các câu hỏi gợi ý bên dưới:
              </Typography.Text>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', marginTop: 8 }}>
              {quickPrompts.map((prompt, idx) => (
                <Button
                  key={idx}
                  size="small"
                  type="dashed"
                  onClick={() => void handleSendMessage(prompt)}
                  style={{
                    fontSize: 12,
                    textAlign: 'left',
                    height: 'auto',
                    padding: '6px 10px',
                    whiteSpace: 'normal',
                    lineHeight: 1.4,
                  }}
                >
                  💡 {prompt}
                </Button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => {
          const isUser = m.role === 'user';
          return (
            <div
              key={m.id}
              style={{
                alignSelf: isUser ? 'flex-end' : 'flex-start',
                maxWidth: '92%',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              <div
                style={{
                  padding: '9px 13px',
                  borderRadius: token.borderRadiusLG,
                  background: isUser ? token.colorPrimary : token.colorFillAlter,
                  border: isUser ? 'none' : `1px solid ${token.colorBorderSecondary}`,
                  color: isUser ? '#ffffff' : token.colorText,
                  fontSize: 13,
                  lineHeight: 1.55,
                  wordBreak: 'break-word',
                  boxShadow: isUser ? '0 1px 3px rgba(79, 70, 229, 0.2)' : 'none',
                }}
              >
                <CollapsibleMessageContent content={m.content} isUser={isUser} />
              </div>
            </div>
          );
        })}

        {streamingText && (
          <div
            style={{
              alignSelf: 'flex-start',
              maxWidth: '92%',
              padding: '9px 13px',
              borderRadius: token.borderRadiusLG,
              background: token.colorFillAlter,
              border: `1px solid ${token.colorBorderSecondary}`,
              fontSize: 13,
              lineHeight: 1.55,
            }}
          >
            <div
              dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(streamingText) }}
              style={{ overflowWrap: 'break-word' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, color: token.colorPrimary }}>
              <SyncOutlined spin style={{ fontSize: 12 }} />
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                {streamingStatus || 'AI đang xử lý...'}
              </Typography.Text>
            </div>
          </div>
        )}

        {/* Pending Mutation Confirmation Card */}
        {pendingConfirmation && (
          <div
            style={{
              padding: 12,
              background: token.colorWarningBg,
              border: `1px solid ${token.colorWarningBorder}`,
              borderRadius: token.borderRadiusLG,
              marginTop: 8,
            }}
          >
            <Typography.Text strong style={{ display: 'block', color: token.colorWarningText }}>
              Xác nhận thay đổi dữ liệu:
            </Typography.Text>
            <Typography.Text style={{ fontSize: 12, display: 'block', margin: '4px 0' }}>
              {pendingConfirmation.summary}
            </Typography.Text>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
              <Button size="small" onClick={() => pendingConfirmation.resolve(false)}>
                Từ chối
              </Button>
              <Button type="primary" size="small" onClick={() => pendingConfirmation.resolve(true)}>
                Đồng ý
              </Button>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        style={{
          padding: '10px 12px',
          borderTop: `1px solid ${token.colorBorderSecondary}`,
          background: token.colorBgContainer,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', width: '100%' }}>
          <Input.TextArea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                void handleSendMessage();
              }
            }}
            placeholder={`Hỏi AI trợ giúp bước này (${stepId})...`}
            autoSize={{ minRows: 1, maxRows: 5 }}
            disabled={isStreaming}
            style={{
              flex: 1,
              width: '100%',
              borderRadius: token.borderRadiusSM,
              fontSize: 13,
            }}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            loading={isStreaming}
            disabled={!inputText.trim() && !isStreaming}
            onClick={() => void handleSendMessage()}
            style={{
              height: 32,
              minWidth: 38,
              borderRadius: token.borderRadiusSM,
            }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 2px' }}>
          <Typography.Text type="secondary" style={{ fontSize: 10 }}>
            Enter gửi • Shift+Enter xuống dòng
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 10 }}>
            Ngữ cảnh: {stepId}
          </Typography.Text>
        </div>
      </div>
    </div>
  );
});

StepChatPanel.displayName = 'StepChatPanel';
