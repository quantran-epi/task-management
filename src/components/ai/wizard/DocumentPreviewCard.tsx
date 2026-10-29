import React, { useMemo, useState } from 'react';
import { Alert, Button, Card, Space, Tag, theme, Typography } from 'antd';
import { DownloadOutlined, EditOutlined } from '@ant-design/icons';
import type { ReconciliationResult } from '../../../services/wizard/reconciliation';
import { DriftMatrixView } from './DriftMatrixView';
import { MermaidViewer } from '../MermaidViewer';
import { WizardSavedNoteBanner } from './WizardSavedNoteBanner';
import { MarkdownContentRenderer } from '../ChatMessageBubble';

const { Text } = Typography;

export interface WizardPreviewMetadata {
  cr: string;
  requestingUnit: string;
  author: string;
  date: string;
}

export interface WizardExportedFile {
  filename: string;
  sizeBytes: number;
  noteId?: string | undefined;
  noteSaved: boolean;
  downloadInitiated: boolean;
  savePickerSaved?: boolean | undefined;
}

export interface DocumentPreviewPayload {
  messageId?: string | undefined;
  draftRevision?: number | undefined;
  skill: 'PL02' | 'PL03' | 'PL07' | 'CAB';
  title: string;
  metadata: WizardPreviewMetadata;
  markdown: string;
  mermaid?: string | undefined;
  driftMatrix?: ReconciliationResult | undefined;
  exportedFile?: WizardExportedFile | undefined;
  exportError?: string | undefined;
}

export interface DocumentPreviewCardProps {
  preview: Readonly<DocumentPreviewPayload>;
  onApproveExport: (messageId?: string, draftRevision?: number) => void | Promise<void>;
  onRequestEdit: (pointer: { messageId?: string | undefined; draftRevision?: number | undefined }) => void;
}

const PREVIEW_LINES = 40;

function truncateMarkdown(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  return lines.length > PREVIEW_LINES ? `${lines.slice(0, PREVIEW_LINES).join('\n')}\n\n…` : markdown;
}

function formatSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  return `${(sizeBytes / 1024).toFixed(1)} KB`;
}

export const DocumentPreviewCard: React.FC<DocumentPreviewCardProps> = ({ preview, onApproveExport, onRequestEdit }) => {
  const { token } = theme.useToken();
  const [expanded, setExpanded] = useState(false);
  const previewMarkdown = useMemo(() => expanded ? preview.markdown : truncateMarkdown(preview.markdown), [expanded, preview.markdown]);
  const metadata = [preview.metadata.cr, preview.metadata.requestingUnit || '(chưa cung cấp)', preview.metadata.author || '(chưa cung cấp)', preview.metadata.date];

  return (
    <Card
      size="small"
      title={<span style={{ fontSize: 20, fontWeight: 600 }}>{preview.title}</span>}
      styles={{ body: { padding: 16 } }}
      style={{ borderColor: token.colorBorderSecondary, borderRadius: token.borderRadius }}
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>{metadata.join(' · ')}</Text>
        <div>
          <Button type="link" size="small" aria-expanded="true" onClick={() => setExpanded((value) => !value)}>
            {expanded ? 'Thu gọn' : 'Xem toàn bộ'}
          </Button>
          <MarkdownContentRenderer content={previewMarkdown} />
        </div>
        {preview.mermaid && (
          <>
            <MermaidViewer code={preview.mermaid} />
            <Text type="secondary">Sơ đồ sẽ được chuyển thành bảng bước khi xuất Word.</Text>
          </>
        )}
        {preview.driftMatrix && <DriftMatrixView result={preview.driftMatrix} />}
        {preview.exportError && <Alert type="error" showIcon role="alert" message={preview.exportError} />}
        {preview.exportedFile ? (
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <span><DownloadOutlined /> {preview.exportedFile.filename} · {formatSize(preview.exportedFile.sizeBytes)}</span>
            </div>
            <WizardSavedNoteBanner
              documentId={preview.exportedFile.noteId}
              filename={preview.exportedFile.filename}
              noteSaved={preview.exportedFile.noteSaved}
              downloadInitiated={preview.exportedFile.downloadInitiated}
              savePickerSaved={preview.exportedFile.savePickerSaved}
            />
          </Space>
        ) : (
          <Space wrap>
            <Button
              type="primary"
              aria-label="Duyệt & Tải .docx"
              icon={<DownloadOutlined />}
              onClick={() => onApproveExport(preview.messageId, preview.draftRevision)}
            >
              Duyệt &amp; Tải .docx
            </Button>
            <Button aria-label="Yêu cầu chỉnh sửa thêm" icon={<EditOutlined />} onClick={() => onRequestEdit({ messageId: preview.messageId, draftRevision: preview.draftRevision })}>
              Yêu cầu chỉnh sửa thêm
            </Button>
          </Space>
        )}
        {preview.exportedFile && <Tag color="success">Đã xuất từ bản Markdown hiện tại</Tag>}
      </Space>
    </Card>
  );
};
