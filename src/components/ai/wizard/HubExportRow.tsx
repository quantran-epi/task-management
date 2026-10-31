import React from 'react';
import { Alert, Button, theme } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { WizardSavedNoteBanner } from './WizardSavedNoteBanner';

export type HubExportRowPhase = 'idle' | 'building' | 'saved' | 'saved_download_failed' | 'failed';

export interface HubExportRowProps {
  kind: 'PL02' | 'PL03B' | 'PL07' | 'CAB';
  label: string;
  phase: HubExportRowPhase;
  filename?: string | undefined;
  sizeBytes?: number | undefined;
  noteId?: string | undefined;
  onExport: () => void;
  onRetry: () => void;
}

const FAILURE_COPY =
  'Không tạo được tệp .docx. Nội dung Markdown vẫn được giữ trong phiên; thử lại hoặc yêu cầu chỉnh sửa.';

/** Same rule as `DocumentPreviewCard.formatSize`. */
function formatSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  return `${(sizeBytes / 1024).toFixed(1)} KB`;
}

/**
 * Per-artifact `.docx` export control for the hub step panels.
 *
 * The row never claims `Đã lưu` before the Note id is known: `noteSaved` is gated on `noteId`, so a
 * failed Note write cannot read as a saved document.
 */
export const HubExportRow: React.FC<HubExportRowProps> = ({
  kind,
  label,
  phase,
  filename,
  sizeBytes,
  noteId,
  onExport,
  onRetry,
}) => {
  const { token } = theme.useToken();

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1.4,
    color: token.colorText,
    wordBreak: 'break-word',
  };
  const bodyStyle: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 400,
    lineHeight: 1.5,
    color: token.colorText,
    wordBreak: 'break-word',
  };

  const fileRow = filename ? (
    <span style={bodyStyle}>
      <DownloadOutlined aria-hidden /> {filename}
      {sizeBytes !== undefined ? ` · ${formatSize(sizeBytes)}` : ''}
    </span>
  ) : null;

  const savedNoteBanner = filename ? (
    <WizardSavedNoteBanner
      documentId={noteId}
      filename={filename}
      noteSaved={Boolean(noteId)}
      downloadInitiated={phase === 'saved'}
    />
  ) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={labelStyle}>{label}</span>

      {phase === 'idle' && (
        <Button
          type="primary"
          size="small"
          aria-label={`Xuất ${kind} (.docx)`}
          onClick={onExport}
          style={{ alignSelf: 'flex-start' }}
        >
          Xuất .docx
        </Button>
      )}

      {phase === 'building' && (
        <>
          <Button
            type="primary"
            size="small"
            aria-label={`Xuất ${kind} (.docx)`}
            loading
            disabled
            onClick={onExport}
            style={{ alignSelf: 'flex-start' }}
          >
            Xuất .docx
          </Button>
          <div role="status" style={bodyStyle}>
            Đang tạo tệp .docx…
          </div>
        </>
      )}

      {phase === 'saved' && (
        <>
          {fileRow}
          {savedNoteBanner}
        </>
      )}

      {phase === 'saved_download_failed' && (
        <>
          {fileRow}
          {savedNoteBanner}
          <Button size="small" onClick={onRetry} style={{ alignSelf: 'flex-start' }}>
            Tải lại tệp
          </Button>
        </>
      )}

      {phase === 'failed' && (
        <>
          <Alert type="error" showIcon role="alert" message={FAILURE_COPY} />
          <Button size="small" onClick={onRetry} style={{ alignSelf: 'flex-start' }}>
            Thử lại
          </Button>
        </>
      )}
    </div>
  );
};
