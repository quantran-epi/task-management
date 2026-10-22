import type { TaskPlannerDatabase } from '../../db';
import type { ChatCompletionMessage, ToolCall } from './types';
import type { ChatTokenUsage, ChatGeneratedFile } from '../../types/models';
import { streamChatEvents, streamChatCompletion, stripThinkingBlocks } from './nineRouterClient';
import { pruneToolOutputsInMessages } from './historyPruning';
import {
  AI_DATABASE_TOOLS,
  executeAiTool,
  isMutationTool,
  normalizeToolName,
} from './aiTools';
import { executeDynamicMcpTool } from './mcpClient';

export interface AiOrchestratorLoopOptions {
  endpoint: string;
  apiKey: string;
  model: string;
  messages: ChatCompletionMessage[];
  tools?: any[];
  temperature?: number;
  maxLoops?: number;
  db: TaskPlannerDatabase;
  signal?: AbortSignal;
  synthesisPrompt?: string;
  onTextChunk?: (delta: string) => void;
  onReasoningChunk?: (delta: string) => void;
  onStatusChange?: (status: string | null) => void;
  onUsage?: (usage: {
    promptTokens?: number | undefined;
    completionTokens?: number | undefined;
    totalTokens?: number | undefined;
  }) => void;
  onToolCall?: (call: { id: string; name: string; args: Record<string, any> }) => void;
  onToolResult?: (callId: string, result: string, durationMs: number) => void;
  onMutationCheck?: (
    toolName: string,
    args: Record<string, any>
  ) => Promise<{ proceed: boolean; cancellationResult?: string }>;
  onFileGenerated?: (file: ChatGeneratedFile) => void;
  executeToolFn?: (name: string, args: Record<string, any>, db: TaskPlannerDatabase) => Promise<string>;
}

export interface AiOrchestratorLoopResult {
  fullResponse: string;
  cleanResponse: string;
  messages: ChatCompletionMessage[];
  tokenUsage: ChatTokenUsage;
  generatedFiles: ChatGeneratedFile[];
}

function getFriendlyToolLabel(toolName: string): string {
  const normalized = normalizeToolName(toolName);
  switch (normalized) {
    case 'query_tasks': return 'Tra cứu tác vụ';
    case 'query_projects': return 'Tra cứu dự án';
    case 'query_milestones': return 'Tra cứu cột mốc';
    case 'get_item_details': return 'Chi tiết mục';
    case 'query_worklogs': return 'Nhật ký công việc';
    case 'get_active_timer': return 'Trạng thái bấm giờ';
    case 'get_daily_schedule': return 'Lịch làm việc';
    case 'check_capacity_feasibility': return 'Khả thi năng suất';
    case 'get_day_insight': return 'Đánh giá ngày';
    case 'get_analytics_summary': return 'Phân tích thống kê';
    case 'query_notes': return 'Ghi chú';
    case 'query_attention_items': return 'Mục cần chú ý';
    case 'query_recurring_tasks': return 'Tác vụ định kỳ';
    case 'get_system_status': return 'Trạng thái hệ thống';
    case 'list_advertised_groups': return 'Nhóm Graphiti';
    case 'search_nodes': return 'Nút Graphiti';
    case 'search_memory_facts': return 'Dữ kiện Graphiti';
    case 'get_catalog_object_context': return 'Ngữ cảnh Graphiti';
    case 'create_task': return 'Tạo tác vụ';
    case 'update_task': return 'Cập nhật tác vụ';
    case 'delete_task': return 'Xóa tác vụ';
    case 'plan_allocation': return 'Lên lịch phân bổ';
    case 'log_work_session': return 'Ghi nhận thời gian';
    default: return normalized || toolName;
  }
}

const DEFAULT_SYNTHESIS_PROMPT =
  'Dựa trên tất cả các kết quả công cụ và thông tin đã thu thập ở trên, hãy tổng hợp câu trả lời đầy đủ, chi tiết, chính xác và rõ ràng cho yêu cầu ban đầu.\n' +
  'Yêu cầu định dạng:\n' +
  '- Trình bày bằng Markdown hoàn chỉnh, mạch lạc, trực quan.\n' +
  '- Sử dụng tiêu đề (heading), danh sách gạch đầu dòng / số thứ tự hợp lý.\n' +
  '- In đậm các từ khóa, mã trạng thái, ID, bảng hoặc tham số quan trọng.\n' +
  '- Nếu có nhiều bước quy trình hoặc phân nhánh, trình bày theo từng giai đoạn rõ ràng.\n' +
  '- Không gọi thêm bất kỳ công cụ nào nữa.';

export async function runAiOrchestratorLoop(
  options: AiOrchestratorLoopOptions
): Promise<AiOrchestratorLoopResult> {
  const {
    endpoint,
    apiKey,
    model,
    messages,
    tools,
    temperature = 0.1,
    maxLoops = 30,
    db,
    signal,
    synthesisPrompt = DEFAULT_SYNTHESIS_PROMPT,
    onTextChunk,
    onReasoningChunk,
    onStatusChange,
    onUsage,
    onToolCall,
    onToolResult,
    onMutationCheck,
    onFileGenerated,
    executeToolFn,
  } = options;

  const currentMessages: ChatCompletionMessage[] = [...messages];
  const generatedFiles: ChatGeneratedFile[] = [];
  let accumulatedTokenUsage: ChatTokenUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };

  let fullResponse = '';
  let loopCount = 0;
  let lastHadToolCalls = false;

  while (loopCount < maxLoops) {
    loopCount++;
    fullResponse = '';
    let hasToolCalls = false;
    let toolCallsToRun: ToolCall[] = [];

    const messagesToSend = pruneToolOutputsInMessages(currentMessages);
    const payload: {
      model: string;
      messages: ChatCompletionMessage[];
      temperature: number;
      tools?: any[];
    } = {
      model,
      messages: messagesToSend,
      temperature,
    };
    if (tools && tools.length > 0) {
      payload.tools = tools;
    }

    try {
      const stream = streamChatEvents({
        endpoint,
        apiKey,
        payload,
        ...(signal ? { signal } : {}),
      });

      for await (const chunk of stream) {
        if (chunk.type === 'reasoning') {
          const cleanReasoning = chunk.delta.trim().replace(/\n+/g, ' ');
          if (cleanReasoning && onStatusChange) {
            onStatusChange(`Suy nghĩ: ${cleanReasoning.slice(0, 100)}...`);
          }
          onReasoningChunk?.(chunk.delta);
        } else if (chunk.type === 'text') {
          fullResponse += chunk.delta;
          onTextChunk?.(chunk.delta);
        } else if (chunk.type === 'tool_calls') {
          hasToolCalls = true;
          toolCallsToRun = chunk.calls;
        } else if (chunk.type === 'usage' && chunk.usage) {
          accumulatedTokenUsage = {
            promptTokens: (accumulatedTokenUsage.promptTokens || 0) + (chunk.usage.promptTokens || 0),
            completionTokens: (accumulatedTokenUsage.completionTokens || 0) + (chunk.usage.completionTokens || 0),
            totalTokens: (accumulatedTokenUsage.totalTokens || 0) + (chunk.usage.totalTokens || 0),
          };
          onUsage?.(chunk.usage);
        }
      }
    } catch (streamErr: any) {
      if (streamErr?.name === 'AbortError') throw streamErr;
      // If model rejected tools payload on first loop, fallback to completion without tools
      if (loopCount === 1 && !fullResponse && tools && tools.length > 0) {
        console.warn('[runAiOrchestratorLoop] Tools stream error, retrying without tools:', streamErr);
        const fallbackStream = streamChatCompletion({
          endpoint,
          apiKey,
          payload: {
            model,
            messages: messagesToSend,
            temperature,
          },
          ...(signal ? { signal } : {}),
        });
        for await (const delta of fallbackStream) {
          fullResponse += delta;
          onTextChunk?.(delta);
        }
        break;
      }
      throw streamErr;
    }

    lastHadToolCalls = hasToolCalls && toolCallsToRun.length > 0;
    if (!hasToolCalls || toolCallsToRun.length === 0) {
      break;
    }

    if (onStatusChange) {
      const toolLabels = toolCallsToRun
        .map((tc) => getFriendlyToolLabel(tc.function.name))
        .join(', ');
      onStatusChange(`Đang truy vấn cơ sở dữ liệu: ${toolLabels}...`);
    }

    currentMessages.push({
      role: 'assistant',
      content: fullResponse || null,
      tool_calls: toolCallsToRun,
    });

    for (const tc of toolCallsToRun) {
      let args: Record<string, any> = {};
      try {
        args = JSON.parse(tc.function.arguments || '{}');
      } catch {}

      onToolCall?.({
        id: tc.id,
        name: tc.function.name,
        args,
      });

      const normalizedToolName = normalizeToolName(tc.function.name);
      const isLocalDbTool = AI_DATABASE_TOOLS.some(
        (t) => normalizeToolName(t.function.name) === normalizedToolName
      );

      // Check mutation interception
      if (isMutationTool(tc.function.name, args)) {
        if (onMutationCheck) {
          const check = await onMutationCheck(tc.function.name, args);
          if (!check.proceed) {
            const cancelMsg =
              check.cancellationResult ||
              JSON.stringify({
                cancelled: true,
                message: 'Người dùng đã từ chối thao tác này (User declined confirmation). Không có dữ liệu nào bị thay đổi.',
              });
            onToolResult?.(tc.id, cancelMsg, 0);
            currentMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              name: tc.function.name,
              content: cancelMsg,
            });
            continue;
          }
        }
      }

      onStatusChange?.('Đang thực thi...');
      const toolStartTime = Date.now();
      let toolResult: string;
      try {
        if (executeToolFn) {
          toolResult = await executeToolFn(tc.function.name, args, db);
        } else if (isLocalDbTool) {
          toolResult = await executeAiTool(tc.function.name, args, db);
        } else {
          toolResult = await executeDynamicMcpTool(normalizedToolName, args, db);
        }
      } catch (toolErr: any) {
        toolResult = JSON.stringify({
          error: `Lỗi thực thi công cụ '${tc.function.name}': ${toolErr?.message || String(toolErr)}`,
        });
      }
      const toolDuration = Date.now() - toolStartTime;
      onToolResult?.(tc.id, toolResult, toolDuration);

      if (tc.function.name === 'generate_file' || tc.function.name === 'generate_pptx') {
        try {
          const parsedRes = JSON.parse(toolResult);
          if (parsedRes.success && parsedRes.filename) {
            const rawArgsContent =
              args?.content ||
              args?.markdownContent ||
              (Array.isArray(args?.slides) ? JSON.stringify(args.slides) : undefined);
            const generated: ChatGeneratedFile = {
              id: tc.id,
              filename: parsedRes.filename,
              format: parsedRes.format || 'txt',
              sizeBytes: parsedRes.sizeBytes || 0,
              slideCount: parsedRes.slideCount,
              content: parsedRes.content || rawArgsContent,
            };
            generatedFiles.push(generated);
            onFileGenerated?.(generated);
          }
        } catch {}
      }

      currentMessages.push({
        role: 'tool',
        tool_call_id: tc.id,
        name: tc.function.name,
        content: toolResult,
      });
    }

    onStatusChange?.('Đang tổng hợp thông tin...');
  }

  // Final synthesis pass if tools were called, or response is empty after tools ran
  if (lastHadToolCalls || (!fullResponse.trim() && loopCount > 1)) {
    onStatusChange?.('Đang tổng hợp câu trả lời hoàn chỉnh...');
    fullResponse = '';

    const synthesisMessages: ChatCompletionMessage[] = [
      ...pruneToolOutputsInMessages(currentMessages),
      {
        role: 'user',
        content: synthesisPrompt,
      },
    ];

    const synthesisStream = streamChatEvents({
      endpoint,
      apiKey,
      payload: {
        model,
        messages: synthesisMessages,
        temperature,
      },
      ...(signal ? { signal } : {}),
    });

    for await (const chunk of synthesisStream) {
      if (chunk.type === 'text') {
        fullResponse += chunk.delta;
        onTextChunk?.(chunk.delta);
      } else if (chunk.type === 'usage' && chunk.usage) {
        accumulatedTokenUsage = {
          promptTokens: (accumulatedTokenUsage.promptTokens || 0) + (chunk.usage.promptTokens || 0),
          completionTokens: (accumulatedTokenUsage.completionTokens || 0) + (chunk.usage.completionTokens || 0),
          totalTokens: (accumulatedTokenUsage.totalTokens || 0) + (chunk.usage.totalTokens || 0),
        };
        onUsage?.(chunk.usage);
      }
    }
  }

  const cleanResponse = stripThinkingBlocks(fullResponse);

  return {
    fullResponse,
    cleanResponse,
    messages: currentMessages,
    tokenUsage: accumulatedTokenUsage,
    generatedFiles,
  };
}
