import React from 'react';
import { Alert, Button, Space, Typography } from 'antd';
import { WarningOutlined, ArrowRightOutlined } from '@ant-design/icons';
import type { SdlcStepId } from '../../../services/wizard/workflowSchemas';
import { detectWorkflowStaleness } from '../../../services/wizard/stalenessDetector';
import type { SdlcWorkflowState } from '../../../services/wizard/workflowSchemas';

export interface SdlcStaleBannerProps {
  currentStep: SdlcStepId;
  workflowState?: SdlcWorkflowState;
  onNavigateToStep: (step: SdlcStepId) => void;
}

const STEP_LABELS: Record<SdlcStepId, string> = {
  INTAKE: 'Bước 1: Nạp hồ sơ',
  SOLUTION: 'Bước 2: Giải pháp (SOLUTION.md)',
  CODE_GUIDE: 'Bước 3: Hướng dẫn code',
  CHANGE_PACK: 'Bước 4: Đối chiếu Change Pack & Drift',
  TECH_DOCS: 'Bước 5: Tài liệu kỹ thuật (PL03B & PL07)',
  CAB: 'Bước 6: Tờ trình CAB',
};

export const SdlcStaleBanner: React.FC<SdlcStaleBannerProps> = ({
  currentStep,
  workflowState,
  onNavigateToStep,
}) => {
  if (!workflowState) return null;

  const staleness = detectWorkflowStaleness(workflowState);
  const isCurrentStale = staleness.staleSteps.includes(currentStep);
  const hasStaleSteps = staleness.staleSteps.length > 0;

  if (!hasStaleSteps && !isCurrentStale) {
    return null;
  }

  // Determine the primary step needing action
  // If current step is stale, resolve current step first; otherwise pick earliest stale step
  const targetStep: SdlcStepId = isCurrentStale ? currentStep : staleness.staleSteps[0]!;
  const reason = staleness.reasons[targetStep] || 'Dữ liệu đầu vào hoặc tài liệu tiền đề đã thay đổi.';

  return (
    <div style={{ marginBottom: 16 }} data-testid="sdlc-stale-banner">
      <Alert
        type="warning"
        showIcon
        icon={<WarningOutlined />}
        message={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <Typography.Text strong style={{ marginRight: 8 }}>
                {isCurrentStale ? `Cảnh báo bước hiện tại (${STEP_LABELS[currentStep]}) cần cập nhật` : 'Quy trình có bước bị lệch dữ liệu'}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                {reason}
              </Typography.Text>
            </div>
            {targetStep !== currentStep && (
              <Button
                type="primary"
                size="small"
                icon={<ArrowRightOutlined />}
                onClick={() => onNavigateToStep(targetStep)}
                data-testid="stale-navigate-button"
              >
                Chuyển đến {STEP_LABELS[targetStep]}
              </Button>
            )}
          </div>
        }
      />
    </div>
  );
};
