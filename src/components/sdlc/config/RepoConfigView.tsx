import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Typography,
  Card,
  Form,
  Select,
  Input,
  Button,
  Space,
  Tag,
  Alert,
  Divider,
  Spin,
  message,
  theme,
} from 'antd';
import {
  BranchesOutlined,
  FolderOpenOutlined,
  SaveOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  BookOutlined,
  ApiOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { db as defaultDb, type TaskPlannerDatabase } from '../../../db';
import { getSshConfigs, getSshSecret } from '../../../services/sshService';
import {
  getProjectRepoSshBinding,
  saveProjectRepoSshBinding,
  getRemoteBranches,
} from '../../../services/gitRemoteService';
import {
  loadRepoConventions,
  getGlobalConventions,
  type RepoConventionResult,
} from '../../../services/conventionService';
import type { SshConfig } from '../../../types/ssh';
import type { RemoteGitBranch, ProjectRepoSshBinding } from '../../../types/gitRemote';
import { RemoteDirectoryBrowserModal } from '../../common/RemoteDirectoryBrowserModal';
import { isTauriApp } from '../../../utils/timerPopout';

export interface RepoConfigViewProps {
  projectId: string;
  onBindingSaved?: () => void;
  onNavigateToStep?: (stepId: any) => void;
  db?: TaskPlannerDatabase;
}

export const RepoConfigView: React.FC<RepoConfigViewProps> = ({
  projectId,
  onBindingSaved,
  db = defaultDb,
}) => {
  const { token } = theme.useToken();
  const [form] = Form.useForm();

  // SSH & Binding state
  const [sshConfigs, setSshConfigs] = useState<SshConfig[]>([]);
  const [selectedSshConfigId, setSelectedSshConfigId] = useState<string>('');
  const [remoteRepoPath, setRemoteRepoPath] = useState<string>('');
  const [baseBranch, setBaseBranch] = useState<string>('origin/main');
  const [branches, setBranches] = useState<RemoteGitBranch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [browserModalOpen, setBrowserModalOpen] = useState(false);

  // Status & conventions
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    repoConventions?: RepoConventionResult | null;
  } | null>(null);

  const [globalConventions, setGlobalConventions] = useState<string>('');
  const [repoConventions, setRepoConventions] = useState<RepoConventionResult | null>(null);

  const activeSshConfig = useMemo(
    () => sshConfigs.find((c) => c.id === selectedSshConfigId),
    [sshConfigs, selectedSshConfigId]
  );

  // Load configs & current binding on mount
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [configs, binding, globalText] = await Promise.all([
        getSshConfigs(db),
        getProjectRepoSshBinding(projectId, db),
        getGlobalConventions(db),
      ]);
      setSshConfigs(configs);
      setGlobalConventions(globalText);

      if (binding) {
        setSelectedSshConfigId(binding.sshConfigId);
        setRemoteRepoPath(binding.remoteRepoPath);
        setBaseBranch(binding.defaultBaseBranch || 'origin/main');
        form.setFieldsValue({
          sshConfigId: binding.sshConfigId,
          remoteRepoPath: binding.remoteRepoPath,
          baseBranch: binding.defaultBaseBranch || 'origin/main',
        });

        // Load conventions if bound
        const conventions = await loadRepoConventions(projectId, db);
        setRepoConventions(conventions);
      } else if (configs.length > 0 && configs[0]) {
        setSelectedSshConfigId(configs[0].id);
        const defaultPath = configs[0].defaultRemotePath || '';
        setRemoteRepoPath(defaultPath);
        form.setFieldsValue({
          sshConfigId: configs[0].id,
          remoteRepoPath: defaultPath,
          baseBranch: 'origin/main',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(`Lỗi khi nạp cấu hình: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [projectId, db, form]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Fetch branches on demand
  const handleFetchBranches = async () => {
    if (!activeSshConfig || !remoteRepoPath.trim()) {
      message.warning('Vui lòng chọn cấu hình SSH và nhập đường dẫn repo trước.');
      return;
    }
    setLoadingBranches(true);
    try {
      const secret = (await getSshSecret(activeSshConfig.id)) ?? undefined;
      const list = await getRemoteBranches(activeSshConfig, remoteRepoPath.trim(), secret);
      setBranches(list);
      message.success(`Đã tải ${list.length} nhánh từ remote.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(`Không thể tải nhánh: ${msg}`);
    } finally {
      setLoadingBranches(false);
    }
  };

  // Save binding
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const binding: ProjectRepoSshBinding = {
        sshConfigId: values.sshConfigId,
        remoteRepoPath: values.remoteRepoPath.trim(),
        defaultBaseBranch: values.baseBranch?.trim() || 'origin/main',
        updatedAt: new Date().toISOString(),
      };

      await saveProjectRepoSshBinding(projectId, binding, db);
      message.success('Đã lưu cấu hình liên kết SSH cho dự án!');

      // Reload conventions
      const conv = await loadRepoConventions(projectId, db);
      setRepoConventions(conv);
      onBindingSaved?.();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      const msg = err instanceof Error ? err.message : String(err);
      message.error(`Lỗi khi lưu cấu hình: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  // Test connection & probe conventions
  const handleTestConnection = async () => {
    try {
      const values = await form.validateFields();
      if (!isTauriApp()) {
        message.warning('Kiểm tra SSH chỉ khả dụng trên ứng dụng desktop Tauri.');
        return;
      }
      setTesting(true);
      setTestResult(null);

      // Temporarily save to test probe
      const binding: ProjectRepoSshBinding = {
        sshConfigId: values.sshConfigId,
        remoteRepoPath: values.remoteRepoPath.trim(),
        defaultBaseBranch: values.baseBranch?.trim() || 'origin/main',
        updatedAt: new Date().toISOString(),
      };
      await saveProjectRepoSshBinding(projectId, binding, db);

      const conv = await loadRepoConventions(projectId, db);
      setRepoConventions(conv);

      if (conv) {
        setTestResult({
          success: true,
          message: `Kết nối thành công! Đã tìm thấy file quy ước: ${conv.foundPath}`,
          repoConventions: conv,
        });
        message.success('Kết nối SSH và đọc quy ước thành công!');
      } else {
        setTestResult({
          success: true,
          message: 'Kết nối SSH thành công, nhưng không tìm thấy file CONVENTIONS.md (hoặc .github/CONVENTIONS.md, docs/CONVENTIONS.md) trong thư mục repo.',
          repoConventions: null,
        });
        message.info('Kết nối SSH OK (chưa có file CONVENTIONS.md)');
      }
      onBindingSaved?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestResult({
        success: false,
        message: `Lỗi kết nối SSH hoặc đường dẫn không hợp lệ: ${msg}`,
      });
      message.error(`Kết nối thất bại: ${msg}`);
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin tip="Đang tải cấu hình..." />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <Typography.Title level={4} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <BranchesOutlined style={{ color: token.colorPrimary }} />
          Cấu hình Repository & Quy ước Dự án
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 0 }}>
          Thiết lập kết nối SSH đến máy chủ lưu trữ source code để SDLC tự động đồng bộ quy ước (CONVENTIONS.md), review diff và đối chiếu branch snapshot.
        </Typography.Paragraph>
      </div>

      {sshConfigs.length === 0 && (
        <Alert
          type="warning"
          showIcon
          icon={<ExclamationCircleOutlined />}
          message="Chưa có cấu hình SSH nào trong hệ thống"
          description="Vui lòng vào Cài đặt (Settings) -> mục Cấu hình SSH để thêm ít nhất một máy chủ SSH trước khi liên kết."
        />
      )}

      {/* Connection & Repo Form */}
      <Card
        title={
          <Space>
            <ApiOutlined />
            <span>Liên kết Git Repository qua SSH</span>
          </Space>
        }
        size="small"
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            sshConfigId: selectedSshConfigId,
            remoteRepoPath,
            baseBranch,
          }}
        >
          <Form.Item
            name="sshConfigId"
            label="Máy chủ SSH"
            rules={[{ required: true, message: 'Vui lòng chọn cấu hình SSH' }]}
            help="Máy chủ chứa source code (Linux server, VPS, WSL,...)"
          >
            <Select
              placeholder="Chọn cấu hình SSH"
              value={selectedSshConfigId || undefined}
              onChange={(val) => {
                const chosen = val ?? '';
                setSelectedSshConfigId(chosen);
                const cfg = sshConfigs.find((c) => c.id === chosen);
                if (cfg?.defaultRemotePath && !form.getFieldValue('remoteRepoPath')) {
                  form.setFieldsValue({ remoteRepoPath: cfg.defaultRemotePath });
                  setRemoteRepoPath(cfg.defaultRemotePath);
                }
              }}
              options={sshConfigs.map((c) => ({
                label: `${c.name} (${c.username}@${c.host}:${c.port || 22})`,
                value: c.id,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="remoteRepoPath"
            label="Đường dẫn thư mục Repo từ xa"
            rules={[{ required: true, message: 'Vui lòng nhập đường dẫn thư mục repository' }]}
            help="Đường dẫn tuyệt đối trên máy chủ SSH, ví dụ: /home/user/my-project hoặc /var/www/repo"
          >
            <Space.Compact style={{ width: '100%' }}>
              <Input
                prefix={<FolderOpenOutlined style={{ color: token.colorTextTertiary }} />}
                placeholder="/home/user/workspace/repo"
                value={remoteRepoPath}
                onChange={(e) => setRemoteRepoPath(e.target.value)}
                style={{ fontFamily: 'monospace' }}
              />
              <Button
                icon={<FolderOpenOutlined />}
                onClick={() => setBrowserModalOpen(true)}
                disabled={!activeSshConfig}
              >
                Duyệt thư mục...
              </Button>
            </Space.Compact>
          </Form.Item>

          <Form.Item
            name="baseBranch"
            label="Nhánh gốc mặc định (Base Branch)"
            rules={[{ required: true, message: 'Vui lòng chọn hoặc nhập nhánh gốc' }]}
            help="Nhánh dùng để so sánh diff và đối chiếu (thường là origin/main hoặc master)"
          >
            <Space.Compact style={{ width: '100%' }}>
              <Select
                showSearch
                style={{ width: '100%', fontFamily: 'monospace' }}
                value={baseBranch}
                onChange={(val) => setBaseBranch(val)}
                options={
                  branches.length > 0
                    ? branches.map((b) => ({ label: b.name, value: b.name }))
                    : [
                        { label: 'origin/main', value: 'origin/main' },
                        { label: 'origin/master', value: 'origin/master' },
                        { label: 'main', value: 'main' },
                        { label: 'master', value: 'master' },
                        { label: 'staging', value: 'staging' },
                      ]
                }
              />
              <Button
                icon={<ReloadOutlined spin={loadingBranches} />}
                onClick={handleFetchBranches}
                disabled={!activeSshConfig || !remoteRepoPath.trim()}
                title="Tải danh sách nhánh từ remote"
              >
                Lấy nhánh
              </Button>
            </Space.Compact>
          </Form.Item>

          <Divider style={{ margin: '16px 0' }} />

          <Space size={12}>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSave}
              loading={saving}
              data-testid="btn-save-repo-config"
            >
              Lưu cấu hình liên kết
            </Button>
            <Button
              icon={<ReloadOutlined spin={testing} />}
              onClick={handleTestConnection}
              loading={testing}
              disabled={!activeSshConfig || !remoteRepoPath.trim()}
              data-testid="btn-test-repo-connection"
            >
              Kiểm tra kết nối & Thử nạp quy ước
            </Button>
          </Space>
        </Form>
      </Card>

      {/* Test / Probe Result Alert */}
      {testResult && (
        <Alert
          type={testResult.success ? (testResult.repoConventions ? 'success' : 'info') : 'error'}
          showIcon
          message={testResult.success ? 'Kết nối thành công' : 'Lỗi kết nối'}
          description={testResult.message}
          closable
          onClose={() => setTestResult(null)}
        />
      )}

      {/* Conventions Overview Card */}
      <Card
        title={
          <Space>
            <BookOutlined />
            <span>Quy ước áp dụng cho Dự án</span>
          </Space>
        }
        size="small"
      >
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          {/* Repo Conventions */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Space>
                <BranchesOutlined style={{ color: token.colorSuccess }} />
                <Typography.Text strong>Quy ước Repository ({repoConventions?.foundPath || 'CONVENTIONS.md'}):</Typography.Text>
              </Space>
              {repoConventions ? (
                <Tag color="success" icon={<CheckCircleOutlined />}>
                  Đã nạp ({repoConventions.content.split('\n').length} dòng)
                </Tag>
              ) : (
                <Tag color="default">Chưa tìm thấy hoặc chưa nạp</Tag>
              )}
            </div>
            {repoConventions ? (
              <pre
                style={{
                  maxHeight: 200,
                  overflow: 'auto',
                  background: token.colorFillAlter,
                  padding: 12,
                  borderRadius: token.borderRadiusSM,
                  fontSize: 12,
                  fontFamily: 'monospace',
                  margin: 0,
                  border: `1px solid ${token.colorBorderSecondary}`,
                }}
              >
                {repoConventions.content}
              </pre>
            ) : (
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                Để thêm quy ước riêng cho repo, hãy tạo file <code>CONVENTIONS.md</code> (hoặc <code>.github/CONVENTIONS.md</code>, <code>docs/CONVENTIONS.md</code>) trong thư mục gốc của repository trên máy chủ SSH.
              </Typography.Text>
            )}
          </div>

          <Divider style={{ margin: '8px 0' }} />

          {/* Global Conventions */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Space>
                <BookOutlined style={{ color: token.colorPrimary }} />
                <Typography.Text strong>Quy ước Tổ chức (Global):</Typography.Text>
              </Space>
              {globalConventions.trim() ? (
                <Tag color="success" icon={<CheckCircleOutlined />}>
                  Đã thiết lập ({globalConventions.trim().split('\n').length} dòng)
                </Tag>
              ) : (
                <Tag color="default">Chưa thiết lập</Tag>
              )}
            </div>
            {globalConventions.trim() ? (
              <pre
                style={{
                  maxHeight: 150,
                  overflow: 'auto',
                  background: token.colorFillAlter,
                  padding: 12,
                  borderRadius: token.borderRadiusSM,
                  fontSize: 12,
                  fontFamily: 'monospace',
                  margin: 0,
                  border: `1px solid ${token.colorBorderSecondary}`,
                }}
              >
                {globalConventions}
              </pre>
            ) : (
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                Quy ước tổ chức áp dụng chung cho mọi dự án. Bạn có thể cập nhật trong <b>Cài đặt (Settings) &rarr; Quy ước tổ chức (Global Conventions)</b>.
              </Typography.Text>
            )}
          </div>
        </Space>
      </Card>

      {/* Directory Browser Modal */}
      <RemoteDirectoryBrowserModal
        open={browserModalOpen}
        onCancel={() => setBrowserModalOpen(false)}
        sshConfig={activeSshConfig}
        initialPath={remoteRepoPath}
        onSelect={(selectedPath: string) => {
          setRemoteRepoPath(selectedPath);
          form.setFieldsValue({ remoteRepoPath: selectedPath });
          setBrowserModalOpen(false);
        }}
      />
    </div>
  );
};
