import React from 'react';
import { Card, Tag, Typography, Space, Button, Popconfirm, theme, Empty } from 'antd';
import {
  RobotOutlined,
  StopOutlined,
  BranchesOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { AgentSession, AgentStatus } from '../../types/agent';

const { Text } = Typography;

export interface AgentSessionListProps {
  sessions: AgentSession[];
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onStopSession?: (taskId: string) => Promise<void>;
}

function getStatusBadge(status: AgentStatus) {
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
}) => {
  const { token } = theme.useToken();

  if (sessions.length === 0) {
    return (
      <div style={{ padding: 16, textAlign: 'center' }}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Chưa có phiên Ghost Dev nào"
          style={{ margin: '32px 0' }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
        padding: '12px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
      role="list"
      aria-label="Danh sách phiên Ghost Dev"
    >
      {sessions.map((session) => {
        const isSelected = session.taskId === activeSessionId;
        const isRunning = session.status === 'running' || session.status === 'awaiting_approval';

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
              <Space orientation="horizontal" size={6}>
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
                    <Space orientation="horizontal" size={4}>
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
      })}
    </div>
  );
};
