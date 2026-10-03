import React from 'react';
import { Card, Button, Typography, Space, theme } from 'antd';
import { ExclamationCircleOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons';

const { Text } = Typography;

export interface InlineApiErrorCardProps {
  errorMessage: string;
  onRetry: () => void;
  onOpenSettings: () => void;
}

export const InlineApiErrorCard: React.FC<InlineApiErrorCardProps> = ({
  errorMessage,
  onRetry,
  onOpenSettings,
}) => {
  const { token } = theme.useToken();

  return (
    <Card
      size="small"
      style={{
        margin: '12px 0',
        borderColor: token.colorErrorBorder,
        backgroundColor: token.colorErrorBg,
        borderRadius: 8,
      }}
      styles={{
        body: { padding: '12px 16px' },
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Space align="start">
          <ExclamationCircleOutlined style={{ color: token.colorError, fontSize: 16, marginTop: 2 }} />
          <Text style={{ color: token.colorErrorText, fontSize: 13 }}>
            Lỗi kết nối 9router: {errorMessage}. Vui lòng kiểm tra lại khóa API hoặc đường truyền mạng.
          </Text>
        </Space>
        <Space size="small" style={{ justifyContent: 'flex-end', marginTop: 4 }}>
          <Button
            size="small"
            type="primary"
            danger
            icon={<ReloadOutlined />}
            onClick={onRetry}
          >
            Thử lại tin nhắn
          </Button>
          <Button
            size="small"
            icon={<SettingOutlined />}
            onClick={onOpenSettings}
          >
            Cài đặt AI
          </Button>
        </Space>
      </div>
    </Card>
  );
};
