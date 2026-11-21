import React, { useEffect, useId, useState } from 'react';
import { Avatar, Button, Tag, useAntdToken } from '../../ui';
import { TeamOutlined } from '../../ui/icon';
import { agentColorFor, agentTextColorFor } from './AgentAttributionRow';

export interface AssignmentPlanItem {
  agentId: string;
  agentName: string;
  skillName?: string | undefined;
  task: string;
}

export interface AssignmentPlan {
  batchIndex: number;
  assignments: AssignmentPlanItem[];
}

export interface AssignmentPlanCardProps {
  plan: AssignmentPlan;
  decision: 'approved' | 'rejected' | undefined;
  onApprove: () => void;
  onReject: () => void;
}

/**
 * UI-SPEC §7 plan confirmation card. The card IS the wait state: no spinner, no
 * auto-dismiss, and the run stays parked until a decision (D-06 / D-22).
 * Deliberately NOT warning-colored — a plan is not a pending mutation.
 */
export const AssignmentPlanCard: React.FC<AssignmentPlanCardProps> = ({
  plan,
  decision,
  onApprove,
  onReject,
}) => {
  const { token } = useAntdToken();
  const [collapsed, setCollapsed] = useState(decision !== undefined);
  const contentId = useId();
  useEffect(() => { setCollapsed(decision !== undefined); }, [plan, decision]);

  return (
    <div
      data-testid="assignment-plan-card"
      style={{
        margin: '8px 0',
        padding: 12,
        flexShrink: 0,
        borderRadius: 'var(--radius-control)',
        border: `1px solid ${token.colorBorderSecondary}`,
        background: token.colorBgContainer,
        borderLeft: `3px solid ${token.colorPrimary}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--gap-8)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-8)', fontSize: 14, fontWeight: 600 }}>
        <TeamOutlined style={{ color: token.colorPrimary }} />
        <span>Kế hoạch phân việc</span>
        <span style={{ marginLeft: 'auto' }}>
          <Tag>Lô {plan.batchIndex} · {plan.assignments.length} việc</Tag>
        </span>
        <Button type="text" size="small" aria-expanded={!collapsed} aria-controls={contentId}
          onClick={() => setCollapsed((value) => !value)}>
          {collapsed ? 'Mở rộng kế hoạch' : 'Thu gọn kế hoạch'}
        </Button>
      </div>

      <div id={contentId} hidden={collapsed} style={{ maxHeight: 240, overflowY: 'auto' }}>
        {plan.assignments.map((item, idx) => {
          const color = agentColorFor(item.agentId);
          return (
            <div
              key={`${item.agentId}-${idx}`}
              style={{
                display: 'flex',
                gap: 'var(--gap-8)',
                alignItems: 'center',
                padding: '6px 0',
                borderTop: idx === 0 ? 'none' : `1px dashed ${token.colorBorderSecondary}`,
              }}
            >
              <Avatar
                size={24}
                shape="circle"
                style={{ backgroundColor: color, color: agentTextColorFor(color), flexShrink: 0 }}
              >
                {Array.from(item.agentName.trim())[0]?.toUpperCase() ?? '?'}
              </Avatar>
              <span style={{ fontSize: 'var(--font-size-ui)', fontWeight: 400 }}>{item.agentName}</span>
              {item.skillName && <Tag style={{ fontSize: 'var(--font-size-small)' }}>{item.skillName}</Tag>}
              <span style={{ fontSize: 'var(--font-size-ui)', fontWeight: 400, flex: 1, whiteSpace: 'pre-wrap' }}>
                {item.task}
              </span>
            </div>
          );
        })}
      </div>

      {decision ? (
        <div role="status" style={{ fontSize: 'var(--font-size-small)', color: token.colorTextSecondary }}>
          {decision === 'approved'
            ? 'Đã chấp thuận — lô việc đang chạy.'
            : 'Đã từ chối — không nhân viên nào được giao việc.'}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--gap-8)' }}>
          <span style={{ fontSize: 'var(--font-size-small)', color: token.colorTextSecondary }}>
            Duyệt để bắt đầu lô việc này.
          </span>
          <div style={{ display: 'flex', gap: 'var(--gap-8)' }}>
            <Button onClick={onReject} data-testid="assignment-plan-reject">
              Từ chối
            </Button>
            <Button type="primary" onClick={onApprove} data-testid="assignment-plan-approve">
              Chấp thuận kế hoạch
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssignmentPlanCard;
