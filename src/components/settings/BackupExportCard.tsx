import React, { useState } from 'react';
import { Card, Button, Typography, Space, notification } from 'antd';
import { CloudDownloadOutlined, DownloadOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs from 'dayjs';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import {
  exportBackupPayload,
  generateBackupFileName,
  triggerDownload,
} from '../../services/backup/exportBackup';
import { announceToScreenReader } from '../common/AriaLiveRegion';

const { Text, Paragraph } = Typography;

export interface BackupExportCardProps {
  db?: TaskPlannerDatabase;
}

export const BackupExportCard: React.FC<BackupExportCardProps> = ({ db = defaultDb }) => {
  const [loading, setLoading] = useState(false);

  const lastBackup = useLiveQuery(async () => {
    return await db.backupMetadata.orderBy('timestamp').reverse().first();
  }, [db]);

  const handleExport = async () => {
    setLoading(true);
    announceToScreenReader('Đang tạo tệp sao lưu...');

    try {
      const envelope = await exportBackupPayload(db);
      const fileName = generateBackupFileName();
      const content = JSON.stringify(envelope, null, 2);
      triggerDownload(content, fileName);

      const totalRecords = Object.values(envelope.counts).reduce((sum, n) => sum + n, 0);
      notification.success({
        message: 'Đã xuất bản sao lưu thành công',
        description: `Đã tải tệp ${fileName}`,
      });
      announceToScreenReader(
        `Đã xuất bản sao lưu thành công. Đã tải tệp ${fileName} với ${totalRecords} bản ghi.`
      );
    } catch (error) {
      notification.error({
        message: 'Xuất bản sao lưu thất bại',
        description: error instanceof Error ? error.message : 'Đã xảy ra lỗi không xác định',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      title={
        <Space>
          <CloudDownloadOutlined />
          <span>Sao lưu dữ liệu</span>
        </Space>
      }
    >
      <Paragraph type="secondary">
        Xuất toàn bộ dữ liệu nghiệp vụ (dự án, cột mốc, tác vụ, công suất, phân bổ) thành tệp JSON để
        lưu trữ ngoại tuyến an toàn. Không bao gồm cài đặt giao diện thiết bị hoặc token.
      </Paragraph>

      <div style={{ marginBottom: 16 }}>
        {lastBackup ? (
          <div>
            <Text type="secondary">Lần sao lưu gần nhất: </Text>
            <Text strong>
              {dayjs(lastBackup.timestamp).format('HH:mm DD/MM/YYYY')}
            </Text>
            <Text type="secondary"> ({lastBackup.recordCount} bản ghi)</Text>
          </div>
        ) : (
          <div>
            <Text type="secondary">Chưa có lịch sử sao lưu. </Text>
            <Text type="secondary">
              Hãy xuất bản sao lưu định kỳ để lưu trữ dự phòng an toàn trên thiết bị của bạn.
            </Text>
          </div>
        )}
      </div>

      <Button
        type="primary"
        icon={<DownloadOutlined />}
        loading={loading}
        onClick={handleExport}
      >
        Xuất bản sao lưu (JSON)
      </Button>
    </Card>
  );
};
