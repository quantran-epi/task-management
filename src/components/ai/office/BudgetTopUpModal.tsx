import React, { useEffect, useState } from 'react';
import { Button, Descriptions, InputNumber, Modal, useAntdToken, DescriptionsItem } from '../../ui';

export type BudgetTopUpScope =
  | { kind: 'agent'; name: string }
  | { kind: 'team'; name: string };

export interface BudgetTopUpModalProps {
  open: boolean;
  scope: BudgetTopUpScope;
  used: number;
  budget: number;
  /** D-04/D-05: the resolved percentage — never a literal. */
  thresholdPct: number;
  onCancel: () => void;
  onConfirm: (amount: number) => void;
}

/**
 * UI-SPEC §8b top-up dialog. A wait-state surface like the paused banner: the
 * waiting state is carried by copy and numbers, never by an animated placeholder.
 */
export const BudgetTopUpModal: React.FC<BudgetTopUpModalProps> = ({
  open,
  scope,
  used,
  budget,
  thresholdPct,
  onCancel,
  onConfirm,
}) => {
  const { token } = useAntdToken();
  const [amount, setAmount] = useState<number | null>(null);

  useEffect(() => {
    if (open) setAmount(null);
  }, [open]);

  const added = amount ?? 0;
  const scopeLine = scope.kind === 'agent' ? `Nhân viên: ${scope.name}` : `Nhóm: ${scope.name}`;

  return (
    <Modal
      width={480}
      title="Cấp thêm token"
      open={open}
      onCancel={onCancel}
      data-testid="budget-topup-modal"
      footer={[
        <Button key="cancel" onClick={onCancel}>
          Hủy
        </Button>,
        <Button
          key="confirm"
          type="primary"
          disabled={added < 1000}
          onClick={() => onConfirm(added)}
          data-testid="budget-topup-confirm"
        >
          Cấp thêm token
        </Button>,
      ]}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-12)' }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{scopeLine}</div>

        <Descriptions size="small" column={1}>
          <DescriptionsItem label="Đã dùng">{used.toLocaleString()} token</DescriptionsItem>
          <DescriptionsItem label="Ngân sách hiện tại">
            {budget.toLocaleString()} token
          </DescriptionsItem>
          <DescriptionsItem label={`Ngưỡng cảnh báo (${thresholdPct}%)`}>
            {Math.round((budget * thresholdPct) / 100).toLocaleString()} token
          </DescriptionsItem>
        </Descriptions>

        <div>
          <div style={{ fontSize: 'var(--font-size-small)', color: token.colorTextSecondary, marginBottom: 4 }}>
            Token cấp thêm
          </div>
          <InputNumber
            min={1000}
            step={1000}
            style={{ width: '100%' }}
            value={amount}
            onChange={(value) => setAmount(typeof value === 'number' ? value : null)}
            formatter={(value) => `${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={(value) => Number((value ?? '').replace(/,/g, ''))}
            aria-label="Token cấp thêm"
          />
        </div>

        <div style={{ fontSize: 'var(--font-size-small)', color: token.colorTextSecondary }}>
          {`Ngân sách mới: ${(budget + added).toLocaleString()} token — lượt chạy tiếp tục ngay sau khi xác nhận.`}
        </div>
      </div>
    </Modal>
  );
};

export default BudgetTopUpModal;
