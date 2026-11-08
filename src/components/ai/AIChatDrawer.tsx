import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { theme, message, Modal } from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type {
  ChatScopeType,
  ChatThread,
  ChatMessage,
  ChatTokenUsage,
} from '../../types/models';
import { generateId, isValidUuid } from '../../utils/uuid';
import {
  buildScopeKey,
  createOrGetThread,
  saveMessage,
  getMessagesByThreadId,
  clearThreadMessages,
  clearAllChatHistory,
} from '../../db/repositories/chatRepo';
import {
  getNineRouterApiKey,
  getNineRouterConfig,
  fetchAvailableModels,
} from '../../services/ai/nineRouterTokenService';
import {
  buildItemContextPrompt,
  buildGlobalContextPrompt,
  serializeDocumentContext,
  extractMentionedEntityIds,
} from '../../services/ai/contextGrounding';
import { compactThreadContext, sanitizeHistoryTurns } from '../../services/ai/contextCompaction';
import {
  type AiToolDefinition,
  describeToolMutationWithContext,
} from '../../services/ai/aiTools';
import { runAiOrchestratorLoop } from '../../services/ai/aiOrchestratorLoop';
import { getToolsForTurn } from '../../services/ai/chatTurnTools';
import {
  getMcpServers,
  discoverAllMcpTools,
  getEnabledMcpInstructions,
  toggleMcpServer,
  type McpServerConfig,
} from '../../services/ai/mcpClient';
import { launchClaudeTerminal } from '../../services/ai/claudeCliService';
import { updateTask, getTask } from '../../db/repositories/taskRepo';
import { createNote } from '../../db/repositories/noteRepo';
import { getChangeRequest } from '../../db/repositories/changeRequestRepo';
import { getSystem } from '../../db/repositories/systemRepo';
import { getGlobalConventions, loadMultiRepoConventions } from '../../services/conventionService';
import { buildConventionsSegment } from '../../services/ai/sdlcPromptComposer';
import { getTodayDateString } from '../../utils/date';
import dayjs from 'dayjs';
import { ChatHeader } from './ChatHeader';
import { ScopePickerModal } from './ScopePickerModal';
import { QuickPreviewDrawer } from '../notes/QuickPreviewDrawer';
import { AIDebugModal } from './AIDebugModal';
import { AITaskPlannerInstructionsModal } from './AITaskPlannerInstructionsModal';
import { McpSettingsModal } from './McpSettingsModal';
import { OracleSqlclSettingsModal } from './OracleSqlclSettingsModal';
import { getOracleToolConfig } from '../../services/ai/oracleSqlclService';
import { SshFsSettingsModal } from './SshFsSettingsModal';
import { getSshFsToolConfig } from '../../services/ai/sshFsToolService';
import { logAiChatError } from './aiChatDiagnostics';
import { RestoredSourceNotice } from './RestoredSourceNotice';
import { deriveMissingSources } from './wizard/restoreRecovery';
import { aiDebugService } from '../../services/ai/aiDebugService';
import { IntentRouterUnavailableError } from '../../services/ai/intentRouter';
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
import { ScopeChipsBar, hasMeaningfulRoutedScope } from './grounded/ScopeChipsBar';
import type { GroundedAnswerCardCallbacks } from './ChatMessageBubble';
import { ChatTabBar, type ChatTabItem } from './ChatTabBar';
import { useTabRuntimes } from './runtime/useTabRuntimes';
import {
  createHostAbortController,
  createTabTurnRegistry,
  type TabTurnRegistry,
} from './runtime/tabRuntimes';
import type {
  ChatTurnRuntimeDeps,
  ChatTurnStatus,
} from './runtime/chatTurnRuntime';
import { AiChatWidget } from './AiChatWidget';
import { InterruptedBanner } from './InterruptedBanner';
import { subscribeAIChatSync } from '../../services/ai/aiSyncChannel';
import {
  listTabsByScope,
  getOrCreateActiveChatTab,
  createChatTab,
  setActiveTab,
  updateChatTab,
  deleteChatTab,
} from '../../db/repositories/chatTabRepo';
import type { ChatTab } from '../../types/models';
import type { TabRuntimePatch, TabRuntimeStatus } from './runtime/tabTypes';
import { stageLabelFor } from './runtime/useChatTurn';
import { aiTurnManager, ACTIVE_AI_STATUSES } from '../../services/ai/aiTurnManager';

// Module-level registry so background AI turns survive drawer unmounts and view navigation
let globalTabTurnRegistry: TabTurnRegistry | null = null;
let globalDbInstance: TaskPlannerDatabase | null = null;
const globalHostAbortMap = new Map<string, AbortController>();

/** Runtime turn status → drawer tab badge status. */
export const TURN_STATUS_TO_TAB: Record<ChatTurnStatus, TabRuntimeStatus> = {
  idle: 'idle',
  preparing: 'processing',
  streaming: 'processing',
  tool: 'processing',
  synthesizing: 'processing',
  'awaiting-approval': 'processing',
  complete: 'idle',
  'tool-limit': 'idle',
  error: 'error',
  aborted: 'idle',
};

/** Debug log wants the parsed arguments; a malformed payload must not break the turn. */
function tryParseToolArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export const AI_CHAT_WIDTH_KEY = 'planner:ai_chat_width';
export const AI_AUTO_APPROVE_MUTATIONS_KEY = 'planner:ai_auto_approve_mutations';
export const AI_ANALYSIS_MODE_KEY = 'planner:ai_analysis_mode';
export const AI_TAB_ANALYSIS_MODES_KEY = 'planner:ai_tab_analysis_modes';
const DRAWER_QUICK_PROMPTS = [
  { id: 'plan-today', label: 'Lập kế hoạch hôm nay', prompt: 'Lập kế hoạch công việc hôm nay' },
  { id: 'status', label: 'Báo cáo tiến độ', prompt: 'Báo cáo tiến độ hiện tại' },
  { id: 'overdue', label: 'Tác vụ quá hạn', prompt: 'Kiểm tra các tác vụ quá hạn' },
  { id: 'help', label: 'Hướng dẫn sử dụng', prompt: 'Hướng dẫn sử dụng trợ lý AI và các lệnh' },
];

export const DEFAULT_AI_CHAT_WIDTH = 380;
export const MIN_AI_CHAT_WIDTH = 320;
export const MAX_AI_CHAT_WIDTH = 650;

type SdlcPromptArtifact = {
  content?: string | undefined;
  sourceReferences?: string[] | undefined;
  version?: number | undefined;
};

export interface SdlcWrapperPromptInput {
  userQuery: string;
  step?: string | undefined;
  metadata?: {
    cr?: string | undefined;
    featureName?: string | undefined;
    requestingUnit?: string | undefined;
  } | undefined;
  artifacts?: {
    pl01?: SdlcPromptArtifact | undefined;
    pl02?: SdlcPromptArtifact | undefined;
    solution?: SdlcPromptArtifact | undefined;
  } | undefined;
}

export function buildSdlcWrapperPrompt(input: SdlcWrapperPromptInput): string {
  const parts: string[] = [];
  const step = input.step ?? 'INTAKE';
  parts.push(`[Quy trình SDLC - Bước: ${step}]`);
  if (input.metadata) {
    if (input.metadata.cr) parts.push(`- CR: ${input.metadata.cr}`);
    if (input.metadata.featureName) parts.push(`- Tính năng: ${input.metadata.featureName}`);
    if (input.metadata.requestingUnit) parts.push(`- Đơn vị yêu cầu: ${input.metadata.requestingUnit}`);
  }

  parts.push(`\n[CHÍNH SÁCH BẮT BUỘC CHẾ ĐỘ PHÂN TÍCH (ANALYSIS MODE)]:
1. Chỉ sử dụng các công cụ tra cứu chỉ đọc (read-only tools). Không thay đổi CSDL trực tiếp khi chưa có XÁC NHẬN TỪ NGƯỜI DÙNG.
2. Tra cứu hiện trạng mã nguồn, tài liệu và cấu trúc bảng CSDL để đưa ra phân tích chính xác.`);

  if (input.artifacts?.pl01?.content) {
    const refs = input.artifacts.pl01.sourceReferences?.length ? ` (Nguồn: ${input.artifacts.pl01.sourceReferences.join(', ')})` : '';
    parts.push(`\n[YÊU CẦU NGHIỆP VỤ (PL01)]${refs}:\n${input.artifacts.pl01.content}`);
  }
  if (input.artifacts?.pl02?.content) {
    const refs = input.artifacts.pl02.sourceReferences?.length ? ` (Nguồn: ${input.artifacts.pl02.sourceReferences.join(', ')})` : '';
    parts.push(`\n[ĐẶC TẢ CHỨC NĂNG (PL02)]${refs}:\n${input.artifacts.pl02.content}`);
  }
  if (input.artifacts?.solution?.content) {
    const ver = input.artifacts.solution.version ? ` v${input.artifacts.solution.version}` : '';
    parts.push(`\n[GIẢI PHÁP KỸ THUẬT HIỆN TẠI (SOLUTION.md${ver})]:\n${input.artifacts.solution.content}`);
  }

  parts.push(`\n[YÊU CẦU CỦA NGƯỜI DÙNG]:\n${input.userQuery}`);
  return parts.join('\n');
}

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
  isDockedPanel?: boolean;
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
  isDockedPanel = false,
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
  const [internalScope, setInternalScope] = useState<ActiveScope | null>(() => propScope ?? null);
  const [isDetached, setIsDetached] = useState(false);
  const [scopeModalOpen, setScopeModalOpen] = useState(false);
  const [isDebugModalOpen, setIsDebugModalOpen] = useState(false);
  const [isInstructionsOpen, setIsInstructionsOpen] = useState(false);
  const [isMcpModalOpen, setIsMcpModalOpen] = useState(false);
  const [isOracleModalOpen, setIsOracleModalOpen] = useState(false);
  const [oracleToolEnabled, setOracleToolEnabled] = useState(false);
  const [isSshFsModalOpen, setIsSshFsModalOpen] = useState(false);
  const [sshFsToolEnabled, setSshFsToolEnabled] = useState(false);
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([]);
  const knowledgeConfig = useOptionalKnowledgeConfig();

  // Grounded turn state & abort controller per turn (AI-SPEC §4b)
  const [activePreviewCitation, setActivePreviewCitation] = useState<PersistedCitation | null>(null);
  // Routed scope is per-tab like every other transient turn result: it is rendered above the
  // transcript, so a drawer-global value would show tab A's chips under tab B.
  const [routedScopeByTab, setRoutedScopeByTab] = useState<Record<string, ChatMessageGrounding['scope']>>({});
  // Keyed by the owning tab: one tab's pending clarification must never be consumed by another
  // tab's send (D-06/D-10) or rendered under another tab's transcript.
  const [clarifyByTab, setClarifyByTab] = useState<Record<string, {
    id: string;
    originalQuery: string;
    clarifyQuestion: string;
    turnCount: number;
  }>>({});
  const setTransientClarifyMessage = useCallback((
    tabId: string,
    value: { id: string; originalQuery: string; clarifyQuestion: string; turnCount: number } | null
  ) => {
    setClarifyByTab((prev) => {
      if (!value) {
        if (!(tabId in prev)) return prev;
        const next = { ...prev };
        delete next[tabId];
        return next;
      }
      return { ...prev, [tabId]: value };
    });
  }, []);

  // Reload MCP servers on open or change
  const reloadMcpServers = useCallback(async () => {
    try {
      const list = await getMcpServers(db);
      setMcpServers(list);
    } catch (err) {
      logAiChatError('Failed to load MCP servers', err);
    }
  }, [db]);

  useEffect(() => {
    if (open) {
      void reloadMcpServers();
    }
  }, [open, reloadMcpServers]);

  const reloadOracleConfig = useCallback(async () => {
    try {
      const cfg = await getOracleToolConfig(db);
      setOracleToolEnabled(cfg.enabled);
    } catch (err) {
      logAiChatError('Failed to load Oracle tool config', err);
    }
  }, [db]);

  const reloadSshFsConfig = useCallback(async () => {
    try {
      const cfg = await getSshFsToolConfig(db);
      setSshFsToolEnabled(cfg?.enabled ?? false);
    } catch (err) {
      logAiChatError('Failed to load SSH File System tool config', err);
    }
  }, [db]);

  useEffect(() => {
    if (open) {
      void reloadOracleConfig();
      void reloadSshFsConfig();
    }
  }, [open, reloadOracleConfig, reloadSshFsConfig]);

  const handleToggleMcpServer = async (id: string, enabled: boolean) => {
    try {
      const next = await toggleMcpServer(id, enabled, db);
      setMcpServers(next);
      if (enabled && !currentTabMcpEnabled) {
        await handleToggleMcpEnabled();
      }
      message.success(
        enabled ? 'Đã bật máy chủ MCP' : 'Đã tắt máy chủ MCP'
      );
    } catch (err: any) {
      message.error(`Không thể đổi trạng thái MCP: ${err?.message || err}`);
    }
  };

  const handleAttachFile = (filePath: string) => {
    const current = tabRuntimesRef.current.get(activeTabId)?.references ?? [];
    if (current.includes(filePath)) return;
    tabRuntimesRef.current.patch(activeTabId, { references: [...current, filePath] });
  };

  const handleRemoveFile = (filePath: string) => {
    const current = tabRuntimesRef.current.get(activeTabId)?.references ?? [];
    tabRuntimesRef.current.patch(activeTabId, { references: current.filter((p) => p !== filePath) });
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
  const scopeKeyRef = useRef(scopeKey);
  scopeKeyRef.current = scopeKey;

  const isCrScope = currentScope.type === 'cr' && Boolean(currentScope.id);

  // Per-tab runtime/request ownership. Runtime state stays ephemeral; durable history stays in Dexie.
  const tabRuntimes = useTabRuntimes();
  // Cleanup paths (unmount, scope change) must not re-run when the registry identity changes on publish.
  const tabRuntimesRef = useRef(tabRuntimes);
  tabRuntimesRef.current = tabRuntimes;
  // Tab that owns the in-flight turn; every transient write inside the send path targets it.
  const turnTabIdRef = useRef('');

  // ---------------------------------------------------------------------------
  // Shared turn runtime (D-01). One `createChatTurnRuntime` per tab, held in a
  // ref-backed registry so a turn in tab B never aborts tab A's request
  // (T-25.3-35). No `useChatTurn` here: a hook keyed on the active tab would
  // abort the previous runtime on every tab switch and kill background turns.
  // ---------------------------------------------------------------------------
  const turnRegistryRef = useRef<TabTurnRegistry | null>(globalTabTurnRegistry);
  const configRef = useRef<{ endpoint: string; contextWindowTokens?: number } | null>(null);
  // Host-side prelude (grounded routing, prompt assembly) is abortable per tab; the tool loop
  // itself is aborted by the runtime's own controller.
  const hostAbortRef = useRef(globalHostAbortMap);
  // Debug-log turn ids per tab, so the drawer's own debug console keeps tracking turns.
  const debugTurnRef = useRef(new Map<string, string>());
  const hostSignal = (tabId: string) => {
    let controller = hostAbortRef.current.get(tabId);
    if (!controller || controller.signal.aborted) {
      controller = createHostAbortController();
      hostAbortRef.current.set(tabId, controller);
    }
    return controller.signal;
  };
  const abortHostTurn = (tabId: string) => {
    hostAbortRef.current.get(tabId)?.abort();
    hostAbortRef.current.delete(tabId);
  };

  // Host-owned single call site: the runtime receives this loop as an injected dep.
  // Keeping the literal here is deliberate — `tests/phase25_1SafetyGates.test.ts` pins it.
  const runDrawerTurnLoop = useCallback<typeof runAiOrchestratorLoop>(
    (options) =>
      runAiOrchestratorLoop({
        ...options,
        ...(options.contextWindowTokens ?? configRef.current?.contextWindowTokens
          ? { contextWindowTokens: options.contextWindowTokens ?? configRef.current?.contextWindowTokens }
          : {}),
      }),
    []
  );

  const runDrawerTurnLoopRef = useRef(runDrawerTurnLoop);
  runDrawerTurnLoopRef.current = runDrawerTurnLoop;

  if (!globalTabTurnRegistry || globalDbInstance !== db) {
    globalDbInstance = db;
    globalTabTurnRegistry = createTabTurnRegistry((tabId) => {
      const patch = (value: TabRuntimePatch) => tabRuntimesRef.current.patch(tabId, value);
      return {
        runLoop: (options) => runDrawerTurnLoopRef.current(options),
        saveMessage,
        describeMutation: describeToolMutationWithContext,
        db,
        onStatus: (status) => {
          patch({
            status: TURN_STATUS_TO_TAB[status],
            streamingStatus: stageLabelFor(status),
            ...(status === 'streaming' || status === 'tool' || status === 'synthesizing'
              ? { groundedLoadingStatus: null }
              : {}),
            ...(status === 'complete' || status === 'aborted' ? { streamingText: '' } : {}),
            ...(status === 'tool-limit' ? { streamingText: '', partialBuffer: '', toolProgress: null, groundedLoadingStatus: null } : {}),
          });
          setTurnRevision((prev) => prev + 1);

          if (ACTIVE_AI_STATUSES.includes(status)) {
            const currentTab = durableTabsRef.current.find((t) => t.id === tabId);
            const title = currentTab?.title ? `Chat: ${currentTab.title}` : 'AI Chat';
            aiTurnManager.registerTurn({
              id: tabId,
              scopeKey: scopeKeyRef.current,
              title,
              status,
              streamingStatusLabel: stageLabelFor(status),
              streamingText: tabRuntimesRef.current.get(tabId)?.streamingText ?? '',
              toolEvents: tabRuntimesRef.current.get(tabId)?.toolEvents ?? [],
              abort: () => {
                abortHostTurn(tabId);
                globalTabTurnRegistry?.abortTab(tabId);
              },
            });
          } else {
            aiTurnManager.finishTurn(tabId, status);
          }
        },
        onDelta: (delta) => {
          const current = tabRuntimesRef.current.get(tabId)?.streamingText ?? '';
          const next = current + delta;
          patch({ streamingText: next, partialBuffer: next });
          const debugTurnId = debugTurnRef.current.get(tabId);
          if (debugTurnId) aiDebugService.appendStreamChunk(debugTurnId, delta);
          aiTurnManager.updateTurn(tabId, { streamingText: next });
        },
        onToolEvent: (event) => {
          const existing = tabRuntimesRef.current.get(tabId)?.toolProgress;
          const nextEvents = [...(tabRuntimesRef.current.get(tabId)?.toolEvents ?? []), event];
          patch({
            toolProgress: existing === event.name ? null : event.name,
            toolEvents: nextEvents,
          });
          aiTurnManager.updateTurn(tabId, {
            toolEvents: nextEvents,
            toolProgress: existing === event.name ? null : event.name,
          });
          const debugTurnId = debugTurnRef.current.get(tabId);
          if (!debugTurnId) return;
          if (event.phase === 'call') {
            aiDebugService.recordToolCall(debugTurnId, {
              id: event.id,
              name: event.name,
              args: tryParseToolArgs(event.args),
            });
          } else {
            aiDebugService.recordToolResult(debugTurnId, event.id, event.result ?? '', event.durationMs);
          }
        },
        onAwaitingApproval: ({ toolName, summary }) => {
          patch({ pendingConfirmation: { toolName, summary }, streamingStatus: 'Chờ xác nhận hành động...' });
          setTurnRevision((prev) => prev + 1);
          aiTurnManager.updateTurn(tabId, {
            status: 'awaiting-approval',
            streamingStatusLabel: 'Chờ xác nhận hành động...',
          });
        },
        onError: (info) => {
          patch({
            status: 'error',
            error: { code: info.code as never, message: info.message, requestId: generateId() },
            streamingText: '',
            partialBuffer: '',
            groundedLoadingStatus: null,
          });
          setTurnRevision((prev) => prev + 1);
          aiTurnManager.finishTurn(tabId, 'error');
        },
      } satisfies ChatTurnRuntimeDeps;
    });
  }
  turnRegistryRef.current = globalTabTurnRegistry;

  const [syncTrigger, setSyncTrigger] = useState(0);

  // Durable multi-tab state for all scopes from Dexie chatTabs table
  const durableTabs = useLiveQuery<ChatTab[]>(async () => {
    return listTabsByScope(scopeKey, db);
  }, [db, scopeKey, syncTrigger]) ?? [];
  const durableTabsRef = useRef<ChatTab[]>([]);
  durableTabsRef.current = durableTabs;

  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);
  const activeTab = (selectedTabId ? durableTabs.find((t) => t.id === selectedTabId) : undefined)
    ?? durableTabs.find((t) => t.active)
    ?? durableTabs[0];
  const activeTabId = activeTab?.id ?? 'default';
  const activeTabThreadId = activeTab?.threadId;
  const isSdlcActiveTab = false;
  // Async hub handlers compare against the live tab id, not the one closed over at call time.
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;

  // Use durable tab ownership when available, but preserve legacy thread reads while tabs initialize.
  const thread = useLiveQuery<ChatThread | undefined>(() => {
    if (activeTabThreadId) return db.chatThreads.get(activeTabThreadId);
    return db.chatThreads.where('scopeKey').equals(scopeKey).first();
  }, [db, activeTabThreadId, scopeKey]);

  const activeThreadId = activeTabThreadId ?? thread?.id;

  useEffect(() => {
    return subscribeAIChatSync((payload) => {
      if (payload.type === 'message_saved') {
        if (!payload.threadId || payload.threadId === activeThreadId) {
          setSyncTrigger((prev) => prev + 1);
        }
      } else if (payload.type === 'tab_updated') {
        if (!payload.scopeKey || payload.scopeKey === scopeKey) {
          setSyncTrigger((prev) => prev + 1);
        }
      }
    });
  }, [activeThreadId, scopeKey]);

  // Draft typed before the durable tab resolved must not be dropped by the per-tab remount.
  const draftCarryRef = useRef<{ tabId: string; text: string }>({ tabId: '', text: '' });
  // Controlled composer needs a value even before the active tab's runtime is seeded.
  const [unseededDraft, setUnseededDraft] = useState('');

  // Seed a runtime for the active tab before any patch, so tab badges reflect real status (SC-2).
  useEffect(() => {
    if (!activeTabId || !activeThreadId) return;
    const registry = tabRuntimesRef.current;
    // Before the durable tab list resolves, the placeholder id owns the first turn's state.
    // Its runtime is kept until that turn ends (see activeRuntimeTabId), so nothing is re-keyed mid-flight.
    const runtime = registry.initialize(activeTabId, activeThreadId);
    const carry = draftCarryRef.current;
    if (carry.tabId !== activeTabId) {
      draftCarryRef.current = { tabId: activeTabId, text: runtime.draft };
    } else if (carry.text && !runtime.draft) {
      registry.patch(activeTabId, { draft: carry.text });
    }
  }, [activeTabId, activeThreadId]);

  // Model & Token settings. Model is per-tab and durable in ChatTab.config.model (D-07).
  const [persistedDefaultModel, setPersistedDefaultModel] = useState<string>('');
  // Ref mirror so the resolver is never empty inside an async send that outruns the model effect.
  const persistedDefaultModelRef = useRef<string>('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isRefreshingModels, setIsRefreshingModels] = useState(false);

  // Runtime mirror first (patched synchronously), then durable config, then the persisted global default.
  const resolveActiveModel = () =>
    tabRuntimes.get(activeTabId)?.model ||
    tabRuntimes.get(turnTabIdRef.current)?.model ||
    activeTab?.config?.model ||
    persistedDefaultModel ||
    persistedDefaultModelRef.current;

  const writeTabModel = useCallback(
    async (tab: ChatTab | undefined, model: string) => {
      if (!tab) return;
      try {
        await updateChatTab(tab.id, { config: { ...(tab.config ?? {}), model } }, db);
      } catch (err) {
        logAiChatError('Failed to update tab model', err);
        return;
      }
      tabRuntimesRef.current.patch(tab.id, { model });
    },
    [db]
  );

  const handleRefreshModels = useCallback(async () => {
    setIsRefreshingModels(true);
    try {
      const liveModels = await fetchAvailableModels(db);
      if (liveModels.length > 0) {
        setAvailableModels(liveModels);
        const current = resolveActiveModel();
        const next = liveModels.includes(current) ? current : liveModels[0];
        if (next) await writeTabModel(activeTab, next);
        message.success(`Đã cập nhật ${liveModels.length} mô hình từ 9router`);
      } else {
        message.warning('Không tìm thấy mô hình nào từ 9router');
      }
    } catch (err: any) {
      message.error(`Không thể tải danh sách mô hình: ${err?.message || err}`);
    } finally {
      setIsRefreshingModels(false);
    }
  }, [activeTab, db, writeTabModel]);

  useEffect(() => {
    let mounted = true;

    async function loadModels() {
      const cfg = await getNineRouterConfig(db);
      if (!mounted) return;
      persistedDefaultModelRef.current = cfg.defaultModel;
      setPersistedDefaultModel(cfg.defaultModel);

      // Seed a MISSING durable per-tab model once; never rewrite a model the user already chose.
      const durable = await listTabsByScope(scopeKey, db);
      if (!mounted) return;
      for (const tab of durable) {
        if (tab.type !== 'chat' || tab.config?.model) continue;
        try {
          // Conditional write inside one transaction: a model picked while this ran is never clobbered.
          const seeded = await db.transaction('rw', [db.chatTabs], async () => {
            const latest = await db.chatTabs.get(tab.id);
            if (!latest || latest.config?.model) return false;
            await db.chatTabs.update(tab.id, {
              config: { ...(latest.config ?? {}), model: cfg.defaultModel },
              updatedAt: new Date().toISOString(),
            });
            return true;
          });
          if (seeded) tabRuntimesRef.current.patch(tab.id, { model: cfg.defaultModel });
        } catch (err) {
          logAiChatError('Failed to seed tab model', err);
        }
      }

      const rec = await db.settings.get('ninerouter_cached_models');
      const cached = Array.isArray(rec?.value) ? (rec.value as string[]) : [];
      if (cached.length > 0) setAvailableModels(cached);

      if (open) {
        try {
          const liveModels = await fetchAvailableModels(db);
          if (mounted && liveModels.length > 0) setAvailableModels(liveModels);
        } catch {
          // ignore background fetch error
        }
      }
    }

    loadModels();
    return () => {
      mounted = false;
    };
  }, [db, open, scopeKey]);

  const handleModelChange = async (model: string) => {
    await writeTabModel(activeTab, model);
  };

  const messages = useLiveQuery<ChatMessage[]>(() => {
    if (!activeThreadId) return [];
    return getMessagesByThreadId(activeThreadId, db);
  }, [db, activeThreadId, syncTrigger]) ?? [];

  const ensureTurnTabRef = useRef<() => Promise<ChatTab>>(() =>
    Promise.reject(new Error('tab bootstrap not ready'))
  );

  useEffect(() => {
    // Non-CR and CR scopes adopt their legacy thread through getOrCreateActiveChatTab,
    // which is transactional and therefore safe against a concurrent send creating the same first tab.
    if (durableTabs.length > 0) return;
    void ensureTurnTabRef.current().catch((err) =>
      logAiChatError('Failed to bootstrap first chat tab', err)
    );
  }, [currentScope.id, currentScope.type, db, durableTabs.length, scopeKey]);

  // Ensure durable tabs are initialized in Dexie for the active scope
  const tabInitializationRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open || tabInitializationRef.current === scopeKey) return;
    tabInitializationRef.current = scopeKey;
    let cancelled = false;

    const initTabs = async () => {
      try {
        const existing = await listTabsByScope(scopeKey, db);
        if (cancelled) return;

        if (isCrScope && currentScope.id) {
          // One-shot migration: a legacy global analysis-mode flag seeds durable per-tab config,
          // then the key is removed so it can never override per-tab state again (D-07).
          let legacyAnalysisMode = false;
          try {
            legacyAnalysisMode = localStorage.getItem(AI_ANALYSIS_MODE_KEY) === 'true';
          } catch {
            legacyAnalysisMode = false;
          }
          if (legacyAnalysisMode) {
            for (const tab of existing) {
              if (tab.type !== 'chat' || tab.config?.analysisMode !== undefined) continue;
              try {
                await updateChatTab(tab.id, { config: { ...(tab.config ?? {}), analysisMode: true } }, db);
              } catch (err) {
                logAiChatError('Failed to migrate tab analysis mode', err);
              }
            }
            try {
              localStorage.removeItem(AI_ANALYSIS_MODE_KEY);
            } catch {
              // ignore storage error
            }
          }

          const ordinary = existing.filter((t) => t.type === 'chat');
          if (!existing.some((tab) => tab.active) && ordinary[0]) {
            await setActiveTab(scopeKey, ordinary[0].id, db);
          }
        }
      } catch (err) {
        tabInitializationRef.current = null;
        logAiChatError('Tab initialization error', err);
      }
    };

    void initTabs();
    return () => {
      cancelled = true;
    };
  }, [currentScope.id, currentScope.type, db, isCrScope, open, scopeKey]);

  const handleSelectTab = useCallback(
    async (tabId: string) => {
      setSelectedTabId(tabId);
      activeTabIdRef.current = tabId;
      try {
        await setActiveTab(scopeKey, tabId, db);
      } catch (err) {
        logAiChatError('Failed to set active tab', err);
      }
    },
    [db, scopeKey]
  );

  const handleRenameTab = useCallback(
    async (tabId: string, title: string) => {
      try {
        await updateChatTab(tabId, { title }, db);
      } catch {
        message.error('Không thể đổi tên tab');
      }
    },
    [db]
  );

  const handleAddTab = useCallback(async () => {    try {
      const ordinaryCount = durableTabs.filter((t) => t.type === 'chat').length;
      const title = `💬 Cuộc trò chuyện #${ordinaryCount + 1}`;
      const newTab = await createChatTab(
        {
          scopeType: currentScope.type,
          scopeKey,
          entityId: currentScope.id,
          title,
        },
        db
      );
      await setActiveTab(scopeKey, newTab.id, db);
    } catch (err) {
      logAiChatError('Failed to add tab', err);
      message.error('Không thể tạo tab mới');
    }
  }, [currentScope.id, currentScope.type, db, durableTabs, scopeKey]);

  const handleCloseTab = useCallback(
    (tabId: string) => {
      const targetTab = durableTabs.find((t) => t.id === tabId);
      if (!targetTab) return;

      const isRunning =
        turnRegistryRef.current?.peek(tabId)?.isRunning() ||
        tabRuntimes.get(tabId)?.status === 'processing';

      const doDelete = async () => {
        // Close-aborts-before-delete: a running turn never survives its tab.
        turnRegistryRef.current?.discard(tabId);
        tabRuntimes.discard(tabId);
        setTransientClarifyMessage(tabId, null);
        try {
          await deleteChatTab(tabId, db);
        } catch (err) {
          logAiChatError('Failed to delete tab', err);
          message.error('Không thể đóng tab');
        }
      };

      if (isRunning) {
        Modal.confirm({
          title: 'Xác nhận đóng tab',
          content: `Đóng tab “${targetTab.title}”? Yêu cầu đang chạy trong tab này sẽ bị dừng và không được lưu.`,
          okText: 'Đóng tab',
          okButtonProps: { danger: true },
          cancelText: 'Giữ lại',
          onOk: doDelete,
        });
      } else {
        void doDelete();
      }
    },
    [db, durableTabs, setTransientClarifyMessage, tabRuntimes]
  );

  const handleReorderTabs = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= durableTabs.length ||
        toIndex >= durableTabs.length ||
        fromIndex === toIndex
      ) {
        return;
      }
      const reordered = [...durableTabs];
      const [moved] = reordered.splice(fromIndex, 1);
      if (!moved) return;
      reordered.splice(toIndex, 0, moved);

      try {
        await db.transaction('rw', [db.chatTabs], async () => {
          for (let i = 0; i < reordered.length; i++) {
            const item = reordered[i];
            if (item && item.order !== i) {
              await db.chatTabs.update(item.id, { order: i, updatedAt: new Date().toISOString() });
            }
          }
        });
      } catch (err) {
        logAiChatError('Failed to reorder tabs', err);
      }
    },
    [db, durableTabs]
  );

  // D-30: a restored workflow whose source Notes vanished blocks the next AI step.
  const restoredMissingSourcesRef = useRef<Array<{ id: string; title: string }>>([]);
  const restoredMissingSources = useLiveQuery(async () => {
    // The workflow row is keyed by the SDLC tab's durable thread, not by the CR alone.
    const sdlcTabs = durableTabs.filter((tab) => tab.type === 'sdlc' && tab.threadId);
    if (sdlcTabs.length === 0) return [];
    const notes = await db.notes.toArray();
    const missing = new Map<string, { id: string; title: string }>();
    for (const tab of sdlcTabs) {
      const row = await db.settings.get(`sdlc_workflow:${currentScope.id}:${tab.threadId}`);
      for (const source of deriveMissingSources(
        row?.value as Parameters<typeof deriveMissingSources>[0],
        new Set(notes.map((note) => note.id))
      )) {
        missing.set(source.id, source);
      }
    }
    return [...missing.values()];
  }, [db, currentScope.id, durableTabs, messages.length]) ?? [];
  restoredMissingSourcesRef.current = restoredMissingSources;

  // D-30 / checkpoint recovery: a persisted `interrupted` checkpoint renders a Continue/Discard banner.
  const sdlcCheckpoints = useLiveQuery(async () => {
    const sdlcTabs = durableTabs.filter((tab) => tab.type === 'sdlc' && tab.threadId);
    const found: Array<{ tabId: string; requestId: string; step?: string }> = [];
    for (const tab of sdlcTabs) {
      const row = await db.settings.get(`sdlc_workflow:${currentScope.id}:${tab.threadId}`);
      const checkpoint = (row?.value as { checkpoint?: { status?: string; step?: string; requestId?: string } })
        ?.checkpoint;
      // A checkpoint still marked `running` belongs to a previous app session: restore() reads
      // it as interrupted, and the banner must offer the same recovery (D-30).
      if (
        (checkpoint?.status === 'interrupted' || checkpoint?.status === 'running') &&
        checkpoint.requestId
      ) {
        found.push({ tabId: tab.id, requestId: checkpoint.requestId, ...(checkpoint.step ? { step: checkpoint.step } : {}) });
      }
    }
    return found;
  }, [db, currentScope.id, durableTabs, messages.length]) ?? [];
  const [discardedCheckpoints, setDiscardedCheckpoints] = useState<Record<string, true>>({});
  const activeCheckpoint =
    sdlcCheckpoints.find((checkpoint) => !discardedCheckpoints[checkpoint.requestId]) ?? null;

  /** Continue/Discard persist their decision through the SDLC coordinator before any transport call. */
  const resolveCheckpoint = async (decision: 'continue' | 'discard') => {
    const checkpoint = activeCheckpoint;
    if (!checkpoint) return;
    const tab = durableTabs.find((entry) => entry.id === checkpoint.tabId);
    if (!tab?.threadId) return;
    const key = `sdlc_workflow:${currentScope.id}:${tab.threadId}`;
    const row = await db.settings.get(key);
    if (!row) return;
    setDiscardedCheckpoints((prev) => ({ ...prev, [checkpoint.requestId]: true }));
    if (decision === 'discard') {
      const next = { ...(row.value as Record<string, unknown>) };
      delete next.checkpoint;
      await db.settings.put({ key, value: next });
      return;
    }
    if (restoredMissingSources.length > 0) return;
    await db.settings.put({
      key,
      value: {
        ...(row.value as Record<string, unknown>),
        checkpoint: { requestId: generateId(), step: checkpoint.step, status: 'running', startedAt: new Date().toISOString() },
      },
    });
    void handleSendTurn('Tiếp tục công việc đang dở dang sau khi bị gián đoạn.');
  };

  // Evidence synthesis state (not part of a chat turn)
  const [synthesizingEvidenceId, setSynthesizingEvidenceId] = useState<string | null>(null);
  const [evidenceSynthesisError, setEvidenceSynthesisError] = useState<{
    id: string;
    message: string;
    requiresConfig: boolean;
  } | null>(null);
  const [scrollTrigger, setScrollTrigger] = useState(0);
  // Registry publishes are not React state; this bumps so the widget re-reads the runtime.
  const [turnRevision, setTurnRevision] = useState(0);

  const [externalInputValue, setExternalInputValue] = useState<string | null>(null);

  // Consume pendingDraft from AIChatContext into input draft without auto-sending
  useEffect(() => {
    if (open && pendingDraft) {
      setExternalInputValue(pendingDraft);
      clearPendingDraft();
    }
  }, [open, pendingDraft, clearPendingDraft]);

  // Auto-approve mutation toggle: isolated per-tab in activeTab.config.autoApproveMutations
  const autoApproveMutations = Boolean(activeTab?.config?.autoApproveMutations);

  const handleToggleAutoApproveMutations = useCallback(async (tabId?: string) => {
    const targetId = tabId || activeTabIdRef.current;
    if (!targetId || targetId === 'default') return;
    const tab = await db.chatTabs.get(targetId);
    if (!tab) return;
    const currentVal = Boolean(tab.config?.autoApproveMutations);
    const nextVal = !currentVal;
    try {
      await updateChatTab(
        targetId,
        {
          config: { ...(tab.config || {}), autoApproveMutations: nextVal },
        },
        db
      );
    } catch (err) {
      logAiChatError('Failed to update tab autoApproveMutations', err);
    }
    if (nextVal) {
      message.warning(
        'Đã bật tự động duyệt thay đổi dữ liệu cho tab này. AI sẽ tự động thực thi và báo cáo chi tiết.'
      );
    } else {
      message.info(
        'Đã tắt tự động duyệt cho tab này. AI sẽ hỏi xác nhận trước khi thực hiện thay đổi dữ liệu.'
      );
    }
  }, [db]);

  // Analysis mode: durable per-tab state via ChatTab.config. Tab 'sdlc' is always true.
  // The legacy global key never feeds this expression; it only seeds durable config once (D-07).
  const currentTabAnalysisMode = isSdlcActiveTab ? true : Boolean(activeTab?.config?.analysisMode);

  const handleToggleAnalysisMode = useCallback(async (tabId?: string) => {
    const targetId = tabId || activeTabIdRef.current;
    if (!targetId || targetId === 'default') return;
    const tab = await db.chatTabs.get(targetId);
    if (!tab) return;
    const currentVal = Boolean(tab.config?.analysisMode);
    const nextVal = !currentVal;
    try {
      await updateChatTab(
        targetId,
        {
          config: { ...(tab.config || {}), analysisMode: nextVal },
        },
        db
      );
    } catch (err) {
      logAiChatError('Failed to update tab analysis mode', err);
    }
    message.info(
      nextVal
        ? 'Đã bật chế độ phân tích cho tab này. AI sẽ tra cứu tri thức và CSDL bằng công cụ.'
        : 'Đã tắt chế độ phân tích cho tab này. Quay lại chế độ hội thoại thông thường.'
    );
  }, [db]);

  // MCP toggle: isolated per-tab in activeTab.config.mcpEnabled (defaults to true)
  const currentTabMcpEnabled = activeTab?.config?.mcpEnabled !== false;

  const handleToggleMcpEnabled = useCallback(async (tabId?: string) => {
    const targetId = tabId || activeTabIdRef.current;
    if (!targetId || targetId === 'default') return;
    const tab = await db.chatTabs.get(targetId);
    if (!tab) return;
    const currentVal = tab.config?.mcpEnabled !== false;
    const nextVal = !currentVal;
    try {
      await updateChatTab(
        targetId,
        {
          config: { ...(tab.config || {}), mcpEnabled: nextVal },
        },
        db
      );
    } catch (err) {
      logAiChatError('Failed to update tab mcpEnabled', err);
    }
    message.info(
      nextVal
        ? 'Đã bật công cụ MCP cho tab này.'
        : 'Đã tắt công cụ MCP cho tab này. AI chỉ sử dụng công cụ nội bộ.'
    );
  }, [db]);

  const tabAnalysisModes = useMemo(() => {
    const modes: Record<string, boolean> = {};
    for (const t of durableTabs) {
      modes[t.id] = Boolean(t.config?.analysisMode);
    }
    return modes;
  }, [durableTabs]);

  const tabStatuses = useMemo(() => {
    const statuses: Record<string, TabRuntimeStatus> = {};
    for (const t of durableTabs) {
      statuses[t.id] = tabRuntimes.get(t.id)?.status ?? 'idle';
    }
    return statuses;
  }, [durableTabs, tabRuntimes]);

  const displayTabs: ChatTabItem[] = useMemo(() => {
    return durableTabs.map((t) => ({
      id: t.id,
      type: t.type,
      title: t.title,
      threadId: t.threadId,
      createdAt: t.createdAt,
    }));
  }, [durableTabs]);

  const handleConfirmAction = useCallback((confirmed: boolean) => {
    const runtime = tabRuntimesRef.current.get(activeTabId);
    runtime?.confirmationResolver?.(confirmed);
    tabRuntimesRef.current.patch(activeTabId, {
      pendingConfirmation: null,
      confirmationResolver: undefined,
    });
    turnRegistryRef.current?.peek(activeTabId)?.resolveApproval(confirmed);
    setTurnRevision((prev) => prev + 1);
  }, [activeTabId]);

  // Every render and every callback reads one owner: the active tab's runtime. Only while the
  // durable tab list is hydrating does the in-flight turn's runtime stand in, because the
  // placeholder id owns that turn.
  const activeRuntimeIsProvisional = !durableTabs.some((tab) => tab.id === activeTabId);
  const activeRuntimeTabId = activeRuntimeIsProvisional
    ? turnTabIdRef.current || activeTabId
    : activeTabId;
  const activeRuntime = tabRuntimes.get(activeRuntimeTabId);
  const runtimeTabId = activeRuntimeTabId;
  // `turnRevision` forces a re-read of the registry after every runtime publish.
  const activeTurnRuntime = useMemo(
    () => turnRegistryRef.current?.peek(activeRuntimeTabId),
    [activeRuntimeTabId, turnRevision, tabRuntimes.snapshot]
  );
  const activeToolEvents = activeRuntime?.toolEvents ?? [];
  const activeRoutedScope = routedScopeByTab[activeRuntimeTabId] ?? null;

  // Background turns continue running when the drawer unmounts or view switches.
  // Abort only occurs on explicit user Stop action or tab deletion.
  useEffect(() => {
    return () => {
      // Intentionally do NOT abort tab runtimes on unmount.
    };
  }, []);

  // On scope change: clear ephemeral prelude states without killing in-flight tab turns
  useEffect(() => {
    for (const tabId of preludeTokenRef.current.keys()) {
      preludeTokenRef.current.delete(tabId);
    }
    setPreludeTabs({});
  }, [currentScope.type, currentScope.id]);

  const handleStopGeneration = () => {
    const runtime = tabRuntimesRef.current.get(activeRuntimeTabId);
    // Stop is reachable during the prelude now that it paints as 'preparing'. The runtime has not
    // started yet, so aborting it cannot cancel anything — drop the tab's prelude token so the
    // staged turn can never start, and release the staged UI now rather than when the awaited
    // prelude finally returns.
    if (!turnRegistryRef.current?.peek(activeRuntimeTabId)?.isRunning()) {
      preludeTokenRef.current.delete(activeRuntimeTabId);
      markPrelude(activeRuntimeTabId, false);
    }
    abortHostTurn(activeRuntimeTabId);
    turnRegistryRef.current?.abortTab(activeRuntimeTabId);
    aiTurnManager.abortTurn(activeRuntimeTabId);
    runtime?.requestController?.abort();
    runtime?.confirmationResolver?.(false);
    tabRuntimesRef.current.patch(activeRuntimeTabId, {
      status: 'idle',
      pendingConfirmation: null,
      confirmationResolver: undefined,
      requestController: undefined,
      groundedLoadingStatus: null,
      streamingStatus: null,
      partialBuffer: '',
    });
    setTurnRevision((prev) => prev + 1);
  };

  // Single-flight only while a creation is in flight: the bootstrap effect and a send path must not
  // each create a first tab, but a resolved result must never be cached across tab switches.
  const ensureTabPromiseRef = useRef<{ scopeKey: string; promise: Promise<ChatTab> } | null>(null);
  const ensureTurnTab = () => {
    const inFlight = ensureTabPromiseRef.current;
    if (inFlight && inFlight.scopeKey === scopeKey) return inFlight.promise;
    const promise = getOrCreateActiveChatTab(
      {
        scopeType: currentScope.type,
        scopeKey,
        entityId: currentScope.id,
        title: currentScope.title,
      },
      db
    ).finally(() => {
      if (ensureTabPromiseRef.current?.promise === promise) ensureTabPromiseRef.current = null;
    });
    ensureTabPromiseRef.current = { scopeKey, promise };
    return promise;
  };
  ensureTurnTabRef.current = ensureTurnTab;

  const notifyIfBlurred = (content: string) => {
    const isBlurred = typeof document !== 'undefined' && (document.hidden || !document.hasFocus?.());
    if (!isBlurred) return;
    const snippet = content.trim().slice(0, 120);
    void sendDesktopNotification({
      title: `${APP_NAME} AI`,
      body: snippet + (content.trim().length > 120 ? '...' : ''),
      tag: 'ai-turn-finished',
    });
  };

  // Every transient write is keyed by the tab that owns the turn, never by whichever tab is visible.
  const patchGroundedLoading = (value: string | null, ownerTabId = turnTabIdRef.current) => {
    tabRuntimes.patch(ownerTabId, { groundedLoadingStatus: value });
  };
  const patchTurnError = (
    code: 'request_failed' | 'invalid_response' | 'timeout',
    message: string,
    ownerTabId = turnTabIdRef.current
  ) => {
    tabRuntimes.patch(ownerTabId, {
      status: 'error',
      error: { code, message, requestId: generateId() },
      groundedLoadingStatus: null,
      streamingStatus: null,
    });
    setTurnRevision((prev) => prev + 1);
  };

  /**
   * One Drawer turn. Prompt composition, grounding, clarify routing and host
   * callbacks stay here; the turn state machine itself lives in the shared runtime.
   */
  // D-19/SC5: the send prelude (config, key, compaction, grounding) runs before
  // `runtime.start()`, so the runtime is still 'idle' while it happens. Track that window
  // explicitly, keyed by tab, and surface it as a staged status the widget can paint.
  const [preludeTabs, setPreludeTabs] = useState<Record<string, boolean>>({});
  const markPrelude = useCallback((tabId: string, active: boolean) => {
    setPreludeTabs((prev) =>
      prev[tabId] === active ? prev : { ...prev, [tabId]: active }
    );
  }, []);
  // Stop is reachable during the prelude now that it paints as 'preparing', and the runtime is
  // still idle then. Each send takes a token; a prelude may only reach `runtime.start()` while it
  // still holds the tab's current token. Stop, or a newer send, drops the token and the stale
  // prelude bails instead of transmitting a cancelled prompt.
  const preludeTokenRef = useRef(new Map<string, number>());
  const preludeSeqRef = useRef(0);

  const handleSendTurn = async (
    text: string,
    overrideScope?: ActiveScope,
    options: { retryUserMessageId?: string | null } = {}
  ) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // A yes/no answer belongs to the tab that is waiting on a mutation, not the visible one.
    const approvalOwner = Object.entries(turnRegistryRef.current?.getSnapshot() ?? {}).find(
      ([, runtime]) => runtime.getStatus() === 'awaiting-approval'
    );
    if (approvalOwner) {
      const lower = trimmed.toLowerCase();
      const approve = /^(yes|y|có|co|ok|được|duoc|đồng ý|dong y|xác nhận|xac nhan)$/i.test(lower);
      const reject = /^(no|n|không|khong|cancel|hủy|huy|từ chối|tu choi)$/i.test(lower);
      if (approve || reject) {
        approvalOwner[1].resolveApproval(approve);
        turnRegistryRef.current?.peek(approvalOwner[0]);
        tabRuntimesRef.current.patch(approvalOwner[0], {
          pendingConfirmation: null,
          confirmationResolver: undefined,
        });
        setTurnRevision((prev) => prev + 1);
        return;
      }
    }

    if (trimmed === '/clear') {
      await handleClearContext();
      return;
    }

    const effectiveScope = overrideScope ?? currentScope;
    // The tab the user is looking at owns the turn. Reading the live ref avoids a send landing on
    // the previous tab while its durable active pointer is still being written.
    const visibleTab =
      durableTabs.find((tab) => tab.id === activeTabIdRef.current) ??
      durableTabs.find((tab) => tab.id === activeTabId);
    const turnTab = visibleTab ?? (await ensureTurnTab());
    const turnTabId = turnTab.id;
    turnTabIdRef.current = turnTabId;

    // Per-tab guard (D-06/D-10): one tab's in-flight turn never blocks or aborts another tab.
    // A prelude in flight counts as in-flight: the runtime is still idle, so without this a second
    // send would supersede a turn whose prompt was already assembled and about to start.
    if (
      turnRegistryRef.current?.peek(turnTabId)?.isRunning() ||
      preludeTabs[turnTabId]
    ) {
      return;
    }

    const runtime = turnRegistryRef.current!.get(turnTabId, turnTab.threadId ?? activeThreadId ?? '');
    tabRuntimes.initialize(turnTabId, turnTab.threadId ?? activeThreadId ?? '');
    tabRuntimes.patch(turnTabId, {
      error: null,
      pendingConfirmation: null,
      streamingText: '',
      toolEvents: [],
      lastSubmittedText: trimmed,
      retryUserMessageId: options.retryUserMessageId ?? null,
    });
    setScrollTrigger((prev) => prev + 1);

    // Clarification continuation (D-06): only the owning tab's pending clarify counts.
    const clarifyState = clarifyByTab[turnTabId];
    let effectiveQuery = trimmed;
    let nextClarifyTurnCount = 1;
    if (clarifyState) {
      nextClarifyTurnCount = clarifyState.turnCount + 1;
      if (nextClarifyTurnCount > 2) {
        setTransientClarifyMessage(turnTabId, null);
        patchTurnError(
          'request_failed',
          'Chưa thể xác định rõ ý định sau 2 lần hỏi. Vui lòng đặt câu hỏi cụ thể hơn hoặc chọn tác vụ cụ thể trong giao diện.',
          turnTabId
        );
        return;
      }
      effectiveQuery = `${clarifyState.originalQuery}\n[Thông tin bổ sung]: ${trimmed}`;
    }

    // Slash command aliases stay a Drawer affordance.
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

    if (restoredMissingSourcesRef.current.length > 0) {
      patchTurnError(
        'request_failed',
        `Thiếu tài liệu nguồn của workflow đã khôi phục: ${restoredMissingSourcesRef.current
          .map((source) => source.title)
          .join(', ')}.`,
        turnTabId
      );
      return;
    }

    // Each send gets its own prelude token; the stale one may not touch the tab afterwards.
    const preludeToken = (preludeSeqRef.current += 1);
    // Grounding awaits for a long time after the token gate; every write past this point must
    // ask whether the send still owns the tab before it commits or paints anything.
    const preludeIsStale = () => preludeTokenRef.current.get(turnTabId) !== preludeToken;
    try {
      // D-19/SC5: publish the staged label before any await. Config, key, compaction and
      // grounding can each take a visible moment; the composer must never look dead.
      // Set inside the try so every refusal path below still releases it in `finally`.
      preludeTokenRef.current.set(turnTabId, preludeToken);
      markPrelude(turnTabId, true);
      tabRuntimes.patch(turnTabId, {
        streamingStatus: 'preparing',
        groundedLoadingStatus: 'preparing',
      });
      const threadId = turnTab.threadId ?? activeThreadId;
      if (!threadId) return;

      // The user row is persisted before routing, so a clarify/refine answer still has its
      // question in the transcript. The runtime reuses this exact row (retry identity).
      const promptText = effectivePrompt === trimmed ? trimmed : effectivePrompt;
      let userMessageId = options.retryUserMessageId ?? null;
      const existingUserRow = userMessageId ? await db.chatMessages.get(userMessageId) : undefined;
      if (
        !existingUserRow ||
        existingUserRow.role !== 'user' ||
        existingUserRow.threadId !== threadId ||
        existingUserRow.content !== promptText
      ) {
        const saved = await saveMessage({ threadId, role: 'user', content: promptText }, db);
        userMessageId = saved.id;
      }
      tabRuntimes.patch(turnTabId, { retryUserMessageId: userMessageId });

      const apiKey = await getNineRouterApiKey(db);
      const config = await getNineRouterConfig(db);
      configRef.current = {
        endpoint: config.endpoint,
        ...(config.contextWindowTokens ? { contextWindowTokens: config.contextWindowTokens } : {}),
      };
      if (config.defaultModel) persistedDefaultModelRef.current = config.defaultModel;

      // Best-effort boundary compaction before the history read.
      if (apiKey && config.endpoint) {
        try {
          await compactThreadContext({
            threadId,
            db,
            endpoint: config.endpoint,
            apiKey,
            model: resolveActiveModel(),
            signal: hostSignal(turnTabId),
          });
        } catch (compErr) {
          logAiChatError('Auto context compaction check error', compErr);
        }
      }

      const allThreadMsgs = await getMessagesByThreadId(threadId, db);
      let boundaryIndex = -1;
      for (let i = allThreadMsgs.length - 1; i >= 0; i--) {
        if (allThreadMsgs[i]?.isContextBoundary) {
          boundaryIndex = i;
          break;
        }
      }
      const historyMsgs = boundaryIndex >= 0 ? allThreadMsgs.slice(boundaryIndex + 1) : allThreadMsgs;
      const historyTurns = sanitizeHistoryTurns(historyMsgs, userMessageId ?? undefined);

      let turnAnalysisMode = Boolean(turnTab.config?.analysisMode);
      if (!turnAnalysisMode) {
        try {
          turnAnalysisMode = localStorage.getItem(AI_ANALYSIS_MODE_KEY) === 'true';
        } catch {
          turnAnalysisMode = false;
        }
      }
      // Per-tab config is the only source. A global fallback would let a stale localStorage
      // key auto-approve CR mutations with no prompt.
      const turnAutoApprove = Boolean(turnTab.config?.autoApproveMutations);
      const turnMcpEnabled = turnTab.config?.mcpEnabled !== false;

      // Analysis Mode bypasses grounded routing and goes straight to the tool loop.
      if (!turnAnalysisMode) {
        try {
        const catalog = await fetchSetCatalog(db);
        const groundedDeps = createDefaultGroundedTurnDeps({
          knowledgeBaseUrl: knowledgeConfig.baseUrl,
          knowledgeToken: knowledgeConfig.token,
          db,
        });
        const baseRouteScope = groundedDeps.routeScope;
        groundedDeps.routeScope = (input, routeDeps) => {
          patchGroundedLoading('Đang xác định phạm vi tài liệu...', turnTabId);
          return baseRouteScope(input, routeDeps);
        };
        const baseRetrieve = groundedDeps.retrieveFederated;
        groundedDeps.retrieveFederated = (request, signal) => {
          patchGroundedLoading('Đang truy xuất tài liệu và đồ thị liên quan...', turnTabId);
          return baseRetrieve(request, signal);
        };
        const baseBm25 = groundedDeps.runLocalBm25;
        groundedDeps.runLocalBm25 = (input, localDeps) => {
          patchGroundedLoading('Đang tìm kiếm trong tài liệu cục bộ...', turnTabId);
          return baseBm25(input, localDeps);
        };
        const baseSynthesize = groundedDeps.synthesizeGroundedAnswer;
        groundedDeps.synthesizeGroundedAnswer = (input) => {
          patchGroundedLoading('Đang tổng hợp câu trả lời từ bằng chứng...', turnTabId);
          return baseSynthesize(input);
        };

        patchGroundedLoading('Đang phân tích ý định câu hỏi...', turnTabId);
        const groundedResult = await runGroundedTurn(
          {
            query: effectiveQuery,
            recentTurns: historyTurns,
            signal: hostSignal(turnTabId),
            capabilities: {
              serverEnabled: Boolean(knowledgeConfig.enabled && knowledgeConfig.baseUrl),
              modelConfigured: Boolean(apiKey && config.endpoint && resolveActiveModel()),
            },
            config: {
              endpoint: config.endpoint,
              apiKey: apiKey ?? '',
              model: resolveActiveModel(),
              promptVersion: 'grounded-v1',
              routerVersion: 'router-v1',
            },
            catalog,
            recentSessionId: threadId,
          },
          groundedDeps
        );

        // A cancelled prompt must not persist clarify state, evidence rows or routed scope.
        if (preludeIsStale()) {
          patchGroundedLoading(null, turnTabId);
          return;
        }

        if (groundedResult.kind === 'clarify_intent') {
          setTransientClarifyMessage(turnTabId, {
            id: `transient-${Date.now()}`,
            originalQuery: clarifyState ? clarifyState.originalQuery : trimmed,
            clarifyQuestion:
              groundedResult.clarifyQuestion ||
              'Bạn có thể cung cấp thêm chi tiết để tôi hỗ trợ chính xác hơn không?',
            turnCount: nextClarifyTurnCount,
          });
          patchGroundedLoading(null, turnTabId);
          return;
        }
        setTransientClarifyMessage(turnTabId, null);
        patchGroundedLoading(null, turnTabId);

        if (groundedResult.kind === 'clarify_entity') {
          const entityCitations: PersistedCitation[] = groundedResult.candidates.map((candidate, index) => {
            const rawId = candidate.urn.split(':').pop() || '';
            return {
              citationId: `S${index + 1}`,
              documentId: isValidUuid(rawId) ? rawId : generateId(),
              documentTitle: candidate.canonicalName,
              sectionAnchor: candidate.urn,
              lineStart: 1,
              lineEnd: 1,
              authority: 'server' as const,
              evidenceClass: 'OBSERVED' as const,
              snapshotId: 'gsnap_00000000',
              publishedContentHash: '0'.repeat(64),
              citedExcerpt: candidate.urn,
            };
          });
          await saveMessage(
            {
              threadId,
              role: 'assistant',
              content: '',
              grounding: {
                schemaVersion: 1,
                authority: 'server',
                outcome: 'NEEDS_CLARIFICATION',
                answer: null,
                citations: entityCitations,
                paths: [],
                conflicts: [],
                scope: {
                  setIds: catalog.map((entry) => entry.setId).filter(isValidUuid),
                  routedScope: { domain: null, environment: null, version: null, comparisonMode: null },
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
                modelId: resolveActiveModel(),
                createdAt: new Date().toISOString(),
              },
            },
            db
          );
          return;
        }

        if (groundedResult.kind === 'refine') {
          await saveMessage(
            {
              threadId,
              role: 'assistant',
              content: '',
              grounding: {
                schemaVersion: 1,
                authority: 'server',
                outcome: groundedResult.outcome,
                answer: null,
                citations: [],
                paths: [],
                conflicts: [],
                scope: {
                  setIds: catalog.map((entry) => entry.setId).filter(isValidUuid),
                  routedScope: { domain: null, environment: null, version: null, comparisonMode: null },
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
                modelId: resolveActiveModel(),
                createdAt: new Date().toISOString(),
              },
            },
            db
          );
          return;
        }

        if (
          groundedResult.kind === 'grounded_answer' ||
          groundedResult.kind === 'local_fallback_results' ||
          groundedResult.kind === 'evidence_only'
        ) {
          if (groundedResult.grounding.scope) {
            setRoutedScopeByTab((prev) => ({ ...prev, [turnTabId]: groundedResult.grounding.scope }));
          }
          await saveMessage(
            {
              threadId,
              role: 'assistant',
              content: '',
              tokenUsage: (groundedResult as { tokenUsage?: ChatTokenUsage }).tokenUsage,
              grounding: groundedResult.grounding,
            },
            db
          );
          if (
            groundedResult.kind !== 'grounded_answer' ||
            !groundedResult.requiresOperationalContinuation
          ) {
            return;
          }
        }

        if (groundedResult.kind === 'error') {
          await saveMessage(
            { threadId, role: 'assistant', content: '', grounding: groundedResult.grounding },
            db
          );
          return;
        }

        if (groundedResult.kind !== 'operational') {
          return;
        }
        } catch (groundedErr) {
          // `hostSignal` mints a fresh controller after Stop deletes the old one, so its abort
          // flag is useless here — the token is the only reliable cancel record.
          if (preludeIsStale()) {
            patchGroundedLoading(null, turnTabId);
            return;
          }
          if (hostSignal(turnTabId).aborted) {
            patchGroundedLoading(null, turnTabId);
            return;
          }
          logAiChatError('Grounded pipeline or persistence error', groundedErr);
          patchGroundedLoading(null, turnTabId);

          const isRouterUnavailable =
            groundedErr instanceof IntentRouterUnavailableError ||
            (groundedErr as { name?: string })?.name === 'IntentRouterUnavailableError' ||
            (groundedErr as { message?: string })?.message?.includes('intent routing is unavailable');

          const errorContent = isRouterUnavailable
            ? 'Trợ lý AI tạm thời không khả dụng. Vui lòng kiểm tra lại cấu hình kết nối AI.'
            : 'Đã xảy ra lỗi khi truy xuất hoặc kết nối 9router. Vui lòng thử lại.';

          if (userMessageId) {
            try {
              await saveMessage({ threadId, role: 'assistant', content: errorContent }, db);
            } catch {
              // Best effort error recording to prevent orphan user turns
            }
          }

          // Fail-closed gate per D-04: an unavailable intent router stops the turn immediately.
          if (isRouterUnavailable) {
            patchTurnError('request_failed', errorContent, turnTabId);
            return;
          }
          patchTurnError('invalid_response', errorContent, turnTabId);
          return;
        }
      }

      if (!apiKey) {
        patchTurnError(
          'request_failed',
          'Chưa cấu hình API Key 9router. Vui lòng mở Cài đặt AI để thiết lập.',
          turnTabId
        );
        return;
      }

      // Scoped / global grounding context.
      let systemInstruction = '';
      // Target subsystem ids of the CR in scope, used to load repository conventions.
      let activeTargetSystemIds: string[] = [];
      if (effectiveScope.type !== 'global' && effectiveScope.id) {
        try {
          if (effectiveScope.type === 'task') {
            const task = await getTask(effectiveScope.id, db);
            if (task) {
              const taskCr = task.crId ? await getChangeRequest(task.crId, db) : undefined;
              if (taskCr) activeTargetSystemIds = taskCr.targets.map((t) => t.systemId);
              systemInstruction = await buildItemContextPrompt({
                entityType: 'task',
                item: task,
                db,
                charLimit: config.charLimit,
              });
            }
          } else if (effectiveScope.type === 'cr') {
            const cr = await getChangeRequest(effectiveScope.id, db);
            if (cr) {
              activeTargetSystemIds = cr.targets.map((t) => t.systemId);
              systemInstruction = await buildItemContextPrompt({
                entityType: 'cr',
                item: cr,
                db,
                charLimit: config.charLimit,
              });
            }
          } else if (effectiveScope.type === 'system') {
            const system = await getSystem(effectiveScope.id, db);
            if (system) {
              systemInstruction = await buildItemContextPrompt({
                entityType: 'system',
                item: system,
                db,
                charLimit: config.charLimit,
              });
            }
          } else if (effectiveScope.type === 'document') {
            const note = db.notes ? await db.notes.get(effectiveScope.id) : null;
            if (note) systemInstruction = serializeDocumentContext(note);
          }
        } catch (err) {
          logAiChatError('Context grounding resolution error', err);
        }
      } else {
        try {
          systemInstruction = await buildGlobalContextPrompt(db);
        } catch (err) {
          logAiChatError('Global context prompt resolution error', err);
        }
      }

      const { taskIds, crIds, systemIds, filePaths } = extractMentionedEntityIds(trimmed);
      const mentionedContexts: string[] = [];
      const turnReferences = tabRuntimes.get(turnTabId)?.references ?? [];
      const allFiles = Array.from(new Set([...turnReferences, ...(filePaths || [])]));
      if (allFiles.length !== turnReferences.length) {
        tabRuntimes.patch(turnTabId, { references: allFiles });
      }
      for (const taskId of taskIds) {
        if (effectiveScope.type === 'task' && effectiveScope.id === taskId) continue;
        try {
          const task = await getTask(taskId, db);
          if (task) {
            mentionedContexts.push(
              await buildItemContextPrompt({ entityType: 'task', item: task, db, charLimit: config.charLimit })
            );
          }
        } catch (err) {
          logAiChatError(`Grounding error for task ${taskId}`, err);
        }
      }
      for (const crId of crIds) {
        if (effectiveScope.type === 'cr' && effectiveScope.id === crId) continue;
        try {
          const cr = await getChangeRequest(crId, db);
          if (cr) {
            mentionedContexts.push(
              await buildItemContextPrompt({
                entityType: 'cr',
                item: cr,
                db,
                charLimit: config.charLimit,
              })
            );
          }
        } catch (err) {
          logAiChatError(`Grounding error for CR ${crId}`, err);
        }
      }
      for (const systemId of systemIds) {
        if (effectiveScope.type === 'system' && effectiveScope.id === systemId) continue;
        try {
          const system = await getSystem(systemId, db);
          if (system) {
            mentionedContexts.push(
              await buildItemContextPrompt({
                entityType: 'system',
                item: system,
                db,
                charLimit: config.charLimit,
              })
            );
          }
        } catch (err) {
          logAiChatError(`Grounding error for system ${systemId}`, err);
        }
      }
      if (mentionedContexts.length > 0) {
        const mentionsBlock = `<mentioned_entities>\n[User Referenced Items Grounding]:\nThe user explicitly referenced the following items using mentions in their request. Their detailed database state is provided below for exact grounding:\n${mentionedContexts.join('\n\n')}\n</mentioned_entities>`;
        systemInstruction = systemInstruction ? `${systemInstruction}\n\n${mentionsBlock}` : mentionsBlock;
      }
      if (allFiles.length > 0) {
        const filesList = allFiles.map((filePath) => `- \`${filePath}\``).join('\n');
        const filesPrompt = `<referenced_files>\n[User Attached & Referenced Local Files]:\nThe following local files are attached to this chat session:\n${filesList}\nTo inspect their contents or specific lines, you have access to the \`read_file\` tool. Call \`read_file(filePath: "...", offset: 1, limit: 500)\` as needed to fulfill the request.\n</referenced_files>`;
        systemInstruction = systemInstruction ? `${systemInstruction}\n\n${filesPrompt}` : filesPrompt;
      }

      let dynamicMcpTools: AiToolDefinition[] = [];
      let dynamicMcpInstructions = '';
      if (turnMcpEnabled) {
        try {
          dynamicMcpTools = await discoverAllMcpTools(db);
        } catch (err) {
          logAiChatError('MCP discovery unavailable', err);
        }
        try {
          dynamicMcpInstructions = await getEnabledMcpInstructions(db);
        } catch (err) {
          logAiChatError('MCP instruction resolution error', err);
        }
      }
      const toolsForTurn = getToolsForTurn(turnAnalysisMode, dynamicMcpTools);

      let conventionsSegment = '';
      try {
        const [globalConv, repoConvs] = await Promise.all([
          getGlobalConventions(db),
          activeTargetSystemIds.length > 0
            ? loadMultiRepoConventions(activeTargetSystemIds, db)
            : Promise.resolve([]),
        ]);
        conventionsSegment = buildConventionsSegment({
          global: globalConv,
          repos: repoConvs.map((r) => ({
            systemCode: r.systemCode,
            systemName: r.systemName,
            ...(r.repoPath ? { repoPath: r.repoPath } : {}),
            content: r.content,
          })),
        });
      } catch (err) {
        logAiChatError('Conventions resolution error', err);
      }

      const todayStr = getTodayDateString();
      const now = dayjs();
      const systemPromptContent = `You are an expert AI assistant embedded inside ${APP_NAME}.
Current Date: ${todayStr} (${now.format('dddd')}). Time: ${now.format('HH:mm')}.

CRITICAL ANTI-HALLUCINATION RULES:
1. NEVER GUESS, ASSUME, OR INVENT DATA.
2. Every statement regarding tasks, change requests, subsystems, statuses, deadlines, logged work sessions, actual hours, planned allocations, capacity limits, notes, reminders, recurring schedules, or system sync state MUST be strictly grounded in concrete evidence returned by your tools or provided in context.
3. If the user asks about anything not present in the initial context (such as time spent, worklog history, daily schedule, running timer, notes, capacity, overdue items), YOU MUST CALL THE RELEVANT DATABASE TOOLS before answering.
4. If a requested item or detail is missing, null, empty, or not recorded in the database, EXPLICITLY STATE THAT IT IS NOT RECORDED. Never extrapolate, approximate, or pretend data exists.
5. When breaking down goals or proposing steps, output clear actionable bullet points that can be converted into checklist items.
6. DIAGRAMS & FLOWCHARTS: When the user asks for a flowchart, workflow diagram, sequence diagram, architecture chart, or visual representation, or when visualizing processes/hierarchies, you CAN and SHOULD generate Mermaid.js code blocks using \`\`\`mermaid syntax (e.g. flowchart TD, sequenceDiagram, classDiagram, graph LR, etc.). TaskMate will automatically render interactive diagrams from these blocks.
7. YOU HAVE FULL DATABASE MUTATION CAPABILITIES: You can create, update, reparent, or delete tasks, change requests, planned allocations, work sessions, active timers, capacity rules/overrides, and notes using mutation tools. When the user asks you to perform an action or change anything in the app, call the appropriate action tool.${
        turnAutoApprove
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
        turnAnalysisMode
          ? `\n\n[ANALYSIS MODE ACTIVE]:
READ ONLY:
This turn is read-only. You may retrieve knowledge, read local files, reason, compare, propose, and generate artifacts with \`generate_file\`, \`generate_pptx\`, or \`generate_image\`.
Rules:
1. NEVER mutate tasks, change requests, timers, notes, capacity, document links, or any MCP-backed data. For change requests, propose a plan instead of executing it.
2. Use the \`retrieve_knowledge\` tool repeatedly to gather evidence. Keep each query short and focused (<= 200 characters): an entity name, an identifier, or a narrow topic phrase. Split broad questions into multiple focused queries instead of one long query.
3. If a retrieval returns only entity names with no excerpts, retry using the entity name itself as the query.
4. Read attached local files with \`read_file\` FIRST (offset/limit pagination) before answering about them.
5. Ground every factual claim in retrieved excerpts or file content. Clearly mark your own reasoning, assumptions, and proposals as such.
6. End the answer with a short "Nguồn" (Sources) list naming the documents/files you used.`
          : ''
      }${conventionsSegment ? `\n\n${conventionsSegment}` : ''}`;

      // Cancelled (Stop) or superseded (a newer send) while staging: nothing may be committed,
      // and nothing may be patched either. Stop already released the staged UI; a newer send
      // owns the tab's status now, so writing it here would clear that turn's live indicators.
      if (preludeIsStale()) return;

      debugTurnRef.current.set(
        turnTabId,
        aiDebugService.startTurn({
          scope:
            effectiveScope.title ||
            `${effectiveScope.type}${effectiveScope.id ? `:${effectiveScope.id}` : ''}`,
          model: resolveActiveModel(),
          systemPrompt: systemPromptContent,
          messagesSent: [
            { role: 'system', content: systemPromptContent },
            ...historyTurns,
            { role: 'user', content: promptText },
          ],
          toolsSent: toolsForTurn,
        })
      );

      markPrelude(turnTabId, false);
      const outcome = await runtime.start({
        threadId,
        scopeKey,
        text: promptText,
        ...(userMessageId ? { retryUserMessageId: userMessageId } : {}),
        analysisMode: turnAnalysisMode,
        autoApprove: turnAutoApprove,
        model: resolveActiveModel(),
        endpoint: config.endpoint,
        apiKey,
        systemMessages: [{ role: 'system', content: systemPromptContent }],
        history: historyTurns,
        tools: toolsForTurn,
        ...(config.contextWindowTokens ? { contextWindowTokens: config.contextWindowTokens } : {}),
        // WR-19: a CR-scoped turn may only touch that CR's entities.
        ...(isCrScope && currentScope.id ? { crScopeId: currentScope.id } : {}),
      });

      const debugTurnId = debugTurnRef.current.get(turnTabId);
      debugTurnRef.current.delete(turnTabId);
      if (debugTurnId) {
        if (outcome.phase === 'aborted') aiDebugService.finishTurn(debugTurnId, { aborted: true });
        else if (outcome.phase === 'error') aiDebugService.finishTurn(debugTurnId, { error: 'request_failed' });
        else if (outcome.phase === 'tool-limit') aiDebugService.finishTurn(debugTurnId, { error: 'tool_limit' });
        else aiDebugService.finishTurn(debugTurnId, { finalResponse: outcome.content ?? '' });
      }

      if (outcome.phase === 'complete' && outcome.content) {
        notifyIfBlurred(outcome.content);
        tabRuntimes.patch(turnTabId, { retryUserMessageId: null, status: 'idle' });
      } else if (outcome.phase === 'error') {
        tabRuntimes.patch(turnTabId, { status: 'error' });
      } else if (outcome.phase === 'aborted' || outcome.phase === 'cancelled' || outcome.phase === 'tool-limit') {
        tabRuntimes.patch(turnTabId, { status: 'idle' });
      }
      setTurnRevision((prev) => prev + 1);
    } catch (err) {
      // A superseded prelude must not paint its failure over the turn that replaced it.
      if (preludeTokenRef.current.get(turnTabId) === preludeToken) {
        logAiChatError('Send message error', err);
        patchTurnError('request_failed', 'Không thể hoàn tất phản hồi AI. Vui lòng thử lại.', turnTabId);
      }
    } finally {
      // The prelude window must never outlive the send, on any exit path (D-19). Only the send
      // that still owns the tab's token may clear it; a stale one must not touch the newer turn.
      if (preludeTokenRef.current.get(turnTabId) === preludeToken) {
        preludeTokenRef.current.delete(turnTabId);
        markPrelude(turnTabId, false);
      }
    }
  };

  // Async host callbacks compare against the live handler, not the one closed over at render time.
  const handleSendTurnRef = useRef(handleSendTurn);
  handleSendTurnRef.current = handleSendTurn;

  const handleEvidenceOnlySynthesize = async (prevGrounding: ChatMessageGrounding) => {
    const activeThread = thread;
    if (!activeThread || synthesizingEvidenceId) return;

    const evidenceId = prevGrounding.createdAt;
    setEvidenceSynthesisError(null);

    const apiKey = await getNineRouterApiKey(db);
    const config = await getNineRouterConfig(db);
    const model = resolveActiveModel();
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
      await handleSendTurn(`Tìm mọi quan hệ liên quan đến ${entity.canonicalName}`);
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
      void handleSendTurn(urn, undefined, {
        retryUserMessageId: tabRuntimesRef.current.get(runtimeTabId)?.retryUserMessageId ?? null,
      });
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
      const runtime = tabRuntimesRef.current.get(runtimeTabId);
      const lastSubmittedText = runtime?.lastSubmittedText;
      if (lastSubmittedText) {
        void handleSendTurn(lastSubmittedText, undefined, {
          retryUserMessageId: runtime?.retryUserMessageId ?? null,
        });
      }
    },
    onAuthRepair: () => {
      onOpenSettings?.();
    },
    onConfigRepair: () => {
      onOpenSettings?.();
    },
    onFreshLookup: () => {
      const runtime = tabRuntimesRef.current.get(runtimeTabId);
      const lastSubmittedText = runtime?.lastSubmittedText;
      if (lastSubmittedText) {
        void handleSendTurn(lastSubmittedText, undefined, {
          retryUserMessageId: runtime?.retryUserMessageId ?? null,
        });
      }
    },
    synthesizingEvidenceId,
    evidenceSynthesisError,
  };

  /**
   * D-05: clear removes only the active thread's messages. It must not append a context
   * boundary row instead — that would leave the transcript (and other threads) untouched.
   */
  const handleClearContext = async () => {
    const runtime = tabRuntimesRef.current.get(runtimeTabId);
    runtime?.confirmationResolver?.(false);
    tabRuntimesRef.current.patch(runtimeTabId, {
      pendingConfirmation: null,
      confirmationResolver: undefined,
    });

    let targetThreadId = activeTab?.threadId || activeTabThreadId || thread?.id;
    if (!targetThreadId) {
      try {
        const tab = await ensureTurnTab();
        targetThreadId = tab.threadId;
      } catch {
        const activeThread = await createOrGetThread(
          {
            scopeType: currentScope.type,
            entityId: currentScope.id,
            title: currentScope.title,
          },
          db
        );
        targetThreadId = activeThread.id;
      }
    }

    if (targetThreadId) {
      await clearThreadMessages(targetThreadId, db);
    }
    tabRuntimes.patch(activeTabId, { references: [] });
    message.success('Đã xóa hội thoại của tab này');
  };

  /** D-05 single clear path: the composer and the toolbox delegate here (thread-scoped only). */
  const handleDeleteCurrentThread = () => {
    Modal.confirm({
      title: 'Xóa tin nhắn cuộc trò chuyện này?',
      content: 'Toàn bộ nội dung trao đổi trong tab đang mở sẽ bị xóa khỏi lịch sử.',
      okText: 'Xóa tin nhắn',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: async () => {
        await handleClearContext();
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
        for (const runtime of Object.values(tabRuntimesRef.current.getSnapshot())) {
          tabRuntimesRef.current.discard(runtime.tabId);
        }
        setClarifyByTab({});
        setRoutedScopeByTab({});
        try {
          await ensureTurnTab();
        } catch (err) {
          logAiChatError('Failed to rebuild chat tabs after history reset', err);
        }
        message.success('Đã xóa sạch toàn bộ lịch sử trò chuyện AI');
      },
    });
  };

  const handleRetry = () => {
    const tabRuntime = tabRuntimesRef.current.get(runtimeTabId);
    const turnRuntime = turnRegistryRef.current?.peek(runtimeTabId);
    const text = tabRuntime?.lastSubmittedText ?? '';
    if (!text || !turnRuntime) return;
    tabRuntimesRef.current.patch(runtimeTabId, { status: 'processing', error: null });
    // The runtime re-sends its last request anchored on the persisted user row, so a retry
    // never inserts a second user message (D-14, T-25.3-36).
    void turnRuntime.retry().then((outcome) => {
      if (outcome.phase === 'complete') {
        tabRuntimesRef.current.patch(runtimeTabId, { status: 'idle', retryUserMessageId: null });
      }
      setTurnRevision((prev) => prev + 1);
    });
  };

  // Auto-send prompt when opened from Command Palette with pendingPrompt
  useEffect(() => {
    if (open && pendingPrompt) {
      const promptToSend = pendingPrompt;
      clearPendingPrompt();
      setInternalScope({ type: 'global' });
      setCustomScope({ type: 'global' });
      setIsDetached(false);
      void handleSendTurn(promptToSend, { type: 'global' });
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
      const entityType = (scopeType === 'task' || scopeType === 'cr' || scopeType === 'system') ? scopeType : undefined;
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
        position: isDockedPanel || isPopoutWindow ? 'relative' : 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        left: isDockedPanel || isPopoutWindow ? 0 : undefined,
        width: isDockedPanel || isPopoutWindow ? '100%' : isMobile ? '100vw' : width,
        height: isDockedPanel || isPopoutWindow ? '100%' : undefined,
        zIndex: isDockedPanel || isPopoutWindow ? 1 : isPinned && !isMobile ? 100 : 1200,
        backgroundColor: token.colorBgContainer,
        borderLeft: isDockedPanel || isPopoutWindow ? 'none' : `1px solid ${token.colorBorderSecondary}`,
        boxShadow: isDockedPanel || isPopoutWindow || (isPinned && !isMobile) ? 'none' : '-2px 0 8px rgba(0,0,0,0.15)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Left border drag handle (desktop drawer only, not when docked in panel) */}
      {!isMobile && !isPopoutWindow && !isDockedPanel && (
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

      {/* Chat Header with Drawer-level Scope */}
      <ChatHeader
        currentScope={currentScope}
        onOpenScopePicker={() => setScopeModalOpen(true)}
        onDetachScope={() => {
          setIsDetached(true);
          setInternalScope({ type: 'global' });
          setCustomScope({ type: 'global' });
        }}
        isPinned={isPinned}
        onTogglePin={() => onTogglePin?.()}
        onClearAllHistory={handleClearAllHistory}
        onDeleteCurrentThread={handleDeleteCurrentThread}
        onOpenDebug={() => setIsDebugModalOpen(true)}
        onPopout={!isPopoutWindow ? handlePopoutAction : undefined}
        onOpenInstructions={() => setIsInstructionsOpen(true)}
        onClose={onClose}
      />

      {/* Chrome-like Multi-Tab Bar for All Scopes */}
      {displayTabs.length > 0 && (
        <ChatTabBar
          tabs={displayTabs}
          activeTabId={activeTabId}
          onSelectTab={handleSelectTab}
          onAddTab={handleAddTab}
          onCloseTab={handleCloseTab}
          onRenameTab={handleRenameTab}
          onReorderTabs={handleReorderTabs}
          tabAnalysisModes={tabAnalysisModes}
          tabStatuses={tabStatuses}
        />
      )}

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

      <OracleSqlclSettingsModal
        open={isOracleModalOpen}
        onClose={() => setIsOracleModalOpen(false)}
        db={db}
        onConfigChange={reloadOracleConfig}
      />

      <SshFsSettingsModal
        open={isSshFsModalOpen}
        onClose={() => setIsSshFsModalOpen(false)}
        db={db}
        onConfigChange={reloadSshFsConfig}
      />

      <RestoredSourceNotice missingSources={restoredMissingSources} />

      {activeRoutedScope && hasMeaningfulRoutedScope(activeRoutedScope.routedScope) && (
        <div style={{ padding: '0 14px' }}>
          <ScopeChipsBar
            routedScope={activeRoutedScope.routedScope!}
            onEditScope={() => setScopeModalOpen(true)}
          />
        </div>
      )}

      {/* One shared renderer (D-01/D-02). Only scope, prompts and host callbacks differ. */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <AiChatWidget
          scope={{
            kind: 'chat',
            threadId: activeThreadId ?? '',
            scopeKey: activeTabId,
            label: `${currentScope.type} · ${currentScope.title ?? activeTab?.title ?? ''}`,
          }}
          messages={messages}
          turn={{
            status:
              preludeTabs[activeTabId] && (activeTurnRuntime?.getStatus() ?? 'idle') === 'idle'
                ? 'preparing'
                : activeTurnRuntime?.getStatus() ?? 'idle',
            streamingText: activeRuntime?.streamingText ?? '',
            streamingStatusLabel: activeRuntime?.streamingStatus ?? null,
            toolLimitRounds: activeTurnRuntime?.getToolLimitRounds() ?? null,
            pendingApproval: activeRuntime?.pendingConfirmation
              ? {
                  toolName: activeRuntime.pendingConfirmation.toolName,
                  summary: activeRuntime.pendingConfirmation.summary,
                }
              : null,
          }}
          onSubmit={(text) => {
            void handleSendTurn(text);
          }}
          onStop={handleStopGeneration}
          onResolveApproval={handleConfirmAction}
          onRetry={handleRetry}
          error={activeRuntime?.error ? { code: activeRuntime.error.code, message: activeRuntime.error.message } : null}
          toolbox={{
            selectedModel: resolveActiveModel(),
            availableModels,
            onModelChange: handleModelChange,
            onRefreshModels: handleRefreshModels,
            isRefreshingModels,
            analysisMode: currentTabAnalysisMode,
            onToggleAnalysisMode: (tabId) => { void handleToggleAnalysisMode(tabId); },
            autoApproveMutations,
            onToggleAutoApproveMutations: (tabId) => { void handleToggleAutoApproveMutations(tabId); },
            mcpEnabled: currentTabMcpEnabled,
            onToggleMcpEnabled: (tabId) => { void handleToggleMcpEnabled(tabId); },
            mcpServers,
            onToggleMcpServer: (id, enabled) => {
              void handleToggleMcpServer(id, enabled);
            },
            onOpenMcpSettings: () => setIsMcpModalOpen(true),
            onOpenOracleSettings: () => setIsOracleModalOpen(true),
            oracleToolEnabled,
            onOpenSshFsSettings: () => setIsSshFsModalOpen(true),
            sshFsToolEnabled,
          }}
          quickPrompts={DRAWER_QUICK_PROMPTS}
          onClearThread={handleDeleteCurrentThread}
          onClearAllHistory={handleClearAllHistory}
          emptyState={{
            heading: `Trợ lý AI ${APP_NAME}`,
            body: 'Đặt câu hỏi về tác vụ hiện tại, phân tích tiến độ, gợi ý checklist hoặc tra cứu tài liệu đính kèm. Nhập câu hỏi bên dưới để bắt đầu.',
          }}
          toolEvents={activeToolEvents}
          placeholder={
            activeRuntime?.pendingConfirmation
              ? 'Gõ "yes" để xác nhận hoặc "no" để từ chối...'
              : 'Nhập câu hỏi cho trợ lý AI...'
          }
          {...(onOpenSettings ? { onOpenSettings } : {})}
          {...(activeRuntime?.references ? { attachedFiles: activeRuntime.references } : {})}
          onAttachFile={handleAttachFile}
          onRemoveFile={handleRemoveFile}
          autoFocus={open}
          externalValue={externalInputValue ?? undefined}
          onExternalValueConsumed={() => setExternalInputValue(null)}
          draft={activeRuntime ? activeRuntime.draft : unseededDraft}
          onDraftChange={(next) => {
            draftCarryRef.current = { tabId: activeTabId, text: next };
            if (tabRuntimesRef.current.get(activeTabId)) {
              tabRuntimesRef.current.patch(activeTabId, { draft: next });
            } else {
              setUnseededDraft(next);
            }
          }}
          // Drawer business, rendered by the shared surface but owned here.
          messageListExtensions={{
            scrollTrigger,
            ...(groundedCallbacks ? { groundedCallbacks } : {}),
            transientClarifyMessage: clarifyByTab[activeTabId] ?? null,
            onCancelClarify: () => setTransientClarifyMessage(activeTabId, null),
            canAddToChecklist: currentScope.type === 'task',
            canSaveStickyNote: true,
            canRunClaudeCode: currentScope.type === 'task',
            onAddToChecklist: handleAddToChecklist,
            onSaveStickyNote: handleSaveStickyNote,
            onRunClaudeCode: handleRunClaudeCode,
          }}
          statusExtensions={
            <>
              {activeCheckpoint && (
                <div style={{ width: '100%', padding: '0 12px 6px', boxSizing: 'border-box' }}>
                  <InterruptedBanner
                    {...(activeCheckpoint.step ? { checkpoint: { step: activeCheckpoint.step } } : {})}
                    message={
                      activeCheckpoint.step
                        ? `Công việc SDLC bị gián đoạn tại ${activeCheckpoint.step}.`
                        : 'Yêu cầu trước bị gián đoạn khi ứng dụng đóng.'
                    }
                    onContinue={() => {
                      void resolveCheckpoint('continue');
                    }}
                    onDiscard={() => {
                      void resolveCheckpoint('discard');
                    }}
                  />
                </div>
              )}
              {activeRuntime?.status === 'interrupted' && (
                <div style={{ width: '100%', padding: '0 12px 6px', boxSizing: 'border-box' }}>
                  <InterruptedBanner
                    message="Yêu cầu trước bị gián đoạn khi ứng dụng đóng."
                    onContinue={() => {
                      tabRuntimes.patch(activeTabId, { status: 'idle' });
                      if (activeRuntime.draft) void handleSendTurn(activeRuntime.draft);
                    }}
                    onDiscard={() => tabRuntimes.patch(activeTabId, { status: 'idle', draft: '' })}
                  />
                </div>
              )}
            </>
          }
        />
      </div>

      {/* Citation preview stays Drawer-owned (ANSWER-07, D-10). */}
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
    </div>
  );
};
