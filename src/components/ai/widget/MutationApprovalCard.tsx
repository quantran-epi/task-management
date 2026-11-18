import React from 'react';
import { Button, theme } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import { renderSafeMarkdown } from '../../../utils/markdown';

export interface MutationApprovalCardProps {
  toolName: string;
  summary: string;
  onApprove: () => void;
  onReject: () => void;
}

/**
 * UI-SPEC §4 approval wait state. The card IS the wait state: no spinner, no
 * auto-dismiss, and the runtime keeps the turn parked until a decision (D-22).
 */
export const MutationApprovalCard: React.FC<MutationApprovalCardProps> = ({
  summary,
  onApprove,
  onReject,
}) => {
  const { token } = theme.useToken();
  const summaryHtml = renderSafeMarkdown(summary);

  return (
    <div
      data-testid="ai-mutation-approval"
      style={{
        margin: '8px 0 16px',
        padding: '16px',
        backgroundColor: token.colorWarningBg,
        border: `1px solid ${token.colorWarningBorder}`,
        borderRadius: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 14,
          fontWeight: 600,
          color: token.colorWarningText,
        }}
      >
        <ExclamationCircleOutlined style={{ color: '#faad14' }} />
        <span>Yêu cầu xác nhận thay đổi dữ liệu</span>
      </div>

      <div
        className="chat-markdown-body"
        style={{ fontSize: 14, lineHeight: 1.5, color: token.colorText, wordBreak: 'break-word' }}
        dangerouslySetInnerHTML={{ __html: summaryHtml }}
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
        <Button danger onClick={onReject}>
          Từ chối
        </Button>
        <Button type="primary" onClick={onApprove}>
          Chấp thuận
        </Button>
      </div>
    </div>
  );
};

export default MutationApprovalCard;
