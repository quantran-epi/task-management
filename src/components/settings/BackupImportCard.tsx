import React, { useState } from 'react';
import { Card, Upload, Typography, notification } from 'antd';
import { CloudUploadOutlined, InboxOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { ImportPreviewModal } from './ImportPreviewModal';

const { Title, Paragraph, Text } = Typography;
const { Dragger } = Upload;

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export interface BackupImportCardProps {
  db?: TaskPlannerDatabase;
  onRestoreSuccess?: (snapshotTime: string) => void;
}

export const BackupImportCard: React.FC<BackupImportCardProps> = ({
  db = defaultDb,
  onRestoreSuccess,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [parsedPayload, setParsedPayload] = useState<unknown | null>(null);
  const [fileName, setFileName] = useState('');

  const uploadProps: UploadProps = {
    name: 'backupFile',
    multiple: false,
    accept: '.json,application/json',
    showUploadList: false,
    beforeUpload: (file) => {
      if (file.size > MAX_FILE_SIZE) {
        notification.error({
          message: 'Tệp quá lớn',
          description: 'Dung lượng tệp sao lưu vượt quá giới hạn 50MB cho phép.',
        });
        return Upload.LIST_IGNORE;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const parsed = JSON.parse(content);
          setFileName(file.name);
          setParsedPayload(parsed);
          setModalOpen(true);
        } catch {
          notification.error({
            message: 'Tệp không đúng định dạng JSON',
            description: 'Không thể đọc nội dung tệp sao lưu. Vui lòng kiểm tra lại định dạng tệp.',
          });
        }
      };
      reader.readAsText(file);
      return false; // Prevent auto-upload to server
    },
  };

  return (
    <>
      <Card
        title={
          <span>
            <CloudUploadOutlined style={{ marginRight: 8 }} />
            Nhập & Khôi phục dữ liệu
          </span>
        }
      >
        <Paragraph type="secondary">
          Chọn hoặc kéo thả tệp sao lưu JSON để khôi phục dữ liệu tác vụ và công suất.
          Hệ thống sẽ kiểm tra tính toàn vẹn và cho phép bạn xem trước trước khi thực hiện.
        </Paragraph>

        <Dragger {...uploadProps} style={{ padding: '16px 0' }}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined style={{ fontSize: 36, color: '#1677ff' }} />
          </p>
          <p className="ant-upload-text">Nhấp hoặc kéo thả tệp JSON sao lưu vào khu vực này</p>
          <p className="ant-upload-hint">
            Hỗ trợ tệp định dạng .json với dung lượng tối đa 50MB.
          </p>
        </Dragger>
      </Card>

      {modalOpen && (
        <ImportPreviewModal
          open={modalOpen}
          payload={parsedPayload}
          rawFileName={fileName}
          db={db}
          onClose={() => {
            setModalOpen(false);
            setParsedPayload(null);
          }}
          onRestoreSuccess={(snapshotTime) => {
            if (onRestoreSuccess) {
              onRestoreSuccess(snapshotTime);
            }
          }}
        />
      )}
    </>
  );
};
