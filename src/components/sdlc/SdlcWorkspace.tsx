import React from 'react';
import { theme } from 'antd';
import type { TaskPlannerDatabase } from '../../db';
import type { SdlcStepId, SdlcWorkflowState } from '../../services/wizard/workflowSchemas';
import type { AiChatArtifactEvent } from '../ai/AiChatWidget';
import { StepChatPanel, type StepChatPanelHandle } from './chat/StepChatPanel';
import { ResizeSplitter } from "../common/ResizeSplitter";
import { SdlcStaleBanner } from './common/SdlcStaleBanner';

export const SDLC_CHAT_WIDTH_MIN = 320;
export const SDLC_CHAT_WIDTH_DEFAULT = 380;
export const SDLC_CHAT_WIDTH_MAX = 480;
export const SDLC_CHAT_WIDTH_KEY = 'planner:sdlc_chat_width';

const clampChatWidth = (width: number): number =>
  Number.isFinite(width) && width > 0
    ? Math.round(Math.max(SDLC_CHAT_WIDTH_MIN, Math.min(SDLC_CHAT_WIDTH_MAX, width)))
    : SDLC_CHAT_WIDTH_DEFAULT;

export interface SdlcWorkspaceProps {
  projectId: string;
  crId: string;
  selectedStep: SdlcStepId;
  workflowState?: SdlcWorkflowState | undefined;
  stepViewNode?: React.ReactNode;
  stepGroundingContext?: string;
  readOnly?: boolean;
  onNavigateToStep?: (step: SdlcStepId) => void;
  onSolutionExtracted?: ((solutionMarkdown: string) => void) | undefined;
  artifactEvents?: AiChatArtifactEvent[] | undefined;
  onArtifactOpen?: ((eventId: string, readOnly: boolean) => void) | undefined;
  onArtifactCta?: ((eventId: string) => void) | undefined;
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
  readOnly = false,
  onNavigateToStep,
  onSolutionExtracted,
  artifactEvents,
  onArtifactOpen,
  onArtifactCta,
  chatPanelRef,
  db,
}) => {
  const { token } = theme.useToken();
  const chatPaneId = React.useId();
  const [chatWidth, setChatWidth] = React.useState(() => {
    try {
      return clampChatWidth(Number(localStorage.getItem(SDLC_CHAT_WIDTH_KEY)));
    } catch {
      return SDLC_CHAT_WIDTH_DEFAULT;
    }
  });
  const updateChatWidth = (width: number) => {
    const clamped = clampChatWidth(width);
    setChatWidth(clamped);
    try {
      localStorage.setItem(SDLC_CHAT_WIDTH_KEY, String(clamped));
    } catch {}
  };

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
          flex: '1 1 auto',
          minWidth: 0,
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

      <ResizeSplitter
        side="right"
        currentWidth={chatWidth}
        minWidth={SDLC_CHAT_WIDTH_MIN}
        maxWidth={SDLC_CHAT_WIDTH_MAX}
        defaultWidth={SDLC_CHAT_WIDTH_DEFAULT}
        onResize={updateChatWidth}
        onReset={() => updateChatWidth(SDLC_CHAT_WIDTH_DEFAULT)}
        ariaLabel="Độ rộng khung chat SDLC"
        ariaControls={chatPaneId}
      />

      {/* Isolated Step AI Chat */}
      <div
        id={chatPaneId}
        data-testid="sdlc-chat-pane"
        style={{
          flex: `0 0 ${chatWidth}px`,
          width: chatWidth,
          minWidth: 0,
          maxWidth: 'none',
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
          readOnly={readOnly}
          onNavigateToStep={onNavigateToStep}
          {...(onSolutionExtracted ? { onSolutionExtracted } : {})}
          {...(artifactEvents ? { artifactEvents } : {})}
          {...(onArtifactOpen ? { onArtifactOpen } : {})}
          {...(onArtifactCta ? { onArtifactCta } : {})}
          db={db}
        />
      </div>
    </div>
  );
};
