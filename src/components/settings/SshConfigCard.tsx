import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Modal,
  Form,
  Input,
  InputNumber,
  Radio,
  Popconfirm,
  Typography,
  Alert,
  notification,
  Tooltip,
} from 'antd';
import {
  CloudServerOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  FolderOpenOutlined,
  KeyOutlined,
  LockOutlined,
  ApiOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import {
  getSshConfigs,
  saveSshConfig,
  deleteSshConfig,
  getSshSecret,
  testSshConnection,
} from '../../services/sshService';
import { type SshConfig, type SshAuthType } from '../../types/ssh';
import { isTauriApp } from '../../utils/timerPopout';

const { Text } = Typography;

export interface SshConfigCardProps {
  db?: TaskPlannerDatabase;
}

interface SshFormValues {
  name: string;
  host: string;
  port: number;
  username: string;
  authType: SshAuthType;
  keyPath?: string | undefined;
  secret?: string | undefined;
  defaultRemotePath?: string | undefined;
}

export const SshConfigCard: React.FC<SshConfigCardProps> = ({ db = defaultDb }) => {
  const [configs, setConfigs] = useState<SshConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<SshConfig | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [modalTesting, setModalTesting] = useState(false);

  const [form] = Form.useForm<SshFormValues>();
  const authTypeVal = Form.useWatch('authType', form);

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const list = await getSshConfigs(db);
      setConfigs(list);
    } catch (err: any) {
      notification.error({
        message: 'Lỗi tải cấu hình SSH',
        description: err?.message || 'Không thể đọc cấu hình SSH từ bộ nhớ.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfigs();
  }, [db]);

  const handleOpenAdd = () => {
    setEditingConfig(null);
    form.resetFields();
    form.setFieldsValue({
      port: 22,
      authType: 'password',
    });
    setModalOpen(true);
  };

  const handleOpenEdit = async (config: SshConfig) => {
    setEditingConfig(config);
    let secret = '';
    try {
      const stored = await getSshSecret(config.id);
      secret = stored || '';
    } catch {
      // Ignore
    }

    form.setFieldsValue({
      name: config.name,
      host: config.host,
      port: config.port,
      username: config.username,
      authType: config.authType,
      keyPath: config.keyPath,
      secret,
      defaultRemotePath: config.defaultRemotePath,
    });
    setModalOpen(true);
  };

  const handlePickKeyFile = async () => {
    if (!isTauriApp()) {
      notification.info({
        message: 'Thông báo',
        description: 'Vui lòng nhập đường dẫn tệp khóa thủ công trên trình duyệt web.',
      });
      return;
    }
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const selected = await invoke<string | null>('select_local_file');
      if (selected) {
        form.setFieldValue('keyPath', selected);
      }
    } catch (err: any) {
      notification.error({
        message: 'Lỗi chọn tệp',
        description: err?.message || 'Không thể mở cửa sổ chọn tệp.',
      });
    }
  };

  const handleTestInModal = async () => {
    try {
      const values = await form.validateFields();
      setModalTesting(true);
      const tempConfig: SshConfig = {
        id: editingConfig?.id || 'temp',
        name: values.name,
        host: values.host,
        port: values.port,
        username: values.username,
        authType: values.authType,
        keyPath: values.keyPath,
        defaultRemotePath: values.defaultRemotePath,
        createdAt: '',
        updatedAt: '',
      };

      const result = await testSshConnection(tempConfig, values.secret);
      notification.success({
        message: 'Kết nối SSH thành công',
        description: result,
      });
    } catch (err: any) {
      notification.error({
        message: 'Kiểm tra kết nối thất bại',
        description: err?.message || 'Không thể kết nối tới SSH server.',
      });
    } finally {
      setModalTesting(false);
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const id = editingConfig?.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `ssh_${Date.now()}`);

      const configToSave: SshConfig = {
        id,
        name: values.name.trim(),
        host: values.host.trim(),
        port: values.port,
        username: values.username.trim(),
        authType: values.authType,
        keyPath: values.keyPath?.trim() || undefined,
        defaultRemotePath: values.defaultRemotePath?.trim() || undefined,
        createdAt: editingConfig?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await saveSshConfig(configToSave, values.secret, db);
      notification.success({
        message: 'Đã lưu cấu hình SSH',
        description: `Cấu hình "${configToSave.name}" đã được lưu an toàn.`,
      });

      setModalOpen(false);
      loadConfigs();
    } catch (err: any) {
      notification.error({
        message: 'Lỗi lưu cấu hình',
        description: err?.message || 'Vui lòng kiểm tra lại thông tin biểu mẫu.',
      });
    }
  };

  const handleDelete = async (id: string, name: string) => {
    try {
      await deleteSshConfig(id, db);
      notification.success({
        message: 'Đã xóa cấu hình',
        description: `Đã xóa cấu hình "${name}".`,
      });
      loadConfigs();
    } catch (err: any) {
      notification.error({
        message: 'Lỗi xóa cấu hình',
        description: err?.message || 'Không thể xóa cấu hình SSH.',
      });
    }
  };

  const handleTestRow = async (config: SshConfig) => {
    setTestingId(config.id);
    try {
      const result = await testSshConnection(config);
      notification.success({
        message: `Kết nối "${config.name}" thành công`,
        description: result,
      });
    } catch (err: any) {
      notification.error({
        message: `Kết nối "${config.name}" thất bại`,
        description: err?.message || 'Không thể kết nối đến SSH server.',
      });
    } finally {
      setTestingId(null);
    }
  };

  const columns = [
    {
      title: 'Tên cấu hình',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, row: SshConfig) => (
        <Space direction="vertical" size={2}>
          <Text strong>{text}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {row.username}@{row.host}:{row.port}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Xác thực',
      dataIndex: 'authType',
      key: 'authType',
      render: (authType: SshAuthType, row: SshConfig) => {
        if (authType === 'password') {
          return <Tag icon={<LockOutlined />} color="blue">Mật khẩu</Tag>;
        }
        if (authType === 'key_file') {
          return (
            <Tooltip title={row.keyPath || 'Chưa chọn file key'}>
              <Tag icon={<KeyOutlined />} color="purple">SSH Key</Tag>
            </Tooltip>
          );
        }
        return <Tag icon={<ApiOutlined />} color="cyan">SSH Agent</Tag>;
      },
    },
    {
      title: 'Đường dẫn từ xa',
      dataIndex: 'defaultRemotePath',
      key: 'defaultRemotePath',
      render: (val?: string) => val ? <code>{val}</code> : <Text type="secondary">Mặc định (~)</Text>,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      render: (_: any, row: SshConfig) => (
        <Space>
          <Button
            size="small"
            icon={testingId === row.id ? <SyncOutlined spin /> : <ApiOutlined />}
            loading={testingId === row.id}
            onClick={() => handleTestRow(row)}
          >
            Kiểm tra
          </Button>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleOpenEdit(row)}
          >
            Sửa
          </Button>
          <Popconfirm
            title="Xác nhận xóa cấu hình SSH này?"
            okText="Xóa"
            okType="danger"
            cancelText="Hủy"
            onConfirm={() => handleDelete(row.id, row.name)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title={
        <span>
          <CloudServerOutlined style={{ marginRight: 8, color: '#1677ff' }} />
          Cấu hình Remote SSH / Workspace
        </span>
      }
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenAdd}>
          Thêm kết nối SSH
        </Button>
      }
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Remote Workspace qua SSH / WSL"
        description="Cho phép TaskMate và AI Agent kết nối đến server từ xa hoặc môi trường WSL Ubuntu qua giao thức SSH/SFTP. Các tiến trình (Claude Code, compiler, shell script) sẽ được thực thi độc lập bên trong máy chủ từ xa/WSL thông qua sshd, an toàn và không bị quét bởi trình bảo mật máy host."
      />

      <Table
        dataSource={configs}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={false}
        locale={{
          emptyText: 'Chưa có cấu hình SSH nào. Nhấn "Thêm kết nối SSH" để bắt đầu.',
        }}
      />

      <Modal
        title={editingConfig ? `Chỉnh sửa cấu hình SSH: ${editingConfig.name}` : 'Thêm cấu hình SSH mới'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={[
          <Button key="test" icon={<ApiOutlined />} loading={modalTesting} onClick={handleTestInModal}>
            Kiểm tra kết nối
          </Button>,
          <Button key="cancel" onClick={() => setModalOpen(false)}>
            Hủy
          </Button>,
          <Button key="save" type="primary" icon={<CheckCircleOutlined />} onClick={handleSave}>
            Lưu cấu hình
          </Button>,
        ]}
        width={580}
        destroyOnClose
      >
        <Form form={form} layout="vertical" initialValues={{ port: 22, authType: 'password' }}>
          <Form.Item
            name="name"
            label="Tên gợi nhớ"
            rules={[{ required: true, message: 'Vui lòng nhập tên gợi nhớ' }]}
          >
            <Input placeholder="VD: WSL Ubuntu 24.04, Dev Staging Server" />
          </Form.Item>

          <Space orientation="horizontal" style={{ width: '100%' }} size="middle">
            <Form.Item
              name="host"
              label="Host / IP"
              rules={[{ required: true, message: 'Vui lòng nhập Host hoặc IP' }]}
              style={{ flex: 1, minWidth: 260 }}
            >
              <Input placeholder="VD: 127.0.0.1 hoặc server.dev.internal" />
            </Form.Item>

            <Form.Item
              name="port"
              label="Cổng (Port)"
              rules={[{ required: true, message: 'Vui lòng nhập cổng' }]}
              style={{ width: 110 }}
            >
              <InputNumber min={1} max={65535} style={{ width: '100%' }} />
            </Form.Item>
          </Space>

          <Form.Item
            name="username"
            label="Tên đăng nhập (Username)"
            rules={[{ required: true, message: 'Vui lòng nhập tên người dùng' }]}
          >
            <Input placeholder="VD: ubuntu, root, dev" />
          </Form.Item>

          <Form.Item name="authType" label="Phương thức xác thực">
            <Radio.Group>
              <Radio value="password">Mật khẩu</Radio>
              <Radio value="key_file">Khóa riêng tư (Private Key)</Radio>
              <Radio value="agent">SSH Agent</Radio>
            </Radio.Group>
          </Form.Item>

          {authTypeVal === 'key_file' && (
            <>
              <Form.Item
                name="keyPath"
                label="Đường dẫn khóa riêng tư (Private Key Path)"
                rules={[{ required: true, message: 'Vui lòng cung cấp đường dẫn tệp khóa' }]}
              >
                <Space.Compact style={{ width: '100%' }}>
                  <Input placeholder="VD: /home/user/.ssh/id_rsa hoặc C:\Users\user\.ssh\id_ed25519" />
                  <Button icon={<FolderOpenOutlined />} onClick={handlePickKeyFile}>
                    Chọn tệp
                  </Button>
                </Space.Compact>
              </Form.Item>

              <Form.Item
                name="secret"
                label="Mật mã khóa (Passphrase, nếu có)"
              >
                <Input.Password placeholder="Nhập passphrase nếu khóa được mã hóa" />
              </Form.Item>
            </>
          )}

          {authTypeVal === 'password' && (
            <Form.Item
              name="secret"
              label="Mật khẩu SSH"
              rules={[{ required: true, message: 'Vui lòng nhập mật khẩu SSH' }]}
            >
              <Input.Password placeholder="Mật khẩu đăng nhập SSH" />
            </Form.Item>
          )}

          <Form.Item
            name="defaultRemotePath"
            label="Thư mục làm việc từ xa mặc định (Default Remote Path)"
          >
            <Input placeholder="VD: /home/ubuntu/workspace hoặc /var/www" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};
