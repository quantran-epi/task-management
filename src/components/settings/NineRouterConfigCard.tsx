import React, { useState, useEffect } from 'react';
import {
  Card,
  Form,
  Input,
  InputNumber,
  Select,
  Button,
  Space,
  Alert,
  Typography,
  notification,
  Tag,
  Modal,
  Popconfirm,
} from 'antd';
import {
  ApiOutlined,
  SaveOutlined,
  CheckCircleOutlined,
  SafetyCertificateOutlined,
  LockOutlined,
  EditOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import {
  getNineRouterApiKey,
  setNineRouterApiKey,
  forgetNineRouterApiKey,
  isNineRouterApiKeyStored,
  getNineRouterConfig,
  setNineRouterConfig,
  DEFAULT_NINEROUTER_ENDPOINT,
  DEFAULT_NINEROUTER_MODEL,
  DEFAULT_NINEROUTER_CHAR_LIMIT,
} from '../../services/ai/nineRouterTokenService';
import { testNineRouterConnection } from '../../services/ai/nineRouterClient';
import { isTauriApp } from '../../utils/timerPopout';
import { announceToScreenReader } from '../common/AriaLiveRegion';

const { Paragraph, Text } = Typography;

export interface NineRouterConfigCardProps {
  db?: TaskPlannerDatabase;
}

export interface ConnectionState {
  ok: boolean;
  message: string;
  modelsCount?: number;
  models?: string[];
}

export const NineRouterConfigCard: React.FC<NineRouterConfigCardProps> = ({ db = defaultDb }) => {
  const [endpoint, setEndpoint] = useState(DEFAULT_NINEROUTER_ENDPOINT);
  const [defaultModel, setDefaultModel] = useState(DEFAULT_NINEROUTER_MODEL);
  const [charLimit, setCharLimit] = useState<number>(DEFAULT_NINEROUTER_CHAR_LIMIT);
  const [availableModels, setAvailableModels] = useState<string[]>([
    'gpt-4o',
    'gpt-4o-mini',
    'claude-3-5-sonnet',
    'claude-3-5-haiku',
    'deepseek-chat',
  ]);

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connectionResult, setConnectionResult] = useState<ConnectionState | null>(null);

  // Secret API key management (Tauri Keyring / Dexie Settings)
  const [keyStored, setKeyStored] = useState(false);
  const [replaceModalOpen, setReplaceModalOpen] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState('');

  // Check stored state and config on mount
  useEffect(() => {
    let active = true;

    async function loadData() {
      const stored = await isNineRouterApiKeyStored(db);
      const config = await getNineRouterConfig(db);
      if (!active) return;
      setKeyStored(stored);
      setEndpoint(config.endpoint);
      setDefaultModel(config.defaultModel);
      if (config.charLimit) setCharLimit(config.charLimit);

      // Check if cached model list exists
      const modelsRec = await db.settings.get('ninerouter_cached_models');
      if (active && Array.isArray(modelsRec?.value) && modelsRec.value.length > 0) {
        setAvailableModels(modelsRec.value as string[]);
      }
    }

    loadData();
    return () => {
      active = false;
    };
  }, [db]);

  const handleTestConnection = async () => {
    setTesting(true);
    setConnectionResult(null);
    try {
      const activeKey = newKeyValue.trim() || (await getNineRouterApiKey(db));
      if (!activeKey) {
        setConnectionResult({
          ok: false,
          message: 'Vui lòng nhập API Key trước khi kiểm tra kết nối.',
        });
        return;
      }

      const res = await testNineRouterConnection({
        endpoint,
        apiKey: activeKey,
      });

      if (res.ok) {
        const foundModels = res.models.length > 0 ? res.models : availableModels;
        if (res.models.length > 0) {
          setAvailableModels(res.models);
          await db.settings.put({
            key: 'ninerouter_cached_models',
            value: res.models,
          });
        }
        setConnectionResult({
          ok: true,
          message: `Kết nối thành công. Đã tìm thấy ${foundModels.length} mô hình AI.`,
          modelsCount: foundModels.length,
          models: foundModels,
        });
        announceToScreenReader('Kết nối 9router thành công');
      } else {
        setConnectionResult({
          ok: false,
          message: res.error || `Lỗi kết nối HTTP ${res.status}`,
        });
        announceToScreenReader('Kiểm tra kết nối thất bại');
      }
    } catch (err: any) {
      setConnectionResult({
        ok: false,
        message: err?.message || 'Lỗi không xác định khi kết nối tới 9router',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      if (newKeyValue.trim()) {
        await setNineRouterApiKey(newKeyValue.trim(), db);
        setKeyStored(true);
        setNewKeyValue('');
      }

      await setNineRouterConfig(
        {
          endpoint,
          defaultModel,
          charLimit,
        },
        db
      );

      notification.success({
        message: 'Lưu cấu hình thành công',
        description: 'Thông số kết nối 9router đã được cập nhật.',
      });
      announceToScreenReader('Đã lưu cấu hình 9router');
    } catch (err: any) {
      notification.error({
        message: 'Lỗi lưu cấu hình',
        description: err?.message || 'Không thể lưu cài đặt 9router.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleForgetApiKey = async () => {
    try {
      await forgetNineRouterApiKey(db);
      setKeyStored(false);
      setNewKeyValue('');
      notification.info({
        message: 'Đã xóa API Key',
        description: 'Khóa 9router API Key đã được xóa khỏi hệ thống.',
      });
      announceToScreenReader('Đã xóa 9router API key');
    } catch (err: any) {
      notification.error({
        message: 'Lỗi khi xóa API Key',
        description: err?.message,
      });
    }
  };

  return (
    <Card
      title={
        <Space>
          <ApiOutlined />
          <span>Cấu hình Trợ lý AI (9router API)</span>
        </Space>
      }
      style={{ marginBottom: 16 }}
    >
      <Paragraph type="secondary">
        Kết nối ứng dụng với 9router hoặc các dịch vụ tương thích chuẩn OpenAI Chat Completions để sử
        dụng trợ lý AI thông minh có khả năng đọc hiểu ngữ cảnh công việc.
      </Paragraph>

      <Form layout="vertical">
        <Form.Item
          label="API Endpoint"
          extra="Mặc định: https://api.9router.com (hoặc đường dẫn tương thích OpenAI /v1)"
        >
          <Input
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="https://api.9router.com"
          />
        </Form.Item>

        <Form.Item
          label="API Key"
          extra={
            isTauriApp()
              ? 'Khóa được mã hóa an toàn trong OS Keychain (Tauri Desktop).'
              : 'Khóa được lưu cục bộ trong IndexedDB của trình duyệt.'
          }
        >
          {keyStored ? (
            <Space orientation="horizontal" style={{ width: '100%', justifyContent: 'space-between' }}>
              <Space>
                <Tag color="success" icon={<SafetyCertificateOutlined />}>
                  API Key đã được cấu hình
                </Tag>
                <Text type="secondary">(••••••••••••••••)</Text>
              </Space>
              <Space>
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => setReplaceModalOpen(true)}
                >
                  Thay đổi
                </Button>
                <Popconfirm
                  title="Xác nhận xóa API Key"
                  description="Bạn có chắc chắn muốn xóa API Key khỏi bộ lưu trữ an toàn?"
                  onConfirm={handleForgetApiKey}
                  okText="Xóa"
                  cancelText="Hủy"
                  okButtonProps={{ danger: true }}
                >
                  <Button size="small" danger icon={<DeleteOutlined />}>
                    Xóa
                  </Button>
                </Popconfirm>
              </Space>
            </Space>
          ) : (
            <Input.Password
              value={newKeyValue}
              onChange={(e) => setNewKeyValue(e.target.value)}
              placeholder="Nhập 9router API Key (sk-...)"
              prefix={<LockOutlined />}
            />
          )}
        </Form.Item>

        <Form.Item label="Mô hình AI mặc định (Default Model)">
          <Select
            value={defaultModel}
            onChange={(val) => setDefaultModel(val)}
            showSearch
            options={availableModels.map((m) => ({ label: m, value: m }))}
          />
        </Form.Item>

        <Form.Item
          label="Giới hạn ký tự ngữ cảnh (Safe Character Budget)"
          extra="Ngưỡng ký tự an toàn tối đa cho ngữ cảnh nhiệm vụ (mặc định 12.000 ký tự)"
        >
          <InputNumber
            min={2000}
            max={32000}
            step={1000}
            value={charLimit}
            onChange={(val) => setCharLimit(val || DEFAULT_NINEROUTER_CHAR_LIMIT)}
            style={{ width: 200 }}
          />
        </Form.Item>

        {connectionResult && (
          <div style={{ marginBottom: 16 }}>
            {connectionResult.ok ? (
              <Alert
                type="success"
                showIcon
                icon={<CheckCircleOutlined />}
                message={connectionResult.message}
              />
            ) : (
              <Alert
                type="error"
                showIcon
                message="Kiểm tra kết nối thất bại"
                description={connectionResult.message}
              />
            )}
          </div>
        )}

        <Space>
          <Button
            icon={<ApiOutlined />}
            onClick={handleTestConnection}
            loading={testing}
          >
            Kiểm tra kết nối
          </Button>

          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSaveConfig}
            loading={saving}
          >
            Lưu cấu hình
          </Button>
        </Space>
      </Form>

      <Modal
        title="Cập nhật 9router API Key"
        open={replaceModalOpen}
        onCancel={() => {
          setReplaceModalOpen(false);
          setNewKeyValue('');
        }}
        onOk={async () => {
          if (newKeyValue.trim()) {
            await setNineRouterApiKey(newKeyValue.trim(), db);
            setKeyStored(true);
            setReplaceModalOpen(false);
            setNewKeyValue('');
            notification.success({ message: 'Đã cập nhật API Key mới' });
          }
        }}
        okText="Cập nhật"
        cancelText="Hủy"
        okButtonProps={{ disabled: !newKeyValue.trim() }}
      >
        <Paragraph>Nhập API Key mới để thay thế khóa hiện tại:</Paragraph>
        <Input.Password
          value={newKeyValue}
          onChange={(e) => setNewKeyValue(e.target.value)}
          placeholder="sk-..."
          prefix={<LockOutlined />}
        />
      </Modal>
    </Card>
  );
};
