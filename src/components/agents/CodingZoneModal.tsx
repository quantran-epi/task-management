import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SshConfig } from '../../types/ssh';
import type { DiffFile } from '../../types/agent';
import type {
  CodingZoneHunkState,
  CodingZoneSharedActivity,
  CodingZoneSharedMessage,
  CodingZoneSharedState,
  CodingZoneSyncPayload,
  ConnectionState,
  WorktreeDescriptor,
} from '../../types/codingZone';
import { isConnectionState, isDiffFileGuard, isWorktreeDescriptor } from '../../types/codingZone';
import { RemoteFileViewer } from '../../workbench/editor/RemoteFileViewer';
import { useCodingZoneSync } from '../../hooks/useCodingZoneSync';
import { CONNECTION_COPY, useCodingZoneActivity } from './CodingZoneLiveState';
import { CodingZoneTree } from './CodingZoneTree';
import { CodingZoneChatStrip, type CodingZoneMessage } from './CodingZoneChatStrip';
import '../../styles/coding-zone.css';

/** Phase 48 D-03/D-04/D-13: one workbench state machine drives modal and popout. */
export interface CodingZoneModalProps {
  descriptor?: WorktreeDescriptor | undefined;
  sshConfig?: SshConfig | undefined;
  messages?: readonly CodingZoneMessage[] | undefined;
  connection?: ConnectionState | undefined;
  onlineCount?: number | undefined;
  allFiles?: readonly string[] | undefined;
  diffFiles?: readonly DiffFile[] | undefined;
  diffRevision?: number | undefined;
  /** Unique per webview; echo suppression uses this id. */
  windowId?: string | undefined;
  /** Header label; popout uses the dedicated 'Coding Zone — Popout' copy. */
  title?: string | undefined;
  /** Called with the current shared snapshot when the popout affordance is used. */
  onPopout?: ((state: CodingZoneSharedState) => void) | undefined;
  onSendMessage?: ((text: string) => void) | undefined;
  onClose: () => void;
  renderDiffPanel?: ((args: {
    filePath: string;
    hunkStates: Readonly<Record<string, CodingZoneHunkState>>;
    setHunkState: (key: string, state: CodingZoneHunkState) => void;
  }) => React.ReactNode) | undefined;
}

interface CodingTab {
  id: string;
  filePath: string;
  kind: 'code' | 'diff';
}

const OVERVIEW_TAB_ID = '__overview__';
const DEFAULT_WINDOW_ID = `coding-zone-main-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random()}`;

function isTabList(value: unknown): value is CodingTab[] {
  return Array.isArray(value) && value.every((tab) => tab && typeof tab.id === 'string'
    && typeof tab.filePath === 'string' && (tab.kind === 'code' || tab.kind === 'diff'));
}

function isHunkState(value: unknown): value is CodingZoneHunkState {
  return value === 'pending' || value === 'accepted' || value === 'rejected';
}

function isHunkStates(value: unknown): value is Record<string, CodingZoneHunkState> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.values(value as Record<string, unknown>).every(isHunkState);
}

function isSharedMessage(value: unknown): value is CodingZoneSharedMessage {
  const item = value as Partial<CodingZoneSharedMessage> | null;
  return !!item && typeof item === 'object' && typeof item.id === 'string'
    && typeof item.author === 'string' && typeof item.time === 'string' && typeof item.text === 'string';
}

export const CodingZoneModal: React.FC<CodingZoneModalProps> = ({
  descriptor,
  sshConfig,
  messages = [],
  connection = 'connecting',
  onlineCount = 1,
  allFiles = [],
  diffFiles = [],
  diffRevision = 0,
  windowId = DEFAULT_WINDOW_ID,
  title = 'Agent Developer Workbench',
  onPopout,
  onSendMessage,
  onClose,
  renderDiffPanel,
}) => {
  const [perspective, setPerspective] = useState<'code' | 'chat'>('code');
  const [tabs, setTabs] = useState<CodingTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>(OVERVIEW_TAB_ID);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [initialLine, setInitialLine] = useState<number | undefined>(undefined);
  const [hunkStates, setHunkStates] = useState<Record<string, CodingZoneHunkState>>({});
  const [treeScope, setTreeScope] = useState<'diff' | 'all'>('diff');
  const [treeQuery, setTreeQuery] = useState('');
  const [remoteMessages, setRemoteMessages] = useState<CodingZoneSharedMessage[]>([]);
  const [remoteActivity, setRemoteActivity] = useState<CodingZoneSharedActivity[]>([]);
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
  );
  const liveActivity = useCodingZoneActivity();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const onSendRef = useRef(onSendMessage);
  onSendRef.current = onSendMessage;
  // WR-04: the dual transport (BroadcastChannel + Tauri emitTo) can re-deliver a chat event.
  // Key sends by message id so `runTurn` fires at most once per message in this window.
  const sentMessageIds = useRef<Set<string>>(new Set());

  const [environment, setEnvironment] = useState({
    descriptor, sshConfig, allFiles: [...allFiles], diffFiles: [...diffFiles], diffRevision, connection, onlineCount,
  });
  useEffect(() => {
    setEnvironment((current) => ({
      ...current, descriptor, sshConfig, allFiles: [...allFiles], diffFiles: [...diffFiles], diffRevision, connection, onlineCount,
    }));
  }, [descriptor, sshConfig, allFiles, diffFiles, diffRevision, connection, onlineCount]);

  const allMessages = useMemo(() => {
    const seen = new Set<string>();
    return [...messages.map((m) => ({
      id: m.id, author: m.author, time: m.time, text: m.text, kind: m.kind,
    })), ...remoteMessages].filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }, [messages, remoteMessages]);

  const activity = useMemo(() => [...liveActivity, ...remoteActivity], [liveActivity, remoteActivity]);

  const snapshot = useCallback((): CodingZoneSharedState => ({
    tabs, activeTabId, activeFile, initialLine, hunkStates, treeScope, treeQuery,
    messages: allMessages, activity, ...environment,
  }), [tabs, activeTabId, activeFile, initialLine, hunkStates, treeScope, treeQuery, allMessages, activity, environment]);

  const onState = useCallback((event: CodingZoneSyncPayload) => {
    switch (event.kind) {
      case 'full': {
        const state = event.payload as Partial<CodingZoneSharedState> | undefined;
        if (!state || typeof state !== 'object') return;
        // WR-06: a malformed descriptor/diff/connection must reject the WHOLE event before
        // any field reaches state (and ultimately a write verb or the remote viewer).
        if (state.descriptor !== undefined && !isWorktreeDescriptor(state.descriptor)) return;
        if (state.diffFiles !== undefined
          && (!Array.isArray(state.diffFiles) || !state.diffFiles.every(isDiffFileGuard))) return;
        if (state.connection !== undefined && !isConnectionState(state.connection)) return;
        if (isTabList(state.tabs)) setTabs(state.tabs);
        if (typeof state.activeTabId === 'string') setActiveTabId(state.activeTabId);
        if (typeof state.activeFile === 'string' || state.activeFile === null) setActiveFile(state.activeFile);
        if (typeof state.initialLine === 'number' || state.initialLine === undefined) setInitialLine(state.initialLine);
        if (isHunkStates(state.hunkStates)) setHunkStates(state.hunkStates);
        if (state.treeScope === 'diff' || state.treeScope === 'all') setTreeScope(state.treeScope);
        if (typeof state.treeQuery === 'string') setTreeQuery(state.treeQuery);
        if (Array.isArray(state.messages) && state.messages.every(isSharedMessage)) setRemoteMessages(state.messages);
        if (Array.isArray(state.activity)) setRemoteActivity(state.activity as CodingZoneSharedActivity[]);
        setEnvironment((current) => ({
          descriptor: state.descriptor ?? current.descriptor,
          sshConfig: state.sshConfig ?? current.sshConfig,
          allFiles: Array.isArray(state.allFiles) ? state.allFiles : current.allFiles,
          diffFiles: Array.isArray(state.diffFiles) ? state.diffFiles : current.diffFiles,
          diffRevision: typeof state.diffRevision === 'number' ? state.diffRevision : current.diffRevision,
          connection: state.connection ?? current.connection,
          onlineCount: typeof state.onlineCount === 'number' ? state.onlineCount : current.onlineCount,
        }));
        return;
      }
      case 'tabs':
        if (isTabList(event.payload)) setTabs(event.payload);
        return;
      case 'activeFile': {
        const value = event.payload;
        if (typeof value === 'string' || value === null) setActiveFile(value);
        if (typeof value === 'string') setActiveTabId(`diff:${value}`);
        return;
      }
      case 'hunk': {
        const item = event.payload as { key?: unknown; state?: unknown } | undefined;
        if (item && typeof item.key === 'string' && isHunkState(item.state)) {
          setHunkStates((current) => ({ ...current, [item.key as string]: item.state as CodingZoneHunkState }));
        }
        return;
      }
      case 'chat': {
        const item = event.payload as { message?: unknown; intent?: unknown } | undefined;
        if (!item || !isSharedMessage(item.message)) return;
        const message = item.message;
        setRemoteMessages((current) => current.some((m) => m.id === message.id) ? current : [...current, message]);
        if (item.intent === 'send' && !sentMessageIds.current.has(message.id)) {
          sentMessageIds.current.add(message.id);
          onSendRef.current?.(message.text);
        }
        return;
      }
      case 'activity':
        if (Array.isArray(event.payload)) setRemoteActivity(event.payload as CodingZoneSharedActivity[]);
        return;
      default:
        return;
    }
  }, []);

  const { publish } = useCodingZoneSync(windowId, onState, snapshot);

  useEffect(() => {
    const latest = liveActivity.at(-1);
    if (latest) publish('activity', [latest]);
  }, [liveActivity, publish]);

  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const changedPaths = useMemo(() => new Set(environment.diffFiles.map((file) => file.newPath)), [environment.diffFiles]);

  const openFile = useCallback((filePath: string) => {
    const diff = changedPaths.has(filePath);
    const id = `${diff ? 'diff' : 'code'}:${filePath}`;
    const nextTabs: CodingTab[] = tabs.some((tab) => tab.id === id)
      ? tabs
      : [...tabs, { id, filePath, kind: diff ? 'diff' : 'code' }];
    setActiveFile(filePath);
    setInitialLine(undefined);
    setTabs(nextTabs);
    setActiveTabId(id);
    publish('full', {
      tabs: nextTabs, activeTabId: id, activeFile: filePath, initialLine: undefined,
      hunkStates, treeScope, treeQuery, messages: allMessages, activity, ...environment,
    });
  }, [changedPaths, tabs, hunkStates, treeScope, treeQuery, allMessages, activity, environment, publish]);

  const closeTab = useCallback((id: string) => {
    const index = tabs.findIndex((tab) => tab.id === id);
    if (index < 0) return;
    const next = tabs.filter((tab) => tab.id !== id);
    const nextActive = activeTabId === id
      ? (next[index] ?? next[index - 1])?.id ?? OVERVIEW_TAB_ID
      : activeTabId;
    const nextActiveFile = next.find((tab) => tab.id === nextActive)?.filePath ?? null;
    setTabs(next);
    setActiveTabId(nextActive);
    setActiveFile(nextActiveFile);
    // WR-03: tab + active-file state is shared with the popout; publish, never rely on an
    // unrelated event to republish later. Computed outside the state updater (no publish in
    // a React updater).
    publish('tabs', next);
    publish('activeFile', nextActiveFile);
  }, [tabs, activeTabId, publish]);

  const reorderTab = useCallback((fromId: string, toId: string) => {
    if (fromId === toId || fromId === OVERVIEW_TAB_ID || toId === OVERVIEW_TAB_ID) return;
    const from = tabs.findIndex((tab) => tab.id === fromId);
    const to = tabs.findIndex((tab) => tab.id === toId);
    if (from < 0 || to < 0) return;
    const next = [...tabs];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    setTabs(next);
    publish('tabs', next);
  }, [tabs, publish]);

  const setHunkState = useCallback((key: string, state: CodingZoneHunkState) => {
    setHunkStates((previous) => ({ ...previous, [key]: state }));
    publish('hunk', { key, state });
  }, [publish]);

  const sendMessage = useCallback((text: string) => {
    const message: CodingZoneSharedMessage = {
      id: `cz-${windowId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      author: 'Bạn', time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }), text, kind: 'chat',
    };
    setRemoteMessages((current) => [...current, message]);
    // Mark before the local send so a re-delivered 'send' event for this id cannot run
    // `runTurn` a second time in this window (WR-04).
    sentMessageIds.current.add(message.id);
    publish('chat', { message, intent: 'send' });
    onSendRef.current?.(text);
  }, [publish, windowId]);

  const activeTab = tabs.find((tab) => tab.id === activeTabId);

  const renderCenter = () => {
    if (activeTabId === OVERVIEW_TAB_ID) {
      return (
        <div className="cz-overview">
          <h2>Agent Developer Workbench</h2>
          <p>Worktree SSH riêng của Agent Developer. Mọi thay đổi chỉ nằm trong worktree, không đụng nhánh hiện tại.</p>
          <div className="cz-ov-grid">
            <div className="cz-ov-card">
              <div className="cz-ov-name">{environment.descriptor?.remoteWorktreePath ?? 'Chưa có worktree'}</div>
              <div className="cz-ov-meta"><span>SSH · {environment.descriptor?.sshConfigId ?? '—'}</span><span>{environment.descriptor?.branch ?? '—'}</span></div>
            </div>
            <div className="cz-ov-card">
              <div className="cz-ov-name">{changedPaths.size} file có thay đổi</div>
              <div className="cz-ov-meta"><span>{environment.allFiles.length} file trong cây</span></div>
            </div>
          </div>
          <div className="cz-ov-note">Chọn file trong cây worktree để mở tab. Review hunk chỉ áp dụng trong worktree của agent.</div>
        </div>
      );
    }
    if (!activeTab) return <div className="cz-center-empty">Chọn file trong cây worktree để mở tab.</div>;
    if (activeTab.kind === 'diff') {
      return renderDiffPanel?.({ filePath: activeTab.filePath, hunkStates, setHunkState }) ?? (
        <div className="cz-center-empty" data-testid="cz-diff-panel-slot">Bảng review hunk đang tải.</div>
      );
    }
    return (
      <RemoteFileViewer
        {...(environment.sshConfig ? { config: environment.sshConfig } : {})}
        repoPath={environment.descriptor?.remoteWorktreePath ?? ''}
        branch={environment.descriptor?.branch ?? ''}
        filePath={activeTab.filePath}
        {...(initialLine !== undefined ? { initialLine } : {})}
      />
    );
  };

  const connectionCopy = CONNECTION_COPY[environment.connection] ?? CONNECTION_COPY.connecting;
  const chip = connectionCopy.chip;
  const connectionDetail = connectionCopy.detail;

  return (
    <div className="cz-backdrop" data-testid="coding-zone-backdrop">
      <div
        className="cz-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid="coding-zone-modal"
        ref={dialogRef}
      >
        <div className="cz-modal-header">
          <span className="cz-modal-title">{title}</span>
          <span className="cz-header-divider" />
          <span className="cz-perspective-label">Góc nhìn</span>
          <div className="cz-segmented" role="group" aria-label="Góc nhìn Coding Zone">
            <button type="button" className={perspective === 'code' ? 'on' : ''} aria-pressed={perspective === 'code'} data-testid="cz-perspective-code" onClick={() => setPerspective('code')}>Coding zone</button>
            <button type="button" className={perspective === 'chat' ? 'on' : ''} aria-pressed={perspective === 'chat'} data-testid="cz-perspective-chat" onClick={() => setPerspective('chat')}>Team chat + agent activity</button>
          </div>
          <span className="cz-spacer" />
          <button type="button" className="cz-btn tiny" title="Đổi palette sáng/tối" data-testid="cz-theme-toggle" onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')}>Light / Dark</button>
          {onPopout ? <button type="button" className="cz-btn tiny" data-testid="cz-popout-button" onClick={() => onPopout(snapshot())}>Popout Coding Zone</button> : null}
          <button type="button" className="cz-icon-btn" title="Đóng Coding Zone" aria-label="Đóng Coding Zone" data-testid="cz-close" onClick={onClose}>×</button>
        </div>

        <div className={`cz-modal-body cz-perspective-${perspective}`} data-testid="cz-modal-body">
          <div className={`cz-pane cz-left-pane ${perspective === 'chat' ? 'cz-activity-pane' : ''}`}>
            {perspective === 'code' ? (
              <CodingZoneTree
                descriptor={environment.descriptor}
                files={environment.allFiles}
                diffFiles={environment.diffFiles}
                scope={treeScope}
                onScopeChange={setTreeScope}
                query={treeQuery}
                onQueryChange={setTreeQuery}
                activeFile={activeFile}
                onOpenFile={openFile}
              />
            ) : (
              <div className="cz-activity" data-testid="cz-activity-pane" data-active-file={activeFile ?? ''}>
                <div className="cz-active-file-card">
                  <div className="cz-active-file-label">File đang active (chia sẻ với Coding zone)</div>
                  <div className="cz-active-file-value">{activeFile ?? '—'}</div>
                </div>
                <div className="cz-act-head">Agent activity</div>
                {activity.length === 0 ? (
                  <p className="cz-activity-empty">Sự kiện agent sẽ xuất hiện ở đây khi phiên chạy.</p>
                ) : (
                  <div className="cz-activity-list" data-testid="cz-activity-list">
                    {activity.map((item) => (
                      <div key={item.id} className={`cz-activity-item cz-activity-${item.kind}`} data-testid="cz-activity-item">
                        <span className="cz-activity-time">{item.time}</span>
                        <span className="cz-activity-label">{item.label}</span>
                        <span className="cz-activity-text">{item.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="cz-pane cz-center-pane">
            {perspective === 'code' ? (
              <>
                <div className="cz-tabbar" role="tablist" aria-label="File đang mở" data-testid="cz-tabbar">
                  <div
                    className={`cz-tab${activeTabId === OVERVIEW_TAB_ID ? ' active' : ''}`}
                    role="tab"
                    aria-selected={activeTabId === OVERVIEW_TAB_ID}
                    tabIndex={0}
                    data-testid="cz-tab-overview"
                    onClick={() => setActiveTabId(OVERVIEW_TAB_ID)}
                    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setActiveTabId(OVERVIEW_TAB_ID); }}
                  >
                    <span className="cz-tab-pin">●</span><span className="cz-tab-title">Tổng quan</span>
                  </div>
                  {tabs.map((tab) => (
                    <div
                      key={tab.id}
                      className={`cz-tab${activeTabId === tab.id ? ' active' : ''}`}
                      role="tab"
                      aria-selected={activeTabId === tab.id}
                      tabIndex={0}
                      draggable
                      data-testid={`cz-tab-${tab.kind}`}
                      data-path={tab.filePath}
                      onClick={() => { setActiveTabId(tab.id); setActiveFile(tab.filePath); }}
                      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { setActiveTabId(tab.id); setActiveFile(tab.filePath); } }}
                      onDragStart={(event) => event.dataTransfer.setData('text/plain', tab.id)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => { event.preventDefault(); reorderTab(event.dataTransfer.getData('text/plain'), tab.id); }}
                    >
                      <span className={`cz-tab-icon${tab.kind === 'diff' ? ' diff' : ''}`}>{tab.kind === 'diff' ? 'Δ' : '◇'}</span>
                      <span className="cz-tab-title">{tab.filePath.split('/').pop() ?? tab.filePath}</span>
                      <button type="button" className="cz-tab-close" aria-label={`Đóng tab ${tab.filePath}`} data-testid={`cz-tab-close-${tab.kind}`} onClick={(event) => { event.stopPropagation(); closeTab(tab.id); }}>×</button>
                    </div>
                  ))}
                </div>
                <div className="cz-content" data-testid="cz-content">{renderCenter()}</div>
              </>
            ) : (
              <div className="cz-chat-perspective-center">
                <div className="cz-active-file-card">
                  <div className="cz-active-file-label">File đang active (chia sẻ với Coding zone)</div>
                  <div className="cz-active-file-value">{activeFile ?? '—'}</div>
                </div>
                <div className="cz-chat-perspective-hint">Chuyển về Coding zone để xem tab, cây worktree và review hunk.</div>
              </div>
            )}
          </div>

          <div className="cz-pane cz-chat-pane">
            <CodingZoneChatStrip
              messages={allMessages}
              connection={environment.connection}
              onlineCount={environment.onlineCount}
              onSend={sendMessage}
              wide={perspective === 'chat'}
              {...(onPopout ? { onPopout: () => onPopout(snapshot()) } : {})}
              placeholder={perspective === 'chat' ? 'Gõ tin nhắn... (cùng transcript với Coding zone)' : undefined}
            />
          </div>
        </div>

        <div className="cz-modal-footer" data-testid="cz-footer">
          <span><i className={`cz-dot cz-dot-${environment.connection}`} /> {chip}</span>
          {connectionDetail ? <span data-testid="cz-connection-detail">{connectionDetail}</span> : null}
          <span>Nhánh: {environment.descriptor?.branch ?? '—'}</span>
          <span className="cz-spacer" />
          <span>Worktree-local · không merge vào nhánh hiện tại</span>
        </div>
      </div>
    </div>
  );
};

export default CodingZoneModal;
