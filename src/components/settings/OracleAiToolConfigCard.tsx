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

export interface OracleAiToolConfigCardProps {
  db?: TaskPlannerDatabase;
  onConfigChange?: () => void;
}

export const OracleAiToolConfigCard: React.FC<OracleAiToolConfigCardProps> = ({
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
    loadData();
  }, [db]);

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
    <Card
      title={
        <Space>
          <DatabaseOutlined style={{ color: token.colorPrimary }} />
          <span>Cấu hình Oracle SQLcl (AI Tool Loop)</span>
        </Space>
      }
      loading={loading}
      style={{ marginBottom: 16 }}
    >
      <Paragraph type="secondary" style={{ fontSize: 13 }}>
        Cung cấp công cụ truy vấn dữ liệu chỉ đọc (<code>oracle_query</code>) và tra cứu metadata schema (
        <code>oracle_describe</code>) trực tiếp cho AI Chat. AI sẽ chạy <code>sqlcl</code> trên máy chủ SSH
        cố định đã chọn và kết nối tới Oracle DB nội bộ.
      </Paragraph>

      <Form form={form} layout="vertical" initialValues={DEFAULT_ORACLE_CONFIG}>
        <Form.Item
          name="enabled"
          label="Kích hoạt công cụ Oracle cho AI"
          valuePropName="checked"
          tooltip="Khi bật, AI Chat có thể gọi oracle_query và oracle_describe trong quá trình suy luận."
        >
          <Switch checkedChildren="BẬT" unCheckedChildren="TẮT" />
        </Form.Item>

        <Form.Item
          name="sshConfigId"
          label="Máy chủ SSH Remote (Cố định cho AI Tool)"
          rules={[{ required: true, message: 'Vui lòng chọn 1 máy chủ SSH để chạy sqlcl' }]}
          tooltip="Máy chủ remote có cài sẵn Oracle SQLcl, có thể kết nối mạng tới Oracle DB."
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
          name="connectionString"
          label="Chuỗi kết nối Oracle (Connect String)"
          rules={[{ required: true, message: 'Vui lòng nhập chuỗi kết nối Oracle' }]}
          tooltip="Cú pháp: username/password@host:port/service_name hoặc username/password@TNS_ALIAS"
        >
          <Input.Password
            placeholder="vd: app_user/SecretPass123@192.168.1.50:1521/PROD_SERVICE"
            visibilityToggle
          />
        </Form.Item>

        <Space orientation="horizontal" size="middle" style={{ display: 'flex', width: '100%' }}>
          <Form.Item
            name="sqlclPath"
            label="Lệnh gọi SQLcl trên Remote"
            style={{ flex: 1 }}
            tooltip="Mặc định là 'sql' nếu đã nằm trong $PATH của remote shell, hoặc đường dẫn tuyệt đối như /opt/sqlcl/bin/sql"
          >
            <Input placeholder="sql" />
          </Form.Item>

          <Form.Item
            name="maxRows"
            label="Số dòng tối đa (mỗi query)"
            style={{ width: 180 }}
            tooltip="Giới hạn số dòng trả về cho AI để tránh làm tràn token context (10 - 1000)."
          >
            <InputNumber min={10} max={1000} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="timeoutSeconds"
            label="Timeout (giây)"
            style={{ width: 140 }}
            tooltip="Thời gian tối đa chờ câu lệnh thực thi (5 - 120 giây)."
          >
            <InputNumber min={5} max={120} style={{ width: '100%' }} />
          </Form.Item>
        </Space>

        <Form.Item
          name="envVars"
          label="Biến môi trường Remote (tùy chọn)"
          tooltip="Các lệnh export cần thiết trước khi chạy sqlcl (vd: export TNS_ADMIN=/etc/oracle/network/admin)"
        >
          <Input placeholder="export TNS_ADMIN=/opt/oracle/network/admin" />
        </Form.Item>

        {testResult && (
          <Alert
            style={{ marginBottom: 16 }}
            type={testResult.ok ? 'success' : 'error'}
            showIcon
            icon={testResult.ok ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
            message={testResult.ok ? 'Kết nối thành công' : 'Lỗi kết nối'}
            description={
              <div>
                <div>{testResult.message}</div>
                {testResult.version && (
                  <Tag color="cyan" style={{ marginTop: 6 }}>
                    {testResult.version}
                  </Tag>
                )}
              </div>
            }
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
