import React, { useState } from 'react';
import { Typography, Alert, Button, Space, Tabs, Spin, Tag, Card, theme, message } from 'antd';
import {
  DownloadOutlined,
  CheckCircleOutlined,
  SyncOutlined,
  ArrowRightOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { db as defaultDb, type TaskPlannerDatabase } from '../../../db';
import { renderSafeMarkdown } from '../../../utils/markdown';
import { exportHubArtifact } from '../../../services/wizard/hubExport';
import { generateHubTechDocDraft } from '../../../services/wizard/hubTechDocs';
import { formatGuardMessage } from '../../../services/wizard/workflowGuards';
import type { SdlcWizardRuntime } from '../../../services/wizard/sdlcWizardRuntime';
import type { SdlcStepId, SdlcWorkflowState } from '../../../services/wizard/workflowSchemas';

type TechDocKind = 'PL03B' | 'PL07';

export interface Step5TechDocsViewProps {
  projectId: string;
  crId: string;
  workflowState?: SdlcWorkflowState | undefined;
  /** D-17: only ever called from the explicit approve action — never from generation. */
  onCommitTechDoc: (kind: TechDocKind, markdown: string, noteId?: string | undefined) => Promise<void>;
  onProceedToStep6?: (() => void) | undefined;
  db?: TaskPlannerDatabase | undefined;
  onNavigateToStep?: ((step: SdlcStepId) => void) | undefined;
  draftPl03b?: string | undefined;
  draftPl07?: string | undefined;
  onDraftChange?: ((kind: TechDocKind, markdown: string) => void) | undefined;
  wizardRuntime?: SdlcWizardRuntime | undefined;
  generateDrafts?: ((input: { signal: AbortSignal }) => Promise<{ pl03b: string; pl07: string }>) | undefined;
}

export const Step5TechDocsView: React.FC<Step5TechDocsViewProps> = ({
  projectId,
  crId,
  workflowState,
  onCommitTechDoc,
  onProceedToStep6,
  db = defaultDb,
  onNavigateToStep,
  draftPl03b,
  draftPl07,
  onDraftChange,
  wizardRuntime,
  generateDrafts,
}) => {
  const { token } = theme.useToken();
  const [activeTab, setActiveTab] = useState<TechDocKind>('PL03B');
  const [generating, setGenerating] = useState(false);
  const [exportingKind, setExportingKind] = useState<string | null>(null);
  const [localPl03b, setLocalPl03b] = useState<string | undefined>(undefined);
  const [localPl07, setLocalPl07] = useState<string | undefined>(undefined);

  const pl03b = workflowState?.artifacts.pl03b;
  const pl07 = workflowState?.artifacts.pl07;
  const solution = workflowState?.artifacts.solution;
  const changePack = workflowState?.artifacts.changePack;
  const driftResult = workflowState?.artifacts.driftResult;

  const isConfigured = Boolean(generateDrafts || wizardRuntime);
  const isReadyForGen = Boolean(solution && changePack && (generateDrafts || driftResult));
  const isBothApproved = Boolean(pl03b && pl07);

  const pl03bMarkdown = draftPl03b ?? localPl03b;
  const pl07Markdown = draftPl07 ?? localPl07;
  const hasDraft = Boolean(pl03bMarkdown || pl07Markdown);

  const setDraft = (kind: TechDocKind, markdown: string) => {
    if (kind === 'PL03B') setLocalPl03b(markdown);
    else setLocalPl07(markdown);
    onDraftChange?.(kind, markdown);
  };

  /** D-16/D-17: produces drafts only. Writes nothing, approves nothing, advances nothing. */
  const handleGenerateDraft = async () => {
    if (!workflowState || !solution || !changePack) return;
    try {
      setGenerating(true);
      if (generateDrafts) {
        const controller = new AbortController();
        const result = await generateDrafts({ signal: controller.signal });
        setDraft('PL03B', result.pl03b);
        setDraft('PL07', result.pl07);
      } else {
        if (!wizardRuntime) return;
        if (!driftResult) {
          message.error('Chưa có kết quả đối chiếu Change Pack. Vui lòng nạp lại Change Pack ở Bước 4.');
          return;
        }
        if (!solution.noteId) {
          message.error('SOLUTION.md chưa được lưu thành phiên bản. Vui lòng phê duyệt lại ở Bước 2.');
          return;
        }
        const draft = await generateHubTechDocDraft({
          db,
          projectId,
          threadId: workflowState.threadId,
          sessionId: workflowState.sessionId,
          inputRevision: workflowState.artifacts.pl03b?.version ?? 0,
          draftRevision: (workflowState.artifacts.pl03b?.version ?? 0) + 1,
          metadata: workflowState.metadata,
          solution: { noteId: solution.noteId, version: solution.version, hash: solution.hash },
          reconciliation: driftResult,
          model: wizardRuntime.model,
          collectEvidence: wizardRuntime.collectEvidence,
          resolveSetIds: wizardRuntime.resolveSetIds,
        });
        setDraft('PL03B', draft.pl03b.markdown);
        setDraft('PL07', draft.pl07.markdown);
      }
      message.success('Đã tạo bản nháp PL03B & PL07. Vui lòng review trước khi lưu và phê duyệt.');
    } catch (err: unknown) {
      message.error('Lỗi tạo bản nháp: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setGenerating(false);
    }
  };

  /** The only path to approval (D-17): explicit, per-document, complete markdown. */
  const handleApprove = async (kind: TechDocKind, markdown: string) => {
    try {
      await onCommitTechDoc(kind, markdown);
      message.success(`Đã lưu & phê duyệt ${kind}.`);
    } catch (err: unknown) {
      message.error(`Không thể lưu ${kind}: ` + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleExportDocx = async (kind: TechDocKind) => {
    if (!workflowState) return;
    try {
      setExportingKind(kind);
      await exportHubArtifact({
        db,
        projectId,
        threadId: `sdlc:${projectId}:${crId}:TECH_DOCS`,
        sessionId: workflowState.sessionId,
        metadata: workflowState.metadata,
        state: workflowState,
        kind,
      });
      message.success(`Đã xuất file ${kind}.docx thành công`);
    } catch (err: unknown) {
      message.error(`Không thể xuất ${kind}.docx: ` + (err instanceof Error ? err.message : String(err)));
    } finally {
      setExportingKind(null);
    }
  };

  const activeDraft = activeTab === 'PL03B' ? pl03bMarkdown : pl07Markdown;
  const activeApproved = activeTab === 'PL03B' ? pl03b : pl07;

  const tabTag = (approved: typeof pl03b, draft: string | undefined) => {
    if (approved) return <Tag color="success">Đã duyệt (v{approved.version})</Tag>;
    if (draft) return <Tag color="warning">Bản nháp</Tag>;
    return <Tag color="default">Chưa có</Tag>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1000 }}>
      {/* Header Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            Bước 5: Tài liệu Kỹ thuật (PL03B & PL07)
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginTop: 4 }}>
            Sinh bản nháp 2 tài liệu chuẩn ngân hàng: PL03B (Thiết kế & Triển khai) và PL07 (Checklist An toàn & Review). Bản nháp chỉ được lưu khi bạn bấm Lưu & Phê duyệt.
          </Typography.Paragraph>
        </div>
        <Space>
          <Button
            type="primary"
            icon={<RobotOutlined />}
            loading={generating}
            disabled={!isReadyForGen || !isConfigured}
            onClick={handleGenerateDraft}
          >
            {hasDraft ? 'Tạo lại bản nháp' : 'Tạo bản nháp'}
          </Button>
        </Space>
      </div>

      {!isReadyForGen && (
        <Alert
          type="warning"
          showIcon
          message={formatGuardMessage('SOLUTION_AND_PACK_REQUIRED_FOR_TECH_DOCS')}
          description="Cần SOLUTION.md đã phê duyệt (Bước 2) và Change Pack đã xác thực (Bước 4) trước khi tạo tài liệu kỹ thuật."
          action={
            <Button size="small" onClick={() => onNavigateToStep?.('CHANGE_PACK')}>
              Chuyển đến Bước 4: Kiểm soát Change Pack
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

      {/* Parallel Document Review Tabs */}
      <Card
        size="small"
        style={{ border: `1px solid ${token.colorBorderSecondary}` }}
        title={
          <Tabs
            activeKey={activeTab}
            onChange={(k) => setActiveTab(k as TechDocKind)}
            style={{ marginBottom: -16 }}
            items={[
              {
                key: 'PL03B',
                label: (
                  <Space>
                    <span>PL03B — Thiết kế & Triển khai</span>
                    {tabTag(pl03b, pl03bMarkdown)}
                  </Space>
                ),
              },
              {
                key: 'PL07',
                label: (
                  <Space>
                    <span>PL07 — Checklist An toàn Review</span>
                    {tabTag(pl07, pl07Markdown)}
                  </Space>
                ),
              },
            ]}
          />
        }
        extra={
          <Button
            size="small"
            icon={<DownloadOutlined />}
            loading={exportingKind === activeTab}
            disabled={!activeApproved}
            onClick={() => handleExportDocx(activeTab)}
          >
            Tải {activeTab}.docx
          </Button>
        }
      >
        <div style={{ minHeight: 350, maxHeight: 500, overflowY: 'auto', padding: '12px 4px' }}>
          {generating ? (
            <div style={{ textAlign: 'center', padding: 48 }}>
              <Spin indicator={<SyncOutlined spin style={{ fontSize: 28 }} />} tip="AI đang tổng hợp dữ liệu và tạo bản nháp..." />
            </div>
          ) : activeDraft ? (
            <div
              style={{ lineHeight: 1.6 }}
              dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(activeDraft) }}
            />
          ) : activeApproved?.content ? (
            <div
              style={{ lineHeight: 1.6 }}
              dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(activeApproved.content) }}
            />
          ) : (
            <Typography.Text type="secondary" style={{ display: 'block', textAlign: 'center', padding: 48 }}>
              Chưa có nội dung {activeTab}. Bấm nút "Tạo bản nháp" ở góc phải trên.
            </Typography.Text>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 12 }}>
          <Button
            type="primary"
            disabled={!isReadyForGen || !activeDraft || !activeDraft.trim()}
            onClick={() => activeDraft && handleApprove(activeTab, activeDraft)}
          >
            Lưu & Phê duyệt
          </Button>
        </div>
      </Card>

      {/* Approval & Step 6 Progression Action */}
      {isBothApproved && onProceedToStep6 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 20px',
            background: token.colorSuccessBg,
            borderRadius: token.borderRadiusSM,
            border: `1px solid ${token.colorSuccessBorder}`,
          }}
        >
          <Space>
            <CheckCircleOutlined style={{ color: token.colorSuccess, fontSize: 18 }} />
            <Typography.Text style={{ color: token.colorSuccessText, fontSize: 13 }}>
              Cả hai tài liệu PL03B và PL07 đã được tạo và phê duyệt. Bạn có thể chuyển sang Bước 6 để tổng kết hồ sơ CAB.
            </Typography.Text>
          </Space>
          <Button
            type="primary"
            size="large"
            icon={<ArrowRightOutlined />}
            onClick={onProceedToStep6}
          >
            Sang Bước 6: Tổng kết & Hồ sơ CAB
          </Button>
        </div>
      )}
    </div>
  );
};
