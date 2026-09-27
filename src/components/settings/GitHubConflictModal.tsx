import React, { useState, useEffect } from 'react';
import { Modal, Input, Typography, Alert, Space, Button } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import { announceToScreenReader } from '../common/AriaLiveRegion';

const { Text, Paragraph } = Typography;

export interface GitHubConflictModalProps {
  open: boolean;
  remoteSha?: string;
  localSha?: string;
  onPullAndPreview: () => void;
  onForceOverwrite: () => void;
  onCancel: () => void;
}

export const GitHubConflictModal: React.FC<GitHubConflictModalProps> = ({
  open,
  remoteSha,
  localSha,
  onPullAndPreview,
  onForceOverwrite,
  onCancel,
}) => {
  const [confirmKeyword, setConfirmKeyword] = useState('');

  const isOverwriteUnlocked = confirmKeyword === 'OVERWRITE';

  useEffect(() => {
    if (open) {
      announceToScreenReader(
        'Phát hiện xung đột bản sao lưu từ xa trên GitHub. Bản sao lưu trên GitHub đã được cập nhật bởi phiên khác.'
      );
    } else {
      setConfirmKeyword('');
    }
  }, [open]);

  const handleCancel = () => {
    setConfirmKeyword('');
    onCancel();
  };

  const handleForceOverwrite = () => {
    setConfirmKeyword('');
    onForceOverwrite();
  };

  return (
    <Modal
      open={open}
      title={
        <Space>
          <WarningOutlined style={{ color: '#faad14' }} />
          <span>Xung đột bản sao lưu từ xa</span>
        </Space>
      }
      onCancel={handleCancel}
      footer={[
        <Button key="cancel" onClick={handleCancel}>
          Hủy bỏ
        </Button>,
        <Button key="pull" type="primary" onClick={onPullAndPreview}>
          Tải và xem trước bản remote
        </Button>,
        <Button
          key="overwrite"
          danger
          disabled={!isOverwriteUnlocked}
          onClick={handleForceOverwrite}
        >
          Ghi đè bản remote bằng dữ liệu máy này
        </Button>,
      ]}
      destroyOnClose
    >
      <Alert
        type="warning"
        showIcon
        message="Bản sao lưu trên GitHub đã thay đổi kể từ lần đồng bộ trước"
        description={`SHA trên GitHub: ${remoteSha?.slice(0, 7) || 'N/A'} | SHA ghi nhận tại máy: ${localSha?.slice(0, 7) || 'Chưa có'}`}
        style={{ marginBottom: 16 }}
      />
      <Paragraph>
        Bạn có thể tải bản từ xa về để xem trước sự khác biệt, hoặc ghi đè bản trên GitHub bằng dữ
        liệu hiện tại trên thiết bị này.
      </Paragraph>
      <div style={{ marginTop: 16 }}>
        <Paragraph>
          Để ghi đè bắt buộc, nhập chính xác từ khóa <Text code strong>OVERWRITE</Text> bên dưới:
        </Paragraph>
        <Input
          value={confirmKeyword}
          onChange={(e) => setConfirmKeyword(e.target.value)}
          placeholder="OVERWRITE"
          aria-label="Xác nhận từ khóa OVERWRITE"
        />
      </div>
    </Modal>
  );
};
