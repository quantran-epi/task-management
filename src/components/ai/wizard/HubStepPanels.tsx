import React, { useEffect, useRef } from 'react';
import { Alert, Button, Tag, theme } from 'antd';
import { CheckCircleOutlined, ClockCircleOutlined, ReloadOutlined, SyncOutlined } from '@ant-design/icons';
import type { SdlcArtifactRef } from '../../../services/wizard/workflowSchemas';
import type { ChangePackManifest, ChangePackValidationCode } from '../../../services/wizard/changePack';
import type { ReconciliationResult } from '../../../services/wizard/reconciliation';
import { ChangePackConfirmStrip, ERROR_COPY } from './ChangePackConfirmStrip';
import { ChangePackDropzone } from './ChangePackDropzone';
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

/** Step-4 draft state. Ephemeral: it never reaches Dexie and resets on tab change. */
export type HubChangePackDraft =
  | { status: 'idle' }
  | { status: 'validating' }
  | { status: 'invalid'; code: ChangePackValidationCode }
  | { status: 'pending'; manifest: Readonly<ChangePackManifest> }
  | { status: 'confirming'; manifest: Readonly<ChangePackManifest> };

export interface StepChangePackPanelProps {
  artifact?: SdlcArtifactRef | undefined;
  driftResult?: ReconciliationResult | undefined;
  stale: boolean;
  cr?: string | undefined;
  draft?: HubChangePackDraft | undefined;
  disabled?: boolean | undefined;
  onSelectFile?: ((file: File) => void) | undefined;
  onConfirm?: ((manifest: Readonly<ChangePackManifest>) => void) | undefined;
  onReplace?: (() => void) | undefined;
  onRerun?: (() => void) | undefined;
}

export const StepChangePackPanel: React.FC<StepChangePackPanelProps> = ({
  artifact,
  driftResult,
  stale,
  cr,
  draft = { status: 'idle' },
  disabled = false,
  onSelectFile,
  onConfirm,
  onReplace,
  onRerun,
}) => {
  const { token } = theme.useToken();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const replaceRef = useRef<HTMLButtonElement>(null);
  const matrixHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousStatus = useRef<HubChangePackDraft['status']>(draft.status);

  // The dropzone leaves the DOM as soon as a result exists, so focus has to be re-homed.
  useEffect(() => {
    const from = previousStatus.current;
    previousStatus.current = draft.status;
    if (from === draft.status) return;
    if (draft.status === 'pending') confirmRef.current?.focus();
    else if (draft.status === 'invalid') replaceRef.current?.focus();
    else if (draft.status === 'idle' && (from === 'confirming' || from === 'pending')) {
      // A successful confirm renders the committed matrix; a cancel returns to the dropzone.
      (artifact ? matrixHeadingRef.current : null)?.focus();
    }
  }, [draft.status, artifact]);

  const statusRow = (copy: string) => (
    <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 4, ...bodyStyle(token.colorTextSecondary) }}>
      <SyncOutlined spin aria-hidden style={{ color: token.colorPrimary }} />
      <span>{copy}</span>
    </div>
  );

  const committed = Boolean(artifact) && draft.status !== 'pending' && draft.status !== 'confirming';

  return (
    <PanelBlock>
      {stale && (
        <Alert
          type="warning"
          showIcon
          message="Tài liệu cũ (stale) — chỉ đọc để đối chiếu, không dùng làm căn cứ cho bước mới."
        />
      )}

      {draft.status === 'validating' && statusRow('Đang kiểm tra change-pack…')}

      {draft.status === 'invalid' && (
        <>
          <Alert type="error" showIcon message={ERROR_COPY[draft.code]} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
            <Button ref={replaceRef} onClick={onReplace}>
              Chọn pack khác
            </Button>
          </div>
        </>
      )}

      {draft.status === 'pending' && (
        <ChangePackConfirmStrip
          result={{ status: 'valid', manifest: draft.manifest }}
          disabled={disabled}
          confirmButtonRef={confirmRef}
          replaceButtonRef={replaceRef}
          onConfirm={(manifest) => onConfirm?.(manifest)}
          onReplace={() => onReplace?.()}
        />
      )}

      {draft.status === 'confirming' && (
        <>
          <ChangePackConfirmStrip
            result={{ status: 'valid', manifest: draft.manifest }}
            confirming
            disabled={disabled}
            confirmButtonRef={confirmRef}
            replaceButtonRef={replaceRef}
            onConfirm={(manifest) => onConfirm?.(manifest)}
            onReplace={() => onReplace?.()}
          />
          {statusRow('Đang đối chiếu với SOLUTION.md…')}
        </>
      )}

      {committed && (
        <span role="status" style={{ fontSize: 12, fontWeight: 400, lineHeight: 1.4, color: token.colorTextSecondary }}>
          Đã nạp change-pack {cr ?? artifact?.title}
        </span>
      )}

      {committed && driftResult && (
        <DriftMatrixView
          result={driftResult}
          layout="stacked"
          headingRef={matrixHeadingRef}
          headingTabIndex={-1}
        />
      )}

      {committed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
          <Button onClick={onReplace}>Chọn pack khác</Button>
          {stale && onRerun && (
            <Button danger icon={<ReloadOutlined aria-hidden />} onClick={onRerun}>
              Cập nhật lại
            </Button>
          )}
        </div>
      )}

      {draft.status === 'idle' && !artifact && <ChangePackDropzone onSelect={(file) => onSelectFile?.(file)} />}
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
