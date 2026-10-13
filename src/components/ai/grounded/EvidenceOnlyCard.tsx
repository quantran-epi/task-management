import React from 'react';
import { Alert, Button } from 'antd';
import type {
  ChatMessageGrounding,
  PersistedCitation,
} from '../../../services/ai/groundedAnswerSchemas';
import { GroundedBanner } from './GroundedBanner';

export interface EvidenceOnlyCardProps {
  grounding: ChatMessageGrounding;
  onSynthesizeFromStored: () => void;
  onCitationActivate?: ((c: PersistedCitation) => void) | undefined;
  isSynthesizing?: boolean | undefined;
  synthesisError?: {
    message: string;
    requiresConfig: boolean;
  } | null | undefined;
  onConfigRepair?: (() => void) | undefined;
  sourcesSlot?: React.ReactNode | undefined;
  pathsSlot?: React.ReactNode | undefined;
}

/**
 * EvidenceOnlyCard renders model-unavailable evidence state (D-43 / D-44).
 * Allows the user to view ranked evidence and trigger synthesis from stored evidence.
 */
export const EvidenceOnlyCard: React.FC<EvidenceOnlyCardProps> = ({
  grounding: _grounding,
  onSynthesizeFromStored,
  isSynthesizing = false,
  synthesisError,
  onConfigRepair,
  sourcesSlot,
  pathsSlot,
}) => {
  return (
    <div className="evidence-only-card" style={{ marginTop: 8 }}>
      <GroundedBanner
        variant="model-unavailable"
        repairCta={{
          label: isSynthesizing ? 'Đang tạo câu trả lời...' : 'Tạo câu trả lời từ bằng chứng',
          onClick: onSynthesizeFromStored,
          loading: isSynthesizing,
          disabled: isSynthesizing,
        }}
      />
      {synthesisError && (
        <Alert
          type="error"
          showIcon
          message="Không thể tạo câu trả lời từ bằng chứng"
          description={synthesisError.message}
          action={
            synthesisError.requiresConfig && onConfigRepair ? (
              <Button size="small" onClick={onConfigRepair}>
                Cài đặt
              </Button>
            ) : (
              <Button size="small" onClick={onSynthesizeFromStored}>
                Thử lại
              </Button>
            )
          }
          style={{ marginBottom: 12 }}
        />
      )}
      {pathsSlot}
      {sourcesSlot}
    </div>
  );
};
