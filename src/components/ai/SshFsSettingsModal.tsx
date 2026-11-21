import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, InputNumber, Select, Button, Space, Typography, Alert, useAntdToken, useMessage, FormItem, useForm } from '../ui';
import { FolderOpenOutlined, CheckCircleOutlined, CloseCircleOutlined, SyncOutlined, SaveOutlined } from '../ui/icon';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { getSshConfigs } from '../../services/sshService';
import type { SshConfig } from '../../types/ssh';
import {
  getSshFsToolConfig,
  saveSshFsToolConfig,
  testSshFsConnection,
} from '../../services/ai/sshFsToolService';
import type { SshFsToolConfig } from '../../types/sshFsTool';
import { DEFAULT_SSH_FS_CONFIG } from '../settings/SshFsAiToolConfigCard';

const { Paragraph } = Typography;

export interface SshFsSettingsModalProps {
  open: boolean;
  onClose: () => void;
  db?: TaskPlannerDatabase;
  onConfigChange?: () => void;
}

export const SshFsSettingsModal: React.FC<SshFsSettingsModalProps> = ({
  open,
  onClose,
  db = defaultDb,
  onConfigChange,
}) => {
  const appMessage = useMessage();
  const { token } = useAntdToken();
  const [form] = useForm<SshFsToolConfig>();
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
      appMessage.error(`Không thể tải cấu hình SSH File System: ${err?.message || 'Lỗi không xác định'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadData();
      setTestResult(null);
    }
  }, [open, db]);

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
      appMessage.success('Đã lưu cấu hình SSH File System AI Tool thành công.');
      onConfigChange?.();
      onClose();
    } catch (err: any) {
      if (err?.errorFields) return;
      appMessage.error(`Lưu thất bại: ${err?.message || 'Lỗi không xác định'}`);
    }
  };

  const handleTest = async () => {
    try {
      const values = await form.validateFields();
      setTesting(true);
      setTestResult(null);

      const current = await getSshFsToolConfig(db);
      await saveSshFsToolConfig({ ...(current || {}), ...values }, db);

      const res = await testSshFsConnection(db);
      setTestResult({
        ok: res.success,
        message: res.message,
      });

      if (res.success) {
        appMessage.success(res.message);
      } else {
        appMessage.error(res.message);
      }
    } catch (err: any) {
      if (err?.errorFields) return;
      setTestResult({
        ok: false,
        message: err?.message || 'Kiểm tra thất bại',
      });
      appMessage.error(`Lỗi kiểm tra: ${err?.message || 'Lỗi không xác định'}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={560}
      title={
        <Space>
          <FolderOpenOutlined style={{ color: token.colorPrimary }} />
          <span>Cấu hình SSH File System (AI Remote Tool)</span>
        </Space>
      }
      footer={[
        <Button key="cancel" onClick={onClose}>
          Đóng
        </Button>,
        <Button
          key="test"
          icon={<SyncOutlined spin={testing} />}
          loading={testing}
          onClick={handleTest}
        >
          Kiểm tra kết nối
        </Button>,
        <Button
          key="save"
          type="primary"
          icon={<SaveOutlined />}
          loading={loading}
          onClick={handleSave}
        >
          Lưu & Áp dụng
        </Button>,
      ]}
      destroyOnClose
    >
      <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 16 }}>
        Chọn máy chủ SSH remote để AI Chat gọi các công cụ đọc file chỉ đọc (<code>ssh_list_dir</code>,{' '}
        <code>ssh_read_file_page</code>, <code>ssh_grep_files</code>). Kết quả được cắt phân đoạn an toàn
        để bảo vệ Context Window.
      </Paragraph>

      <Form form={form} layout="vertical" initialValues={DEFAULT_SSH_FS_CONFIG}>
        <FormItem
          name="sshConfigId"
          label="Máy chủ SSH Remote cố định"
          rules={[{ required: true, message: 'Vui lòng chọn 1 máy chủ SSH' }]}
        >
          <Select
            placeholder="Chọn cấu hình SSH..."
            showSearch
            optionFilterProp="children"
            options={sshConfigs.map((s) => ({
              value: s.id,
              label: `${s.name} (${s.username}@${s.host}:${s.port})`,
            }))}
            notFoundContent="Chưa có cấu hình SSH nào. Thêm trong Cài đặt > SSH."
          />
        </FormItem>

        <FormItem
          name="defaultBasePath"
          label="Thư mục gốc mặc định (Base Path)"
          tooltip="Thư mục bắt đầu hoặc tiền tố đường dẫn tương đối (vd: /var/log hoặc /home/app hoặc /)"
        >
          <Input placeholder="/var/log" />
        </FormItem>

        <Space orientation="horizontal" size="middle" style={{ display: 'flex', width: '100%' }}>
          <FormItem
            name="maxLinesPerRead"
            label="Số dòng tối đa / lần đọc"
            style={{ flex: 1 }}
          >
            <InputNumber min={10} max={500} style={{ width: '100%' }} />
          </FormItem>

          <FormItem
            name="maxListEntries"
            label="Số mục tối đa / lần liệt kê"
            style={{ flex: 1 }}
          >
            <InputNumber min={10} max={200} style={{ width: '100%' }} />
          </FormItem>

          <FormItem
            name="maxGrepMatches"
            label="Số kết quả / lần grep"
            style={{ flex: 1 }}
          >
            <InputNumber min={5} max={100} style={{ width: '100%' }} />
          </FormItem>
        </Space>

        {testResult && (
          <Alert
            style={{ marginTop: 8 }}
            type={testResult.ok ? 'success' : 'error'}
            showIcon
            icon={testResult.ok ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
            message={testResult.ok ? 'Kết nối thành công' : 'Lỗi kết nối'}
            description={testResult.message}
          />
        )}
      </Form>
    </Modal>
  );
};
