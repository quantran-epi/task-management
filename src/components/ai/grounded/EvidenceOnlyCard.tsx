import React from 'react';
import type {
  ChatMessageGrounding,
  PersistedCitation,
} from '../../../services/ai/groundedAnswerSchemas';
import { GroundedBanner } from './GroundedBanner';

export interface EvidenceOnlyCardProps {
  grounding: ChatMessageGrounding;
  onSynthesizeFromStored: () => void;
  onCitationActivate?: ((c: PersistedCitation) => void) | undefined;
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
  sourcesSlot,
  pathsSlot,
}) => {
  return (
    <div className="evidence-only-card" style={{ marginTop: 8 }}>
      <GroundedBanner
        variant="model-unavailable"
        repairCta={{
          label: 'Tạo câu trả lời từ bằng chứng',
          onClick: onSynthesizeFromStored,
        }}
      />
      {pathsSlot}
      {sourcesSlot}
    </div>
  );
};
