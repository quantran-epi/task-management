import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { theme, Button, message, Modal, Tag, Tooltip } from 'antd';
import { DisconnectOutlined, ExperimentFilled } from '@ant-design/icons';
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
import { logAiChatError } from './aiChatDiagnostics';
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
import { ChatTabBar, type ChatTabItem } from './ChatTabBar';
import { createRequestRegistry } from './runtime/requestRegistry';
import { useTabRuntimes } from './runtime/useTabRuntimes';
import { WizardMetadataModal, type WizardStartMetadata } from './wizard/WizardMetadataModal';
import { WizardSkillBar } from './wizard/WizardSkillBar';
import { WizardLifecycleBar } from './wizard/WizardLifecycleBar';
import { InterruptedBanner } from './InterruptedBanner';
import { InlineApiErrorCard } from './InlineApiErrorCard';
import { RestoredSourceNotice } from './RestoredSourceNotice';
import { WizardProgressStrip } from './wizard/WizardProgressStrip';
import { ChangePackDropzone } from './wizard/ChangePackDropzone';
import { ChangePackConfirmStrip, type ChangePackUiResult } from './wizard/ChangePackConfirmStrip';
import { DriftMatrixView } from './wizard/DriftMatrixView';
import { SdlcWorkflowHub } from './wizard/SdlcWorkflowHub';
import { StepInputDocsModal } from './wizard/StepInputDocsModal';
import { createSdlcWorkflowCoordinator, defaultSha256 } from '../../services/wizard/workflowCoordinator';
import { previousArtifactContent, stripStaleArtifacts, toRevisionModalPreview } from './wizard/revisionView';
import type { SdlcWorkflowState, SdlcWorkflowMetadata, SdlcStepId, RevisionPreview } from '../../services/wizard/workflowSchemas';
import type { SdlcSourceRef } from '../../services/wizard/sourceMerge';
import { createWizardCoordinator, deriveActiveWizard, type WizardCoordinatorDeps, type WizardExportResult } from '../../services/wizard/wizardCoordinator';
import type { ChangePackManifest } from '../../services/wizard/changePack';
import type { ReconciliationResult } from '../../services/wizard/reconciliation';
import type { ChangePackValidationCode } from '../../services/wizard/changePack';
import type { WizardSkill, WizardSnapshot } from '../../services/ai/wizardSchemas';
import { collectWizardEvidence, runWizardStage } from '../../services/ai/wizardService';
import { runLocalGroundedRetrieval } from '../../services/search/localGroundedRetrieval';
import { saveSolutionVersion } from '../../services/wizard/artifactRepo';
import { getMessagesByThreadId as loadChatMessages } from '../../db/repositories/chatRepo';
import {
  listTabsByScope,
  getOrCreateActiveChatTab,
  getOrCreateSdlcTab,
  createChatTab,
  setActiveTab,
  updateChatTab,
  deleteChatTab,
} from '../../db/repositories/chatTabRepo';
import type { ChatTab } from '../../types/models';
import type { TabRuntimeStatus } from './runtime/tabTypes';

export const AI_CHAT_WIDTH_KEY = 'planner:ai_chat_width';
export const AI_AUTO_APPROVE_MUTATIONS_KEY = 'planner:ai_auto_approve_mutations';
export const AI_ANALYSIS_MODE_KEY = 'planner:ai_analysis_mode';
export const AI_TAB_ANALYSIS_MODES_KEY = 'planner:ai_tab_analysis_modes';
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

export function getToolsForTurn(
  effectiveAnalysisMode: boolean,
  dynamicMcpTools: AiToolDefinition[] = []
): AiToolDefinition[] {
  if (effectiveAnalysisMode) {
    return [
      ...AI_DATABASE_TOOLS.filter((tool) => !isMutationTool(normalizeToolName(tool.function.name))),
      ...dynamicMcpTools.filter((tool) => isReadOnlyMcpTool(normalizeToolName(tool.function.name))),
    ];
  }
  return [...AI_DATABASE_TOOLS, ...dynamicMcpTools];
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
  createWizardCoordinatorFn?: typeof createWizardCoordinator;
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
  createWizardCoordinatorFn = createWizardCoordinator,
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
  const knowledgeConfig = useOptionalKnowledgeConfig();

  // Grounded turn state & abort controller per turn (AI-SPEC §4b)
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
      logAiChatError('Failed to load MCP servers', err);
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

  const isProjectScope = currentScope.type === 'project' && Boolean(currentScope.id);

  // Per-tab runtime/request ownership. Runtime state stays ephemeral; durable history stays in Dexie.
  const tabRuntimes = useTabRuntimes();
  // Cleanup paths (unmount, scope change) must not re-run when the registry identity changes on publish.
  const tabRuntimesRef = useRef(tabRuntimes);
  tabRuntimesRef.current = tabRuntimes;
  const requestRegistryRef = useRef(createRequestRegistry());
  // Tab that owns the in-flight turn; every transient write inside the send path targets it.
  const turnTabIdRef = useRef('');

  // SDLC Workflow state
  const [sdlcWorkflowState, setSdlcWorkflowState] = useState<SdlcWorkflowState | undefined>();
  const [sdlcInputModalOpen, setSdlcInputModalOpen] = useState(false);
  const [revisionDraft, setRevisionDraft] = useState('');
  const [revisionPreview, setRevisionPreview] = useState<RevisionPreview | null>(null);
  const [revisionLoading, setRevisionLoading] = useState(false);
  const sdlcCoordinatorRef = useRef<ReturnType<typeof createSdlcWorkflowCoordinator> | null>(null);

  // Durable multi-tab state for all scopes from Dexie chatTabs table
  const durableTabs = useLiveQuery<ChatTab[]>(async () => {
    return listTabsByScope(scopeKey, db);
  }, [db, scopeKey]) ?? [];

  const activeTab = durableTabs.find((t) => t.active) ?? durableTabs[0];
  const activeTabId = activeTab?.id ?? 'sdlc';
  const activeTabThreadId = activeTab?.threadId;
  const isSdlcActiveTab = isProjectScope && (activeTab?.type === 'sdlc' || activeTabId === 'sdlc' || activeTabId.startsWith('sdlc:'));

  // Use durable tab ownership when available, but preserve legacy thread reads while tabs initialize.
  const thread = useLiveQuery<ChatThread | undefined>(() => {
    if (activeTabThreadId) return db.chatThreads.get(activeTabThreadId);
    return db.chatThreads.where('scopeKey').equals(scopeKey).first();
  }, [db, activeTabThreadId, scopeKey]);

  const activeThreadId = activeTabThreadId ?? thread?.id;

  // Draft typed before the durable tab resolved must not be dropped by the per-tab remount.
  const draftCarryRef = useRef<{ tabId: string; text: string }>({ tabId: '', text: '' });

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
  }, [db, activeThreadId]) ?? [];

  const ensureTurnTabRef = useRef<() => Promise<ChatTab>>(() =>
    Promise.reject(new Error('tab bootstrap not ready'))
  );

  useEffect(() => {
    // Project scopes are bootstrapped by the initTabs effect below, which lets getOrCreateSdlcTab
    // adopt a legacy `project:<id>` thread. Non-project scopes adopt their legacy thread through
    // getOrCreateActiveChatTab, which is transactional and therefore safe against a concurrent
    // send creating the same first tab.
    if (isProjectScope || durableTabs.length > 0) return;
    void ensureTurnTabRef.current().catch((err) =>
      logAiChatError('Failed to bootstrap first chat tab', err)
    );
  }, [currentScope.id, currentScope.type, db, durableTabs.length, isProjectScope, scopeKey]);

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

        if (isProjectScope && currentScope.id) {
          const sdlcTab = existing.find((t) => t.type === 'sdlc') ?? await getOrCreateSdlcTab(currentScope.id, db);
          const ordinary = existing.filter((t) => t.type === 'chat');
          if (ordinary.length === 0) {
            await createChatTab(
              {
                scopeType: currentScope.type,
                scopeKey,
                entityId: currentScope.id,
                title: '💬 Tra cứu & Hỏi đáp',
              },
              db
            );
          }
          if (!existing.some((tab) => tab.active)) {
            await setActiveTab(scopeKey, sdlcTab.id, db);
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
  }, [currentScope.id, currentScope.type, db, isProjectScope, open, scopeKey]);

  const handleSelectTab = useCallback(
    async (tabId: string) => {
      try {
        await setActiveTab(scopeKey, tabId, db);
      } catch (err) {
        logAiChatError('Failed to set active tab', err);
      }
    },
    [db, scopeKey]
  );

  const handleAddTab = useCallback(async () => {
    try {
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
      if (!targetTab || targetTab.type === 'sdlc') return; // SDLC tab can NEVER be closed

      const isRunning =
        requestRegistryRef.current.hasActive(tabId) ||
        tabRuntimes.get(tabId)?.status === 'processing';

      const doDelete = async () => {
        requestRegistryRef.current.abortTab(tabId);
        tabRuntimes.discard(tabId);
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
    [db, durableTabs, tabRuntimes]
  );

  // Evidence synthesis state (not part of a chat turn)
  const [synthesizingEvidenceId, setSynthesizingEvidenceId] = useState<string | null>(null);
  const [evidenceSynthesisError, setEvidenceSynthesisError] = useState<{
    id: string;
    message: string;
    requiresConfig: boolean;
  } | null>(null);
  const [scrollTrigger, setScrollTrigger] = useState(0);

  const [externalInputValue, setExternalInputValue] = useState<string | null>(null);
  const [wizardSkill, setWizardSkill] = useState<Exclude<WizardSkill, 'SOLUTION'> | null>(null);
  const [wizardMetadataOpen, setWizardMetadataOpen] = useState(false);
  const [wizardSnapshot, setWizardSnapshot] = useState<WizardSnapshot | undefined>();
  const [wizardSkipNotice, setWizardSkipNotice] = useState<string | null>(null);
  const [packUi, setPackUi] = useState<ChangePackUiResult | null>(null);
  const [reconciliationResult, setReconciliationResult] = useState<ReconciliationResult | null>(null);
  const [technicalDocsReady, setTechnicalDocsReady] = useState(false);
  const [exportResults, setExportResults] = useState<Map<string, WizardExportResult>>(new Map());
  const [exportPending, setExportPending] = useState<Set<string>>(new Set());
  const [exportErrors, setExportErrors] = useState<Map<string, string>>(new Map());
  const wizardCoordinatorRef = useRef<ReturnType<typeof createWizardCoordinator> | null>(null);
  const packActionRef = useRef(false);
  const cabActionRef = useRef(false);

  useEffect(() => {
    if (!isProjectScope || !activeThreadId || !currentScope.id || !isSdlcActiveTab) {
      wizardCoordinatorRef.current?.dispose();
      wizardCoordinatorRef.current = null;
      setWizardSnapshot(undefined);
      return;
    }
    const controller = new AbortController();
    const loadWizard = async () => {
      const existing = await loadChatMessages(activeThreadId, db);
      if (controller.signal.aborted) return;
      const active = deriveActiveWizard(existing, currentScope.id!, activeThreadId);
      if (active) setWizardSnapshot(active);
    };
    void loadWizard();
    return () => {
      controller.abort();
      wizardCoordinatorRef.current?.dispose();
      wizardCoordinatorRef.current = null;
    };
  }, [activeThreadId, currentScope.id, db, isProjectScope]);

  const getWizardCoordinator = useCallback(() => {
    if (!isProjectScope || !currentScope.id || !activeThreadId) return null;
    if (!wizardCoordinatorRef.current) {
      const projectId = currentScope.id;
      const threadId = activeThreadId;
      const deps: WizardCoordinatorDeps = {
        projectId,
        threadId,
        db,
        expectedPackIdentity: () => ({
          cr: wizardCoordinatorRef.current?.getState()?.metadata.cr ?? 'UNKNOWN_CR',
          base: 'UNKNOWN_BASE',
          head: 'UNKNOWN_HEAD',
          branch: 'UNKNOWN_BRANCH',
        }),
        appendReviewSnapshot: async (docs) => {
          setReconciliationResult(docs.reconciliation);
          setTechnicalDocsReady(Boolean(docs.pl03 && docs.pl07));
        },
        runTechnicalStage: async (input) => runWizardStage({
          kind: input.kind === 'PL03' ? 'PL03' : 'PL07',
          projectId: input.projectId,
          threadId: input.threadId,
          sessionId: input.sessionId,
          inputRevision: input.inputRevision,
          payload: { evidence: { items: [], coverage: input.reconciliation.status === 'PARTIAL_COVERAGE' ? 'PARTIAL' : 'COMPLETE', degraded: [] }, pinnedSolution: { artifactId: input.solution.noteId, version: input.solution.version, hash: input.solution.hash, projectId: input.projectId, threadId: input.threadId } },
          signal: new AbortController().signal, isCurrent: () => true,
          model: { endpoint: '', model: '' },
        }),
        runCabStage: async () => {
          const docs = wizardCoordinatorRef.current?.getTechnicalDocs?.();
          return docs;
        },
        runStage: async (input) => {
          const [config, apiKey] = await Promise.all([getNineRouterConfig(db), getNineRouterApiKey(db)]);
          return runWizardStage({
            kind: input.kind,
            projectId: input.projectId,
            threadId: input.threadId,
            sessionId: input.sessionId,
            inputRevision: input.inputRevision,
            payload: { evidence: input.evidence, proposal: input.payload },
            signal: input.signal,
            isCurrent: input.isCurrent,
            model: { endpoint: config.endpoint, apiKey, model: resolveActiveModel() },
          });
        },
        collectEvidence: async (input) => collectWizardEvidence(input, {
          runLocalBm25: (localInput) => runLocalGroundedRetrieval(localInput, {
            loadSetMembers: async (setIds) => {
              const sets = await db.documentSets.where('id').anyOf(setIds).toArray();
              return sets.flatMap((set) => set.documentIds.map((documentId) => ({ setId: set.id, setName: set.name, documentId })));
            },
            loadNoteBody: async (documentId) => {
              const note = await db.notes.get(documentId);
              return note ? { title: note.title, body: note.body, updatedAt: note.updatedAt } : null;
            },
          }),
        }),
        resolveEvidenceInput: async ({ metadata, inputRevision, context }) => {
          const sets = await db.documentSets.filter((set) => set.sdlc?.projectId === projectId).toArray();
          return { projectId, threadId, sessionId: wizardCoordinatorRef.current?.getSnapshot()?.sessionId ?? generateId(), inputRevision, query: `${metadata.cr} ${metadata.featureName} ${context}`.trim(), resolvedSetIds: sets.map((set) => set.id) };
        },
        saveSnapshot: async (snapshot) => {
          setWizardSnapshot(snapshot);
        },
        appendMessage: async (message) => { await saveMessage({ threadId, role: message.role, content: message.content, wizard: message.wizard }, db); },
        loadMessages: () => loadChatMessages(threadId, db),
        saveSolution: (input) => saveSolutionVersion(input, db),
      };
      wizardCoordinatorRef.current = createWizardCoordinatorFn(deps);
    }
    return wizardCoordinatorRef.current;
  }, [activeThreadId, createWizardCoordinatorFn, currentScope.id, db, isProjectScope]);

  useEffect(() => {
    const coordinator = getWizardCoordinator();
    if (coordinator && !wizardSnapshot) {
      const restored = coordinator.restore();
      if (restored && typeof (restored as Promise<unknown>).then === 'function') {
        void (restored as Promise<WizardSnapshot | undefined>).then((snapshot) => snapshot && setWizardSnapshot(snapshot));
      }
    }
  }, [getWizardCoordinator, wizardSnapshot]);

  const handleWizardStart = useCallback(async (metadata: WizardStartMetadata) => {
    if (!wizardSkill || !isProjectScope || !currentScope.id) return;
    let coordinator = getWizardCoordinator();
    if (!coordinator) {
      const sdlcTab = durableTabs.find((tab) => tab.type === 'sdlc') ?? await getOrCreateSdlcTab(currentScope.id, db);
      const deps: WizardCoordinatorDeps = {
        projectId: currentScope.id,
        threadId: sdlcTab.threadId,
        db,
        saveSnapshot: async (snapshot) => setWizardSnapshot(snapshot),
        appendMessage: async (entry) => { await saveMessage({ threadId: sdlcTab.threadId, role: entry.role, content: entry.content, wizard: entry.wizard }, db); },
        loadMessages: () => loadChatMessages(sdlcTab.threadId, db),
      };
      coordinator = createWizardCoordinatorFn(deps);
      wizardCoordinatorRef.current = coordinator;
    }
    setWizardMetadataOpen(false);
    const snapshot = await coordinator.start(wizardSkill, metadata);
    setWizardSnapshot(snapshot);
    setWizardSkill(null);
  }, [currentScope.id, db, durableTabs, getWizardCoordinator, isProjectScope, scopeKey, wizardSkill]);

  const handleWizardMessage = useCallback(async (text: string) => {
    const coordinator = getWizardCoordinator();
    const snapshot = coordinator?.getSnapshot() ?? wizardSnapshot;
    if (!coordinator || !snapshot) return false;
    if (snapshot.status === 'gap_fill' || snapshot.status === 'collecting') {
      await coordinator.addContext(text);
      setWizardSnapshot(coordinator.getSnapshot());
      return true;
    }
    return false;
  }, [getWizardCoordinator, wizardSnapshot]);

  const handleWizardCancel = useCallback(async () => {
    const coordinator = getWizardCoordinator();
    await coordinator?.cancel();
    setWizardSnapshot(undefined);
  }, [getWizardCoordinator]);

  const handlePackSelect = useCallback(async (file: File) => {
    const coordinator = getWizardCoordinator();
    if (!coordinator) return;
    const result = await coordinator.selectChangePack(file);
    if (result.status === 'pending') setPackUi({ status: 'valid', manifest: result.manifest });
    else if (result.status === 'invalid') setPackUi({ status: 'invalid', code: result.code as ChangePackValidationCode });
  }, [getWizardCoordinator]);

  const handlePackReplace = useCallback(() => {
    getWizardCoordinator()?.replaceChangePack();
    setPackUi(null);
    setReconciliationResult(null);
    setTechnicalDocsReady(false);
  }, [getWizardCoordinator]);

  const handlePackConfirm = useCallback(async (manifest: Readonly<ChangePackManifest>) => {
    if (packActionRef.current) return;
    const coordinator = getWizardCoordinator();
    if (!coordinator) return;
    packActionRef.current = true;
    try {
      const confirmed = await coordinator.confirmChangePack({ packHash: manifest.packHash, identity: manifest.identity });
      setReconciliationResult(confirmed.reconciliation);
      setPackUi({ status: 'valid', manifest });
      const docs = await coordinator.generateTechnicalDocs();
      setTechnicalDocsReady(Boolean(docs.pl03 && docs.pl07));
    } catch {
      patchTurnError(
        'request_failed',
        'Không thể xác nhận change-pack. Kiểm tra đúng dự án, phiên bản SOLUTION và pack rồi thử lại.',
        activeTabId
      );
    } finally {
      packActionRef.current = false;
    }
  }, [activeTabId, getWizardCoordinator]);

  const handleCabGenerate = useCallback(async () => {
    if (cabActionRef.current) return;
    const coordinator = getWizardCoordinator();
    if (!coordinator) return;
    cabActionRef.current = true;
    try {
      await coordinator.generateCab();
      // ponytail: the wizard coordinator's CAB path does not populate the SDLC artifact chain
      // (pl03b/pl07), so commitCab is unreachable here. Upgrade to commitCab once runCabStage
      // returns CAB markdown and the SDLC chain is populated.
      await getSdlcCoordinator()?.closeCycle().catch(() => undefined);
    } catch {
      patchTurnError(
        'request_failed',
        'Thiếu chuỗi PL02/PL03B/PL07 cùng dự án và thread; chưa thể tạo CAB.',
        activeTabId
      );
    } finally {
      cabActionRef.current = false;
    }
  }, [activeTabId, getWizardCoordinator]);

  const handleWizardApproveExport = useCallback(async (messageId: string, draftRevision: number) => {
    if (exportPending.has(messageId)) return;
    const coordinator = getWizardCoordinator();
    const messageRecord = messages.find((candidate) => candidate.id === messageId);
    if (!coordinator || !messageRecord?.wizard) return;
    setExportPending((previous) => new Set(previous).add(messageId));
    setExportErrors((previous) => { const next = new Map(previous); next.delete(messageId); return next; });
    try {
      const result = await coordinator.approveAndExport(messageId, messageRecord.wizard.renderPayload);
      setExportResults((previous) => new Map(previous).set(messageId, result));
      if (result.errorCode) setExportErrors((previous) => new Map(previous).set(messageId, result.errorCode!));
      if (result.noteSaved) setWizardSnapshot(coordinator.getSnapshot());
      void draftRevision;
    } finally {
      setExportPending((previous) => { const next = new Set(previous); next.delete(messageId); return next; });
    }
  }, [exportPending, getWizardCoordinator, messages]);

  const handleWizardRetryDownload = useCallback(async (messageId: string) => {
    const result = await getWizardCoordinator()?.retryExportDownload(messageId);
    if (!result) return;
    setExportResults((previous) => new Map(previous).set(messageId, result));
    setExportErrors((previous) => {
      const next = new Map(previous);
      if (result.errorCode) next.set(messageId, result.errorCode); else next.delete(messageId);
      return next;
    });
  }, [getWizardCoordinator]);

  const handleSendMessageRef = useRef<
    (
      text: string,
      overrideScope?: ActiveScope,
      options?: { resumeFromCheckpoint?: boolean }
    ) => Promise<void>
  >(async () => {});

  const getSdlcCoordinator = useCallback(() => {
    if (!isProjectScope || !currentScope.id || !activeThreadId) return null;
    if (!sdlcCoordinatorRef.current) {
      const stateKey = `sdlc_workflow:${currentScope.id}:${activeThreadId}`;
      sdlcCoordinatorRef.current = createSdlcWorkflowCoordinator({
        projectId: currentScope.id,
        threadId: activeThreadId,
        saveState: async (state) => {
          await db.settings.put({ key: stateKey, value: state });
          setSdlcWorkflowState(state);
        },
        loadState: async () => {
          const setting = await db.settings.get(stateKey);
          return setting?.value as SdlcWorkflowState | undefined;
        },
        onStateChange: (state: SdlcWorkflowState) => setSdlcWorkflowState(state),
      });
    }
    return sdlcCoordinatorRef.current;
  }, [activeThreadId, currentScope.id, db, isProjectScope]);

  useEffect(() => {
    if (!isProjectScope || !isSdlcActiveTab || !activeThreadId) {
      sdlcCoordinatorRef.current = null;
      setSdlcWorkflowState(undefined);
      return;
    }
    const coordinator = getSdlcCoordinator();
    if (!coordinator) return;
    void coordinator.restore();
  }, [activeTabId, activeThreadId, getSdlcCoordinator, isProjectScope]);

  // Resumes with a fresh request id, then issues exactly one fresh turn. The draft typed in the
  // composer is intentionally not forwarded: resume means "re-run the interrupted step".
  const handleSdlcCheckpointContinue = useCallback(async () => {
    const coordinator = getSdlcCoordinator();
    if (!coordinator) return;
    try {
      const resumed = await coordinator.resumeCheckpoint();
      setSdlcWorkflowState(resumed);
      const step = resumed.checkpoint?.step ?? resumed.currentStep;
      void handleSendMessageRef.current(
        `Tiếp tục bước ${step} sau khi bị gián đoạn.`,
        undefined,
        { resumeFromCheckpoint: true }
      );
    } catch {
      message.error('Không thể phục hồi checkpoint SDLC');
    }
  }, [getSdlcCoordinator]);

  // The hub passes the revision kind explicitly, so no local draft-kind state is needed (D-22/D-23).
  const handlePreviewRevision = useCallback(async (type: 'requirement' | 'solution', draft: string) => {
    const coordinator = getSdlcCoordinator();
    if (!coordinator) return;
    setRevisionLoading(true);
    try {
      const preview = await coordinator.previewRevision(type === 'requirement' ? 'PL01' : 'SOLUTION', draft);
      setRevisionPreview(preview);
    } catch {
      message.error('Không thể xem trước bản cập nhật');
    } finally {
      setRevisionLoading(false);
    }
  }, [getSdlcCoordinator]);

  const handleCommitRevision = useCallback(async () => {
    if (!revisionPreview) {
      message.error('Chưa có bản xem trước để xác nhận');
      return;
    }
    const coordinator = getSdlcCoordinator();
    if (!coordinator) return;
    try {
      const cycles = sdlcWorkflowState?.cycles ?? [];
      const lastCycle = cycles[cycles.length - 1];
      if (!lastCycle || lastCycle.status === 'completed') await coordinator.openCycle();
      const next = await coordinator.commitRevision(revisionPreview, true);
      setSdlcWorkflowState(next);
      setRevisionPreview(null);
      setRevisionDraft('');
      message.success('Đã cập nhật tài liệu và đánh dấu các bước cần làm lại');
    } catch {
      message.error('Không thể cập nhật tài liệu. Bản đang active có thể đã thay đổi.');
    }
  }, [getSdlcCoordinator, revisionPreview, sdlcWorkflowState]);

  const handleSdlcCheckpointDiscard = useCallback(async () => {
    const coordinator = getSdlcCoordinator();
    if (!coordinator) return;
    try {
      const cleared = await coordinator.clearCheckpoint();
      setSdlcWorkflowState(cleared);
    } catch {
      message.error('Không thể phục hồi checkpoint SDLC');
    }
  }, [getSdlcCoordinator]);

  const handleStartSdlcWorkflow = useCallback(async (
    metadata: SdlcWorkflowMetadata,
    pl01: string,
    pl02: string,
    pl01Sources?: SdlcSourceRef[],
    pl02Sources?: SdlcSourceRef[]
  ) => {
    const coordinator = getSdlcCoordinator();
    if (!coordinator) return;
    const newState = await coordinator.startOrUpdateIntake(metadata, pl01, pl02, { pl01Sources, pl02Sources });
    setSdlcWorkflowState(newState);
    setSdlcInputModalOpen(false);
    setWizardSnapshot(undefined);
    if (currentScope.id) {
      const sdlcTab = durableTabs.find((tab) => tab.type === 'sdlc') ?? await getOrCreateSdlcTab(currentScope.id, db);
      await setActiveTab(scopeKey, sdlcTab.id, db);
    }

    // Kích hoạt AI phân tích tri thức và tạo bản thảo SOLUTION.md đầu tiên
    const prompt = `[Quy trình SDLC - Khởi tạo SOLUTION cho CR: ${metadata.cr}]\nTính năng: ${metadata.featureName}\nĐơn vị yêu cầu: ${metadata.requestingUnit}\n\n1. YÊU CẦU NGHIỆP VỤ (PL01):\n${pl01}\n\n2. ĐẶC TẢ CHỨC NĂNG (PL02):\n${pl02}\n\nDựa vào ngữ cảnh tri thức của dự án và hai tài liệu trên, hãy phân tích hiện trạng hệ thống, các màn hình/API/bảng DB bị ảnh hưởng và đề xuất bản thảo giải pháp kỹ thuật SOLUTION.md chi tiết.`;
    void handleSendMessageRef.current(prompt);
  }, [currentScope.id, db, durableTabs, getSdlcCoordinator, scopeKey]);

  const exportedFiles = new Map(Array.from(exportResults.entries()).map(([id, result]) => [id, result.noteSaved ? {
    filename: result.filename ?? 'wizard.docx', sizeBytes: result.sizeBytes ?? 0, noteId: result.noteId,
    noteSaved: result.noteSaved, downloadInitiated: result.downloadInitiated, savePickerSaved: result.savePickerSaved,
  } : undefined] as const));
  const wizardCallbacks = {
    onApproveExport: handleWizardApproveExport,
    onRequestEdit: (_messageId: string, _draftRevision: number) => {
      void getWizardCoordinator()?.requestEdit('').then(() => setWizardSnapshot(getWizardCoordinator()?.getSnapshot()));
    },
    onRetryExport: handleWizardRetryDownload,
    onOpenNote: (noteId: string) => { window.location.hash = `/notes?doc=${encodeURIComponent(noteId)}`; },
    onSuggestion: (_questionId: string, suggestion: string) => setExternalInputValue(suggestion),
    onSkip: (_messageId: string, questionId: string) => {
      void getWizardCoordinator()?.skipGap(questionId).then(() => {
        setWizardSkipNotice(`Đã bỏ qua: ${questionId} · (chưa cung cấp)`);
        setWizardSnapshot(getWizardCoordinator()?.getSnapshot());
      });
    },
    onSaveSolution: async (messageId: string, _draftRevision?: number | null) => {
      try {
        if (!activeThreadId || !currentScope.id) return;
        const threadMsgs = await loadChatMessages(activeThreadId, db);
        const targetMsg = threadMsgs.find((m) => m.id === messageId);
        const snapshot = targetMsg?.wizard;
        const markdown = snapshot && 'markdown' in snapshot.renderPayload && snapshot.renderPayload.markdown
          ? snapshot.renderPayload.markdown
          : targetMsg?.content || '';

        const noteRes = await saveSolutionVersion({
          projectId: currentScope.id,
          threadId: activeThreadId,
          sessionId: snapshot?.sessionId ?? crypto.randomUUID(),
          inputRevision: snapshot?.inputRevision ?? 0,
          draftRevision: snapshot?.draftRevision ?? 1,
          inputHash: snapshot?.artifactHash ?? (await defaultSha256(markdown)),
          markdown,
          exportPayload: snapshot?.renderPayload ?? {},
          approvedAt: new Date().toISOString(),
        }, db);

        await getSdlcCoordinator()?.commitSolution(markdown, noteRes.note.id);
        message.success('Đã lưu SOLUTION.md vào tài liệu dự án');
      } catch (err: any) {
        message.error(`Không thể lưu SOLUTION.md: ${err?.message || err}`);
      }
    },
    pendingKeys: exportPending,
    exportedFiles,
    exportErrors,
  };

  const packVisible = wizardSnapshot?.skill === 'PL03' || wizardSnapshot?.skill === 'PL07';
  const confirmedManifest = packUi?.status === 'valid' && reconciliationResult ? packUi.manifest : null;

  const wizardProject = currentScope.id ? { id: currentScope.id, name: currentScope.title || currentScope.id } : undefined;
  const wizardLeadingContent = (
    <>
      {wizardSnapshot && <WizardLifecycleBar formName={wizardSnapshot.skill} snapshot={wizardSnapshot} restored={Boolean((wizardSnapshot as WizardSnapshot & { restored?: boolean }).restored)} onAbandon={() => void handleWizardCancel()} />}
      {wizardSnapshot && <WizardProgressStrip snapshot={wizardSnapshot} />}
      {wizardSkipNotice && <div role="status">{wizardSkipNotice}</div>}
      {packVisible && !packUi && <ChangePackDropzone onSelect={(file) => void handlePackSelect(file)} />}
      {packVisible && packUi && !confirmedManifest && <ChangePackConfirmStrip result={packUi} onConfirm={(manifest) => void handlePackConfirm(manifest)} onReplace={handlePackReplace} />}
      {confirmedManifest && reconciliationResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div role="status" style={{ fontSize: 12 }}>Đã nạp change-pack {confirmedManifest.identity.cr}</div>
          <DriftMatrixView result={reconciliationResult} />
          <Button onClick={() => void handleCabGenerate()} disabled={!technicalDocsReady || cabActionRef.current}>Tạo tờ trình CAB</Button>
        </div>
      )}
    </>
  );
  const wizardPlaceholder = wizardSnapshot && !['completed', 'abandoned'].includes(wizardSnapshot.status) ? 'Trả lời câu hỏi hoặc bổ sung thông tin…' : undefined;

  // Deliberate scope: dispose() aborts only the wizard stageController, never a chat/SDLC turn (D-09 scopes chat/SDLC requests only).
  useEffect(() => {
    if (!open) wizardCoordinatorRef.current?.dispose();
    return () => { wizardCoordinatorRef.current?.dispose(); };
  }, [open]);

  useEffect(() => {
    if (!wizardSnapshot || !activeThreadId) return;
    const refreshed = deriveActiveWizard(messages, currentScope.id ?? '', activeThreadId);
    const statusRank: Record<WizardSnapshot['status'], number> = {
      collecting: 1,
      gap_fill: 2,
      review: 3,
      approved: 4,
      exporting: 5,
      completed: 6,
      abandoned: 0,
    };
    const isNewer = refreshed && (
      refreshed.updatedAt > wizardSnapshot.updatedAt ||
      (refreshed.updatedAt === wizardSnapshot.updatedAt && statusRank[refreshed.status] > statusRank[wizardSnapshot.status])
    );
    if (isNewer) setWizardSnapshot(refreshed);
  }, [activeThreadId, currentScope.id, messages, wizardSnapshot]);

  const wizardMetadataModal = wizardSkill && wizardProject ? (
    <WizardMetadataModal open={wizardMetadataOpen} skill={wizardSkill} project={wizardProject} onStart={(metadata) => void handleWizardStart(metadata)} onClose={() => setWizardMetadataOpen(false)} />
  ) : null;

  void wizardMetadataModal;

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

  // Analysis mode: durable per-tab state via ChatTab.config. Tab 'sdlc' is always true.
  const currentTabAnalysisMode = isSdlcActiveTab
    ? true
    : Boolean(activeTab?.config?.analysisMode) ||
      (typeof window !== 'undefined' && window.localStorage?.getItem('planner:ai_analysis_mode') === 'true');

  const handleToggleAnalysisMode = useCallback(async () => {
    if (isSdlcActiveTab) {
      message.info('Quy trình SDLC bắt buộc dùng chế độ Phân tích (Analysis mode) để tra cứu tri thức & CSDL an toàn.');
      return;
    }
    if (!activeTab) return;
    const currentVal = Boolean(activeTab.config?.analysisMode);
    const nextVal = !currentVal;
    try {
      await updateChatTab(
        activeTab.id,
        {
          config: { ...(activeTab.config || {}), analysisMode: nextVal },
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
  }, [activeTab, db, isSdlcActiveTab]);

  const tabAnalysisModes = useMemo(() => {
    const modes: Record<string, boolean> = {};
    for (const t of durableTabs) {
      modes[t.id] = t.type === 'sdlc' ? true : Boolean(t.config?.analysisMode);
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

  // Abort every tab's request on unmount only. Drawer close must not abort an in-flight turn (D-09).
  useEffect(() => {
    return () => {
      for (const runtime of Object.values(tabRuntimesRef.current.getSnapshot())) {
        runtime.confirmationResolver?.(false);
        runtime.requestController?.abort();
        requestRegistryRef.current.abortTab(runtime.tabId);
      }
    };
  }, []);

  // Abort every outgoing-scope request on scope change (AI-SPEC §4b).
  // Chat tab ids are scope-scoped, so every runtime present here belongs to the outgoing scope;
  // the new scope's runtimes are created later by the initialize effect.
  useEffect(() => {
    for (const runtime of Object.values(tabRuntimesRef.current.getSnapshot())) {
      if (!runtime.requestController) continue;
      requestRegistryRef.current.abortTab(runtime.tabId);
      runtime.requestController.abort();
      tabRuntimesRef.current.patch(runtime.tabId, { groundedLoadingStatus: null });
    }
    setTransientClarifyMessage(null);
  }, [currentScope.type, currentScope.id]);

  const handleStopGeneration = () => {
    const runtime = tabRuntimesRef.current.get(activeRuntimeTabId);
    requestRegistryRef.current.abortTab(activeRuntimeTabId);
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
  };

  const handleSendMessage = async (
    text: string,
    overrideScope?: ActiveScope,
    options?: { resumeFromCheckpoint?: boolean }
  ) => {
    // A plain send while an SDLC checkpoint is interrupted must not run; only the explicit resume
    // path (which calls resumeCheckpoint first) bypasses this guard.
    if (
      isSdlcActiveTab &&
      sdlcWorkflowState?.checkpoint?.status === 'interrupted' &&
      !options?.resumeFromCheckpoint
    ) {
      return;
    }
    handleSendMessageRef.current = handleSendMessage;
    const trimmed = text.trim();
    if (!trimmed) return;

    if (isSdlcActiveTab && (await handleWizardMessage(trimmed))) return;

    // Check if ANY tab is awaiting a mutation confirmation; answer on that tab's behalf.
    const pendingRuntime = Object.values(tabRuntimesRef.current.getSnapshot()).find(
      (runtime) => runtime.confirmationResolver
    );
    if (pendingRuntime) {
      const lower = trimmed.toLowerCase();
      if (/^(yes|y|có|co|ok|được|duoc|đồng ý|dong y|xác nhận|xac nhan)$/i.test(lower)) {
        pendingRuntime.confirmationResolver?.(true);
        tabRuntimesRef.current.patch(pendingRuntime.tabId, {
          pendingConfirmation: null,
          confirmationResolver: undefined,
        });
        return;
      }
      if (/^(no|n|không|khong|cancel|hủy|huy|từ chối|tu choi)$/i.test(lower)) {
        pendingRuntime.confirmationResolver?.(false);
        tabRuntimesRef.current.patch(pendingRuntime.tabId, {
          pendingConfirmation: null,
          confirmationResolver: undefined,
        });
        return;
      }
    }

    if (trimmed === '/clear') {
      handleClearContext();
      return;
    }

    // Per-tab guard (D-06/D-10): one tab's in-flight turn never blocks or aborts another tab.
    // Resolve the durable active tab at send time; the live query may still hold a provisional id.
    const turnTab = await ensureTurnTab();
    const turnTabId = turnTab.id;
    turnTabIdRef.current = turnTabId;
    if (
      requestRegistryRef.current.hasActive(turnTabId) ||
      tabRuntimes.get(turnTabId)?.status === 'processing'
    ) {
      return;
    }

    setScrollTrigger((prev) => prev + 1);
    // Seed the owner runtime before the first patch: patch() no-ops on an unseeded tab.
    tabRuntimes.initialize(turnTabId, turnTab.threadId ?? activeThreadId ?? '');
    tabRuntimes.patch(turnTabId, {
      error: null,
      status: 'idle',
      lastSubmittedText: trimmed,
    });

    // Clarification transcript continuation handling per D-06
    let effectiveQuery = trimmed;
    let nextClarifyTurnCount = 1;
    if (transientClarifyMessage) {
      nextClarifyTurnCount = transientClarifyMessage.turnCount + 1;
      if (nextClarifyTurnCount > 2) {
        setTransientClarifyMessage(null);
        tabRuntimes.patch(turnTabId, {
          status: 'error',
          error: {
            code: 'request_failed',
            message:
              'Chưa thể xác định rõ ý định sau 2 lần hỏi. Vui lòng đặt câu hỏi cụ thể hơn hoặc chọn tác vụ cụ thể trong giao diện.',
            requestId: generateId(),
          },
        });
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

    // 1. Ensure thread exists for effective scope. Resolve the durable tab's thread at send time
    // instead of trusting a live-query value captured before the tab query resolved.
    let activeThread = overrideScope
      ? await createOrGetThread(
          {
            scopeType: effectiveScope.type,
            entityId: effectiveScope.id,
            title: effectiveScope.title,
          },
          db
        )
      : (await db.chatThreads.get(turnTab.threadId ?? '')) ?? thread;

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

    // 2. Always persist the user message; plan 14 turns this into a retry-by-id option.
    const savedUserMsg = await saveMessage(
      {
        threadId: activeThread.id,
        role: 'user',
        content: trimmed,
      },
      db
    );

    // Own a fresh turn controller for THIS tab. Never abort another tab's request (D-06/D-10).
    tabRuntimes.initialize(turnTabId, activeThread.id);
    const activeReq = requestRegistryRef.current.begin(turnTabId, activeThread.id);
    const controller = activeReq?.controller ?? new AbortController();
    // Single owner of requestController: stop/close/unmount read it from here (SC-2).
    tabRuntimes.patch(turnTabId, {
      requestController: controller,
      status: 'processing',
      partialBuffer: '',
    });
    const turnController = controller;

    // A turn that finishes before streaming must release its per-tab claim, or the tab stays "processing".
    const endTurnWithoutStream = () => {
      tabRuntimes.patch(turnTabId, {
        status: 'idle',
        groundedLoadingStatus: null,
        streamingStatus: null,
        requestController: undefined,
        partialBuffer: '',
      });
      if (activeReq) requestRegistryRef.current.finish(activeReq.requestId);
    };

    const apiKey = await getNineRouterApiKey(db);
    const config = await getNineRouterConfig(db);
    if (config.defaultModel) persistedDefaultModelRef.current = config.defaultModel;
    if (apiKey && config.endpoint) {
      // Await so the boundary message exists before the history read below.
      // Compaction stays best-effort and must never fail the turn.
      try {
        await compactThreadContext({
          threadId: activeThread.id,
          db,
          endpoint: config.endpoint,
          apiKey,
          model: resolveActiveModel(),
          signal: turnController.signal,
        });
      } catch (compErr: any) {
        if (compErr?.name !== 'AbortError') {
          logAiChatError('Auto context compaction check error', compErr);
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
    const isSdlcActiveTurn = isSdlcActiveTab;
    const effectiveAnalysisMode = isSdlcActiveTurn ? true : currentTabAnalysisMode;

    if (isSdlcActiveTurn && sdlcWorkflowState) {
      // Written after the user message is saved and before any transport call. A checkpoint that
      // cannot be written must not abort the turn, so the write is best-effort.
      await getSdlcCoordinator()
        ?.setCheckpoint(crypto.randomUUID(), sdlcWorkflowState.currentStep ?? 'SOLUTION')
        .catch(() => undefined);
    }

    // Every post-checkpoint exit path is enclosed here so the single finally below clears the
    // checkpoint. A surviving `running` checkpoint is restored as `interrupted` and blocks the tab.
    try {

    if (isSdlcActiveTurn) {
      effectivePrompt = buildSdlcWrapperPrompt({
        userQuery: trimmed,
        step: sdlcWorkflowState?.currentStep || 'SOLUTION',
        metadata: sdlcWorkflowState?.metadata,
        artifacts: stripStaleArtifacts(sdlcWorkflowState),
      });
    }

    // Analysis mode bypasses the grounded pipeline (intent router, scope routing,
    // schema-validated synthesis) and falls straight through to the tool loop.
    if (!effectiveAnalysisMode) {
    const catalog = await fetchSetCatalog(db);
    const capabilities = {
      serverEnabled: Boolean(knowledgeConfig.enabled && knowledgeConfig.baseUrl),
      modelConfigured: Boolean(apiKey && config.endpoint && resolveActiveModel()),
    };
    const deps = createDefaultGroundedTurnDeps({
      knowledgeBaseUrl: knowledgeConfig.baseUrl,
      knowledgeToken: knowledgeConfig.token,
      db,
    });
    const routeScope = deps.routeScope;
    deps.routeScope = (input, routeDeps) => {
      patchGroundedLoading('Đang xác định phạm vi tài liệu...');
      return routeScope(input, routeDeps);
    };
    const retrieveFederated = deps.retrieveFederated;
    deps.retrieveFederated = (request, signal) => {
      patchGroundedLoading('Đang truy xuất tài liệu và đồ thị liên quan...');
      return retrieveFederated(request, signal);
    };
    const runLocalBm25 = deps.runLocalBm25;
    deps.runLocalBm25 = (input, localDeps) => {
      patchGroundedLoading('Đang tìm kiếm trong tài liệu cục bộ...');
      return runLocalBm25(input, localDeps);
    };
    const synthesizeGroundedAnswer = deps.synthesizeGroundedAnswer;
    deps.synthesizeGroundedAnswer = (input) => {
      patchGroundedLoading('Đang tổng hợp câu trả lời từ bằng chứng...');
      return synthesizeGroundedAnswer(input);
    };
    try {
      patchGroundedLoading('Đang phân tích ý định câu hỏi...');
      const groundedResult = await runGroundedTurn(
        {
          query: effectiveQuery,
          recentTurns: allHistoryTurns,
          signal: turnController.signal,
          capabilities,
          config: {
            endpoint: config.endpoint,
            apiKey,
            model: resolveActiveModel(),
            promptVersion: 'grounded-v1',
            routerVersion: 'router-v1',
          },
          catalog,
          recentSessionId: activeThread.id,
        },
        deps
      );

      if (turnController.signal.aborted) {
        endTurnWithoutStream();
        return;
      }

      if (groundedResult?.kind === 'clarify_intent') {
        setTransientClarifyMessage({
          id: `transient-${Date.now()}`,
          originalQuery: transientClarifyMessage ? transientClarifyMessage.originalQuery : trimmed,
          clarifyQuestion:
            groundedResult.clarifyQuestion ||
            'Bạn có thể cung cấp thêm chi tiết để tôi hỗ trợ chính xác hơn không?',
          turnCount: nextClarifyTurnCount,
        });
        endTurnWithoutStream();
        return;
      }

      // Clarification succeeded or normal turn: clear transient clarify state
      setTransientClarifyMessage(null);

      if (groundedResult.kind === 'operational') {
        patchGroundedLoading('Đang chuẩn bị ngữ cảnh TaskMate...');
      } else {
        patchGroundedLoading('Đang xử lý kết quả tra cứu...');
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
              modelId: resolveActiveModel(),
              createdAt: new Date().toISOString(),
            },
          },
          db
        );
        endTurnWithoutStream();
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
          modelId: resolveActiveModel(),
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
        endTurnWithoutStream();
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
          endTurnWithoutStream();
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
          endTurnWithoutStream();
          return;
        }
    } catch (groundedErr: any) {
      if (turnController.signal.aborted) {
        endTurnWithoutStream();
        return;
      }

      logAiChatError('Grounded pipeline or persistence error', groundedErr);
      patchGroundedLoading(null);

      // Fail-closed gate per D-04: If intent router is unavailable, stop immediately.
      if (
        groundedErr instanceof IntentRouterUnavailableError ||
        groundedErr?.name === 'IntentRouterUnavailableError' ||
        groundedErr?.message?.includes('intent routing is unavailable')
      ) {
        patchTurnError(
          'request_failed',
          'Trợ lý AI tạm thời không khả dụng. Vui lòng kiểm tra lại cấu hình kết nối AI.'
        );
        if (activeReq) requestRegistryRef.current.finish(activeReq.requestId);
        return;
      }

      patchTurnError(
        'invalid_response',
        'Không thể lưu câu trả lời hoặc dữ liệu tri thức không hợp lệ. Vui lòng thử lại.'
      );
      if (activeReq) requestRegistryRef.current.finish(activeReq.requestId);
      return;
    }
    }

    // 3. Operational tool loop (for operational / mixed / fallback turns)
    if (turnController.signal.aborted) {
      endTurnWithoutStream();
      return;
    }

    if (!apiKey) {
      patchTurnError('request_failed', 'Chưa cấu hình API Key 9router. Vui lòng mở Cài đặt AI để thiết lập.');
      if (activeReq) requestRegistryRef.current.finish(activeReq.requestId);
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
        logAiChatError('Context grounding resolution error', err);
      }
    } else if (effectiveScope.type === 'global') {
      try {
        systemInstruction = await buildGlobalContextPrompt(db);
      } catch (err) {
        logAiChatError('Global context prompt resolution error', err);
      }
    }

    // 4b. Extract mentioned tasks, projects, and local files from prompt and inject grounding
    const { taskIds, projectIds, filePaths } = extractMentionedEntityIds(trimmed);
    const mentionedContexts: string[] = [];

    const turnReferences = tabRuntimes.get(turnTabId)?.references ?? [];
    const allFiles = Array.from(new Set([...turnReferences, ...(filePaths || [])]));
    if (allFiles.length !== turnReferences.length) {
      // One-shot append computed from the owning tab, so a mid-send tab switch cannot merge another tab's attachments.
      tabRuntimes.patch(turnTabId, { references: allFiles });
    }

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
        logAiChatError(`Grounding error for task ${tid}`, err);
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
        logAiChatError(`Grounding error for project ${pid}`, err);
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
      logAiChatError('MCP discovery unavailable', err);
    }
    const toolsForTurn = getToolsForTurn(effectiveAnalysisMode, dynamicMcpTools);
    let dynamicMcpInstructions = '';
    try {
      dynamicMcpInstructions = await getEnabledMcpInstructions(db);
    } catch (err) {
      logAiChatError('MCP instruction resolution error', err);
    }

    const systemPromptContent = `You are an expert AI assistant embedded inside ${APP_NAME}.
Current Date: ${todayStr} (${dayName}). Time: ${timeStr}.

CRITICAL ANTI-HALLUCINATION RULES:
1. NEVER GUESS, ASSUME, OR INVENT DATA.
2. Every statement regarding tasks, projects, milestones, statuses, deadlines, logged work sessions, actual hours, planned allocations, capacity limits, notes, reminders, recurring schedules, or system sync state MUST be strictly grounded in concrete evidence returned by your tools or provided in context.
3. If the user asks about anything not present in the initial context (such as time spent, worklog history, daily schedule, running timer, notes, capacity, overdue items), YOU MUST CALL THE RELEVANT DATABASE TOOLS before answering.
4. If a requested item or detail is missing, null, empty, or not recorded in the database, EXPLICITLY STATE THAT IT IS NOT RECORDED. Never extrapolate, approximate, or pretend data exists.
5. When breaking down goals or proposing steps, output clear actionable bullet points that can be converted into checklist items.
6. DIAGRAMS & FLOWCHARTS: When the user asks for a flowchart, workflow diagram, sequence diagram, architecture chart, or visual representation, or when visualizing processes/hierarchies, you CAN and SHOULD generate Mermaid.js code blocks using \`\`\`mermaid syntax (e.g. flowchart TD, sequenceDiagram, classDiagram, graph LR, etc.). TaskMate will automatically render interactive diagrams from these blocks.
7. YOU HAVE FULL DATABASE MUTATION CAPABILITIES: You can create, update, reparent, or delete tasks, projects, milestones, planned allocations, work sessions, active timers, capacity rules/overrides, and notes using mutation tools (create_task, update_task, update_task_checklist, reparent_task, delete_task, create_project, update_project, delete_project, create_milestone, update_milestone, delete_milestone, plan_allocation, delete_allocation, log_work_session, update_work_session, delete_work_session, start_timer, pause_timer, stop_and_log_timer, discard_timer, update_capacity_rule, set_capacity_override, remove_capacity_override, create_note, update_note, delete_note). When the user asks you to perform an action or change anything in the app, call the appropriate action tool.${
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
      effectiveAnalysisMode
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
    }${
      isSdlcActiveTurn
        ? `\n\n[SDLC DEVELOPER WORKFLOW ACTIVE]:
Bạn đang hỗ trợ quy trình SDLC Developer (Khảo sát, thiết kế giải pháp SOLUTION.md và hồ sơ kỹ thuật).
Nguyên tắc khi tạo hoặc tinh chỉnh bản thảo giải pháp SOLUTION.md:
1. Đóng vai trò Solution Architect & Tech Lead.
2. Tra cứu hiện trạng mã nguồn, tài liệu và cấu trúc bảng CSDL (sử dụng công cụ MCP Oracle hoặc tri thức hệ thống nếu có).
3. Đề xuất giải pháp SOLUTION.md hoàn chỉnh, rõ ràng:
   # GIẢI PHÁP KỸ THUẬT: [Tên tính năng] (CR: [Mã CR])
   ## 1. Mục tiêu & Phạm vi thay đổi
   ## 2. Hiện trạng hệ thống & Kiến trúc mục tiêu (khuyến khích vẽ sơ đồ Mermaid: flowchart, sequenceDiagram...)
   ## 3. Thiết kế chi tiết:
      - API / Service Interface
      - Thay đổi CSDL (Bảng, cột mới, Index, DDL/DML dự kiến)
      - Logic xử lý nghiệp vụ
   ## 4. Phân tích ảnh hưởng & Rủi ro hệ thống
   ## 5. Kế hoạch kiểm thử & Kịch bản Rollback (khi có sự cố)
4. Giữ định dạng Markdown chuẩn, sẵn sàng để người dùng bấm nút "Lưu SOLUTION.md" lưu vào hồ sơ dự án.`
        : ''
    }`;

    if (import.meta.env.DEV) {
      console.log('[AI Harness] 📝 Injected Context Grounding:\n', systemPromptContent);
    }
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
    patchGroundedLoading(null);
    tabRuntimes.patch(turnTabId, {
      streamingText: '',
      streamingStatus: 'Đang kết nối 9router...',
    });

    const correlationId = crypto.randomUUID();
    const routeLog = createPhaseLogger('[ROUTE]', { correlationId });
    const toolLog = createPhaseLogger('[TOOL]', { correlationId });
    const turnStartTime = Date.now();
    let accumulatedTokenUsage: ChatTokenUsage | undefined;
    const turnGeneratedFiles: ChatGeneratedFile[] = [];

    let fullResponse = '';
    const currentMessages: ChatCompletionMessage[] = [...recentMsgs];
    const MAX_TOOL_LOOPS = 30;

    const resolvedModel = resolveActiveModel();
    const targetModel =
      resolvedModel && (availableModels.length === 0 || availableModels.includes(resolvedModel))
        ? resolvedModel
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
        ...(effectiveAnalysisMode
          ? { keepRecentToolOutputs: 20, maxOldToolChars: 100_000 }
          : {}),
        // Auto-compaction follows the configured model context window, like Claude
        // Code: trigger at a fraction of the window using the provider-reported
        // prompt token count.
        contextWindowTokens: config.contextWindowTokens,
        compactAtRatio: effectiveAnalysisMode ? 0.9 : 0.75,
        executeToolFn: (name, args, toolDb, signal) => dispatchAiToolCall(name, args, toolDb, signal),
        onTextChunk: (delta) => {
          fullResponse += delta;
          aiDebugService.appendStreamChunk(turnId, delta);
          const stripped = stripThinkingBlocks(fullResponse);
          tabRuntimes.patch(turnTabId, { streamingText: stripped, streamingStatus: null, partialBuffer: stripped });
        },
        onStatusChange: (status) => {
          if (status === 'Đang tổng hợp câu trả lời hoàn chỉnh...') {
            fullResponse = '';
            tabRuntimes.patch(turnTabId, { streamingText: '' });
          }
          tabRuntimes.patch(turnTabId, { streamingStatus: status });
        },
        onUsage: (usage) => {
          accumulatedTokenUsage = {
            promptTokens: (accumulatedTokenUsage?.promptTokens || 0) + (usage.promptTokens || 0),
            completionTokens: (accumulatedTokenUsage?.completionTokens || 0) + (usage.completionTokens || 0),
            totalTokens: (accumulatedTokenUsage?.totalTokens || 0) + (usage.totalTokens || 0),
          };
          tabRuntimes.patch(turnTabId, { tokenUsage: accumulatedTokenUsage });
        },
        onToolCall: (call) => {
          toolCallsById.set(call.id, { name: call.name, args: call.args });
          if (import.meta.env.DEV) {
            console.log(`[AI Harness] 🛠️ Model invoked tool "${call.name}":`, call.args);
          }
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
          if (import.meta.env.DEV) {
            console.log(`[AI Harness] 📦 Tool result for "${call?.name || callId}":`, result);
          }
          aiDebugService.recordToolResult(turnId, callId, result, durationMs);
        },
        onMutationCheck: async (toolName, args) => {
          if (effectiveAnalysisMode) {
            return {
              proceed: false,
              cancellationResult: JSON.stringify({
                cancelled: true,
                message: 'Analysis Mode chỉ đọc; không có dữ liệu nào bị thay đổi.',
              }),
            };
          }
          if (autoApproveMutations) {
            if (import.meta.env.DEV) {
              console.log(`[AI Harness] ⚡ Auto-approving mutation tool "${toolName}" (bypass active)`);
            }
            return { proceed: true };
          }

          const summary = await describeToolMutationWithContext(toolName, args, db);
          tabRuntimes.patch(turnTabId, { streamingStatus: 'Chờ xác nhận hành động...' });
          const confirmed = await new Promise<boolean>((resolve) => {
            const settled = (value: boolean) => resolve(value);
            tabRuntimes.patch(turnTabId, {
              pendingConfirmation: { toolName, summary, args },
              confirmationResolver: settled,
            });
          });
          tabRuntimes.patch(turnTabId, {
            pendingConfirmation: null,
            confirmationResolver: undefined,
          });

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

      // Superseded or aborted request never writes assistant output (D-11/D-12).
      if (!requestRegistryRef.current.isCurrent(activeReq?.requestId ?? '', turnTabId, controller)) {
        aiDebugService.finishTurn(turnId, { aborted: true });
        return;
      }

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
        tabRuntimes.patch(turnTabId, { status: 'idle', partialBuffer: '', error: null });
      } else {
        // Empty output is an error turn: keep the runtime error card, do not reset it to idle below.
        patchTurnError(
          'invalid_response',
          'Mô hình AI không trả về nội dung (phản hồi rỗng). Vui lòng thử lại hoặc chọn mô hình khác.'
        );
      }
      aiDebugService.finishTurn(turnId, { finalResponse: fullResponse });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // Abort invalidates the whole transient response; never persist partial output.
        aiDebugService.finishTurn(turnId, { aborted: true });
      } else {
        const errorMsg = 'Không thể hoàn tất phản hồi AI. Vui lòng thử lại.';
        aiDebugService.finishTurn(turnId, { error: 'request_failed' });
        tabRuntimes.patch(turnTabId, {
          status: 'error',
          error: {
            code: 'request_failed',
            message: err?.message || errorMsg,
            requestId: activeReq?.requestId || generateId(),
          },
        });
      }
    } finally {
      // Reset transient turn state on the owning tab, never the currently visible one.
      tabRuntimes.patch(turnTabId, {
        streamingText: '',
        streamingStatus: null,
        groundedLoadingStatus: null,
        requestController: undefined,
        partialBuffer: '',
      });
      if (activeReq) {
        requestRegistryRef.current.finish(activeReq.requestId);
      }
    }
    } finally {
      // One clear for every post-setCheckpoint exit: success, abort, error, or early return.
      if (isSdlcActiveTurn) {
        await getSdlcCoordinator()?.clearCheckpoint().catch(() => undefined);
      }
    }
  };

  useEffect(() => {
    handleSendMessageRef.current = handleSendMessage;
  });

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
      const lastSubmittedText = tabRuntimesRef.current.get(runtimeTabId)?.lastSubmittedText;
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
      const lastSubmittedText = tabRuntimesRef.current.get(runtimeTabId)?.lastSubmittedText;
      if (lastSubmittedText) {
        void handleSendMessage(lastSubmittedText);
      }
    },
    synthesizingEvidenceId,
    evidenceSynthesisError,
  };

  const handleClearContext = async () => {
    const runtime = tabRuntimesRef.current.get(runtimeTabId);
    runtime?.confirmationResolver?.(false);
    tabRuntimesRef.current.patch(runtimeTabId, {
      pendingConfirmation: null,
      confirmationResolver: undefined,
    });
    // Clear the scope's durable thread, creating it when the scope has no conversation yet.
    const activeThread = thread ?? (await createOrGetThread(
      {
        scopeType: currentScope.type,
        entityId: currentScope.id,
        title: currentScope.title,
      },
      db
    ));
    await clearThreadContext(activeThread.id, db);
    tabRuntimes.patch(activeTabId, { references: [] });
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
        tabRuntimes.patch(activeTabId, { references: [] });
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
        for (const runtime of Object.values(tabRuntimesRef.current.getSnapshot())) {
          tabRuntimesRef.current.patch(runtime.tabId, { references: [] });
        }
        message.success('Đã xóa sạch toàn bộ lịch sử trò chuyện AI');
      },
    });
  };

  const handleRetry = () => {
    const lastSubmittedText = tabRuntimesRef.current.get(runtimeTabId)?.lastSubmittedText;
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
        selectedModel={resolveActiveModel()}
        availableModels={availableModels}
        onModelChange={handleModelChange}
        onRefreshModels={handleRefreshModels}
        isRefreshingModels={isRefreshingModels}
        autoApproveMutations={autoApproveMutations}
        onToggleAutoApproveMutations={handleToggleAutoApproveMutations}
        analysisMode={currentTabAnalysisMode}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {currentTabAnalysisMode && (
            <Tooltip title="Tab này đang hoạt động ở Chế độ Phân tích: AI gọi công cụ MCP/DB chỉ đọc để tra cứu và không tự động thay đổi dữ liệu">
              <Tag
                color="warning"
                icon={<ExperimentFilled />}
                style={{
                  margin: 0,
                  fontSize: 11,
                  padding: '0 6px',
                  height: 20,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  cursor: 'default',
                  border: `1px solid ${token.colorWarningBorder || '#ffe7ba'}`,
                }}
              >
                Analysis
              </Tag>
            </Tooltip>
          )}
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

      {/* Chrome-like Multi-Tab Bar for All Scopes */}
      {displayTabs.length > 0 && (
        <ChatTabBar
          tabs={displayTabs}
          activeTabId={activeTabId}
          onSelectTab={handleSelectTab}
          onAddTab={handleAddTab}
          onCloseTab={handleCloseTab}
          tabAnalysisModes={tabAnalysisModes}
          tabStatuses={tabStatuses}
          sdlcStatus={
            sdlcWorkflowState
              ? sdlcWorkflowState.staleSteps.length > 0
                ? 'stale'
                : sdlcWorkflowState.currentStep === 'CAB'
                ? 'finish'
                : 'process'
              : 'wait'
          }
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

      {wizardMetadataModal}

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
        streamingText={activeRuntime?.streamingText ?? ''}
        isStreaming={activeRuntime?.status === 'processing'}
        streamingStatus={activeRuntime?.groundedLoadingStatus ?? activeRuntime?.streamingStatus ?? null}
        scrollTrigger={scrollTrigger}
        onRetry={handleRetry}
        onOpenSettings={onOpenSettings}
        canAddToChecklist={currentScope.type === 'task'}
        canSaveStickyNote={true}
        canRunClaudeCode={currentScope.type === 'task'}
        onAddToChecklist={handleAddToChecklist}
        onSaveStickyNote={handleSaveStickyNote}
        onRunClaudeCode={handleRunClaudeCode}
        pendingConfirmation={activeRuntime?.pendingConfirmation ?? null}
        onConfirmAction={handleConfirmAction}
        groundedCallbacks={groundedCallbacks}
        wizardCallbacks={wizardCallbacks}
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

      {/* SDLC Workflow Hub - Full Width above ChatInputBar (chỉ hiện khi đang ở tab SDLC) */}
      <WizardSkillBar
        projectScoped={isProjectScope}
        activeSession={Boolean(wizardSnapshot && !['completed', 'abandoned'].includes(wizardSnapshot.status))}
        selectedSkill={wizardSkill ?? undefined}
        onActivate={(skill) => {
          setWizardSkill(skill);
          setWizardMetadataOpen(true);
        }}
      />

      {isProjectScope && isSdlcActiveTab && (
        <div style={{ width: '100%', padding: '0 12px 6px', boxSizing: 'border-box' }}>
          {sdlcWorkflowState?.checkpoint?.status === 'interrupted' && (
            <InterruptedBanner
              checkpoint={sdlcWorkflowState.checkpoint}
              onContinue={() => void handleSdlcCheckpointContinue()}
              onDiscard={() => void handleSdlcCheckpointDiscard()}
            />
          )}
          <RestoredSourceNotice missingSources={[]} />
          <SdlcWorkflowHub
            projectScoped={isProjectScope}
            state={sdlcWorkflowState}
            onStartWorkflow={() => setSdlcInputModalOpen(true)}
            onSelectStep={(stepId: SdlcStepId) => {
              getSdlcCoordinator()?.selectStep(stepId);
              setSdlcWorkflowState((state) => state ? { ...state, selectedStep: stepId } : state);
            }}
            onRerunStep={(stepId: SdlcStepId) => {
              if (stepId === 'INTAKE') {
                setSdlcInputModalOpen(true);
              } else if (stepId === 'SOLUTION') {
                void handleSendMessageRef.current('Cập nhật lại giải pháp SOLUTION.md theo yêu cầu PL01/PL02 mới nhất.');
              } else if (stepId === 'CHANGE_PACK') {
                message.info('Vui lòng kéo thả file change-pack.zip mới để đối chiếu lại.');
              } else if (stepId === 'TECH_DOCS') {
                void handleSendMessageRef.current('Tái tạo tài liệu kỹ thuật PL03B và PL07 dựa trên SOLUTION và code diff mới.');
              } else if (stepId === 'CAB') {
                void handleCabGenerate();
              }
            }}
            revisionDraft={revisionDraft}
            revisionPreview={
              revisionPreview
                ? toRevisionModalPreview(
                    revisionPreview,
                    previousArtifactContent(sdlcWorkflowState, revisionPreview.kind)
                  )
                : undefined
            }
            revisionLoading={revisionLoading}
            onRevisionDraftChange={setRevisionDraft}
            onPreviewRevision={(type, draft) => void handlePreviewRevision(type, draft)}
            onCommitRevision={() => void handleCommitRevision()}
            onResetWorkflow={() => {
              setSdlcWorkflowState(undefined);
              message.success('Đã làm mới quy trình SDLC');
            }}
          />
        </div>
      )}

      {wizardProject && (
        <StepInputDocsModal
          open={sdlcInputModalOpen}
          project={wizardProject}
          currentUser="Developer"
          initialValues={
            sdlcWorkflowState
              ? {
                  metadata: sdlcWorkflowState.metadata,
                  pl01: sdlcWorkflowState.artifacts.pl01?.content,
                  pl02: sdlcWorkflowState.artifacts.pl02?.content,
                }
              : undefined
          }
          onSubmit={handleStartSdlcWorkflow}
          onClose={() => setSdlcInputModalOpen(false)}
        />
      )}

      {/* Active Tab Runtime Status: the single error-card owner (D-13). */}
      {(() => {
        const runtime = activeRuntime;
        if (!runtime) return null;
        if (runtime.status === 'interrupted') {
          return (
            <div style={{ width: '100%', padding: '0 12px 6px', boxSizing: 'border-box' }}>
              <InterruptedBanner
                message="Yêu cầu trước bị gián đoạn khi ứng dụng đóng."
                onContinue={() => {
                  tabRuntimes.patch(activeTabId, { status: 'idle' });
                  if (runtime.draft) void handleSendMessage(runtime.draft);
                }}
                onDiscard={() => tabRuntimes.patch(activeTabId, { status: 'idle', draft: '' })}
              />
            </div>
          );
        }
        if (runtime.status === 'error' && runtime.error) {
          return (
            <div style={{ width: '100%', padding: '0 12px 6px', boxSizing: 'border-box' }}>
              <InlineApiErrorCard
                errorMessage={runtime.error.message}
                onRetry={handleRetry}
                onOpenSettings={onOpenSettings}
              />
            </div>
          );
        }
        return null;
      })()}

      {/* Chat Input Bar. Remounted per tab and driven by that tab's runtime draft. */}
      <ChatInputBar
        key={activeTabId}
        autoFocus={open}
        onSubmit={handleSendMessage}
        onClear={handleClearContext}
        onClearAll={handleClearAllHistory}
        onStop={handleStopGeneration}
        isStreaming={(activeRuntime?.status === 'processing') && !activeRuntime?.pendingConfirmation}
        placeholder={
          activeRuntime?.pendingConfirmation
            ? 'Gõ "yes" để xác nhận hoặc "no" để từ chối...'
            : (isSdlcActiveTab ? wizardPlaceholder : undefined)
        }
        leadingContent={isSdlcActiveTab ? wizardLeadingContent : undefined}
        db={db}
        attachedFiles={activeRuntime?.references ?? []}
        onAttachFile={handleAttachFile}
        onRemoveFile={handleRemoveFile}
        // Controlled only once the tab has a runtime, so pre-hydration typing is never clobbered.
        value={activeRuntime ? activeRuntime.draft : undefined}
        onValueChange={(next) => {
          draftCarryRef.current = { tabId: activeTabId, text: next };
          tabRuntimes.patch(activeTabId, { draft: next });
        }}
        externalValue={externalInputValue ?? undefined}
        onExternalValueConsumed={() => setExternalInputValue(null)}
      />
    </div>
  );
};
