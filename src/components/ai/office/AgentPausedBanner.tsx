import React from 'react';
import { Alert, Button } from 'antd';

export interface AgentPausedBannerProps {
  agentName?: string | undefined;
  teamName?: string | undefined;
  onTopUp: () => void;
}

/**
 * UI-SPEC §8c paused-scope alert (D-20/D-21). The waiting state must never read as
 * a hang: no spinner, no spinning icon, no animated placeholder and no "processing"
 * text — the banner copy plus the `Tạm dừng` badge carry the state.
 */
export const AgentPausedBanner: React.FC<AgentPausedBannerProps> = ({
  agentName,
  teamName,
  onTopUp,
}) => {
  const isAgentScope = Boolean(agentName);
  const message = isAgentScope
    ? `«${agentName}» tạm dừng — cần cấp thêm token`
    : 'Nhóm tạm dừng — cần cấp thêm token';
  const description = isAgentScope
    ? 'Đã dùng 80% ngân sách của nhân viên này. Các nhân viên khác trong lô vẫn đang chạy.'
    : 'Đã dùng 80% ngân sách nhóm. Lượt chạy đang chờ, không có nhân viên nào bị hủy.';

  return (
    <Alert
      type="warning"
      showIcon
      role="status"
      data-testid="agent-paused-banner"
      style={{ margin: '8px 0 16px', borderRadius: 8 }}
      message={message}
      description={description}
      action={
        <Button size="small" type="primary" onClick={onTopUp}>
          Cấp thêm token
        </Button>
      }
      {...(teamName ? { 'data-team-name': teamName } : {})}
    />
  );
};

export default AgentPausedBanner;
