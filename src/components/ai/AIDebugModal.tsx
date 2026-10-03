import React, { useState, useEffect } from 'react';
import {
  Modal,
  Tabs,
  Select,
  Button,
  Tag,
  Typography,
  Empty,
  Space,
  message,
  Card,
  theme,
} from 'antd';
import {
  BugOutlined,
  CopyOutlined,
  DeleteOutlined,
  CodeOutlined,
  ToolOutlined,
  FieldTimeOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { aiDebugService, AiDebugTurn } from '../../services/ai/aiDebugService';
import { isTauriApp } from '../../utils/timerPopout';

const { Text, Paragraph } = Typography;

export interface AIDebugModalProps {
  open: boolean;
  onClose: () => void;
}

export const AIDebugModal: React.FC<AIDebugModalProps> = ({ open, onClose }) => {
  const { token } = theme.useToken();
  const [turns, setTurns] = useState<AiDebugTurn[]>(() => aiDebugService.getTurns());
  const [selectedTurnId, setSelectedTurnId] = useState<string | null>(null);

  useEffect(() => {
    const update = () => {
      const all = aiDebugService.getTurns();
      setTurns(all);
      if (all.length > 0) {
        setSelectedTurnId((prev) => (prev && all.some((t) => t.id === prev) ? prev : all[0]?.id || null));
      } else {
        setSelectedTurnId(null);
      }
    };

    update();
    const unsub = aiDebugService.subscribe(update);
    return unsub;
  }, [open]);

  const activeTurn = turns.find((t) => t.id === selectedTurnId) || turns[0] || null;

  const handleClear = () => {
    aiDebugService.clearLogs();
    message.success('Đã xóa toàn bộ nhật ký gỡ lỗi AI');
  };

  const handleCopyText = (content: string, label: string) => {
    navigator.clipboard.writeText(content);
    message.success(`Đã sao chép ${label} vào bộ nhớ tạm`);
  };

  const handleCopyTurnJson = () => {
    if (!activeTurn) return;
    navigator.clipboard.writeText(JSON.stringify(activeTurn, null, 2));
    message.success('Đã sao chép toàn bộ lượt chat JSON');
  };

  const handleOpenTauriDevTools = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open_devtools');
    } catch (err) {
      console.warn('Cannot open devtools:', err);
      message.error('Không thể mở Tauri DevTools: ' + String(err));
    }
  };

  const renderStatusTag = (status: AiDebugTurn['status']) => {
    switch (status) {
      case 'completed':
        return <Tag icon={<CheckCircleOutlined />} color="success">Completed</Tag>;
      case 'running':
        return <Tag icon={<SyncOutlined spin />} color="processing">Running</Tag>;
      case 'error':
        return <Tag icon={<CloseCircleOutlined />} color="error">Error</Tag>;
      case 'aborted':
        return <Tag icon={<StopOutlined />} color="default">Aborted</Tag>;
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={900}
      mask={false}
      focusable={{ trap: false, focusTriggerAfterClose: false }}
      wrapProps={{ style: { pointerEvents: 'none' } }}
      style={{ top: 32, pointerEvents: 'auto' }}
      styles={{
        wrapper: { pointerEvents: 'none', zIndex: 1001 },
        body: { maxHeight: '72vh', overflowY: 'auto', paddingRight: 8 },
      }}
      modalRender={(modalNode) => (
        <div style={{ pointerEvents: 'auto' }}>
          {modalNode}
        </div>
      )}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BugOutlined style={{ color: token.colorPrimary, fontSize: 18 }} />
          <span>Nhật ký gỡ lỗi AI & Payloads</span>
          {activeTurn && renderStatusTag(activeTurn.status)}
        </div>
      }
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 16,
          padding: '8px 12px',
          background: token.colorFillAlter,
          borderRadius: 6,
          border: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 260 }}>
          <Text strong style={{ fontSize: 13, whiteSpace: 'nowrap' }}>Lượt chat:</Text>
          <Select
            value={activeTurn?.id}
            onChange={(val) => setSelectedTurnId(val ?? null)}
            style={{ width: '100%', maxWidth: 450 }}
            placeholder="Chọn lượt chat để kiểm tra"
            options={turns.map((t, idx) => ({
              value: t.id,
              label: `#${turns.length - idx} [${new Date(t.timestamp).toLocaleTimeString()}] ${t.model} (${t.status}) - ${t.scope}`,
            }))}
            disabled={turns.length === 0}
          />
        </div>

        <Space wrap>
          {isTauriApp() && (
            <Button size="small" onClick={handleOpenTauriDevTools} icon={<CodeOutlined />}>
              Mở Tauri DevTools
            </Button>
          )}
          <Button
            size="small"
            icon={<CopyOutlined />}
            onClick={handleCopyTurnJson}
            disabled={!activeTurn}
          >
            Sao chép toàn bộ JSON
          </Button>
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={handleClear}
            disabled={turns.length === 0}
          >
            Xóa nhật ký
          </Button>
        </Space>
      </div>

      {!activeTurn ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Chưa có dữ liệu gỡ lỗi. Hãy gửi một tin nhắn AI để bắt đầu theo dõi."
        />
      ) : (
        <div>
          <div
            style={{
              display: 'flex',
              gap: 16,
              marginBottom: 12,
              fontSize: 12,
              color: token.colorTextSecondary,
              flexWrap: 'wrap',
            }}
          >
            <span><strong>Model:</strong> {activeTurn.model}</span>
            <span><strong>Ngữ cảnh:</strong> {activeTurn.scope}</span>
            <span>
              <strong>Thời gian:</strong> {new Date(activeTurn.timestamp).toLocaleString()}
            </span>
            {activeTurn.durationMs !== undefined && (
              <span><strong>Độ trễ:</strong> {activeTurn.durationMs}ms</span>
            )}
            <span><strong>Số chunk:</strong> {activeTurn.chunkCount}</span>
            <span><strong>Công cụ gọi:</strong> {activeTurn.toolExecutions.length}</span>
          </div>

          <Tabs
            defaultActiveKey="payload"
            size="small"
            items={[
              {
                key: 'payload',
                label: `Payload tin nhắn (${activeTurn.messagesSent.length})`,
                children: (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                      <Button
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={() =>
                          handleCopyText(JSON.stringify(activeTurn.messagesSent, null, 2), 'Payload tin nhắn')
                        }
                      >
                        Sao chép Messages JSON
                      </Button>
                    </div>
                    <pre
                      style={{
                        background: token.colorFillQuaternary,
                        padding: 12,
                        borderRadius: 6,
                        maxHeight: 380,
                        overflow: 'auto',
                        fontSize: 12,
                        fontFamily: 'monospace',
                        border: `1px solid ${token.colorBorderSecondary}`,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {JSON.stringify(activeTurn.messagesSent, null, 2)}
                    </pre>
                  </div>
                ),
              },
              {
                key: 'systemPrompt',
                label: 'System Prompt & Ngữ cảnh',
                children: (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                      <Button
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={() =>
                          handleCopyText(activeTurn.systemPrompt || '', 'System Prompt')
                        }
                        disabled={!activeTurn.systemPrompt}
                      >
                        Sao chép Prompt
                      </Button>
                    </div>
                    {activeTurn.systemPrompt ? (
                      <pre
                        style={{
                          background: token.colorFillQuaternary,
                          padding: 12,
                          borderRadius: 6,
                          maxHeight: 380,
                          overflow: 'auto',
                          fontSize: 12,
                          fontFamily: 'monospace',
                          border: `1px solid ${token.colorBorderSecondary}`,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {activeTurn.systemPrompt}
                      </pre>
                    ) : (
                      <Text type="secondary">Không có system prompt riêng cho lượt này.</Text>
                    )}
                  </div>
                ),
              },
              {
                key: 'tools',
                label: `Công cụ Tools (${activeTurn.toolExecutions.length})`,
                children: (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {activeTurn.toolExecutions.length === 0 ? (
                      <Text type="secondary">Không có công cụ nào được gọi trong lượt này.</Text>
                    ) : (
                      activeTurn.toolExecutions.map((tool, i) => (
                        <Card
                          key={tool.id || i}
                          size="small"
                          title={
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <ToolOutlined style={{ color: token.colorPrimary }} />
                              <Text strong code>{tool.name}</Text>
                              {tool.durationMs !== undefined && (
                                <Tag icon={<FieldTimeOutlined />} color="default">
                                  {tool.durationMs}ms
                                </Tag>
                              )}
                            </div>
                          }
                          extra={
                            <Button
                              size="small"
                              type="text"
                              icon={<CopyOutlined />}
                              onClick={() =>
                                handleCopyText(
                                  JSON.stringify({ args: tool.args, result: tool.result }, null, 2),
                                  `Tool ${tool.name}`
                                )
                              }
                            />
                          }
                        >
                          <div style={{ marginBottom: 6 }}>
                            <Text strong style={{ fontSize: 12 }}>Tham số (Arguments):</Text>
                            <pre
                              style={{
                                background: token.colorFillQuaternary,
                                padding: 8,
                                borderRadius: 4,
                                fontSize: 11,
                                fontFamily: 'monospace',
                                margin: '4px 0',
                                whiteSpace: 'pre-wrap',
                              }}
                            >
                              {JSON.stringify(tool.args, null, 2)}
                            </pre>
                          </div>
                          <div>
                            <Text strong style={{ fontSize: 12 }}>Kết quả trả về (Result):</Text>
                            <pre
                              style={{
                                background: token.colorFillQuaternary,
                                padding: 8,
                                borderRadius: 4,
                                maxHeight: 180,
                                overflow: 'auto',
                                fontSize: 11,
                                fontFamily: 'monospace',
                                margin: '4px 0',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                              }}
                            >
                              {tool.result || '(Đang thực thi hoặc không có kết quả)'}
                            </pre>
                          </div>
                        </Card>
                      ))
                    )}
                  </div>
                ),
              },
              {
                key: 'response',
                label: 'Kết quả phản hồi (LLM)',
                children: (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                      <Button
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={() =>
                          handleCopyText(
                            activeTurn.finalResponse || activeTurn.responseStream || '',
                            'Phản hồi AI'
                          )
                        }
                      >
                        Sao chép phản hồi
                      </Button>
                    </div>
                    {activeTurn.error && (
                      <Paragraph type="danger" strong style={{ marginBottom: 8 }}>
                        Lỗi: {activeTurn.error}
                      </Paragraph>
                    )}
                    <pre
                      style={{
                        background: token.colorFillQuaternary,
                        padding: 12,
                        borderRadius: 6,
                        maxHeight: 380,
                        overflow: 'auto',
                        fontSize: 12,
                        fontFamily: 'monospace',
                        border: `1px solid ${token.colorBorderSecondary}`,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {activeTurn.finalResponse || activeTurn.responseStream || '(Chưa có phản hồi)'}
                    </pre>
                  </div>
                ),
              },
              {
                key: 'events',
                label: `Dòng thời gian (${activeTurn.events.length})`,
                children: (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {activeTurn.events.map((ev) => {
                      const offsetMs = ev.timestamp - activeTurn.timestamp;
                      return (
                        <div
                          key={ev.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '4px 8px',
                            background: token.colorFillQuaternary,
                            borderRadius: 4,
                            fontSize: 12,
                          }}
                        >
                          <Space>
                            <Tag color="blue">{ev.type}</Tag>
                            <Text code style={{ fontSize: 11 }}>
                              +{offsetMs}ms
                            </Text>
                            {ev.payload?.name && <Text strong>{ev.payload.name}</Text>}
                            {ev.payload?.status && <Tag>{ev.payload.status}</Tag>}
                          </Space>
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            {new Date(ev.timestamp).toLocaleTimeString()}
                          </Text>
                        </div>
                      );
                    })}
                  </div>
                ),
              },
            ]}
          />
        </div>
      )}
    </Modal>
  );
};
