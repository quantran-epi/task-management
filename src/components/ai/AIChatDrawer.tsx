import React, { useState, useEffect, useRef, useCallback } from 'react';
import { theme, Button, message, Modal } from 'antd';
import { DisconnectOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type {
  ChatScopeType,
  ChatThread,
  ChatMessage,
  ChatTokenUsage,
  ChatGeneratedFile,
} from '../../types/models';
import { generateId, isValidUuid } from '../../utils/uuid';
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
import { stripThinkingBlocks } from '../../services/ai/nineRouterClient';
import {
  buildItemContextPrompt,
  buildGlobalContextPrompt,
  serializeDocumentContext,
  extractMentionedEntityIds,
} from '../../services/ai/contextGrounding';
import { selectMessagesWithinBudget } from '../../services/ai/historyPruning';
import { compactThreadContext, extractMessageText } from '../../services/ai/contextCompaction';
import {
  AI_DATABASE_TOOLS,
  type AiToolDefinition,
  isMutationTool,
  describeToolMutationWithContext,
  normalizeToolName,
  pruneToolsForContext,
} from '../../services/ai/aiTools';
import { runAiOrchestratorLoop, dispatchAiToolCall } from '../../services/ai/aiOrchestratorLoop';
import {
  getMcpServers,
  discoverAllMcpTools,
  getEnabledMcpInstructions,
  isReadOnlyMcpTool,
  toggleMcpServer,
  type McpServerConfig,
} from '../../services/ai/mcpClient';
import type { ChatCompletionMessage } from '../../services/ai/types';
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
import { createPhaseLogger } from '../../services/ai/phaseLogger';
import { APP_NAME } from '../../constants/app';
import { useAIChat } from '../../context/AIChatContext';
import { openAiPopout } from '../../utils/aiPopout';
import {
  sendDesktopNotification,
  isNotificationPermissionGranted,
  requestNotificationPermission,
} from '../../utils/desktopNotification';
import { useOptionalKnowledgeConfig } from '../../services/knowledge/knowledgeConfig';
import { fetchSetCatalog } from '../../db/repositories/documentSetRepo';
import {
  executeGroundedTurn as runGroundedTurn,
  executeSynthesizeFromStoredEvidence as synthesizeFromStoredEvidence,
  createDefaultGroundedTurnDeps,
} from '../../services/ai/groundedTurnDeps';
import type {
  ChatMessageGrounding,
  PersistedCitation,
  PersistedEntityRef,
} from '../../services/ai/groundedAnswerSchemas';
import { IntentRouterUnavailableError } from '../../services/ai/intentRouter';
import { QuickPreviewDrawer } from '../notes/QuickPreviewDrawer';
import { ScopeChipsBar, hasMeaningfulRoutedScope } from './grounded/ScopeChipsBar';
import type { GroundedAnswerCardCallbacks } from './ChatMessageBubble';

export const AI_CHAT_WIDTH_KEY = 'planner:ai_chat_width';
export const AI_AUTO_APPROVE_MUTATIONS_KEY = 'planner:ai_auto_approve_mutations';
export const AI_ANALYSIS_MODE_KEY = 'planner:ai_analysis_mode';
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
  const { pendingPrompt, clearPendingPrompt, pendingDraft, clearPendingDraft, setCustomScope } = useAIChat();

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
  const knowledgeConfig = useOptionalKnowledgeConfig();

  // Grounded turn state & abort controller per turn (AI-SPEC §4b)
  const currentTurnAbortRef = useRef<AbortController | null>(null);
  const [activePreviewCitation, setActivePreviewCitation] = useState<PersistedCitation | null>(null);
  const [latestRoutedScope, setLatestRoutedScope] = useState<ChatMessageGrounding['scope']>(null);
  const [transientClarifyMessage, setTransientClarifyMessage] = useState<{
    id: string;
    originalQuery: string;
    clarifyQuestion: string;
    turnCount: number;
  } | null>(null);

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
  const [isRefreshingModels, setIsRefreshingModels] = useState(false);

  const handleRefreshModels = useCallback(async () => {
    setIsRefreshingModels(true);
    try {
      const liveModels = await fetchAvailableModels(db);
      if (liveModels.length > 0) {
        setAvailableModels(liveModels);
        setSelectedModel((prev) => {
          if (liveModels.includes(prev)) return prev;
          return liveModels[0] ?? prev;
        });
        message.success(`Đã cập nhật ${liveModels.length} mô hình từ 9router`);
      } else {
        message.warning('Không tìm thấy mô hình nào từ 9router');
      }
    } catch (err: any) {
      message.error(`Không thể tải danh sách mô hình: ${err?.message || err}`);
    } finally {
      setIsRefreshingModels(false);
    }
  }, [db]);

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
  const [groundedLoadingStatus, setGroundedLoadingStatus] = useState<string | null>(null);
  const [synthesizingEvidenceId, setSynthesizingEvidenceId] = useState<string | null>(null);
  const [evidenceSynthesisError, setEvidenceSynthesisError] = useState<{
    id: string;
    message: string;
    requiresConfig: boolean;
  } | null>(null);
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

  const [externalInputValue, setExternalInputValue] = useState<string | null>(null);

  // Consume pendingDraft from AIChatContext into input draft without auto-sending
  useEffect(() => {
    if (open && pendingDraft) {
      setExternalInputValue(pendingDraft);
      clearPendingDraft();
    }
  }, [open, pendingDraft, clearPendingDraft]);

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

  // Analysis mode: bypass grounded synthesis and run the plain tool loop with retrieval tools.
  const [analysisMode, setAnalysisMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(AI_ANALYSIS_MODE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const handleToggleAnalysisMode = useCallback(() => {
    const next = !analysisMode;
    setAnalysisMode(next);
    try {
      localStorage.setItem(AI_ANALYSIS_MODE_KEY, String(next));
    } catch {
      // ignore storage error
    }
    message.info(
      next
        ? 'Đã bật chế độ phân tích. AI sẽ tra cứu tri thức bằng công cụ và tự tổng hợp câu trả lời.'
        : 'Đã tắt chế độ phân tích. AI quay lại luồng trả lời có trích dẫn.'
    );
  }, [analysisMode]);

  const handleConfirmAction = useCallback((confirmed: boolean) => {
    if (pendingConfirmationRef.current) {
      pendingConfirmationRef.current.resolve(confirmed);
      pendingConfirmationRef.current = null;
    }
    setPendingConfirmation(null);
  }, []);

  // Abort stream on unmount or drawer close
  useEffect(() => {
    return () => {
      if (pendingConfirmationRef.current) {
        pendingConfirmationRef.current.resolve(false);
        pendingConfirmationRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (currentTurnAbortRef.current) {
        currentTurnAbortRef.current.abort();
        currentTurnAbortRef.current = null;
      }
    };
  }, []);

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
      if (currentTurnAbortRef.current) {
        currentTurnAbortRef.current.abort();
        currentTurnAbortRef.current = null;
      }
      setGroundedLoadingStatus(null);
    }
  }, [open]);

  // Abort previous grounded turn on scope change (AI-SPEC §4b)
  useEffect(() => {
    if (currentTurnAbortRef.current) {
      currentTurnAbortRef.current.abort();
      currentTurnAbortRef.current = null;
    }
    setTransientClarifyMessage(null);
    setGroundedLoadingStatus(null);
  }, [currentScope.type, currentScope.id]);

  const handleStopGeneration = () => {
    if (pendingConfirmationRef.current) {
      pendingConfirmationRef.current.resolve(false);
      pendingConfirmationRef.current = null;
      setPendingConfirmation(null);
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (currentTurnAbortRef.current) {
      currentTurnAbortRef.current.abort();
      currentTurnAbortRef.current = null;
    }
    setGroundedLoadingStatus(null);
  };

  const handleSendMessage = async (
    text: string,
    overrideScope?: ActiveScope,
    skipSavingUserMessage = false
  ) => {
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

    if (isStreaming || Boolean(groundedLoadingStatus)) return;

    setScrollTrigger((prev) => prev + 1);
    setApiError(null);
    setLastSubmittedText(trimmed);

    // Clarification transcript continuation handling per D-06
    let effectiveQuery = trimmed;
    let nextClarifyTurnCount = 1;
    if (transientClarifyMessage) {
      nextClarifyTurnCount = transientClarifyMessage.turnCount + 1;
      if (nextClarifyTurnCount > 2) {
        setTransientClarifyMessage(null);
        setApiError(
          'Chưa thể xác định rõ ý định sau 2 lần hỏi. Vui lòng đặt câu hỏi cụ thể hơn hoặc chọn tác vụ cụ thể trong giao diện.'
        );
        return;
      }
      effectiveQuery = `${transientClarifyMessage.originalQuery}\n[Thông tin bổ sung]: ${trimmed}`;
    }

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

    // 2. Save user message unless this is the routed continuation of an existing turn.
    const savedUserMsg = skipSavingUserMessage
      ? [...(await getMessagesByThreadId(activeThread.id, db))]
          .reverse()
          .find((m) => m.role === 'user' && m.content === trimmed)
      : await saveMessage(
          {
            threadId: activeThread.id,
            role: 'user',
            content: trimmed,
          },
          db
        );

    // Cancel older turn before owning new one per AI-SPEC §4b
    if (currentTurnAbortRef.current) {
      currentTurnAbortRef.current.abort();
    }
    const turnController = new AbortController();
    currentTurnAbortRef.current = turnController;

    const apiKey = await getNineRouterApiKey(db);
    const config = await getNineRouterConfig(db);
    if (apiKey && config.endpoint) {
      // Await so the boundary message exists before the history read below.
      // Compaction stays best-effort and must never fail the turn.
      try {
        await compactThreadContext({
          threadId: activeThread.id,
          db,
          endpoint: config.endpoint,
          apiKey,
          model: selectedModel || config.defaultModel,
          ...(currentTurnAbortRef.current?.signal
            ? { signal: currentTurnAbortRef.current.signal }
            : {}),
        });
      } catch (compErr: any) {
        if (compErr?.name !== 'AbortError') {
          console.warn('[AIChatDrawer] Auto context compaction check error:', compErr);
        }
      }
    }

    const allThreadMsgs = await getMessagesByThreadId(activeThread.id, db);
    let boundaryIndex = -1;
    for (let i = allThreadMsgs.length - 1; i >= 0; i--) {
      if (allThreadMsgs[i]?.isContextBoundary) {
        boundaryIndex = i;
        break;
      }
    }
    const threadMsgsToSend = boundaryIndex >= 0 ? allThreadMsgs.slice(boundaryIndex + 1) : allThreadMsgs;
    const allHistoryTurns = threadMsgsToSend
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.id !== savedUserMsg?.id)
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: extractMessageText(m),
      }))
      .filter((m) => m.content.trim().length > 0);

    const turnOverallStartTime = Date.now();
    // Analysis mode bypasses the grounded pipeline (intent router, scope routing,
    // schema-validated synthesis) and falls straight through to the tool loop.
    if (!analysisMode) {
    const catalog = await fetchSetCatalog(db);
    const capabilities = {
      serverEnabled: Boolean(knowledgeConfig.enabled && knowledgeConfig.baseUrl),
      modelConfigured: Boolean(apiKey && config.endpoint && (selectedModel || config.defaultModel)),
    };
    const deps = createDefaultGroundedTurnDeps({
      knowledgeBaseUrl: knowledgeConfig.baseUrl,
      knowledgeToken: knowledgeConfig.token,
      db,
    });
    const routeScope = deps.routeScope;
    deps.routeScope = (input, routeDeps) => {
      setGroundedLoadingStatus('Đang xác định phạm vi tài liệu...');
      return routeScope(input, routeDeps);
    };
    const retrieveFederated = deps.retrieveFederated;
    deps.retrieveFederated = (request, signal) => {
      setGroundedLoadingStatus('Đang truy xuất tài liệu và đồ thị liên quan...');
      return retrieveFederated(request, signal);
    };
    const runLocalBm25 = deps.runLocalBm25;
    deps.runLocalBm25 = (input, localDeps) => {
      setGroundedLoadingStatus('Đang tìm kiếm trong tài liệu cục bộ...');
      return runLocalBm25(input, localDeps);
    };
    const synthesizeGroundedAnswer = deps.synthesizeGroundedAnswer;
    deps.synthesizeGroundedAnswer = (input) => {
      setGroundedLoadingStatus('Đang tổng hợp câu trả lời từ bằng chứng...');
      return synthesizeGroundedAnswer(input);
    };
    try {
      setGroundedLoadingStatus('Đang phân tích ý định câu hỏi...');
      const groundedResult = await runGroundedTurn(
        {
          query: effectiveQuery,
          recentTurns: allHistoryTurns,
          signal: turnController.signal,
          capabilities,
          config: {
            endpoint: config.endpoint,
            apiKey,
            model: selectedModel || config.defaultModel,
            promptVersion: 'grounded-v1',
            routerVersion: 'router-v1',
          },
          catalog,
          recentSessionId: activeThread.id,
        },
        deps
      );

      if (turnController.signal.aborted) {
        return;
      }

      if (groundedResult.kind === 'clarify_intent') {
        setTransientClarifyMessage({
          id: `transient-${Date.now()}`,
          originalQuery: transientClarifyMessage ? transientClarifyMessage.originalQuery : trimmed,
          clarifyQuestion:
            groundedResult.clarifyQuestion ||
            'Bạn có thể cung cấp thêm chi tiết để tôi hỗ trợ chính xác hơn không?',
          turnCount: nextClarifyTurnCount,
        });
        setGroundedLoadingStatus(null);
        return;
      }

      // Clarification succeeded or normal turn: clear transient clarify state
      setTransientClarifyMessage(null);

      if (groundedResult.kind === 'operational') {
        setGroundedLoadingStatus('Đang chuẩn bị ngữ cảnh TaskMate...');
      } else {
        setGroundedLoadingStatus('Đang xử lý kết quả tra cứu...');
      }

        if (groundedResult.kind === 'clarify_entity') {
          const entityCitations: PersistedCitation[] = groundedResult.candidates.map((c, idx) => {
            const rawId = c.urn.split(':').pop() || '';
            const docId = isValidUuid(rawId) ? rawId : generateId();
            return {
              citationId: `S${idx + 1}`,
              documentId: docId,
              documentTitle: c.canonicalName,
              sectionAnchor: c.urn,
              lineStart: 1,
              lineEnd: 1,
              authority: 'server' as const,
              evidenceClass: 'OBSERVED' as const,
              snapshotId: 'gsnap_00000000',
              publishedContentHash: '0'.repeat(64),
              citedExcerpt: c.urn,
            };
          });

        const groundedDurationMs = Date.now() - turnOverallStartTime;
        await saveMessage(
          {
            threadId: activeThread.id,
            role: 'assistant',
            content: '',
            durationMs: groundedDurationMs,
            grounding: {
              schemaVersion: 1,
              authority: 'server',
              outcome: 'NEEDS_CLARIFICATION',
              answer: null,
              citations: entityCitations,
              paths: [],
              conflicts: [],
              scope: {
                setIds: catalog.map((s) => s.setId).filter(isValidUuid),
                routedScope: {
                  domain: null,
                  environment: null,
                  version: null,
                  comparisonMode: null,
                },
              },
              modalityDiagnostics: {
                fulltext: { status: 'ok', latencyMs: 0, itemCount: 0 },
                vector: { status: 'ok', latencyMs: 0, itemCount: 0 },
                graph: { status: 'ok', latencyMs: 0, itemCount: 0 },
              },
              coverageWarnings: ['Cần xác định rõ đối tượng tra cứu'],
              fallbackReason: 'NONE',
              routerVersion: 'router-v1',
              promptVersion: 'grounded-v1',
              modelId: selectedModel || config.defaultModel,
              createdAt: new Date().toISOString(),
            },
          },
          db
        );
        setGroundedLoadingStatus(null);
        return;
      }

      if (groundedResult.kind === 'refine') {
        const refineGrounding: ChatMessageGrounding = {
          schemaVersion: 1,
          authority: 'server',
          outcome: groundedResult.outcome,
          answer: null,
          citations: [],
          paths: [],
          conflicts: [],
          scope: {
            setIds: catalog.map((s) => s.setId).filter(isValidUuid),
            routedScope: {
              domain: null,
              environment: null,
              version: null,
              comparisonMode: null,
            },
          },
          modalityDiagnostics: {
            fulltext: { status: 'ok', latencyMs: 0, itemCount: 0 },
            vector: { status: 'ok', latencyMs: 0, itemCount: 0 },
            graph: { status: 'ok', latencyMs: 0, itemCount: 0 },
          },
          coverageWarnings: [...groundedResult.refinementChips],
          fallbackReason: 'NONE',
          routerVersion: 'router-v1',
          promptVersion: 'grounded-v1',
          modelId: selectedModel || config.defaultModel,
          createdAt: new Date().toISOString(),
        };

        const groundedDurationMs = Date.now() - turnOverallStartTime;
        await saveMessage(
          {
            threadId: activeThread.id,
            role: 'assistant',
            content: '',
            durationMs: groundedDurationMs,
            grounding: refineGrounding,
          },
          db
        );
        setGroundedLoadingStatus(null);
        return;
      }

      if (
        groundedResult.kind === 'grounded_answer' ||
        groundedResult.kind === 'local_fallback_results' ||
        groundedResult.kind === 'evidence_only'
      ) {
        if (!turnController.signal.aborted) {
          if (groundedResult.grounding.scope) {
            setLatestRoutedScope(groundedResult.grounding.scope);
          }
          const groundedDurationMs = Date.now() - turnOverallStartTime;
          await saveMessage(
            {
              threadId: activeThread.id,
              role: 'assistant',
              content: '',
              durationMs: groundedDurationMs,
              tokenUsage: (groundedResult as any).tokenUsage,
              grounding: groundedResult.grounding,
            },
            db
          );
        }
        if (
          groundedResult.kind !== 'grounded_answer' ||
          !groundedResult.requiresOperationalContinuation
        ) {
          setGroundedLoadingStatus(null);
          return;
        }
      }

        if (groundedResult.kind === 'error') {
          if (!turnController.signal.aborted) {
            const groundedDurationMs = Date.now() - turnOverallStartTime;
            await saveMessage(
              {
                threadId: activeThread.id,
                role: 'assistant',
                content: '',
                durationMs: groundedDurationMs,
                grounding: groundedResult.grounding,
              },
              db
            );
          }
          setGroundedLoadingStatus(null);
          return;
        }
    } catch (groundedErr: any) {
      if (turnController.signal.aborted) {
        setGroundedLoadingStatus(null);
        return;
      }

      console.error('[AIChatDrawer] Grounded pipeline or persistence error:', groundedErr);
      if (groundedErr?.name === 'ZodError' || groundedErr?.issues) {
        console.error('[AIChatDrawer] Zod validation details:', JSON.stringify(groundedErr.issues, null, 2));
      }
      setGroundedLoadingStatus(null);

      // Fail-closed gate per D-04: If intent router is unavailable, stop immediately.
      if (
        groundedErr instanceof IntentRouterUnavailableError ||
        groundedErr?.name === 'IntentRouterUnavailableError' ||
        groundedErr?.message?.includes('intent routing is unavailable')
      ) {
        setApiError(
          'Trợ lý AI tạm thời không khả dụng. Vui lòng kiểm tra lại cấu hình kết nối AI.'
        );
        return;
      }

      setApiError(
        'Không thể lưu câu trả lời hoặc dữ liệu tri thức không hợp lệ. Vui lòng thử lại.'
      );
      return;
    }
    }

    // 3. Operational tool loop (for operational / mixed / fallback turns)
    if (turnController.signal.aborted) {
      setGroundedLoadingStatus(null);
      return;
    }

    if (!apiKey) {
      setGroundedLoadingStatus(null);
      setApiError('Chưa cấu hình API Key 9router. Vui lòng mở Cài đặt AI để thiết lập.');
      return;
    }

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
    const toolsForTurn = analysisMode
      ? [
          ...AI_DATABASE_TOOLS.filter(
            (tool) => !isMutationTool(normalizeToolName(tool.function.name))
          ),
          ...dynamicMcpTools.filter((tool) =>
            isReadOnlyMcpTool(normalizeToolName(tool.function.name))
          ),
        ]
      : pruneToolsForContext([...AI_DATABASE_TOOLS, ...dynamicMcpTools], {
          isKnowledgeContinuation: Boolean(
            groundedLoadingStatus?.includes('trợ lý') || effectiveScope.type === 'document'
          ),
          isTaskMateQuery: !autoApproveMutations,
          isMutationTurn: autoApproveMutations,
        });
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
${systemInstruction.trim() ? `\nBelow is the ground-truth context of the currently active item or workspace:\n${systemInstruction}\n` : ''}${
      analysisMode
        ? `\n\n[ANALYSIS MODE ACTIVE]:
READ ONLY:
This turn is read-only. You may retrieve knowledge, read local files, reason, compare, propose, and generate artifacts with \`generate_file\`, \`generate_pptx\`, or \`generate_image\`.
Rules:
1. NEVER mutate tasks, projects, milestones, timers, notes, capacity, document links, or any MCP-backed data. For change requests, propose a plan instead of executing it.
2. Use the \`retrieve_knowledge\` tool repeatedly to gather evidence. Keep each query short and focused (<= 200 characters): an entity name, an identifier, or a narrow topic phrase. Split broad questions into multiple focused queries instead of one long query.
3. If a retrieval returns only entity names with no excerpts, retry using the entity name itself as the query.
4. Read attached local files with \`read_file\` FIRST (offset/limit pagination) before answering about them.
5. Ground every factual claim in retrieved excerpts or file content. Clearly mark your own reasoning, assumptions, and proposals as such.
6. End the answer with a short "Nguồn" (Sources) list naming the documents/files you used.`
        : ''
    }`;

    console.log('[AI Harness] 📝 Injected Context Grounding:\n', systemPromptContent);
    recentMsgs.push({
      role: 'system',
      content: systemPromptContent,
    });

    const historyBudget = (config.charLimit || 12000) * 2.5;
    const budgetedMsgs = selectMessagesWithinBudget(
      msgsToSend.map((m) => ({
        ...m,
        content: extractMessageText(m),
      })),
      {
        maxMessages: 20,
        maxTotalChars: historyBudget,
      }
    );

    for (const m of budgetedMsgs) {
      recentMsgs.push({
        role: m.role,
        content: m.id === savedUserMsg?.id && effectivePrompt !== trimmed ? effectivePrompt : (m.content || ''),
      });
    }

    // 5. Start SSE Streaming with Tool Execution Harness
    setGroundedLoadingStatus(null);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsStreaming(true);
    setStreamingText('');
    setStreamingStatus('Đang kết nối 9router...');

    const correlationId = crypto.randomUUID();
    const routeLog = createPhaseLogger('[ROUTE]', { correlationId });
    const toolLog = createPhaseLogger('[TOOL]', { correlationId });
    const synthesisLog = createPhaseLogger('[SYNTHESIS]', { correlationId });

    const turnStartTime = Date.now();
    let accumulatedTokenUsage: ChatTokenUsage | undefined;
    const turnGeneratedFiles: ChatGeneratedFile[] = [];

    let fullResponse = '';
    const currentMessages: ChatCompletionMessage[] = [...recentMsgs];
    const MAX_TOOL_LOOPS = 30;
    let lastHadToolCalls = false;

    const targetModel =
      selectedModel && (availableModels.length === 0 || availableModels.includes(selectedModel))
        ? selectedModel
        : availableModels[0] || config.defaultModel;

    routeLog.log({
      outcome: 'ok',
      safeIds: [savedUserMsg?.id || 'unknown', activeThread.id],
      counts: { queryLength: effectivePrompt.length },
      metadata: { model: targetModel, scopeType: effectiveScope.type },
    });

    const turnId = aiDebugService.startTurn({
      scope: effectiveScope.title || `${effectiveScope.type}${effectiveScope.id ? `:${effectiveScope.id}` : ''}`,
      model: targetModel,
      systemPrompt: systemPromptContent,
      messagesSent: currentMessages,
      toolsSent: toolsForTurn,
    });

    try {
      const toolCallsById = new Map<string, { name: string; args: Record<string, any> }>();
      const loopResult = await runAiOrchestratorLoop({
        endpoint: config.endpoint,
        apiKey,
        model: targetModel,
        messages: currentMessages,
        tools: toolsForTurn,
        maxLoops: MAX_TOOL_LOOPS,
        db,
        signal: controller.signal,
        ...(analysisMode
          ? { keepRecentToolOutputs: 20, maxOldToolChars: 100_000 }
          : {}),
        // Auto-compaction follows the configured model context window, like Claude
        // Code: trigger at a fraction of the window using the provider-reported
        // prompt token count.
        contextWindowTokens: config.contextWindowTokens,
        compactAtRatio: analysisMode ? 0.9 : 0.75,
        executeToolFn: dispatchAiToolCall,
        onTextChunk: (delta) => {
          fullResponse += delta;
          aiDebugService.appendStreamChunk(turnId, delta);
          setStreamingText(stripThinkingBlocks(fullResponse));
          setStreamingStatus(null);
        },
        onStatusChange: (status) => {
          if (status === 'Đang tổng hợp câu trả lời hoàn chỉnh...') {
            fullResponse = '';
            setStreamingText('');
          }
          setStreamingStatus(status);
        },
        onUsage: (usage) => {
          accumulatedTokenUsage = {
            promptTokens: (accumulatedTokenUsage?.promptTokens || 0) + (usage.promptTokens || 0),
            completionTokens: (accumulatedTokenUsage?.completionTokens || 0) + (usage.completionTokens || 0),
            totalTokens: (accumulatedTokenUsage?.totalTokens || 0) + (usage.totalTokens || 0),
          };
        },
        onToolCall: (call) => {
          lastHadToolCalls = true;
          toolCallsById.set(call.id, { name: call.name, args: call.args });
          console.log(`[AI Harness] 🛠️ Model invoked tool "${call.name}":`, call.args);
          aiDebugService.recordToolCall(turnId, call);
        },
        onToolResult: (callId, result, durationMs) => {
          const call = toolCallsById.get(callId);
          const normalizedToolName = normalizeToolName(call?.name || '');
          toolLog.log({
            outcome: result.includes('"error"') ? 'error' : 'ok',
            latencyMs: durationMs,
            safeIds: [callId],
            counts: { args: Object.keys(call?.args || {}).length },
            metadata: {
              toolName: normalizedToolName,
              isMutation: call ? isMutationTool(call.name, call.args) : false,
            },
          });
          console.log(`[AI Harness] 📦 Tool result for "${call?.name || callId}":`, result);
          aiDebugService.recordToolResult(turnId, callId, result, durationMs);
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
            console.log(`[AI Harness] ⚡ Auto-approving mutation tool "${toolName}" (bypass active)`);
            return { proceed: true };
          }

          const summary = await describeToolMutationWithContext(toolName, args, db);
          setStreamingStatus('Chờ xác nhận hành động...');
          const confirmed = await new Promise<boolean>((resolve) => {
            pendingConfirmationRef.current = { resolve };
            setPendingConfirmation({ toolName, summary, args });
          });
          setPendingConfirmation(null);
          pendingConfirmationRef.current = null;

          return confirmed
            ? { proceed: true }
            : {
                proceed: false,
                cancellationResult: JSON.stringify({
                  cancelled: true,
                  message: 'Người dùng đã từ chối thao tác này (User declined confirmation). Không có dữ liệu nào bị thay đổi.',
                }),
              };
        },
        onFileGenerated: (file) => {
          turnGeneratedFiles.push(file);
        },
      });

      fullResponse = loopResult.fullResponse;
      accumulatedTokenUsage = loopResult.tokenUsage;

      // 6. Commit assistant response to DB
      const cleanCommittedResponse = stripThinkingBlocks(fullResponse);
      if (cleanCommittedResponse.trim()) {
        const durationMs = Date.now() - turnStartTime;
        await saveMessage(
          {
            threadId: activeThread.id,
            role: 'assistant',
            content: cleanCommittedResponse,
            durationMs,
            tokenUsage: accumulatedTokenUsage,
            generatedFiles: turnGeneratedFiles.length > 0 ? turnGeneratedFiles : undefined,
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
        // User aborted — commit clean partial response and generated artifacts.
        const cleanPartial = stripThinkingBlocks(fullResponse).trim();
        if (cleanPartial || turnGeneratedFiles.length > 0) {
          const durationMs = Date.now() - turnStartTime;
          synthesisLog.log({
            outcome: 'ok',
            latencyMs: durationMs,
            safeIds: [activeThread.id],
            counts: {
              responseLength: fullResponse.length,
              generatedFiles: turnGeneratedFiles.length,
            },
            metadata: { hasToolCalls: lastHadToolCalls },
          });
          await saveMessage(
            {
              threadId: activeThread.id,
              role: 'assistant',
              content: cleanPartial + ' [Đã dừng]',
              durationMs,
              tokenUsage: accumulatedTokenUsage,
              generatedFiles: turnGeneratedFiles.length > 0 ? turnGeneratedFiles : undefined,
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

  const handleEvidenceOnlySynthesize = async (prevGrounding: ChatMessageGrounding) => {
    const activeThread = thread;
    if (!activeThread || synthesizingEvidenceId) return;

    const evidenceId = prevGrounding.createdAt;
    setEvidenceSynthesisError(null);

    const apiKey = await getNineRouterApiKey(db);
    const config = await getNineRouterConfig(db);
    const model = selectedModel || config.defaultModel;
    if (!apiKey || !config.endpoint || !model) {
      setEvidenceSynthesisError({
        id: evidenceId,
        message: 'Chưa cấu hình đầy đủ API Key, endpoint hoặc mô hình 9router.',
        requiresConfig: true,
      });
      return;
    }

    setSynthesizingEvidenceId(evidenceId);
    try {
      const deps = createDefaultGroundedTurnDeps({
        knowledgeBaseUrl: knowledgeConfig.baseUrl,
        knowledgeToken: knowledgeConfig.token,
        db,
      });

      const allMsgs = await getMessagesByThreadId(activeThread.id, db);
      const msgIndex = allMsgs.findIndex(
        (m) => m.grounding && m.grounding.createdAt === evidenceId
      );
      let originalQuery = '';
      if (msgIndex > 0) {
        for (let i = msgIndex - 1; i >= 0; i--) {
          const candidateMsg = allMsgs[i];
          if (candidateMsg && candidateMsg.role === 'user' && candidateMsg.content) {
            originalQuery = candidateMsg.content;
            break;
          }
        }
      }

      const res = await synthesizeFromStoredEvidence(prevGrounding, deps, {
        query: originalQuery,
        endpoint: config.endpoint,
        apiKey,
        model,
        promptVersion: 'grounded-v1',
      });

      if (res.kind !== 'grounded_answer') {
        throw new Error('Mô hình không tạo được câu trả lời từ bằng chứng đã lưu.');
      }

      const target = allMsgs.find(
        (m) => m.grounding && m.grounding.createdAt === evidenceId
      );
      if (!target) {
        throw new Error('Không tìm thấy kết quả bằng chứng cần tổng hợp.');
      }
      await db.chatMessages.update(target.id, { grounding: res.grounding });
    } catch (err: any) {
      setEvidenceSynthesisError({
        id: evidenceId,
        message: err?.message || 'Không thể tạo câu trả lời từ bằng chứng.',
        requiresConfig: false,
      });
    } finally {
      setSynthesizingEvidenceId(null);
    }
  };

  // Explicit broader-retrieval action: one fixed new turn, original message immutable (D-04).
  const findingRelatedRef = useRef<string | null>(null);
  const [findingRelatedKey, setFindingRelatedKey] = useState<string | null>(null);

  const handleFindRelated = async (
    entity: PersistedEntityRef,
    sourceMessageId: string
  ) => {
    const key = `${sourceMessageId}:${entity.urn}`;
    if (findingRelatedRef.current) return;
    findingRelatedRef.current = key;
    setFindingRelatedKey(key);
    try {
      await handleSendMessage(`Tìm mọi quan hệ liên quan đến ${entity.canonicalName}`);
    } finally {
      findingRelatedRef.current = null;
      setFindingRelatedKey(null);
    }
  };

  const groundedCallbacks: GroundedAnswerCardCallbacks = {
    onFindRelated: (entity, sourceMessageId) => {
      void handleFindRelated(entity, sourceMessageId);
    },
    findingRelatedKey,
    onCitationActivate: (c) => setActivePreviewCitation(c),
    onCandidateSelect: (urn) => {
      void handleSendMessage(urn);
    },
    onRefinementSelect: (label) => {
      // Populates input without auto-send (UI-SPEC Interaction Contracts)
      setExternalInputValue(label);
    },
    onEvidenceOnlySynthesize: () => {
      const lastGrounded = [...messages].reverse().find((m) => m.grounding)?.grounding;
      if (lastGrounded) {
        void handleEvidenceOnlySynthesize(lastGrounded);
      }
    },
    onInvalidRetry: () => {
      if (lastSubmittedText) {
        void handleSendMessage(lastSubmittedText);
      }
    },
    onAuthRepair: () => {
      onOpenSettings?.();
    },
    onConfigRepair: () => {
      onOpenSettings?.();
    },
    onFreshLookup: () => {
      if (lastSubmittedText) {
        void handleSendMessage(lastSubmittedText);
      }
    },
    synthesizingEvidenceId,
    evidenceSynthesisError,
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
        onRefreshModels={handleRefreshModels}
        isRefreshingModels={isRefreshingModels}
        autoApproveMutations={autoApproveMutations}
        onToggleAutoApproveMutations={handleToggleAutoApproveMutations}
        analysisMode={analysisMode}
        onToggleAnalysisMode={handleToggleAnalysisMode}
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

      {/* ScopeChipsBar after routing per D-15 (only when routed scope has concrete facets) */}
      {latestRoutedScope && hasMeaningfulRoutedScope(latestRoutedScope.routedScope) && (
        <div style={{ padding: '0 14px' }}>
          <ScopeChipsBar
            routedScope={latestRoutedScope.routedScope!}
            onEditScope={() => setScopeModalOpen(true)}
          />
        </div>
      )}

      {/* Message List */}
      <ChatMessageList
        messages={messages}
        streamingText={streamingText}
        isStreaming={isStreaming || Boolean(groundedLoadingStatus)}
        streamingStatus={groundedLoadingStatus || streamingStatus}
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
        groundedCallbacks={groundedCallbacks}
        transientClarifyMessage={transientClarifyMessage}
        onCancelClarify={() => setTransientClarifyMessage(null)}
      />

      {/* QuickPreviewDrawer on citation activation per ANSWER-07, D-10 */}
      <QuickPreviewDrawer
        open={Boolean(activePreviewCitation)}
        docId={activePreviewCitation?.documentId ?? null}
        onClose={() => setActivePreviewCitation(null)}
        sectionAnchor={activePreviewCitation?.sectionAnchor ?? undefined}
        lineRange={
          activePreviewCitation
            ? { start: activePreviewCitation.lineStart, end: activePreviewCitation.lineEnd }
            : undefined
        }
        citedSnapshotId={activePreviewCitation?.snapshotId ?? undefined}
        citedExcerpt={activePreviewCitation?.citedExcerpt ?? undefined}
        relevanceReason={activePreviewCitation?.relevanceReason ?? undefined}
        citedContentHash={activePreviewCitation?.publishedContentHash ?? undefined}
        citationAuthority={activePreviewCitation?.authority ?? undefined}
        snapshotAvailable={true}
        db={db}
      />

      {/* Chat Input Bar */}
      <ChatInputBar
        autoFocus={open}
        onSubmit={handleSendMessage}
        onClear={handleClearContext}
        onClearAll={handleClearAllHistory}
        onStop={handleStopGeneration}
        isStreaming={(isStreaming || Boolean(groundedLoadingStatus)) && !pendingConfirmation}
        placeholder={
          pendingConfirmation
            ? 'Gõ "yes" để xác nhận hoặc "no" để từ chối...'
            : undefined
        }
        db={db}
        attachedFiles={sessionAttachedFiles}
        onAttachFile={handleAttachFile}
        onRemoveFile={handleRemoveFile}
        externalValue={externalInputValue ?? undefined}
        onExternalValueConsumed={() => setExternalInputValue(null)}
      />
    </div>
  );
};
