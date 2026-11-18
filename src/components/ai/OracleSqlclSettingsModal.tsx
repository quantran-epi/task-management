import React, { useEffect, useState } from 'react';
import {
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
  Button,
  Space,
  Typography,
  Alert,
  Tag,
  theme,
  message,
} from 'antd';
import {
  DatabaseOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { getSshConfigs } from '../../services/sshService';
import type { SshConfig } from '../../types/ssh';
import {
  getOracleToolConfig,
  saveOracleToolConfig,
  testOracleConnection,
  DEFAULT_ORACLE_CONFIG,
} from '../../services/ai/oracleSqlclService';
import type { OracleToolConfig } from '../../types/oracleSqlcl';

const { Paragraph } = Typography;

export interface OracleSqlclSettingsModalProps {
  open: boolean;
  onClose: () => void;
  db?: TaskPlannerDatabase;
  onConfigChange?: () => void;
}

export const OracleSqlclSettingsModal: React.FC<OracleSqlclSettingsModalProps> = ({
  open,
  onClose,
  db = defaultDb,
  onConfigChange,
}) => {
  const { token } = theme.useToken();
  const [form] = Form.useForm<OracleToolConfig>();
  const [sshConfigs, setSshConfigs] = useState<SshConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
    version?: string;
  } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sshs, oracleCfg] = await Promise.all([
        getSshConfigs(db),
        getOracleToolConfig(db),
      ]);
      setSshConfigs(sshs);
      form.setFieldsValue(oracleCfg);
    } catch (err: any) {
      message.error(`Không thể tải cấu hình Oracle: ${err?.message || 'Lỗi không xác định'}`);
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
      const current = await getOracleToolConfig(db);
      const updated: OracleToolConfig = {
        ...current,
        ...values,
      };
      await saveOracleToolConfig(updated, db);
      message.success('Đã lưu cấu hình Oracle SQLcl AI Tool thành công.');
      onConfigChange?.();
      onClose();
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

      const res = await testOracleConnection(values, db);
      setTestResult(res);

      if (res.ok) {
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
    <Modal
      open={open}
      onCancel={onClose}
      width={580}
      title={
        <Space>
          <DatabaseOutlined style={{ color: token.colorPrimary }} />
          <span>Cấu hình Oracle SQLcl (AI Remote Tool)</span>
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
        Chọn máy chủ SSH cố định để AI Tool Loop chạy câu lệnh <code>sqlcl</code> kết nối tới Oracle DB nội bộ.
        Mọi câu lệnh truy vấn của AI đều được ép chế độ <b>CHỈ ĐỌC (READ-ONLY)</b>.
      </Paragraph>

      <Form form={form} layout="vertical" initialValues={DEFAULT_ORACLE_CONFIG}>
        <Form.Item
          name="enabled"
          label="Kích hoạt công cụ Oracle cho AI"
          valuePropName="checked"
          tooltip="Khi bật, AI có thể tra cứu schema và truy vấn dữ liệu Oracle."
        >
          <Switch checkedChildren="BẬT" unCheckedChildren="TẮT" />
        </Form.Item>

        <Form.Item
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
        </Form.Item>

        <Form.Item
          name="connectionString"
          label="Chuỗi kết nối Oracle (Connect String)"
          rules={[{ required: true, message: 'Vui lòng nhập chuỗi kết nối Oracle' }]}
        >
          <Input.Password
            placeholder="user/password@host:1521/service hoặc user/pass@TNS_ALIAS"
            visibilityToggle
          />
        </Form.Item>

        <Space orientation="horizontal" size="middle" style={{ display: 'flex', width: '100%' }}>
          <Form.Item
            name="sqlclPath"
            label="Lệnh gọi SQLcl"
            style={{ flex: 1 }}
          >
            <Input placeholder="sql" />
          </Form.Item>

          <Form.Item
            name="maxRows"
            label="Số dòng tối đa"
            style={{ width: 140 }}
          >
            <InputNumber min={10} max={1000} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="timeoutSeconds"
            label="Timeout (giây)"
            style={{ width: 120 }}
          >
            <InputNumber min={5} max={120} style={{ width: '100%' }} />
          </Form.Item>
        </Space>

        <Form.Item
          name="envVars"
          label="Biến môi trường Remote (tùy chọn)"
        >
          <Input placeholder="export TNS_ADMIN=/opt/oracle/network/admin" />
        </Form.Item>

        {testResult && (
          <Alert
            style={{ marginTop: 8 }}
            type={testResult.ok ? 'success' : 'error'}
            showIcon
            icon={testResult.ok ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
            message={testResult.ok ? 'Kết nối thành công' : 'Lỗi kết nối'}
            description={
              <div>
                <div>{testResult.message}</div>
                {testResult.version && (
                  <Tag color="cyan" style={{ marginTop: 4 }}>
                    {testResult.version}
                  </Tag>
                )}
              </div>
            }
          />
        )}
      </Form>
    </Modal>
  );
};
