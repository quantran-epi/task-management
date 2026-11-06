import React, { useEffect, useState } from 'react';
import {
  Card,
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
  Button,
  Space,
  Typography,
  Alert,
  theme,
  message,
} from 'antd';
import {
  FolderOpenOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { getSshConfigs } from '../../services/sshService';
import type { SshConfig } from '../../types/ssh';
import {
  getSshFsToolConfig,
  saveSshFsToolConfig,
  testSshFsConnection,
} from '../../services/ai/sshFsToolService';
import type { SshFsToolConfig } from '../../types/sshFsTool';

const { Paragraph } = Typography;

export interface SshFsAiToolConfigCardProps {
  db?: TaskPlannerDatabase;
  onConfigChange?: () => void;
}

export const DEFAULT_SSH_FS_CONFIG: SshFsToolConfig = {
  enabled: false,
  sshConfigId: '',
  defaultBasePath: '/',
  maxLinesPerRead: 100,
  maxListEntries: 100,
  maxGrepMatches: 50,
};

export const SshFsAiToolConfigCard: React.FC<SshFsAiToolConfigCardProps> = ({
  db = defaultDb,
  onConfigChange,
}) => {
  const { token } = theme.useToken();
  const [form] = Form.useForm<SshFsToolConfig>();
  const [sshConfigs, setSshConfigs] = useState<SshConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sshs, fsCfg] = await Promise.all([
        getSshConfigs(db),
        getSshFsToolConfig(db),
      ]);
      setSshConfigs(sshs);
      form.setFieldsValue({
        ...DEFAULT_SSH_FS_CONFIG,
        ...(fsCfg || {}),
      });
    } catch (err: any) {
      message.error(`Không thể tải cấu hình SSH File System: ${err?.message || 'Lỗi không xác định'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [db]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const current = await getSshFsToolConfig(db);
      const updated: SshFsToolConfig = {
        ...DEFAULT_SSH_FS_CONFIG,
        ...(current || {}),
        ...values,
      };
      await saveSshFsToolConfig(updated, db);
      message.success('Đã lưu cấu hình SSH File System AI Tool thành công.');
      onConfigChange?.();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(`Lưu thất bại: ${err?.message || 'Lỗi không xác định'}`);
    }
  };

  const handleTest = async () => {
    try {
      const values = await form.validateFields();
      setTesting(true);
      setTestResult(null);

      // Save temporarily before testing so test uses latest values
      const current = await getSshFsToolConfig(db);
      await saveSshFsToolConfig({ ...(current || {}), ...values, enabled: true }, db);

      const res = await testSshFsConnection(db);
      setTestResult({
        ok: res.success,
        message: res.message,
      });

      if (res.success) {
        message.success(res.message);
      } else {
        message.error(res.message);
      }
    } catch (err: any) {
      if (err?.errorFields) return;
      setTestResult({
        ok: false,
        message: err?.message || 'Kiểm tra thất bại',
      });
      message.error(`Lỗi kiểm tra: ${err?.message || 'Lỗi không xác định'}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card
      title={
        <Space>
          <FolderOpenOutlined style={{ color: token.colorPrimary }} />
          <span>Cấu hình SSH File System (AI Tool Loop)</span>
        </Space>
      }
      loading={loading}
      style={{ marginBottom: 16 }}
    >
      <Paragraph type="secondary" style={{ fontSize: 13 }}>
        Cung cấp các công cụ đọc file và thư mục từ xa chỉ đọc (<code>ssh_list_dir</code>,{' '}
        <code>ssh_read_file</code>, <code>ssh_grep_files</code>) cho AI Chat. AI chỉ được phép đọc nội
        dung phân đoạn và tìm kiếm văn bản trên máy chủ SSH đã cấu hình, tuyệt đối bảo vệ Context Window.
      </Paragraph>

      <Form form={form} layout="vertical" initialValues={DEFAULT_SSH_FS_CONFIG}>
        <Form.Item
          name="enabled"
          label="Kích hoạt công cụ SSH File System cho AI"
          valuePropName="checked"
          tooltip="Khi bật, AI Chat có thể gọi ssh_list_dir, ssh_read_file và ssh_grep_files trong quá trình suy luận."
        >
          <Switch checkedChildren="BẬT" unCheckedChildren="TẮT" />
        </Form.Item>

        <Form.Item
          name="sshConfigId"
          label="Máy chủ SSH Remote (Cố định cho AI Tool)"
          rules={[{ required: true, message: 'Vui lòng chọn 1 máy chủ SSH để AI thao tác file' }]}
          tooltip="Máy chủ remote được cấp phép cho AI duyệt thư mục, đọc logs và mã nguồn."
        >
          <Select
            placeholder="Chọn cấu hình SSH..."
            showSearch
            optionFilterProp="children"
            options={sshConfigs.map((s) => ({
              value: s.id,
              label: `${s.name} (${s.username}@${s.host}:${s.port})`,
            }))}
            notFoundContent="Chưa có cấu hình SSH nào. Thêm trong tab SSH."
          />
        </Form.Item>

        <Form.Item
          name="defaultBasePath"
          label="Thư mục gốc mặc định (Base Path)"
          tooltip="Thư mục bắt đầu hoặc tiền tố đường dẫn tương đối khi AI gọi tool (vd: /var/log hoặc /home/app hoặc /)"
        >
          <Input placeholder="/var/log" />
        </Form.Item>

        <Space orientation="horizontal" size="middle" style={{ display: 'flex', width: '100%' }}>
          <Form.Item
            name="maxLinesPerRead"
            label="Số dòng tối đa / lần đọc"
            style={{ flex: 1 }}
            tooltip="Giới hạn số dòng tối đa khi AI đọc file để tránh làm tràn Context Window (10 - 500 dòng)."
          >
            <InputNumber min={10} max={500} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="maxListEntries"
            label="Số mục tối đa / lần liệt kê"
            style={{ flex: 1 }}
            tooltip="Giới hạn số file/thư mục tối đa trả về khi list_dir (10 - 200 entries)."
          >
            <InputNumber min={10} max={200} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="maxGrepMatches"
            label="Số kết quả tối đa / lần grep"
            style={{ flex: 1 }}
            tooltip="Giới hạn số dòng khớp tối đa trả về khi tìm kiếm grep (5 - 100 kết quả)."
          >
            <InputNumber min={5} max={100} style={{ width: '100%' }} />
          </Form.Item>
        </Space>

        {testResult && (
          <Alert
            style={{ marginBottom: 16 }}
            type={testResult.ok ? 'success' : 'error'}
            showIcon
            icon={testResult.ok ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
            message={testResult.ok ? 'Kết nối thành công' : 'Lỗi kết nối'}
            description={testResult.message}
          />
        )}

        <Space style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <Button
            icon={<SyncOutlined spin={testing} />}
            loading={testing}
            onClick={handleTest}
          >
            Kiểm tra kết nối
          </Button>
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>
            Lưu cấu hình
          </Button>
        </Space>
      </Form>
    </Card>
  );
};
