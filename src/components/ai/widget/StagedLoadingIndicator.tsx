import React from 'react';
import { Tag, Typography, theme } from 'antd';
import { SyncOutlined, CheckCircleOutlined } from '@ant-design/icons';

export type StagedLoadingStage =
  | 'preparing'
  | 'tool'
  | 'streaming'
  | 'synthesizing'
  | 'awaiting-approval';

export interface StagedLoadingIndicatorProps {
  stage: StagedLoadingStage;
  toolName?: string;
  toolPhase?: 'call' | 'result';
}

/** UI-SPEC §2 order: the four staged labels, never raw reasoning (D-04, D-19). */
const STAGES: Array<{ id: StagedLoadingStage; label: string }> = [
  { id: 'preparing', label: 'Chuẩn bị ngữ cảnh' },
  { id: 'tool', label: 'Truy xuất công cụ' },
  { id: 'streaming', label: 'Đang phản hồi' },
  { id: 'awaiting-approval', label: 'Chờ phê duyệt' },
];

export const StagedLoadingIndicator: React.FC<StagedLoadingIndicatorProps> = ({
  stage,
  toolName,
  toolPhase,
}) => {
  const { token } = theme.useToken();
  const activeId: StagedLoadingStage =
    stage === 'synthesizing' ? 'streaming' : stage;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="ai-staged-loading"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
        padding: '4px 0',
        fontSize: 12,
      }}
    >
      {STAGES.map((entry) => {
        const active = entry.id === activeId;
        return (
          <Typography.Text
            key={entry.id}
            style={{
              fontSize: 12,
              fontWeight: active ? 600 : 400,
              color: active ? token.colorPrimary : token.colorTextTertiary,
            }}
          >
            {entry.label}
          </Typography.Text>
        );
      })}

      {stage === 'tool' && toolName && (
        <Tag
          icon={
            toolPhase === 'result' ? (
              <CheckCircleOutlined />
            ) : (
              <SyncOutlined spin />
            )
          }
          color={toolPhase === 'result' ? 'success' : 'processing'}
          style={{ margin: 0, fontSize: 12 }}
        >
          {`[Công cụ] ${toolName}`}
        </Tag>
      )}
    </div>
  );
};

export default StagedLoadingIndicator;
