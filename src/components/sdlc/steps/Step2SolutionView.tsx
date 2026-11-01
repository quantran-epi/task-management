import React, { useState } from 'react';
import { Input, Button, Segmented, Space, Typography, Tag, message, theme } from 'antd';
import { CheckOutlined, EditOutlined, EyeOutlined, SplitCellsOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { renderSafeMarkdown } from '../../../utils/markdown';
import { saveHubSolution } from '../../../services/wizard/hubSolution';
import { db as defaultDb, type TaskPlannerDatabase } from '../../../db';
import type { SdlcArtifactRef } from '../../../services/wizard/workflowSchemas';

export interface Step2SolutionViewProps {
  projectId: string;
  crId?: string;
  solutionArtifact?: SdlcArtifactRef;
  initialContent?: string;
  onCommitSolution: (markdown: string, noteId: string) => Promise<void>;
  onProceedToStep3?: () => void;
  db?: TaskPlannerDatabase;
}

export const Step2SolutionView: React.FC<Step2SolutionViewProps> = ({
  projectId,
  crId,
  solutionArtifact,
  initialContent = '',
  onCommitSolution,
  onProceedToStep3,
  db = defaultDb,
}) => {
  const { token } = theme.useToken();
  const [content, setContent] = useState<string>(solutionArtifact?.content ?? initialContent ?? '');
  const [mode, setMode] = useState<'write' | 'preview' | 'split'>('write');
  const [saving, setSaving] = useState(false);
  const [isApproved, setIsApproved] = useState(Boolean(solutionArtifact?.approvedAt));

  const handleApproveAndSave = async () => {
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
      {/* Header Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space size={12}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            Bước 2: Thiết kế giải pháp kiến trúc (SOLUTION.md)
          </Typography.Title>
          {solutionArtifact?.version && (
            <Tag color="blue">v{solutionArtifact.version}</Tag>
          )}
          {isApproved && (
            <Tag color="success">Đã phê duyệt</Tag>
          )}
        </Space>

        <Space size={12}>
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

      {/* Two-Way Document Editor Pane */}
      <div style={{ flex: 1, display: 'flex', gap: 14, minHeight: 450, overflow: 'hidden' }}>
        {(mode === 'write' || mode === 'split') && (
          <Input.TextArea
            value={content}
            onChange={(e) => setContent(e.target.value)}
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
