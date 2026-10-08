import React, { useEffect, useState } from 'react';
import { ApiOutlined, SaveOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Form, Input, Space, Switch, Typography } from 'antd';
import { announceToScreenReader } from '../common/AriaLiveRegion';
import {
  useKnowledgeConfig,
  validateKnowledgeBaseUrl,
} from '../../services/knowledge/knowledgeConfig';

const { Paragraph } = Typography;

type Diagnostic = {
  type: 'success' | 'error' | 'warning';
  message: string;
};

export interface KnowledgeServerConfigCardProps {
  fetcher?: typeof fetch;
}

function invalidUrlMessage(value: string): string {
  try {
    validateKnowledgeBaseUrl(value);
    return '';
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : '';
    if (detail.includes('requires HTTPS')) return 'Máy chủ từ xa phải dùng HTTPS.';
    if (detail.includes('without /api/v1')) return 'Chỉ nhập URL gốc, không thêm đường dẫn /api/v1.';
    return 'URL Knowledge Server không hợp lệ.';
  }
}

export const KnowledgeServerConfigCard: React.FC<KnowledgeServerConfigCardProps> = ({
  fetcher = fetch,
}) => {
  const config = useKnowledgeConfig();
  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!config.ready) return;
    setEnabled(config.enabled);
    setBaseUrl(config.baseUrl);
  }, [config.ready, config.enabled, config.baseUrl]);

  const validationMessage = baseUrl ? invalidUrlMessage(baseUrl) : '';
  const loopbackWarning = (() => {
    if (!baseUrl || validationMessage) return false;
    return validateKnowledgeBaseUrl(baseUrl).loopbackHttpWarning;
  })();

  const showDiagnostic = (next: Diagnostic) => {
    setDiagnostic(next);
    announceToScreenReader(next.message);
  };

  const handleSave = async () => {
    const message = baseUrl ? invalidUrlMessage(baseUrl) : enabled ? 'URL Knowledge Server không hợp lệ.' : '';
    if (message) {
      showDiagnostic({ type: 'error', message });
      return;
    }
    setSaving(true);
    try {
      await config.savePersistedConfig({ enabled, baseUrl });
      const normalized = baseUrl ? validateKnowledgeBaseUrl(baseUrl).baseUrl : '';
      setBaseUrl(normalized);
      showDiagnostic({ type: 'success', message: 'Đã lưu cấu hình Knowledge Server.' });
    } catch {
      showDiagnostic({ type: 'error', message: 'Không thể lưu cấu hình Knowledge Server.' });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!enabled) return;
    const message = invalidUrlMessage(baseUrl);
    if (message || !baseUrl) {
      showDiagnostic({
        type: 'error',
        message: message || 'URL Knowledge Server không hợp lệ.',
      });
      return;
    }

    setTesting(true);
    setDiagnostic(null);
    try {
      const normalized = validateKnowledgeBaseUrl(baseUrl).baseUrl;
      const response = await fetcher(`${normalized}/api/v1/health`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
        },
      });
      if (response.ok) {
        showDiagnostic({ type: 'success', message: 'Kết nối Knowledge Server thành công.' });
      } else if (response.status === 401) {
        showDiagnostic({ type: 'error', message: 'Token phiên không hợp lệ hoặc đã hết hạn.' });
      } else if (response.status === 403) {
        showDiagnostic({ type: 'error', message: 'Token phiên không có quyền truy cập Knowledge Server.' });
      } else {
        showDiagnostic({
          type: 'error',
          message: 'Knowledge Server không phản hồi hợp lệ. Kiểm tra cấu hình rồi thử lại.',
        });
      }
    } catch (error: unknown) {
      const isCors = error instanceof Error && /cors/iu.test(error.message);
      showDiagnostic({
        type: 'error',
        message: isCors
          ? 'Trình duyệt đã chặn kết nối CORS. Kiểm tra nguồn được phép trên Knowledge Server.'
          : 'Không thể kết nối Knowledge Server. Kiểm tra máy chủ và mạng rồi thử lại.',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card
      loading={!config.ready}
      title={
        <Space>
          <ApiOutlined />
          <span>Knowledge Server</span>
        </Space>
      }
    >
      <Paragraph type="secondary">
        Dịch vụ độc lập và tùy chọn để xuất bản thủ công tài liệu đã chọn. Docs, tự động lưu và tìm kiếm BM25 cục bộ vẫn hoạt động khi dịch vụ tắt hoặc không thể kết nối.
      </Paragraph>

      <Form layout="vertical">
        <Form.Item label="Bật Knowledge Server">
          <Switch
            checked={enabled}
            onChange={(checked) => {
              setEnabled(checked);
              setDiagnostic(null);
            }}
            aria-label="Bật Knowledge Server"
          />
        </Form.Item>

        <Form.Item
          label="URL Knowledge Server"
          {...(validationMessage
            ? { validateStatus: 'error' as const, help: validationMessage }
            : {})}
        >
          <Input
            value={baseUrl}
            onChange={(event) => {
              setBaseUrl(event.target.value);
              setDiagnostic(null);
            }}
            placeholder="https://knowledge.internal.example"
            aria-label="URL Knowledge Server"
            autoComplete="url"
          />
        </Form.Item>

        {loopbackWarning && (
          <Alert
            type="warning"
            showIcon
            message="HTTP chỉ được phép cho máy cục bộ."
            style={{ marginBottom: 16 }}
          />
        )}

        <Form.Item
          label="Token phiên"
          extra="Chỉ giữ trong bộ nhớ và sẽ mất khi tải lại ứng dụng."
        >
          <Input.Password
            value={config.token}
            onChange={(event) => config.setToken(event.target.value)}
            aria-label="Token phiên"
            autoComplete="new-password"
          />
        </Form.Item>

        {diagnostic && (
          <Alert
            type={diagnostic.type}
            showIcon
            message={diagnostic.message}
            style={{ marginBottom: 16 }}
          />
        )}

        <Space wrap>
          <Button
            icon={<ApiOutlined />}
            onClick={handleTest}
            loading={testing}
            disabled={!enabled}
          >
            Kiểm tra kết nối
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={saving}
          >
            Lưu cấu hình
          </Button>
        </Space>
      </Form>
    </Card>
  );
};
