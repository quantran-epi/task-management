import React from 'react';
import { Card, Button, Typography, Space, theme } from 'antd';
import { ExclamationCircleFilled, ReloadOutlined, SettingOutlined } from '@ant-design/icons';

const { Text, Paragraph } = Typography;

export interface InlineApiErrorCardProps {
  errorMessage: string;
  onRetry: () => void;
  onOpenSettings?: (() => void) | undefined;
}

/**
 * InlineApiErrorCard implements the fail-closed UI state per D-04 and UI-SPEC 6.2.
 * Displayed when the LLM is unconfigured, unreachable, or fails schema validation.
 */
export const InlineApiErrorCard: React.FC<InlineApiErrorCardProps> = ({
  errorMessage,
  onRetry,
  onOpenSettings,
}) => {
  const { token } = theme.useToken();

  return (
    <Card
      role="alert"
      size="small"
      data-testid="inline-api-error-card"
      style={{
        margin: '12px 0',
        borderColor: token.colorErrorBorder,
        backgroundColor: token.colorErrorBg,
        borderRadius: 8,
      }}
      styles={{
        body: { padding: '14px 16px' },
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Space align="center" size={8}>
          <ExclamationCircleFilled style={{ color: token.colorError, fontSize: 18 }} />
          <Text strong style={{ color: token.colorErrorText, fontSize: 15 }}>
            Trợ lý AI tạm thời không khả dụng
          </Text>
        </Space>

        <Paragraph
          style={{
            margin: 0,
            fontSize: 13,
            color: token.colorTextSecondary,
            lineHeight: 1.5,
          }}
        >
          Không thể kết nối đến dịch vụ AI (9router) hoặc cấu hình chưa hợp lệ. Mọi tác vụ cơ sở dữ liệu và truy xuất tri thức đã được dừng an toàn để tránh sai lệch dữ liệu.
        </Paragraph>

        {errorMessage && errorMessage !== 'Trợ lý AI tạm thời không khả dụng' && (
          <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic' }}>
            Chi tiết lỗi: {errorMessage}
          </Text>
        )}

        <Space size="small" style={{ justifyContent: 'flex-end', marginTop: 4 }}>
          {onOpenSettings && (
            <Button
              size="small"
              icon={<SettingOutlined />}
              onClick={onOpenSettings}
              aria-label="Mở Cài đặt AI"
            >
              Mở Cài đặt AI
            </Button>
          )}
          <Button
            size="small"
            type="primary"
            danger
            icon={<ReloadOutlined />}
            onClick={onRetry}
            aria-label="Thử lại"
          >
            Thử lại
          </Button>
        </Space>
      </div>
    </Card>
  );
};
