import React from 'react';
import { Card, Typography, Space, Button, theme } from 'antd';
import { QuestionCircleOutlined, CloseOutlined } from '@ant-design/icons';

const { Text, Paragraph } = Typography;

export interface ClarificationPromptCardProps {
  question: string;
  originalQuery?: string | undefined;
  onCancel?: (() => void) | undefined;
}

/**
 * ClarificationPromptCard presents the exact model clarification question with
 * role="status" and polite conversational framing per D-06 and UI-SPEC 6.1.
 * Binary route override chips (knowledge vs operational) are eliminated.
 */
export const IntentRoutingPrompt: React.FC<ClarificationPromptCardProps> = ({
  question,
  originalQuery,
  onCancel,
}) => {
  const { token } = theme.useToken();

  return (
    <Card
      role="status"
      aria-live="polite"
      size="small"
      data-testid="clarification-prompt-card"
      style={{
        margin: '8px 0',
        borderColor: token.colorInfoBorder ?? '#91caff',
        backgroundColor: token.colorInfoBg ?? '#e6f4ff',
        borderRadius: 8,
        width: '100%',
      }}
      styles={{
        body: { padding: '12px 16px' },
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space orientation="horizontal" size={6}>
            <QuestionCircleOutlined style={{ color: token.colorInfo ?? '#1677ff', fontSize: 15 }} />
            <Text strong style={{ fontSize: 13, color: token.colorText }}>
              Cần thêm thông tin để xử lý chính xác
            </Text>
          </Space>
          {onCancel && (
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined style={{ fontSize: 12 }} />}
              onClick={onCancel}
              aria-label="Hủy làm rõ"
              style={{ color: token.colorTextSecondary }}
            >
              Hủy
            </Button>
          )}
        </div>

        {originalQuery && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            Dựa trên yêu cầu: <em>"{originalQuery}"</em>
          </Text>
        )}

        <Paragraph
          style={{
            margin: '4px 0 0',
            fontSize: 14,
            fontWeight: 500,
            color: token.colorText,
            lineHeight: 1.5,
          }}
        >
          {question}
        </Paragraph>
      </div>
    </Card>
  );
};
