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
  CloseOutlined,
  ToolOutlined,
  SafetyCertificateOutlined,
  CommentOutlined,
  LoadingOutlined,
  BulbOutlined,
} from '@ant-design/icons';
import type { GhostDevStreamChunk, WorkerSession, AgentStatus } from '../../types/agent';
import {
  extractTokenCount,
  calculateSessionTokens,
  formatDuration,
  formatTokenCount,
} from '../../utils/agentMetrics';

const { Text } = Typography;

export interface AgentTerminalLogProps {
  logs: GhostDevStreamChunk[];
  sending: boolean;
  isRunning?: boolean;
  startedAt?: string | undefined;
  finishedAt?: string | undefined;
  onSendFeedback: (prompt: string) => Promise<void>;
  onClearLogs?: () => void;
  taskTitle?: string;
  activeWorkers?: WorkerSession[];
  onRemoveWorker?: (workerId: string) => void;
}

interface ParsedChunk {
  raw: GhostDevStreamChunk;
  kind:
    | 'ai_text'
    | 'thinking'
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

      // CLI envelope user message echo (internal, not direct user feedback)
      if (msgType === 'user' && !content.startsWith('[User Feedback]')) {
        return {
          raw: chunk,
          kind: 'system_hook',
          title: 'User Envelope',
          body: content,
        };
      }

      // AI Text & Thinking Message
      if (msgType === 'assistant' || val.role === 'assistant') {
        let text = '';
        let thinking = '';

        if (typeof val.content === 'string') {
          text = val.content;
        } else if (Array.isArray(val.content)) {
          text = (val.content as Array<{ type?: string; text?: string }>)
            .filter((c) => c && c.type === 'text')
            .map((c) => c.text || '')
            .filter(Boolean)
            .join('\n');
          thinking = (val.content as Array<{ type?: string; thinking?: string }>)
            .filter((c) => c && (c.type === 'thinking' || typeof c.thinking === 'string'))
            .map((c) => c.thinking || '')
            .filter(Boolean)
            .join('\n');
        } else if (val.message && typeof val.message === 'object') {
          const msgObj = val.message as {
            content?: Array<{ type?: string; text?: string; thinking?: string }>;
          };
          if (Array.isArray(msgObj.content)) {
            text = msgObj.content
              .filter((c) => c && c.type === 'text')
              .map((c) => c.text || '')
              .filter(Boolean)
              .join('\n');
            thinking = msgObj.content
              .filter((c) => c && (c.type === 'thinking' || typeof c.thinking === 'string'))
              .map((c) => c.thinking || '')
              .filter(Boolean)
              .join('\n');
          }
        }

        if (text) {
          return {
            raw: chunk,
            kind: 'ai_text',
            title: 'Phản hồi từ AI',
            body: text,
            details: thinking ? { thinking } : undefined,
          };
        }

        if (thinking) {
          const durationMs =
            typeof val.thinking_duration_ms === 'number' ? val.thinking_duration_ms : undefined;
          const durationStr = durationMs ? ` (${Math.round(durationMs / 1000)}s)` : '';
          return {
            raw: chunk,
            kind: 'thinking',
            title: `Suy nghĩ AI (Thinking)${durationStr}`,
            body: thinking,
          };
        }

        // Assistant message with neither text nor thinking and no tool call (e.g. empty envelope)
        return {
          raw: chunk,
          kind: 'system_hook',
          title: 'Assistant Hook',
          body: content,
        };
      }

      // Delta streaming text
      if (msgType === 'content_block_delta') {
        const delta = val.delta as { type?: string; text?: string; thinking?: string } | undefined;
        if (delta?.text) {
          return {
            raw: chunk,
            kind: 'ai_text',
            title: 'AI Streaming',
            body: delta.text,
          };
        }
        if (delta?.thinking || delta?.type === 'thinking_delta') {
          return {
            raw: chunk,
            kind: 'system_hook',
            title: 'Thinking Delta',
            body: content,
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
        const tokenCount = extractTokenCount(val);
        const tokenStr = tokenCount !== null ? ` • ${tokenCount.toLocaleString()} tokens` : '';
        const title = `Hoàn thành (${durationStr}${tokenStr})`;
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
  startedAt,
  finishedAt,
  onSendFeedback,
  onClearLogs,
  taskTitle,
  activeWorkers = [],
  onRemoveWorker,
}) => {
  const [inputText, setInputText] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [viewMode, setViewMode] = useState<'human' | 'raw'>('human');
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [dismissedWorkerIds, setDismissedWorkerIds] = useState<string[]>([]);
  const [liveElapsedSec, setLiveElapsedSec] = useState<number>(0);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Reset dismissed subagent state when active task changes
  useEffect(() => {
    setDismissedWorkerIds([]);
  }, [taskTitle]);

  const handleRemoveWorker = (workerId: string) => {
    setDismissedWorkerIds((prev) => (prev.includes(workerId) ? prev : [...prev, workerId]));
    onRemoveWorker?.(workerId);
    if (selectedAgent === workerId) {
      setSelectedAgent('all');
    }
  };

  // Track active thinking vs turn completion state
  const { isThinking, latestResultInfo } = useMemo(() => {
    let resultInfo: { durationStr: string; tokens?: string | undefined } | null = null;
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
            const tokenCount = extractTokenCount(val);
            const tokenStr =
              tokenCount !== null ? `${tokenCount.toLocaleString()} tokens` : undefined;
            resultInfo = {
              durationStr,
              tokens: tokenStr,
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

  // Filter logs by selected agent and exclude dismissed workers
  const filteredLogs = useMemo(() => {
    let base = logs;
    if (dismissedWorkerIds.length > 0) {
      base = base.filter(
        (l) => !l.workerId || !dismissedWorkerIds.includes(l.workerId)
      );
    }
    if (selectedAgent === 'all') return base;
    if (selectedAgent === 'master') return base.filter((l) => l.source !== 'worker');
    return base.filter((l) => l.workerId === selectedAgent || l.content.includes(selectedAgent));
  }, [logs, selectedAgent, dismissedWorkerIds]);

  // Track live timer and live session tokens
  const sessionTokens = useMemo(() => {
    return calculateSessionTokens(filteredLogs);
  }, [filteredLogs]);

  // Determine baseline start timestamp for live timer
  const effectiveStartTimestamp = useMemo(() => {
    if (startedAt) {
      const parsed = Date.parse(startedAt);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    // Fall back to first log's timestamp if available
    const firstChunk = logs[0];
    if (firstChunk && firstChunk.timestamp) {
      const parsed = Date.parse(firstChunk.timestamp);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return null;
  }, [startedAt, logs]);

  // Calculate static/finished duration in seconds
  const finishedElapsedSec = useMemo(() => {
    if (finishedAt && effectiveStartTimestamp) {
      const parsed = Date.parse(finishedAt);
      if (!isNaN(parsed) && parsed > effectiveStartTimestamp) {
        return Math.max(0, Math.round((parsed - effectiveStartTimestamp) / 1000));
      }
    }
    return 0;
  }, [finishedAt, effectiveStartTimestamp]);

  // Tick timer every second when agent is running or thinking
  useEffect(() => {
    if (!isRunning && !isThinking) {
      return;
    }

    const updateTimer = () => {
      if (effectiveStartTimestamp) {
        const now = Date.now();
        const diff = Math.max(0, Math.round((now - effectiveStartTimestamp) / 1000));
        setLiveElapsedSec(diff);
      } else {
        setLiveElapsedSec((prev) => prev + 1);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [isRunning, isThinking, effectiveStartTimestamp]);

  const displayElapsedSec = isRunning || isThinking
    ? liveElapsedSec
    : finishedElapsedSec || liveElapsedSec;

  // Discover all unique workers from props, logs, and parsed tool calls with exit tracking
  const allWorkers = useMemo(() => {
    const map = new Map<string, { workerId: string; role: string; status: AgentStatus }>();
    activeWorkers.forEach((w) => {
      map.set(w.workerId, { workerId: w.workerId, role: w.role, status: w.status });
    });

    logs.forEach((chunk) => {
      if (chunk.source === 'worker' && chunk.workerId) {
        if (!map.has(chunk.workerId)) {
          map.set(chunk.workerId, { workerId: chunk.workerId, role: 'Worker', status: 'running' });
        }
      }

      if (chunk.workerId && chunk.type === 'status_change') {
        const existing = map.get(chunk.workerId);
        if (existing) {
          const s = chunk.content.trim();
          if (s === 'done' || s === 'error' || s === 'interrupted') {
            map.set(chunk.workerId, { ...existing, status: s as AgentStatus });
          }
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
          } else if (msgType === 'tool_result') {
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
              if (id) {
                const existing = map.get(id);
                map.set(id, {
                  workerId: id,
                  role,
                  status: existing ? existing.status : 'running',
                });
              }
            }

            // Check if tool_result marks tool_use/subagent completed
            const bType = String(b.type || '');
            if (bType === 'tool_result' || msgType === 'tool_result') {
              const toolUseId = String(b.tool_use_id || b.id || val.tool_use_id || val.id || '');
              if (toolUseId && map.has(toolUseId)) {
                const existing = map.get(toolUseId)!;
                const isError = Boolean(b.is_error || val.is_error);
                map.set(toolUseId, {
                  ...existing,
                  status: isError ? 'error' : 'done',
                });
              }
            }
          });

          // Check if worker emitted turn result event
          if (chunk.workerId && val.type === 'result' && map.has(chunk.workerId)) {
            const existing = map.get(chunk.workerId)!;
            const isError = val.subtype === 'error';
            map.set(chunk.workerId, {
              ...existing,
              status: isError ? 'error' : 'done',
            });
          }
        } catch {
          // Ignore parse errors
        }
      }
    });

    return Array.from(map.values());
  }, [activeWorkers, logs]);

  // Exclude dismissed subagents from UI
  const visibleWorkers = useMemo(() => {
    return allWorkers.filter((w) => !dismissedWorkerIds.includes(w.workerId));
  }, [allWorkers, dismissedWorkerIds]);

  // Parse logs for human view, filtering out internal system hooks and deduplicating return display
  const parsedLogs = useMemo(() => {
    const rawItems = filteredLogs
      .map((chunk) => parseStreamChunk(chunk))
      .filter((item) => item.kind !== 'system_hook');

    const deduplicated: ParsedChunk[] = [];
    for (let i = 0; i < rawItems.length; i++) {
      const item = rawItems[i];
      if (!item) continue;

      if (item.title?.startsWith('Hoàn thành')) {
        const matchingPrevIdx = deduplicated.findLastIndex(
          (prev) => prev.kind === 'ai_text' && prev.body.trim() === item.body.trim()
        );
        if (matchingPrevIdx !== -1) {
          // Response text already shown in preceding AI message!
          // Upgrade that message's title with completion metrics and skip duplicate card.
          deduplicated[matchingPrevIdx] = {
            ...deduplicated[matchingPrevIdx]!,
            title: item.title,
          };
          continue;
        }
      }

      deduplicated.push(item);
    }

    return deduplicated;
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
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        components: {
          Segmented: {
            trackBg: '#09090b',
            itemSelectedBg: '#27272a',
            itemSelectedColor: '#ffffff',
            itemColor: '#cbd5e1',
            itemHoverColor: '#ffffff',
          },
        },
      }}
    >
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

              {/* Live Claude Code style metrics tag */}
              {isRunning || isThinking ? (
                <Tag
                  color="blue"
                  bordered={false}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: 11,
                    fontWeight: 600,
                    margin: 0,
                    backgroundColor: '#1e1b4b',
                    color: '#93c5fd',
                  }}
                >
                  <LoadingOutlined spin style={{ fontSize: 11 }} />
                  <span>{formatDuration(displayElapsedSec)}</span>
                  <span>•</span>
                  <span>{formatTokenCount(sessionTokens)}</span>
                </Tag>
              ) : displayElapsedSec > 0 || sessionTokens > 0 ? (
                <Tag
                  color="default"
                  bordered={false}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: 11,
                    fontWeight: 500,
                    margin: 0,
                    backgroundColor: '#18181b',
                    color: '#a1a1aa',
                  }}
                >
                  <CheckCircleOutlined style={{ fontSize: 11, color: '#10b981' }} />
                  <span>{formatDuration(displayElapsedSec)}</span>
                  <span>•</span>
                  <span>{formatTokenCount(sessionTokens)}</span>
                </Tag>
              ) : null}
            </Space>

            <Space direction="horizontal" size={8}>
              <Segmented
                size="small"
                value={viewMode}
                onChange={(val) => setViewMode(val as 'human' | 'raw')}
                options={[
                  {
                    label: <span style={{ fontWeight: 600 }}>Trực quan</span>,
                    value: 'human',
                    icon: <AppstoreOutlined />,
                  },
                  {
                    label: <span style={{ fontWeight: 600 }}>Raw Log</span>,
                    value: 'raw',
                    icon: <CodeOutlined />,
                  },
                ]}
                style={{
                  backgroundColor: '#09090b',
                  border: '1px solid #52525b',
                  padding: 2,
                }}
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
            <Text style={{ color: '#d4d4d8', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
              Tiến trình:
            </Text>
            <Segmented
              size="small"
              value={selectedAgent}
              onChange={(val) => setSelectedAgent(val as string)}
              options={[
                {
                  label: <span style={{ fontWeight: 600 }}>Tất cả</span>,
                  value: 'all',
                },
                {
                  label: (
                    <span
                      style={{
                        color: selectedAgent === 'master' ? '#f3e8ff' : '#c084fc',
                        fontWeight: 700,
                      }}
                    >
                      👑 Master Lead
                    </span>
                  ),
                  value: 'master',
                },
                ...visibleWorkers.map((w) => {
                  const isExited =
                    w.status === 'done' ||
                    w.status === 'error' ||
                    w.status === 'interrupted';
                  const isError = w.status === 'error';

                  return {
                    label: (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          color:
                            selectedAgent === w.workerId
                              ? (isExited ? '#e4e4e7' : '#e0f2fe')
                              : (isExited ? '#a1a1aa' : '#60a5fa'),
                          fontWeight: 700,
                        }}
                      >
                        {isExited ? (
                          <>
                            {isError ? (
                              <CloseCircleOutlined style={{ color: '#ef4444', fontSize: 11 }} />
                            ) : (
                              <CheckCircleOutlined style={{ color: '#10b981', fontSize: 11 }} />
                            )}
                            <span>{w.role || 'Worker'} ({w.workerId.slice(0, 6)})</span>
                            <Tag
                              bordered={false}
                              style={{
                                fontSize: 9,
                                lineHeight: '14px',
                                padding: '0 4px',
                                margin: 0,
                                background: isError ? '#450a0a' : '#14532d',
                                color: isError ? '#fca5a5' : '#86efac',
                              }}
                            >
                              {isError ? 'Lỗi' : 'Đã thoát'}
                            </Tag>
                            <Tooltip title="Xóa subagent khỏi terminal">
                              <CloseOutlined
                                style={{
                                  fontSize: 10,
                                  color: '#71717a',
                                  cursor: 'pointer',
                                  padding: '2px',
                                  marginLeft: 2,
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  handleRemoveWorker(w.workerId);
                                }}
                                role="button"
                                aria-label={`Xóa subagent ${w.workerId}`}
                              />
                            </Tooltip>
                          </>
                        ) : (
                          <span>⚡ {w.role || 'Worker'} ({w.workerId.slice(0, 6)})</span>
                        )}
                      </span>
                    ),
                    value: w.workerId,
                  };
                }),
              ]}
              style={{
                backgroundColor: '#09090b',
                border: '1px solid #52525b',
                padding: 2,
                fontSize: 11,
              }}
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
                        backgroundColor: isSubagent ? '#0b1329' : '#1e1435',
                        borderColor: isSubagent ? '#2563eb' : '#7c3aed',
                        borderLeft: `4px solid ${isSubagent ? '#3b82f6' : '#a855f7'}`,
                        borderRadius: 6,
                        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.4)',
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
                            <Tag
                              color="#1677ff"
                              style={{
                                margin: 0,
                                fontSize: 10,
                                fontWeight: 600,
                                border: '1px solid #3b82f6',
                              }}
                            >
                              Subagent Worker
                            </Tag>
                          ) : (
                            <Tag
                              color="#722ed1"
                              style={{
                                margin: 0,
                                fontSize: 10,
                                fontWeight: 600,
                                border: '1px solid #9333ea',
                              }}
                            >
                              Master Lead
                            </Tag>
                          )}
                          <Text strong style={{ color: '#ffffff', fontSize: 12 }}>
                            {item.title}
                          </Text>
                        </Space>
                        <Text style={{ fontSize: 10, color: '#a1a1aa' }}>
                          {new Date(item.raw.timestamp).toLocaleTimeString()}
                        </Text>
                      </div>
                      <div
                        style={{
                          color: '#f8fafc',
                          fontSize: 13,
                          whiteSpace: 'pre-wrap',
                          lineHeight: 1.6,
                        }}
                      >
                        {item.body}
                      </div>

                      {Boolean(
                        item.details &&
                          typeof item.details === 'object' &&
                          (item.details as Record<string, unknown>).thinking
                      ) && (
                        <div style={{ marginTop: 6 }}>
                          <Collapse
                            ghost
                            size="small"
                            items={[
                              {
                                key: 'thinking',
                                label: (
                                  <span style={{ color: '#a78bfa', fontSize: 11, fontStyle: 'italic' }}>
                                    💭 Xem suy nghĩ nội bộ (Thinking)
                                  </span>
                                ),
                                children: (
                                  <div
                                    style={{
                                      fontSize: 11,
                                      color: '#a1a1aa',
                                      whiteSpace: 'pre-wrap',
                                      lineHeight: 1.5,
                                      maxHeight: 160,
                                      overflowY: 'auto',
                                      backgroundColor: '#09090b',
                                      padding: 6,
                                      borderRadius: 4,
                                    }}
                                  >
                                    {String((item.details as Record<string, unknown>).thinking)}
                                  </div>
                                ),
                              },
                            ]}
                          />
                        </div>
                      )}
                    </Card>
                  );
                }

                if (item.kind === 'thinking') {
                  return (
                    <div
                      key={idx}
                      style={{
                        backgroundColor: '#13111c',
                        border: '1px solid #2e1065',
                        borderLeft: '3px solid #8b5cf6',
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
                          <BulbOutlined style={{ color: '#a78bfa' }} />
                          <Text strong style={{ color: '#a78bfa', fontSize: 12 }}>
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

                      <div style={{ marginTop: 4 }}>
                        <Collapse
                          ghost
                          size="small"
                          items={[
                            {
                              key: 'thought_body',
                              label: (
                                <span style={{ color: '#71717a', fontSize: 11, fontStyle: 'italic' }}>
                                  Xem chuỗi suy nghĩ ({item.body.length} ký tự)
                                </span>
                              ),
                              children: (
                                <div
                                  style={{
                                    fontSize: 11,
                                    color: '#cbd5e1',
                                    whiteSpace: 'pre-wrap',
                                    lineHeight: 1.5,
                                    maxHeight: 200,
                                    overflowY: 'auto',
                                    backgroundColor: '#09090b',
                                    padding: 8,
                                    borderRadius: 4,
                                  }}
                                >
                                  {item.body}
                                </div>
                              ),
                            },
                          ]}
                        />
                      </div>
                    </div>
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
                justifyContent: 'space-between',
                padding: '8px 12px',
                backgroundColor: '#18181b',
                border: '1px solid #27272a',
                borderRadius: 4,
                marginTop: 8,
                color: '#818cf8',
              }}
            >
              <Space size={8}>
                <Spin
                  indicator={<LoadingOutlined style={{ fontSize: 14, color: '#818cf8' }} spin />}
                />
                <span style={{ fontSize: 12 }}>Claude AI đang xử lý / suy nghĩ...</span>
              </Space>
              <span style={{ fontSize: 11, color: '#93c5fd', fontFamily: 'monospace' }}>
                {formatDuration(displayElapsedSec)} • {formatTokenCount(sessionTokens)}
              </span>
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
                Đã hoàn thành trong {formatDuration(displayElapsedSec || 0)} ({formatTokenCount(sessionTokens)}) — Sẵn sàng nhận chỉ đạo mới.
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
