import React, { useEffect, useRef } from 'react';
import { Splitter, Empty, theme } from 'antd';
import { AgentSessionList } from '../components/agents/AgentSessionList';
import { AgentTerminalLog } from '../components/agents/AgentTerminalLog';
import { AgentDiffReviewer } from '../components/agents/AgentDiffReviewer';
import { ShellPermissionModal } from '../components/agents/ShellPermissionModal';
import { useGhostDevSessions } from '../hooks/useGhostDevSessions';
import { useGhostDevStream } from '../hooks/useGhostDevStream';
import { useGhostDevDiff } from '../hooks/useGhostDevDiff';
import { announceToScreenReader } from '../components/common/AriaLiveRegion';
import type { AgentSession } from '../types/agent';

export const AgentControlView: React.FC = () => {
  const { token } = theme.useToken();
  const {
    sessions,
    activeSessionId,
    setActiveSessionId,
    activeSession,
    stopSession,
  } = useGhostDevSessions();

  // Terminal stream for active session
  const {
    logs,
    sending,
    sendChatMessage,
    clearLogs,
  } = useGhostDevStream(activeSessionId);

  // Worktree diff for active session
  const {
    diffFiles,
    totalAdditions,
    totalDeletions,
    viewMode,
    setViewMode,
    selectedFilePath,
    setSelectedFilePath,
    selectedFile,
    loading: diffLoading,
    refreshDiff,
    acceptAll,
    revertAll,
    revertFile,
  } = useGhostDevDiff(activeSession ? activeSession.worktreePath : null);

  // Screen reader announcements on session status changes
  const prevStatusesRef = useRef<Record<string, string>>({});
  useEffect(() => {
    sessions.forEach((s: AgentSession) => {
      const prev = prevStatusesRef.current[s.taskId];
      if (prev && prev !== s.status) {
        if (s.status === 'done') {
          announceToScreenReader(`Tác vụ ${s.taskTitle} đã hoàn thành.`);
        } else if (s.status === 'awaiting_approval') {
          announceToScreenReader(`Tác vụ ${s.taskTitle} đang chờ bạn phê duyệt lệnh shell.`);
        } else if (s.status === 'error') {
          announceToScreenReader(`Tác vụ ${s.taskTitle} đã dừng do lỗi.`);
        }
      }
      prevStatusesRef.current[s.taskId] = s.status;
    });
  }, [sessions]);

  return (
    <div
      style={{
        height: 'calc(100vh - 100px)',
        padding: '12px 16px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Splitter
        style={{
          height: '100%',
          boxShadow: token.boxShadowTertiary,
          backgroundColor: token.colorBgContainer,
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        {/* Panel 1: Session List (Left, 22%, min 240px, max 360px) */}
        <Splitter.Panel defaultSize="22%" min="240px" max="360px">
          <AgentSessionList
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={setActiveSessionId}
            onStopSession={stopSession}
          />
        </Splitter.Panel>

        {/* Panel 2: Terminal Stream Log (Center, 45%, min 400px) */}
        <Splitter.Panel defaultSize="45%" min="400px">
          {activeSession ? (
            <AgentTerminalLog
              logs={logs}
              sending={sending}
              onSendFeedback={sendChatMessage}
              onClearLogs={clearLogs}
              taskTitle={activeSession.taskTitle}
            />
          ) : (
            <div
              style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#1e1e1e',
                color: '#888',
              }}
            >
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <span style={{ color: '#888' }}>
                    Chưa có phiên Ghost Dev nào được chọn
                  </span>
                }
              />
            </div>
          )}
        </Splitter.Panel>

        {/* Panel 3: Live Git Diff Reviewer (Right, 33%, min 320px) */}
        <Splitter.Panel defaultSize="33%" min="320px">
          <AgentDiffReviewer
            diffFiles={diffFiles}
            totalAdditions={totalAdditions}
            totalDeletions={totalDeletions}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            selectedFilePath={selectedFilePath}
            onSelectFilePath={setSelectedFilePath}
            selectedFile={selectedFile}
            loading={diffLoading}
            onRefreshDiff={refreshDiff}
            onAcceptAll={acceptAll}
            onRevertAll={revertAll}
            onRevertFile={revertFile}
            onSendFeedback={sendChatMessage}
          />
        </Splitter.Panel>
      </Splitter>

      {/* Global Shell Permission Modal interceptor */}
      <ShellPermissionModal />
    </div>
  );
};
