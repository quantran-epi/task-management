import React, { useRef, useEffect, useState, useMemo } from 'react';
import {
  Typography,
  Input,
  Button,
  Space,
  Tag,
  Segmented,
  Card,
  Collapse,
  Tooltip,
  message,
  Spin,
  ConfigProvider,
  theme,
} from 'antd';
import {
  SendOutlined,
  DownCircleOutlined,
  ClearOutlined,
  RobotOutlined,
  CopyOutlined,
  CodeOutlined,
  AppstoreOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ToolOutlined,
  SafetyCertificateOutlined,
  CommentOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import type { GhostDevStreamChunk, WorkerSession } from '../../types/agent';

const { Text } = Typography;

export interface AgentTerminalLogProps {
  logs: GhostDevStreamChunk[];
  sending: boolean;
  isRunning?: boolean;
  onSendFeedback: (prompt: string) => Promise<void>;
  onClearLogs?: () => void;
  taskTitle?: string;
  activeWorkers?: WorkerSession[];
}

interface ParsedChunk {
  raw: GhostDevStreamChunk;
  kind:
    | 'ai_text'
    | 'tool_call'
    | 'tool_result'
    | 'user_feedback'
    | 'security'
    | 'status'
    | 'system_hook'
    | 'raw_log';
  title?: string;
  body: string;
  details?: unknown;
  isError?: boolean;
}

function formatToolResultContent(content: unknown): string {
  if (typeof content === 'string') {
    const trimmed = content.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return formatToolResultContent(parsed);
        }
      } catch {
        // Return original string if not valid JSON
      }
    }
    return content;
  }
  if (Array.isArray(content)) {
    const textParts = content
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>;
          if (typeof obj.text === 'string') return obj.text;
          if (typeof obj.content === 'string') return obj.content;
        }
        return JSON.stringify(item);
      })
      .filter(Boolean);
    if (textParts.length > 0) {
      return textParts.join('\n');
    }
  }
  if (content && typeof content === 'object') {
    return JSON.stringify(content, null, 2);
  }
  return String(content ?? '');
}

function parseStreamChunk(chunk: GhostDevStreamChunk): ParsedChunk {
  const content = chunk.content;

  if (content.startsWith('[User Feedback]')) {
    return {
      raw: chunk,
      kind: 'user_feedback',
      title: 'Chỉ đạo người dùng',
      body: content.replace(/^\[User Feedback\]:\s*/, ''),
    };
  }

  if (content.startsWith('[Security]')) {
    return {
      raw: chunk,
      kind: 'security',
      title: 'Xác thực Shell',
      body: content,
    };
  }

  if (content.startsWith('Worker ') && content.includes('completed')) {
    return {
      raw: chunk,
      kind: 'status',
      title: 'Trạng thái Worker',
      body: content,
    };
  }

  const trimmed = content.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const val = JSON.parse(trimmed) as Record<string, unknown>;
      const msgType = String(val.type || '');

      // Internal system hooks to filter from human-friendly view
      if (
        msgType === 'hook_started' ||
        msgType === 'hook_response' ||
        msgType === 'init' ||
        msgType === 'telemetry' ||
        msgType === 'system'
      ) {
        return {
          raw: chunk,
          kind: 'system_hook',
          title: 'System Hook',
          body: content,
        };
      }

      // Check nested content blocks for tool_use or tool_result
      const contentBlocks = Array.isArray(val.content)
        ? (val.content as Array<Record<string, unknown>>)
        : val.message && typeof val.message === 'object' && Array.isArray((val.message as Record<string, unknown>).content)
        ? ((val.message as Record<string, unknown>).content as Array<Record<string, unknown>>)
        : null;

      if (contentBlocks) {
        // Unpack nested tool_use inside assistant messages
        const toolBlock = contentBlocks.find(
          (b) => b && (b.type === 'tool_use' || b.type === 'tool_call')
        );
        if (toolBlock) {
          const toolName = String(toolBlock.name || toolBlock.tool || 'Tool');
          const input = (toolBlock.input || toolBlock.parameters || {}) as Record<string, unknown>;
          let summary = '';
          if (input.command) summary = String(input.command);
          else if (input.file_path) summary = String(input.file_path);
          else if (input.prompt) summary = String(input.prompt);
          else if (input.description) summary = String(input.description);
          else if (input.query) summary = String(input.query);
          else summary = JSON.stringify(input);

          return {
            raw: chunk,
            kind: 'tool_call',
            title: `Thực thi: ${toolName}`,
            body: summary,
            details: input,
          };
        }

        // Unpack nested tool_result inside user messages
        const resultBlock = contentBlocks.find(
          (b) => b && (b.type === 'tool_result' || b.tool_use_id)
        );
        if (resultBlock) {
          const isError = Boolean(resultBlock.is_error);
          const resContent = formatToolResultContent(resultBlock.content ?? resultBlock);
          return {
            raw: chunk,
            kind: 'tool_result',
            title: isError ? 'Kết quả Tool (Lỗi)' : 'Kết quả Tool',
            body: resContent,
            isError,
          };
        }
      }

      // AI Text Message
      if (msgType === 'assistant' || val.role === 'assistant') {
        let text = '';
        if (typeof val.content === 'string') {
          text = val.content;
        } else if (Array.isArray(val.content)) {
          text = (val.content as Array<{ type?: string; text?: string }>)
            .filter((c) => c.type === 'text')
            .map((c) => c.text || '')
            .join('\n');
        } else if (val.message && typeof val.message === 'object') {
          const msgObj = val.message as { content?: Array<{ type?: string; text?: string }> };
          if (Array.isArray(msgObj.content)) {
            text = msgObj.content
              .filter((c) => c.type === 'text')
              .map((c) => c.text || '')
              .join('\n');
          }
        }
        if (text) {
          return {
            raw: chunk,
            kind: 'ai_text',
            title: 'Phản hồi từ AI',
            body: text,
          };
        }
      }

      // Delta streaming text
      if (msgType === 'content_block_delta') {
        const delta = val.delta as { type?: string; text?: string } | undefined;
        if (delta?.text) {
          return {
            raw: chunk,
            kind: 'ai_text',
            title: 'AI Streaming',
            body: delta.text,
          };
        }
      }

      // Tool Call
      if (msgType === 'tool_use' || msgType === 'tool_call' || chunk.type === 'tool_call') {
        const toolName = String(val.name || val.tool || 'Tool');
        const input = (val.input || val.parameters || {}) as Record<string, unknown>;
        let summary = '';
        if (input.command) summary = String(input.command);
        else if (input.file_path) summary = String(input.file_path);
        else if (input.prompt) summary = String(input.prompt);
        else if (input.description) summary = String(input.description);
        else if (input.query) summary = String(input.query);
        else summary = JSON.stringify(input);

        return {
          raw: chunk,
          kind: 'tool_call',
          title: `Thực thi: ${toolName}`,
          body: summary,
          details: input,
        };
      }

      // Content block start tool use
      if (msgType === 'content_block_start') {
        const cb = val.content_block as Record<string, unknown> | undefined;
        if (cb && (cb.type === 'tool_use' || cb.type === 'tool_call')) {
          const toolName = String(cb.name || 'Tool');
          const input = (cb.input || {}) as Record<string, unknown>;
          return {
            raw: chunk,
            kind: 'tool_call',
            title: `Thực thi: ${toolName}`,
            body: input.prompt ? String(input.prompt) : JSON.stringify(input),
            details: input,
          };
        }
      }

      // Tool Result
      if (msgType === 'tool_result' || chunk.type === 'tool_result') {
        const isError = Boolean(val.is_error);
        const resContent = formatToolResultContent(val.content ?? val);
        return {
          raw: chunk,
          kind: 'tool_result',
          title: isError ? 'Kết quả Tool (Lỗi)' : 'Kết quả Tool',
          body: resContent,
          isError,
        };
      }

      // Result event from Claude stream-json
      if (msgType === 'result') {
        const resultText = typeof val.result === 'string' ? val.result : '';
        const durationSec =
          typeof val.duration_ms === 'number' ? Math.round(val.duration_ms / 1000) : 0;
        const durationStr =
          durationSec > 60
            ? `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`
            : `${durationSec}s`;
        const costStr =
          typeof val.total_cost_usd === 'number'
            ? ` • $${val.total_cost_usd.toFixed(4)}`
            : '';
        const title = `Hoàn thành (${durationStr}${costStr})`;
        return {
          raw: chunk,
          kind: 'ai_text',
          title,
          body: resultText || 'Phiên làm việc đã hoàn thành nhiệm vụ.',
          details: val,
        };
      }

      // Error event
      if (msgType === 'error') {
        return {
          raw: chunk,
          kind: 'raw_log',
          title: 'Lỗi',
          body: JSON.stringify(val.error || val),
          isError: true,
        };
      }
    } catch {
      // Fall through to plain text
    }
  }

  return {
    raw: chunk,
    kind: 'raw_log',
    body: content,
    isError: chunk.type === 'error',
  };
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
  isRunning = false,
  onSendFeedback,
  onClearLogs,
  taskTitle,
  activeWorkers = [],
}) => {
  const [inputText, setInputText] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [viewMode, setViewMode] = useState<'human' | 'raw'>('human');
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Track active thinking vs turn completion state
  const { isThinking, latestResultInfo } = useMemo(() => {
    let resultInfo: { durationStr: string; cost?: string | undefined } | null = null;
    let feedbackSentAfterResult = false;

    for (let i = logs.length - 1; i >= 0; i--) {
      const chunk = logs[i];
      if (!chunk) continue;
      if (chunk.content.startsWith('[User Feedback]')) {
        feedbackSentAfterResult = true;
        break;
      }
      const trimmed = chunk.content.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const val = JSON.parse(trimmed) as Record<string, unknown>;
          if (val.type === 'result') {
            const durationSec =
              typeof val.duration_ms === 'number' ? Math.round(val.duration_ms / 1000) : 0;
            const durationStr =
              durationSec > 60
                ? `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`
                : `${durationSec}s`;
            resultInfo = {
              durationStr,
              cost:
                typeof val.total_cost_usd === 'number'
                  ? `$${val.total_cost_usd.toFixed(4)}`
                  : undefined,
            };
            break;
          }
        } catch {
          // ignore
        }
      }
    }

    const thinking = Boolean(
      sending || (isRunning && (!resultInfo || feedbackSentAfterResult))
    );

    return {
      isThinking: thinking,
      latestResultInfo: resultInfo,
    };
  }, [logs, sending, isRunning]);

  // Discover all unique workers from props, logs, and parsed tool calls
  const allWorkers = useMemo(() => {
    const map = new Map<string, { workerId: string; role: string }>();
    activeWorkers.forEach((w) => {
      map.set(w.workerId, { workerId: w.workerId, role: w.role });
    });

    logs.forEach((chunk) => {
      if (chunk.source === 'worker' && chunk.workerId) {
        if (!map.has(chunk.workerId)) {
          map.set(chunk.workerId, { workerId: chunk.workerId, role: 'Worker' });
        }
      }

      // Parse Task/Agent/dispatch_subtask tool calls to register subagent tab items dynamically
      const trimmed = chunk.content.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const val = JSON.parse(trimmed) as Record<string, unknown>;
          const msgType = String(val.type || '');
          const blocks: Array<Record<string, unknown>> = [];
          if (msgType === 'tool_use' || msgType === 'tool_call') {
            blocks.push(val);
          } else if (msgType === 'content_block_start' && val.content_block) {
            blocks.push(val.content_block as Record<string, unknown>);
          } else if (Array.isArray(val.content)) {
            blocks.push(...(val.content as Array<Record<string, unknown>>));
          } else if (
            val.message &&
            typeof val.message === 'object' &&
            Array.isArray((val.message as Record<string, unknown>).content)
          ) {
            blocks.push(
              ...((val.message as Record<string, unknown>).content as Array<Record<string, unknown>>)
            );
          }

          blocks.forEach((b) => {
            if (!b) return;
            const name = String(b.name || '');
            if (name === 'Task' || name === 'Agent' || name === 'dispatch_subtask') {
              const id = String(b.id || chunk.workerId || '');
              const input = (b.input || {}) as Record<string, unknown>;
              const role = String(
                input.subagent_type || input.description || input.role || 'Subagent'
              ).slice(0, 24);
              if (id && !map.has(id)) {
                map.set(id, { workerId: id, role });
              }
            }
          });
        } catch {
          // Ignore parse errors
        }
      }
    });

    return Array.from(map.values());
  }, [activeWorkers, logs]);

  // Filter logs by selected agent
  const filteredLogs = useMemo(() => {
    if (selectedAgent === 'all') return logs;
    if (selectedAgent === 'master') return logs.filter((l) => l.source !== 'worker');
    return logs.filter((l) => l.workerId === selectedAgent || l.content.includes(selectedAgent));
  }, [logs, selectedAgent]);

  // Parse logs for human view, filtering out internal system hooks
  const parsedLogs = useMemo(() => {
    return filteredLogs
      .map((chunk) => parseStreamChunk(chunk))
      .filter((item) => item.kind !== 'system_hook');
  }, [filteredLogs]);

  // Auto-scroll to bottom on new logs if user has not scrolled up
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [filteredLogs, autoScroll, viewMode]);

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

  const handleCopyRawLogs = () => {
    const rawText = filteredLogs.map((l) => l.content).join('\n');
    void navigator.clipboard?.writeText(rawText);
    message.success(`Đã sao chép ${filteredLogs.length} dòng log!`);
  };

  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
      <div
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: viewMode === 'raw' ? '#1e1e1e' : '#141414',
          color: '#d4d4d4',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        {/* Top Header: Title, Controls, Modes */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: '8px 12px',
            borderBottom: '1px solid #333',
            backgroundColor: '#252526',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Space direction="horizontal" size={8}>
              <RobotOutlined style={{ color: '#4f46e5' }} />
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>
                {taskTitle ? `Terminal: ${taskTitle}` : 'Terminal Stream'}
              </Text>
              <Text style={{ color: '#888', fontSize: 11 }}>({filteredLogs.length} dòng)</Text>
            </Space>

            <Space direction="horizontal" size={8}>
              <Segmented
                size="small"
                value={viewMode}
                onChange={(val) => setViewMode(val as 'human' | 'raw')}
                options={[
                  { label: 'Trực quan', value: 'human', icon: <AppstoreOutlined /> },
                  { label: 'Raw Log', value: 'raw', icon: <CodeOutlined /> },
                ]}
                style={{ backgroundColor: '#1e1e1e' }}
              />

              <Tooltip title="Sao chép toàn bộ log của Agent đang chọn">
                <Button
                  size="small"
                  type="text"
                  icon={<CopyOutlined />}
                  onClick={handleCopyRawLogs}
                  style={{ color: '#aaa' }}
                  aria-label="Sao chép nhật ký"
                />
              </Tooltip>

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

          {/* Subagent & Master Switcher Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', paddingTop: 2 }}>
            <Text style={{ color: '#888', fontSize: 11, flexShrink: 0 }}>Tiến trình:</Text>
            <Segmented
              size="small"
              value={selectedAgent}
              onChange={(val) => setSelectedAgent(val as string)}
              options={[
                { label: 'Tất cả', value: 'all' },
                {
                  label: '👑 Master Lead',
                  value: 'master',
                },
                ...allWorkers.map((w) => ({
                  label: `⚡ ${w.role || 'Worker'} (${w.workerId.slice(0, 6)})`,
                  value: w.workerId,
                })),
              ]}
              style={{ backgroundColor: '#18181b', fontSize: 11 }}
            />
          </div>
        </div>

        {/* Main Output Zone */}
        <div
          ref={logContainerRef}
          onScroll={handleScroll}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: viewMode === 'raw' ? '12px 16px' : '12px',
            fontFamily:
              viewMode === 'raw'
                ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
                : 'inherit',
            fontSize: 12,
            lineHeight: viewMode === 'raw' ? '22px' : '1.5',
          }}
          tabIndex={0}
          role="log"
          aria-label="Nhật ký lệnh agent"
        >
          {filteredLogs.length === 0 ? (
            <div style={{ textAlign: 'center', marginTop: 48, color: '#666' }}>
              <Text type="secondary" style={{ color: '#666' }}>
                Đang đợi luồng stream từ Claude Code Agent...
              </Text>
            </div>
          ) : viewMode === 'raw' ? (
            // RAW LOG MODE
            filteredLogs.map((chunk, index) => (
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
                <span style={{ flexShrink: 0 }}>
                  {chunk.source === 'worker' ? (
                    <Tag color="cyan" style={{ fontSize: 9, margin: 0, padding: '0 4px' }}>
                      SUBAGENT
                    </Tag>
                  ) : (
                    getChunkTag(chunk.type)
                  )}
                </span>
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
                  {chunk.content}
                </span>
              </div>
            ))
          ) : (
            // HUMAN-FRIENDLY VIEW MODE
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {parsedLogs.map((item, idx) => {
                const isSubagent = item.raw.source === 'worker';

                if (item.kind === 'ai_text') {
                  return (
                    <Card
                      key={idx}
                      size="small"
                      style={{
                        backgroundColor: '#1f1f23',
                        borderColor: '#3f3f46',
                        borderRadius: 6,
                      }}
                      styles={{ body: { padding: '8px 12px' } }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: 4,
                        }}
                      >
                        <Space size={6}>
                          {isSubagent ? (
                            <Tag color="#1677ff" style={{ margin: 0, fontSize: 10 }}>
                              Subagent Worker
                            </Tag>
                          ) : (
                            <Tag color="#722ed1" style={{ margin: 0, fontSize: 10 }}>
                              Master Lead
                            </Tag>
                          )}
                          <Text strong style={{ color: '#f4f4f5', fontSize: 12 }}>
                            {item.title}
                          </Text>
                        </Space>
                        <Text type="secondary" style={{ fontSize: 10, color: '#71717a' }}>
                          {new Date(item.raw.timestamp).toLocaleTimeString()}
                        </Text>
                      </div>
                      <div
                        style={{
                          color: '#e4e4e7',
                          fontSize: 13,
                          whiteSpace: 'pre-wrap',
                          lineHeight: 1.6,
                        }}
                      >
                        {item.body}
                      </div>
                    </Card>
                  );
                }

                if (item.kind === 'tool_call') {
                  return (
                    <div
                      key={idx}
                      style={{
                        backgroundColor: '#18181b',
                        border: '1px solid #27272a',
                        borderLeft: '3px solid #06b6d4',
                        borderRadius: 4,
                        padding: '6px 10px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <Space size={6}>
                          <ToolOutlined style={{ color: '#06b6d4' }} />
                          <Text strong style={{ color: '#06b6d4', fontSize: 12 }}>
                            {item.title}
                          </Text>
                          {isSubagent && (
                            <Tag color="blue" style={{ fontSize: 9, margin: 0 }}>
                              Subagent
                            </Tag>
                          )}
                        </Space>
                        <Text style={{ fontSize: 10, color: '#71717a' }}>
                          {new Date(item.raw.timestamp).toLocaleTimeString()}
                        </Text>
                      </div>

                      <div
                        style={{
                          marginTop: 4,
                          fontFamily: 'monospace',
                          fontSize: 11,
                          color: '#a1a1aa',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all',
                        }}
                      >
                        {item.body}
                      </div>

                      {Boolean(
                        item.details &&
                          typeof item.details === 'object' &&
                          Object.keys(item.details as object).length > 0
                      )}
                      {Boolean(
                        item.details &&
                          typeof item.details === 'object' &&
                          Object.keys(item.details as object).length > 0
                      ) && (
                        <Collapse
                          ghost
                          size="small"
                          items={[
                            {
                              key: 'details',
                              label: (
                                <span style={{ color: '#71717a', fontSize: 10 }}>
                                  Chi tiết tham số
                                </span>
                              ),
                              children: (
                                <pre
                                  style={{
                                    margin: 0,
                                    fontSize: 10,
                                    color: '#a1a1aa',
                                    backgroundColor: '#09090b',
                                    padding: 6,
                                    borderRadius: 4,
                                    maxHeight: 120,
                                    overflowY: 'auto',
                                  }}
                                >
                                  {JSON.stringify(item.details, null, 2)}
                                </pre>
                              ),
                            },
                          ]}
                        />
                      )}
                    </div>
                  );
                }

                if (item.kind === 'tool_result') {
                  return (
                    <div
                      key={idx}
                      style={{
                        backgroundColor: '#18181b',
                        border: '1px solid #27272a',
                        borderLeft: `3px solid ${item.isError ? '#ef4444' : '#10b981'}`,
                        borderRadius: 4,
                        padding: '6px 10px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <Space size={6}>
                          {item.isError ? (
                            <CloseCircleOutlined style={{ color: '#ef4444' }} />
                          ) : (
                            <CheckCircleOutlined style={{ color: '#10b981' }} />
                          )}
                          <Text
                            strong
                            style={{
                              color: item.isError ? '#ef4444' : '#10b981',
                              fontSize: 12,
                            }}
                          >
                            {item.title}
                          </Text>
                        </Space>
                        <Text style={{ fontSize: 10, color: '#71717a' }}>
                          {new Date(item.raw.timestamp).toLocaleTimeString()}
                        </Text>
                      </div>
                      <pre
                        style={{
                          margin: '4px 0 0 0',
                          fontFamily: 'monospace',
                          fontSize: 11,
                          color: item.isError ? '#fca5a5' : '#86efac',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all',
                          maxHeight: 150,
                          overflowY: 'auto',
                        }}
                      >
                        {item.body}
                      </pre>
                    </div>
                  );
                }

                if (item.kind === 'user_feedback') {
                  return (
                    <Card
                      key={idx}
                      size="small"
                      style={{
                        backgroundColor: '#1e1b4b',
                        borderColor: '#4338ca',
                        borderRadius: 6,
                      }}
                      styles={{ body: { padding: '8px 12px' } }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: 4,
                        }}
                      >
                        <Space size={6}>
                          <CommentOutlined style={{ color: '#818cf8' }} />
                          <Text strong style={{ color: '#c7d2fe', fontSize: 12 }}>
                            Chỉ đạo người dùng
                          </Text>
                        </Space>
                        <Text style={{ fontSize: 10, color: '#818cf8' }}>
                          {new Date(item.raw.timestamp).toLocaleTimeString()}
                        </Text>
                      </div>
                      <div style={{ color: '#e0e7ff', fontSize: 13, whiteSpace: 'pre-wrap' }}>
                        {item.body}
                      </div>
                    </Card>
                  );
                }

                if (item.kind === 'security') {
                  return (
                    <div
                      key={idx}
                      style={{
                        backgroundColor: '#1c1917',
                        border: '1px solid #78350f',
                        borderLeft: '3px solid #f59e0b',
                        borderRadius: 4,
                        padding: '6px 10px',
                      }}
                    >
                      <Space size={6}>
                        <SafetyCertificateOutlined style={{ color: '#f59e0b' }} />
                        <Text style={{ color: '#fde68a', fontSize: 11 }}>{item.body}</Text>
                      </Space>
                    </div>
                  );
                }

                if (item.kind === 'status') {
                  return (
                    <div
                      key={idx}
                      style={{
                        backgroundColor: '#1e1b4b',
                        border: '1px solid #312e81',
                        borderLeft: '3px solid #6366f1',
                        borderRadius: 4,
                        padding: '6px 10px',
                      }}
                    >
                      <Space size={6}>
                        <RobotOutlined style={{ color: '#6366f1' }} />
                        <Text style={{ color: '#c7d2fe', fontSize: 11 }}>{item.body}</Text>
                      </Space>
                    </div>
                  );
                }

                // Default raw line
                return (
                  <div
                    key={idx}
                    style={{
                      fontSize: 11,
                      fontFamily: 'monospace',
                      color: item.isError ? '#f87171' : '#a1a1aa',
                      wordBreak: 'break-all',
                      whiteSpace: 'pre-wrap',
                      padding: '2px 0',
                    }}
                  >
                    {item.body}
                  </div>
                );
              })}
            </div>
          )}

          {/* Active AI Running vs Completed Status Indicator */}
          {isThinking ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                backgroundColor: '#18181b',
                border: '1px solid #27272a',
                borderRadius: 4,
                marginTop: 8,
                color: '#818cf8',
              }}
            >
              <Spin
                indicator={<LoadingOutlined style={{ fontSize: 14, color: '#818cf8' }} spin />}
              />
              <span style={{ fontSize: 12 }}>Claude AI đang xử lý / suy nghĩ...</span>
            </div>
          ) : latestResultInfo ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                backgroundColor: '#14291f',
                border: '1px solid #1e4620',
                borderRadius: 4,
                marginTop: 8,
                color: '#4ade80',
              }}
            >
              <CheckCircleOutlined style={{ fontSize: 14, color: '#4ade80' }} />
              <span style={{ fontSize: 12, fontWeight: 500 }}>
                Đã hoàn thành {latestResultInfo.durationStr ? `trong ${latestResultInfo.durationStr}` : ''}
                {latestResultInfo.cost ? ` (${latestResultInfo.cost})` : ''} — Sẵn sàng nhận chỉ đạo mới.
              </span>
            </div>
          ) : null}
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
            onClick={() => void handleSend()}
            loading={sending}
            disabled={!inputText.trim()}
            aria-label="Gửi chỉ đạo"
          >
            Gửi
          </Button>
        </div>
      </div>
    </ConfigProvider>
  );
};
