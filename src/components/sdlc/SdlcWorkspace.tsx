import React from 'react';
import { theme } from 'antd';
import type { TaskPlannerDatabase } from '../../db';
import type { SdlcStepId, SdlcWorkflowState } from '../../services/wizard/workflowSchemas';
import { StepChatPanel, type StepChatPanelHandle } from './chat/StepChatPanel';
import { SdlcStaleBanner } from './common/SdlcStaleBanner';

export interface SdlcWorkspaceProps {
  projectId: string;
  crId: string;
  selectedStep: SdlcStepId;
  workflowState?: SdlcWorkflowState | undefined;
  stepViewNode?: React.ReactNode;
  stepGroundingContext?: string;
  onNavigateToStep?: (step: SdlcStepId) => void;
  onSolutionExtracted?: (solutionMarkdown: string) => void;
  onRequestAiAnalysis?: () => void;
  chatPanelRef?: React.Ref<StepChatPanelHandle>;
  db?: TaskPlannerDatabase | undefined;
}

export const SdlcWorkspace: React.FC<SdlcWorkspaceProps> = ({
  projectId,
  crId,
  selectedStep,
  workflowState,
  stepViewNode,
  stepGroundingContext = '',
  onNavigateToStep,
  onSolutionExtracted,
  onRequestAiAnalysis,
  chatPanelRef,
  db,
}) => {
  const { token } = theme.useToken();

  return (
    <div
      data-testid="sdlc-workspace"
      style={{
        flex: 1,
        height: '100%',
        display: 'flex',
        overflow: 'hidden',
        background: token.colorBgLayout,
      }}
    >
      {/* Step View Area */}
      <div
        style={{
          flex: '1 1 65%',
          height: '100%',
          overflowY: 'auto',
          padding: 20,
          boxSizing: 'border-box',
          background: token.colorBgContainer,
        }}
      >
        {onNavigateToStep && (
          <SdlcStaleBanner
            currentStep={selectedStep}
            workflowState={workflowState}
            onNavigateToStep={onNavigateToStep}
          />
        )}
        {stepViewNode || (
          <div style={{ color: token.colorTextSecondary, padding: 24, textAlign: 'center' }}>
            Nội dung hiển thị của bước {selectedStep}
          </div>
        )}
      </div>

      {/* Isolated Step AI Chat */}
      <div
        style={{
          flex: '0 0 380px',
          width: 380,
          minWidth: 320,
          maxWidth: 480,
          height: '100%',
          overflow: 'hidden',
        }}
      >
        <StepChatPanel
          ref={chatPanelRef}
          projectId={projectId}
          crId={crId}
          stepId={selectedStep}
          stepGroundingContext={stepGroundingContext}
          onSolutionExtracted={onSolutionExtracted}
          onRequestAiAnalysis={onRequestAiAnalysis}
          db={db}
        />
      </div>
    </div>
  );
};
