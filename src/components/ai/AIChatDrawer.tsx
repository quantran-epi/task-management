import React, { useState, useEffect, useRef, useCallback } from 'react';
import { theme, Button, message } from 'antd';
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
} from '../../db/repositories/chatRepo';
import {
  getNineRouterApiKey,
  getNineRouterConfig,
  setNineRouterConfig,
  fetchAvailableModels,
} from '../../services/ai/nineRouterTokenService';
import { streamChatCompletion } from '../../services/ai/nineRouterClient';
import { buildItemContextPrompt } from '../../services/ai/contextGrounding';
import { launchClaudeTerminal } from '../../services/ai/claudeCliService';
import { updateTask, getTask } from '../../db/repositories/taskRepo';
import { createNote } from '../../db/repositories/noteRepo';
import { getProject } from '../../db/repositories/projectRepo';
import { getMilestone } from '../../db/repositories/milestoneRepo';
import { ChatHeader } from './ChatHeader';
import { ChatMessageList } from './ChatMessageList';
import { ChatInputBar } from './ChatInputBar';
import { ScopePickerModal } from './ScopePickerModal';
import { useAIChat } from '../../context/AIChatContext';

export const AI_CHAT_WIDTH_KEY = 'planner:ai_chat_width';
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

  // Sync propScope when it changes (unless user explicitly picked or detached)
  useEffect(() => {
    if (propScope) {
      setInternalScope(propScope);
      setIsDetached(false);
    }
  }, [propScope?.type, propScope?.id, propScope?.title]);

  const currentScope: ActiveScope = isDetached || !internalScope
    ? { type: 'global' }
    : internalScope;

  const scopeKey = buildScopeKey(currentScope.type, currentScope.id);

  // Live queries for in-drawer scope picker (tasks, projects, milestones)
  const availableTasks = useLiveQuery(() => {
    return db.tasks.toArray();
  }, [db]) ?? [];

  const availableProjects = useLiveQuery(() => {
    return db.projects.toArray();
  }, [db]) ?? [];

  const availableMilestones = useLiveQuery(() => {
    return db.milestones.toArray();
  }, [db]) ?? [];

  const selectedScopeValue =
    currentScope.type === 'global'
      ? 'global'
      : `${currentScope.type}:${currentScope.id}`;

  const scopeOptions = [
    {
      label: 'Toàn cục',
      options: [{ value: 'global', label: 'Toàn cục (Không gắn)' }],
    },
    {
      label: 'Tác vụ',
      options: availableTasks
        .filter((t) => t.status !== 'Done' && t.status !== 'Cancelled')
        .slice(0, 30)
        .map((t) => ({
          value: `task:${t.id}`,
          label: `[${t.status}] ${t.name}`,
        })),
    },
    {
      label: 'Dự án',
      options: availableProjects
        .filter((p) => p.status !== 'Done' && p.status !== 'Cancelled')
        .slice(0, 20)
        .map((p) => ({
          value: `project:${p.id}`,
          label: p.name,
        })),
    },
    {
      label: 'Mốc',
      options: availableMilestones
        .filter((m) => m.status !== 'Done' && m.status !== 'Cancelled')
        .slice(0, 20)
        .map((m) => ({
          value: `milestone:${m.id}`,
          label: m.name,
        })),
    },
  ];

  const handleScopeChange = (val: string) => {
    if (val === 'global') {
      setIsDetached(true);
      setInternalScope({ type: 'global' });
      return;
    }
    const [typeStr, id] = val.split(':');
    if (!typeStr || !id) return;
    const type = typeStr as ChatScopeType;

    let title: string | undefined = undefined;
    if (type === 'task') {
      title = availableTasks.find((t) => t.id === id)?.name;
    } else if (type === 'project') {
      title = availableProjects.find((p) => p.id === id)?.name;
    } else if (type === 'milestone') {
      title = availableMilestones.find((m) => m.id === id)?.name;
    }

    setIsDetached(false);
    setInternalScope({ type, id, title });
  };

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
  const [apiError, setApiError] = useState<string | null>(null);
  const [lastSubmittedText, setLastSubmittedText] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);

  // Abort stream on unmount or drawer close
  useEffect(() => {
    if (!open && abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, [open]);

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleSendMessage = async (text: string, overrideScope?: ActiveScope) => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;

    setApiError(null);
    setLastSubmittedText(trimmed);

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
    await saveMessage(
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
            systemInstruction = await buildItemContextPrompt({ entityType: 'task', item: t, db });
          }
        } else if (effectiveScope.type === 'project') {
          const p = await getProject(effectiveScope.id, db);
          if (p) {
            systemInstruction = await buildItemContextPrompt({ entityType: 'project', item: p, db });
          }
        } else if (effectiveScope.type === 'milestone') {
          const m = await getMilestone(effectiveScope.id, db);
          if (m) {
            systemInstruction = await buildItemContextPrompt({ entityType: 'milestone', item: m, db });
          }
        }
      } catch (err) {
        console.warn('[AIChatDrawer] Context grounding resolution error:', err);
      }
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
    const recentMsgs: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

    if (systemInstruction.trim()) {
      recentMsgs.push({
        role: 'system',
        content: `You are an expert AI assistant embedded inside Personal Task & Workload Planner.\nBelow is the ground-truth context of the currently active item:\n${systemInstruction}\nUse this context to answer the user accurately. When breaking down goals, output clear actionable bullet points that can be converted into checklist items.`,
      });
    }

    for (const m of msgsToSend.slice(-20)) {
      recentMsgs.push({
        role: m.role,
        content: m.content,
      });
    }

    // 5. Start SSE Streaming
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsStreaming(true);
    setStreamingText('');

    let fullResponse = '';

    try {
      const targetModel =
        selectedModel && (availableModels.length === 0 || availableModels.includes(selectedModel))
          ? selectedModel
          : availableModels[0] || config.defaultModel;

      const stream = streamChatCompletion({
        endpoint: config.endpoint,
        apiKey,
        payload: {
          model: targetModel,
          messages: recentMsgs,
        },
        signal: controller.signal,
      });

      for await (const delta of stream) {
        fullResponse += delta;
        setStreamingText(fullResponse);
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
      }
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
      } else {
        setApiError(err?.message || 'Lỗi không xác định khi kết nối AI');
      }
    } finally {
      setIsStreaming(false);
      setStreamingText('');
      abortControllerRef.current = null;
    }
  };

  const handleClearContext = async () => {
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
    message.success('Đã đặt lại ngữ cảnh hội thoại');
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
      await createNote(
        {
          entityType: currentScope.type !== 'global' ? currentScope.type : undefined,
          entityId: currentScope.type !== 'global' ? currentScope.id : undefined,
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

  const scopeLabel =
    currentScope.type === 'global'
      ? 'Toàn cục (Không gắn)'
      : `${currentScope.type === 'task' ? 'Tác vụ' : currentScope.type === 'project' ? 'Dự án' : 'Mốc'}: ${currentScope.title || currentScope.id}`;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: isMobile ? '100vw' : width,
        zIndex: isPinned && !isMobile ? 100 : 1200,
        backgroundColor: token.colorBgContainer,
        borderLeft: `1px solid ${token.colorBorderSecondary}`,
        boxShadow: isPinned && !isMobile ? 'none' : '-2px 0 8px rgba(0,0,0,0.15)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Left border drag handle (desktop only) */}
      {!isMobile && (
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
        scopeLabel={scopeLabel}
        selectedScopeValue={selectedScopeValue}
        scopeOptions={scopeOptions}
        onScopeChange={handleScopeChange}
        onOpenScopePicker={() => setScopeModalOpen(true)}
        selectedModel={selectedModel}
        availableModels={availableModels}
        onModelChange={handleModelChange}
        isPinned={isPinned}
        onTogglePin={() => onTogglePin?.()}
        onClearContext={handleClearContext}
        onClose={onClose}
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

      {/* Message List */}
      <ChatMessageList
        messages={messages}
        streamingText={streamingText}
        isStreaming={isStreaming}
        error={apiError}
        onRetry={handleRetry}
        onOpenSettings={onOpenSettings}
        canAddToChecklist={currentScope.type === 'task'}
        canSaveStickyNote={true}
        canRunClaudeCode={currentScope.type === 'task'}
        onAddToChecklist={handleAddToChecklist}
        onSaveStickyNote={handleSaveStickyNote}
        onRunClaudeCode={handleRunClaudeCode}
      />

      {/* Chat Input Bar */}
      <ChatInputBar
        onSubmit={handleSendMessage}
        onClear={handleClearContext}
        onStop={handleStopGeneration}
        isStreaming={isStreaming}
      />
    </div>
  );
};
