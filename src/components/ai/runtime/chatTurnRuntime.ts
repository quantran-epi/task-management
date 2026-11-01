import type { TaskPlannerDatabase } from '../../../db';
import type { ChatMessage, ChatTokenUsage } from '../../../types/models';
import {
  runAiOrchestratorLoop,
  dispatchAiToolCall,
  type AiOrchestratorLoopResult,
} from '../../../services/ai/aiOrchestratorLoop';
import { saveMessage } from '../../../db/repositories/chatRepo';
import { describeToolMutationWithContext } from '../../../services/ai/aiTools';
import { stripThinkingBlocks } from '../../../services/ai/nineRouterClient';

export type ChatTurnStatus =
  | 'idle'
  | 'preparing'
  | 'streaming'
  | 'tool'
  | 'synthesizing'
  | 'awaiting-approval'
  | 'complete'
  | 'error'
  | 'aborted';

export type ChatTurnPhase = 'complete' | 'cancelled' | 'aborted' | 'error';

export interface ChatTurnToolEvent {
  id: string;
  name: string;
  phase: 'call' | 'result';
  durationMs?: number;
  result?: string;
}

export interface ChatTurnApprovalInfo {
  toolName: string;
  summary: string;
}

export interface ChatTurnErrorInfo {
  code: string;
  message: string;
}

export interface ChatTurnRequest {
  threadId: string;
  scopeKey: string;
  text: string;
  retryUserMessageId?: string;
  analysisMode: boolean;
  autoApprove: boolean;
  model: string;
  endpoint: string;
  apiKey: string;
  systemMessages: Array<{ role: 'system'; content: string }>;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  tools: unknown[];
}

export interface ChatTurnOutcome {
  phase: ChatTurnPhase;
  requestId: string;
  userMessageId: string | null;
  content?: string;
  cancellationResult?: string;
  error?: ChatTurnErrorInfo;
}

export interface ChatTurnRuntimeDeps {
  runLoop: typeof runAiOrchestratorLoop;
  saveMessage: typeof saveMessage;
  describeMutation: typeof describeToolMutationWithContext;
  db: TaskPlannerDatabase;
  onStatus?: (status: ChatTurnStatus) => void;
  onDelta?: (text: string) => void;
  onToolEvent?: (event: ChatTurnToolEvent) => void;
  onAwaitingApproval?: (info: ChatTurnApprovalInfo) => void;
  onCompleted?: (message: { content: string; tokenUsage: ChatTokenUsage }) => void;
  onError?: (error: ChatTurnErrorInfo) => void;
}

export interface ChatTurnRuntime {
  start(request: ChatTurnRequest): Promise<ChatTurnOutcome>;
  retry(): Promise<ChatTurnOutcome>;
  abort(): void;
  resolveApproval(approved: boolean): void;
  getStatus(): ChatTurnStatus;
  isRunning(): boolean;
}

/** UI-SPEC AI-turn-failure copy with every provider detail stripped (T-25.3-23). */
export const SANITIZED_TURN_ERROR =
  "Không thể xử lý yêu cầu: lỗi kết nối nhà cung cấp AI. Bấm 'Thử lại' để gửi lại lượt này mà không mất ngữ cảnh.";

const ANALYSIS_MODE_CANCELLATION = JSON.stringify({
  cancelled: true,
  message: 'Analysis Mode chỉ đọc; không có dữ liệu nào bị thay đổi.',
});

const DECLINED_CANCELLATION = JSON.stringify({
  cancelled: true,
  message: 'Người dùng đã từ chối thao tác này. Không có dữ liệu nào bị thay đổi.',
});

const SYNTHESIS_STATUS_MARKER = 'tổng hợp';

function isAbortError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { name?: string }).name === 'AbortError'
  );
}

export function createChatTurnRuntime(deps: ChatTurnRuntimeDeps): ChatTurnRuntime {
  let status: ChatTurnStatus = 'idle';
  let running = false;
  let requestId: string | null = null;
  let controller: AbortController | null = null;
  let approvalResolver: ((approved: boolean) => void) | null = null;
  let declined = false;
  let lastRequest: ChatTurnRequest | null = null;
  let lastUserMessageId: string | null = null;

  const publish = (next: ChatTurnStatus) => {
    if (status === next) return;
    status = next;
    deps.onStatus?.(next);
  };

  const isCurrent = (id: string, ctrl: AbortController) =>
    requestId === id && !ctrl.signal.aborted;

  const resolveApproval = (approved: boolean) => {
    const resolver = approvalResolver;
    approvalResolver = null;
    if (!approved) declined = true;
    resolver?.(approved);
  };

  const abort = () => {
    if (!running) return;
    controller?.abort();
    // A turn parked on an approval must not stay parked after abort.
    resolveApproval(false);
    declined = false;
    publish('aborted');
  };

  const start = async (request: ChatTurnRequest): Promise<ChatTurnOutcome> => {
    if (running) throw new Error('TURN_IN_PROGRESS');

    running = true;
    declined = false;
    approvalResolver = null;
    lastRequest = request;
    const turnId = crypto.randomUUID();
    const turnController = new AbortController();
    requestId = turnId;
    controller = turnController;

    // Published before the first await so the host can paint loading feedback (D-19).
    publish('preparing');

    let userMessageId: string | null = null;

    try {
      if (request.retryUserMessageId) {
        const candidate = (await deps.db.chatMessages.get(
          request.retryUserMessageId
        )) as ChatMessage | undefined;
        if (
          candidate &&
          candidate.role === 'user' &&
          candidate.threadId === request.threadId &&
          candidate.content === request.text
        ) {
          userMessageId = candidate.id;
        }
      }
      if (!userMessageId) {
        const saved = await deps.saveMessage(
          { threadId: request.threadId, role: 'user', content: request.text },
          deps.db
        );
        userMessageId = saved.id;
      }
      lastUserMessageId = userMessageId;

      if (!isCurrent(turnId, turnController)) {
        publish('aborted');
        return { phase: 'aborted', requestId: turnId, userMessageId };
      }

      let fullResponse = '';
      let tokenUsage: ChatTokenUsage = {};
      let cancellationResult: string | undefined;

      const result: AiOrchestratorLoopResult = await deps.runLoop({
        endpoint: request.endpoint,
        apiKey: request.apiKey,
        model: request.model,
        messages: [
          ...request.systemMessages,
          ...request.history,
          { role: 'user', content: request.text },
        ],
        tools: request.tools as any[],
        maxLoops: 30,
        db: deps.db,
        signal: turnController.signal,
        ...(request.analysisMode
          ? { keepRecentToolOutputs: 20, maxOldToolChars: 100_000 }
          : {}),
        compactAtRatio: request.analysisMode ? 0.9 : 0.75,
        executeToolFn: (name, args, toolDb, signal) =>
          dispatchAiToolCall(name, args, toolDb, signal, {
            allowMutation: request.autoApprove,
          }),
        onTextChunk: (delta) => {
          fullResponse += delta;
          publish('streaming');
          deps.onDelta?.(delta);
        },
        onStatusChange: (loopStatus) => {
          if (loopStatus && loopStatus.includes(SYNTHESIS_STATUS_MARKER)) {
            publish('synthesizing');
          }
        },
        onUsage: (usage) => {
          tokenUsage = {
            promptTokens: (tokenUsage.promptTokens || 0) + (usage.promptTokens || 0),
            completionTokens: (tokenUsage.completionTokens || 0) + (usage.completionTokens || 0),
            totalTokens: (tokenUsage.totalTokens || 0) + (usage.totalTokens || 0),
          };
        },
        onToolCall: (call) => {
          publish('tool');
          deps.onToolEvent?.({ id: call.id, name: call.name, phase: 'call' });
        },
        onToolResult: (callId, toolResult, durationMs) => {
          publish('tool');
          deps.onToolEvent?.({
            id: callId,
            name: callId,
            phase: 'result',
            durationMs,
            result: toolResult,
          });
        },
        onMutationCheck: async (toolName, args) => {
          // Fixed guard order (T-25.3-21): read-only cancel, auto-approve, explicit wait.
          if (request.analysisMode) {
            cancellationResult = ANALYSIS_MODE_CANCELLATION;
            return { proceed: false, cancellationResult: ANALYSIS_MODE_CANCELLATION };
          }
          if (request.autoApprove) {
            return { proceed: true };
          }
          const summary = await deps.describeMutation(toolName, args, deps.db);
          publish('awaiting-approval');
          deps.onAwaitingApproval?.({ toolName, summary });
          const approved = await new Promise<boolean>((resolve) => {
            approvalResolver = resolve;
          });
          if (!approved) cancellationResult = DECLINED_CANCELLATION;
          return approved
            ? { proceed: true }
            : { proceed: false, cancellationResult: DECLINED_CANCELLATION };
        },
      });

      fullResponse = result.fullResponse || fullResponse;
      tokenUsage = result.tokenUsage || tokenUsage;

      if (!isCurrent(turnId, turnController)) {
        publish('aborted');
        return { phase: 'aborted', requestId: turnId, userMessageId };
      }

      if (declined) {
        publish('complete');
        return {
          phase: 'cancelled',
          requestId: turnId,
          userMessageId,
          ...(cancellationResult ? { cancellationResult } : {}),
        };
      }

      const clean = stripThinkingBlocks(fullResponse);
      if (!clean.trim()) {
        const error: ChatTurnErrorInfo = {
          code: 'invalid_response',
          message: SANITIZED_TURN_ERROR,
        };
        publish('error');
        deps.onError?.(error);
        return { phase: 'error', requestId: turnId, userMessageId, error };
      }

      // Only a validated complete turn reaches IndexedDB (T-25.3-22).
      await deps.saveMessage(
        {
          threadId: request.threadId,
          role: 'assistant',
          content: clean,
          tokenUsage,
        },
        deps.db
      );

      publish('complete');
      deps.onCompleted?.({ content: clean, tokenUsage });
      return { phase: 'complete', requestId: turnId, userMessageId, content: clean };
    } catch (err) {
      if (isAbortError(err) || turnController.signal.aborted) {
        publish('aborted');
        return { phase: 'aborted', requestId: turnId, userMessageId };
      }
      const error: ChatTurnErrorInfo = {
        code: 'request_failed',
        message: SANITIZED_TURN_ERROR,
      };
      publish('error');
      deps.onError?.(error);
      return { phase: 'error', requestId: turnId, userMessageId, error };
    } finally {
      if (controller === turnController) {
        controller = null;
        approvalResolver = null;
        running = false;
      }
    }
  };

  const retry = async (): Promise<ChatTurnOutcome> => {
    if (!lastRequest) throw new Error('NO_TURN_TO_RETRY');
    return start({
      ...lastRequest,
      ...(lastUserMessageId ? { retryUserMessageId: lastUserMessageId } : {}),
    });
  };

  return {
    start,
    retry,
    abort,
    resolveApproval,
    getStatus: () => status,
    isRunning: () => running,
  };
}
