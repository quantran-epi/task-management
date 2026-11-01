import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Tag, theme } from 'antd';
import { CheckCircleOutlined, ClockCircleOutlined, ReloadOutlined, SyncOutlined } from '@ant-design/icons';
import type { SdlcArtifactRef } from '../../../services/wizard/workflowSchemas';
import type { ChangePackManifest, ChangePackValidationCode } from '../../../services/wizard/changePack';
import type { HubExportKind } from '../../../services/wizard/hubExport';
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

/** One shared signature for every step panel's export slot (UI-SPEC "DOCX Export Contract"). */
export type RenderExportRow = (kind: HubExportKind) => React.ReactNode;

export interface StepIntakePanelProps {
  pl01?: SdlcArtifactRef | undefined;
  pl02?: SdlcArtifactRef | undefined;
  renderExportRow?: RenderExportRow | undefined;
  onEditIntake?: (() => void) | undefined;
}

export const StepIntakePanel: React.FC<StepIntakePanelProps> = ({ pl01, pl02, renderExportRow, onEditIntake }) => {
  return (
    <PanelBlock>
      <ArtifactRow label="PL01 — Yêu cầu nghiệp vụ" artifact={pl01} missingCopy="Chưa có — bấm Nạp lại hồ sơ." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }} data-testid="export-slot-PL02">
        <ArtifactRow label="PL02 — Đặc tả chức năng" artifact={pl02} missingCopy="Chưa có — bấm Nạp lại hồ sơ." />
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
  /** Live draft from the chat; shown when the artifact has no content or the draft is newer. */
  draft?: string | undefined;
  stale: boolean;
  canSave: boolean;
  onSave?: (() => void) | undefined;
  saving?: boolean | undefined;
  savedNoteId?: string | undefined;
  onOpenNote?: ((noteId: string) => void) | undefined;
}

export const StepSolutionPanel: React.FC<StepSolutionPanelProps> = ({
  artifact,
  draft,
  canSave,
  onSave,
  saving = false,
  savedNoteId,
  onOpenNote,
}) => {
  const { token } = theme.useToken();
  const [expanded, setExpanded] = useState(false);
  const content = artifact?.content?.trim() || draft?.trim() || '';
  // Not `artifact.title`: it embeds the feature name, which the hub header already shows.
  const heading = artifact ? `Bản đang dùng — v${artifact.version}` : 'Bản nháp trong chat';

  return (
    <PanelBlock>
      <ArtifactRow
        label="SOLUTION.md"
        artifact={artifact}
        missingCopy="Chưa có — hỏi AI soạn SOLUTION.md trong khung chat."
      />

      {/* Reading the solution is the whole point of step 2; without this the panel only offered Save. */}
      {content && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            <span style={labelStyle(token.colorText)}>{heading}</span>
            <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setExpanded((prev) => !prev)}>
              {expanded ? 'Thu gọn' : 'Xem nội dung'}
            </Button>
          </div>
          {expanded && (
            <div
              data-testid="solution-preview"
              style={{
                maxHeight: 260,
                overflowY: 'auto',
                padding: '8px 10px',
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: token.borderRadiusSM,
                backgroundColor: token.colorBgContainer,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: 12,
                lineHeight: 1.5,
                fontFamily: 'monospace',
              }}
            >
              {content}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <Button
          type="primary"
          size="small"
          disabled={!canSave || saving}
          loading={saving}
          onClick={onSave}
        >
          Lưu SOLUTION.md
        </Button>
        {savedNoteId && !saving && (
          <Button type="link" size="small" style={{ padding: 0 }} onClick={() => onOpenNote?.(savedNoteId)}>
            Mở tài liệu đã lưu
          </Button>
        )}
      </div>
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

export type StepTechDocsState = 'blocked' | 'ready' | 'generating' | 'error';

export interface StepTechDocsPanelProps {
  pl03b?: SdlcArtifactRef | undefined;
  pl07?: SdlcArtifactRef | undefined;
  stale: boolean;
  state?: StepTechDocsState | undefined;
  errorMessage?: string | undefined;
  onGenerate?: (() => void) | undefined;
  onRetry?: (() => void) | undefined;
  renderExportRow?: RenderExportRow | undefined;
}

export const StepTechDocsPanel: React.FC<StepTechDocsPanelProps> = ({
  pl03b,
  pl07,
  stale,
  state = 'blocked',
  errorMessage,
  onGenerate,
  onRetry,
  renderExportRow,
}) => {
  const { token } = theme.useToken();
  const pl03bRowRef = useRef<HTMLDivElement>(null);
  const previousState = useRef<StepTechDocsState>(state);

  // The status line replaces the button's label, so focus is re-homed onto the artifact export.
  useEffect(() => {
    const from = previousState.current;
    previousState.current = state;
    if (from !== 'generating' || state !== 'ready') return;
    const row = pl03bRowRef.current;
    (row?.querySelector('button') ?? row)?.focus();
  }, [state]);

  const rows: Array<{ kind: 'PL03B' | 'PL07'; label: string; artifact: SdlcArtifactRef | undefined }> = [
    { kind: 'PL03B', label: 'PL03B — Tài liệu triển khai', artifact: pl03b },
    { kind: 'PL07', label: 'PL07 — Checklist review', artifact: pl07 },
  ];
  const rerun = stale || Boolean(pl03b) || Boolean(pl07);
  const generateLabel = rerun ? 'Tạo lại PL03B & PL07' : 'Tạo PL03B & PL07';

  return (
    <PanelBlock>
      {state === 'blocked' && (
        <span style={bodyStyle(token.colorTextSecondary)}>
          Cần SOLUTION.md và change-pack đã xác nhận trước khi sinh PL03B & PL07.
        </span>
      )}
      {state === 'generating' && (
        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 4, ...bodyStyle(token.colorTextSecondary) }}>
          <SyncOutlined spin aria-hidden style={{ color: token.colorPrimary }} />
          <span>Đang sinh PL03B & PL07…</span>
        </div>
      )}
      {state === 'error' && (
        <Alert
          type="error"
          showIcon
          message={errorMessage ?? 'Không sinh được PL03B & PL07. Kiểm tra SOLUTION.md và change-pack rồi thử lại.'}
        />
      )}
      {state === 'error' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
          <Button onClick={onRetry}>Thử lại</Button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
          <Button
            type="primary"
            disabled={state === 'blocked' || state === 'generating'}
            loading={state === 'generating'}
            onClick={onGenerate}
          >
            {generateLabel}
          </Button>
        </div>
      )}
      {rows.map((row) => (
        <div
          key={row.kind}
          ref={row.kind === 'PL03B' ? pl03bRowRef : undefined}
          tabIndex={row.kind === 'PL03B' ? -1 : undefined}
          style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
          data-testid={`export-slot-${row.kind}`}
        >
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

export type StepCabState = 'blocked' | 'ready' | 'generating' | 'error';

export interface StepCabPanelProps {
  cab?: SdlcArtifactRef | undefined;
  prerequisites: { pl02: boolean; pl03b: boolean; pl07: boolean };
  state?: StepCabState | undefined;
  onGenerate?: (() => void) | undefined;
  onRetry?: (() => void) | undefined;
  renderExportRow?: RenderExportRow | undefined;
}

export const StepCabPanel: React.FC<StepCabPanelProps> = ({
  cab,
  prerequisites,
  state = 'blocked',
  onGenerate,
  onRetry,
  renderExportRow,
}) => {
  const { token } = theme.useToken();
  const cabRowRef = useRef<HTMLDivElement>(null);
  const previousState = useRef<StepCabState>(state);

  // The status line replaces the button's label, so focus is re-homed onto the CAB export.
  useEffect(() => {
    const from = previousState.current;
    previousState.current = state;
    if (from !== 'generating' || state !== 'ready') return;
    const row = cabRowRef.current;
    (row?.querySelector('button') ?? row)?.focus();
  }, [state]);

  const rows: Array<{ label: string; present: boolean }> = [
    { label: 'PL02', present: prerequisites.pl02 },
    { label: 'PL03B', present: prerequisites.pl03b },
    { label: 'PL07', present: prerequisites.pl07 },
  ];
  const generateLabel = cab ? 'Tạo lại tờ trình CAB' : 'Tạo tờ trình CAB';

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

      {state === 'blocked' && (
        <span style={bodyStyle(token.colorTextSecondary)}>
          Cần PL02, PL03B và PL07 cùng dự án trước khi tạo tờ trình CAB.
        </span>
      )}
      {state === 'generating' && (
        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 4, ...bodyStyle(token.colorTextSecondary) }}>
          <SyncOutlined spin aria-hidden style={{ color: token.colorPrimary }} />
          <span>Đang tổng kết hồ sơ CAB…</span>
        </div>
      )}
      {state === 'error' && (
        <Alert
          type="error"
          showIcon
          message="Thiếu chuỗi PL02/PL03B/PL07 cùng dự án và thread; chưa thể tạo CAB."
        />
      )}

      {state === 'error' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
          <Button onClick={onRetry}>Thử lại</Button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
          <Button
            type="primary"
            disabled={state === 'blocked' || state === 'generating'}
            loading={state === 'generating'}
            onClick={onGenerate}
          >
            {generateLabel}
          </Button>
        </div>
      )}

      <div
        ref={cabRowRef}
        tabIndex={-1}
        style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
        data-testid="export-slot-CAB"
      >
        <ArtifactRow label="Tờ trình CAB" artifact={cab} missingCopy="Chưa có — bấm Tạo tờ trình CAB." />
        {cab ? renderExportRow?.('CAB') : null}
      </div>
    </PanelBlock>
  );
};
