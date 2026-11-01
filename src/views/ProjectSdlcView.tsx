import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { theme, Button } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import { PageHeader } from '../components/common/PageHeader';
import { SdlcSidebar } from '../components/sdlc/SdlcSidebar';
import { SdlcWorkspace } from '../components/sdlc/SdlcWorkspace';
import { Step1IntakeView } from '../components/sdlc/steps/Step1IntakeView';
import { Step2SolutionView } from '../components/sdlc/steps/Step2SolutionView';
import { Step3CodeGuideView } from '../components/sdlc/steps/Step3CodeGuideView';
import { Step4ChangePackView } from '../components/sdlc/steps/Step4ChangePackView';
import { Step5TechDocsView } from '../components/sdlc/steps/Step5TechDocsView';
import { Step6CabView } from '../components/sdlc/steps/Step6CabView';
import { listCrs, getActiveCr } from '../services/wizard/sdlcCrManager';
import { createSdlcWorkflowCoordinator } from '../services/wizard/workflowCoordinator';
import type { SdlcStepId, SdlcWorkflowState } from '../services/wizard/workflowSchemas';

export interface ProjectSdlcViewProps {
  projectId: string;
  onBack: () => void;
  db?: TaskPlannerDatabase;
}

export const ProjectSdlcView: React.FC<ProjectSdlcViewProps> = ({
  projectId,
  onBack,
  db = defaultDb,
}) => {
  const { token } = theme.useToken();
  const [selectedStep, setSelectedStep] = useState<SdlcStepId>('INTAKE');
  const [activeCrId, setActiveCrId] = useState<string>('');
  const [workflowState, setWorkflowState] = useState<SdlcWorkflowState | undefined>(undefined);

  const project = useLiveQuery(() => db.projects.get(projectId), [projectId, db]);
  const crList = useLiveQuery(() => listCrs(projectId, db), [projectId, db]) ?? [];

  // Initialize active CR
  useEffect(() => {
    let cancelled = false;
    async function loadActiveCr() {
      const active = await getActiveCr(projectId, db);
      if (!cancelled) {
        if (active) {
          setActiveCrId(active.id);
        } else if (crList.length > 0 && crList[0]) {
          setActiveCrId(crList[0].id);
        }
      }
    }
    loadActiveCr();
    return () => {
      cancelled = true;
    };
  }, [projectId, crList.length, db]);

  // Coordinator setup
  const coordinator = useMemo(() => {
    return createSdlcWorkflowCoordinator({
      projectId,
      threadId: activeCrId ? `sdlc:${projectId}:${activeCrId}:${selectedStep}` : `sdlc:${projectId}:${selectedStep}`,
      onStateChange: (newState) => {
        setWorkflowState(newState);
      },
    });
  }, [projectId, activeCrId, selectedStep]);

  // Handlers for Step 1 & Step 2
  const handleStartIntake = async (
    metadata: Parameters<typeof coordinator.startOrUpdateIntake>[0],
    pl01: string,
    pl02: string
  ) => {
    await coordinator.startOrUpdateIntake(metadata, pl01, pl02);
    setSelectedStep('SOLUTION');
  };

  const handleCommitSolution = async (markdown: string, noteId: string) => {
    await coordinator.commitSolution(markdown, noteId);
  };

  const renderStepNode = () => {
    switch (selectedStep) {
      case 'INTAKE':
        return (
          <Step1IntakeView
            projectId={projectId}
            initialMetadata={workflowState?.metadata}
            initialPl01={workflowState?.artifacts.pl01?.content}
            initialPl02={workflowState?.artifacts.pl02?.content}
            onStartIntake={handleStartIntake}
            db={db}
          />
        );
      case 'SOLUTION':
        return (
          <Step2SolutionView
            projectId={projectId}
            crId={activeCrId}
            solutionArtifact={workflowState?.artifacts.solution}
            initialContent={workflowState?.artifacts.solution?.content}
            onCommitSolution={handleCommitSolution}
            onProceedToStep3={() => setSelectedStep('CODE_GUIDE')}
            db={db}
          />
        );
      case 'CODE_GUIDE':
        return (
          <Step3CodeGuideView
            crCode={workflowState?.metadata.cr}
            onProceedToStep4={() => setSelectedStep('CHANGE_PACK')}
          />
        );
      case 'CHANGE_PACK':
        return (
          <Step4ChangePackView
            projectId={projectId}
            crId={activeCrId}
            crCode={workflowState?.metadata.cr ?? ''}
            solutionArtifact={workflowState?.artifacts.solution}
            initialDriftResult={workflowState?.artifacts.driftResult}
            onCommitChangePackAndDrift={async (packHash, packTitle, driftResult) => {
              await coordinator.commitChangePackAndDrift(packHash, packTitle, driftResult);
            }}
            onProceedToStep5={() => setSelectedStep('TECH_DOCS')}
            db={db}
          />
        );
      case 'TECH_DOCS':
        return (
          <Step5TechDocsView
            projectId={projectId}
            crId={activeCrId}
            workflowState={workflowState}
            onCommitTechDoc={async (kind, markdown, noteId) => {
              await coordinator.commitTechDoc(kind, markdown, noteId);
            }}
            onProceedToStep6={() => setSelectedStep('CAB')}
            db={db}
          />
        );
      case 'CAB':
        return (
          <Step6CabView
            projectId={projectId}
            crId={activeCrId}
            workflowState={workflowState}
            onCommitCab={async (markdown, noteId) => {
              await coordinator.commitCab(markdown, noteId);
            }}
            db={db}
          />
        );
      default:
        return (
          <div style={{ color: token.colorTextSecondary, padding: 32, textAlign: 'center' }}>
            Nội dung hiển thị của bước {selectedStep}
          </div>
        );
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: '80vh',
        background: token.colorBgContainer,
        borderRadius: token.borderRadiusLG,
        overflow: 'hidden',
        border: `1px solid ${token.colorBorderSecondary}`,
      }}
    >
      <PageHeader
        title={`SDLC Studio — ${project?.name ?? 'Dự án'}`}
        subtitle="Môi trường phát triển & kiểm soát chất lượng bàn giao 6 bước"
        extra={
          <Button icon={<ArrowLeftOutlined />} onClick={onBack}>
            Quay lại Dự án
          </Button>
        }
      />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <SdlcSidebar
          projectId={projectId}
          selectedStep={selectedStep}
          onSelectStep={setSelectedStep}
          activeCrId={activeCrId}
          onSelectCr={setActiveCrId}
          db={db}
        />
        <SdlcWorkspace
          projectId={projectId}
          crId={activeCrId}
          selectedStep={selectedStep}
          workflowState={workflowState}
          stepViewNode={renderStepNode()}
          db={db}
        />
      </div>
    </div>
  );
};
