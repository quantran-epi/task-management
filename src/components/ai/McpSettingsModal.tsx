import React, { useEffect, useState } from 'react';
import {
  Modal,
  List,
  Switch,
  Tag,
  Typography,
  Space,
  Button,
  message,
  theme,
  Alert,
} from 'antd';
import {
  ApiOutlined,
  DatabaseOutlined,
  SettingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { type TaskPlannerDatabase } from '../../db';
import {
  getMcpServers,
  toggleMcpServer,
  testMcpServerConnection,
  type McpServerConfig,
} from '../../services/ai/mcpClient';
import { isTauriApp } from '../../utils/timerPopout';

const { Text, Paragraph } = Typography;

export interface McpSettingsModalProps {
  open: boolean;
  onClose: () => void;
  db?: TaskPlannerDatabase;
  onSettingsChange?: () => void;
  onOpenSettings?: (() => void) | undefined;
}

export const McpSettingsModal: React.FC<McpSettingsModalProps> = ({
  open,
  onClose,
  db,
  onSettingsChange,
  onOpenSettings,
}) => {
  const { token } = theme.useToken();
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<
    Record<string, { ok: boolean; message: string; toolsCount?: number }>
  >({});

  const isTauri = isTauriApp();

  const loadServers = async () => {
    try {
      const list = await getMcpServers(db);
      setServers(list);
    } catch (err) {
      console.error('Failed to load MCP servers:', err);
    }
  };

  useEffect(() => {
    if (open) {
      loadServers();
      setTestResults({});
    }
  }, [open, db]);

  const handleToggle = async (id: string, checked: boolean) => {
    setLoading(true);
    try {
      const next = await toggleMcpServer(id, checked, db);
      setServers(next);
      message.success(
        checked
          ? 'Đã bật máy chủ MCP.'
          : 'Đã tắt máy chủ MCP. Công cụ sẽ không nạp vào cuộc trò chuyện.'
      );
      onSettingsChange?.();
    } catch (err: any) {
      message.error(`Không thể thay đổi trạng thái MCP: ${err?.message || 'Lỗi không xác định'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async (server: McpServerConfig) => {
    setTestingId(server.id);
    try {
      const res = await testMcpServerConnection(server);
      setTestResults((prev) => ({ ...prev, [server.id]: res }));
      if (res.ok) {
        message.success(res.message);
      } else {
        message.error(res.message);
      }
    } catch (err: any) {
      const fail = { ok: false, message: err?.message || 'Lỗi kết nối' };
      setTestResults((prev) => ({ ...prev, [server.id]: fail }));
      message.error(fail.message);
    } finally {
      setTestingId(null);
    }
  };

  const handleNavigateToSettings = () => {
    onClose();
    onOpenSettings?.();
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 24 }}>
          <Space>
            <ApiOutlined style={{ color: token.colorPrimary }} />
            <span>Bật / Tắt Máy chủ MCP</span>
          </Space>
          {onOpenSettings && (
            <Button
              type="primary"
              size="small"
              icon={<SettingOutlined />}
              onClick={handleNavigateToSettings}
            >
              Đi đến Cài đặt
            </Button>
          )}
        </div>
      }
      width={640}
      destroyOnClose
    >
      <Paragraph style={{ color: token.colorTextSecondary, marginTop: 8 }}>
        Bật hoặc tắt máy chủ Model Context Protocol (MCP) cho phiên trò chuyện hiện tại. Để thêm mới, chỉnh sửa
        hoặc xóa máy chủ MCP, vui lòng quản lý trong{' '}
        {onOpenSettings ? (
          <Button
            type="link"
            size="small"
            style={{ padding: 0 }}
            onClick={handleNavigateToSettings}
          >
            Cài đặt
          </Button>
        ) : (
          'Cài đặt'
        )}
        .
      </Paragraph>

      {servers.length === 0 ? (
        <Text type="secondary">Chưa có máy chủ MCP nào được cấu hình.</Text>
      ) : (
        <List
          dataSource={servers}
          renderItem={(server) => {
            const testRes = testResults[server.id];
            const isTesting = testingId === server.id;

            return (
              <List.Item
                key={server.id}
                style={{
                  padding: '12px 14px',
                  borderRadius: 8,
                  border: `1px solid ${token.colorBorderSecondary}`,
                  background: token.colorFillAlter,
                  marginBottom: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'stretch',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Space align="center" wrap>
                    <DatabaseOutlined style={{ fontSize: 16, color: token.colorPrimary }} />
                    <Text strong style={{ fontSize: 13 }}>{server.name}</Text>
                    {server.desktopOnly && (
                      <Tag color={isTauri ? 'green' : 'orange'}>
                        {isTauri ? 'Desktop' : 'Yêu cầu Desktop'}
                      </Tag>
                    )}
                  </Space>
                  <Space size="middle">
                    <Button
                      size="small"
                      icon={<SyncOutlined spin={isTesting} />}
                      loading={isTesting}
                      onClick={() => handleTestConnection(server)}
                    >
                      Thử kết nối
                    </Button>
                    <Switch
                      checked={server.enabled}
                      loading={loading}
                      onChange={(checked) => handleToggle(server.id, checked)}
                      aria-label={`Bật/tắt ${server.name}`}
                    />
                  </Space>
                </div>

                <div style={{ marginTop: 6 }}>
                  <Text code style={{ fontSize: 11, wordBreak: 'break-all' }}>
                    {server.url}
                  </Text>
                </div>

                {server.instruction && (
                  <div
                    style={{
                      marginTop: 6,
                      padding: '4px 8px',
                      background: token.colorBgContainer,
                      borderRadius: 4,
                      border: `1px dashed ${token.colorBorderSecondary}`,
                      maxHeight: 50,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    <Text type="secondary" style={{ fontSize: 11, whiteSpace: 'pre-line' }}>
                      {server.instruction.slice(0, 120)}
                      {server.instruction.length > 120 ? '...' : ''}
                    </Text>
                  </div>
                )}

                {testRes && (
                  <div style={{ marginTop: 6 }}>
                    <Alert
                      type={testRes.ok ? 'success' : 'error'}
                      showIcon
                      icon={testRes.ok ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                      message={testRes.message}
                      style={{ padding: '2px 8px', fontSize: 11 }}
                    />
                  </div>
                )}
              </List.Item>
            );
          }}
        />
      )}
    </Modal>
  );
};
