import React, { useEffect, useMemo, useState } from 'react';
import { Typography, Alert, Button, Space, Card, Tag, theme, message } from 'antd';
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
import { generateHubCabDraft } from '../../../services/wizard/hubCab';
import { buildHubCrSummary } from '../../../services/wizard/hubCrSummary';
import { formatGuardMessage } from '../../../services/wizard/workflowGuards';
import { ConventionsSummaryCard, type ConventionsSummaryProps } from '../common/ConventionsSummaryCard';
import { buildWizardDocx } from '../../../services/export/wizardDocx';
import { createStoreZip, downloadBlob } from '../../../utils/fileExport';
import { completeCr } from '../../../services/wizard/sdlcCrManager';
import type { SdlcWizardRuntime } from '../../../services/wizard/sdlcWizardRuntime';
import type { SdlcStepId, SdlcWorkflowState } from '../../../services/wizard/workflowSchemas';

export interface Step6CabViewProps {
  /** D-06: a historical card pins the CAB preview to that exact approved version, read-only. */
  viewedVersion?: { version: number; content: string; title: string } | undefined;
  projectId: string;
  crId: string;
  workflowState?: SdlcWorkflowState | undefined;
  /** D-17: only ever called from the explicit `Lưu & Phê duyệt` action — never from generation. */
  onCommitCab: (markdown: string, noteId?: string | undefined) => Promise<void>;
  db?: TaskPlannerDatabase | undefined;
  onNavigateToStep?: ((step: SdlcStepId) => void) | undefined;
  conventionsSummary?: ConventionsSummaryProps | undefined;
  onDraftChange?: ((markdown: string) => void) | undefined;
  /** A chat-produced CAB draft; replaces the local draft without a remount. */
  incomingDraft?: string | undefined;
  /** Test/injection seam, mirroring Step 5's `generateDrafts`. Must never persist. */
  generateCabDraft?: ((input: { signal: AbortSignal }) => Promise<{ markdown: string }>) | undefined;
  wizardRuntime?: SdlcWizardRuntime | undefined;
}

export const Step6CabView: React.FC<Step6CabViewProps> = ({
  projectId,
  crId,
  workflowState,
  viewedVersion,
  onCommitCab,
  db = defaultDb,
  onNavigateToStep,
  conventionsSummary,
  onDraftChange,
  incomingDraft,
  generateCabDraft,
  wizardRuntime,
}) => {
  const { token } = theme.useToken();
  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [exportingKind, setExportingKind] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [draftMarkdown, setDraftMarkdown] = useState<string | undefined>(undefined);

  // A chat draft arrives after mount, so it must seed the local draft without a remount.
  useEffect(() => {
    if (incomingDraft !== undefined) setDraftMarkdown(incomingDraft);
  }, [incomingDraft]);

  const pl02 = workflowState?.artifacts.pl02;
  const pl03b = workflowState?.artifacts.pl03b;
  const pl07 = workflowState?.artifacts.pl07;
  const cab = workflowState?.artifacts.cab;

  const prerequisites = [
    { label: 'PL02 — Đặc tả chức năng (Bước 1)', present: Boolean(pl02?.content) },
    { label: 'PL03B — Thiết kế & Triển khai (Bước 5)', present: Boolean(pl03b?.content) },
    { label: 'PL07 — Checklist Review (Bước 5)', present: Boolean(pl07?.content) },
  ];

  const canGenerateCab = prerequisites.every((p) => p.present);
  const isConfigured = Boolean(generateCabDraft || wizardRuntime);

  const crSummary = useMemo(
    () => (workflowState ? buildHubCrSummary({ state: workflowState }) : undefined),
    [workflowState],
  );

  /** D-17: produces a draft only. Writes no Note, records no approval, calls no commit. */
  const handleGenerateCab = async () => {
    if (!workflowState || !canGenerateCab) return;
    try {
      setGenerating(true);
      const base = {
        db,
        projectId,
        threadId: workflowState.threadId,
        sessionId: workflowState.sessionId,
        draftRevision: (cab?.version ?? 0) + 1,
        metadata: workflowState.metadata,
        state: workflowState,
      };
      let markdown: string;
      if (generateCabDraft) {
        markdown = (await generateCabDraft({ signal: new AbortController().signal })).markdown;
      } else {
        if (!wizardRuntime) return;
        markdown = (await generateHubCabDraft({
          ...base,
          model: wizardRuntime.model,
          collectEvidence: wizardRuntime.collectEvidence,
          resolveSetIds: wizardRuntime.resolveSetIds,
        })).markdown;
      }
      setDraftMarkdown(markdown);
      onDraftChange?.(markdown);
      message.success('Đã tạo bản nháp Tờ trình CAB. Vui lòng review trước khi lưu và phê duyệt.');
    } catch (err: unknown) {
      message.error('Lỗi tạo bản nháp CAB: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setGenerating(false);
    }
  };

  /** The only path to an approved CAB artifact (D-17). */
  const handleApprove = async () => {
    if (!draftMarkdown?.trim()) return;
    try {
      setApproving(true);
      await onCommitCab(draftMarkdown);
      message.success('Đã lưu & phê duyệt Tờ trình CAB.');
    } catch (err: unknown) {
      message.error('Không thể lưu CAB: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setApproving(false);
    }
  };

  const handleExportDocx = async (kind: 'PL02' | 'PL03B' | 'PL07' | 'CAB') => {
    if (!workflowState) return;
    try {
      setExportingKind(kind);
      const res = await exportHubArtifact({
        db,
        kind,
        projectId,
        threadId: `sdlc:${projectId}:${crId}:CAB`,
        sessionId: workflowState.sessionId,
        metadata: workflowState.metadata,
        state: workflowState,
      });

      if (res.status === 'saved') {
        message.success(`Đã xuất file ${res.filename} thành công!`);
      } else {
        message.error(`Không thể xuất file: ${res.errorCode ?? 'Lỗi không xác định'}`);
      }
    } catch (err: unknown) {
      message.error('Lỗi: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setExportingKind(null);
    }
  };

  const handleExportAllZip = async () => {
    if (!workflowState) return;
    try {
      setDownloadingZip(true);
      const kinds: Array<'PL02' | 'PL03B' | 'PL07' | 'CAB'> = ['PL02', 'PL03B', 'PL07', 'CAB'];
      const entries: Array<{ path: string; data: Uint8Array }> = [];

      for (const kind of kinds) {
        let payload: unknown;
        const noteId = workflowState.artifacts[kind === 'PL02' ? 'pl02' : kind === 'PL03B' ? 'pl03b' : kind === 'PL07' ? 'pl07' : 'cab']?.noteId;
        if (!noteId) continue;
        const note = await db.notes.get(noteId);
        if (!note?.body) continue;
        try {
          payload = (JSON.parse(note.body) as { exportPayload?: unknown }).exportPayload;
        } catch {
          payload = undefined;
        }
        if (payload === undefined) continue;

        const blob = await buildWizardDocx(kind, payload);
        entries.push({
          path: `${kind}-${workflowState.metadata.cr}.docx`,
          data: new Uint8Array(await blob.arrayBuffer()),
        });
      }

      if (entries.length === 0) {
        message.warning('Không có tài liệu nào sẵn sàng để đóng gói zip.');
        return;
      }

      await downloadBlob(createStoreZip(entries), `SDLC-HO-SO-CAB-${workflowState.metadata.cr}.zip`);
      message.success('Đã tải xuống toàn bộ bộ hồ sơ CAB (.zip)!');
    } catch (err: unknown) {
      message.error('Lỗi: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setDownloadingZip(false);
    }
  };

  const handleCompleteCr = async () => {
    await completeCr(projectId, crId, db);
    setCompleted(true);
    message.success('Đã hoàn tất quy trình SDLC và đóng CR thành công!');
  };

  // A pinned historical version wins over the live draft/approved pair (D-06).
  const previewMarkdown = viewedVersion ? viewedVersion.content : draftMarkdown ?? cab?.content;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1000 }}>
      {conventionsSummary && (
        <ConventionsSummaryCard {...conventionsSummary} />
      )}
      <div>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Bước 6: Tổng kết & Hồ sơ CAB (Change Advisory Board)
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginTop: 4 }}>
          Tổng kết các tài liệu đã duyệt và tạo bản nháp Tờ trình CAB. Bản nháp chỉ được lưu khi bạn bấm Lưu & Phê duyệt.
        </Typography.Paragraph>
      </div>

      {!canGenerateCab && (
        <Alert
          type="warning"
          showIcon
          message={formatGuardMessage('ALL_DOCS_REQUIRED_FOR_CAB')}
          description="Cần PL02 đã duyệt (Bước 1), PL03B và PL07 đã duyệt (Bước 5) trước khi tạo Tờ trình CAB."
          action={
            <Button size="small" onClick={() => onNavigateToStep?.('TECH_DOCS')}>
              Chuyển đến Bước 5: Tài liệu kỹ thuật
            </Button>
          }
        />
      )}

      {!isConfigured && (
        <Alert
          type="info"
          showIcon
          message="Chưa cấu hình mô hình AI. Vui lòng thiết lập endpoint và API key trong Cài đặt."
        />
      )}

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
              <Tag color={p.present ? 'success' : 'default'}>{p.present ? 'Đã sẵn sàng' : 'Chưa có'}</Tag>
            </div>
          ))}
        </Space>
      </Card>

      <Card
        size="small"
        title={
          <Space>
            <span>Tờ trình CAB</span>
            {cab ? <Tag color="success">Đã duyệt (v{cab.version})</Tag> : draftMarkdown ? <Tag color="warning">Bản nháp</Tag> : null}
          </Space>
        }
        style={{ border: `1px solid ${token.colorBorderSecondary}` }}
        extra={
          <Button
            type="primary"
            icon={<RobotOutlined />}
            loading={generating}
            disabled={!canGenerateCab || !isConfigured}
            onClick={handleGenerateCab}
          >
            {draftMarkdown || cab ? 'Tạo lại bản nháp CAB' : 'Tạo bản nháp CAB'}
          </Button>
        }
      >
        {previewMarkdown ? (
          <div
            style={{ maxHeight: 350, overflowY: 'auto', padding: 8, lineHeight: 1.6 }}
            dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(previewMarkdown) }}
          />
        ) : (
          <Typography.Text type="secondary" style={{ display: 'block', textAlign: 'center', padding: 32 }}>
            {canGenerateCab
              ? 'Tất cả điều kiện đã đáp ứng. Bấm "Tạo bản nháp CAB" để sinh bản nháp tờ trình.'
              : 'Cần hoàn tất các bước trước để có đủ PL02, PL03B và PL07.'}
          </Typography.Text>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 12 }}>
          <Button
            type="primary"
            loading={approving}
            disabled={Boolean(viewedVersion) || !draftMarkdown?.trim()}
            onClick={handleApprove}
          >
            Lưu & Phê duyệt
          </Button>
        </div>
      </Card>

      {crSummary && (
        <Card
          size="small"
          title="Tóm tắt CR nội bộ (chỉ trong TaskMate)"
          style={{ border: `1px solid ${token.colorBorderSecondary}` }}
        >
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div>
              <Typography.Text strong>Phạm vi & mục tiêu</Typography.Text>
              <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0, fontSize: 13 }}>
                {crSummary.scope}
              </Typography.Paragraph>
            </div>
            <div>
              <Typography.Text strong>Thay đổi thực tế</Typography.Text>
              {crSummary.actualChanges.length > 0 ? (
                <ul style={{ margin: '4px 0 0', paddingLeft: 20, fontSize: 13 }}>
                  {crSummary.actualChanges.map((item) => <li key={item}>{item}</li>)}
                </ul>
              ) : (
                <Typography.Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 13 }}>
                  Chưa có bằng chứng triển khai.
                </Typography.Paragraph>
              )}
            </div>
            <div>
              <Typography.Text strong>Quyết định chính</Typography.Text>
              <ul style={{ margin: '4px 0 0', paddingLeft: 20, fontSize: 13 }}>
                {crSummary.keyDecisions.length > 0
                  ? crSummary.keyDecisions.map((item) => <li key={item}>{item}</li>)
                  : <li>Chưa ghi nhận quyết định thiết kế.</li>}
              </ul>
            </div>
            <div>
              <Space>
                <Typography.Text strong>Rủi ro & rollback</Typography.Text>
                {crSummary.risksRollback.rollbackVerified
                  ? <Tag color="success">Đã kiểm chứng</Tag>
                  : <Tag color="warning">Chưa kiểm chứng</Tag>}
              </Space>
              <Typography.Paragraph style={{ marginBottom: 0, fontSize: 13 }}>
                {crSummary.risksRollback.rollbackSummary}
              </Typography.Paragraph>
            </div>
            <div>
              <Typography.Text strong>Khoảng trống bằng chứng</Typography.Text>
              <ul style={{ margin: '4px 0 0', paddingLeft: 20, fontSize: 13 }}>
                {crSummary.openGaps.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div>
              <Typography.Text strong>Liên kết bằng chứng</Typography.Text>
              <ul style={{ margin: '4px 0 0', paddingLeft: 20, fontSize: 13 }}>
                {crSummary.evidenceLinks.map((link) => (
                  <li key={`${link.kind}-${link.version}`}>{link.kind} v{link.version} — {link.hash.slice(0, 12)}…</li>
                ))}
              </ul>
            </div>
          </Space>
        </Card>
      )}

      <Card
        size="small"
        title="Bộ hồ sơ xuất chuẩn Ngân hàng (.docx / .zip)"
        style={{ border: `1px solid ${token.colorBorderSecondary}` }}
      >
        <Space wrap size={12}>
          <Button icon={<FileWordOutlined />} loading={exportingKind === 'PL02'} disabled={!pl02?.content} onClick={() => handleExportDocx('PL02')}>
            Tải PL02.docx
          </Button>
          <Button icon={<FileWordOutlined />} loading={exportingKind === 'PL03B'} disabled={!pl03b?.content} onClick={() => handleExportDocx('PL03B')}>
            Tải PL03B.docx
          </Button>
          <Button icon={<FileWordOutlined />} loading={exportingKind === 'PL07'} disabled={!pl07?.content} onClick={() => handleExportDocx('PL07')}>
            Tải PL07.docx
          </Button>
          <Button icon={<FileWordOutlined />} loading={exportingKind === 'CAB'} disabled={!cab?.content} onClick={() => handleExportDocx('CAB')}>
            Tải CAB.docx
          </Button>
          <Button type="primary" icon={<FileZipOutlined />} loading={downloadingZip} disabled={!cab?.content} onClick={handleExportAllZip}>
            Tải toàn bộ bộ hồ sơ (.zip)
          </Button>
        </Space>
      </Card>

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
          <Button type="primary" disabled={completed} icon={<CheckOutlined />} onClick={handleCompleteCr}>
            {completed ? 'Đã đóng CR' : 'Hoàn tất & Đóng CR'}
          </Button>
        </div>
      )}
    </div>
  );
};
