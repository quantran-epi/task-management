import React from 'react';
import { Button, Tag, theme } from 'antd';
import { CheckCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import type { SdlcArtifactRef } from '../../../services/wizard/workflowSchemas';
import type { ReconciliationResult } from '../../../services/wizard/reconciliation';
import { DriftMatrixView } from './DriftMatrixView';

/**
 * Shared action lifecycle for a hub panel action (confirm pack, generate docs, export).
 * Later plans consume this; the panels below are presentation-only.
 */
export type HubPanelActionState = 'idle' | 'busy' | 'error';

const labelStyle = (color: string): React.CSSProperties => ({
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1.4,
  color,
});

const bodyStyle = (color: string): React.CSSProperties => ({
  fontSize: 14,
  fontWeight: 400,
  lineHeight: 1.5,
  color,
  wordBreak: 'break-word',
});

interface ArtifactRowProps {
  label: string;
  artifact?: SdlcArtifactRef | undefined;
  missingCopy: string;
}

const ArtifactRow: React.FC<ArtifactRowProps> = ({ label, artifact, missingCopy }) => {
  const { token } = theme.useToken();
  if (!artifact) {
    return <div style={bodyStyle(token.colorTextSecondary)}>{missingCopy}</div>;
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
      <span style={labelStyle(token.colorText)}>{label}</span>
      <Tag color="blue" style={{ margin: 0, fontWeight: 600, fontSize: 12 }}>
        v{artifact.version}
      </Tag>
      <span style={bodyStyle(token.colorTextSecondary)}>{(artifact.approvedAt ?? artifact.updatedAt).slice(0, 10)}</span>
    </div>
  );
};

const PanelBlock: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
);

export interface StepIntakePanelProps {
  pl01?: SdlcArtifactRef | undefined;
  pl02?: SdlcArtifactRef | undefined;
  renderExportRow?: ((kind: 'PL02') => React.ReactNode) | undefined;
  onEditIntake?: (() => void) | undefined;
}

export const StepIntakePanel: React.FC<StepIntakePanelProps> = ({ pl01, pl02, renderExportRow, onEditIntake }) => {
  return (
    <PanelBlock>
      <ArtifactRow label="PL01 — Yêu cầu nghiệp vụ" artifact={pl01} missingCopy="Chưa có — bấm Sửa PL01/PL02." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }} data-testid="export-slot-PL02">
        <ArtifactRow label="PL02 — Đặc tả chức năng" artifact={pl02} missingCopy="Chưa có — bấm Sửa PL01/PL02." />
        {renderExportRow?.('PL02')}
      </div>
      <Button size="small" onClick={onEditIntake} style={{ alignSelf: 'flex-start' }}>
        Sửa PL01/PL02
      </Button>
    </PanelBlock>
  );
};

export interface StepSolutionPanelProps {
  artifact?: SdlcArtifactRef | undefined;
  stale: boolean;
  canSave: boolean;
  onSave?: (() => void) | undefined;
  saving?: boolean | undefined;
  savedNoteId?: string | undefined;
}

export const StepSolutionPanel: React.FC<StepSolutionPanelProps> = ({
  artifact,
  canSave,
  onSave,
  saving = false,
  savedNoteId,
}) => {
  const { token } = theme.useToken();
  return (
    <PanelBlock>
      <ArtifactRow
        label="SOLUTION.md"
        artifact={artifact}
        missingCopy="Chưa có — hỏi AI soạn SOLUTION.md trong khung chat."
      />
      <Button
        type="primary"
        size="small"
        disabled={!canSave || saving}
        loading={saving}
        onClick={onSave}
        style={{ alignSelf: 'flex-start' }}
      >
        Lưu SOLUTION.md
      </Button>
      {savedNoteId && !saving && (
        <span style={{ fontSize: 12, fontWeight: 400, color: token.colorSuccess }}>Đã lưu vào tài liệu dự án</span>
      )}
    </PanelBlock>
  );
};

export interface StepChangePackPanelProps {
  artifact?: SdlcArtifactRef | undefined;
  driftResult?: ReconciliationResult | undefined;
  stale: boolean;
  cr?: string | undefined;
}

export const StepChangePackPanel: React.FC<StepChangePackPanelProps> = ({ artifact, driftResult, cr }) => {
  const { token } = theme.useToken();
  // ponytail: step-4 upload/confirm states land in 25.1.1-04
  return (
    <PanelBlock>
      {artifact ? (
        <span role="status" style={{ fontSize: 12, fontWeight: 400, color: token.colorTextSecondary }}>
          Đã nạp change-pack {cr ?? artifact.title}
        </span>
      ) : (
        <span style={bodyStyle(token.colorTextSecondary)}>Chưa nạp change-pack — kéo thả change-pack.zip để đối chiếu.</span>
      )}
      {driftResult && <DriftMatrixView result={driftResult} layout="stacked" />}
    </PanelBlock>
  );
};

export interface StepTechDocsPanelProps {
  pl03b?: SdlcArtifactRef | undefined;
  pl07?: SdlcArtifactRef | undefined;
  stale: boolean;
  renderExportRow?: ((kind: 'PL03B' | 'PL07') => React.ReactNode) | undefined;
}

export const StepTechDocsPanel: React.FC<StepTechDocsPanelProps> = ({ pl03b, pl07, renderExportRow }) => {
  const rows: Array<{ kind: 'PL03B' | 'PL07'; label: string; artifact: SdlcArtifactRef | undefined }> = [
    { kind: 'PL03B', label: 'PL03B — Tài liệu triển khai', artifact: pl03b },
    { kind: 'PL07', label: 'PL07 — Checklist review', artifact: pl07 },
  ];
  return (
    <PanelBlock>
      {rows.map((row) => (
        <div key={row.kind} style={{ display: 'flex', flexDirection: 'column', gap: 4 }} data-testid={`export-slot-${row.kind}`}>
          <ArtifactRow
            label={row.label}
            artifact={row.artifact}
            missingCopy="Chưa có — bấm Tạo PL03B & PL07."
          />
          {renderExportRow?.(row.kind)}
        </div>
      ))}
    </PanelBlock>
  );
};

export interface StepCabPanelProps {
  cab?: SdlcArtifactRef | undefined;
  prerequisites: { pl02: boolean; pl03b: boolean; pl07: boolean };
  renderExportRow?: ((kind: 'CAB') => React.ReactNode) | undefined;
}

export const StepCabPanel: React.FC<StepCabPanelProps> = ({ cab, prerequisites, renderExportRow }) => {
  const { token } = theme.useToken();
  const rows: Array<{ label: string; present: boolean }> = [
    { label: 'PL02', present: prerequisites.pl02 },
    { label: 'PL03B', present: prerequisites.pl03b },
    { label: 'PL07', present: prerequisites.pl07 },
  ];
  return (
    <PanelBlock>
      <span style={labelStyle(token.colorText)}>Điều kiện tạo CAB</span>
      {rows.map((row) => (
        <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {row.present ? (
            <CheckCircleOutlined style={{ color: token.colorSuccess }} aria-hidden />
          ) : (
            <ClockCircleOutlined style={{ color: token.colorTextQuaternary }} aria-hidden />
          )}
          <span style={labelStyle(token.colorText)}>{row.label}</span>
          <span style={bodyStyle(token.colorTextSecondary)}>{row.present ? 'Đã có' : 'Chưa có'}</span>
        </div>
      ))}
      {cab ? (
        <ArtifactRow label="Tờ trình CAB" artifact={cab} missingCopy="Chưa có — bấm Tạo tờ trình CAB." />
      ) : (
        <span style={bodyStyle(token.colorTextSecondary)}>Chưa có — bấm Tạo tờ trình CAB.</span>
      )}
      <div data-testid="export-slot-CAB">{renderExportRow?.('CAB')}</div>
    </PanelBlock>
  );
};
