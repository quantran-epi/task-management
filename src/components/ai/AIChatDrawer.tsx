import React, { useState, useEffect, useRef, useCallback } from 'react';
import { theme, Button, message, Modal } from 'antd';
import { DisconnectOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { ChatScopeType, ChatThread, ChatMessage } from '../../types/models';
import {
  buildScopeKey,
  createOrGetThread,
  saveMessage,
  getMessagesByThreadId,
  clearThreadContext,
  clearThreadMessages,
  clearAllChatHistory,
} from '../../db/repositories/chatRepo';
import {
  getNineRouterApiKey,
  getNineRouterConfig,
  setNineRouterConfig,
  fetchAvailableModels,
} from '../../services/ai/nineRouterTokenService';
import { streamChatEvents, streamChatCompletion } from '../../services/ai/nineRouterClient';
import {
  buildItemContextPrompt,
  buildGlobalContextPrompt,
  serializeDocumentContext,
  extractMentionedEntityIds,
} from '../../services/ai/contextGrounding';
import {
  pruneToolOutputsInMessages,
  selectMessagesWithinBudget,
} from '../../services/ai/historyPruning';
import {
  AI_DATABASE_TOOLS,
  type AiToolDefinition,
  executeAiTool,
  isMutationTool,
  describeToolMutationWithContext,
  normalizeToolName,
} from '../../services/ai/aiTools';
import {
  getMcpServers,
  discoverAllMcpTools,
  executeDynamicMcpTool,
  getEnabledMcpInstructions,
  toggleMcpServer,
  type McpServerConfig,
} from '../../services/ai/mcpClient';
import type { ChatCompletionMessage, ToolCall } from '../../services/ai/types';
import { launchClaudeTerminal } from '../../services/ai/claudeCliService';
import { updateTask, getTask } from '../../db/repositories/taskRepo';
import { createNote } from '../../db/repositories/noteRepo';
import { getProject } from '../../db/repositories/projectRepo';
import { getMilestone } from '../../db/repositories/milestoneRepo';
import { getTodayDateString } from '../../utils/date';
import dayjs from 'dayjs';
import { ChatHeader } from './ChatHeader';
import { ChatMessageList } from './ChatMessageList';
import { ChatInputBar } from './ChatInputBar';
import { ScopePickerModal } from './ScopePickerModal';
import { AIDebugModal } from './AIDebugModal';
import { AITaskPlannerInstructionsModal } from './AITaskPlannerInstructionsModal';
import { McpSettingsModal } from './McpSettingsModal';
import { aiDebugService } from '../../services/ai/aiDebugService';
import { APP_NAME } from '../../constants/app';
import { useAIChat } from '../../context/AIChatContext';
import { openAiPopout } from '../../utils/aiPopout';
import {
  sendDesktopNotification,
  isNotificationPermissionGranted,
  requestNotificationPermission,
} from '../../utils/desktopNotification';

export const AI_CHAT_WIDTH_KEY = 'planner:ai_chat_width';
export const AI_AUTO_APPROVE_MUTATIONS_KEY = 'planner:ai_auto_approve_mutations';
export const DEFAULT_AI_CHAT_WIDTH = 380;
export const MIN_AI_CHAT_WIDTH = 320;
export const MAX_AI_CHAT_WIDTH = 650;

export interface ActiveScope {
  type: ChatScopeType;
  id?: string | undefined;
  title?: string | undefined;
}

export interface AIChatDrawerProps {
  open: boolean;
  onClose: () => void;
  isPinned?: boolean;
  onTogglePin?: () => void;
  activeScope?: ActiveScope;
  db?: TaskPlannerDatabase;
  width?: number;
  onWidthChange?: (width: number) => void;
  onOpenSettings?: () => void;
  isMobile?: boolean;
  onPopout?: () => void;
  isPopoutWindow?: boolean;
}

export const AIChatDrawer: React.FC<AIChatDrawerProps> = ({
  open,
  onClose,
  isPinned = false,
  onTogglePin,
  activeScope: propScope,
  db = defaultDb,
  width: controlledWidth,
  onWidthChange,
  onOpenSettings,
  isMobile = false,
  onPopout,
  isPopoutWindow = false,
}) => {
  const { token } = theme.useToken();
  const { pendingPrompt, clearPendingPrompt, setCustomScope } = useAIChat();

  // Width management with drag-resize clamping
  const [internalWidth, setInternalWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_AI_CHAT_WIDTH;
    try {
      const stored = localStorage.getItem(AI_CHAT_WIDTH_KEY);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed)) {
          return Math.max(MIN_AI_CHAT_WIDTH, Math.min(MAX_AI_CHAT_WIDTH, parsed));
        }
      }
    } catch {}
    return DEFAULT_AI_CHAT_WIDTH;
  });

  const width = controlledWidth ?? internalWidth;

  const updateWidth = useCallback(
    (newWidth: number) => {
      const clamped = Math.max(MIN_AI_CHAT_WIDTH, Math.min(MAX_AI_CHAT_WIDTH, newWidth));
      setInternalWidth(clamped);
      try {
        localStorage.setItem(AI_CHAT_WIDTH_KEY, String(clamped));
      } catch {}
      onWidthChange?.(clamped);
    },
    [onWidthChange]
  );

  // Drag handle state
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(width);

  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      // Moving left increases drawer width
      const delta = startXRef.current - moveEvent.clientX;
      updateWidth(startWidthRef.current + delta);
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Scope management: internal state, detachment, or picker selection
  const [internalScope, setInternalScope] = useState<ActiveScope | null>(null);
  const [isDetached, setIsDetached] = useState(false);
  const [scopeModalOpen, setScopeModalOpen] = useState(false);
  const [isDebugModalOpen, setIsDebugModalOpen] = useState(false);
  const [isInstructionsOpen, setIsInstructionsOpen] = useState(false);
  const [isMcpModalOpen, setIsMcpModalOpen] = useState(false);
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([]);
  const [sessionAttachedFiles, setSessionAttachedFiles] = useState<string[]>([]);

  // Reload MCP servers on open or change
  const reloadMcpServers = useCallback(async () => {
    try {
      const list = await getMcpServers(db);
      setMcpServers(list);
    } catch (err) {
      console.warn('[AIChatDrawer] Failed to load MCP servers:', err);
    }
  }, [db]);

  useEffect(() => {
    if (open) {
      void reloadMcpServers();
    }
  }, [open, reloadMcpServers]);

  const handleToggleMcpServer = async (id: string, enabled: boolean) => {
    try {
      const next = await toggleMcpServer(id, enabled, db);
      setMcpServers(next);
      message.success(
        enabled ? 'Đã bật máy chủ MCP' : 'Đã tắt máy chủ MCP'
      );
    } catch (err: any) {
      message.error(`Không thể đổi trạng thái MCP: ${err?.message || err}`);
    }
  };

  const handleAttachFile = (filePath: string) => {
    setSessionAttachedFiles((prev) => (prev.includes(filePath) ? prev : [...prev, filePath]));
  };

  const handleRemoveFile = (filePath: string) => {
    setSessionAttachedFiles((prev) => prev.filter((p) => p !== filePath));
  };

  // Sync propScope when it changes (unless user explicitly picked or detached)
  useEffect(() => {
    if (propScope) {
      setInternalScope(propScope);
      setIsDetached(false);
    }
  }, [propScope?.type, propScope?.id, propScope?.title]);

  // Request notification permission if not yet granted so completion alerts can be dispatched
  useEffect(() => {
    if (open) {
      void (async () => {
        try {
          const granted = await isNotificationPermissionGranted();
          if (!granted) {
            await requestNotificationPermission();
          }
        } catch {
          // ignore notification permission error
        }
      })();
    }
  }, [open]);

  const currentScope: ActiveScope = isDetached || !internalScope
    ? { type: 'global' }
    : internalScope;

  const scopeKey = buildScopeKey(currentScope.type, currentScope.id);

  // Model & Token settings
  const [selectedModel, setSelectedModel] = useState<string>('gpt-4o');
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;

    async function loadModels() {
      const cfg = await getNineRouterConfig(db);
      const rec = await db.settings.get('ninerouter_cached_models');
      const cached = Array.isArray(rec?.value) ? (rec.value as string[]) : [];

      if (!mounted) return;

      if (cached.length > 0) {
        setAvailableModels(cached);
        if (cfg.defaultModel && cached.includes(cfg.defaultModel)) {
          setSelectedModel(cfg.defaultModel);
        } else if (cached[0]) {
          setSelectedModel(cached[0]);
        }
      } else if (cfg.defaultModel) {
        setSelectedModel(cfg.defaultModel);
      }

      if (open) {
        try {
          const liveModels = await fetchAvailableModels(db);
          if (mounted && liveModels.length > 0) {
            setAvailableModels(liveModels);
            setSelectedModel((prev) => {
              if (liveModels.includes(prev)) return prev;
              if (cfg.defaultModel && liveModels.includes(cfg.defaultModel)) return cfg.defaultModel;
              return liveModels[0] ?? prev;
            });
          }
        } catch {
          // ignore background fetch error
        }
      }
    }

    loadModels();
    return () => {
      mounted = false;
    };
  }, [db, open]);

  const handleModelChange = async (model: string) => {
    setSelectedModel(model);
    await setNineRouterConfig({ defaultModel: model }, db);
  };

  // Thread & message live query
  const thread = useLiveQuery<ChatThread | undefined>(() => {
    return db.chatThreads.where('scopeKey').equals(scopeKey).first();
  }, [db, scopeKey]);

  const messages = useLiveQuery<ChatMessage[]>(() => {
    if (!thread?.id) return [];
    return getMessagesByThreadId(thread.id, db);
  }, [db, thread?.id]) ?? [];

  // Streaming & error state
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [streamingStatus, setStreamingStatus] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [lastSubmittedText, setLastSubmittedText] = useState('');
  const [scrollTrigger, setScrollTrigger] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Mutation action confirmation state & ref
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    toolName: string;
    summary: string;
    args?: Record<string, any>;
  } | null>(null);
  const pendingConfirmationRef = useRef<{
    resolve: (confirmed: boolean) => void;
  } | null>(null);

  // Auto-approve mutation toggle (bypasses confirmation modal if explicitly enabled by user)
  const [autoApproveMutations, setAutoApproveMutations] = useState<boolean>(() => {
    try {
      return localStorage.getItem(AI_AUTO_APPROVE_MUTATIONS_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const handleToggleAutoApproveMutations = useCallback(() => {
    setAutoApproveMutations((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(AI_AUTO_APPROVE_MUTATIONS_KEY, String(next));
      } catch {
        // ignore storage error
      }
      if (next) {
        message.warning(
          'Đã bật tự động duyệt thay đổi dữ liệu (Auto-approve mutations). AI sẽ tự động thực thi và báo cáo chi tiết.'
        );
      } else {
        message.info(
          'Đã tắt tự động duyệt. AI sẽ hỏi xác nhận trước khi thực hiện thay đổi dữ liệu.'
        );
      }
      return next;
    });
  }, []);

  const handleConfirmAction = useCallback((confirmed: boolean) => {
    if (pendingConfirmationRef.current) {
      pendingConfirmationRef.current.resolve(confirmed);
      pendingConfirmationRef.current = null;
    }
    setPendingConfirmation(null);
  }, []);

  // Abort stream on unmount or drawer close
  useEffect(() => {
    if (!open) {
      if (pendingConfirmationRef.current) {
        pendingConfirmationRef.current.resolve(false);
        pendingConfirmationRef.current = null;
        setPendingConfirmation(null);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    }
  }, [open]);

  const handleStopGeneration = () => {
    if (pendingConfirmationRef.current) {
      pendingConfirmationRef.current.resolve(false);
      pendingConfirmationRef.current = null;
      setPendingConfirmation(null);
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleSendMessage = async (text: string, overrideScope?: ActiveScope) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Check if user is responding to an active confirmation prompt via chat input
    if (pendingConfirmationRef.current) {
      const lower = trimmed.toLowerCase();
      if (/^(yes|y|có|co|ok|được|duoc|đồng ý|dong y|xác nhận|xac nhan)$/i.test(lower)) {
        handleConfirmAction(true);
        return;
      }
      if (/^(no|n|không|khong|cancel|hủy|huy|từ chối|tu choi)$/i.test(lower)) {
        handleConfirmAction(false);
        return;
      }
    }

    if (trimmed === '/clear') {
      handleClearContext();
      return;
    }

    if (isStreaming) return;

    setScrollTrigger((prev) => prev + 1);
    setApiError(null);
    setLastSubmittedText(trimmed);

    // Gracefully request notification permission upon user interaction if not yet granted
    void (async () => {
      try {
        const granted = await isNotificationPermissionGranted();
        if (!granted) {
          await requestNotificationPermission();
        }
      } catch {
        // ignore notification permission error
      }
    })();

    // Lightweight prompt handling for slash commands allowing user to describe freely
    let effectivePrompt = trimmed;
    if (trimmed.startsWith('/plan')) {
      const extra = trimmed.replace(/^\/plan\s*/, '').trim();
      effectivePrompt = extra ? `Lập kế hoạch: ${extra}` : 'Lập kế hoạch công việc hôm nay';
    } else if (trimmed.startsWith('/status')) {
      const extra = trimmed.replace(/^\/status\s*/, '').trim();
      effectivePrompt = extra ? `Báo cáo tiến độ: ${extra}` : 'Báo cáo tiến độ hiện tại';
    } else if (trimmed.startsWith('/overdue')) {
      const extra = trimmed.replace(/^\/overdue\s*/, '').trim();
      effectivePrompt = extra ? `Kiểm tra tác vụ quá hạn: ${extra}` : 'Kiểm tra các tác vụ quá hạn';
    } else if (trimmed.startsWith('/help')) {
      const extra = trimmed.replace(/^\/help\s*/, '').trim();
      effectivePrompt = extra ? `Hướng dẫn: ${extra}` : 'Hướng dẫn sử dụng trợ lý AI và các lệnh';
    }

    const effectiveScope = overrideScope ?? currentScope;

    // 1. Ensure thread exists for effective scope
    let activeThread = overrideScope
      ? await createOrGetThread(
          {
            scopeType: effectiveScope.type,
            entityId: effectiveScope.id,
            title: effectiveScope.title,
          },
          db
        )
      : thread;

    if (!activeThread) {
      activeThread = await createOrGetThread(
        {
          scopeType: effectiveScope.type,
          entityId: effectiveScope.id,
          title: effectiveScope.title,
        },
        db
      );
    }

    // 2. Save user message
    const savedUserMsg = await saveMessage(
      {
        threadId: activeThread.id,
        role: 'user',
        content: trimmed,
      },
      db
    );

    // 3. Check API key
    const apiKey = await getNineRouterApiKey(db);
    if (!apiKey) {
      setApiError('Chưa cấu hình API Key 9router. Vui lòng mở Cài đặt AI để thiết lập.');
      return;
    }

    const config = await getNineRouterConfig(db);

    // 4. Assemble context payload (messages after last context boundary, capped at 20)
    // If scoped item exists, inject system context prompt with grounding
    let systemInstruction = '';
    if (effectiveScope.type !== 'global' && effectiveScope.id) {
      try {
        if (effectiveScope.type === 'task') {
          const t = await getTask(effectiveScope.id, db);
          if (t) {
            systemInstruction = await buildItemContextPrompt({
              entityType: 'task',
              item: t,
              db,
              charLimit: config.charLimit,
            });
          }
        } else if (effectiveScope.type === 'project') {
          const p = await getProject(effectiveScope.id, db);
          if (p) {
            systemInstruction = await buildItemContextPrompt({
              entityType: 'project',
              item: p,
              db,
              charLimit: config.charLimit,
            });
          }
        } else if (effectiveScope.type === 'milestone') {
          const m = await getMilestone(effectiveScope.id, db);
          if (m) {
            systemInstruction = await buildItemContextPrompt({
              entityType: 'milestone',
              item: m,
              db,
              charLimit: config.charLimit,
            });
          }
        } else if (effectiveScope.type === 'document') {
          const note = db.notes ? await db.notes.get(effectiveScope.id) : null;
          if (note) {
            systemInstruction = serializeDocumentContext(note);
          }
        }
      } catch (err) {
        console.warn('[AIChatDrawer] Context grounding resolution error:', err);
      }
    } else if (effectiveScope.type === 'global') {
      try {
        systemInstruction = await buildGlobalContextPrompt(db);
      } catch (err) {
        console.warn('[AIChatDrawer] Global context prompt resolution error:', err);
      }
    }

    // 4b. Extract mentioned tasks, projects, and local files from prompt and inject grounding
    const { taskIds, projectIds, filePaths } = extractMentionedEntityIds(trimmed);
    const mentionedContexts: string[] = [];

    if (filePaths && filePaths.length > 0) {
      setSessionAttachedFiles((prev) => Array.from(new Set([...prev, ...filePaths])));
    }
    const allFiles = Array.from(new Set([...sessionAttachedFiles, ...(filePaths || [])]));

    for (const tid of taskIds) {
      if (effectiveScope.type === 'task' && effectiveScope.id === tid) continue;
      try {
        const t = await getTask(tid, db);
        if (t) {
          const serialized = await buildItemContextPrompt({
            entityType: 'task',
            item: t,
            db,
            charLimit: config.charLimit,
          });
          mentionedContexts.push(serialized);
        }
      } catch (err) {
        console.warn(`[AIChatDrawer] Grounding error for task ${tid}:`, err);
      }
    }

    for (const pid of projectIds) {
      if (effectiveScope.type === 'project' && effectiveScope.id === pid) continue;
      try {
        const p = await getProject(pid, db);
        if (p) {
          const serialized = await buildItemContextPrompt({
            entityType: 'project',
            item: p,
            db,
            charLimit: config.charLimit,
          });
          mentionedContexts.push(serialized);
        }
      } catch (err) {
        console.warn(`[AIChatDrawer] Grounding error for project ${pid}:`, err);
      }
    }

    if (mentionedContexts.length > 0) {
      const mentionsBlock = `<mentioned_entities>\n[User Referenced Items Grounding]:\nThe user explicitly referenced the following items using mentions in their request. Their detailed database state is provided below for exact grounding:\n${mentionedContexts.join('\n\n')}\n</mentioned_entities>`;
      systemInstruction = systemInstruction ? `${systemInstruction}\n\n${mentionsBlock}` : mentionsBlock;
    }

    if (allFiles.length > 0) {
      const filesList = allFiles.map((fp) => `- \`${fp}\``).join('\n');
      const filesPrompt = `<referenced_files>\n[User Attached & Referenced Local Files]:\nThe following local files are attached to this chat session:\n${filesList}\nTo inspect their contents or specific lines, you have access to the \`read_file\` tool. Call \`read_file(filePath: "...", offset: 1, limit: 500)\` as needed to fulfill the request.\n</referenced_files>`;
      systemInstruction = systemInstruction ? `${systemInstruction}\n\n${filesPrompt}` : filesPrompt;
    }

    const allMsgs = await getMessagesByThreadId(activeThread.id, db);
    let boundaryIdx = -1;
    for (let i = allMsgs.length - 1; i >= 0; i--) {
      if (allMsgs[i]?.isContextBoundary) {
        boundaryIdx = i;
        break;
      }
    }
    const msgsToSend = boundaryIdx >= 0 ? allMsgs.slice(boundaryIdx + 1) : allMsgs;
    const recentMsgs: ChatCompletionMessage[] = [];

    const todayStr = getTodayDateString();
    const now = dayjs();
    const dayName = now.format('dddd');
    const timeStr = now.format('HH:mm');

    let dynamicMcpTools: AiToolDefinition[] = [];
    try {
      dynamicMcpTools = await discoverAllMcpTools(db);
    } catch (err) {
      console.warn('[AIChatDrawer] MCP discovery unavailable:', err);
    }
    const toolsForTurn = [...AI_DATABASE_TOOLS, ...dynamicMcpTools];
    let dynamicMcpInstructions = '';
    try {
      dynamicMcpInstructions = await getEnabledMcpInstructions(db);
    } catch (err) {
      console.warn('[AIChatDrawer] MCP instruction resolution error:', err);
    }

    const systemPromptContent = `You are an expert AI assistant embedded inside ${APP_NAME}.
Current Date: ${todayStr} (${dayName}). Time: ${timeStr}.

CRITICAL ANTI-HALLUCINATION RULES:
1. NEVER GUESS, ASSUME, OR INVENT DATA.
2. Every statement regarding tasks, projects, milestones, statuses, deadlines, logged work sessions, actual hours, planned allocations, capacity limits, notes, reminders, recurring schedules, or system sync state MUST be strictly grounded in concrete evidence returned by your tools or provided in context.
3. If the user asks about anything not present in the initial context (such as time spent, worklog history, daily schedule, running timer, notes, capacity, overdue items), YOU MUST CALL THE RELEVANT DATABASE TOOLS before answering.
4. If a requested item or detail is missing, null, empty, or not recorded in the database, EXPLICITLY STATE THAT IT IS NOT RECORDED. Never extrapolate, approximate, or pretend data exists.
5. When breaking down goals or proposing steps, output clear actionable bullet points that can be converted into checklist items.
6. YOU HAVE FULL DATABASE MUTATION CAPABILITIES: You can create, update, reparent, or delete tasks, projects, milestones, planned allocations, work sessions, active timers, capacity rules/overrides, and notes using mutation tools (create_task, update_task, update_task_checklist, reparent_task, delete_task, create_project, update_project, delete_project, create_milestone, update_milestone, delete_milestone, plan_allocation, delete_allocation, log_work_session, update_work_session, delete_work_session, start_timer, pause_timer, stop_and_log_timer, discard_timer, update_capacity_rule, set_capacity_override, remove_capacity_override, create_note, update_note, delete_note). When the user asks you to perform an action or change anything in the app, call the appropriate action tool.${
      autoApproveMutations
        ? `\n\n[AUTO-EXECUTION & REPORTING MODE ACTIVE]:
The user has EXPLICITLY authorized automatic execution of mutations without confirmation prompts.
MANDATORY REPORTING REQUIREMENT:
Because mutations run automatically without manual confirmation, your final response MUST provide a clear, comprehensive, and itemized report of EVERY SINGLE MUTATION you performed:
- Detail every created, updated, scheduled, or deleted item (name/title, ID, type).
- Specify exact field changes (e.g. status, priority, estimate, progress, deadline, allocated minutes).
- Highlight the outcome of each action clearly.
Never perform mutations silently without providing this full change summary in your final reply.`
        : ' The system will prompt the user to confirm the mutation before applying it.'
    }${dynamicMcpInstructions}
${systemInstruction.trim() ? `\nBelow is the ground-truth context of the currently active item or workspace:\n${systemInstruction}\n` : ''}`;

    console.log('[AI Harness] 📝 Injected Context Grounding:\n', systemPromptContent);
    recentMsgs.push({
      role: 'system',
      content: systemPromptContent,
    });

    const historyBudget = (config.charLimit || 12000) * 2.5;
    const budgetedMsgs = selectMessagesWithinBudget(msgsToSend, {
      maxMessages: 20,
      maxTotalChars: historyBudget,
    });

    for (const m of budgetedMsgs) {
      recentMsgs.push({
        role: m.role,
        content: m.id === savedUserMsg.id && effectivePrompt !== trimmed ? effectivePrompt : m.content,
      });
    }

    // 5. Start SSE Streaming with Tool Execution Harness
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsStreaming(true);
    setStreamingText('');
    setStreamingStatus('Đang kết nối 9router...');

    let fullResponse = '';
    const currentMessages: ChatCompletionMessage[] = [...recentMsgs];
    let loopCount = 0;
    const MAX_TOOL_LOOPS = 30;
    let lastHadToolCalls = false;

    const targetModel =
      selectedModel && (availableModels.length === 0 || availableModels.includes(selectedModel))
        ? selectedModel
        : availableModels[0] || config.defaultModel;

    const turnId = aiDebugService.startTurn({
      scope: effectiveScope.title || `${effectiveScope.type}${effectiveScope.id ? `:${effectiveScope.id}` : ''}`,
      model: targetModel,
      systemPrompt: systemPromptContent,
      messagesSent: currentMessages,
      toolsSent: toolsForTurn,
    });

    try {
      while (loopCount < MAX_TOOL_LOOPS) {
        loopCount++;
        let hasToolCalls = false;
        let toolCallsToRun: ToolCall[] = [];

        try {
          const messagesToSend = pruneToolOutputsInMessages(currentMessages);
          const stream = streamChatEvents({
            endpoint: config.endpoint,
            apiKey,
            payload: {
              model: targetModel,
              messages: messagesToSend,
              tools: toolsForTurn,
            },
            signal: controller.signal,
          });

          for await (const chunk of stream) {
            if (chunk.type === 'text') {
              fullResponse += chunk.delta;
              aiDebugService.appendStreamChunk(turnId, chunk.delta);
              setStreamingText(fullResponse);
              setStreamingStatus(null);
            } else if (chunk.type === 'tool_calls') {
              hasToolCalls = true;
              toolCallsToRun = chunk.calls;
            }
          }
        } catch (streamErr: any) {
          if (streamErr.name === 'AbortError') throw streamErr;
          // If model rejected tools payload, fallback to standard stream without tools
          if (loopCount === 1 && !fullResponse) {
            console.warn('[AIChatDrawer] Tools stream error, retrying without tools:', streamErr);
            const fallbackStream = streamChatCompletion({
              endpoint: config.endpoint,
              apiKey,
              payload: {
                model: targetModel,
                messages: pruneToolOutputsInMessages(currentMessages),
              },
              signal: controller.signal,
            });
            for await (const delta of fallbackStream) {
              fullResponse += delta;
              aiDebugService.appendStreamChunk(turnId, delta);
              setStreamingText(fullResponse);
              setStreamingStatus(null);
            }
            break;
          }
          throw streamErr;
        }

        lastHadToolCalls = hasToolCalls && toolCallsToRun.length > 0;
        if (!hasToolCalls || toolCallsToRun.length === 0) {
          break;
        }

        // Show friendly recognizable status for tool execution
        const toolLabels = toolCallsToRun
          .map((tc) => {
            const normalized = normalizeToolName(tc.function.name);
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
              default: return normalized || tc.function.name;
            }
          })
          .join(', ');

        setStreamingStatus(`Đang truy vấn cơ sở dữ liệu: ${toolLabels}...`);

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

          console.log(`[AI Harness] 🛠️ Model invoked tool "${tc.function.name}":`, args);
          aiDebugService.recordToolCall(turnId, {
            id: tc.id,
            name: tc.function.name,
            args,
          });

          const normalizedToolName = normalizeToolName(tc.function.name);
          const isLocalDbTool = AI_DATABASE_TOOLS.some(
            (t) => normalizeToolName(t.function.name) === normalizedToolName
          );

          // Check if this local tool performs a data mutation requiring user confirmation
          if (isLocalDbTool && isMutationTool(tc.function.name, args)) {
            if (!autoApproveMutations) {
              const summary = await describeToolMutationWithContext(tc.function.name, args, db);
              setStreamingStatus('Chờ xác nhận hành động...');
              const confirmed = await new Promise<boolean>((resolve) => {
                pendingConfirmationRef.current = { resolve };
                setPendingConfirmation({
                  toolName: tc.function.name,
                  summary,
                  args,
                });
              });
              setPendingConfirmation(null);
              pendingConfirmationRef.current = null;

              if (!confirmed) {
                const cancelMsg = JSON.stringify({
                  cancelled: true,
                  message: 'Người dùng đã từ chối thao tác này (User declined confirmation). Không có dữ liệu nào bị thay đổi.',
                });
                console.log(`[AI Harness] 🚫 User declined mutation "${tc.function.name}"`);
                aiDebugService.recordToolResult(turnId, tc.id, cancelMsg, 0);
                currentMessages.push({
                  role: 'tool',
                  tool_call_id: tc.id,
                  name: tc.function.name,
                  content: cancelMsg,
                });
                continue;
              }
            } else {
              console.log(`[AI Harness] ⚡ Auto-approving mutation tool "${tc.function.name}" (bypass active)`);
            }
          }

          setStreamingStatus('Đang thực thi...');
          const toolStartTime = Date.now();
          let toolResult: string;
          try {
            if (isLocalDbTool) {
              toolResult = await executeAiTool(tc.function.name, args, db);
            } else {
              // Route to matching enabled MCP server
              toolResult = await executeDynamicMcpTool(normalizedToolName, args, db);
            }
          } catch (toolErr: any) {
            console.error(`[AI Harness] ❌ Tool execution failed for "${tc.function.name}":`, toolErr);
            toolResult = JSON.stringify({
              error: `Lỗi thực thi công cụ '${tc.function.name}': ${toolErr?.message || String(toolErr)}`,
            });
          }
          const toolDuration = Date.now() - toolStartTime;

          console.log(`[AI Harness] 📦 Tool result for "${tc.function.name}":`, toolResult);
          aiDebugService.recordToolResult(turnId, tc.id, toolResult, toolDuration);

          currentMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            name: tc.function.name,
            content: toolResult,
          });
        }

        setStreamingStatus('Đang tổng hợp thông tin...');
      }

      // If loop completed while tools were called, or response is empty after tools ran,
      // perform a final synthesis pass to guarantee an answer is generated
      if (lastHadToolCalls || (!fullResponse.trim() && loopCount > 1)) {
        setStreamingStatus('Đang tổng hợp câu trả lời hoàn chỉnh...');
        const synthesisMessages: ChatCompletionMessage[] = [
          ...pruneToolOutputsInMessages(currentMessages),
          {
            role: 'user',
            content:
              'Dựa trên tất cả các kết quả công cụ và thông tin đã thu thập ở trên, hãy tổng hợp câu trả lời đầy đủ, chi tiết và rõ ràng cho yêu cầu ban đầu. Không gọi thêm công cụ nào nữa.',
          },
        ];

        const synthesisStream = streamChatCompletion({
          endpoint: config.endpoint,
          apiKey,
          payload: {
            model: targetModel,
            messages: synthesisMessages,
          },
          signal: controller.signal,
        });

        for await (const delta of synthesisStream) {
          fullResponse += delta;
          aiDebugService.appendStreamChunk(turnId, delta);
          setStreamingText(fullResponse);
          setStreamingStatus(null);
        }
      }

      // 6. Commit assistant response to DB
      if (fullResponse.trim()) {
        await saveMessage(
          {
            threadId: activeThread.id,
            role: 'assistant',
            content: fullResponse,
          },
          db
        );

        // Check if document is blurred or hidden to notify user
        const isBlurred = typeof document !== 'undefined' && (document.hidden || !document.hasFocus?.());
        if (isBlurred) {
          const trimmed = fullResponse.trim();
          const snippet = trimmed.slice(0, 120);
          void sendDesktopNotification({
            title: `${APP_NAME} AI`,
            body: snippet + (trimmed.length > 120 ? '...' : ''),
            tag: 'ai-turn-finished',
          });
        }
      } else {
        setApiError('Mô hình AI không trả về nội dung (phản hồi rỗng). Vui lòng thử lại hoặc chọn mô hình khác.');
      }
      aiDebugService.finishTurn(turnId, { finalResponse: fullResponse });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // User aborted — commit partial response if exists
        if (fullResponse.trim()) {
          await saveMessage(
            {
              threadId: activeThread.id,
              role: 'assistant',
              content: fullResponse + ' [Đã dừng]',
            },
            db
          );
        }
        aiDebugService.finishTurn(turnId, { finalResponse: fullResponse, aborted: true });
      } else {
        setApiError(err?.message || 'Lỗi không xác định khi kết nối AI');
        aiDebugService.finishTurn(turnId, { error: err?.message || String(err) });
      }
    } finally {
      setIsStreaming(false);
      setStreamingStatus(null);
      setStreamingText('');
      setPendingConfirmation(null);
      pendingConfirmationRef.current = null;
      abortControllerRef.current = null;
    }
  };

  const handleClearContext = async () => {
    if (pendingConfirmationRef.current) {
      pendingConfirmationRef.current.resolve(false);
      pendingConfirmationRef.current = null;
      setPendingConfirmation(null);
    }
    let activeThread = thread;
    if (!activeThread) {
      activeThread = await createOrGetThread(
        {
          scopeType: currentScope.type,
          entityId: currentScope.id,
          title: currentScope.title,
        },
        db
      );
    }
    await clearThreadContext(activeThread.id, db);
    setSessionAttachedFiles([]);
    message.success('Đã đặt lại ngữ cảnh hội thoại');
  };

  const handleDeleteCurrentThread = () => {
    Modal.confirm({
      title: 'Xóa tin nhắn cuộc trò chuyện này?',
      content: 'Toàn bộ nội dung trao đổi trong phạm vi này sẽ bị xóa khỏi lịch sử.',
      okText: 'Xóa tin nhắn',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: async () => {
        if (thread) {
          await clearThreadMessages(thread.id, db);
        }
        setSessionAttachedFiles([]);
        message.success('Đã xóa tin nhắn cuộc trò chuyện');
      },
    });
  };

  const handleClearAllHistory = () => {
    Modal.confirm({
      title: 'Xóa toàn bộ lịch sử AI?',
      content:
        'Hành động này sẽ xóa vĩnh viễn tất cả các cuộc trò chuyện và tin nhắn AI trên mọi phạm vi (toàn cục, tác vụ, dự án). Không thể hoàn tác.',
      okText: 'Xóa sạch tất cả',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: async () => {
        await clearAllChatHistory(db);
        setSessionAttachedFiles([]);
        message.success('Đã xóa sạch toàn bộ lịch sử trò chuyện AI');
      },
    });
  };

  const handleRetry = () => {
    if (lastSubmittedText) {
      handleSendMessage(lastSubmittedText);
    }
  };

  // Auto-send prompt when opened from Command Palette with pendingPrompt
  useEffect(() => {
    if (open && pendingPrompt) {
      const promptToSend = pendingPrompt;
      clearPendingPrompt();
      setInternalScope({ type: 'global' });
      setCustomScope({ type: 'global' });
      setIsDetached(false);
      handleSendMessage(promptToSend, { type: 'global' });
    }
  }, [open, pendingPrompt]);

  // Action chips event handlers per D-18
  const handleAddToChecklist = async (items: string[]) => {
    if (currentScope.type !== 'task' || !currentScope.id || items.length === 0) return;
    try {
      const task = await getTask(currentScope.id, db);
      if (!task) return;
      const existingChecklist = task.checklist || [];
      const newChecklist = [
        ...existingChecklist,
        ...items.map((text) => ({
          id: crypto.randomUUID(),
          text,
          done: false,
        })),
      ];
      await updateTask(task.id, { checklist: newChecklist }, db);
      message.success(`Đã thêm ${items.length} mục vào Checklist`);
    } catch (err: any) {
      message.error(`Không thể thêm vào Checklist: ${err?.message || err}`);
    }
  };

  const handleSaveStickyNote = async (content: string) => {
    try {
      const scopeType = currentScope.type;
      const entityType = (scopeType === 'task' || scopeType === 'project' || scopeType === 'milestone') ? scopeType : undefined;
      await createNote(
        {
          entityType,
          entityId: entityType ? currentScope.id : undefined,
          title: `Ghi chú AI - ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          body: content,
        },
        db
      );
      message.success('Đã lưu phản hồi vào Sticky Notes');
    } catch (err: any) {
      message.error(`Không thể lưu ghi chú: ${err?.message || err}`);
    }
  };

  const handleRunClaudeCode = async () => {
    if (currentScope.type !== 'task' || !currentScope.id) return;
    try {
      const task = await getTask(currentScope.id, db);
      if (!task) return;
      await launchClaudeTerminal({ task });
    } catch (err: any) {
      message.error(`Lỗi khởi chạy Claude Code: ${err?.message || err}`);
    }
  };

  if (!open) return null;

  const handlePopoutAction = () => {
    if (onPopout) {
      onPopout();
    } else {
      void openAiPopout({
        type: currentScope.type,
        id: currentScope.id,
        title: currentScope.title,
      });
      onClose();
    }
  };

  return (
    <div
      style={{
        position: isPopoutWindow ? 'relative' : 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        left: isPopoutWindow ? 0 : undefined,
        width: isPopoutWindow ? '100%' : isMobile ? '100vw' : width,
        height: isPopoutWindow ? '100%' : undefined,
        zIndex: isPopoutWindow ? 1 : isPinned && !isMobile ? 100 : 1200,
        backgroundColor: token.colorBgContainer,
        borderLeft: isPopoutWindow ? 'none' : `1px solid ${token.colorBorderSecondary}`,
        boxShadow: isPopoutWindow || (isPinned && !isMobile) ? 'none' : '-2px 0 8px rgba(0,0,0,0.15)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Left border drag handle (desktop drawer only) */}
      {!isMobile && !isPopoutWindow && (
        <div
          data-testid="ai-chat-resizer"
          onMouseDown={handleMouseDown}
          style={{
            position: 'absolute',
            left: -4,
            top: 0,
            bottom: 0,
            width: 8,
            cursor: 'col-resize',
            zIndex: 10,
          }}
        />
      )}

      {/* Chat Header */}
      <ChatHeader
        selectedModel={selectedModel}
        availableModels={availableModels}
        onModelChange={handleModelChange}
        autoApproveMutations={autoApproveMutations}
        onToggleAutoApproveMutations={handleToggleAutoApproveMutations}
        isPinned={isPinned}
        onTogglePin={() => onTogglePin?.()}
        onClearContext={handleClearContext}
        onClearAllHistory={handleClearAllHistory}
        onDeleteCurrentThread={handleDeleteCurrentThread}
        onOpenDebug={() => setIsDebugModalOpen(true)}
        onOpenMcpSettings={() => setIsMcpModalOpen(true)}
        onPopout={!isPopoutWindow ? handlePopoutAction : undefined}
        onOpenInstructions={() => setIsInstructionsOpen(true)}
        onClose={onClose}
        mcpServers={mcpServers}
        onToggleMcpServer={handleToggleMcpServer}
      />

      {/* Scope sub-bar showing current active context and change/detach controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 14px',
          backgroundColor: token.colorFillAlter,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          fontSize: 12,
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
          <span style={{ color: token.colorTextSecondary, fontSize: 11, flexShrink: 0 }}>Ngữ cảnh:</span>
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontWeight: 500,
              color: currentScope.type === 'global' ? token.colorTextSecondary : token.colorPrimary,
            }}
          >
            {currentScope.type === 'global'
              ? 'Toàn cục (Không gắn)'
              : `Đang gắn ngữ cảnh: ${currentScope.title || currentScope.id}`}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <Button
            type="link"
            size="small"
            onClick={() => setScopeModalOpen(true)}
            aria-label="Đổi phạm vi ngữ cảnh"
            style={{ padding: '0 4px', height: 22, fontSize: 12 }}
          >
            Đổi
          </Button>
          {currentScope.type !== 'global' && (
            <Button
              type="text"
              size="small"
              icon={<DisconnectOutlined />}
              onClick={() => {
                setIsDetached(true);
                setInternalScope({ type: 'global' });
                setCustomScope({ type: 'global' });
              }}
              aria-label="Gỡ gắn ngữ cảnh"
              style={{ padding: '0 4px', height: 22, fontSize: 12, color: token.colorTextSecondary }}
            >
              Gỡ
            </Button>
          )}
        </div>
      </div>

      <ScopePickerModal
        open={scopeModalOpen}
        onClose={() => setScopeModalOpen(false)}
        currentScope={currentScope}
        onSelectScope={(newScope) => {
          if (newScope.type === 'global') {
            setIsDetached(true);
            setInternalScope({ type: 'global' });
            setCustomScope({ type: 'global' });
          } else {
            setIsDetached(false);
            setInternalScope(newScope);
            setCustomScope(newScope);
          }
        }}
        db={db}
      />

      <AIDebugModal
        open={isDebugModalOpen}
        onClose={() => setIsDebugModalOpen(false)}
      />

      <AITaskPlannerInstructionsModal
        open={isInstructionsOpen}
        onClose={() => setIsInstructionsOpen(false)}
      />

      <McpSettingsModal
        open={isMcpModalOpen}
        onClose={() => setIsMcpModalOpen(false)}
        db={db}
        onSettingsChange={reloadMcpServers}
        onOpenSettings={onOpenSettings}
      />

      {/* Message List */}
      <ChatMessageList
        messages={messages}
        streamingText={streamingText}
        isStreaming={isStreaming}
        streamingStatus={streamingStatus}
        error={apiError}
        scrollTrigger={scrollTrigger}
        onRetry={handleRetry}
        onOpenSettings={onOpenSettings}
        canAddToChecklist={currentScope.type === 'task'}
        canSaveStickyNote={true}
        canRunClaudeCode={currentScope.type === 'task'}
        onAddToChecklist={handleAddToChecklist}
        onSaveStickyNote={handleSaveStickyNote}
        onRunClaudeCode={handleRunClaudeCode}
        pendingConfirmation={pendingConfirmation}
        onConfirmAction={handleConfirmAction}
      />

      {/* Chat Input Bar */}
      <ChatInputBar
        autoFocus={open}
        onSubmit={handleSendMessage}
        onClear={handleClearContext}
        onClearAll={handleClearAllHistory}
        onStop={handleStopGeneration}
        isStreaming={isStreaming && !pendingConfirmation}
        placeholder={
          pendingConfirmation
            ? 'Gõ "yes" để xác nhận hoặc "no" để từ chối...'
            : undefined
        }
        db={db}
        attachedFiles={sessionAttachedFiles}
        onAttachFile={handleAttachFile}
        onRemoveFile={handleRemoveFile}
      />
    </div>
  );
};
