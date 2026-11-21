import React from 'react';
import { Tag } from '../../ui';
import { SyncOutlined, CheckCircleOutlined } from '../../ui/icon';

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

export const StagedLoadingIndicator: React.FC<StagedLoadingIndicatorProps> = ({
  stage,
  toolName,
  toolPhase,
}) => {
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
        padding: stage === 'tool' && toolName ? '4px 0' : 0,
        fontSize: 'var(--font-size-small)',
      }}
    >
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
          style={{ margin: 0, fontSize: 'var(--font-size-small)' }}
        >
          {`[Công cụ] ${toolName}`}
        </Tag>
      )}
    </div>
  );
};

export default StagedLoadingIndicator;
