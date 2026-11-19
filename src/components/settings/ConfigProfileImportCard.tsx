import React, { useState } from 'react';
import { Card, Upload, Typography, notification } from 'antd';
import { ImportOutlined, InboxOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import type { TaskPlannerDatabase } from '../../db';
import type { ApplyProfileResult } from '../../services/configProfiles/importProfile';
import type { ValidProfileEnvelope } from './ImportProfilePreviewModal';
import { ImportProfilePreviewModal } from './ImportProfilePreviewModal';

const { Paragraph } = Typography;
const { Dragger } = Upload;

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export interface ConfigProfileImportCardProps {
  /** Optional to avoid issuing any db read while merely rendering the picker. */
  db?: TaskPlannerDatabase;
  onApplySuccess?: (envelope: ValidProfileEnvelope, result: ApplyProfileResult) => void;
}

/**
 * File entry point for portable configuration profiles.
 *
 * Uses the browser/Tauri-compatible file input + FileReader path (never
 * `select_local_file`, which returns only a path). No db write happens here —
 * the explicitly threaded db reaches the preview modal and apply service only.
 */
export const ConfigProfileImportCard: React.FC<ConfigProfileImportCardProps> = ({
  db,
  onApplySuccess,
}) => {
  const [modalOpen, setModalOpen] = useState(false);

  const [parsedPayload, setParsedPayload] = useState<unknown | null>(null);
  const [fileName, setFileName] = useState('');

  if (!db) return null;

  const uploadProps: UploadProps = {
    name: 'configProfileFile',
    multiple: false,
    accept: '.json,application/json',
    showUploadList: false,
    beforeUpload: (file) => {
      if (file.size > MAX_FILE_SIZE) {
        notification.error({
          message: 'Tệp quá lớn',
          description: 'Dung lượng tệp cấu hình vượt quá giới hạn 50MB cho phép.',
        });
        return Upload.LIST_IGNORE;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target?.result as string);
          setFileName(file.name);
          setParsedPayload(parsed);
          setModalOpen(true);
        } catch {
          notification.error({
            message: 'Tệp không đúng định dạng JSON',
            description: 'Không thể đọc nội dung tệp cấu hình. Vui lòng kiểm tra lại định dạng tệp.',
          });
        }
      };
      reader.readAsText(file);
      return false; // prevent auto-upload; this is a local file
    },
  };

  return (
    <>
      <Card
        title={
          <span>
            <ImportOutlined style={{ marginRight: 8 }} />
            Nhập cấu hình từ profile
          </span>
        }
      >
        <Paragraph type="secondary">
          Chọn tệp JSON profile đã xuất để xem trước. Các field bảo mật sẽ để trống và các giá trị
          theo máy sẽ được đánh dấu để bạn rà soát trước khi áp dụng bằng cách trộn từng khóa.
        </Paragraph>

        <Dragger {...uploadProps} style={{ padding: '16px 0' }}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined style={{ fontSize: 36, color: '#1677ff' }} />
          </p>
          <p className="ant-upload-text">Nhấp hoặc kéo thả tệp JSON profile vào khu vực này</p>
          <p className="ant-upload-hint">Hỗ trợ .json tối đa 50MB. Không ghi đè toàn bộ cài đặt.</p>
        </Dragger>
      </Card>

      {modalOpen && (
        <ImportProfilePreviewModal
          open={modalOpen}
          parsed={parsedPayload}
          rawFileName={fileName}
          db={db}
          onClose={() => {
            setModalOpen(false);
            setParsedPayload(null);
          }}
          onApplySuccess={(envelope, result) => onApplySuccess?.(envelope, result)}
        />
      )}
    </>
  );
};
