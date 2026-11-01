import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { theme, Button } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import { PageHeader } from '../components/common/PageHeader';
import { SdlcSidebar } from '../components/sdlc/SdlcSidebar';
import { SdlcWorkspace } from '../components/sdlc/SdlcWorkspace';
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
          db={db}
        />
      </div>
    </div>
  );
};
