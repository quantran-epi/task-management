import React, { useState } from 'react';
import { Card, Tag, Typography, Space, Button, Popconfirm, theme, Empty, Segmented } from 'antd';
import {
  RobotOutlined,
  StopOutlined,
  BranchesOutlined,
  ThunderboltOutlined,
  HistoryOutlined,
  DeleteOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import type { AgentSession, AgentStatus, GhostDevSessionAuditRecord } from '../../types/agent';

const { Text } = Typography;

export interface AgentSessionListProps {
  sessions: AgentSession[];
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onStopSession?: (taskId: string) => Promise<void>;
  auditHistory?: GhostDevSessionAuditRecord[];
  onSelectAuditSession?: (record: GhostDevSessionAuditRecord) => void;
  onDeleteAuditSession?: (sessionId: string) => void;
  onClearAllAuditHistory?: () => void;
}

export function getStatusBadge(status: AgentStatus) {
  switch (status) {
    case 'running':
      return <Tag color="processing">Đang chạy</Tag>;
    case 'paused':
      return <Tag color="warning">Tạm dừng</Tag>;
    case 'awaiting_approval':
      return <Tag color="gold">Chờ duyệt shell</Tag>;
    case 'done':
      return <Tag color="success">Hoàn thành</Tag>;
    case 'error':
      return <Tag color="error">Lỗi</Tag>;
    case 'interrupted':
      return <Tag color="default">Đã dừng</Tag>;
    default:
      return <Tag>Chờ</Tag>;
  }
}

export const AgentSessionList: React.FC<AgentSessionListProps> = ({
  sessions,
  activeSessionId,
  onSelectSession,
  onStopSession,
  auditHistory = [],
  onSelectAuditSession,
  onDeleteAuditSession,
  onClearAllAuditHistory,
}) => {
  const { token } = theme.useToken();
  const [currentTab, setCurrentTab] = useState<'active' | 'history'>('active');
  const runningSessions = sessions.filter((s) => s.status !== 'interrupted');

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top Tab Bar: Đang chạy vs Lịch sử */}
      <div style={{ padding: '8px 8px 4px 8px', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
        <Segmented
          block
          value={currentTab}
          onChange={(val) => setCurrentTab(val as 'active' | 'history')}
          options={[
            {
              label: (
                <span style={{ fontWeight: 600 }}>
                  Đang chạy ({runningSessions.length})
                </span>
              ),
              value: 'active',
              icon: <RobotOutlined />,
            },
            {
              label: (
                <span style={{ fontWeight: 600 }}>
                  Lịch sử ({auditHistory.length})
                </span>
              ),
              value: 'history',
              icon: <HistoryOutlined />,
            },
          ]}
        />
      </div>

      {/* Tab 1: Active Sessions */}
      {currentTab === 'active' && (
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
          role="list"
          aria-label="Danh sách phiên Ghost Dev"
        >
          {runningSessions.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center' }}>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="Chưa có phiên Ghost Dev nào"
                style={{ margin: '32px 0' }}
              />
            </div>
          ) : (
            runningSessions.map((session) => {
              const isSelected = session.taskId === activeSessionId;
              const isRunning =
                session.status === 'running' || session.status === 'awaiting_approval';

              return (
                <Card
                  key={session.taskId}
                  size="small"
                  hoverable
                  onClick={() => onSelectSession(session.taskId)}
                  role="listitem"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectSession(session.taskId);
                    }
                  }}
                  style={{
                    cursor: 'pointer',
                    borderColor: isSelected ? '#4f46e5' : token.colorBorderSecondary,
                    backgroundColor: isSelected ? token.colorFillAlter : token.colorBgContainer,
                    borderWidth: isSelected ? 2 : 1,
                    transition: 'all 0.2s ease',
                  }}
                  styles={{
                    body: { padding: '10px 12px' },
                  }}
                >
                  {/* Header: Title & Status */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      marginBottom: 6,
                    }}
                  >
                    <Text strong style={{ fontSize: 13, flex: 1, marginRight: 8 }} ellipsis>
                      {session.taskTitle}
                    </Text>
                    {getStatusBadge(session.status)}
                  </div>

                  {/* Branch and Workers info */}
                  <div
                    style={{
                      fontSize: 12,
                      color: token.colorTextSecondary,
                      marginBottom: 8,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <BranchesOutlined />
                    <Text code style={{ fontSize: 11 }}>
                      {session.branchName}
                    </Text>
                  </div>

                  {/* Master Agent Info */}
                  <div
                    style={{
                      backgroundColor: token.colorFillQuaternary,
                      borderRadius: 4,
                      padding: '4px 8px',
                      marginBottom: 6,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Space direction="horizontal" size={6}>
                      <RobotOutlined style={{ color: '#722ed1', fontSize: 13 }} />
                      <Text style={{ fontSize: 12 }}>Master Lead</Text>
                    </Space>
                    <Tag color="#722ed1" style={{ margin: 0, fontSize: 10, lineHeight: '18px' }}>
                      {session.masterModel || 'opus'}
                    </Tag>
                  </div>

                  {/* Nested Worker Agents Tree */}
                  {session.activeWorkers && session.activeWorkers.length > 0 && (
                    <div
                      style={{
                        marginLeft: 12,
                        paddingLeft: 8,
                        borderLeft: `2px dashed ${token.colorBorderSecondary}`,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        marginBottom: 6,
                      }}
                    >
                      {session.activeWorkers.map((worker) => (
                        <div
                          key={worker.workerId}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontSize: 11,
                          }}
                        >
                          <Space direction="horizontal" size={4}>
                            <ThunderboltOutlined style={{ color: '#1677ff', fontSize: 11 }} />
                            <Text style={{ fontSize: 11 }} ellipsis>
                              {worker.role || 'Worker'}
                            </Text>
                          </Space>
                          <Tag color="#1677ff" style={{ margin: 0, fontSize: 9, lineHeight: '16px' }}>
                            {worker.model || 'haiku'}
                          </Tag>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Footer with Stop action */}
                  {isRunning && onStopSession && (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        marginTop: 6,
                        borderTop: `1px solid ${token.colorBorderSecondary}`,
                        paddingTop: 6,
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Popconfirm
                        title="Dừng Ghost Dev"
                        description="Dừng ngay lập tức Master Agent và các Worker đang chạy cho tác vụ này? Tiến trình chưa commit sẽ được giữ lại trong worktree."
                        onConfirm={() => onStopSession(session.taskId)}
                        okText="Dừng"
                        cancelText="Hủy"
                        okButtonProps={{ danger: true }}
                      >
                        <Button
                          size="small"
                          danger
                          icon={<StopOutlined />}
                          aria-label={`Dừng Ghost Dev cho tác vụ ${session.taskTitle}`}
                        >
                          Dừng
                        </Button>
                      </Popconfirm>
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* Tab 2: Audit History */}
      {currentTab === 'history' && (
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
          role="list"
          aria-label="Danh sách lịch sử phiên Ghost Dev"
        >
          {auditHistory.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center' }}>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="Chưa có lịch sử phiên nào"
                style={{ margin: '32px 0' }}
              />
            </div>
          ) : (
            <>
              {onClearAllAuditHistory && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0 4px 4px 4px',
                  }}
                >
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {auditHistory.length} phiên đã lưu
                  </Text>
                  <Popconfirm
                    title="Xóa toàn bộ lịch sử?"
                    description="Toàn bộ lịch sử các phiên audit sẽ bị xóa."
                    onConfirm={onClearAllAuditHistory}
                    okText="Xóa tất cả"
                    cancelText="Hủy"
                    okButtonProps={{ danger: true }}
                  >
                    <Button type="link" size="small" danger style={{ padding: 0 }}>
                      Xóa tất cả
                    </Button>
                  </Popconfirm>
                </div>
              )}

              {auditHistory.map((record) => (
                <Card
                  key={record.sessionId || record.taskId}
                  size="small"
                  hoverable
                  onClick={() => onSelectAuditSession?.(record)}
                  role="listitem"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectAuditSession?.(record);
                    }
                  }}
                  style={{
                    cursor: 'pointer',
                    borderColor: token.colorBorderSecondary,
                    backgroundColor: token.colorBgContainer,
                    transition: 'all 0.2s ease',
                  }}
                  styles={{
                    body: { padding: '10px 12px' },
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      marginBottom: 6,
                    }}
                  >
                    <Text strong style={{ fontSize: 13, flex: 1, marginRight: 8 }} ellipsis>
                      {record.taskTitle}
                    </Text>
                    {getStatusBadge(record.status)}
                  </div>

                  <div
                    style={{
                      fontSize: 11,
                      color: token.colorTextSecondary,
                      marginBottom: 6,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span>{new Date(record.startedAt).toLocaleString()}</span>
                    {record.userFeedbackHistory && record.userFeedbackHistory.length > 0 && (
                      <Tag color="blue" style={{ margin: 0, fontSize: 10, lineHeight: '18px' }}>
                        {record.userFeedbackHistory.length} phản hồi
                      </Tag>
                    )}
                  </div>

                  <div
                    style={{
                      fontSize: 12,
                      color: token.colorTextSecondary,
                      marginBottom: 8,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <BranchesOutlined />
                    <Text code style={{ fontSize: 11 }}>
                      {record.branchName}
                    </Text>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 6,
                    }}
                  >
                    <Space size={4}>
                      <Tag color="#722ed1" style={{ margin: 0, fontSize: 10, lineHeight: '18px' }}>
                        {record.masterModel}
                      </Tag>
                      <Tag color="#1677ff" style={{ margin: 0, fontSize: 10, lineHeight: '18px' }}>
                        {record.workerModel}
                      </Tag>
                    </Space>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      gap: 8,
                      marginTop: 6,
                      borderTop: `1px solid ${token.colorBorderSecondary}`,
                      paddingTop: 6,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      size="small"
                      icon={<EyeOutlined />}
                      onClick={() => onSelectAuditSession?.(record)}
                    >
                      Chi tiết
                    </Button>
                    {onDeleteAuditSession && (
                      <Popconfirm
                        title="Xóa phiên này?"
                        onConfirm={() => onDeleteAuditSession(record.sessionId || record.taskId)}
                        okText="Xóa"
                        cancelText="Hủy"
                        okButtonProps={{ danger: true }}
                      >
                        <Button
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          aria-label={`Xóa lịch sử phiên ${record.taskTitle}`}
                        />
                      </Popconfirm>
                    )}
                  </div>
                </Card>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
};
