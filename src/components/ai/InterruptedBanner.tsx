import React from 'react';
import { Alert, Button, Space } from 'antd';

export interface InterruptedBannerProps {
  message?: string;
  onContinue: () => void;
  onDiscard: () => void;
}

export const InterruptedBanner: React.FC<InterruptedBannerProps> = ({
  message: customMessage,
  onContinue,
  onDiscard,
}) => {
  const displayMsg = customMessage || 'Yêu cầu trước bị gián đoạn khi ứng dụng đóng.';

  return (
    <Alert
      type="warning"
      showIcon
      role="status"
      message={displayMsg}
      description="Không có yêu cầu cũ nào được tự động chạy lại. Chọn hành động để tiếp tục hoặc bỏ qua."
      action={
        <Space size="small">
          <Button size="small" type="primary" onClick={onContinue}>
            Tiếp tục
          </Button>
          <Button size="small" onClick={onDiscard}>
            Bỏ qua
          </Button>
        </Space>
      }
    />
  );
};
