import React from 'react';
import { theme } from 'antd';
import type { WizardSnapshot, WizardStatus } from '../../../services/ai/wizardSchemas';

const STEPS = ['Thu thập', 'Hỏi bù', 'Soát xét', 'Xuất bản'] as const;

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

export interface WizardProgressStripProps {
  snapshot: Pick<WizardSnapshot, 'status'>;
}

export const WizardProgressStrip: React.FC<WizardProgressStripProps> = ({ snapshot }) => {
  const { token } = theme.useToken();
  const currentStep = stepForStatus(snapshot.status);
  const currentLabel = STEPS[currentStep - 1];
  const valueText = `Bước ${currentStep}/4 · ${currentLabel}`;

  return (
    <div
      role="progressbar"
      aria-label="Tiến độ wizard tài liệu"
      aria-valuemin={1}
      aria-valuemax={4}
      aria-valuenow={currentStep}
      aria-valuetext={valueText}
      style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: token.colorText }}>{valueText}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
        {STEPS.map((label, index) => {
          const step = index + 1;
          const complete = step < currentStep;
          const active = step === currentStep;
          return (
            <div
              key={label}
              data-testid="wizard-progress-segment"
              aria-label={`Bước ${step}/4 — ${label}`}
              style={{
                minWidth: 0,
                borderTop: `3px solid ${complete ? token.colorSuccess : active ? token.colorPrimary : token.colorBorderSecondary}`,
                paddingTop: 4,
                color: active ? token.colorPrimary : token.colorTextSecondary,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
              <span style={{ display: 'block', fontWeight: 400, marginTop: 2 }}>{complete ? 'Hoàn thành' : active ? 'Đang thực hiện' : 'Chờ'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
