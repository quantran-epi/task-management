import React, { useState, useEffect } from 'react';
import {
  Card,
  Form,
  Input,
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
  GithubOutlined,
  SaveOutlined,
  LockOutlined,
  EditOutlined,
  DeleteOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { useGitHubAuth } from '../../context/GitHubAuthContext';
import { isTauriApp } from '../../utils/timerPopout';
import { announceToScreenReader } from '../common/AriaLiveRegion';

const { Paragraph, Text } = Typography;

export interface GitHubConfigCardProps {
  db?: TaskPlannerDatabase;
}

export const GitHubConfigCard: React.FC<GitHubConfigCardProps> = ({ db = defaultDb }) => {
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('main');
  const [saving, setSaving] = useState(false);

  // Replace credential modals (D-37)
  const [patModalOpen, setPatModalOpen] = useState(false);
  const [passphraseModalOpen, setPassphraseModalOpen] = useState(false);
  const [newPatValue, setNewPatValue] = useState('');
  const [newPassphraseValue, setNewPassphraseValue] = useState('');

  const {
    passphrase,
    setCredentials,
    setPassphrase,
    forgetCredentials,
    hasToken,
    hasPassphrase,
  } = useGitHubAuth();

  // Load non-sensitive repository settings from IndexedDB (D-01)
  const repoSettings = useLiveQuery(async () => {
    const [ownerRecord, repoRecord, branchRecord] = await Promise.all([
      db.settings.get('github_owner'),
      db.settings.get('github_repo'),
      db.settings.get('github_branch'),
    ]);
    return {
      owner: (ownerRecord?.value as string) || '',
      repo: (repoRecord?.value as string) || '',
      branch: (branchRecord?.value as string) || 'main',
    };
  }, [db]);

  useEffect(() => {
    if (repoSettings) {
      setOwner(repoSettings.owner);
      setRepo(repoSettings.repo);
      setBranch(repoSettings.branch);
    }
  }, [repoSettings]);

  const handleSaveRepoConfig = async () => {
    setSaving(true);
    try {
      // Persist only non-sensitive repo coordinates to IndexedDB (D-01, SYNC-01)
      await db.transaction('rw', db.settings, async () => {
        await db.settings.put({ key: 'github_owner', value: owner.trim() });
        await db.settings.put({ key: 'github_repo', value: repo.trim() });
        await db.settings.put({ key: 'github_branch', value: branch.trim() || 'main' });
      });

      notification.success({
        message: 'Đã lưu cấu hình kho lưu trữ',
        description: 'Thông tin kho lưu trữ GitHub đã được lưu vào cơ sở dữ liệu.',
      });
      announceToScreenReader('Đã lưu cấu hình kho lưu trữ GitHub');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể lưu cấu hình kho lưu trữ.';
      notification.error({
        message: 'Lưu cấu hình thất bại',
        description: msg,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNewPat = () => {
    if (!newPatValue.trim()) return;
    setCredentials(newPatValue.trim(), passphrase ?? undefined);
    setNewPatValue('');
    setPatModalOpen(false);
    notification.success({
      message: 'Đã cập nhật GitHub PAT',
      description: isTauriApp()
        ? 'Personal Access Token đã được lưu an toàn trong OS Keychain.'
        : 'Token đã được nạp vào bộ nhớ tạm phiên.',
    });
  };

  const handleSaveNewPassphrase = () => {
    if (!newPassphraseValue) return;
    setPassphrase(newPassphraseValue);
    setNewPassphraseValue('');
    setPassphraseModalOpen(false);
    notification.success({
      message: 'Đã cập nhật Mật khẩu mã hóa',
      description: isTauriApp()
        ? 'Mật khẩu đã được lưu an toàn trong OS Keychain.'
        : 'Mật khẩu đã được nạp vào bộ nhớ tạm phiên.',
    });
  };

  const handleForgetCredentials = async () => {
    await forgetCredentials();
    notification.info({
      message: 'Đã xóa thông tin xác thực',
      description: 'GitHub PAT và Mật khẩu mã hóa đã được xóa sạch khỏi bộ nhớ và Keychain.',
    });
    announceToScreenReader('Đã xóa thông tin xác thực GitHub');
  };

  return (
    <Card
      title={
        <Space>
          <GithubOutlined />
          <span>Cấu hình kho lưu trữ GitHub</span>
        </Space>
      }
    >
      <Paragraph type="secondary">
        Cấu hình kết nối tới kho lưu trữ GitHub cá nhân để lưu trữ và khôi phục bản sao lưu mã hóa.
        Tệp sao lưu sẽ được mã hóa bằng thuật toán AES-GCM-256 trước khi tải lên.
      </Paragraph>

      <Alert
        type="info"
        showIcon
        icon={<SafetyCertificateOutlined />}
        message="Bảo mật Thông tin xác thực (Zero-Secret Disk Boundary)"
        description={
          isTauriApp()
            ? 'Trên ứng dụng Desktop, GitHub PAT và Mật khẩu được mã hóa an toàn trong OS Keychain (Keychain / Credential Manager).'
            : 'Trên trình duyệt Web/PWA, thông tin chỉ lưu trong bộ nhớ tạm của phiên làm việc và hỗ trợ trình quản lý mật khẩu của trình duyệt.'
        }
        style={{ marginBottom: 16 }}
      />

      <Form layout="vertical">
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item label="Chủ sở hữu / Tổ chức (Owner)" required>
              <Input
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="ví dụ: octocat"
                aria-label="Chủ sở hữu hoặc tổ chức GitHub"
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item label="Tên kho lưu trữ (Repository)" required>
              <Input
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="ví dụ: my-tasks"
                aria-label="Tên kho lưu trữ GitHub"
              />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item label="Nhánh (Branch)">
          <Input
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="main"
            aria-label="Nhánh kho lưu trữ GitHub"
          />
        </Form.Item>

        <Form.Item
          label="Personal Access Token (PAT)"
          extra="Fine-grained token cần quyền contents:read và contents:write trên kho lưu trữ. Secret không bao giờ hiển thị văn bản thuần."
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
              <Text strong>Trạng thái PAT:</Text>
              {hasToken ? (
                <Tag color="success">Stored (Đã lưu)</Tag>
              ) : (
                <Tag color="default">Not stored (Chưa lưu)</Tag>
              )}
            </Space>

            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => {
                setNewPatValue('');
                setPatModalOpen(true);
              }}
            >
              {hasToken ? 'Thay đổi PAT' : 'Nhập PAT'}
            </Button>
          </div>
        </Form.Item>

        <Form.Item
          label="Mật khẩu mã hóa / giải mã (Passphrase)"
          extra="Mật khẩu dùng để dẫn xuất khóa AES-GCM-256 (PBKDF2 600,000 vòng lặp)."
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
              <Text strong>Trạng thái Mật khẩu:</Text>
              {hasPassphrase ? (
                <Tag color="success">Stored (Đã lưu)</Tag>
              ) : (
                <Tag color="default">Not stored (Chưa lưu)</Tag>
              )}
            </Space>

            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => {
                setNewPassphraseValue('');
                setPassphraseModalOpen(true);
              }}
            >
              {hasPassphrase ? 'Thay đổi Mật khẩu' : 'Nhập Mật khẩu'}
            </Button>
          </div>
        </Form.Item>

        <Form.Item style={{ marginBottom: 0 }}>
          <Space wrap>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={handleSaveRepoConfig}
            >
              Lưu cấu hình kho lưu trữ
            </Button>

            {(hasToken || hasPassphrase) && (
              <Popconfirm
                title="Xác nhận xóa thông tin xác thực GitHub?"
                description="Token và mật khẩu mã hóa sẽ bị xóa khỏi Keychain và bộ nhớ tạm."
                okText="Xóa"
                cancelText="Hủy"
                okButtonProps={{ danger: true }}
                onConfirm={handleForgetCredentials}
              >
                <Button danger icon={<DeleteOutlined />}>
                  Xóa thông tin xác thực (Forget)
                </Button>
              </Popconfirm>
            )}
          </Space>
        </Form.Item>
      </Form>

      {/* Modal for replacing PAT */}
      <Modal
        title="Nhập / Thay đổi GitHub Personal Access Token"
        open={patModalOpen}
        onCancel={() => {
          setPatModalOpen(false);
          setNewPatValue('');
        }}
        onOk={handleSaveNewPat}
        okText="Lưu PAT"
        cancelText="Hủy"
        okButtonProps={{ disabled: !newPatValue.trim() }}
      >
        <Paragraph type="secondary">
          Token sẽ được lưu trữ an toàn trong OS Keychain (trên Desktop) hoặc bộ nhớ phiên (trên Web).
        </Paragraph>
        <Input.Password
          autoFocus
          placeholder="ghp_... hoặc github_pat_..."
          value={newPatValue}
          onChange={(e) => setNewPatValue(e.target.value)}
          autoComplete="new-password"
        />
      </Modal>

      {/* Modal for replacing Passphrase */}
      <Modal
        title="Nhập / Thay đổi Mật khẩu mã hóa sao lưu"
        open={passphraseModalOpen}
        onCancel={() => {
          setPassphraseModalOpen(false);
          setNewPassphraseValue('');
        }}
        onOk={handleSaveNewPassphrase}
        okText="Lưu Mật khẩu"
        cancelText="Hủy"
        okButtonProps={{ disabled: !newPassphraseValue }}
      >
        <Paragraph type="secondary">
          Mật khẩu dùng để mã hóa và giải mã dữ liệu sao lưu trước khi đồng bộ lên GitHub.
        </Paragraph>
        <Input.Password
          autoFocus
          placeholder="Nhập mật khẩu sao lưu..."
          value={newPassphraseValue}
          onChange={(e) => setNewPassphraseValue(e.target.value)}
          autoComplete="new-password"
        />
      </Modal>
    </Card>
  );
};
