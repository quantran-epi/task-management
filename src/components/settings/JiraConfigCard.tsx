import React, { useState, useEffect } from 'react';
import {
  Card,
  Form,
  Input,
  Select,
  Button,
  Space,
  Alert,
  Typography,
  notification,
  Row,
  Col,
} from 'antd';
import {
  CloudSyncOutlined,
  SaveOutlined,
  CheckCircleOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { testJiraConnection } from '../../services/jira/jiraApi';
import {
  DEFAULT_JIRA_STATUS_MAPPINGS,
  LOCAL_TASK_STATUSES,
  normalizeJiraStatusMappings,
  type JiraStatusMappings,
} from '../../services/jira/statusMapping';
import { announceToScreenReader } from '../common/AriaLiveRegion';

const { Paragraph } = Typography;

export interface JiraConfigCardProps {
  db?: TaskPlannerDatabase;
}

export type DiagnosticState =
  | { status: 'success'; message: string }
  | { status: 'cors_blocked'; message: string }
  | { status: 'auth_error'; message: string }
  | { status: 'error'; message: string }
  | null;

export const JiraConfigCard: React.FC<JiraConfigCardProps> = ({ db = defaultDb }) => {
  const [domain, setDomain] = useState('');
  const [email, setEmail] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [corsProxy, setCorsProxy] = useState('');
  const [defaultProjectKey, setDefaultProjectKey] = useState('');
  const [defaultIssueType, setDefaultIssueType] = useState('Task');
  const [statusMappings, setStatusMappings] = useState<JiraStatusMappings>(() =>
    normalizeJiraStatusMappings(DEFAULT_JIRA_STATUS_MAPPINGS)
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<DiagnosticState>(null);

  // Load Jira settings from IndexedDB (D-01)
  const savedSettings = useLiveQuery(async () => {
    const [domainRec, emailRec, tokenRec, proxyRec, projRec, issueTypeRec, mappingRec] =
      await Promise.all([
        db.settings.get('jira_domain'),
        db.settings.get('jira_email'),
        db.settings.get('jira_api_token'),
        db.settings.get('jira_cors_proxy'),
        db.settings.get('jira_default_project'),
        db.settings.get('jira_default_issue_type'),
        db.settings.get('jira_status_mappings'),
      ]);
    return {
      domain: (domainRec?.value as string) || '',
      email: (emailRec?.value as string) || '',
      apiToken: (tokenRec?.value as string) || '',
      corsProxy: (proxyRec?.value as string) || '',
      defaultProjectKey: (projRec?.value as string) || '',
      defaultIssueType: (issueTypeRec?.value as string) || 'Task',
      statusMappings: normalizeJiraStatusMappings(mappingRec?.value),
    };
  }, [db]);

  useEffect(() => {
    if (savedSettings) {
      setDomain(savedSettings.domain);
      setEmail(savedSettings.email);
      setApiToken(savedSettings.apiToken);
      setCorsProxy(savedSettings.corsProxy);
      setDefaultProjectKey(savedSettings.defaultProjectKey);
      setDefaultIssueType(savedSettings.defaultIssueType);
      setStatusMappings(savedSettings.statusMappings);
    }
  }, [savedSettings]);

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      await db.transaction('rw', db.settings, async () => {
        await db.settings.put({ key: 'jira_domain', value: domain.trim() });
        await db.settings.put({ key: 'jira_email', value: email.trim() });
        await db.settings.put({ key: 'jira_api_token', value: apiToken.trim() });
        await db.settings.put({ key: 'jira_cors_proxy', value: corsProxy.trim() });
        await db.settings.put({
          key: 'jira_default_project',
          value: defaultProjectKey.trim().toUpperCase(),
        });
        await db.settings.put({
          key: 'jira_default_issue_type',
          value: defaultIssueType.trim() || 'Task',
        });
        await db.settings.put({
          key: 'jira_status_mappings',
          value: normalizeJiraStatusMappings(statusMappings),
        });
      });

      notification.success({
        message: 'Đã lưu cấu hình Jira',
        description: 'Thông tin kết nối Jira Cloud đã được lưu vào cơ sở dữ liệu IndexedDB.',
      });
      announceToScreenReader('Đã lưu cấu hình Jira');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể lưu cấu hình Jira.';
      notification.error({
        message: 'Lưu cấu hình thất bại',
        description: msg,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setDiagnosticResult(null);

    try {
      const user = await testJiraConnection({
        domain: domain.trim(),
        email: email.trim(),
        apiToken: apiToken.trim(),
        corsProxy: corsProxy.trim(),
      });

      await db.settings.put({ key: 'jira_account_id', value: user.accountId });

      const successMsg = `Kết nối thành công! Đã xác thực với tài khoản ${user.displayName} (${user.emailAddress}).`;
      setDiagnosticResult({
        status: 'success',
        message: successMsg,
      });
      announceToScreenReader(successMsg);
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message === 'CORS_BLOCKED') {
          const corsMsg =
            'Yêu cầu mạng bị chặn do chính sách CORS của trình duyệt. Vui lòng cấu hình CORS Proxy URL hợp lệ để kết nối với Jira Cloud.';
          setDiagnosticResult({
            status: 'cors_blocked',
            message: corsMsg,
          });
          announceToScreenReader(corsMsg);
          return;
        }

        // XSRF check failed — show specific message with proxy guidance
        if (err.message.toLowerCase().includes('xsrf') || err.message.toLowerCase().includes('csrf')) {
          setDiagnosticResult({
            status: 'cors_blocked',
            message: err.message,
          });
          announceToScreenReader(err.message);
          return;
        }

        if (
          err.message.includes('401') ||
          err.message.includes('403') ||
          err.message.toLowerCase().includes('unauthorized') ||
          err.message.toLowerCase().includes('forbidden')
        ) {
          const authMsg =
            'Xác thực thất bại (401/403). Vui lòng kiểm tra lại Jira Domain, Email và API Token.';
          setDiagnosticResult({
            status: 'auth_error',
            message: authMsg,
          });
          announceToScreenReader(authMsg);
          return;
        }

        setDiagnosticResult({
          status: 'error',
          message: err.message,
        });
        announceToScreenReader(`Lỗi kết nối Jira: ${err.message}`);
        return;
      }

      const defaultError = 'Lỗi không xác định khi kết nối với Jira.';
      setDiagnosticResult({
        status: 'error',
        message: defaultError,
      });
      announceToScreenReader(defaultError);
    } finally {
      setTesting(false);
    }
  };

  const canTestConnection = Boolean(domain.trim() && email.trim() && apiToken.trim());

  return (
    <Card
      title={
        <Space>
          <CloudSyncOutlined />
          <span>Cấu hình tích hợp Jira Cloud</span>
        </Space>
      }
    >
      <Paragraph type="secondary">
        Kết nối ứng dụng với Jira Cloud thông qua Jira REST API v3 để tạo issue, gắn mã công việc
        và thực hiện chuyển trạng thái (workflow transitions) trực tiếp từ chi tiết tác vụ.
      </Paragraph>

      <Alert
        type="info"
        showIcon
        icon={<SafetyCertificateOutlined />}
        message="Bảo mật API Token cục bộ"
        description="Toàn bộ thông tin Jira API Token được lưu trữ trực tiếp trong cơ sở dữ liệu IndexedDB của trình duyệt, không bao giờ truyền qua máy chủ ứng dụng trung gian."
        style={{ marginBottom: 16 }}
      />

      {diagnosticResult && (
        <Alert
          type={
            diagnosticResult.status === 'success'
              ? 'success'
              : diagnosticResult.status === 'cors_blocked'
                ? 'warning'
                : 'error'
          }
          showIcon
          message={diagnosticResult.message}
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setDiagnosticResult(null)}
        />
      )}

      <Form layout="vertical">
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item
              label="Tên miền Jira (Domain)"
              required
              extra="Ví dụ: my-org.atlassian.net (không cần nhập https://)"
            >
              <Input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="my-org.atlassian.net"
                aria-label="Tên miền Jira"
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item label="Email tài khoản Jira" required extra="Email dùng đăng nhập Atlassian">
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                aria-label="Email Jira"
              />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          label="Jira API Token"
          required
          extra="Tạo API token tại: id.atlassian.com/manage-profile/security/api-tokens"
        >
          <Input.Password
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
            placeholder="••••••••••••••••"
            aria-label="Jira API Token"
          />
        </Form.Item>

        <Form.Item
          label="CORS Proxy URL (Tùy chọn)"
          extra="Do trình duyệt chặn gọi API trực tiếp tới Atlassian (CORS), cấu hình Proxy URL (như Cloudflare Worker) để chuyển tiếp request. Ví dụ: https://my-proxy.workers.dev/?url="
        >
          <Input
            value={corsProxy}
            onChange={(e) => setCorsProxy(e.target.value)}
            placeholder="https://my-proxy.workers.dev/?url="
            aria-label="CORS Proxy URL"
          />
        </Form.Item>

        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item
              label="Mã dự án mặc định (Default Project Key)"
              extra="Điền sẵn khi tạo Issue mới từ task (ví dụ: SHB)"
            >
              <Input
                value={defaultProjectKey}
                onChange={(e) => setDefaultProjectKey(e.target.value)}
                placeholder="SHB"
                aria-label="Mã dự án mặc định"
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item label="Loại Issue mặc định (Default Issue Type)">
              <Select
                value={defaultIssueType}
                onChange={(val) => setDefaultIssueType(val)}
                aria-label="Loại Issue mặc định"
                options={[
                  { value: 'Task', label: 'Task' },
                  { value: 'Bug', label: 'Bug' },
                  { value: 'Story', label: 'Story' },
                  { value: 'Sub-task', label: 'Sub-task' },
                ]}
              />
            </Form.Item>
          </Col>
        </Row>

        <Typography.Title level={5}>Ánh xạ trạng thái cục bộ sang Jira</Typography.Title>
        <Paragraph type="secondary">
          Nhập Jira status ID từ cấu hình workflow/status. Có thể dùng tên hoặc token đang được
          Jira trả về.
        </Paragraph>
        <Row gutter={16}>
          {LOCAL_TASK_STATUSES.map((status) => (
            <Col xs={24} sm={12} key={status}>
              <Form.Item label={status}>
                <Select
                  mode="tags"
                  value={statusMappings[status]}
                  onChange={(values) =>
                    setStatusMappings((current) => ({ ...current, [status]: values }))
                  }
                  tokenSeparators={[',']}
                  aria-label={`Jira statuses cho ${status}`}
                />
              </Form.Item>
            </Col>
          ))}
        </Row>

        <Form.Item style={{ marginBottom: 0 }}>
          <Space wrap>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={handleSaveConfig}
            >
              Lưu cấu hình Jira
            </Button>

            <Button
              icon={<CheckCircleOutlined />}
              loading={testing}
              disabled={!canTestConnection}
              onClick={handleTestConnection}
            >
              Kiểm tra kết nối
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Card>
  );
};
