import React, { useState } from 'react';
import { Button, Modal, theme } from 'antd';
import type { WizardSnapshot, WizardStatus } from '../../../services/ai/wizardSchemas';

function stepForStatus(status: WizardStatus): number {
  switch (status) {
    case 'gap_fill':
      return 2;
    case 'review':
      return 3;
    case 'approved':
    case 'exporting':
    case 'completed':
      return 4;
    default:
      return 1;
  }
}

export interface WizardLifecycleBarProps {
  formName: string;
  snapshot: Pick<WizardSnapshot, 'status'>;
  restored?: boolean | undefined;
  onAbandon: () => void;
}

export const WizardLifecycleBar: React.FC<WizardLifecycleBarProps> = ({
  formName,
  snapshot,
  restored = false,
  onAbandon,
}) => {
  const { token } = theme.useToken();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const step = stepForStatus(snapshot.status);

  return (
    <div
      style={{
        borderTop: `1px solid ${token.colorBorderSecondary}`,
        padding: '8px 0',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 28 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: token.colorText }}>{formName}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: token.colorTextSecondary }}>Bước {step}/4</span>
        <Button
          type="text"
          danger
          size="small"
          onClick={() => setConfirmOpen(true)}
          style={{ marginLeft: 'auto', minHeight: 28, fontSize: 12, fontWeight: 600 }}
        >
          Hủy Wizard
        </Button>
      </div>
      {restored && (
        <div role="status" style={{ color: token.colorWarningText, fontSize: 14, lineHeight: 1.5 }}>
          Wizard đang tiếp tục từ bản nháp. Bấm Hủy Wizard để bắt đầu lại.
        </div>
      )}
      <Modal
        open={confirmOpen}
        title="Hủy Wizard"
        onCancel={() => setConfirmOpen(false)}
        closable={false}
        maskClosable={false}
        keyboard
        footer={[
          <Button key="continue" onClick={() => setConfirmOpen(false)}>Tiếp tục làm</Button>,
          <Button
            key="abandon"
            danger
            type="primary"
            onClick={() => {
              setConfirmOpen(false);
              onAbandon();
            }}
          >
            Hủy phiên
          </Button>,
        ]}
      >
        <p style={{ color: token.colorText, fontSize: 14, lineHeight: 1.5, margin: 0 }}>
          Hủy phiên wizard? Bản nháp hiện tại vẫn được giữ trong thread và có thể tiếp tục sau.
        </p>
      </Modal>
    </div>
  );
};
