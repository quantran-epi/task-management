import React, { useEffect, useState } from 'react';
import {
  Modal,
  List,
  Switch,
  Tag,
  Typography,
  Space,
  Button,
  Form,
  Input,
  Popconfirm,
  message,
  theme,
  Alert,
} from 'antd';
import {
  ApiOutlined,
  DatabaseOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { type TaskPlannerDatabase } from '../../db';
import {
  getMcpServers,
  upsertMcpServer,
  deleteMcpServer,
  toggleMcpServer,
  testMcpServerConnection,
  type McpServerConfig,
} from '../../services/ai/mcpClient';
import { isTauriApp } from '../../utils/timerPopout';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

export interface McpSettingsModalProps {
  open: boolean;
  onClose: () => void;
  db?: TaskPlannerDatabase;
  onSettingsChange?: () => void;
}

export const McpSettingsModal: React.FC<McpSettingsModalProps> = ({
  open,
  onClose,
  db,
  onSettingsChange,
}) => {
  const { token } = theme.useToken();
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<
    Record<string, { ok: boolean; message: string; toolsCount?: number }>
  >({});

  // Add / Edit form modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<McpServerConfig | null>(null);
  const [form] = Form.useForm();

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

  const handleDelete = async (id: string) => {
    try {
      const next = await deleteMcpServer(id, db);
      setServers(next);
      message.success('Đã xóa máy chủ MCP.');
      onSettingsChange?.();
    } catch (err: any) {
      message.error(`Không thể xóa máy chủ MCP: ${err?.message || 'Lỗi không xác định'}`);
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

  const handleOpenAdd = () => {
    setEditingServer(null);
    form.resetFields();
    form.setFieldsValue({
      name: '',
      url: 'http://',
      instruction: '',
      enabled: true,
      desktopOnly: false,
    });
    setEditModalOpen(true);
  };

  const handleOpenEdit = (server: McpServerConfig) => {
    setEditingServer(server);
    form.setFieldsValue({
      name: server.name,
      url: server.url,
      instruction: server.instruction,
      enabled: server.enabled,
      desktopOnly: Boolean(server.desktopOnly),
    });
    setEditModalOpen(true);
  };

  const handleSaveForm = async () => {
    try {
      const values = await form.validateFields();
      const serverToSave: McpServerConfig = {
        id: editingServer ? editingServer.id : `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: values.name.trim(),
        url: values.url.trim(),
        instruction: values.instruction || '',
        enabled: values.enabled ?? true,
        desktopOnly: values.desktopOnly,
      };

      const next = await upsertMcpServer(serverToSave, db);
      setServers(next);
      setEditModalOpen(false);
      message.success(editingServer ? 'Đã cập nhật máy chủ MCP.' : 'Đã thêm máy chủ MCP mới.');
      onSettingsChange?.();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(`Không thể lưu máy chủ MCP: ${err?.message || 'Lỗi không xác định'}`);
    }
  };

  return (
    <>
      <Modal
        open={open}
        onCancel={onClose}
        footer={null}
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 24 }}>
            <Space>
              <ApiOutlined style={{ color: token.colorPrimary }} />
              <span>Quản lý máy chủ MCP</span>
            </Space>
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={handleOpenAdd}
            >
              Thêm máy chủ
            </Button>
          </div>
        }
        width={680}
        destroyOnClose
      >
        <Paragraph style={{ color: token.colorTextSecondary, marginTop: 8 }}>
          Định cấu hình các máy chủ Model Context Protocol (MCP) dạng HTTP endpoint. Trợ lý AI sẽ tự động nạp
          công cụ và chỉ dẫn chuyên ngành từ các máy chủ được bật.
        </Paragraph>

        <List
          dataSource={servers}
          renderItem={(server) => {
            const testRes = testResults[server.id];
            const isTesting = testingId === server.id;

            return (
              <List.Item
                key={server.id}
                style={{
                  padding: '14px 16px',
                  borderRadius: 8,
                  border: `1px solid ${token.colorBorderSecondary}`,
                  background: token.colorFillAlter,
                  marginBottom: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'stretch',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Space align="center" wrap>
                    <DatabaseOutlined style={{ fontSize: 18, color: token.colorPrimary }} />
                    <Text strong style={{ fontSize: 14 }}>{server.name}</Text>
                    {server.desktopOnly && (
                      <Tag color={isTauri ? 'green' : 'orange'}>
                        {isTauri ? 'Tauri Desktop' : 'Yêu cầu Desktop'}
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
                      Kiểm tra kết nối
                    </Button>
                    <Button
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => handleOpenEdit(server)}
                    />
                    <Popconfirm
                      title="Xóa máy chủ MCP này?"
                      description="Các công cụ và chỉ dẫn của máy chủ này sẽ bị gỡ bỏ."
                      onConfirm={() => handleDelete(server.id)}
                      okText="Xóa"
                      cancelText="Hủy"
                      okButtonProps={{ danger: true }}
                    >
                      <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                    <Switch
                      checked={server.enabled}
                      loading={loading}
                      onChange={(checked) => handleToggle(server.id, checked)}
                      aria-label={`Bật/tắt ${server.name}`}
                    />
                  </Space>
                </div>

                <div style={{ marginTop: 8 }}>
                  <Text code style={{ fontSize: 12, wordBreak: 'break-all' }}>
                    {server.url}
                  </Text>
                </div>

                {server.instruction && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: '6px 10px',
                      background: token.colorBgContainer,
                      borderRadius: 6,
                      border: `1px dashed ${token.colorBorderSecondary}`,
                      maxHeight: 60,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    <Text type="secondary" style={{ fontSize: 11, whiteSpace: 'pre-line' }}>
                      {server.instruction.slice(0, 150)}
                      {server.instruction.length > 150 ? '...' : ''}
                    </Text>
                  </div>
                )}

                {testRes && (
                  <div style={{ marginTop: 8 }}>
                    <Alert
                      type={testRes.ok ? 'success' : 'error'}
                      showIcon
                      icon={testRes.ok ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                      message={testRes.message}
                      style={{ padding: '4px 10px', fontSize: 12 }}
                    />
                  </div>
                )}
              </List.Item>
            );
          }}
        />
      </Modal>

      {/* Add / Edit Modal */}
      <Modal
        open={editModalOpen}
        onCancel={() => setEditModalOpen(false)}
        onOk={handleSaveForm}
        title={editingServer ? 'Chỉnh sửa máy chủ MCP' : 'Thêm máy chủ MCP'}
        okText="Lưu máy chủ"
        cancelText="Hủy"
        destroyOnClose
        width={560}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item
            name="name"
            label="Tên máy chủ"
            rules={[{ required: true, message: 'Vui lòng nhập tên máy chủ' }]}
          >
            <Input placeholder="Ví dụ: Graphiti Banking MCP, Docs Server..." />
          </Form.Item>

          <Form.Item
            name="url"
            label="Địa chỉ Endpoint (HTTP/HTTPS)"
            rules={[
              { required: true, message: 'Vui lòng nhập địa chỉ MCP endpoint' },
              {
                pattern: /^https?:\/\//i,
                message: 'URL phải bắt đầu bằng http:// hoặc https://',
              },
            ]}
          >
            <Input placeholder="http://10.4.97.70:30456/mcp" />
          </Form.Item>

          <Form.Item
            name="instruction"
            label="Chỉ dẫn chuyên ngành (Domain Prompt / Rules)"
            extra="Chỉ dẫn này sẽ được tự động tiêm vào system prompt của AI khi máy chủ được bật."
          >
            <TextArea
              rows={4}
              placeholder="Quy tắc nghiệp vụ, danh mục bảng/cột cần tìm kiếm, cú pháp truy vấn..."
            />
          </Form.Item>

          <Space size="large">
            <Form.Item name="enabled" label="Kích hoạt sẵn" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="desktopOnly" label="Chỉ chạy trên Desktop (Tauri)" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </>
  );
};
