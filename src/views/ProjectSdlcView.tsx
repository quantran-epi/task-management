import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { theme, Button, Popconfirm, Space, message } from 'antd';
import { ArrowLeftOutlined, RedoOutlined } from '@ant-design/icons';
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
import { listCrs, getActiveCr, createNewCr, getStepThread } from '../services/wizard/sdlcCrManager';
import { createSdlcWorkflowCoordinator } from '../services/wizard/workflowCoordinator';
import type { SdlcStepId, SdlcWorkflowState } from '../services/wizard/workflowSchemas';
import type { StepChatPanelHandle } from '../components/sdlc/chat/StepChatPanel';
import { generateId } from '../utils/uuid';

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
  const [threadId, setThreadId] = useState<string>(() => generateId());
  const [workflowState, setWorkflowState] = useState<SdlcWorkflowState | undefined>(undefined);
  const [incomingSolutionDraft, setIncomingSolutionDraft] = useState<string | undefined>(undefined);
  const chatPanelRef = useRef<StepChatPanelHandle>(null);

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

  // Sync isolated thread for current CR and step
  useEffect(() => {
    let cancelled = false;
    async function syncThread() {
      if (activeCrId) {
        const t = await getStepThread(projectId, activeCrId, selectedStep, db);
        if (!cancelled && t) {
          setThreadId(t.id);
        }
      }
    }
    syncThread();
    return () => {
      cancelled = true;
    };
  }, [projectId, activeCrId, selectedStep, db]);

  // Load persistent workflow state and draft when activeCrId changes
  useEffect(() => {
    let cancelled = false;
    async function loadWorkflowState() {
      const crKey = activeCrId || 'default-cr';
      try {
        const row = await db.settings.get(`sdlc_workflow:${projectId}:${crKey}`);
        const draftRow = await db.settings.get(`sdlc_draft_solution:${projectId}:${crKey}`);
        if (!cancelled) {
          if (row?.value) {
            setWorkflowState(JSON.parse(String(row.value)));
          } else {
            setWorkflowState(undefined);
          }
          if (draftRow?.value) {
            setIncomingSolutionDraft(String(draftRow.value));
          } else {
            setIncomingSolutionDraft(undefined);
          }
        }
      } catch {
        if (!cancelled) {
          setWorkflowState(undefined);
          setIncomingSolutionDraft(undefined);
        }
      }
    }
    loadWorkflowState();
    return () => {
      cancelled = true;
    };
  }, [projectId, activeCrId, db]);

  // Coordinator setup with durable state persistence
  const coordinator = useMemo(() => {
    return createSdlcWorkflowCoordinator({
      projectId,
      threadId,
      saveState: async (state) => {
        if (activeCrId) {
          await db.settings.put({
            key: `sdlc_workflow:${projectId}:${activeCrId}`,
            value: JSON.stringify(state),
          });
        }
      },
      loadState: async () => {
        if (!activeCrId) return undefined;
        const row = await db.settings.get(`sdlc_workflow:${projectId}:${activeCrId}`);
        if (!row?.value) return undefined;
        try {
          return JSON.parse(String(row.value));
        } catch {
          return undefined;
        }
      },
      onStateChange: (newState) => {
        setWorkflowState(newState);
      },
    });
  }, [projectId, threadId, activeCrId, db]);

  // Solution analysis trigger via Chat (D-06)
  const handleTriggerSolutionAnalysis = useCallback(async () => {
    setSelectedStep('SOLUTION');
    const pl01 = workflowState?.artifacts.pl01?.content || '';
    const pl02 = workflowState?.artifacts.pl02?.content || '';
    const meta = workflowState?.metadata;

    const analysisPrompt = `Hãy phân tích kiến trúc và viết văn bản SOLUTION.md hoàn chỉnh cho Change Request sau:
- Mã CR: ${meta?.cr || activeCrId}
- Tính năng: ${meta?.featureName || 'Chưa đặt tên'}
- Đơn vị yêu cầu: ${meta?.requestingUnit || 'Chưa cung cấp'}

YÊU CẦU NGHIỆP VỤ (PL01):
${pl01 || '(Chưa có nội dung PL01)'}

ĐẶC TẢ CHỨC NĂNG (PL02):
${pl02 || '(Chưa có nội dung PL02)'}

Vui lòng rà soát cơ sở dữ liệu hiện có bằng công cụ tra cứu, bóc tách API & bảng dữ liệu cần tạo/sửa.
Đồng thời, hãy viết một đoạn tóm tắt ngắn gọn thân thiện (2-4 câu) giải thích những điểm chính đã thiết kế/chỉnh sửa và thông báo cho người dùng xem chi tiết tại trình soạn thảo bên trái. Đặt toàn bộ nội dung SOLUTION.md hoàn chỉnh trong khối \`\`\`markdown bắt đầu bằng:
# SOLUTION — ${meta?.featureName || 'Thiết kế giải pháp'}`;

    setTimeout(() => {
      chatPanelRef.current?.sendMessage(analysisPrompt);
    }, 150);
  }, [workflowState, activeCrId]);

  // Auto-extraction and durable draft persistence (D-07, D-08)
  const handleSolutionExtracted = useCallback(
    async (draftMarkdown: string) => {
      setIncomingSolutionDraft(draftMarkdown);
      const crKey = activeCrId || 'default-cr';
      await db.settings.put({
        key: `sdlc_draft_solution:${projectId}:${crKey}`,
        value: draftMarkdown,
      });
      message.success('Đã tự động trích xuất SOLUTION.md vào trình soạn thảo');
    },
    [activeCrId, projectId, db]
  );

  // Editor keystroke draft persistence (D-08)
  const handleDraftChange = useCallback(
    async (draftMarkdown: string) => {
      const crKey = activeCrId || 'default-cr';
      setIncomingSolutionDraft(draftMarkdown);
      await db.settings.put({
        key: `sdlc_draft_solution:${projectId}:${crKey}`,
        value: draftMarkdown,
      });
    },
    [activeCrId, projectId, db]
  );

  // Handlers for Step 1 & Step 2
  const handleStartIntake = async (
    metadata: Parameters<typeof coordinator.startOrUpdateIntake>[0],
    pl01: string,
    pl02: string
  ) => {
    let currentCr = activeCrId;
    if (!currentCr) {
      const created = await createNewCr(projectId, metadata, false, db);
      currentCr = created.id;
      setActiveCrId(created.id);
    }
    const nextState = await coordinator.startOrUpdateIntake(metadata, pl01, pl02);
    if (currentCr) {
      await db.settings.put({
        key: `sdlc_workflow:${projectId}:${currentCr}`,
        value: JSON.stringify(nextState),
      });
    }
    setWorkflowState(nextState);
    setSelectedStep('SOLUTION');

    // Trigger explicit solution analysis in chat per D-06
    const analysisPrompt = `Hãy phân tích kiến trúc và viết văn bản SOLUTION.md hoàn chỉnh cho Change Request sau:
- Mã CR: ${metadata.cr}
- Tính năng: ${metadata.featureName}
- Đơn vị yêu cầu: ${metadata.requestingUnit}

YÊU CẦU NGHIỆP VỤ (PL01):
${pl01}

ĐẶC TẢ CHỨC NĂNG (PL02):
${pl02}

Vui lòng rà soát cơ sở dữ liệu hiện có bằng công cụ tra cứu, bóc tách API & bảng dữ liệu cần tạo/sửa.
Đồng thời, hãy viết một đoạn tóm tắt ngắn gọn thân thiện (2-4 câu) giải thích những điểm chính đã thiết kế/chỉnh sửa và thông báo cho người dùng xem chi tiết tại trình soạn thảo bên trái. Đặt toàn bộ nội dung SOLUTION.md hoàn chỉnh trong khối \`\`\`markdown bắt đầu bằng:
# SOLUTION — ${metadata.featureName}`;

    setTimeout(() => {
      chatPanelRef.current?.sendMessage(analysisPrompt);
    }, 150);
  };

  const handleCommitSolution = async (markdown: string, noteId: string) => {
    const nextState = await coordinator.commitSolution(markdown, noteId);
    const crKey = activeCrId || 'default-cr';
    if (activeCrId) {
      await db.settings.put({
        key: `sdlc_workflow:${projectId}:${activeCrId}`,
        value: JSON.stringify(nextState),
      });
    }
    await db.settings.delete(`sdlc_draft_solution:${projectId}:${crKey}`);
    setWorkflowState(nextState);
  };

  // Reset workflow handler (per T-25.1.2-07: keeps notes intact, resets workflow state)
  const handleResetWorkflow = useCallback(async () => {
    const crKey = activeCrId || 'default-cr';
    if (activeCrId) {
      await db.settings.delete(`sdlc_workflow:${projectId}:${activeCrId}`);
    }
    await db.settings.delete(`sdlc_draft_solution:${projectId}:${crKey}`);
    setWorkflowState(undefined);
    setIncomingSolutionDraft(undefined);
    setSelectedStep('INTAKE');
    message.success('Đã đặt lại quy trình về ban đầu. Ghi chú đã lưu vẫn được bảo toàn.');
  }, [activeCrId, projectId, db]);

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
            incomingDraft={incomingSolutionDraft}
            pl01Content={workflowState?.artifacts.pl01?.content}
            pl02Content={workflowState?.artifacts.pl02?.content}
            metadata={workflowState?.metadata}
            onCommitSolution={handleCommitSolution}
            onDraftChange={handleDraftChange}
            onRequestAiAnalysis={handleTriggerSolutionAnalysis}
            onProceedToStep3={() => setSelectedStep('CODE_GUIDE')}
            db={db}
          />
        );
      case 'CODE_GUIDE':
        return (
          <Step3CodeGuideView
            crCode={workflowState?.metadata.cr ?? ''}
            approvedSolutionMarkdown={workflowState?.artifacts.solution?.content}
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
            onNavigateToStep={(step) => setSelectedStep(step)}
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
        height: 'calc(100vh - 100px)',
        minHeight: 640,
        background: token.colorBgContainer,
        borderRadius: token.borderRadiusLG,
        overflow: 'hidden',
        border: `1px solid ${token.colorBorderSecondary}`,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
      }}
    >
      <div
        style={{
          padding: '14px 20px',
          background: `linear-gradient(to right, rgba(79, 70, 229, 0.04) 0%, ${token.colorBgContainer} 100%)`,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          flexShrink: 0,
        }}
      >
        <PageHeader
          title={`SDLC Studio — ${project?.name ?? 'Dự án'}`}
          subtitle="Môi trường phát triển & kiểm soát chất lượng bàn giao 6 bước"
          style={{ marginBottom: 0 }}
          extra={
            <Space>
              {workflowState && (
                <Popconfirm
                  title="Đặt lại quy trình SDLC?"
                  description="Hành động này sẽ làm mới các bước trong CR hiện tại. Toàn bộ Ghi chú đã lưu trong Dự án không bị xóa."
                  okText="Đặt lại"
                  cancelText="Hủy"
                  onConfirm={handleResetWorkflow}
                  data-testid="btn-reset-workflow"
                >
                  <Button icon={<RedoOutlined />}>Đặt lại quy trình</Button>
                </Popconfirm>
              )}
              <Button icon={<ArrowLeftOutlined />} onClick={onBack}>
                Quay lại Dự án
              </Button>
            </Space>
          }
        />
      </div>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <SdlcSidebar
          projectId={projectId}
          selectedStep={selectedStep}
          onSelectStep={setSelectedStep}
          activeCrId={activeCrId}
          onSelectCr={setActiveCrId}
          workflowState={workflowState}
          db={db}
        />
        <SdlcWorkspace
          chatPanelRef={chatPanelRef}
          projectId={projectId}
          crId={activeCrId}
          selectedStep={selectedStep}
          workflowState={workflowState}
          stepViewNode={renderStepNode()}
          onNavigateToStep={setSelectedStep}
          onSolutionExtracted={handleSolutionExtracted}
          onRequestAiAnalysis={handleTriggerSolutionAnalysis}
          db={db}
        />
      </div>
    </div>
  );
};
