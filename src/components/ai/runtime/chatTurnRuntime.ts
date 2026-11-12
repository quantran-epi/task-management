import type { TaskPlannerDatabase } from '../../../db';
import type { ChatGeneratedFile, ChatMessage, ChatTokenUsage } from '../../../types/models';
import {
  runAiOrchestratorLoop,
  dispatchAiToolCall,
  DEFAULT_MAX_TOOL_ROUNDS,
  type AiOrchestratorLoopResult,
} from '../../../services/ai/aiOrchestratorLoop';
import { saveMessage } from '../../../db/repositories/chatRepo';
import { describeToolMutationWithContext, normalizeToolName } from '../../../services/ai/aiTools';
import { stripThinkingBlocks } from '../../../services/ai/nineRouterClient';
import type { ChatCompletionMessage } from '../../../services/ai/types';
import {
  preparePatch,
  type ArtifactPatchProposal,
  type ArtifactToolRefusal,
  type ArtifactToolResult,
} from '../../../services/ai/patchProposal';

export type ChatTurnStatus =
  | 'idle'
  | 'preparing'
  | 'streaming'
  | 'tool'
  | 'synthesizing'
  | 'awaiting-approval'
  | 'complete'
  | 'tool-limit'
  | 'error'
  | 'aborted';

export type ChatTurnPhase = 'complete' | 'cancelled' | 'aborted' | 'error' | 'tool-limit';

export interface ChatTurnToolEvent {
  id: string;
  name: string;
  phase: 'call' | 'result';
  durationMs?: number;
  /** Serialized tool arguments (D-04: expandable details, never auto-expanded). */
  args?: string;
  result?: string;
}

export interface ChatTurnApprovalInfo {
  toolName: string;
  summary: string;
  /** Prepared, immutable artifact patch shown in the diff card. */
  patch?: ArtifactPatchProposal;
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
  maxTokens?: number;
  maxToolRounds?: number;
  /** Provider context window, when the host resolves one (auto-compaction threshold). */
  contextWindowTokens?: number;
  /** WR-19: CR this turn is bound to; tool calls outside it are rejected. */
  crScopeId?: string;
  /** Phase 34 D-31: AI Office attribution forwarded into the persisted assistant row. */
  agentId?: string | undefined;
  agentName?: string | undefined;
  agentKind?: 'lead' | 'employee' | undefined;
  messageKind?: 'instruction' | 'report' | 'synthesis' | 'plan' | undefined;
  /** D-12: employee turns write no user row, so concurrent turns cannot fake human bubbles. */
  persistUserMessage?: boolean | undefined;
  /** D-12: `read-only` refuses every mutation before the artifact and auto-approve branches. */
  mutationPolicy?: 'approve' | 'read-only' | undefined;
  /**
   * D-09/D-21: awaited at every loop round boundary including round 1, with the turn
   * signal. Messages it returns are appended by the loop before the next model call.
   */
  beforeToolRound?:
    | ((round: number, signal: AbortSignal) => Promise<ChatCompletionMessage[] | void>)
    | undefined;
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
  /** Prepares the artifact patch shown before approval; injectable for tests. */
  preparePatch?: typeof preparePatch;
  db: TaskPlannerDatabase;
  onStatus?: (status: ChatTurnStatus) => void;
  onDelta?: (text: string) => void;
  onToolEvent?: (event: ChatTurnToolEvent) => void;
  onAwaitingApproval?: (info: ChatTurnApprovalInfo) => void;
  onCompleted?: (message: { content: string; tokenUsage: ChatTokenUsage }) => void;
  onError?: (error: ChatTurnErrorInfo) => void;
  /** Tool-produced files, forwarded to the host so it can keep rendering them. */
  onFileGenerated?: (file: ChatGeneratedFile) => void;
  /** Cumulative per-turn usage, so a coordinator never re-sums round deltas. */
  onUsage?: (usage: ChatTokenUsage) => void;
}

export interface ChatTurnRuntime {
  start(request: ChatTurnRequest): Promise<ChatTurnOutcome>;
  retry(): Promise<ChatTurnOutcome>;
  abort(): void;
  resolveApproval(approved: boolean): void;
  getStatus(): ChatTurnStatus;
  getToolLimitRounds(): number | null;
  isRunning(): boolean;
  drainPersistence(): Promise<void>;
}

/**
 * Production deps for a host that wires the standard orchestrator and chat persistence.
 * Keeps those imports out of every host component so exactly one wiring point exists.
 */
export function createDefaultChatTurnDeps(
  db: TaskPlannerDatabase
): Pick<ChatTurnRuntimeDeps, 'runLoop' | 'saveMessage' | 'describeMutation' | 'preparePatch' | 'db'> {
  return {
    runLoop: runAiOrchestratorLoop,
    saveMessage,
    describeMutation: describeToolMutationWithContext,
    preparePatch,
    db,
  };
}

/** UI-SPEC AI-turn-failure copy with every provider detail stripped (T-25.3-23). */
export const SANITIZED_TURN_ERROR =
  "Không thể xử lý yêu cầu: lỗi kết nối nhà cung cấp AI. Bấm 'Thử lại' để gửi lại lượt này mà không mất ngữ cảnh.";

export const formatToolLimitMessage = (rounds: number): string =>
  `Đã dừng thu thập bằng chứng sau ${rounds} vòng. Câu trả lời có thể chưa đầy đủ — xem danh sách công cụ bên trên hoặc thử lại với câu hỏi hẹp hơn.`;

const DECLINED_CANCELLATION = JSON.stringify({
  cancelled: true,
  message: 'Người dùng đã từ chối thao tác này. Không có dữ liệu nào bị thay đổi.',
});

const PATCH_TOOL_NAME = 'patch_artifact_section';

/** D-12: structural refusal for an employee turn, before any approval path. */
export const READ_ONLY_REFUSAL = JSON.stringify({
  cancelled: true,
  code: 'READ_ONLY_EMPLOYEE',
  message:
    'Nhân viên AI chỉ được đọc dữ liệu. Thao tác ghi này bị từ chối và không có thay đổi nào được thực hiện.',
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
  let toolLimitRounds: number | null = null;
  let requestId: string | null = null;
  let controller: AbortController | null = null;
  let approvalResolver: ((approved: boolean) => void) | null = null;
  let declined = false;
  let parkedArtifactPatch = false;
  let lastRequest: ChatTurnRequest | null = null;
  let lastUserMessageId: string | null = null;
  let pendingSave: Promise<ChatMessage> | null = null;

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
    // An artifact patch rejection records only its own decision (D-04); it must not
    // discard later successful cards in the same turn.
    if (!approved && !parkedArtifactPatch) declined = true;
    parkedArtifactPatch = false;
    resolver?.(approved);
  };

  const abort = () => {
    if (!running) return;
    controller?.abort();
    // A turn parked on an approval must not stay parked after abort.
    resolveApproval(false);
    declined = false;
    // 37.1 UAT gap 1: abort must be AUTHORITATIVE, not advisory. `running` used to clear
    // only in `start()`'s `finally`, i.e. once `deps.runLoop()` settled — and a loop parked
    // on an unabortable provider call never settles, so every later `start()` threw
    // `TURN_IN_PROGRESS` and the runtime was permanently wedged. Detaching the controller
    // here makes the late loop result a no-op: `isCurrent()` already rejects it, and
    // `start()`'s `finally` only touches `running` when `controller === turnController`.
    controller = null;
    approvalResolver = null;
    running = false;
    publish('aborted');
  };

  const start = async (request: ChatTurnRequest): Promise<ChatTurnOutcome> => {
    if (running) throw new Error('TURN_IN_PROGRESS');

    running = true;
    toolLimitRounds = null;
    const requestedRounds = request.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS;
    const maxToolRounds = Number.isFinite(requestedRounds) && requestedRounds > 0
      ? Math.max(1, Math.floor(requestedRounds))
      : DEFAULT_MAX_TOOL_ROUNDS;
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
      if (!isCurrent(turnId, turnController)) {
        return { phase: 'aborted', requestId: turnId, userMessageId };
      }
      if (!userMessageId && request.persistUserMessage !== false) {
        const saved = await (pendingSave = deps.saveMessage(
          { threadId: request.threadId, role: 'user', content: request.text },
          deps.db
        ));
        userMessageId = saved.id;
      }
      if (userMessageId) lastUserMessageId = userMessageId;

      if (!isCurrent(turnId, turnController)) {
        publish('aborted');
        return { phase: 'aborted', requestId: turnId, userMessageId };
      }

      let fullResponse = '';
      let tokenUsage: ChatTokenUsage = {};
      let cancellationResult: string | undefined;
      // Tool badges must name the tool on the result event too; the loop only reports the call id.
      const toolNames = new Map<string, string>();
      // Thinking blocks are never shown; the host receives only the newly visible remainder.
      let displayed = '';
      const generatedFiles: ChatGeneratedFile[] = [];
      const startedAt = Date.now();
      // Request-local caches: the serialized loop reports each call's id before it is
      // checked and dispatched, so a prepared proposal is keyed by that exact call.
      let currentCallId: string | null = null;
      const preparedPatches = new Map<string, ArtifactPatchProposal>();
      const preparePatchFn = deps.preparePatch ?? preparePatch;

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
        maxLoops: maxToolRounds,
        ...(typeof request.maxTokens === 'number' && Number.isFinite(request.maxTokens) && request.maxTokens > 0
          ? { maxTokens: request.maxTokens }
          : {}),
        db: deps.db,
        signal: turnController.signal,
        // 37.1 §4.2: `beforeToolRound` is the ONE way a message reaches a running turn.
        // The coordinator's drain reads the durable log and returns what to append.
        ...(request.beforeToolRound
          ? { beforeToolRound: (r: number) => request.beforeToolRound!(r, turnController.signal) }
          : {}),
        ...(request.analysisMode
          ? { keepRecentToolOutputs: 20, maxOldToolChars: 100_000 }
          : {}),
        compactAtRatio: request.analysisMode ? 0.9 : 0.75,
        ...(request.contextWindowTokens ? { contextWindowTokens: request.contextWindowTokens } : {}),
        executeToolFn: (name, args, toolDb, signal) => {
          // Post-approve execution returns the exact prepared proposal, never a recompute
          // against an editor that may have moved on (T-27-02).
          const callId = currentCallId;
          const prepared = callId ? preparedPatches.get(callId) : undefined;
          if (prepared) return Promise.resolve(JSON.stringify(prepared));
          return dispatchAiToolCall(name, args, toolDb, signal, {
            allowMutation: request.autoApprove,
            ...(request.crScopeId ? { crScopeId: request.crScopeId } : {}),
          });
        },
        onTextChunk: (delta) => {
          if (!isCurrent(turnId, turnController)) return;
          fullResponse += delta;
          const stripped = stripThinkingBlocks(fullResponse);
          if (stripped.length > displayed.length) {
            const visibleDelta = stripped.slice(displayed.length);
            displayed = stripped;
            publish('streaming');
            deps.onDelta?.(visibleDelta);
          }
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
          deps.onUsage?.(tokenUsage);
        },
        onToolCall: (call) => {
          publish('tool');
          currentCallId = call.id;
          toolNames.set(call.id, call.name);
          deps.onToolEvent?.({
            id: call.id,
            name: call.name,
            phase: 'call',
            args: JSON.stringify(call.args ?? {}),
          });
        },
        onToolResult: (callId, toolResult, durationMs) => {
          publish('tool');
          deps.onToolEvent?.({
            id: callId,
            name: toolNames.get(callId) ?? callId,
            phase: 'result',
            durationMs,
            result: toolResult,
          });
        },
        onFileGenerated: (file) => {
          generatedFiles.push(file);
          deps.onFileGenerated?.(file);
        },
        onMutationCheck: async (toolName, args) => {
          // D-12: an employee turn is structurally read-only. This must precede the
          // artifact branch and autoApprove — a hallucinated mutation name still
          // matches isMutationTool and would otherwise park an approvable card.
          if (request.mutationPolicy === 'read-only') {
            return { proceed: false, cancellationResult: READ_ONLY_REFUSAL };
          }
          // Fixed guard order (T-25.3-21): artifact patch, auto-approve, explicit wait.
          // Analysis Mode is a prompt preference only; it never blocks or bypasses execution.
          if (normalizeToolName(toolName) === PATCH_TOOL_NAME) {
            const callId = currentCallId;
            const prepared: ArtifactToolResult = await preparePatchFn(deps.db, args);
            if (!isCurrent(turnId, turnController)) {
              return { proceed: false, cancellationResult: DECLINED_CANCELLATION };
            }
            if ((prepared as ArtifactToolRefusal).refused === true) {
              // Structured refusals surface immediately; nothing to approve (D-10).
              return { proceed: false, cancellationResult: JSON.stringify(prepared) };
            }
            const proposal = prepared as ArtifactPatchProposal;
            if (callId) preparedPatches.set(callId, proposal);

            const summary = await deps.describeMutation(toolName, args, deps.db);
            if (!isCurrent(turnId, turnController)) {
              return { proceed: false, cancellationResult: DECLINED_CANCELLATION };
            }
            parkedArtifactPatch = true;
            // Resolver is installed before publishing so a synchronous subscriber
            // cannot lose the click.
            const approved = await new Promise<boolean>((resolve) => {
              approvalResolver = resolve;
              publish('awaiting-approval');
              deps.onAwaitingApproval?.({ toolName, summary, patch: proposal });
            });
            parkedArtifactPatch = false;
            if (approved) return { proceed: true };
            const rejectedJson = JSON.stringify({
              cancelled: true,
              message: 'Người dùng đã từ chối đề xuất chỉnh sửa này. Trình soạn thảo không thay đổi.',
            });
            if (callId) preparedPatches.delete(callId);
            return { proceed: false, cancellationResult: rejectedJson };
          }

          // Analysis Mode does not gate execution: auto-approve still wins when the user enabled it.
          if (request.autoApprove) {
            return { proceed: true };
          }
          const summary = await deps.describeMutation(toolName, args, deps.db);
          if (!isCurrent(turnId, turnController)) return { proceed: false, cancellationResult: DECLINED_CANCELLATION };
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

      if (result.loopLimitReached) {
        toolLimitRounds = maxToolRounds;
        publish('tool-limit');
        return {
          phase: 'tool-limit', requestId: turnId, userMessageId,
          error: { code: 'tool_limit', message: formatToolLimitMessage(maxToolRounds) },
        };
      }

      if (result.truncated) {
        const error: ChatTurnErrorInfo = {
          code: 'truncated',
          message: "Phản hồi của nhà cung cấp AI đã chạm giới hạn độ dài; nội dung chưa hoàn chỉnh không được lưu. Bấm 'Thử lại' hoặc điều chỉnh giới hạn đầu ra rồi gửi lại.",
        };
        publish('error');
        deps.onError?.(error);
        return { phase: 'error', requestId: turnId, userMessageId, error };
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
      await (pendingSave = deps.saveMessage(
        {
          threadId: request.threadId,
          role: 'assistant',
          content: clean,
          tokenUsage,
          durationMs: Date.now() - startedAt,
          ...(generatedFiles.length > 0 ? { generatedFiles } : {}),
          ...(request.agentId ? { agentId: request.agentId } : {}),
          ...(request.agentName ? { agentName: request.agentName } : {}),
          ...(request.agentKind ? { agentKind: request.agentKind } : {}),
          ...(request.messageKind ? { messageKind: request.messageKind } : {}),
        },
        deps.db
      ));
      if (!isCurrent(turnId, turnController)) {
        return { phase: 'aborted', requestId: turnId, userMessageId };
      }

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
    getToolLimitRounds: () => toolLimitRounds,
    isRunning: () => running,
    // Chỉ chờ write đã bắt đầu, không chờ provider có thể bỏ qua abort.
    drainPersistence: async () => { await pendingSave?.catch(() => {}); },
  };
}
