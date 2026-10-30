import React from 'react';
import { Alert, Button, Space } from 'antd';
import type { SdlcCheckpoint } from '../../services/wizard/workflowSchemas';

export interface InterruptedBannerProps {
  checkpoint: SdlcCheckpoint;
  onContinue: () => void;
  onDiscard: () => void;
}

export const InterruptedBanner: React.FC<InterruptedBannerProps> = ({ checkpoint, onContinue, onDiscard }) => (
  <Alert
    type="warning"
    showIcon
    role="status"
    message={`Công việc SDLC bị gián đoạn tại ${checkpoint.step ?? 'bước hiện tại'}.`}
    description="Không có yêu cầu cũ nào được tự động chạy lại. Chọn hành động để tiếp tục hoặc bỏ qua checkpoint."
    action={
      <Space size="small">
        <Button size="small" type="primary" onClick={onContinue}>Tiếp tục</Button>
        <Button size="small" onClick={onDiscard}>Bỏ qua</Button>
      </Space>
    }
  />
);
