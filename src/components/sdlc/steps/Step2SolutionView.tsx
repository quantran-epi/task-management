import React, { useState, useEffect } from 'react';
import {
  Alert,
  Input,
  Button,
  Segmented,
  Space,
  Typography,
  Tag,
  message,
  theme,
} from 'antd';
import {
  CheckOutlined,
  EditOutlined,
  EyeOutlined,
  SplitCellsOutlined,
  ArrowRightOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { renderSafeMarkdown } from '../../../utils/markdown';
import { saveHubSolution } from '../../../services/wizard/hubSolution';
import { db as defaultDb, type TaskPlannerDatabase } from '../../../db';
import type { SdlcArtifactRef, SdlcStepId, SdlcWorkflowMetadata } from '../../../services/wizard/workflowSchemas';
import { formatGuardMessage } from '../../../services/wizard/workflowGuards';
import { ConventionsSummaryCard, type ConventionsSummaryProps } from '../common/ConventionsSummaryCard';

export interface Step2SolutionViewProps {
  projectId: string;
  crId?: string | undefined;
  solutionArtifact?: SdlcArtifactRef | undefined;
  initialContent?: string | undefined;
  incomingDraft?: string | undefined;
  pl01Content?: string | undefined;
  pl02Content?: string | undefined;
  metadata?: SdlcWorkflowMetadata | undefined;
  conventionsSummary?: ConventionsSummaryProps | undefined;
  /** Authoritative workflow-state answer; falls back to PL01/PL02 text when absent. */
  hasIntakeBaseline?: boolean | undefined;
  /** Navigates to the step that supplies the missing prerequisite (D-20). */
  onNavigateToStep?: ((step: SdlcStepId) => void) | undefined;
  /** T-25.3-46: a historical or non-active-CR version opens in preview with controls disabled. */
  readOnly?: boolean | undefined;
  /** D-06: a historical card pins the editor to that exact approved version. */
  viewedVersion?: { version: number; content: string; title: string } | undefined;
  onCommitSolution: (markdown: string, noteId: string) => Promise<void>;
  onDraftChange?: (draftMarkdown: string) => void;
  onRequestAiAnalysis?: () => void;
  onProceedToStep3?: (() => void) | undefined;
  db?: TaskPlannerDatabase | undefined;
}

export const Step2SolutionView: React.FC<Step2SolutionViewProps> = ({
  projectId,
  crId,
  solutionArtifact,
  initialContent = '',
  incomingDraft,
  pl01Content = '',
  pl02Content = '',
  metadata,
  conventionsSummary,
  hasIntakeBaseline,
  onNavigateToStep,
  readOnly = false,
  viewedVersion,
  onCommitSolution,
  onDraftChange,
  onRequestAiAnalysis,
  onProceedToStep3,
  db = defaultDb,
}) => {
  const { token } = theme.useToken();
  const [content, setContent] = useState<string>(
    viewedVersion?.content ?? incomingDraft ?? solutionArtifact?.content ?? initialContent ?? ''
  );
  const [mode, setMode] = useState<'write' | 'preview' | 'split'>('write');
  const [saving, setSaving] = useState(false);
  const [isApproved, setIsApproved] = useState(Boolean(solutionArtifact?.approvedAt));

  // T-25.3-45: host supplies the authoritative workflow-state answer; the fallback
  // only reads PL01/PL02 text, never the SOLUTION draft itself.
  const baselineReady = hasIntakeBaseline ?? Boolean(pl01Content.trim() && pl02Content.trim());

  // Sync when initialContent changes on remount/parent update
  useEffect(() => {
    const parentContent = viewedVersion?.content ?? incomingDraft ?? solutionArtifact?.content ?? initialContent;
    if (parentContent && parentContent !== content) {
      setContent(parentContent);
    }
  }, [solutionArtifact?.content, initialContent]);

  useEffect(() => {
    setIsApproved(Boolean(solutionArtifact?.approvedAt));
  }, [solutionArtifact?.approvedAt]);

  // D-06: pinning a historical version shows exactly that body, never the live draft.
  useEffect(() => {
    if (viewedVersion) setContent(viewedVersion.content);
  }, [viewedVersion]);

  // Sync when incomingDraft from chat turn completion updates (D-07)
  useEffect(() => {
    if (incomingDraft !== undefined && incomingDraft !== content) {
      setContent(incomingDraft);
      onDraftChange?.(incomingDraft);
    }
  }, [incomingDraft]);

  // Handle local text changes with draft propagation (D-08)
  const handleContentChange = (val: string) => {
    setContent(val);
    onDraftChange?.(val);
  };

  const handleRunAnalysis = () => {
    if (onRequestAiAnalysis) {
      onRequestAiAnalysis();
    } else {
      message.info('Vui lòng sử dụng khung chat bên phải để phân tích giải pháp');
    }
  };

  const handleApproveAndSave = async () => {
    if (readOnly) return;
    const trimmed = content.trim();
    if (!trimmed) {
      message.error('Nội dung SOLUTION.md không được để trống');
      return;
    }
    setSaving(true);
    try {
      // Ensure project-scoped thread exists for artifact commitment
      const scopeKey = crId ? `sdlc:${projectId}:${crId}:SOLUTION` : `sdlc:${projectId}:SOLUTION`;
      let thread = await db.chatThreads.where('scopeKey').equals(scopeKey).first();
      if (!thread) {
        const now = new Date().toISOString();
        thread = {
          id: crypto.randomUUID(),
          scopeKey,
          scopeType: 'project',
          entityId: projectId,
          title: `[SDLC] SOLUTION`,
          createdAt: now,
          updatedAt: now,
        };
        await db.chatThreads.add(thread);
      }

      const result = await saveHubSolution({
        db,
        projectId,
        threadId: thread.id,
        sessionId: crypto.randomUUID(),
        markdown: trimmed,
        draftRevision: (solutionArtifact?.version ?? 0) + 1,
      });
      await onCommitSolution(trimmed, result.noteId);
      setIsApproved(true);
      message.success('Đã duyệt và lưu SOLUTION.md thành công');
    } catch (err: any) {
      message.error(err?.message || 'Không thể lưu SOLUTION.md');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 14 }}>
      {conventionsSummary && (
        <ConventionsSummaryCard {...conventionsSummary} />
      )}

      {/* Header Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <Space size={12} wrap style={{ alignItems: 'center' }}>
          <Typography.Title level={4} style={{ margin: 0, whiteSpace: 'nowrap' }}>
            Bước 2: Thiết kế giải pháp kiến trúc (SOLUTION.md)
          </Typography.Title>
          {solutionArtifact?.version && (
            <Tag color="blue">v{solutionArtifact.version}</Tag>
          )}
          {metadata?.cr && (
            <Tag>{metadata.cr}</Tag>
          )}
          {isApproved && (
            <Tag color="success">Đã phê duyệt</Tag>
          )}
        </Space>

        <Space size={10} wrap>
          <Button
            icon={<RobotOutlined />}
            onClick={handleRunAnalysis}
            disabled={readOnly}
          >
            Phân tích lại bằng AI
          </Button>
          <Segmented
            value={mode}
            onChange={(val) => setMode(val as 'write' | 'preview' | 'split')}
            options={[
              { label: 'Soạn thảo', value: 'write', icon: <EditOutlined /> },
              { label: 'Xem trước', value: 'preview', icon: <EyeOutlined /> },
              { label: 'Chia đôi', value: 'split', icon: <SplitCellsOutlined /> },
            ]}
          />
          <Button
            type="primary"
            icon={<CheckOutlined />}
            loading={saving}
            disabled={readOnly || !content.trim() || !baselineReady}
            onClick={handleApproveAndSave}
          >
            Duyệt & Lưu SOLUTION.md
          </Button>
        </Space>
      </div>

      {/* Action Banner after Approval */}
      {isApproved && onProceedToStep3 && (
        <div
          style={{
            padding: '10px 16px',
            background: token.colorSuccessBg,
            border: `1px solid ${token.colorSuccessBorder}`,
            borderRadius: token.borderRadiusSM,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Typography.Text style={{ color: token.colorSuccessText, fontSize: 13 }}>
            Giải pháp đã được phê duyệt. Bạn có thể chuyển sang Bước 3 để nhận hướng dẫn coding ngoài và lệnh đóng gói.
          </Typography.Text>
          <Button
            type="primary"
            size="small"
            icon={<ArrowRightOutlined />}
            onClick={onProceedToStep3}
          >
            Tiếp tục sang Bước 3
          </Button>
        </div>
      )}

      {/* T-25.3-46: historical / non-active-CR version is a read-only snapshot */}
      {readOnly && (
        <Alert
          type="info"
          showIcon
          message="Đang xem phiên bản đã đóng hoặc không còn hiệu lực"
          description="Phiên bản này chỉ để tham chiếu. Mọi thao tác sửa và phê duyệt đã bị khóa."
        />
      )}

      {/* D-20: pre-emptive intake-baseline guard, disabled control + inline guidance */}
      {!baselineReady && (
        <Alert
          type="warning"
          showIcon
          message={formatGuardMessage('INTAKE_BASELINE_MISSING')}
          description={`Tài liệu bắt buộc: PL01 — Yêu cầu nghiệp vụ và PL02 — Đặc tả chức năng do Bước 1: Hồ sơ đầu vào cung cấp. Thiếu baseline thì SOLUTION.md không có căn cứ để phê duyệt.`}
          action={
            <Button
              type="primary"
              disabled={!onNavigateToStep}
              onClick={() => onNavigateToStep?.('INTAKE')}
            >
              Chuyển đến Bước 1: Hồ sơ đầu vào
            </Button>
          }
        />
      )}

      {/* Two-Way Document Editor Pane */}
      <div style={{ flex: 1, display: 'flex', gap: 14, minHeight: 450, overflow: 'hidden' }}>
        {(mode === 'write' || mode === 'split') && (
          <Input.TextArea
            value={content}
            readOnly={readOnly}
            onChange={(e) => handleContentChange(e.target.value)}
            style={{
              flex: 1,
              resize: 'none',
              height: '100%',
              fontFamily: 'monospace',
              fontSize: 13,
              padding: 14,
            }}
            placeholder="Nội dung kiến trúc giải pháp SOLUTION.md..."
          />
        )}

        {(mode === 'preview' || mode === 'split') && (
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: 16,
              background: token.colorBgContainer,
              border: `1px solid ${token.colorBorderSecondary}`,
              borderRadius: token.borderRadiusSM,
              fontSize: 13,
              lineHeight: 1.6,
            }}
            dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(content) }}
          />
        )}
      </div>
    </div>
  );
};
