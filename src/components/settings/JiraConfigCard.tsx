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
  Tag,
  Modal,
  Popconfirm,
} from 'antd';
import {
  CloudSyncOutlined,
  SaveOutlined,
  CheckCircleOutlined,
  SafetyCertificateOutlined,
  LockOutlined,
  EditOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { getJiraStatuses, testJiraConnection } from '../../services/jira/jiraApi';
import {
  DEFAULT_JIRA_STATUS_MAPPINGS,
  LOCAL_TASK_STATUSES,
  normalizeJiraStatusMappings,
} from '../../services/jira/statusMapping';
import type { TaskStatus } from '../../types/models';
import type { JiraStatusCatalogItem } from '../../services/jira/types';
import {
  getJiraApiToken,
  setJiraApiToken,
  forgetJiraApiToken,
  isJiraApiTokenStored,
  migrateLegacyJiraTokenIfNeeded,
} from '../../services/jiraTokenService';
import { isTauriApp } from '../../utils/timerPopout';
import { announceToScreenReader } from '../common/AriaLiveRegion';

const { Paragraph, Text } = Typography;

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
  const [corsProxy, setCorsProxy] = useState('');
  const [defaultProjectKey, setDefaultProjectKey] = useState('');
  const [defaultIssueType, setDefaultIssueType] = useState('Task');
  const [statusMappings, setStatusMappings] = useState<Record<TaskStatus, string[]>>(() =>
    normalizeJiraStatusMappings(DEFAULT_JIRA_STATUS_MAPPINGS)
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<DiagnosticState>(null);
  const [jiraStatuses, setJiraStatuses] = useState<JiraStatusCatalogItem[]>([]);

  // Secret token management (D-33, D-34, D-37)
  const [tokenStored, setTokenStored] = useState(false);
  const [replaceModalOpen, setReplaceModalOpen] = useState(false);
  const [newTokenValue, setNewTokenValue] = useState('');

  // Check stored state on mount / update
  const checkTokenStatus = async () => {
    if (isTauriApp()) {
      await migrateLegacyJiraTokenIfNeeded(db);
    }
    const stored = await isJiraApiTokenStored(db);
    setTokenStored(stored);
  };

  useEffect(() => {
    void checkTokenStatus();
  }, [db]);

  // Load non-secret Jira settings from IndexedDB (D-01)
  const savedSettings = useLiveQuery(async () => {
    const [domainRec, emailRec, proxyRec, projRec, issueTypeRec, mappingRec] =
      await Promise.all([
        db.settings.get('jira_domain'),
        db.settings.get('jira_email'),
        db.settings.get('jira_cors_proxy'),
        db.settings.get('jira_default_project'),
        db.settings.get('jira_default_issue_type'),
        db.settings.get('jira_status_mappings'),
      ]);
    return {
      domain: (domainRec?.value as string) || '',
      email: (emailRec?.value as string) || '',
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
        description: 'Thông tin kết nối Jira Cloud đã được cập nhật thành công.',
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

  const handleSaveNewToken = async () => {
    if (!newTokenValue.trim()) return;
    try {
      await setJiraApiToken(newTokenValue.trim(), db);
      setNewTokenValue('');
      setReplaceModalOpen(false);
      setTokenStored(true);
      notification.success({
        message: 'Đã cập nhật Jira API Token',
        description: isTauriApp()
          ? 'Token đã được lưu an toàn trong OS Keychain.'
          : 'Token đã được lưu trong phiên làm việc.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể lưu token.';
      notification.error({
        message: 'Lưu token thất bại',
        description: msg,
      });
    }
  };

  const handleForgetToken = async () => {
    try {
      await forgetJiraApiToken(db);
      setTokenStored(false);
      notification.info({
        message: 'Đã xóa Jira API Token',
        description: 'Token đã được loại bỏ hoàn toàn khỏi bộ nhớ và Keychain.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể xóa token.';
      notification.error({
        message: 'Xóa token thất bại',
        description: msg,
      });
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setDiagnosticResult(null);

    try {
      const token = await getJiraApiToken(db);
      const user = await testJiraConnection({
        domain: domain.trim(),
        email: email.trim(),
        apiToken: token,
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

  useEffect(() => {
    let active = true;
    async function loadStatuses() {
      if (!domain.trim() || !email.trim() || !tokenStored) {
        setJiraStatuses([]);
        return;
      }
      try {
        const apiToken = await getJiraApiToken(db);
        if (!apiToken) return;
        const statuses = await getJiraStatuses({
          domain: domain.trim(),
          email: email.trim(),
          apiToken,
          corsProxy: corsProxy.trim(),
        });
        if (active) setJiraStatuses(Array.isArray(statuses) ? statuses : []);
      } catch {
        if (active) setJiraStatuses([]);
      }
    }
    void loadStatuses();
    return () => {
      active = false;
    };
  }, [domain, email, corsProxy, tokenStored, db]);

  const statusOptions = jiraStatuses.map((status) => ({
    value: status.id,
    label: status.name,
  }));
  const statusLabelById = new Map(statusOptions.map((option) => [option.value, option.label]));

  const canTestConnection = Boolean(domain.trim() && email.trim() && tokenStored);

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
        message="Bảo mật API Token (Zero-Secret Disk Boundary)"
        description={
          isTauriApp()
            ? 'Trên bản Desktop (Tauri), API Token được lưu trữ an toàn trong OS Keychain / Credential Manager của hệ điều hành.'
            : 'Trên trình duyệt Web/PWA, token không bao giờ bị lưu lộ liễu và hỗ trợ trình quản lý mật khẩu của trình duyệt.'
        }
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
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              background: 'rgba(0, 0, 0, 0.02)',
              borderRadius: 6,
              border: '1px solid rgba(0, 0, 0, 0.08)',
            }}
          >
            <Space>
              <LockOutlined />
              <Text strong>Trạng thái lưu trữ:</Text>
              {tokenStored ? (
                <Tag color="success">Stored (Đã lưu)</Tag>
              ) : (
                <Tag color="default">Not stored (Chưa lưu)</Tag>
              )}
            </Space>

            <Space>
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => {
                  setNewTokenValue('');
                  setReplaceModalOpen(true);
                }}
              >
                {tokenStored ? 'Thay đổi' : 'Nhập mã token'}
              </Button>
              {tokenStored && (
                <Popconfirm
                  title="Xác nhận xóa token Jira?"
                  description="Mã token sẽ bị xóa khỏi Keychain và bộ nhớ. Bạn sẽ cần nhập lại để tương tác với Jira."
                  okText="Xóa"
                  cancelText="Hủy"
                  okButtonProps={{ danger: true }}
                  onConfirm={handleForgetToken}
                >
                  <Button size="small" danger icon={<DeleteOutlined />}>
                    Xóa
                  </Button>
                </Popconfirm>
              )}
            </Space>
          </div>
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
          Nhập Jira status ID từ cấu hình workflow/status. Tên hoặc token Jira hiện có cũng được
          hỗ trợ.
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
                  tagRender={({ value, closable, onClose }) => (
                    <Tag closable={closable} onClose={onClose} style={{ marginInlineEnd: 4 }}>
                      {statusLabelById.get(String(value)) || String(value)}
                    </Tag>
                  )}
                  options={[
                    ...statusOptions,
                    ...statusMappings[status]
                      .filter((value) => !statusOptions.some((option) => option.value === value))
                      .map((value) => ({ value, label: value })),
                  ]}
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

      {/* Modal for replacing Jira API token without revealing secret */}
      <Modal
        title="Nhập / Thay đổi Jira API Token"
        open={replaceModalOpen}
        onCancel={() => {
          setReplaceModalOpen(false);
          setNewTokenValue('');
        }}
        onOk={handleSaveNewToken}
        okText="Lưu Token"
        cancelText="Hủy"
        okButtonProps={{ disabled: !newTokenValue.trim() }}
      >
        <Paragraph type="secondary">
          Mã token sẽ được bảo vệ bởi OS Keychain (trên Desktop) hoặc phiên bảo mật và không bao giờ
          hiển thị lại dưới dạng văn bản thuần.
        </Paragraph>
        <Input.Password
          autoFocus
          placeholder="Nhập mã Jira API token mới"
          value={newTokenValue}
          onChange={(e) => setNewTokenValue(e.target.value)}
          autoComplete="new-password"
        />
      </Modal>
    </Card>
  );
};
