import React, { useState } from 'react';
import { Typography, Button, Tabs, Space, Card, Modal, notification } from 'antd';
import {
  ArrowLeftOutlined,
  ScheduleOutlined,
  DatabaseOutlined,
  WarningOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { WeeklyCapacityForm } from '../components/settings/WeeklyCapacityForm';
import { OverridesTable } from '../components/settings/OverridesTable';
import { BackupExportCard } from '../components/settings/BackupExportCard';
import { BackupImportCard } from '../components/settings/BackupImportCard';
import { SnapshotRollbackCard } from '../components/settings/SnapshotRollbackCard';
import { PostRestoreBanner } from '../components/settings/PostRestoreBanner';
import { ResetDbModal } from '../components/common/ResetDbModal';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import type { AppRoute } from '../types/navigation';
import { rollbackToSnapshot, downloadSnapshotFile } from '../services/backup/restoreBackup';
import { announceToScreenReader } from '../components/common/AriaLiveRegion';
import type { SnapshotData } from '../types/backup';

const { Title, Paragraph } = Typography;

export interface SettingsViewProps {
  db?: TaskPlannerDatabase;
  onNavigate?: (route: AppRoute) => void;
  defaultActiveTab?: 'capacity' | 'data';
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  db = defaultDb,
  onNavigate,
  defaultActiveTab = 'capacity',
}) => {
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [showPostRestoreBanner, setShowPostRestoreBanner] = useState(false);

  const handleRestoreSuccess = () => {
    setShowPostRestoreBanner(true);
  };

  const handleBannerRollback = () => {
    Modal.confirm({
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

          <BackupExportCard db={db} />
          <BackupImportCard db={db} onRestoreSuccess={handleRestoreSuccess} />
          <SnapshotRollbackCard db={db} />

          <Card
            title={
              <span style={{ color: '#ff4d4f' }}>
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
  ];

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '16px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Cài đặt & Cấu hình công suất
          </Title>
          <Paragraph type="secondary" style={{ margin: 0 }}>
            Cấu hình công suất làm việc hàng tuần tiêu chuẩn và lên lịch ngoại lệ cho các ngày cụ thể.
          </Paragraph>
        </div>

        {onNavigate && (
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => onNavigate('tasks')}
            aria-label="Quay lại Tác vụ"
          >
            Quay lại Tác vụ
          </Button>
        )}
      </div>

      <Tabs defaultActiveKey={defaultActiveTab} items={items} />

      <ResetDbModal
        open={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
      />
    </div>
  );
};
