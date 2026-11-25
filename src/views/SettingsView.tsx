import React, { useState } from 'react';
import { Button, Tabs, Space, Card, Typography, useNotification, useTaskMateModal, Text } from '../components/ui';
import { ArrowLeftOutlined, ScheduleOutlined, DatabaseOutlined, CloudSyncOutlined, WarningOutlined, ExclamationCircleOutlined, EditOutlined, BellOutlined, RobotOutlined, CloudServerOutlined } from '../components/ui/icon';
import { WeeklyCapacityForm } from '../components/settings/WeeklyCapacityForm';
import { OverridesTable } from '../components/settings/OverridesTable';
import { BackupExportCard } from '../components/settings/BackupExportCard';
import { BackupImportCard } from '../components/settings/BackupImportCard';
import { ConfigProfileImportCard } from '../components/settings/ConfigProfileImportCard';
import { PostProfileImportChecklist } from '../components/settings/PostProfileImportChecklist';
import { ImportPreviewModal } from '../components/settings/ImportPreviewModal';
import { SnapshotRollbackCard } from '../components/settings/SnapshotRollbackCard';
import { GitHubConfigCard } from '../components/settings/GitHubConfigCard';
import { GitHubSyncCard } from '../components/settings/GitHubSyncCard';
import { JiraConfigCard } from '../components/settings/JiraConfigCard';
import { NineRouterConfigCard } from '../components/settings/NineRouterConfigCard';
import { BudgetWarnThresholdCard } from '../components/settings/BudgetWarnThresholdCard';
import { KnowledgeServerConfigCard } from '../components/settings/KnowledgeServerConfigCard';
import { GhostDevConfigCard } from '../components/settings/GhostDevConfigCard';
import { GlobalConventionsCard } from '../components/settings/GlobalConventionsCard';
import { McpConfigCard } from '../components/settings/McpConfigCard';
import { GraphitiSqlConfigCard } from '../components/settings/GraphitiSqlConfigCard';
import { AiToolCatalogCard } from '../components/settings/AiToolCatalogCard';
import { StoragePersistenceCard } from '../components/settings/StoragePersistenceCard';
import { LocalSqlitePersistenceCard } from '../components/settings/LocalSqlitePersistenceCard';
import { NotificationSettingsCard } from '../components/settings/NotificationSettingsCard';
import { SshConfigCard } from '../components/settings/SshConfigCard';
import { SystemTypeOptionsCard } from '../components/settings/SystemTypeOptionsCard';
import { OracleAiToolConfigCard } from '../components/settings/OracleAiToolConfigCard';
import { SshFsAiToolConfigCard } from '../components/settings/SshFsAiToolConfigCard';
import { PostRestoreBanner } from '../components/settings/PostRestoreBanner';
import { ResetDbModal } from '../components/common/ResetDbModal';
import { PageHeader } from '../components/common/PageHeader';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import type { AppRoute } from '../types/navigation';
import { rollbackToSnapshot, downloadSnapshotFile } from '../services/backup/restoreBackup';
import { announceToScreenReader } from '../components/common/AriaLiveRegion';
import type { SnapshotData, BackupEnvelope } from '../types/backup';
import type { PullBackupResult } from '../services/github/types';
import type { z } from 'zod';
import type { ConfigProfileEnvelopeSchema } from '../validation/configProfileSchemas';

const { Paragraph } = Typography;

export interface SettingsViewProps {
  db?: TaskPlannerDatabase;
  onNavigate?: (route: AppRoute) => void;
  defaultActiveTab?: 'capacity' | 'data' | 'jira' | 'notifications' | 'ai' | 'ssh' | undefined;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  db = defaultDb,
  onNavigate,
  defaultActiveTab = 'capacity',
}) => {
  const [activeTab, setActiveTab] = useState<'capacity' | 'data' | 'jira' | 'notifications' | 'ai' | 'ssh'>(defaultActiveTab);
  const notification = useNotification();
  const { modal, contextHolder } = useTaskMateModal();
  const [resetModalOpen, setResetModalOpen] = useState(false);

  React.useEffect(() => {
    if (defaultActiveTab) {
      setActiveTab(defaultActiveTab);
    }
  }, [defaultActiveTab]);
  const [showPostRestoreBanner, setShowPostRestoreBanner] = useState(false);
  const [appliedProfile, setAppliedProfile] = useState<{
    envelope: z.infer<typeof ConfigProfileEnvelopeSchema>;
    blankSecretFields: string[];
  } | null>(null);
  const [remotePayload, setRemotePayload] = useState<BackupEnvelope | null>(null);
  const [remoteSha, setRemoteSha] = useState<string | null>(null);
  const [remoteExportedAt, setRemoteExportedAt] = useState<string | null>(null);
  const [remotePreviewOpen, setRemotePreviewOpen] = useState(false);

  const handleRestoreSuccess = () => {
    setShowPostRestoreBanner(true);
  };

  const handleRemotePullSuccess = (result: PullBackupResult) => {
    setRemotePayload(result.payload);
    setRemoteSha(result.remoteSha);
    setRemoteExportedAt(result.exportedAt);
    setRemotePreviewOpen(true);
  };

  const handleBannerRollback = () => {
    modal.confirm({
      title: 'Xác nhận hoàn tác dữ liệu về bản Snapshot?',
      icon: <ExclamationCircleOutlined />,
      content: 'Hành động này sẽ thay thế dữ liệu hiện tại bằng dữ liệu đã lưu trong bản snapshot trước khi nhập.',
      okText: 'Xác nhận hoàn tác',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: async () => {
        try {
          const { totalRestored } = await rollbackToSnapshot(db);
          setShowPostRestoreBanner(false);
          announceToScreenReader(`Hoàn tác thành công ${totalRestored} bản ghi về trạng thái trước nhập.`);
          notification.success({
            message: 'Hoàn tác dữ liệu thành công',
            description: `Đã khôi phục ${totalRestored} bản ghi từ bản snapshot an toàn.`,
          });
        } catch (err: any) {
          notification.error({
            message: 'Lỗi hoàn tác',
            description: err?.message || 'Không thể hoàn tác về bản snapshot.',
          });
        }
      },
    });
  };

  const handleBannerDownload = async () => {
    try {
      const setting = await db.settings.get('last_pre_import_snapshot');
      if (!setting || !setting.value) {
        notification.error({
          message: 'Lỗi',
          description: 'Không tìm thấy snapshot để tải về.',
        });
        return;
      }
      downloadSnapshotFile(setting.value as SnapshotData);
      notification.success({
        message: 'Đã tạo tệp tải xuống',
        description: 'Bản snapshot an toàn đã được tải về máy của bạn.',
      });
    } catch (err: any) {
      notification.error({
        message: 'Lỗi',
        description: err?.message || 'Không thể tải snapshot.',
      });
    }
  };

  const items = [
    {
      key: 'capacity',
      label: (
        <span>
          <ScheduleOutlined style={{ marginRight: 8 }} />
          Công suất làm việc
        </span>
      ),
      children: (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <WeeklyCapacityForm db={db} />
          <OverridesTable db={db} />
        </Space>
      ),
    },
    {
      key: 'data',
      label: (
        <span>
          <DatabaseOutlined style={{ marginRight: 8 }} />
          Sao lưu & Dữ liệu
        </span>
      ),
      children: (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {showPostRestoreBanner && (
            <PostRestoreBanner
              onRollback={handleBannerRollback}
              onDownloadSnapshot={handleBannerDownload}
              onClose={() => setShowPostRestoreBanner(false)}
            />
          )}

          {appliedProfile && (
            <PostProfileImportChecklist
              envelope={appliedProfile.envelope}
              blankSecretFields={appliedProfile.blankSecretFields}
              visible
              onClose={() => setAppliedProfile(null)}
            />
          )}

          <Text strong>Sao lưu & khôi phục</Text>
          {onNavigate && (
            <Button
              icon={<EditOutlined />}
              onClick={() => onNavigate('config-profiles')}
              aria-label="Soạn & xuất Profile"
            >
              Soạn & xuất Profile
            </Button>
          )}
          <BackupExportCard db={db} />
          <BackupImportCard db={db} onRestoreSuccess={handleRestoreSuccess} />
          <ConfigProfileImportCard
            db={db}
            onApplySuccess={(envelope, result) =>
              setAppliedProfile({
                envelope,
                blankSecretFields: result.skippedBlankSecrets,
              })
            }
          />
          <SnapshotRollbackCard db={db} />
          <Text strong>Đồng bộ GitHub</Text>
          <GitHubConfigCard db={db} />
          <GitHubSyncCard db={db} onPullSuccess={handleRemotePullSuccess} />
          <Text strong>Lưu trữ & môi trường</Text>
          <LocalSqlitePersistenceCard db={db} />
          <StoragePersistenceCard />

          <Card
            title={
              <span style={{ color: 'var(--danger)' }}>
                <WarningOutlined style={{ marginRight: 8 }} />
                Khu vực nguy hiểm (Danger Zone)
              </span>
            }
          >
            <Paragraph type="secondary">
              Đặt lại toàn bộ dữ liệu ứng dụng về dữ liệu mẫu ban đầu. Tất cả các dự án, tác vụ và
              cấu hình công suất hiện tại sẽ bị xóa hoàn toàn.
            </Paragraph>
            <Button danger onClick={() => setResetModalOpen(true)}>
              Đặt lại toàn bộ cơ sở dữ liệu
            </Button>
          </Card>
        </Space>
      ),
    },
    {
      key: 'jira',
      label: (
        <span>
          <CloudSyncOutlined style={{ marginRight: 8 }} />
          Tích hợp Jira
        </span>
      ),
      children: (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <JiraConfigCard db={db} />
        </Space>
      ),
    },
    {
      key: 'notifications',
      label: (
        <span>
          <BellOutlined style={{ marginRight: 8 }} />
          Thông báo
        </span>
      ),
      children: (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <NotificationSettingsCard db={db} />
        </Space>
      ),
    },
    {
      key: 'ai',
      label: (
        <span>
          <RobotOutlined style={{ marginRight: 8 }} />
          Trợ lý AI & Ghost Dev
        </span>
      ),
      children: (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Text strong>Quy ước & công cụ AI</Text>
          <GlobalConventionsCard db={db} />
          <McpConfigCard db={db} />
          <GraphitiSqlConfigCard db={db} />
          <AiToolCatalogCard db={db} />
          <OracleAiToolConfigCard db={db} />
          <SshFsAiToolConfigCard db={db} />
          <Text strong>Trợ lý & Ghost Dev</Text>
          <GhostDevConfigCard />
          <NineRouterConfigCard db={db} />
          <Text strong>Ngân sách & Knowledge</Text>
          <BudgetWarnThresholdCard db={db} />
          <KnowledgeServerConfigCard />
        </Space>
      ),
    },
    {
      key: 'ssh',
      label: (
        <span>
          <CloudServerOutlined style={{ marginRight: 8 }} />
          Remote SSH
        </span>
      ),
      children: (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Text strong>Kết nối SSH</Text>
          <SshConfigCard db={db} />
          <Text strong>Phân loại hệ thống</Text>
          <SystemTypeOptionsCard db={db} />
        </Space>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '16px 24px' }}>
      {contextHolder}
      <PageHeader
        title="Cài đặt & Cấu hình công suất"
        subtitle="Cấu hình công suất làm việc hàng tuần tiêu chuẩn và lên lịch ngoại lệ cho các ngày cụ thể."
        extra={
          onNavigate && (
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => onNavigate('tasks')}
              aria-label="Quay lại Tác vụ"
            >
              Quay lại Tác vụ
            </Button>
          )
        }
      />

      <Tabs
        activeKey={activeTab}
        onChange={(k) => setActiveTab(k as 'capacity' | 'data' | 'jira' | 'notifications' | 'ai' | 'ssh')}
        items={items}
      />

      <ResetDbModal
        open={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
      />

      {remotePayload && (
        <ImportPreviewModal
          open={remotePreviewOpen}
          payload={remotePayload}
          rawFileName="github:backup.enc.json"
          db={db}
          onClose={() => {
            setRemotePreviewOpen(false);
            setRemotePayload(null);
            setRemoteSha(null);
            setRemoteExportedAt(null);
          }}
          onRestoreSuccess={async () => {
            setShowPostRestoreBanner(true);
            if (remoteSha) {
              await db.settings.put({ key: 'last_synced_sha', value: remoteSha });
            }
            if (remoteExportedAt) {
              await db.settings.put({ key: 'last_synced_at', value: remoteExportedAt });
            }
            announceToScreenReader(
              'Khôi phục dữ liệu từ GitHub thành công. Bản snapshot an toàn đã được lưu.'
            );
          }}
        />
      )}
    </div>
  );
};
