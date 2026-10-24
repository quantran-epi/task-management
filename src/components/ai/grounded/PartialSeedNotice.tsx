import React from 'react';
import { Button, theme } from 'antd';
import type { FailedSeed } from '../../../services/knowledge/retrievalProtocol';
import { ReasonCodeChip } from './ReasonCodeChip';

export interface PartialSeedNoticeProps {
  failedSeeds: readonly FailedSeed[];
  onOpenDiagnostics: () => void;
}

/**
 * Partial-seed disclosure (D-13). Valid evidence plus this notice render
 * together; failures are never hidden and never replace the answer.
 * role="status" is informational, not an alert (24-UI-SPEC Accessibility).
 */
export const PartialSeedNotice: React.FC<PartialSeedNoticeProps> = ({
  failedSeeds,
  onOpenDiagnostics,
}) => {
  const { token } = theme.useToken();
  const shown = failedSeeds.slice(0, 5);

  return (
    <div
      role="status"
      className="partial-seed-notice"
      style={{
        background: token.colorFillTertiary,
        borderRadius: token.borderRadius,
        padding: 8,
        marginBottom: 8,
        fontSize: 12,
        lineHeight: 1.4,
        color: token.colorText,
      }}
    >
      <div>
        Không phân giải được {failedSeeds.length} thực thể:{' '}
        {shown.map((seed) => seed.urn).join(', ')}. Kết quả bên dưới chỉ từ các thực thể hợp lệ.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
        {shown.map((seed) => (
          <ReasonCodeChip key={seed.urn} code={seed.reasonCode} />
        ))}
      </div>
      <Button
        type="link"
        size="small"
        onClick={onOpenDiagnostics}
        style={{ padding: 0, height: 'auto', marginTop: 4, fontSize: 12 }}
      >
        Xem chi tiết chẩn đoán
      </Button>
    </div>
  );
};
