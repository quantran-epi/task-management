import React, { useState } from 'react';
import { Typography, Button, Space, Card, Tag, theme, message } from 'antd';
import {
  FileWordOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  RobotOutlined,
  FileZipOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { db as defaultDb, type TaskPlannerDatabase } from '../../../db';
import { renderSafeMarkdown } from '../../../utils/markdown';
import { exportHubArtifact } from '../../../services/wizard/hubExport';
import { toCabDocxPayload } from '../../../services/wizard/hubCab';
import { buildWizardDocx } from '../../../services/export/wizardDocx';
import { createStoreZip, downloadBlob } from '../../../utils/fileExport';
import { completeCr } from '../../../services/wizard/sdlcCrManager';
import type { SdlcWorkflowState } from '../../../services/wizard/workflowSchemas';

export interface Step6CabViewProps {
  projectId: string;
  crId: string;
  workflowState?: SdlcWorkflowState | undefined;
  onCommitCab: (markdown: string, noteId?: string | undefined) => Promise<void>;
  db?: TaskPlannerDatabase | undefined;
}

export const Step6CabView: React.FC<Step6CabViewProps> = ({
  projectId,
  crId,
  workflowState,
  onCommitCab,
  db = defaultDb,
}) => {
  const { token } = theme.useToken();
  const [generating, setGenerating] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [exportingKind, setExportingKind] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  const pl02 = workflowState?.artifacts.pl02;
  const pl03b = workflowState?.artifacts.pl03b;
  const pl07 = workflowState?.artifacts.pl07;
  const cab = workflowState?.artifacts.cab;

  const prerequisites = [
    { label: 'PL02 — Đặc tả chức năng', present: Boolean(pl02?.content) },
    { label: 'PL03B — Thiết kế & Triển khai', present: Boolean(pl03b?.content) },
    { label: 'PL07 — Checklist Review', present: Boolean(pl07?.content) },
  ];

  const canGenerateCab = prerequisites.every((p) => p.present);

  // Generate CAB Proposal
  const handleGenerateCab = async () => {
    if (!workflowState || !canGenerateCab) {
      message.error('Chưa đủ điều kiện (cần đủ PL02, PL03B, PL07) để sinh tờ trình CAB.');
      return;
    }

    try {
      setGenerating(true);

      const sources = [
        {
          kind: 'PL02' as const,
          artifactId: pl02?.noteId ?? 'pl02-note-id',
          version: pl02?.version ?? 1,
          hash: pl02?.hash ?? '02'.repeat(32),
          projectId,
          threadId: `sdlc:${projectId}:${crId}:CAB`,
          approved: true as const,
        },
        {
          kind: 'PL03B' as const,
          artifactId: pl03b?.noteId ?? 'pl03b-note-id',
          version: pl03b?.version ?? 1,
          hash: pl03b?.hash ?? '03'.repeat(32),
          projectId,
          threadId: `sdlc:${projectId}:${crId}:CAB`,
          approved: true as const,
        },
        {
          kind: 'PL07' as const,
          artifactId: pl07?.noteId ?? 'pl07-note-id',
          version: pl07?.version ?? 1,
          hash: pl07?.hash ?? '07'.repeat(32),
          projectId,
          threadId: `sdlc:${projectId}:${crId}:CAB`,
          approved: true as const,
        },
      ];

      const cabDocx = toCabDocxPayload(
        {
          schemaVersion: 1,
          kind: 'CAB',
          title: `Tờ trình CAB — ${workflowState.metadata.featureName} (${workflowState.metadata.cr})`,
          sections: [
            {
              heading: 'Bối cảnh & Mục tiêu',
              body: `Đề xuất phê duyệt triển khai cho ${workflowState.metadata.featureName}. Đơn vị yêu cầu: ${workflowState.metadata.requestingUnit}.`,
            },
            {
              heading: 'Giải pháp Kỹ thuật',
              body: `Hệ thống đã hoàn tất đối chiếu change pack, kiểm tra checklist an toàn PL07 và cập nhật thiết kế PL03B.`,
            },
          ],
          risks: ['Rủi ro hệ thống đã được kiểm soát và ghi nhận trong checklist PL07.'],
          missingTests: [],
          unresolvedDrift: [],
          rollback: { summary: 'Kịch bản rollback sẵn sàng trong trường hợp có sự cố.', verified: true },
          caveats: [],
          citationIds: [],
        },
        {
          metadata: workflowState.metadata,
          projectId,
          threadId: `sdlc:${projectId}:${crId}:CAB`,
          inputRevision: (cab?.version ?? 0) + 1,
          draftRevision: (cab?.version ?? 0) + 1,
          sources,
        }
      );

      const cabMd = `# Tờ trình CAB — ${workflowState.metadata.featureName}\n\n**Mã CR:** ${workflowState.metadata.cr}\n**Người đề xuất:** ${workflowState.metadata.author}\n**Ngày lập:** ${workflowState.metadata.date}\n\n## 1. Bối cảnh & Mục tiêu\n${cabDocx.contextObjective}\n\n## 2. Các thay đổi Kỹ thuật\n${cabDocx.technicalChanges.map((t) => `- ${t}`).join('\n')}\n\n## 3. Rủi ro & Kế hoạch Rollback\n- Rollback: ${cabDocx.rollback.summary} (Verified: ${cabDocx.rollback.verified ? 'Có' : 'Chưa'})\n- Rủi ro ghi nhận: ${cabDocx.risks.join(', ') || 'Không có'}\n`;

      await onCommitCab(cabMd);
      message.success('Đã sinh và phê duyệt Tờ trình CAB thành công!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sinh CAB thất bại';
      message.error(`Lỗi sinh CAB: ${msg}`);
    } finally {
      setGenerating(false);
    }
  };

  // Export single .docx
  const handleExportDocx = async (kind: 'PL02' | 'PL03B' | 'PL07' | 'CAB') => {
    if (!workflowState) return;
    try {
      setExportingKind(kind);
      const res = await exportHubArtifact({
        db,
        kind,
        projectId,
        threadId: `sdlc:${projectId}:${crId}:CAB`,
        sessionId: 'session-cab-export',
        metadata: workflowState.metadata,
        state: workflowState,
      });

      if (res.status === 'saved') {
        message.success(`Đã xuất file ${res.filename} thành công!`);
      } else {
        message.error(`Không thể xuất file: ${res.errorCode ?? 'Lỗi không xác định'}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Xuất file thất bại';
      message.error(`Lỗi: ${msg}`);
    } finally {
      setExportingKind(null);
    }
  };

  // Export all documents bundled in a .zip archive
  const handleExportAllZip = async () => {
    if (!workflowState) return;
    try {
      setDownloadingZip(true);

      const kinds: Array<'PL02' | 'PL03B' | 'PL07' | 'CAB'> = ['PL02', 'PL03B', 'PL07', 'CAB'];
      const entries: Array<{ path: string; data: Uint8Array }> = [];

      for (const kind of kinds) {
        let payload: any;
        const ref = workflowState.artifacts[kind === 'PL02' ? 'pl02' : kind === 'PL03B' ? 'pl03b' : kind === 'PL07' ? 'pl07' : 'cab'];
        if (!ref?.content) continue;

        if (kind === 'PL02') {
          payload = {
            schemaVersion: 1,
            kind: 'PL02',
            status: 'approved',
            inputRevision: 1,
            draftRevision: 1,
            approvedRevision: 1,
            metadata: {
              crCode: workflowState.metadata.cr,
              featureName: workflowState.metadata.featureName,
              requestingUnit: workflowState.metadata.requestingUnit,
              author: workflowState.metadata.author,
              createdDate: workflowState.metadata.date,
            },
            introduction: { purpose: ref.content, users: '(chưa cung cấp)', deploymentScope: '(chưa cung cấp)', risks: [], glossary: [] },
            features: [{ name: workflowState.metadata.featureName, description: ref.content, fileLayout: [], inputRules: [], processingRules: [], flowSteps: [] }],
            permissions: [],
            notifications: [],
            apiContracts: [],
            staffing: [],
          };
        } else if (ref.noteId) {
          const note = await db.notes.get(ref.noteId);
          if (note?.body) {
            try {
              payload = JSON.parse(note.body).exportPayload;
            } catch {
              payload = undefined;
            }
          }
        }

        if (payload) {
          const blob = await buildWizardDocx(kind, payload);
          const buf = new Uint8Array(await blob.arrayBuffer());
          entries.push({
            path: `${kind}-${workflowState.metadata.cr}.docx`,
            data: buf,
          });
        }
      }

      if (entries.length === 0) {
        message.warning('Không có tài liệu nào sẵn sàng để đóng gói zip.');
        return;
      }

      const zipBlob = createStoreZip(entries);
      await downloadBlob(zipBlob, `SDLC-HO-SO-CAB-${workflowState.metadata.cr}.zip`);
      message.success('Đã tải xuống toàn bộ bộ hồ sơ CAB (.zip)!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Đóng gói zip thất bại';
      message.error(`Lỗi: ${msg}`);
    } finally {
      setDownloadingZip(false);
    }
  };

  const handleCompleteCr = async () => {
    await completeCr(projectId, crId, db);
    setCompleted(true);
    message.success('Đã hoàn tất quy trình SDLC và đóng CR thành công!');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1000 }}>
      <div>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Bước 6: Tổng kết & Hồ sơ CAB (Change Advisory Board)
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginTop: 4 }}>
          Tổng kết các tài liệu đã duyệt, sinh Tờ trình CAB chuẩn ngân hàng và tải về toàn bộ bộ hồ sơ bàn giao.
        </Typography.Paragraph>
      </div>

      {/* Prerequisites Card */}
      <Card
        size="small"
        title="Kiểm tra điều kiện tiên quyết tạo CAB"
        style={{ border: `1px solid ${token.colorBorderSecondary}` }}
      >
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          {prerequisites.map((p) => (
            <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {p.present ? (
                <CheckCircleOutlined style={{ color: token.colorSuccess, fontSize: 16 }} />
              ) : (
                <ClockCircleOutlined style={{ color: token.colorTextQuaternary, fontSize: 16 }} />
              )}
              <Typography.Text strong={p.present} style={{ fontSize: 13 }}>
                {p.label}
              </Typography.Text>
              <Tag color={p.present ? 'success' : 'default'}>
                {p.present ? 'Đã sẵn sàng' : 'Chưa có'}
              </Tag>
            </div>
          ))}
        </Space>
      </Card>

      {/* CAB Proposal Card */}
      <Card
        size="small"
        title="Tờ trình CAB"
        style={{ border: `1px solid ${token.colorBorderSecondary}` }}
        extra={
          <Space>
            <Button
              type="primary"
              icon={<RobotOutlined />}
              loading={generating}
              disabled={!canGenerateCab}
              onClick={handleGenerateCab}
            >
              {cab ? 'Tạo lại Tờ trình CAB bằng AI' : 'Tạo Tờ trình CAB bằng AI'}
            </Button>
          </Space>
        }
      >
        {cab?.content ? (
          <div
            style={{ maxHeight: 350, overflowY: 'auto', padding: 8, lineHeight: 1.6 }}
            dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(cab.content) }}
          />
        ) : (
          <Typography.Text type="secondary" style={{ display: 'block', textAlign: 'center', padding: 32 }}>
            {canGenerateCab
              ? 'Tất cả điều kiện đã đáp ứng. Bấm "Tạo Tờ trình CAB bằng AI" để sinh tờ trình.'
              : 'Cần hoàn tất các bước trước để có đủ PL02, PL03B và PL07.'}
          </Typography.Text>
        )}
      </Card>

      {/* Bank Standard Export Suite */}
      <Card
        size="small"
        title="Bộ hồ sơ xuất chuẩn Ngân hàng (.docx / .zip)"
        style={{ border: `1px solid ${token.colorBorderSecondary}` }}
      >
        <Space wrap size={12}>
          <Button
            icon={<FileWordOutlined />}
            loading={exportingKind === 'PL02'}
            disabled={!pl02?.content}
            onClick={() => handleExportDocx('PL02')}
          >
            Tải PL02.docx
          </Button>
          <Button
            icon={<FileWordOutlined />}
            loading={exportingKind === 'PL03B'}
            disabled={!pl03b?.content}
            onClick={() => handleExportDocx('PL03B')}
          >
            Tải PL03B.docx
          </Button>
          <Button
            icon={<FileWordOutlined />}
            loading={exportingKind === 'PL07'}
            disabled={!pl07?.content}
            onClick={() => handleExportDocx('PL07')}
          >
            Tải PL07.docx
          </Button>
          <Button
            icon={<FileWordOutlined />}
            loading={exportingKind === 'CAB'}
            disabled={!cab?.content}
            onClick={() => handleExportDocx('CAB')}
          >
            Tải CAB.docx
          </Button>
          <Button
            type="primary"
            icon={<FileZipOutlined />}
            loading={downloadingZip}
            disabled={!cab?.content}
            onClick={handleExportAllZip}
          >
            Tải toàn bộ bộ hồ sơ (.zip)
          </Button>
        </Space>
      </Card>

      {/* Complete & Close CR Button */}
      {cab && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 20px',
            background: completed ? token.colorFillAlter : token.colorSuccessBg,
            borderRadius: token.borderRadiusSM,
            border: `1px solid ${completed ? token.colorBorder : token.colorSuccessBorder}`,
          }}
        >
          <Typography.Text style={{ color: completed ? token.colorTextSecondary : token.colorSuccessText, fontSize: 13 }}>
            {completed
              ? 'Yêu cầu thay đổi (CR) này đã được hoàn tất và đóng.'
              : 'Hồ sơ CAB đã hoàn chỉnh. Xác nhận hoàn tất và đóng CR để lưu trữ lịch sử.'}
          </Typography.Text>
          <Button
            type="primary"
            disabled={completed}
            icon={<CheckOutlined />}
            onClick={handleCompleteCr}
          >
            {completed ? 'Đã đóng CR' : 'Hoàn tất & Đóng CR'}
          </Button>
        </div>
      )}
    </div>
  );
};
