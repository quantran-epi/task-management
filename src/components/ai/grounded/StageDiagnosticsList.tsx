import React from 'react';
import { Tag, Typography, theme } from 'antd';
import type {
  StageDiagnostic,
  StageName,
} from '../../../services/knowledge/retrievalProtocol';
import { ReasonCodeChip } from './ReasonCodeChip';

const { Text } = Typography;

const STAGE_LABELS: Readonly<Record<StageName, string>> = {
  entity_resolution: 'Phân giải thực thể',
  planning: 'Lập kế hoạch',
  validation: 'Kiểm tra kế hoạch',
  neo4j_traversal: 'Truy vấn Neo4j',
  fusion: 'Hợp nhất kết quả',
  rendering: 'Hiển thị',
};

function renderStatusTag(status: string) {
  if (status === 'ok') {
    return <Tag color="success" style={{ margin: 0, fontSize: 11, fontWeight: 600 }}>OK</Tag>;
  }
  if (status === 'degraded' || status === 'truncated') {
    return (
      <Tag color="warning" style={{ margin: 0, fontSize: 11, fontWeight: 600 }}>
        {status.toUpperCase()}
      </Tag>
    );
  }
  return (
    <Tag color="error" style={{ margin: 0, fontSize: 11, fontWeight: 600 }}>
      {status.toUpperCase()}
    </Tag>
  );
}

export interface StageDiagnosticsListProps {
  stages: readonly StageDiagnostic[];
}

/**
 * Content-free per-stage diagnostics (D-19, D-20, T-24-12).
 * Renders typed enum values, timings, counts, and booleans only; the props
 * accept no free-text field and no arbitrary key iteration.
 */
export const StageDiagnosticsList: React.FC<StageDiagnosticsListProps> = ({ stages }) => {
  const { token } = theme.useToken();

  if (stages.length === 0) return null;

  return (
    <div className="stage-diagnostics-list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {stages.map((stage) => (
        <div
          key={stage.stage}
          style={{
            padding: '6px 8px',
            borderRadius: token.borderRadiusSM,
            background: token.colorFillTertiary,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: token.colorText }}>
              {STAGE_LABELS[stage.stage]}
            </span>
            {renderStatusTag(stage.status)}
            <Text type="secondary" style={{ fontSize: 12 }}>
              {stage.latencyMs}ms · {stage.accepted} chấp nhận / {stage.rejected} loại bỏ
            </Text>
            {stage.truncated && (
              <Tag color="warning" style={{ margin: 0, fontSize: 12, fontWeight: 600 }}>
                Đã cắt bớt
              </Tag>
            )}
            {stage.fallback && (
              <Tag color="warning" style={{ margin: 0, fontSize: 12, fontWeight: 600 }}>
                Dùng phạm vi dự phòng
              </Tag>
            )}
          </div>
          {(stage.reasonCodes.length > 0 ||
            (stage.fallback && stage.fallbackReason)) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {stage.reasonCodes.map((code) => (
                <ReasonCodeChip key={code} code={code} />
              ))}
              {stage.fallback &&
                stage.fallbackReason &&
                !stage.reasonCodes.includes(stage.fallbackReason) && (
                  <ReasonCodeChip code={stage.fallbackReason} />
                )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
