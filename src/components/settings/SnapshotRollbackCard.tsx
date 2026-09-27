import React, { useState } from 'react';
import { Card, Empty, Typography, Button, Space, Modal, Tag, notification } from 'antd';
import { HistoryOutlined, UndoOutlined, DownloadOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { SnapshotData } from '../../types/backup';
import { rollbackToSnapshot, downloadSnapshotFile } from '../../services/backup/restoreBackup';
import { announceToScreenReader } from '../common/AriaLiveRegion';

const { Text, Paragraph } = Typography;

export interface SnapshotRollbackCardProps {
  db?: TaskPlannerDatabase;
}

export const SnapshotRollbackCard: React.FC<SnapshotRollbackCardProps> = ({
  db = defaultDb,
}) => {
  const [loading, setLoading] = useState(false);

  const snapshotRecord = useLiveQuery(
    async () => {
      const setting = await db.settings.get('last_pre_import_snapshot');
      return (setting?.value as SnapshotData) || null;
    },
    [db]
  );

  const handleRollback = () => {
    if (!snapshotRecord) return;

    Modal.confirm({
      title: 'Xác nhận hoàn tác dữ liệu về bản Snapshot?',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <Paragraph>
            Hành động này sẽ thay thế dữ liệu hiện tại bằng dữ liệu đã lưu trong bản snapshot ngày{' '}
            <Text strong>
              {new Date(snapshotRecord.timestamp).toLocaleString('vi-VN')}
            </Text>.
          </Paragraph>
          <Paragraph type="secondary">
            Bản snapshot sẽ được dọn dẹp sau khi hoàn tác thành công.
          </Paragraph>
        </div>
      ),
      okText: 'Xác nhận hoàn tác',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: async () => {
        setLoading(true);
        try {
          const { totalRestored } = await rollbackToSnapshot(db);
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
        } finally {
          setLoading(false);
        }
      },
    });
  };

  const handleDownload = () => {
    if (!snapshotRecord) return;
    try {
      downloadSnapshotFile(snapshotRecord);
      notification.success({
        message: 'Đã tạo tệp tải xuống',
        description: 'Bản snapshot an toàn đã được tải về máy của bạn.',
      });
    } catch (err: any) {
      notification.error({
        message: 'Lỗi tải snapshot',
        description: err?.message || 'Không thể tải tệp snapshot.',
      });
    }
  };

  return (
    <Card
      title={
        <span>
          <HistoryOutlined style={{ marginRight: 8 }} />
          Bản sao an toàn trước khi nhập (Pre-Import Snapshot)
        </span>
      }
    >
      <Paragraph type="secondary">
        Trước mỗi lần khôi phục dữ liệu từ tệp sao lưu, hệ thống tự động lưu giữ một bản chụp
        toàn bộ dữ liệu của bạn để bạn có thể hoàn tác ngay lập tức nếu cần.
      </Paragraph>

      {!snapshotRecord ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Chưa có bản snapshot an toàn nào được lưu."
        />
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text strong>Bản an toàn tự động trước khi nhập:</Text>{' '}
            <Text type="secondary">
              {new Date(snapshotRecord.timestamp).toLocaleString('vi-VN')}
            </Text>
          </div>

          <div>
            <Space wrap>
              <Tag color="blue">Dự án: {snapshotRecord.counts.projects}</Tag>
              <Tag color="cyan">Cột mốc: {snapshotRecord.counts.milestones}</Tag>
              <Tag color="green">Tác vụ: {snapshotRecord.counts.tasks}</Tag>
              <Tag color="orange">Quy tắc: {snapshotRecord.counts.capacityRules}</Tag>
              <Tag color="purple">Ngoại lệ: {snapshotRecord.counts.capacityOverrides}</Tag>
              <Tag color="magenta">Phân bổ: {snapshotRecord.counts.plannedAllocations}</Tag>
            </Space>
          </div>

          <Space wrap style={{ marginTop: 8 }}>
            <Button
              danger
              icon={<UndoOutlined />}
              onClick={handleRollback}
              loading={loading}
            >
              Khôi phục từ bản an toàn này
            </Button>
            <Button
              icon={<DownloadOutlined />}
              onClick={handleDownload}
            >
              Tải bản snapshot về máy
            </Button>
          </Space>
        </Space>
      )}
    </Card>
  );
};
