import React, { useEffect, useState } from 'react';
import { Modal, Tabs, Select, Button, Tag, Typography, Empty, Space, message, Card, theme } from 'antd';
import { BugOutlined, CopyOutlined, DeleteOutlined, CodeOutlined, ToolOutlined, FieldTimeOutlined, CheckCircleOutlined, CloseCircleOutlined, SyncOutlined, StopOutlined } from '@ant-design/icons';
import { aiDebugService, AiDebugTurn } from '../../services/ai/aiDebugService';
import { isTauriApp } from '../../utils/timerPopout';

const { Text } = Typography;

function eventLabel(payload: AiDebugTurn['events'][number]['payload'] | undefined): string {
  if (!payload) return '';
  if ('status' in payload && typeof payload.status === 'string') return payload.status;
  if ('errorCode' in payload && typeof payload.errorCode === 'string') return payload.errorCode;
  return '';
}

export interface AIDebugModalProps { open: boolean; onClose: () => void; }

export const AIDebugModal: React.FC<AIDebugModalProps> = ({ open, onClose }) => {
  const { token } = theme.useToken();
  const [turns, setTurns] = useState<AiDebugTurn[]>(() => aiDebugService.getTurns());
  const [selectedTurnId, setSelectedTurnId] = useState<string | null>(null);

  useEffect(() => {
    const update = () => {
      const all = aiDebugService.getTurns();
      setTurns(all);
      setSelectedTurnId((prev) => (prev && all.some((turn) => turn.id === prev) ? prev : all[0]?.id ?? null));
    };
    update();
    return aiDebugService.subscribe(update);
  }, [open]);

  const activeTurn = turns.find((turn) => turn.id === selectedTurnId) ?? turns[0] ?? null;
  const renderStatusTag = (status: AiDebugTurn['status']) => {
    switch (status) {
      case 'completed': return <Tag icon={<CheckCircleOutlined />} color="success">Completed</Tag>;
      case 'running': return <Tag icon={<SyncOutlined spin />} color="processing">Running</Tag>;
      case 'error': return <Tag icon={<CloseCircleOutlined />} color="error">Error</Tag>;
      case 'aborted': return <Tag icon={<StopOutlined />} color="default">Aborted</Tag>;
    }
  };
  const handleCopyTurnJson = () => {
    if (!activeTurn) return;
    void navigator.clipboard.writeText(JSON.stringify(activeTurn, null, 2));
    message.success('Đã sao chép JSON chẩn đoán đã lọc');
  };
  const handleOpenTauriDevTools = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open_devtools');
    } catch {
      message.error('Không thể mở Tauri DevTools');
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
      styles={{ wrapper: { pointerEvents: 'none', zIndex: 1001 }, body: { maxHeight: '72vh', overflowY: 'auto', paddingRight: 8 } }}
      modalRender={(modalNode) => <div style={{ pointerEvents: 'auto' }}>{modalNode}</div>}
      title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><BugOutlined style={{ color: token.colorPrimary, fontSize: 18 }} /><span>Nhật ký gỡ lỗi AI &amp; Payloads</span>{activeTurn && renderStatusTag(activeTurn.status)}</div>}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 16, padding: '8px 12px', background: token.colorFillAlter, borderRadius: 6, border: `1px solid ${token.colorBorderSecondary}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 260 }}><Text strong style={{ fontSize: 13, whiteSpace: 'nowrap' }}>Lượt chat:</Text><Select value={activeTurn?.id} onChange={(value) => setSelectedTurnId(value ?? null)} style={{ width: '100%', maxWidth: 450 }} placeholder="Chọn lượt chat để kiểm tra" options={turns.map((turn, index) => ({ value: turn.id, label: `#${turns.length - index} [${new Date(turn.timestamp).toLocaleTimeString()}] ${turn.model} (${turn.status}) - ${turn.scope}` }))} disabled={turns.length === 0} /></div>
        <Space wrap>{isTauriApp() && <Button size="small" onClick={() => void handleOpenTauriDevTools()} icon={<CodeOutlined />}>Mở Tauri DevTools</Button>}<Button size="small" icon={<CopyOutlined />} onClick={handleCopyTurnJson} disabled={!activeTurn}>Sao chép JSON an toàn</Button><Button size="small" danger icon={<DeleteOutlined />} onClick={() => { aiDebugService.clearLogs(); message.success('Đã xóa nhật ký gỡ lỗi AI'); }} disabled={turns.length === 0}>Xóa nhật ký</Button></Space>
      </div>
      {!activeTurn ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có dữ liệu gỡ lỗi." /> : <div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 12, color: token.colorTextSecondary, flexWrap: 'wrap' }}><span><strong>Model:</strong> {activeTurn.model}</span><span><strong>Ngữ cảnh:</strong> {activeTurn.scope}</span><span><strong>Thời gian:</strong> {new Date(activeTurn.timestamp).toLocaleString()}</span>{activeTurn.durationMs !== undefined && <span><strong>Độ trễ:</strong> {activeTurn.durationMs}ms</span>}<span><strong>Chunk:</strong> {activeTurn.chunkCount} ({activeTurn.responseStreamLength} ký tự)</span><span><strong>Tin nhắn:</strong> {activeTurn.messageCount} ({activeTurn.messageChars} ký tự)</span><span><strong>System prompt:</strong> {activeTurn.systemPromptLength} ký tự</span><span><strong>Tools:</strong> {activeTurn.toolCount}</span></div>
        <Tabs defaultActiveKey="metadata" size="small" items={[{ key: 'metadata', label: 'Metadata', children: <Card size="small"><Text type="secondary">Chẩn đoán chỉ giữ số lượng, độ dài, tên công cụ, thời lượng và mã lỗi ổn định. Nội dung yêu cầu, phản hồi, tham số và lỗi không được lưu.</Text>{activeTurn.errorCode && <div style={{ marginTop: 8 }}><Text strong>Mã lỗi:</Text> <Tag color="error">{activeTurn.errorCode}</Tag></div>}{activeTurn.finalResponseLength !== undefined && <div style={{ marginTop: 8 }}><Text strong>Độ dài phản hồi cuối:</Text> {activeTurn.finalResponseLength} ký tự</div>}</Card> }, { key: 'tools', label: `Tools (${activeTurn.toolExecutions.length})`, children: activeTurn.toolExecutions.length === 0 ? <Text type="secondary">Không có công cụ.</Text> : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{activeTurn.toolExecutions.map((tool) => <Card key={tool.id} size="small" title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ToolOutlined style={{ color: token.colorPrimary }} /><Text strong code>{tool.name}</Text>{tool.durationMs !== undefined && <Tag icon={<FieldTimeOutlined />}>{tool.durationMs}ms</Tag>}</div>}><Text type="secondary">{tool.argumentCount} tham số, kết quả {tool.resultLength ?? 0} ký tự</Text></Card>)}</div> }, { key: 'events', label: `Dòng thời gian (${activeTurn.events.length})`, children: <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{activeTurn.events.map((event) => <div key={event.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', background: token.colorFillQuaternary, borderRadius: 4, fontSize: 12 }}><Space><Tag color="blue">{event.type}</Tag><Text code style={{ fontSize: 11 }}>+{event.timestamp - activeTurn.timestamp}ms</Text>{eventLabel(event.payload) && <Text strong>{eventLabel(event.payload)}</Text>}</Space><Text type="secondary" style={{ fontSize: 11 }}>{new Date(event.timestamp).toLocaleTimeString()}</Text></div>)}</div> }]}/>
      </div>}
    </Modal>
  );
};
