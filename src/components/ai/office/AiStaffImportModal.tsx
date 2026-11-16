import React, { useState } from 'react';
import { Alert, Button, Modal, Table, Upload, Typography } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { db as defaultDb, type TaskPlannerDatabase } from '../../../db';
import { importAiStaff, type AiStaffImportResult } from '../../../db/repositories/aiOfficeRepo';
import { AiStaffImportSchema, type AiStaffImportInput } from '../../../validation/aiOfficeSchemas';
import { fetchAvailableModels } from '../../../services/ai/nineRouterTokenService';

const { Dragger } = Upload;
const { Text } = Typography;

const MAX_FILE_SIZE = 2 * 1024 * 1024;

interface PreviewRow {
  key: string;
  kind: 'Kỹ năng' | 'Nhân viên' | 'Lead';
  name: string;
  detail: string;
}

function toPreviewRows(payload: AiStaffImportInput): PreviewRow[] {
  return [
    ...(payload.skills ?? []).map((row) => ({
      key: `skill:${row.name}`,
      kind: 'Kỹ năng' as const,
      name: row.name,
      detail: row.description,
    })),
    ...(payload.employees ?? []).map((row) => ({
      key: `employee:${row.name}`,
      kind: 'Nhân viên' as const,
      name: row.name,
      detail: [row.role, row.model, row.skillName && `kỹ năng: ${row.skillName}`]
        .filter(Boolean)
        .join(' · '),
    })),
    ...(payload.leads ?? []).map((row) => ({
      key: `lead:${row.name}`,
      kind: 'Lead' as const,
      name: row.name,
      detail: [row.role, row.model].filter(Boolean).join(' · '),
    })),
  ];
}

/** Zod issues, one line each — the row index is what tells the user which entry to fix. */
function formatIssues(error: unknown): string[] {
  const issues = (error as { issues?: Array<{ path: (string | number)[]; message: string }> })
    .issues;
  if (!Array.isArray(issues)) return [String(error)];
  return issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
}

export interface AiStaffImportModalProps {
  open: boolean;
  onClose: () => void;
  db?: TaskPlannerDatabase | undefined;
}

/**
 * Bulk import of AI staff from one JSON file. Parse and validate happen on file select, so a
 * bad file never reaches the write path; the write only runs when the user presses Nhập.
 */
export const AiStaffImportModal: React.FC<AiStaffImportModalProps> = ({
  open,
  onClose,
  db = defaultDb,
}) => {
  const [payload, setPayload] = useState<AiStaffImportInput | null>(null);
  const [fileName, setFileName] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<AiStaffImportResult | null>(null);

  const reset = () => {
    setPayload(null);
    setFileName('');
    setErrors([]);
    setResult(null);
    setImporting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const uploadProps: UploadProps = {
    name: 'staffFile',
    multiple: false,
    accept: '.json,application/json',
    showUploadList: false,
    beforeUpload: (file) => {
      setResult(null);
      if (file.size > MAX_FILE_SIZE) {
        setPayload(null);
        setErrors(['Tệp vượt quá 2MB.']);
        return Upload.LIST_IGNORE;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(String(e.target?.result ?? ''));
        } catch {
          setPayload(null);
          setFileName(file.name);
          setErrors(['Tệp không phải JSON hợp lệ.']);
          return;
        }
        const checked = AiStaffImportSchema.safeParse(parsed);
        setFileName(file.name);
        if (!checked.success) {
          setPayload(null);
          setErrors(formatIssues(checked.error));
          return;
        }
        setErrors([]);
        setPayload(checked.data);
      };
      reader.readAsText(file);
      return false;
    },
  };

  const handleImport = async () => {
    if (!payload) return;
    setImporting(true);
    try {
      const models = await fetchAvailableModels(db);
      const outcome = await importAiStaff(payload, db, models[0]);
      setResult(outcome);
      setPayload(null);
    } catch (error) {
      setErrors(formatIssues(error));
    } finally {
      setImporting(false);
    }
  };

  const previewRows = payload ? toPreviewRows(payload) : [];

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      title="Nhập nhân viên AI từ JSON"
      width={720}
      destroyOnHidden
      data-testid="ai-staff-import-modal"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={handleClose}>Đóng</Button>
          <Button
            type="primary"
            disabled={!payload}
            loading={importing}
            onClick={handleImport}
            data-testid="ai-staff-import-confirm"
          >
            {payload ? `Nhập ${previewRows.length} mục` : 'Nhập'}
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Text type="secondary">
          Tệp JSON gồm ba mảng tuỳ chọn: <Text code>skills</Text>, <Text code>employees</Text>,{' '}
          <Text code>leads</Text>. Nhân viên tham chiếu kỹ năng bằng{' '}
          <Text code>skillName</Text>. Mục trùng tên với dữ liệu đã có sẽ bị bỏ qua — nhập chỉ
          thêm, không sửa hay xoá.
        </Text>

        <Dragger {...uploadProps} style={{ padding: '8px 0' }}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined style={{ fontSize: 32, color: '#1677ff' }} />
          </p>
          <p className="ant-upload-text">Chọn hoặc kéo thả tệp JSON</p>
          {fileName && <p className="ant-upload-hint">{fileName}</p>}
        </Dragger>

        {errors.length > 0 && (
          <Alert
            type="error"
            showIcon
            title="Tệp không dùng được"
            description={
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {errors.slice(0, 20).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            }
            data-testid="ai-staff-import-errors"
          />
        )}

        {previewRows.length > 0 && (
          <Table<PreviewRow>
            size="small"
            rowKey="key"
            pagination={false}
            scroll={{ y: 260 }}
            dataSource={previewRows}
            columns={[
              { title: 'Loại', dataIndex: 'kind', width: 96 },
              { title: 'Tên', dataIndex: 'name', width: 200 },
              { title: 'Chi tiết', dataIndex: 'detail', ellipsis: true },
            ]}
          />
        )}

        {result && (
          <Alert
            type="success"
            showIcon
            title={`Đã nhập: ${result.created.skills} kỹ năng, ${result.created.employees} nhân viên, ${result.created.leads} lead.`}
            description={
              <div>
                <div>
                  Bỏ qua (trùng tên): {result.skipped.skills} kỹ năng, {result.skipped.employees}{' '}
                  nhân viên, {result.skipped.leads} lead.
                </div>
                {result.warnings.length > 0 && (
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    {result.warnings.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
              </div>
            }
            data-testid="ai-staff-import-result"
          />
        )}
      </div>
    </Modal>
  );
};

export default AiStaffImportModal;
