import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Space, Alert, Typography, notification, Row, Col } from 'antd';
import { GithubOutlined, SaveOutlined, ClearOutlined, LockOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { useGitHubAuth } from '../../context/GitHubAuthContext';
import { announceToScreenReader } from '../common/AriaLiveRegion';

const { Paragraph } = Typography;

export interface GitHubConfigCardProps {
  db?: TaskPlannerDatabase;
}

export const GitHubConfigCard: React.FC<GitHubConfigCardProps> = ({ db = defaultDb }) => {
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('main');
  const [tokenInput, setTokenInput] = useState('');
  const [passphraseInput, setPassphraseInput] = useState('');
  const [saving, setSaving] = useState(false);

  const {
    token,
    passphrase,
    setCredentials,
    clearSession,
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

  useEffect(() => {
    setTokenInput(token ?? '');
    setPassphraseInput(passphrase ?? '');
  }, [token, passphrase]);

  const handleTokenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTokenInput(val);
    setCredentials(val, passphraseInput);
  };

  const handlePassphraseChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPassphraseInput(val);
    setCredentials(tokenInput, val);
  };

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
    } catch (err: any) {
      notification.error({
        message: 'Lưu cấu hình thất bại',
        description: err?.message || 'Không thể lưu cấu hình kho lưu trữ.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleClearSession = () => {
    clearSession();
    setTokenInput('');
    setPassphraseInput('');
    notification.info({
      message: 'Đã xóa phiên kết nối',
      description: 'Thông tin GitHub Token và mật khẩu đã được xóa khỏi bộ nhớ tạm.',
    });
    announceToScreenReader('Đã xóa phiên kết nối GitHub khỏi bộ nhớ tạm');
  };

  return (
    <Card
      title={
        <Space>
          <GithubOutlined />
          <span>Cấu hình đồng bộ GitHub (Tùy chọn)</span>
        </Space>
      }
    >
      <Paragraph type="secondary">
        Cấu hình kết nối tới kho lưu trữ GitHub cá nhân để lưu trữ và khôi phục bản sao lưu mã hóa.
        Tệp sao lưu sẽ được mã hóa bằng thuật toán AES-GCM-256 trước khi tải lên.
      </Paragraph>

      {(hasToken || hasPassphrase) && (
        <Alert
          type="info"
          showIcon
          icon={<LockOutlined />}
          message="Thông tin xác thực đang được giữ trong bộ nhớ tạm của phiên làm việc"
          description="Token và mật khẩu giải mã sẽ tự động xóa sạch khi tải lại hoặc đóng tab trình duyệt."
          style={{ marginBottom: 16 }}
        />
      )}

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
          extra="Fine-grained token cần quyền contents:read và contents:write trên kho lưu trữ. Token chỉ được giữ trong bộ nhớ tạm, không lưu vào cơ sở dữ liệu."
        >
          <Input.Password
            value={tokenInput}
            onChange={handleTokenChange}
            placeholder="github_pat_..."
            aria-label="GitHub Personal Access Token"
          />
        </Form.Item>

        <Form.Item
          label="Mật khẩu mã hóa / giải mã (Passphrase)"
          extra="Mật khẩu dùng để dẫn xuất khóa AES-GCM-256 (PBKDF2 600,000 vòng lặp). Chỉ lưu trong bộ nhớ tạm phiên."
        >
          <Input.Password
            value={passphraseInput}
            onChange={handlePassphraseChange}
            placeholder="Nhập mật khẩu mã hóa dữ liệu..."
            aria-label="Mật khẩu mã hóa"
          />
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

            <Button
              danger
              icon={<ClearOutlined />}
              onClick={handleClearSession}
              disabled={!hasToken && !hasPassphrase && !tokenInput && !passphraseInput}
            >
              Xóa phiên kết nối
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Card>
  );
};
