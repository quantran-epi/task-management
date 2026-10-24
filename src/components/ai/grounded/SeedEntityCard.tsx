import React from 'react';
import { Button, Tag, theme } from 'antd';
import type { PersistedEntityRef } from '../../../services/ai/groundedAnswerSchemas';
import type { GraphRetainedCounts } from '../../../services/knowledge/retrievalProtocol';

const KIND_LABELS: Readonly<Record<string, string>> = {
  DatabaseObject: 'Đối tượng dữ liệu',
  SoftwareComponent: 'Thành phần phần mềm',
  ScheduledProcess: 'Tiến trình định kỳ',
  ProcessStep: 'Bước xử lý',
  ContainerStep: 'Bước xử lý',
  CycleType: 'Kiểu chu kỳ',
  Status: 'Trạng thái',
  Document: 'Tài liệu',
  SourceDocument: 'Tài liệu',
};

export interface SeedEntityCardProps {
  entity: PersistedEntityRef;
  graphCounts: GraphRetainedCounts;
  onFindRelated: (entity: PersistedEntityRef) => void;
  isFindingRelated: boolean;
}

/**
 * One resolved seed entity for SEED_ONLY (D-02, D-03).
 * Identity is server-validated; every label renders as React text (T-24-13).
 */
export const SeedEntityCard: React.FC<SeedEntityCardProps> = ({
  entity,
  graphCounts,
  onFindRelated,
  isFindingRelated,
}) => {
  const { token } = theme.useToken();
  const kindLabel = KIND_LABELS[entity.kind] ?? entity.kind;
  const countsLine = `Thực thể: ${graphCounts.entity} · Cạnh: ${graphCounts.edge} · Đường dẫn: ${graphCounts.path}`;

  return (
    <div
      className="seed-entity-card"
      aria-label={`${kindLabel} ${entity.canonicalName}, định danh ${entity.urn}`}
      tabIndex={0}
      style={{
        background: token.colorFillTertiary,
        borderRadius: token.borderRadius,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        fontSize: 14,
        lineHeight: 1.5,
        color: token.colorText,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600 }}>{entity.canonicalName}</span>
        <Tag
          color="processing"
          style={{
            margin: 0,
            fontSize: 12,
            fontWeight: 600,
            lineHeight: '17px',
            borderColor: token.colorPrimaryBorder,
            color: token.colorPrimary,
          }}
        >
          Loại: {kindLabel}
        </Tag>
        {entity.evidenceClass && (
          <Tag color="success" style={{ margin: 0, fontSize: 12, fontWeight: 600 }}>
            {entity.evidenceClass}
          </Tag>
        )}
      </div>
      <code
        style={{
          fontSize: 12,
          background: token.colorFillTertiary,
          borderRadius: 4,
          padding: '2px 4px',
          wordBreak: 'break-all',
          color: token.colorTextSecondary,
        }}
      >
        Định danh: {entity.urn}
      </code>
      <div aria-label={countsLine} style={{ fontSize: 12, fontWeight: 600 }}>
        {countsLine}
      </div>
      <div>
        <Button
          type="primary"
          size="small"
          loading={isFindingRelated}
          disabled={isFindingRelated}
          onClick={() => onFindRelated(entity)}
        >
          Tìm liên quan
        </Button>
      </div>
    </div>
  );
};
