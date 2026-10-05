import React, { useRef, useEffect, useState } from 'react';
import { Typography, Input, Button, Space, Tag } from 'antd';
import {
  SendOutlined,
  DownCircleOutlined,
  ClearOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import type { GhostDevStreamChunk } from '../../types/agent';

const { Text } = Typography;

export interface AgentTerminalLogProps {
  logs: GhostDevStreamChunk[];
  sending: boolean;
  onSendFeedback: (prompt: string) => Promise<void>;
  onClearLogs?: () => void;
  taskTitle?: string;
}

function getChunkTag(type: GhostDevStreamChunk['type']) {
  switch (type) {
    case 'tool_call':
      return <Tag color="cyan" style={{ fontSize: 10, margin: 0 }}>TOOL</Tag>;
    case 'tool_result':
      return <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>RESULT</Tag>;
    case 'error':
      return <Tag color="error" style={{ fontSize: 10, margin: 0 }}>ERROR</Tag>;
    case 'status_change':
      return <Tag color="purple" style={{ fontSize: 10, margin: 0 }}>STATUS</Tag>;
    case 'log':
    default:
      return <Tag color="default" style={{ fontSize: 10, margin: 0 }}>LOG</Tag>;
  }
}

export const AgentTerminalLog: React.FC<AgentTerminalLogProps> = ({
  logs,
  sending,
  onSendFeedback,
  onClearLogs,
  taskTitle,
}) => {
  const [inputText, setInputText] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new logs if user has not scrolled up
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    if (!logContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 40;
    setAutoScroll(isAtBottom);
  };

  const handleSend = async () => {
    if (!inputText.trim() || sending) return;
    const msg = inputText.trim();
    setInputText('');
    await onSendFeedback(msg);
    setAutoScroll(true);
  };

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#1e1e1e',
        color: '#d4d4d4',
        borderRadius: 4,
        overflow: 'hidden',
      }}
    >
      {/* Terminal Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom: '1px solid #333',
          backgroundColor: '#252526',
        }}
      >
        <Space direction="horizontal" size={8}>
          <RobotOutlined style={{ color: '#4f46e5' }} />
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>
            {taskTitle ? `Terminal: ${taskTitle}` : 'Terminal Stream'}
          </Text>
          <Text style={{ color: '#888', fontSize: 11 }}>({logs.length} dòng)</Text>
        </Space>

        <Space direction="horizontal" size={6}>
          {!autoScroll && (
            <Button
              size="small"
              type="text"
              icon={<DownCircleOutlined />}
              onClick={() => {
                setAutoScroll(true);
                if (logContainerRef.current) {
                  logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
                }
              }}
              style={{ color: '#4f46e5' }}
            >
              Cuộn xuống
            </Button>
          )}
          {onClearLogs && (
            <Button
              size="small"
              type="text"
              icon={<ClearOutlined />}
              onClick={onClearLogs}
              style={{ color: '#888' }}
              aria-label="Xóa nhật ký terminal"
            />
          )}
        </Space>
      </div>

      {/* Terminal Output Zone */}
      <div
        ref={logContainerRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 16px',
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          fontSize: 12,
          lineHeight: '22px',
        }}
        tabIndex={0}
        role="log"
        aria-label="Nhật ký lệnh agent"
      >
        {logs.length === 0 ? (
          <div style={{ textAlign: 'center', marginTop: 48, color: '#666' }}>
            <Text type="secondary" style={{ color: '#666' }}>
              Đang đợi luồng stream từ Claude Code Master Agent...
            </Text>
          </div>
        ) : (
          logs.map((chunk, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                marginBottom: 2,
                wordBreak: 'break-all',
                whiteSpace: 'pre-wrap',
              }}
            >
              <span style={{ flexShrink: 0 }}>{getChunkTag(chunk.type)}</span>
              <span
                style={{
                  color:
                    chunk.type === 'error'
                      ? '#f87171'
                      : chunk.type === 'tool_call'
                      ? '#67e8f9'
                      : chunk.type === 'tool_result'
                      ? '#93c5fd'
                      : chunk.content.startsWith('[User Feedback]')
                      ? '#a78bfa'
                      : '#d4d4d4',
                }}
              >
                {/* STRIDE T-15-06 mitigation: safe text rendering without innerHTML */}
                {chunk.content}
              </span>
            </div>
          ))
        )}
      </div>

      {/* 2-Way Chat Prompt Input */}
      <div
        style={{
          padding: '8px 12px',
          backgroundColor: '#252526',
          borderTop: '1px solid #333',
          display: 'flex',
          gap: 8,
        }}
      >
        <Input
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onPressEnter={(e) => {
            if (!e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder="Chỉ đạo trực tiếp Master Agent (Enter để gửi)..."
          disabled={sending}
          style={{
            backgroundColor: '#1e1e1e',
            color: '#fff',
            borderColor: '#3c3c3c',
          }}
          aria-label="Nhập hướng dẫn cho Master Agent"
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSend}
          loading={sending}
          disabled={!inputText.trim()}
          style={{ backgroundColor: '#4f46e5' }}
          aria-label="Gửi phản hồi cho Master Agent"
        >
          Gửi
        </Button>
      </div>
    </div>
  );
};
