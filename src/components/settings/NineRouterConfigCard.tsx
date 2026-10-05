import React, { useState, useEffect } from 'react';
import {
  Card,
  Form,
  Input,
  InputNumber,
  Select,
  AutoComplete,
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
  PictureOutlined,
  ClusterOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import {
  DEFAULT_GRAPHITI_MCP_ENDPOINT,
  getGraphitiMcpEndpoint,
  setGraphitiMcpEndpoint,
  testGraphitiMcpConnection,
} from '../../services/ai/graphitiMcpClient';
import {
  getNineRouterApiKey,
  setNineRouterApiKey,
  forgetNineRouterApiKey,
  isNineRouterApiKeyStored,
  getNineRouterConfig,
  setNineRouterConfig,
  getImageConfig,
  setImageConfig,
  getImageApiKey,
  setImageApiKey,
  forgetImageApiKey,
  isImageApiKeyStored,
  DEFAULT_NINEROUTER_ENDPOINT,
  DEFAULT_NINEROUTER_MODEL,
  DEFAULT_NINEROUTER_CHAR_LIMIT,
  DEFAULT_IMAGE_ENDPOINT,
  DEFAULT_IMAGE_MODEL,
} from '../../services/ai/nineRouterTokenService';
import { testNineRouterConnection } from '../../services/ai/nineRouterClient';
import { testImageGenerationConnection } from '../../services/ai/imageGenerationClient';
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

  const [availableImageModels, setAvailableImageModels] = useState<string[]>([
    'dall-e-3',
    'dall-e-2',
    'flux-schnell',
    'flux-dev',
    'stable-diffusion-3',
  ]);

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connectionResult, setConnectionResult] = useState<ConnectionState | null>(null);

  // Secret API key management (Tauri Keyring / Dexie Settings)
  const [keyStored, setKeyStored] = useState(false);
  const [replaceModalOpen, setReplaceModalOpen] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState('');

  // Image Generation Settings State
  const [imageEndpoint, setImageEndpoint] = useState(DEFAULT_IMAGE_ENDPOINT);
  const [imageModel, setImageModel] = useState(DEFAULT_IMAGE_MODEL);
  const [imageKeyStored, setImageKeyStored] = useState(false);
  const [newImageKeyValue, setNewImageKeyValue] = useState('');
  const [replaceImageModalOpen, setReplaceImageModalOpen] = useState(false);
  const [testingImage, setTestingImage] = useState(false);
  const [imageConnectionResult, setImageConnectionResult] = useState<ConnectionState | null>(null);

  // Graphiti MCP Settings State
  const [graphitiEndpoint, setGraphitiEndpoint] = useState(DEFAULT_GRAPHITI_MCP_ENDPOINT);
  const [testingGraphiti, setTestingGraphiti] = useState(false);
  const [graphitiConnectionResult, setGraphitiConnectionResult] = useState<{
    ok: boolean;
    message: string;
    toolsCount?: number;
  } | null>(null);

  // Check stored state and config on mount
  useEffect(() => {
    let active = true;

    async function loadData() {
      const stored = await isNineRouterApiKeyStored(db);
      const config = await getNineRouterConfig(db);
      const imgConfig = await getImageConfig(db);
      const imgKeyStored = await isImageApiKeyStored(db);
      const savedGraphitiEndpoint = await getGraphitiMcpEndpoint(db);

      if (!active) return;
      setKeyStored(stored);
      setEndpoint(config.endpoint);
      setDefaultModel(config.defaultModel);
      if (config.charLimit) setCharLimit(config.charLimit);

      setImageEndpoint(imgConfig.endpoint);
      setImageModel(imgConfig.defaultModel);
      setImageKeyStored(imgKeyStored);
      setGraphitiEndpoint(savedGraphitiEndpoint);

      // Check if cached model list exists
      const modelsRec = await db.settings.get('ninerouter_cached_models');
      if (active && Array.isArray(modelsRec?.value) && modelsRec.value.length > 0) {
        const cached = modelsRec.value as string[];
        setAvailableModels(cached);
        if (!cached.includes(config.defaultModel) && cached[0]) {
          setDefaultModel(cached[0]);
        }
      }

      // Check if cached image model list exists
      const imgModelsRec = await db.settings.get('image_cached_models');
      if (active && Array.isArray(imgModelsRec?.value) && imgModelsRec.value.length > 0) {
        const cachedImg = imgModelsRec.value as string[];
        setAvailableImageModels(cachedImg);
        if (!cachedImg.includes(imgConfig.defaultModel) && cachedImg[0]) {
          setImageModel(cachedImg[0]);
        }
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
          if (!res.models.includes(defaultModel) && res.models[0]) {
            setDefaultModel(res.models[0]);
          }
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

      // Save image config as well
      if (newImageKeyValue.trim()) {
        await setImageApiKey(newImageKeyValue.trim(), db);
        setImageKeyStored(true);
        setNewImageKeyValue('');
      }

      await setImageConfig(
        {
          endpoint: imageEndpoint,
          defaultModel: imageModel,
        },
        db
      );

      // Save Graphiti MCP endpoint
      await setGraphitiMcpEndpoint(graphitiEndpoint, db);

      notification.success({
        message: 'Lưu cấu hình thành công',
        description: 'Thông số kết nối 9router, tạo ảnh và Graphiti MCP đã được cập nhật.',
      });
      announceToScreenReader('Đã lưu cấu hình AI, tạo ảnh và Graphiti MCP');
    } catch (err: any) {
      notification.error({
        message: 'Lỗi lưu cấu hình',
        description: err?.message || 'Không thể lưu cài đặt 9router.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestGraphitiConnection = async () => {
    setTestingGraphiti(true);
    setGraphitiConnectionResult(null);
    try {
      const res = await testGraphitiMcpConnection(graphitiEndpoint, db);
      setGraphitiConnectionResult(res);
      if (res.ok) {
        announceToScreenReader('Kết nối Graphiti MCP thành công');
      } else {
        announceToScreenReader('Kết nối Graphiti MCP thất bại');
      }
    } catch (err: any) {
      setGraphitiConnectionResult({
        ok: false,
        message: err?.message || 'Lỗi kiểm tra kết nối Graphiti MCP',
      });
    } finally {
      setTestingGraphiti(false);
    }
  };

  const handleTestImageConnection = async () => {
    setTestingImage(true);
    setImageConnectionResult(null);
    try {
      const activeKey =
        newImageKeyValue.trim() || (await getImageApiKey(db));

      const res = await testImageGenerationConnection({
        endpoint: imageEndpoint,
        apiKey: activeKey || '',
      });

      if (res.ok) {
        if (res.models && res.models.length > 0) {
          setAvailableImageModels(res.models);
          await db.settings.put({
            key: 'image_cached_models',
            value: res.models,
          });
          if (!res.models.includes(imageModel) && res.models[0]) {
            setImageModel(res.models[0]);
          }
        }
        setImageConnectionResult({
          ok: true,
          message: `Kết nối máy chủ tạo ảnh thành công (${res.models.length} models tìm thấy).`,
          modelsCount: res.models.length,
          models: res.models,
        });
        announceToScreenReader('Kết nối máy chủ ảnh thành công');
      } else {
        setImageConnectionResult({
          ok: false,
          message: res.error || `Lỗi kết nối HTTP ${res.status}`,
        });
        announceToScreenReader('Kiểm tra kết nối ảnh thất bại');
      }
    } catch (err: any) {
      setImageConnectionResult({
        ok: false,
        message: err?.message || 'Lỗi kiểm tra kết nối tạo ảnh',
      });
    } finally {
      setTestingImage(false);
    }
  };

  const handleForgetImageApiKey = async () => {
    try {
      await forgetImageApiKey(db);
      setImageKeyStored(false);
      setNewImageKeyValue('');
      notification.info({
        message: 'Đã xóa API Key tạo ảnh',
        description: 'Khóa API Key tạo ảnh đã được xóa.',
      });
    } catch (err: any) {
      notification.error({
        message: 'Lỗi khi xóa API Key tạo ảnh',
        description: err?.message,
      });
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
          extra="Mặc định: http://localhost:20128 (chạy daemon qua lệnh `npx 9router`, hoặc đường dẫn tương thích OpenAI /v1)"
        >
          <Input
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="http://localhost:20128"
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
            filterOption={(input, option) =>
              ((option?.label as string) ?? '').toLowerCase().includes(input.toLowerCase())
            }
            options={
              availableModels.length > 0
                ? availableModels.map((m) => ({ label: m, value: m }))
                : defaultModel
                  ? [{ label: defaultModel, value: defaultModel }]
                  : []
            }
          />
        </Form.Item>

        <Form.Item
          label="Giới hạn ký tự ngữ cảnh (Safe Character Budget)"
          extra={
            <div style={{ marginTop: 6, fontSize: 12 }}>
              <div style={{ marginBottom: 6 }}>
                Tương đương ước tính:{' '}
                <strong style={{ color: '#1677ff' }}>
                  ~{Math.round(charLimit / 4).toLocaleString()} tokens
                </strong>{' '}
                <span style={{ color: '#8c8c8c' }}>(quy đổi xấp xỉ 1 token ≈ 4 ký tự)</span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ color: '#8c8c8c' }}>Gợi ý nhanh:</span>
                <Tag.CheckableTag
                  checked={charLimit === 12000}
                  onChange={() => setCharLimit(12000)}
                >
                  12k (~3k tok) • Mặc định
                </Tag.CheckableTag>
                <Tag.CheckableTag
                  checked={charLimit === 32000}
                  onChange={() => setCharLimit(32000)}
                >
                  32k (~8k tok) • Local vừa
                </Tag.CheckableTag>
                <Tag.CheckableTag
                  checked={charLimit === 128000}
                  onChange={() => setCharLimit(128000)}
                >
                  128k (~32k tok) • Cân bằng
                </Tag.CheckableTag>
                <Tag.CheckableTag
                  checked={charLimit === 500000}
                  onChange={() => setCharLimit(500000)}
                >
                  500k (~125k tok) • GPT-4o / Claude
                </Tag.CheckableTag>
                <Tag.CheckableTag
                  checked={charLimit === 1000000}
                  onChange={() => setCharLimit(1000000)}
                >
                  1M (~250k tok) • Siêu lớn
                </Tag.CheckableTag>
              </div>
              <div style={{ color: '#8c8c8c', lineHeight: 1.4 }}>
                Tự do tùy chỉnh theo mô hình: mô hình nhỏ cục bộ (Ollama 8k–32k context) nên dùng 8k–32k ký tự để tránh lỗi vượt ngữ cảnh; mô hình hiện đại (Claude 3.5, GPT-4o, Gemini) có thể đặt 100k–1M+ ký tự để nạp file và tài liệu đầy đủ.
              </div>
            </div>
          }
        >
          <InputNumber
            min={1000}
            max={5000000}
            step={1000}
            formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={(value) => {
              const parsed = value ? parseInt(value.replace(/,/g, ''), 10) : DEFAULT_NINEROUTER_CHAR_LIMIT;
              return isNaN(parsed) ? DEFAULT_NINEROUTER_CHAR_LIMIT : parsed;
            }}
            value={charLimit}
            onChange={(val) => setCharLimit(val || DEFAULT_NINEROUTER_CHAR_LIMIT)}
            style={{ width: 240 }}
            addonAfter="ký tự"
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
                description={
                  <div>
                    <div style={{ marginBottom: 6 }}>{connectionResult.message}</div>
                    <div style={{ fontSize: 12, opacity: 0.9 }}>
                      <strong>Gợi ý:</strong> 9Router server chạy cục bộ tại <code>http://localhost:20128</code> (chạy lệnh <code>npx 9router</code>). Nếu dùng Web qua HTTPS, trình duyệt sẽ chặn kết nối HTTP cục bộ (Mixed Content) - hãy sử dụng ứng dụng Tauri Desktop.
                    </div>
                  </div>
                }
              />
            )}
          </div>
        )}

        <div style={{ marginTop: 28, marginBottom: 16, borderTop: '1px solid #f0f0f0', paddingTop: 20 }}>
          <Space align="center" style={{ marginBottom: 12 }}>
            <PictureOutlined style={{ fontSize: 18, color: '#4f46e5' }} />
            <Text strong style={{ fontSize: 15 }}>
              Cấu hình Tạo hình ảnh AI (Image Generation - DALL-E / Flux / OpenAI)
            </Text>
          </Space>
          <Paragraph type="secondary" style={{ fontSize: 13 }}>
            Tùy chọn tạo ảnh minh họa trực tiếp thông qua công cụ `generate_image`. Sử dụng endpoint OpenAI `/v1/images/generations` hoặc qua 9router daemon.
          </Paragraph>

          <Form.Item
            label="Image Endpoint"
            extra="Đường dẫn API tạo ảnh tương thích OpenAI (mặc định trỏ theo 9router hoặc OpenAI)"
          >
            <Input
              value={imageEndpoint}
              onChange={(e) => setImageEndpoint(e.target.value)}
              placeholder="http://localhost:20128"
            />
          </Form.Item>

          <Form.Item
            label="Mô hình tạo ảnh (Image Model)"
            extra={
              <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
                {availableImageModels.length > 5
                  ? `Đã nạp ${availableImageModels.length} mô hình từ máy chủ (bấm "Kiểm tra kết nối tạo ảnh" để cập nhật). Có thể chọn hoặc gõ tùy chỉnh.`
                  : 'Gợi ý: dall-e-3, dall-e-2, flux-schnell, flux-dev, stable-diffusion-3. Bấm "Kiểm tra kết nối tạo ảnh" để nạp danh sách từ máy chủ, hoặc gõ tùy chỉnh.'}
              </div>
            }
          >
            <AutoComplete
              value={imageModel}
              onChange={(val) => setImageModel(val)}
              options={Array.from(new Set([imageModel, ...availableImageModels]))
                .filter(Boolean)
                .map((m) => ({ label: m, value: m }))}
              placeholder="Chọn hoặc nhập tên mô hình tạo ảnh (VD: dall-e-3, flux-dev...)"
              filterOption={(inputValue, option) =>
                ((option?.value as string) ?? '').toLowerCase().includes(inputValue.toLowerCase())
              }
            />
          </Form.Item>

          <Form.Item
            label="API Key riêng cho tạo ảnh (Tùy chọn)"
            extra="Nếu để trống, hệ thống sẽ tự động dùng chung API Key của 9router ở trên."
          >
            {imageKeyStored ? (
              <Space orientation="horizontal" style={{ width: '100%', justifyContent: 'space-between' }}>
                <Space>
                  <Tag color="purple" icon={<SafetyCertificateOutlined />}>
                    API Key tạo ảnh riêng đã lưu
                  </Tag>
                  <Text type="secondary">(••••••••••••••••)</Text>
                </Space>
                <Space>
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => setReplaceImageModalOpen(true)}
                  >
                    Thay đổi
                  </Button>
                  <Popconfirm
                    title="Xác nhận xóa API Key tạo ảnh"
                    description="Bạn có muốn xóa API Key tạo ảnh riêng? (Hệ thống sẽ dùng lại 9router API Key)."
                    onConfirm={handleForgetImageApiKey}
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
                value={newImageKeyValue}
                onChange={(e) => setNewImageKeyValue(e.target.value)}
                placeholder="Nhập API Key riêng cho tạo ảnh (nếu khác 9router)"
                prefix={<LockOutlined />}
              />
            )}
          </Form.Item>

          {imageConnectionResult && (
            <div style={{ marginBottom: 16 }}>
              {imageConnectionResult.ok ? (
                <Alert
                  type="success"
                  showIcon
                  icon={<CheckCircleOutlined />}
                  message={imageConnectionResult.message}
                />
              ) : (
                <Alert
                  type="error"
                  showIcon
                  message="Kiểm tra kết nối tạo ảnh thất bại"
                  description={imageConnectionResult.message}
                />
              )}
            </div>
          )}

          <Space style={{ marginBottom: 16 }}>
            <Button
              icon={<PictureOutlined />}
              onClick={handleTestImageConnection}
              loading={testingImage}
            >
              Kiểm tra kết nối tạo ảnh
            </Button>
          </Space>
        </div>

        <div style={{ marginTop: 28, marginBottom: 16, borderTop: '1px solid #f0f0f0', paddingTop: 20 }}>
          <Space align="center" style={{ marginBottom: 12 }}>
            <ClusterOutlined style={{ fontSize: 18, color: '#0284c7' }} />
            <Text strong style={{ fontSize: 15 }}>
              Graphiti MCP (Knowledge Graph & Domain Memory)
            </Text>
          </Space>
          <Paragraph type="secondary" style={{ fontSize: 13 }}>
            Cấu hình cổng kết nối Graphiti MCP cho trợ lý AI để tra cứu các nút, dữ kiện tri thức và thông tin bảng/trường ngân hàng dưới dạng chỉ đọc.
          </Paragraph>

          <Form.Item
            label="Graphiti MCP Endpoint"
            extra="Mặc định: http://10.4.97.70:30456/mcp (kết nối proxy cục bộ hoặc mạng nội bộ được cho phép)"
          >
            <Space.Compact style={{ width: '100%' }}>
              <Input
                value={graphitiEndpoint}
                onChange={(e) => setGraphitiEndpoint(e.target.value)}
                placeholder={DEFAULT_GRAPHITI_MCP_ENDPOINT}
              />
              <Button
                icon={<ReloadOutlined />}
                onClick={() => setGraphitiEndpoint(DEFAULT_GRAPHITI_MCP_ENDPOINT)}
                title="Khôi phục mặc định"
              >
                Mặc định
              </Button>
            </Space.Compact>
          </Form.Item>

          {graphitiConnectionResult && (
            <div style={{ marginBottom: 16 }}>
              {graphitiConnectionResult.ok ? (
                <Alert
                  type="success"
                  showIcon
                  icon={<CheckCircleOutlined />}
                  message={graphitiConnectionResult.message}
                />
              ) : (
                <Alert
                  type="error"
                  showIcon
                  message="Kiểm tra kết nối Graphiti MCP thất bại"
                  description={
                    <div>
                      <div style={{ marginBottom: 6 }}>{graphitiConnectionResult.message}</div>
                      <div style={{ fontSize: 12, opacity: 0.9 }}>
                        <strong>Lưu ý:</strong> Graphiti MCP yêu cầu chạy qua môi trường ứng dụng Tauri Desktop và địa chỉ máy chủ hợp lệ trong mạng LAN hoặc máy cục bộ.
                      </div>
                    </div>
                  }
                />
              )}
            </div>
          )}

          <Space style={{ marginBottom: 16 }}>
            <Button
              icon={<ClusterOutlined />}
              onClick={handleTestGraphitiConnection}
              loading={testingGraphiti}
            >
              Kiểm tra kết nối Graphiti MCP
            </Button>
          </Space>
        </div>

        <Space>
          <Button
            icon={<ApiOutlined />}
            onClick={handleTestConnection}
            loading={testing}
          >
            Kiểm tra kết nối 9router
          </Button>

          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSaveConfig}
            loading={saving}
          >
            Lưu tất cả cấu hình
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

      <Modal
        title="Cập nhật Image API Key"
        open={replaceImageModalOpen}
        onCancel={() => {
          setReplaceImageModalOpen(false);
          setNewImageKeyValue('');
        }}
        onOk={async () => {
          if (newImageKeyValue.trim()) {
            await setImageApiKey(newImageKeyValue.trim(), db);
            setImageKeyStored(true);
            setReplaceImageModalOpen(false);
            setNewImageKeyValue('');
            notification.success({ message: 'Đã cập nhật Image API Key mới' });
          }
        }}
        okText="Cập nhật"
        cancelText="Hủy"
        okButtonProps={{ disabled: !newImageKeyValue.trim() }}
      >
        <Paragraph>Nhập API Key mới cho dịch vụ tạo ảnh:</Paragraph>
        <Input.Password
          value={newImageKeyValue}
          onChange={(e) => setNewImageKeyValue(e.target.value)}
          placeholder="sk-..."
          prefix={<LockOutlined />}
        />
      </Modal>
    </Card>
  );
};
