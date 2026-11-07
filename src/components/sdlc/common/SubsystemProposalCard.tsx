import React, { useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, Collapse, Tag, Tooltip, theme } from 'antd';
import { BulbOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { db as defaultDb, type TaskPlannerDatabase } from '../../../db';
import type { ChangeRequest } from '../../../types/models';
import type { SubsystemProposalItem, SubsystemProposalResult } from '../../../services/ai/sdlcArtifactTools';

/** D-42: a skipped proposal must not reappear for the same CR. */
export function proposalDismissedKey(crId: string): string {
  return `sdlc_proposal_dismissed:${crId}`;
}

export async function isProposalDismissed(crId: string, db: TaskPlannerDatabase = defaultDb): Promise<boolean> {
  return (await db.settings.get(proposalDismissedKey(crId))) !== undefined;
}

/** Idempotent: the card and the host handler both call it for the same CR. */
export async function dismissProposal(crId: string, db: TaskPlannerDatabase = defaultDb): Promise<void> {
  await db.settings.put({ key: proposalDismissedKey(crId), value: new Date().toISOString() });
}

export interface SubsystemProposalCardProps {
  proposal: SubsystemProposalResult;
  changeRequest: ChangeRequest;
  db?: TaskPlannerDatabase | undefined;
  applying?: boolean | undefined;
  error?: string | undefined;
  decision?: 'approved' | 'skipped' | undefined;
  onApprove: (systemIds: string[]) => void;
  onSkip: () => void;
}

const CONFIDENCE_TAG: Record<SubsystemProposalItem['confidence'], { color: string; label: string }> = {
  high: { color: 'success', label: 'Cao' },
  medium: { color: 'warning', label: 'Trung bình' },
  low: { color: 'default', label: 'Thấp' },
};

/**
 * D-41..D-43 / ENT-NORM-06: the approval gate. The only write path is the `Thêm vào CR`
 * click; mounting the card performs no write at all.
 */
export const SubsystemProposalCard: React.FC<SubsystemProposalCardProps> = ({
  proposal, changeRequest, db = defaultDb, applying = false, error, decision, onApprove, onSkip,
}) => {
  const { token } = theme.useToken();
  const existingIds = useMemo(
    () => new Set(changeRequest.targets.map((target) => target.systemId)),
    [changeRequest.targets]
  );
  const items = useMemo(
    () => proposal.items.filter((item) => !existingIds.has(item.systemId)),
    [proposal.items, existingIds]
  );
  const [checked, setChecked] = useState<Set<string>>(() => new Set(items.map((item) => item.systemId)));
  const [dismissed, setDismissed] = useState<boolean | undefined>(undefined);
  const [approvedCount, setApprovedCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const hidden = await isProposalDismissed(changeRequest.id, db).catch(() => false);
      if (!cancelled) setDismissed(hidden);
    })();
    return () => { cancelled = true; };
  }, [changeRequest.id, db]);

  // Nothing to add, already dismissed, or still resolving the dismissal key.
  if (dismissed !== false || items.length === 0) return null;

  const resolved = decision ?? (approvedCount !== null ? 'approved' : undefined);

  if (resolved) {
    return (
      <section data-testid="subsystem-proposal" aria-label="Đề xuất subsystem" role="status"
        style={{ padding: '8px 12px', margin: '8px 0 16px', borderRadius: 4, fontSize: 12, color: token.colorText }}>
        {resolved === 'approved'
          ? <><CheckCircleOutlined style={{ color: '#52c41a' }} /> Đã thêm {approvedCount ?? items.length} subsystem vào CR</>
          : <span style={{ color: token.colorTextSecondary }}>Đã bỏ qua đề xuất subsystem</span>}
      </section>
    );
  }

  const additive = changeRequest.targets.length > 0;
  const toggle = (systemId: string, next: boolean) => {
    setChecked((prev) => {
      const updated = new Set(prev);
      if (next) updated.add(systemId);
      else updated.delete(systemId);
      return updated;
    });
  };

  const handleApprove = () => {
    const ids = items.map((item) => item.systemId).filter((id) => checked.has(id));
    if (ids.length === 0) return;
    setApprovedCount(ids.length);
    onApprove(ids);
  };

  const handleSkip = () => {
    // D-42: persist the dismissal before hiding, so a remount of the same CR stays clean.
    void dismissProposal(changeRequest.id, db);
    setDismissed(true);
    onSkip();
  };

  return (
    <section data-testid="subsystem-proposal" aria-label="Đề xuất subsystem"
      style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, maxWidth: '100%',
        backgroundColor: '#ffffff', border: '1px solid var(--border, #e9eaee)', borderLeft: '3px solid #faad14',
        borderRadius: 4, margin: '8px 0 16px', color: token.colorText }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 16, fontWeight: 600 }}>
        <BulbOutlined style={{ color: '#faad14', flexShrink: 0 }} />
        <span>{additive ? 'Đề xuất bổ sung subsystem' : 'Đề xuất subsystem ảnh hưởng'}</span>
      </div>
      {additive && (
        <div style={{ fontSize: 12, color: token.colorTextSecondary }}>
          CR đã có {changeRequest.targets.length} subsystem — chỉ liệt kê phần còn thiếu.
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((item) => (
          <label key={item.systemId} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
            <Checkbox checked={checked.has(item.systemId)} onChange={(event) => toggle(item.systemId, event.target.checked)} />
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <Tag color="cyan" style={{ fontFamily: 'monospace', margin: 0 }}>{item.code}</Tag>
                <span style={{ fontWeight: 600 }}>{item.name}</span>
                <Tag color={CONFIDENCE_TAG[item.confidence].color} style={{ margin: 0 }}>
                  {CONFIDENCE_TAG[item.confidence].label}
                </Tag>
              </span>
              <Tooltip title={item.reason}>
                <span style={{ fontSize: 12, color: token.colorTextSecondary, display: '-webkit-box',
                  WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {item.reason}
                </span>
              </Tooltip>
            </span>
          </label>
        ))}
      </div>
      {proposal.evidence.length > 0 && (
        <Collapse size="small" items={[{
          key: 'evidence',
          label: `Bằng chứng (${proposal.evidence.length})`,
          children: <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>{proposal.evidence.map((line) => <li key={line}>{line}</li>)}</ul>,
        }]} />
      )}
      {error && <div role="alert" style={{ fontSize: 12, color: '#c54e58' }}>{error}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
        <Button disabled={applying} onClick={handleSkip} style={{ minHeight: 32, fontSize: 12 }}>Bỏ qua</Button>
        <Tooltip title={checked.size === 0 ? 'Chọn ít nhất một subsystem' : undefined}>
          <span>
            <Button type="primary" disabled={checked.size === 0 || applying} onClick={handleApprove}
              style={{ minHeight: 32, fontSize: 12 }}>Thêm vào CR</Button>
          </span>
        </Tooltip>
      </div>
    </section>
  );
};
