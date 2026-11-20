import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SshConfig } from '../../types/ssh';
import type { DiffFile } from '../../types/agent';
import type { ConnectionState, WorktreeDescriptor } from '../../types/codingZone';
import { RemoteFileViewer } from '../../workbench/editor/RemoteFileViewer';
import { CodingZoneTree } from './CodingZoneTree';
import { CodingZoneChatStrip, type CodingZoneMessage } from './CodingZoneChatStrip';
import '../../styles/coding-zone.css';

/** Phase 48 D-03/D-04: fullscreen Coding Zone with two perspectives over one state object. */
export interface CodingZoneModalProps {
  descriptor: WorktreeDescriptor | undefined;
  sshConfig: SshConfig | undefined;
  messages: readonly CodingZoneMessage[];
  connection: ConnectionState;
  onlineCount?: number | undefined;
  allFiles?: readonly string[] | undefined;
  diffFiles?: readonly DiffFile[] | undefined;
  onClose: () => void;
  onSendMessage: (text: string) => void;
  onPopout?: (() => void) | undefined;
  /** Plan 02 Task 2 supplies the real hunk panel; absent for the shell-only render. */
  renderDiffPanel?: ((args: {
    filePath: string;
    hunkStates: Readonly<Record<string, 'pending' | 'accepted' | 'rejected'>>;
    setHunkState: (key: string, state: 'pending' | 'accepted' | 'rejected') => void;
  }) => React.ReactNode) | undefined;
}

interface CodingTab {
  id: string;
  filePath: string;
  kind: 'code' | 'diff';
}

const OVERVIEW_TAB_ID = '__overview__';

export const CodingZoneModal: React.FC<CodingZoneModalProps> = ({
  descriptor,
  sshConfig,
  messages,
  connection,
  onlineCount = 1,
  allFiles = [],
  diffFiles = [],
  onClose,
  onSendMessage,
  onPopout,
  renderDiffPanel,
}) => {
  // D-04: one state object backs both perspectives; switching perspective never remounts it.
  const [perspective, setPerspective] = useState<'code' | 'chat'>('code');
  const [tabs, setTabs] = useState<CodingTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>(OVERVIEW_TAB_ID);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [initialLine, setInitialLine] = useState<number | undefined>(undefined);
  const [hunkStates, setHunkStates] = useState<Record<string, 'pending' | 'accepted' | 'rejected'>>({});
  const setHunkState = useCallback((key: string, state: 'pending' | 'accepted' | 'rejected') => {
    setHunkStates((previous) => ({ ...previous, [key]: state }));
  }, []);
  const [treeScope, setTreeScope] = useState<'diff' | 'all'>('diff');
  const [treeQuery, setTreeQuery] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
  );
  const dialogRef = useRef<HTMLDivElement | null>(null);

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

  const changedPaths = useMemo(() => new Set(diffFiles.map((file) => file.newPath)), [diffFiles]);
  const openFile = useCallback((filePath: string) => {
    setActiveFile(filePath);
    setInitialLine(undefined);
    const diff = changedPaths.has(filePath);
    const id = `${diff ? 'diff' : 'code'}:${filePath}`;
    setTabs((previous) => previous.some((tab) => tab.id === id)
      ? previous
      : [...previous, { id, filePath, kind: diff ? 'diff' : 'code' }]);
    setActiveTabId(id);
  }, [changedPaths]);

  const closeTab = useCallback((id: string) => {
    setTabs((previous) => {
      const index = previous.findIndex((tab) => tab.id === id);
      if (index < 0) return previous;
      const next = previous.filter((tab) => tab.id !== id);
      setActiveTabId((current) => {
        if (current !== id) return current;
        const neighbor = next[index] ?? next[index - 1];
        return neighbor?.id ?? OVERVIEW_TAB_ID;
      });
      return next;
    });
  }, []);

  const reorderTab = useCallback((fromId: string, toId: string) => {
    if (fromId === toId || fromId === OVERVIEW_TAB_ID || toId === OVERVIEW_TAB_ID) return;
    setTabs((previous) => {
      const from = previous.findIndex((tab) => tab.id === fromId);
      const to = previous.findIndex((tab) => tab.id === toId);
      if (from < 0 || to < 0) return previous;
      const next = [...previous];
      const [moved] = next.splice(from, 1);
      if (moved) next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const activeTab = tabs.find((tab) => tab.id === activeTabId);

  const renderCenter = () => {
    if (activeTabId === OVERVIEW_TAB_ID) {
      return (
        <div className="cz-overview">
          <h2>Agent Developer Workbench</h2>
          <p>Worktree SSH riêng của Agent Developer. Mọi thay đổi chỉ nằm trong worktree, không đụng nhánh hiện tại.</p>
          <div className="cz-ov-grid">
            <div className="cz-ov-card">
              <div className="cz-ov-name">{descriptor?.remoteWorktreePath ?? 'Chưa có worktree'}</div>
              <div className="cz-ov-meta"><span>SSH · {descriptor?.sshConfigId ?? '—'}</span><span>{descriptor?.branch ?? '—'}</span></div>
            </div>
            <div className="cz-ov-card">
              <div className="cz-ov-name">{changedPaths.size} file có thay đổi</div>
              <div className="cz-ov-meta"><span>{allFiles.length} file trong cây</span></div>
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
        {...(sshConfig ? { config: sshConfig } : {})}
        repoPath={descriptor?.remoteWorktreePath ?? ''}
        branch={descriptor?.branch ?? ''}
        filePath={activeTab.filePath}
        {...(initialLine !== undefined ? { initialLine } : {})}
      />
    );
  };

  return (
    <div className="cz-backdrop" data-testid="coding-zone-backdrop">
      <div
        className="cz-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Agent Developer Workbench"
        data-testid="coding-zone-modal"
        ref={dialogRef}
      >
        <div className="cz-modal-header">
          <span className="cz-modal-title">Agent Developer Workbench</span>
          <span className="cz-header-divider" />
          <span className="cz-perspective-label">Góc nhìn</span>
          <div className="cz-segmented" role="group" aria-label="Góc nhìn Coding Zone">
            <button
              type="button"
              className={perspective === 'code' ? 'on' : ''}
              aria-pressed={perspective === 'code'}
              data-testid="cz-perspective-code"
              onClick={() => setPerspective('code')}
            >Coding zone</button>
            <button
              type="button"
              className={perspective === 'chat' ? 'on' : ''}
              aria-pressed={perspective === 'chat'}
              data-testid="cz-perspective-chat"
              onClick={() => setPerspective('chat')}
            >Team chat + agent activity</button>
          </div>
          <span className="cz-spacer" />
          <button
            type="button"
            className="cz-btn tiny"
            title="Đổi palette sáng/tối"
            data-testid="cz-theme-toggle"
            onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')}
          >Light / Dark</button>
          {onPopout ? (
            <button type="button" className="cz-btn tiny" data-testid="cz-popout-button" onClick={onPopout}>Popout Coding Zone</button>
          ) : null}
          <button type="button" className="cz-icon-btn" title="Đóng Coding Zone" aria-label="Đóng Coding Zone" data-testid="cz-close" onClick={onClose}>×</button>
        </div>

        <div className={`cz-modal-body cz-perspective-${perspective}`} data-testid="cz-modal-body">
          <div className={`cz-pane cz-left-pane ${perspective === 'chat' ? 'cz-activity-pane' : ''}`}>
            {perspective === 'code' ? (
              <CodingZoneTree
                descriptor={descriptor}
                files={allFiles}
                diffFiles={diffFiles}
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
                <p className="cz-activity-empty">Sự kiện agent sẽ xuất hiện ở đây khi phiên chạy.</p>
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
                      <button
                        type="button"
                        className="cz-tab-close"
                        aria-label={`Đóng tab ${tab.filePath}`}
                        data-testid={`cz-tab-close-${tab.kind}`}
                        onClick={(event) => { event.stopPropagation(); closeTab(tab.id); }}
                      >×</button>
                    </div>
                  ))}
                </div>
                <div className="cz-content" data-testid="cz-content">
                  {renderCenter()}
                </div>
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
              messages={messages}
              connection={connection}
              onlineCount={onlineCount}
              onSend={onSendMessage}
              wide={perspective === 'chat'}
              onPopout={onPopout}
              placeholder={perspective === 'chat' ? 'Gõ tin nhắn... (cùng transcript với Coding zone)' : undefined}
            />
          </div>
        </div>

        <div className="cz-modal-footer" data-testid="cz-footer">
          <span><i className={`cz-dot cz-dot-${connection}`} /> {connection === 'connected' ? descriptor?.branch ?? 'Đồng bộ' : connection}</span>
          <span>Nhánh: {descriptor?.branch ?? '—'}</span>
          <span className="cz-spacer" />
          <span>Worktree-local · không merge vào nhánh hiện tại</span>
        </div>
      </div>
    </div>
  );
};

export default CodingZoneModal;
