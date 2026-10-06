import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Splitter,
  Empty,
  theme,
  Drawer,
  Descriptions,
  Tag,
  Typography,
  Button,
  Space,
  Card,
  message,
} from 'antd';
import { HistoryOutlined, CopyOutlined, UserOutlined, RobotOutlined } from '@ant-design/icons';
import { AgentSessionList, getStatusBadge } from '../components/agents/AgentSessionList';
import { AgentTerminalLog } from '../components/agents/AgentTerminalLog';
import { AgentDiffReviewer } from '../components/agents/AgentDiffReviewer';
import { ShellPermissionModal } from '../components/agents/ShellPermissionModal';
import { useGhostDevSessions } from '../hooks/useGhostDevSessions';
import { useGhostDevStream } from '../hooks/useGhostDevStream';
import { useGhostDevDiff } from '../hooks/useGhostDevDiff';
import { announceToScreenReader } from '../components/common/AriaLiveRegion';
import { agentSessionHistoryRepo } from '../services/agents/agentSessionHistoryRepo';
import type { AgentSession, GhostDevSessionAuditRecord } from '../types/agent';

export const AgentControlView: React.FC = () => {
  const { token } = theme.useToken();
  const {
    sessions,
    activeSessionId,
    setActiveSessionId,
    activeSession,
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
            auditHistory={auditHistory}
            onSelectAuditSession={handleSelectAuditSession}
            onDeleteAuditSession={handleDeleteAuditSession}
            onClearAllAuditHistory={handleClearAllAudit}
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
              activeWorkers={activeSession.activeWorkers}
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

      {/* Audit Record Details Drawer */}
      <Drawer
        title={
          <Space>
            <HistoryOutlined style={{ color: '#4f46e5' }} />
            <span>Chi tiết Audit: {selectedAuditRecord?.taskTitle}</span>
          </Space>
        }
        width={600}
        open={auditDrawerOpen}
        onClose={() => setAuditDrawerOpen(false)}
      >
        {selectedAuditRecord && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Session Summary Metadata */}
            <Descriptions size="small" bordered column={1}>
              <Descriptions.Item label="Trạng thái">
                {getStatusBadge(selectedAuditRecord.status)}
              </Descriptions.Item>
              <Descriptions.Item label="Tác vụ">
                {selectedAuditRecord.taskTitle} (ID: {selectedAuditRecord.taskId})
              </Descriptions.Item>
              <Descriptions.Item label="Nhánh Git">
                <code>{selectedAuditRecord.branchName}</code>
              </Descriptions.Item>
              <Descriptions.Item label="Thư mục Repo">
                <code>{selectedAuditRecord.repoPath}</code>
              </Descriptions.Item>
              <Descriptions.Item label="Models">
                <Space>
                  <Tag color="#722ed1">Master: {selectedAuditRecord.masterModel}</Tag>
                  <Tag color="#1677ff">Worker: {selectedAuditRecord.workerModel}</Tag>
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="Thời gian bắt đầu">
                {new Date(selectedAuditRecord.startedAt).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="Thời gian kết thúc">
                {selectedAuditRecord.finishedAt
                  ? new Date(selectedAuditRecord.finishedAt).toLocaleString()
                  : 'Đang chạy / Chưa kết thúc'}
              </Descriptions.Item>
              {selectedAuditRecord.error && (
                <Descriptions.Item label="Lỗi ghi nhận">
                  <Typography.Text type="danger">{selectedAuditRecord.error}</Typography.Text>
                </Descriptions.Item>
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
                <Typography.Title level={5} style={{ margin: 0 }}>
                  Master Prompt ban đầu
                </Typography.Title>
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
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 6,
                  padding: 12,
                  fontSize: 12,
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
              <Typography.Title level={5} style={{ marginBottom: 8 }}>
                Lịch sử phản hồi từ người dùng (
                {selectedAuditRecord.userFeedbackHistory?.length || 0})
              </Typography.Title>
              {selectedAuditRecord.userFeedbackHistory &&
              selectedAuditRecord.userFeedbackHistory.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {selectedAuditRecord.userFeedbackHistory.map((fb, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                        padding: 10,
                        backgroundColor: '#fafafa',
                        border: '1px solid #f0f0f0',
                        borderRadius: 8,
                      }}
                    >
                      {/* User Feedback Bubble */}
                      <Card
                        size="small"
                        style={{ backgroundColor: '#f0f9ff', borderColor: '#bae6fd' }}
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
                            <UserOutlined style={{ color: '#0369a1', fontSize: 12 }} />
                            <Typography.Text strong style={{ fontSize: 12, color: '#0369a1' }}>
                              Chỉ đạo #{idx + 1}
                            </Typography.Text>
                          </Space>
                          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                            {new Date(fb.timestamp).toLocaleTimeString()}
                          </Typography.Text>
                        </div>
                        <Typography.Paragraph
                          style={{ margin: 0, fontSize: 13, whiteSpace: 'pre-wrap' }}
                        >
                          {fb.feedback}
                        </Typography.Paragraph>
                      </Card>

                      {/* AI Response Bubble */}
                      {fb.aiResponse ? (
                        <Card
                          size="small"
                          style={{
                            backgroundColor: '#faf5ff',
                            borderColor: '#e9d5ff',
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
                              <RobotOutlined style={{ color: '#7e22ce', fontSize: 12 }} />
                              <Typography.Text strong style={{ fontSize: 12, color: '#7e22ce' }}>
                                Phản hồi từ AI
                              </Typography.Text>
                            </Space>
                          </div>
                          <Typography.Paragraph
                            style={{ margin: 0, fontSize: 13, whiteSpace: 'pre-wrap', color: '#374151' }}
                          >
                            {fb.aiResponse}
                          </Typography.Paragraph>
                        </Card>
                      ) : (
                        <div style={{ marginLeft: 20, fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>
                          (AI đã nhận chỉ đạo và thực hiện trực tiếp vào mã nguồn)
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                  Không có phản hồi nào được gửi trong phiên này.
                </Typography.Text>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
