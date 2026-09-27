import React from 'react';
import { Alert, Button, Space } from 'antd';
import { UndoOutlined, DownloadOutlined, CheckCircleOutlined } from '@ant-design/icons';

export interface PostRestoreBannerProps {
  onRollback: () => void;
  onDownloadSnapshot: () => void;
  onClose?: () => void;
}

export const PostRestoreBanner: React.FC<PostRestoreBannerProps> = ({
  onRollback,
  onDownloadSnapshot,
  onClose,
}) => {
  return (
    <Alert
      type="success"
      showIcon
      icon={<CheckCircleOutlined />}
      closable
      {...(onClose ? { onClose } : {})}
      style={{ marginBottom: 16 }}
      message="Khôi phục dữ liệu thành công"
      description={
        <div>
          <p style={{ margin: '0 0 8px 0' }}>
            Toàn bộ dữ liệu từ tệp sao lưu đã được áp dụng vào hệ thống. Bản snapshot của dữ liệu trước khi nhập đã được lưu tự động.
          </p>
          <Space>
            <Button
              size="small"
              danger
              icon={<UndoOutlined />}
              onClick={onRollback}
            >
              Hoàn tác về bản trước đó
            </Button>
            <Button
              size="small"
              icon={<DownloadOutlined />}
              onClick={onDownloadSnapshot}
            >
              Tải snapshot về máy
            </Button>
          </Space>
        </div>
      }
    />
  );
};
