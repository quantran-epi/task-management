import React, { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Button, Card, Modal, Tag, Typography, theme } from 'antd';
import type { SdlcStepId } from '../../../services/wizard/workflowSchemas';

const { Text, Title } = Typography;

export interface RevisionSourceItem {
  title: string;
  shortHash?: string | undefined;
  version?: number | undefined;
}

export interface RevisionImpactModalProps {
  open: boolean;
  revisionType: 'requirement' | 'solution';
  diff?: { before: string; after: string } | undefined;
  sources?: RevisionSourceItem[] | undefined;
  staleStepIds?: SdlcStepId[] | undefined;
  description?: ReactNode;
  loading?: boolean | undefined;

  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

const STEP_LABELS: Record<string, string> = {
  INTAKE: 'Hồ sơ Đầu vào (PL01 & PL02)',
  SOLUTION: 'Giải pháp SOLUTION.md',
  CODE_GUIDE: 'Triển khai Code ngoài',
  CHANGE_PACK: 'Change Pack & Soi Drift',
  TECH_DOCS: 'Kỹ thuật (PL03B & PL07)',
  CAB: 'Tờ trình phê duyệt CAB',
};

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  text: string;
}

function computeLineDiff(before: string, after: string): DiffLine[] {
  const b = before.split(/\r?\n/);
  const a = after.split(/\r?\n/);
  const n = b.length;
  const m = a.length;

  // Bound LCS table to prevent performance hits on large texts
  if (n > 500 || m > 500) {
    const result: DiffLine[] = [];
    b.forEach((line) => result.push({ type: 'removed', text: line }));
    a.forEach((line) => result.push({ type: 'added', text: line }));
    return result;
  }

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      if (b[i] === a[j]) {
        dp[i + 1]![j + 1] = dp[i]![j]! + 1;
      } else {
        dp[i + 1]![j + 1] = Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
      }
    }
  }

  const result: DiffLine[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && b[i - 1] === a[j - 1]) {
      result.unshift({ type: 'unchanged', text: b[i - 1]! });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i]![j] === dp[i]![j - 1]! || dp[i]![j - 1]! >= (dp[i - 1]?.[j] ?? 0))) {
      result.unshift({ type: 'added', text: a[j - 1]! });
      j--;
    } else if (i > 0) {
      result.unshift({ type: 'removed', text: b[i - 1]! });
      i--;
    }
  }
  return result;
}

export const RevisionImpactModal: React.FC<RevisionImpactModalProps> = ({
  open,
  revisionType,
  diff,
  sources = [],
  staleStepIds = [],
  description,
  loading = false,
  onConfirm,
  onClose,
}) => {
  const { token } = theme.useToken();
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (open) {
      titleRef.current?.focus();
    }
  }, [open]);

  const modalTitle = `Xác nhận cập nhật ${revisionType === 'requirement' ? 'yêu cầu' : 'solution'}`;

  const isDiffEmpty =
    !diff ||
    (diff.before.trim() === diff.after.trim() && diff.before.trim().length === 0) ||
    diff.before.trim() === diff.after.trim();

  const diffLines = !isDiffEmpty && diff ? computeLineDiff(diff.before, diff.after) : [];

  const staleStepNames = staleStepIds.map((id) => STEP_LABELS[id] || id);
  const summaryText = `Cập nhật này sẽ làm stale ${staleStepIds.length} bước: ${staleStepNames.join(', ')}. Artifact cũ được giữ nguyên để đối chiếu.`;

  return (
    <Modal
      open={open}
      title={
        <Title
          level={4}
          ref={titleRef}
          tabIndex={-1}
          style={{ margin: 0, fontSize: 16, outline: 'none' }}
        >
          {modalTitle}
        </Title>
      }
      onCancel={onClose}
      width="min(720px, calc(100vw - 32px))"
      footer={[
        <Button key="cancel" onClick={onClose}>
          Tiếp tục thảo luận
        </Button>,
        <Button
          key="confirm"
          type="primary"
          onClick={() => void onConfirm()}
          disabled={loading}
          loading={loading}
        >
          Xác nhận cập nhật
        </Button>,
      ]}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
        {description}
        {/* Section 1: Diff preview */}
        <div>
          <Text strong style={{ fontSize: 14 }}>
            1. So sánh thay đổi (Diff)
          </Text>
          {isDiffEmpty ? (
            <Card
              size="small"
              style={{
                marginTop: 6,
                backgroundColor: token.colorFillAlter,
                borderColor: token.colorBorderSecondary,
              }}
            >
              <Text type="secondary">
                Không phát hiện thay đổi nội dung so với bản đang active.
              </Text>
            </Card>
          ) : (
            <div
              style={{
                marginTop: 6,
                maxHeight: 220,
                overflowY: 'auto',
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: token.borderRadius,
                fontFamily: 'monospace',
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              {diffLines.map((line, idx) => {
                const isAdded = line.type === 'added';
                const isRemoved = line.type === 'removed';
                const bg = isAdded
                  ? token.colorSuccessBg
                  : isRemoved
                    ? token.colorErrorBg
                    : token.colorBgContainer;
                const marker = isAdded ? '+' : isRemoved ? '−' : ' ';
                const color = isAdded
                  ? token.colorSuccess
                  : isRemoved
                    ? token.colorError
                    : token.colorText;

                return (
                  <div
                    key={idx}
                    style={{
                      backgroundColor: bg,
                      color,
                      padding: '2px 8px',
                      display: 'flex',
                      gap: 8,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    <span style={{ userSelect: 'none', width: 12, textAlign: 'center' }}>
                      {marker}
                    </span>
                    <span style={{ flex: 1 }}>{line.text}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Section 2: Sources */}
        <div>
          <Text strong style={{ fontSize: 14 }}>
            2. Nguồn dữ liệu căn cứ
          </Text>
          <div style={{ marginTop: 4 }}>
            {sources.length > 0 ? (
              <Text type="secondary" style={{ fontSize: 13 }}>
                Nguồn: {sources.length} tài liệu ·{' '}
                {sources.map((s) => s.title + (s.shortHash ? ` (${s.shortHash})` : '')).join(', ')}
              </Text>
            ) : (
              <Text type="secondary" style={{ fontSize: 13 }}>
                Không có tài liệu nguồn tham chiếu trực tiếp.
              </Text>
            )}
          </div>
        </div>

        {/* Section 3: Impact chain */}
        <div>
          <Text strong style={{ fontSize: 14 }}>
            3. Chuỗi tác động (Impact Chain)
          </Text>
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {staleStepIds.length > 0 ? (
              staleStepIds.map((stepId) => (
                <div
                  key={stepId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    borderRadius: token.borderRadiusSM,
                    backgroundColor: token.colorFillAlter,
                    border: `1px solid ${token.colorBorderSecondary}`,
                  }}
                >
                  <span style={{ fontSize: 13 }}>{STEP_LABELS[stepId] || stepId}</span>
                  <Tag color="warning">Cần cập nhật</Tag>
                </div>
              ))
            ) : (
              <Text type="secondary" style={{ fontSize: 13 }}>
                Không có bước nào bị ảnh hưởng.
              </Text>
            )}
          </div>
        </div>

        {/* Section 4: Summary */}
        <div
          style={{
            padding: '10px 12px',
            borderRadius: token.borderRadiusSM,
            backgroundColor: token.colorFillTertiary,
            border: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <Text style={{ fontSize: 13, color: token.colorTextSecondary }}>
            {summaryText}
          </Text>
        </div>
      </div>
    </Modal>
  );
};
