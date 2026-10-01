import React, { useState } from 'react';
import {
  Card,
  Button,
  Space,
  Tag,
  Typography,
  notification,
  Descriptions,
  Divider,
  Form,
  Switch,
  Radio,
  InputNumber,
  TimePicker,
  Alert,
} from 'antd';
import {
  CloudUploadOutlined,
  CloudDownloadOutlined,
  CloudSyncOutlined,
  ApiOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs from 'dayjs';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { useGitHubAuth } from '../../context/GitHubAuthContext';
import { testGitHubConnection } from '../../services/github/githubApi';
import {
  executeGitHubBackupPush,
  executeGitHubBackupPull,
  downloadRawEncryptedBackup,
  GitHubSyncConflictError,
  GitHubPullError,
} from '../../services/github/githubSyncService';
import { type AutoSyncRetryState } from '../../hooks/useGitHubAutoSync';
import { GitHubConflictModal } from './GitHubConflictModal';
import { GitHubPassphraseModal } from './GitHubPassphraseModal';
import { announceToScreenReader } from '../common/AriaLiveRegion';
import type { GitHubConfig, PullBackupResult } from '../../services/github/types';

const { Paragraph, Text } = Typography;

export interface GitHubSyncCardProps {
  db?: TaskPlannerDatabase;
  onPullSuccess?: (result: PullBackupResult) => void;
}

export const GitHubSyncCard: React.FC<GitHubSyncCardProps> = ({
  db = defaultDb,
  onPullSuccess,
}) => {
  const [isPushing, setIsPushing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'connected' | 'error'>('idle');
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [conflictRemoteSha, setConflictRemoteSha] = useState<string | undefined>(undefined);
  const [conflictLocalSha, setConflictLocalSha] = useState<string | undefined>(undefined);

  const [passphraseModalOpen, setPassphraseModalOpen] = useState(false);
  const [passphraseError, setPassphraseError] = useState<string | undefined>(undefined);
  const [rawEncryptedJson, setRawEncryptedJson] = useState<string | undefined>(undefined);

  const { token, passphrase, setPassphrase, hasToken, hasPassphrase } = useGitHubAuth();

  // Load repository settings and sync metadata from IndexedDB
  const syncData = useLiveQuery(async () => {
    const [
      ownerRec,
      repoRec,
      branchRec,
      lastShaRec,
      lastAtRec,
      autoEnabledRec,
      autoModeRec,
      autoIntervalRec,
      autoDailyTimeRec,
      autoLastRunRec,
      autoDirtySinceRec,
      autoMissedDueRec,
      autoLastErrorRec,
      autoSyncStateRec,
    ] = await Promise.all([
      db.settings.get('github_owner'),
      db.settings.get('github_repo'),
      db.settings.get('github_branch'),
      db.settings.get('last_synced_sha'),
      db.settings.get('last_synced_at'),
      db.settings.get('github_auto_sync_enabled'),
      db.settings.get('github_auto_sync_mode'),
      db.settings.get('github_auto_sync_interval_minutes'),
      db.settings.get('github_auto_sync_daily_time'),
      db.settings.get('github_auto_sync_last_run_at'),
      db.settings.get('github_auto_sync_dirty_since'),
      db.settings.get('github_auto_sync_missed_due_at'),
      db.settings.get('github_auto_sync_last_error'),
      db.settings.get('github_auto_sync_state'),
    ]);

    return {
      owner: (ownerRec?.value as string) || '',
      repo: (repoRec?.value as string) || '',
      branch: (branchRec?.value as string) || 'main',
      lastSyncedSha: (lastShaRec?.value as string) || undefined,
      lastSyncedAt: (lastAtRec?.value as string) || undefined,
      autoEnabled: autoEnabledRec?.value === true,
      autoMode: (autoModeRec?.value as 'interval' | 'daily') || 'interval',
      autoIntervalMinutes: typeof autoIntervalRec?.value === 'number' ? autoIntervalRec.value : 30,
      autoDailyTime: (autoDailyTimeRec?.value as string) || '18:00',
      autoLastRunAt: (autoLastRunRec?.value as string) || undefined,
      autoDirtySince: (autoDirtySinceRec?.value as string) || undefined,
      autoMissedDueAt: (autoMissedDueRec?.value as string) || undefined,
      autoLastError: (autoLastErrorRec?.value as string) || undefined,
      autoSyncState: (autoSyncStateRec?.value as AutoSyncRetryState) || undefined,
    };
  }, [db]);

  const owner = syncData?.owner || '';
  const repo = syncData?.repo || '';
  const branch = syncData?.branch || 'main';
  const lastSyncedSha = syncData?.lastSyncedSha;
  const lastSyncedAt = syncData?.lastSyncedAt;
  const autoSyncState = syncData?.autoSyncState;

  const isConfigured = Boolean(owner && repo);

  const handleTestConnection = async () => {
    if (!token) {
      notification.warning({
        message: 'Chưa có Token',
        description: 'Vui lòng nhập GitHub Personal Access Token trước khi kiểm tra.',
      });
      return;
    }

    setIsTesting(true);
    setTestStatus('testing');
    announceToScreenReader('Đang kiểm tra kết nối với kho lưu trữ GitHub...');

    const config: GitHubConfig = { owner, repo, branch };
    const res = await testGitHubConnection(config, token);

    setIsTesting(false);
    if (res.ok) {
      setTestStatus('connected');
      notification.success({
        message: 'Kết nối thành công',
        description: res.message,
      });
      announceToScreenReader(res.message);
    } else {
      setTestStatus('error');
      notification.error({
        message: 'Kết nối thất bại',
        description: res.message,
      });
      announceToScreenReader(`Kết nối thất bại: ${res.message}`);
    }
  };

  const handlePush = async (forceOverwrite: boolean = false) => {
    if (!token) {
      notification.warning({
        message: 'Chưa có Token',
        description: 'Vui lòng nhập GitHub Personal Access Token trong cấu hình.',
      });
      return;
    }
    if (!passphrase) {
      notification.warning({
        message: 'Chưa có Mật khẩu',
        description: 'Vui lòng nhập mật khẩu mã hóa trước khi đẩy dữ liệu.',
      });
      return;
    }

    setIsPushing(true);
    announceToScreenReader('Đang xuất, mã hóa và đẩy bản sao lưu lên GitHub...');

    try {
      const config: GitHubConfig = { owner, repo, branch };
      const result = await executeGitHubBackupPush(
        db,
        config,
        token,
        passphrase,
        lastSyncedSha,
        forceOverwrite
      );

      // On manual push success: clear conflict/pause state so auto-sync resumes (D-39, D-42)
      await db.settings.put({
        key: 'github_auto_sync_state',
        value: {
          consecutiveFailures: 0,
          isPaused: false,
          lastAttemptAt: new Date().toISOString(),
        } satisfies AutoSyncRetryState,
      });
      await db.settings.delete('github_auto_sync_last_error');
      await db.settings.delete('github_auto_sync_dirty_since');

      const shortSha = result.sha.slice(0, 7);
      notification.success({
        message: 'Đẩy lên GitHub thành công',
        description: `Bản sao lưu đã được cập nhật an toàn (SHA: ${shortSha}).`,
      });
      announceToScreenReader(`Đẩy lên GitHub thành công. SHA: ${shortSha}.`);
      setTestStatus('connected');
    } catch (err: unknown) {
      if (err instanceof GitHubSyncConflictError) {
        setConflictRemoteSha(err.remoteSha);
        setConflictLocalSha(err.localSha || lastSyncedSha);
        setConflictModalOpen(true);
        announceToScreenReader('Phát hiện xung đột với bản sao lưu trên GitHub.');
      } else {
        const errorMsg = err instanceof Error ? err.message : 'Đã xảy ra lỗi không xác định';
        notification.error({
          message: 'Đẩy lên GitHub thất bại',
          description: errorMsg,
        });
        announceToScreenReader(`Đẩy lên GitHub thất bại: ${errorMsg}`);
      }
    } finally {
      setIsPushing(false);
    }
  };

  const handlePull = async (overridePassphrase?: string) => {
    if (!token) {
      notification.warning({
        message: 'Chưa có Token',
        description: 'Vui lòng nhập GitHub Personal Access Token trong cấu hình.',
      });
      return;
    }
    if (!isConfigured) {
      notification.warning({
        message: 'Chưa cấu hình kho lưu trữ',
        description: 'Vui lòng điền thông tin chủ sở hữu và tên kho lưu trữ GitHub.',
      });
      return;
    }

    const effectivePassphrase = overridePassphrase ?? passphrase ?? undefined;

    setIsPulling(true);
    announceToScreenReader('Đang tải bản sao lưu từ GitHub...');

    try {
      const config: GitHubConfig = { owner, repo, branch };
      const result = await executeGitHubBackupPull(config, token, effectivePassphrase);

      if (effectivePassphrase) {
        setPassphrase(effectivePassphrase);
      }

      // Resume auto-sync after pull (D-42)
      await db.settings.put({
        key: 'github_auto_sync_state',
        value: {
          consecutiveFailures: 0,
          isPaused: false,
          lastAttemptAt: new Date().toISOString(),
        } satisfies AutoSyncRetryState,
      });
      await db.settings.delete('github_auto_sync_last_error');

      setPassphraseModalOpen(false);
      setPassphraseError(undefined);
      setRawEncryptedJson(undefined);

      const shortSha = result.remoteSha.slice(0, 7);
      notification.success({
        message: 'Tải từ GitHub thành công',
        description: `Bản sao lưu đã được giải mã và sẵn sàng để xem trước (SHA: ${shortSha}).`,
      });
      announceToScreenReader(`Tải từ GitHub thành công. SHA: ${shortSha}.`);
      setTestStatus('connected');

      if (onPullSuccess) {
        onPullSuccess(result);
      }
    } catch (err: unknown) {
      if (err instanceof GitHubPullError) {
        if (err.code === 'PASSPHRASE_REQUIRED') {
          setRawEncryptedJson(err.rawEncryptedJson);
          setPassphraseError(undefined);
          setPassphraseModalOpen(true);
          announceToScreenReader('Cần nhập mật khẩu để giải mã bản sao lưu từ GitHub.');
          return;
        }
        if (err.code === 'DECRYPT_FAILED') {
          setRawEncryptedJson(err.rawEncryptedJson);
          setPassphraseError('Mật khẩu giải mã không chính xác hoặc tệp sao lưu đã bị thay đổi.');
          setPassphraseModalOpen(true);
          announceToScreenReader('Mật khẩu giải mã không chính xác hoặc tệp sao lưu đã bị thay đổi.');
          return;
        }
        if (err.code === 'NOT_FOUND') {
          notification.info({
            message: 'Chưa có bản sao lưu trên GitHub',
            description: 'Tệp sao lưu .task-management/backup.enc.json chưa tồn tại trên kho lưu trữ.',
          });
          announceToScreenReader('Chưa có bản sao lưu trên GitHub.');
          return;
        }
        if (err.code === 'INVALID_ENVELOPE' || err.code === 'VALIDATION_FAILED') {
          setRawEncryptedJson(err.rawEncryptedJson);
          setPassphraseError(err.message);
          setPassphraseModalOpen(true);
          notification.error({
            message: 'Bản sao lưu không hợp lệ',
            description: err.message,
          });
          announceToScreenReader(`Bản sao lưu từ GitHub không hợp lệ: ${err.message}`);
          return;
        }
      }

      const errorMsg = err instanceof Error ? err.message : 'Đã xảy ra lỗi không xác định';
      notification.error({
        message: 'Tải từ GitHub thất bại',
        description: errorMsg,
      });
      announceToScreenReader(`Tải từ GitHub thất bại: ${errorMsg}`);
    } finally {
      setIsPulling(false);
    }
  };

  const renderConnectionTag = () => {
    if (testStatus === 'connected') {
      return (
        <Tag color="success" icon={<CheckCircleOutlined />}>
          Đã kết nối
        </Tag>
      );
    }
    if (testStatus === 'error') {
      return (
        <Tag color="error" icon={<CloseCircleOutlined />}>
          Lỗi kết nối
        </Tag>
      );
    }
    if (testStatus === 'testing') {
      return (
        <Tag color="processing" icon={<SyncOutlined spin />}>
          Đang kiểm tra...
        </Tag>
      );
    }
    return <Tag color="default">Chưa xác thực</Tag>;
  };

  const renderCredentialsTag = () => {
    if (hasToken && hasPassphrase) {
      return <Tag color="success">Đã nạp vào bộ nhớ tạm</Tag>;
    }
    if (hasToken && !hasPassphrase) {
      return <Tag color="warning">Chưa có mật khẩu</Tag>;
    }
    return <Tag color="default">Chưa có token</Tag>;
  };

  const renderAutoSyncStatus = () => {
    if (!syncData?.autoEnabled) {
      return <Tag color="default">Đã tắt</Tag>;
    }
    if (autoSyncState?.isPaused) {
      if (autoSyncState.pauseReason === 'conflict') {
        return <Tag color="error">Tạm dừng do xung đột</Tag>;
      }
      if (autoSyncState.pauseReason === 'auth_error') {
        return <Tag color="error">Lỗi xác thực (401/403)</Tag>;
      }
      return <Tag color="warning">Tạm dừng</Tag>;
    }
    if (autoSyncState?.nextRetryAt) {
      return (
        <Tag color="orange">
          Chờ thử lại lúc {dayjs(autoSyncState.nextRetryAt).format('HH:mm:ss')} (lỗi #{autoSyncState.consecutiveFailures})
        </Tag>
      );
    }
    return <Tag color="success">Đang hoạt động</Tag>;
  };

  const calculateNextRun = () => {
    if (!syncData?.autoEnabled || autoSyncState?.isPaused) return 'Đang tạm dừng';
    if (autoSyncState?.nextRetryAt) {
      return dayjs(autoSyncState.nextRetryAt).format('DD/MM/YYYY HH:mm:ss');
    }
    if (syncData.autoMode === 'daily') {
      return `Hàng ngày lúc ${syncData.autoDailyTime}`;
    }
    if (syncData.autoLastRunAt) {
      return dayjs(syncData.autoLastRunAt)
        .add(syncData.autoIntervalMinutes, 'minute')
        .format('DD/MM/YYYY HH:mm:ss');
    }
    return `Mỗi ${syncData.autoIntervalMinutes} phút`;
  };

  const updateAutoSyncSetting = async (key: string, value: unknown) => {
    await db.settings.put({ key, value });
  };

  return (
    <>
      <Card
        title={
          <Space>
            <CloudSyncOutlined />
            <span>Đồng bộ sao lưu GitHub</span>
          </Space>
        }
        extra={renderConnectionTag()}
      >
        <Paragraph type="secondary">
          Tự động xuất toàn bộ dữ liệu, mã hóa an toàn bằng chuẩn AES-GCM-256 với mật khẩu cá nhân
          và đẩy tệp sao lưu lên GitHub.
        </Paragraph>

        {autoSyncState?.isPaused && autoSyncState.pauseReason === 'conflict' && (
          <Alert
            type="error"
            showIcon
            icon={<WarningOutlined />}
            message="Tự động đồng bộ bị tạm dừng do phát hiện xung đột dữ liệu trên GitHub"
            description={
              <div>
                <p>
                  Bản sao lưu trên GitHub đã được thay đổi từ một thiết bị khác (Remote SHA mismatch).
                  Hệ thống tạm dừng đồng bộ để bảo vệ toàn vẹn dữ liệu. Vui lòng chọn hành động xử lý:
                </p>
                <Space style={{ marginTop: 8 }}>
                  <Button
                    type="primary"
                    size="small"
                    icon={<CloudDownloadOutlined />}
                    onClick={() => handlePull()}
                  >
                    Tải về từ GitHub (Pull)
                  </Button>
                  <Button
                    danger
                    size="small"
                    icon={<CloudUploadOutlined />}
                    onClick={() => {
                      setConflictRemoteSha(autoSyncState.conflictRemoteSha);
                      setConflictLocalSha(lastSyncedSha);
                      setConflictModalOpen(true);
                    }}
                  >
                    Ghi đè lên GitHub (Force Push)
                  </Button>
                </Space>
              </div>
            }
            style={{ marginBottom: 16 }}
          />
        )}

        <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered style={{ marginBottom: 16 }}>
          <Descriptions.Item label="Trạng thái xác thực">{renderCredentialsTag()}</Descriptions.Item>
          <Descriptions.Item label="Bản sao lưu gần nhất">
            {lastSyncedSha ? (
              <Text code strong>
                {lastSyncedSha.slice(0, 7)}
              </Text>
            ) : (
              <Text type="secondary">Chưa đồng bộ</Text>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Lần đồng bộ thành công gần nhất" span={2}>
            {lastSyncedAt ? (
              dayjs(lastSyncedAt).format('DD/MM/YYYY HH:mm:ss')
            ) : (
              <Text type="secondary">Chưa đồng bộ</Text>
            )}
          </Descriptions.Item>
        </Descriptions>

        <Space wrap>
          <Button
            type="primary"
            icon={<CloudUploadOutlined />}
            loading={isPushing}
            disabled={!hasToken || !hasPassphrase || !isConfigured || isTesting || isPulling}
            onClick={() => handlePush(false)}
          >
            Đẩy lên GitHub
          </Button>

          <Button
            icon={<CloudDownloadOutlined />}
            loading={isPulling}
            disabled={!hasToken || !isConfigured || isPushing || isTesting}
            onClick={() => handlePull()}
          >
            Tải từ GitHub
          </Button>

          <Button
            icon={<ApiOutlined />}
            loading={isTesting}
            disabled={!hasToken || !isConfigured || isPushing || isPulling}
            onClick={handleTestConnection}
          >
            Kiểm tra kết nối
          </Button>
        </Space>

        <Divider style={{ margin: '16px 0' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <Text strong>Tự động đồng bộ định kỳ</Text>
            <div>
              <Text type="secondary">
                Tự động đẩy dữ liệu khi có thay đổi với thuật toán backoff chống nghẽn mạng.
              </Text>
            </div>
          </div>
          <Switch
            checked={syncData?.autoEnabled ?? false}
            onChange={(checked) => updateAutoSyncSetting('github_auto_sync_enabled', checked)}
          />
        </div>

        {syncData?.autoEnabled && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Form layout="inline">
              <Form.Item label="Chế độ">
                <Radio.Group
                  value={syncData?.autoMode ?? 'interval'}
                  onChange={(e) => updateAutoSyncSetting('github_auto_sync_mode', e.target.value)}
                >
                  <Radio.Button value="interval">Khoảng thời gian</Radio.Button>
                  <Radio.Button value="daily">Hàng ngày (cố định)</Radio.Button>
                </Radio.Group>
              </Form.Item>

              {syncData?.autoMode === 'daily' ? (
                <Form.Item label="Giờ chạy">
                  <TimePicker
                    format="HH:mm"
                    value={dayjs(syncData?.autoDailyTime ?? '18:00', 'HH:mm')}
                    onChange={(val) => {
                      if (val) updateAutoSyncSetting('github_auto_sync_daily_time', val.format('HH:mm'));
                    }}
                  />
                </Form.Item>
              ) : (
                <Form.Item label="Mỗi (phút)">
                  <InputNumber
                    min={1}
                    max={1440}
                    value={syncData?.autoIntervalMinutes ?? 30}
                    onChange={(val) => {
                      if (typeof val === 'number') updateAutoSyncSetting('github_auto_sync_interval_minutes', val);
                    }}
                  />
                </Form.Item>
              )}
            </Form>

            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Trạng thái đồng bộ">
                {renderAutoSyncStatus()}
              </Descriptions.Item>
              <Descriptions.Item label="Lần chạy tiếp theo">
                <Text strong>{calculateNextRun()}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Dữ liệu chưa đồng bộ từ">
                {syncData?.autoDirtySince ? (
                  <Tag color="warning">Thay đổi lúc {dayjs(syncData.autoDirtySince).format('DD/MM HH:mm:ss')}</Tag>
                ) : (
                  <Text type="secondary">Không có (Đã khớp)</Text>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Tự động chạy gần nhất">
                {syncData?.autoLastRunAt ? dayjs(syncData.autoLastRunAt).format('DD/MM/YYYY HH:mm:ss') : 'Chưa chạy'}
              </Descriptions.Item>
              {syncData?.autoMissedDueAt && (
                <Descriptions.Item label="Lần lỡ hẹn gần nhất">
                  <Text type="warning">{dayjs(syncData.autoMissedDueAt).format('DD/MM/YYYY HH:mm:ss')}</Text>
                </Descriptions.Item>
              )}
              {syncData?.autoLastError && (
                <Descriptions.Item label="Lỗi gần nhất">
                  <Text type="danger">{syncData.autoLastError}</Text>
                </Descriptions.Item>
              )}
            </Descriptions>
          </Space>
        )}
      </Card>

      <GitHubConflictModal
        open={conflictModalOpen}
        remoteSha={conflictRemoteSha}
        localSha={conflictLocalSha}
        onCancel={() => setConflictModalOpen(false)}
        onForceOverwrite={async () => {
          setConflictModalOpen(false);
          await handlePush(true);
        }}
        onPullAndPreview={() => {
          setConflictModalOpen(false);
          handlePull();
        }}
      />

      <GitHubPassphraseModal
        open={passphraseModalOpen}
        error={passphraseError}
        rawEncryptedJson={rawEncryptedJson}
        loading={isPulling}
        onSubmit={(p) => handlePull(p)}
        onCancel={() => {
          setPassphraseModalOpen(false);
          setPassphraseError(undefined);
        }}
        onDownloadRaw={() => {
          if (rawEncryptedJson) {
            downloadRawEncryptedBackup(rawEncryptedJson);
          }
        }}
      />
    </>
  );
};
