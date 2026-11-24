import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Splitter, Empty, Drawer, Descriptions, Tag, Button, Space, Card, useAntdToken, useMessage, DescriptionsItem, EmptyImageSimple, Paragraph, SplitterPanel, Text, Title } from '../components/ui';
import { HistoryOutlined, CopyOutlined, UserOutlined, RobotOutlined } from '../components/ui/icon';
import { AgentSessionList, getStatusBadge } from '../components/agents/AgentSessionList';
import { AgentTerminalLog } from '../components/agents/AgentTerminalLog';
import { AgentDiffReviewer } from '../components/agents/AgentDiffReviewer';
import { ShellPermissionModal } from '../components/agents/ShellPermissionModal';
import { useGhostDevSessions } from '../hooks/useGhostDevSessions';
import { useGhostDevStream } from '../hooks/useGhostDevStream';
import { useGhostDevDiff } from '../hooks/useGhostDevDiff';
import { announceToScreenReader } from '../components/common/AriaLiveRegion';
import { agentSessionHistoryRepo } from '../services/agents/agentSessionHistoryRepo';
import { agentLogStore } from '../services/agents/agentLogStore';
import type { AgentSession, GhostDevSessionAuditRecord } from '../types/agent';

export const AgentControlView: React.FC = () => {
  const { token } = useAntdToken();
  const message = useMessage();
  const {
    sessions,
    activeSessionId,
    setActiveSessionId,
    activeSession,
    stoppingTaskIds,
    stopSession,
  } = useGhostDevSessions();

  // Audit history state
  const [auditHistory, setAuditHistory] = useState<GhostDevSessionAuditRecord[]>([]);
  const [selectedAuditRecord, setSelectedAuditRecord] = useState<GhostDevSessionAuditRecord | null>(null);
  const [auditDrawerOpen, setAuditDrawerOpen] = useState<boolean>(false);

  const refreshAuditHistory = useCallback(() => {
    setAuditHistory(agentSessionHistoryRepo.listSessionHistory());
  }, []);

  useEffect(() => {
    refreshAuditHistory();
  }, [refreshAuditHistory, sessions]);

  const handleSelectAuditSession = (record: GhostDevSessionAuditRecord) => {
    setSelectedAuditRecord(record);
    setAuditDrawerOpen(true);
  };

  const handleDeleteAuditSession = (sessionIdOrTaskId: string) => {
    agentSessionHistoryRepo.deleteSession(sessionIdOrTaskId);
    agentLogStore.deleteLogs(sessionIdOrTaskId);
    refreshAuditHistory();
    if (
      selectedAuditRecord?.sessionId === sessionIdOrTaskId ||
      selectedAuditRecord?.taskId === sessionIdOrTaskId
    ) {
      setSelectedAuditRecord(null);
      setAuditDrawerOpen(false);
    }
  };

  const handleClearAllAudit = () => {
    agentSessionHistoryRepo.clearAllHistory();
    refreshAuditHistory();
    setSelectedAuditRecord(null);
    setAuditDrawerOpen(false);
  };

  // Terminal stream for active session
  const {
    logs,
    sending,
    sendChatMessage,
    clearLogs,
    isCleared,
  } = useGhostDevStream(activeSessionId);

  // Worktree diff for active session
  const {
    diffFiles,
    allWorktreeFiles,
    selectedFileContent,
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
    acceptFile,
    acceptHunk,
    acceptLine,
    revertAll,
    revertFile,
    revertHunk,
  } = useGhostDevDiff(activeSession ? activeSession.worktreePath : null);

  const [mentionedFilePath, setMentionedFilePath] = useState<string | null>(null);

  const handleStopSession = useCallback(
    async (taskId: string) => {
      await stopSession(taskId);
      if (activeSessionId === taskId) {
        setActiveSessionId(null);
      }
    },
    [stopSession, activeSessionId, setActiveSessionId]
  );

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
          boxShadow: token.boxShadowSecondary,
          borderRadius: 'var(--radius-control)',
          overflow: 'hidden',
          backgroundColor: token.colorBgContainer,
        }}
      >
        {/* Panel 1: Sessions List & History (Left, 22%, min 220px) */}
        <SplitterPanel defaultSize="22%" min="220px">
          <AgentSessionList
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={setActiveSessionId}
            onStopSession={handleStopSession}
            stoppingTaskIds={stoppingTaskIds}
            auditHistory={auditHistory}
            onSelectAuditSession={handleSelectAuditSession}
            onDeleteAuditSession={handleDeleteAuditSession}
            onClearAllAuditHistory={handleClearAllAudit}
          />
        </SplitterPanel>

        {/* Panel 2: Terminal Stream Log (Center, 45%, min 400px) */}
        <SplitterPanel defaultSize="45%" min="400px">
          {activeSession ? (
            <AgentTerminalLog
              logs={logs}
              sending={sending}
              isRunning={activeSession?.status === 'running'}
              isCleared={isCleared}
              startedAt={activeSession.startedAt}
              finishedAt={activeSession.finishedAt}
              onSendFeedback={sendChatMessage}
              onClearLogs={clearLogs}
              taskTitle={activeSession.taskTitle}
              activeWorkers={activeSession.activeWorkers}
              repoPath={activeSession?.worktreePath}
              mentionedFilePath={mentionedFilePath}
              onClearMentionedFile={() => setMentionedFilePath(null)}
            />
          ) : (
            <div
              style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#1e1e1e',
                color: 'var(--fg-muted)',
              }}
            >
              <Empty
                image={EmptyImageSimple}
                description={
                  <span style={{ color: 'var(--fg-muted)' }}>
                    Chưa có phiên Ghost Dev nào được chọn
                  </span>
                }
              />
            </div>
          )}
        </SplitterPanel>

        {/* Panel 3: Live Git Diff Reviewer (Right, 33%, min 320px) */}
        <SplitterPanel defaultSize="33%" min="320px">
          <AgentDiffReviewer
            diffFiles={diffFiles}
            allWorktreeFiles={allWorktreeFiles}
            selectedFileContent={selectedFileContent}
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
            onAcceptFile={acceptFile}
            onAcceptHunk={acceptHunk}
            onAcceptLine={acceptLine}
            onRevertAll={revertAll}
            onRevertFile={revertFile}
            onRevertHunk={revertHunk}
            onSendFeedback={sendChatMessage}
            onMentionFile={(filePath) => setMentionedFilePath(filePath)}
            worktreePath={activeSession ? activeSession.worktreePath : null}
          />
        </SplitterPanel>
      </Splitter>

      {/* Global Shell Permission Modal interceptor */}
      <ShellPermissionModal />

      {/* Audit Record Details Drawer */}
      <Drawer
        title={
          <Space>
            <HistoryOutlined style={{ color: 'var(--accent)' }} />
            <span>Chi tiết Audit: {selectedAuditRecord?.taskTitle}</span>
          </Space>
        }
        width={600}
        open={auditDrawerOpen}
        onClose={() => setAuditDrawerOpen(false)}
      >
        {selectedAuditRecord && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-16)' }}>
            {/* Session Summary Metadata */}
            <Descriptions size="small" bordered column={1}>
              <DescriptionsItem label="Trạng thái">
                {getStatusBadge(selectedAuditRecord.status)}
              </DescriptionsItem>
              <DescriptionsItem label="Tác vụ">
                {selectedAuditRecord.taskTitle} (ID: {selectedAuditRecord.taskId})
              </DescriptionsItem>
              <DescriptionsItem label="Nhánh Git">
                <code>{selectedAuditRecord.branchName}</code>
              </DescriptionsItem>
              <DescriptionsItem label="Thư mục Repo">
                <code>{selectedAuditRecord.repoPath}</code>
              </DescriptionsItem>
              <DescriptionsItem label="Models">
                <Space>
                  <Tag color="#722ed1">Master: {selectedAuditRecord.masterModel}</Tag>
                  <Tag color="var(--accent)">Worker: {selectedAuditRecord.workerModel}</Tag>
                </Space>
              </DescriptionsItem>
              <DescriptionsItem label="Thời gian bắt đầu">
                {new Date(selectedAuditRecord.startedAt).toLocaleString()}
              </DescriptionsItem>
              <DescriptionsItem label="Thời gian kết thúc">
                {selectedAuditRecord.finishedAt
                  ? new Date(selectedAuditRecord.finishedAt).toLocaleString()
                  : 'Đang chạy / Chưa kết thúc'}
              </DescriptionsItem>
              {selectedAuditRecord.error && (
                <DescriptionsItem label="Lỗi ghi nhận">
                  <Text type="danger">{selectedAuditRecord.error}</Text>
                </DescriptionsItem>
              )}
            </Descriptions>

            {/* Master Initial Prompt */}
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <Title level={5} style={{ margin: 0 }}>
                  Master Prompt ban đầu
                </Title>
                <Button
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => {
                    void navigator.clipboard?.writeText(selectedAuditRecord.initialPrompt);
                    message.success('Đã sao chép prompt!');
                  }}
                >
                  Sao chép
                </Button>
              </div>
              <pre
                style={{
                  backgroundColor: 'var(--bg-elev)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-control)',
                  padding: 12,
                  fontSize: 'var(--font-size-small)',
                  whiteSpace: 'pre-wrap',
                  maxHeight: 250,
                  overflowY: 'auto',
                  fontFamily: 'monospace',
                }}
              >
                {selectedAuditRecord.initialPrompt || '(Không có prompt lưu trữ)'}
              </pre>
            </div>

            {/* User Feedback History */}
            <div>
              <Title level={5} style={{ marginBottom: 8 }}>
                Lịch sử phản hồi từ người dùng (
                {selectedAuditRecord.userFeedbackHistory?.length || 0})
              </Title>
              {selectedAuditRecord.userFeedbackHistory &&
              selectedAuditRecord.userFeedbackHistory.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-12)' }}>
                  {selectedAuditRecord.userFeedbackHistory.map((fb, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--gap-6)',
                        padding: 10,
                        backgroundColor: 'var(--bg-elev)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-control)',
                      }}
                    >
                      {/* User Feedback Bubble */}
                      <Card
                        size="small"
                        style={{ backgroundColor: 'rgba(34, 211, 238, 0.14)', borderColor: 'var(--border)' }}
                        styles={{ body: { padding: '8px 12px' } }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: 4,
                          }}
                        >
                          <Space size={4}>
                            <UserOutlined style={{ color: 'var(--info-fg)', fontSize: 'var(--font-size-small)' }} />
                            <Text strong style={{ fontSize: 'var(--font-size-small)', color: 'var(--info-fg)' }}>
                              Chỉ đạo #{idx + 1}
                            </Text>
                          </Space>
                          <Text type="secondary" style={{ fontSize: 'var(--font-size-xs)' }}>
                            {new Date(fb.timestamp).toLocaleTimeString()}
                          </Text>
                        </div>
                        <Paragraph
                          style={{ margin: 0, fontSize: 13, whiteSpace: 'pre-wrap' }}
                        >
                          {fb.feedback}
                        </Paragraph>
                      </Card>

                      {/* AI Response Bubble */}
                      {fb.aiResponse ? (
                        <Card
                          size="small"
                          style={{
                            backgroundColor: 'var(--accent-soft)',
                            borderColor: 'var(--border)',
                            marginLeft: 16,
                          }}
                          styles={{ body: { padding: '8px 12px' } }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              marginBottom: 4,
                            }}
                          >
                            <Space size={4}>
                              <RobotOutlined style={{ color: 'var(--accent)', fontSize: 'var(--font-size-small)' }} />
                              <Text strong style={{ fontSize: 'var(--font-size-small)', color: 'var(--accent)' }}>
                                Phản hồi từ AI
                              </Text>
                            </Space>
                          </div>
                          <Paragraph
                            style={{ margin: 0, fontSize: 13, whiteSpace: 'pre-wrap', color: 'var(--fg)' }}
                          >
                            {fb.aiResponse}
                          </Paragraph>
                        </Card>
                      ) : (
                        <div style={{ marginLeft: 20, fontSize: 'var(--font-size-xs)', color: 'var(--fg-secondary)', fontStyle: 'italic' }}>
                          (AI đã nhận chỉ đạo và thực hiện trực tiếp vào mã nguồn)
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <Empty
                  image={EmptyImageSimple}
                  description="Chưa có phản hồi nào trong phiên này"
                />
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
