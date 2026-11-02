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
import {
  createSdlcWorkflowCoordinator,
  defaultSha256,
  workflowStorageKey,
} from '../services/wizard/workflowCoordinator';
import { saveMessage } from '../db/repositories/chatRepo';
import { formatGuardMessage, WORKFLOW_GUARD_MESSAGES } from '../services/wizard/workflowGuards';
import {
  createSdlcWizardRuntime,
  type SdlcWizardRuntime,
} from '../services/wizard/sdlcWizardRuntime';
import { useOptionalKnowledgeConfig } from '../services/knowledge/knowledgeConfig';
import type {
  SdlcArtifactKind,
  SdlcStepId,
  SdlcWorkflowState,
} from '../services/wizard/workflowSchemas';
import type { AiChatArtifactEvent } from '../components/ai/AiChatWidget';
import type { StepChatPanelHandle } from '../components/sdlc/chat/StepChatPanel';
import { generateId } from '../utils/uuid';

export interface ProjectSdlcViewProps {
  projectId: string;
  onBack: () => void;
  db?: TaskPlannerDatabase;
}

function draftSettingKey(projectId: string, crId: string): string {
  return `sdlc_draft_solution:${projectId}:${crId}`;
}

function isGuardCode(code: unknown): code is keyof typeof WORKFLOW_GUARD_MESSAGES {
  return typeof code === 'string' && code in WORKFLOW_GUARD_MESSAGES;
}

export const ProjectSdlcView: React.FC<ProjectSdlcViewProps> = ({
  projectId,
  onBack,
  db = defaultDb,
}) => {
  const { token } = theme.useToken();
  const knowledgeConfig = useOptionalKnowledgeConfig();
  const [selectedStep, setSelectedStep] = useState<SdlcStepId>('INTAKE');
  const selectedStepRef = useRef<SdlcStepId>('INTAKE');
  const setSelectedStepTracked = useCallback((step: SdlcStepId) => {
    selectedStepRef.current = step;
    setSelectedStep(step);
  }, []);
  const [activeCrId, setActiveCrId] = useState<string>('');
  const [threadId, setThreadId] = useState<string>(() => generateId());
  const [workflowState, setWorkflowState] = useState<SdlcWorkflowState | undefined>(undefined);
  const [incomingSolutionDraft, setIncomingSolutionDraft] = useState<string | undefined>(undefined);
  const [draftPl03b, setDraftPl03b] = useState<string | undefined>(undefined);
  const [draftPl07, setDraftPl07] = useState<string | undefined>(undefined);
  const [wizardRuntime, setWizardRuntime] = useState<SdlcWizardRuntime | undefined>(undefined);
  const chatPanelRef = useRef<StepChatPanelHandle>(null);
  const analysisTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearAnalysisTimer = useCallback(() => {
    if (analysisTimerRef.current !== null) clearTimeout(analysisTimerRef.current);
    analysisTimerRef.current = null;
  }, []);

  useEffect(() => clearAnalysisTimer, [clearAnalysisTimer]);
  // `saveState`/`loadState` must see the CR selected in this same tick, not the next render's.
  const activeCrRef = useRef<string>('');

  const project = useLiveQuery(() => db.projects.get(projectId), [projectId, db]);
  const crList = useLiveQuery(() => listCrs(projectId, db), [projectId, db]) ?? [];
  const [readOnlySolution, setReadOnlySolution] = useState(false);
  // D-06: a historical card pins the owning step view to that exact approved version.
  const [viewedVersion, setViewedVersion] = useState<
    { kind: SdlcArtifactKind; version: number; content: string; title: string } | undefined
  >(undefined);

  // Cards for the step thread currently on screen (D-06: metadata only, body stays in the editor).
  const stepMessages =
    useLiveQuery(
      () => (threadId ? db.chatMessages.where('threadId').equals(threadId).toArray() : []),
      [threadId, db]
    ) ?? [];
  const crStatus = crList.find((cr) => cr.id === activeCrId)?.status ?? 'active';
  const activeVersions = workflowState?.activeVersions ?? {};
  const artifactEvents: AiChatArtifactEvent[] = useMemo(
    () =>
      stepMessages
        .filter((m) => m.artifactEvent)
        .map((m) => {
          const event = m.artifactEvent!;
          const active = activeVersions[event.kind] ?? event.version;
          return {
            id: m.id,
            kind: event.kind,
            title: event.title,
            version: event.version,
            hash: event.hash,
            status: event.status,
            ...(event.ctaLabel ? { ctaLabel: event.ctaLabel } : {}),
            readOnly: event.version !== active || crStatus !== 'active',
          };
        }),
    [stepMessages, activeVersions, crStatus]
  );

  const STEP_FOR_KIND: Partial<Record<SdlcArtifactKind, SdlcStepId>> = {
    SOLUTION: 'SOLUTION',
    PL03B: 'TECH_DOCS',
    PL07: 'TECH_DOCS',
    CAB: 'CAB',
  };

  /** One durable card per artifact version; cards are never rewritten (T-25.3-47). */
  const appendArtifactEvent = useCallback(
    async (
      stepId: SdlcStepId,
      kind: SdlcArtifactKind,
      ref: { title: string; version: number; hash: string },
      status: 'draft' | 'approved'
    ) => {
      const crId = activeCrRef.current;
      if (!crId) return;
      const thread = await getStepThread(projectId, crId, stepId, db);
      await saveMessage(
        {
          threadId: thread.id,
          role: 'assistant',
          content:
            status === 'draft'
              ? `Bản nháp ${kind} v${ref.version} — ${ref.title}`
              : `Đã phê duyệt ${kind} v${ref.version} — ${ref.title}`,
          artifactEvent: {
            kind,
            title: ref.title,
            version: ref.version,
            hash: ref.hash,
            status,
            ...(status === 'draft' ? { ctaLabel: 'Mở trình soạn thảo' } : {}),
          },
        },
        db
      );
    },
    [projectId, db]
  );

  /** Historical opens target the owning step and render read-only when inactive (D-06). */
  const handleArtifactOpen = useCallback(
    (eventId: string, readOnly: boolean) => {
      const event = stepMessages.find(
        (m) => m.id === eventId || m.artifactEvent?.eventId === eventId
      )?.artifactEvent;
      if (!event) return;
      const step = STEP_FOR_KIND[event.kind];
      if (step) setSelectedStepTracked(step);

      // The exact body comes from the version history, never from the active artifact.
      const history = workflowState?.versions?.[event.kind] ?? [];
      const pinned = history.find((ref) => ref.version === event.version && ref.content?.trim());
      if (pinned?.content) {
        setViewedVersion({
          kind: event.kind,
          version: pinned.version,
          content: pinned.content,
          title: pinned.title,
        });
      } else {
        setViewedVersion(undefined);
      }
      setReadOnlySolution(event.kind === 'SOLUTION' ? readOnly : false);
    },
    [stepMessages, workflowState?.versions, setSelectedStepTracked]
  );


  const selectCr = useCallback((crId: string) => {
    if (activeCrRef.current !== crId) clearAnalysisTimer();
    activeCrRef.current = crId;
    setActiveCrId(crId);
  }, [clearAnalysisTimer]);

  // Initialize active CR
  useEffect(() => {
    let cancelled = false;
    async function loadActiveCr() {
      const active = await getActiveCr(projectId, db);
      if (!cancelled) {
        if (active) {
          selectCr(active.id);
        } else if (crList.length > 0 && crList[0]) {
          selectCr(crList[0].id);
        }
      }
    }
    void loadActiveCr();
    return () => {
      cancelled = true;
    };
  }, [projectId, crList.length, db, selectCr]);

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
    void syncThread();
    return () => {
      cancelled = true;
    };
  }, [projectId, activeCrId, selectedStep, db]);

  // Editor draft persistence (D-08). This is editor state, not workflow state.
  useEffect(() => {
    let cancelled = false;
    async function loadDraft() {
      const crKey = activeCrId || 'default-cr';
      try {
        const draftRow = await db.settings.get(draftSettingKey(projectId, crKey));
        if (!cancelled) {
          setIncomingSolutionDraft(draftRow?.value ? String(draftRow.value) : undefined);
        }
      } catch {
        if (!cancelled) setIncomingSolutionDraft(undefined);
      }
    }
    void loadDraft();
    return () => {
      cancelled = true;
    };
  }, [projectId, activeCrId, db]);

  // The coordinator's in-memory state is the version chain's source of truth. It must
  // survive step switches: `threadId` changes on every step navigation, so reading it from
  // the render scope would recreate the coordinator and silently discard the loaded
  // `versions`/`activeVersions` (a second approval would then re-commit v1).
  const threadIdRef = useRef(threadId);
  threadIdRef.current = threadId;

  // The coordinator is the only writer of persisted workflow rows (D-23).
  const coordinator = useMemo(
    () =>
      createSdlcWorkflowCoordinator({
        projectId,
        get threadId() {
          return threadIdRef.current;
        },
        saveState: async (state) => {
          const crId = activeCrRef.current;
          if (!crId) return;
          await db.settings.put({
            key: workflowStorageKey(projectId, crId),
            value: JSON.stringify(state),
          });
        },
        loadState: async () => {
          const crId = activeCrRef.current;
          if (!crId) return undefined;
          const row = await db.settings.get(workflowStorageKey(projectId, crId));
          if (!row?.value) return undefined;
          try {
            return JSON.parse(String(row.value)) as SdlcWorkflowState;
          } catch {
            return undefined;
          }
        },
        deleteState: async () => {
          const crId = activeCrRef.current;
          if (!crId) return;
          await db.settings.delete(workflowStorageKey(projectId, crId));
        },
        onStateChange: (newState) => setWorkflowState(newState),
      }),
    [projectId, db]
  );

  // Restore before any step action can render as enabled (T-25.3-34).
  useEffect(() => {
    let cancelled = false;
    if (!activeCrId) {
      setWorkflowState(undefined);
      return undefined;
    }
    void (async () => {
      try {
        const restored = await coordinator.restore();
        if (!cancelled) setWorkflowState(restored);
      } catch {
        // A failed restore leaves prerequisites unproven, so step views render their guards.
        if (!cancelled) setWorkflowState(undefined);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [coordinator, activeCrId]);

  // Wizard runtime is built once per DB. A missing model is a configuration guard, not a crash.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const runtime = await createSdlcWizardRuntime({
          db,
          ...(knowledgeConfig.enabled && knowledgeConfig.baseUrl
            ? { knowledgeBaseUrl: knowledgeConfig.baseUrl, knowledgeToken: knowledgeConfig.token }
            : {}),
        });
        if (!cancelled) setWizardRuntime(runtime);
      } catch {
        if (!cancelled) setWizardRuntime(undefined);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, knowledgeConfig.enabled, knowledgeConfig.baseUrl, knowledgeConfig.token]);

  /** Surfaces a guard code as actionable Vietnamese copy; raw internal detail never escapes. */
  const reportGuardError = useCallback((err: unknown) => {
    const code = (err as { code?: unknown } | null)?.code;
    if (isGuardCode(code)) {
      message.error(formatGuardMessage(code));
      return;
    }
    message.error('Không thể hoàn tất thao tác. Vui lòng kiểm tra lại hồ sơ của bước trước.');
  }, []);

  const scheduleSolutionAnalysis = useCallback(() => {
    const crId = activeCrRef.current;
    clearAnalysisTimer();
    setSelectedStepTracked('SOLUTION');
    // Only explicit intake activation or re-analysis may schedule a turn, never mounting.
    analysisTimerRef.current = setTimeout(() => {
      analysisTimerRef.current = null;
      if (selectedStepRef.current !== 'SOLUTION' || activeCrRef.current !== crId) return;
      chatPanelRef.current?.requestArtifactAnalysis();
    }, 150);
  }, [clearAnalysisTimer, setSelectedStepTracked]);

  const handleTriggerSolutionAnalysis = useCallback(() => {
    scheduleSolutionAnalysis();
  }, [scheduleSolutionAnalysis]);

  const saveDraft = useCallback(
    async (markdown: string) => {
      const crKey = activeCrRef.current || 'default-cr';
      setIncomingSolutionDraft(markdown);
      await db.settings.put({ key: draftSettingKey(projectId, crKey), value: markdown });
    },
    [projectId, db]
  );

  // D-16: a chat-produced SOLUTION only updates the editor draft.
  const handleSolutionExtracted = useCallback(
    async (draftMarkdown: string) => {
      await saveDraft(draftMarkdown);
      await appendArtifactEvent(
        'SOLUTION',
        'SOLUTION',
        {
          title: 'SOLUTION.md',
          version: (activeVersions.SOLUTION ?? workflowState?.artifacts.solution?.version ?? 0) + 1,
          hash: await defaultSha256(draftMarkdown),
        },
        'draft'
      );
      message.success('Đã tự động trích xuất SOLUTION.md vào trình soạn thảo');
    },
    [saveDraft, appendArtifactEvent, activeVersions.SOLUTION, workflowState?.artifacts.solution?.version]
  );

  const handleStartIntake = async (
    metadata: Parameters<typeof coordinator.startOrUpdateIntake>[0],
    pl01: string,
    pl02: string
  ) => {
    try {
      if (!activeCrRef.current) {
        const created = await createNewCr(projectId, metadata, false, db);
        selectCr(created.id);
      }
      const nextState = await coordinator.startOrUpdateIntake(metadata, pl01, pl02);
      setWorkflowState(nextState);
      setSelectedStepTracked('SOLUTION');
      scheduleSolutionAnalysis();
    } catch (err) {
      reportGuardError(err);
    }
  };

  const handleCommitSolution = async (markdown: string, noteId: string) => {
    try {
      const nextState = await coordinator.commitSolution(markdown, noteId);
      await db.settings.delete(draftSettingKey(projectId, activeCrRef.current || 'default-cr'));
      setWorkflowState(nextState);
      if (nextState.artifacts.solution) {
        await appendArtifactEvent('SOLUTION', 'SOLUTION', nextState.artifacts.solution, 'approved');
      }
      setReadOnlySolution(false);
    } catch (err) {
      reportGuardError(err);
    }
  };

  // Reset through the coordinator so no view writes the workflow key behind its back.
  const handleResetWorkflow = useCallback(async () => {
    try {
      await coordinator.reset();
      await db.settings.delete(draftSettingKey(projectId, activeCrRef.current || 'default-cr'));
      setWorkflowState(undefined);
      setIncomingSolutionDraft(undefined);
      clearAnalysisTimer();
      setSelectedStepTracked('INTAKE');
      message.success('Đã đặt lại quy trình về ban đầu. Ghi chú đã lưu vẫn được bảo toàn.');
    } catch (err) {
      reportGuardError(err);
    }
  }, [coordinator, projectId, db, reportGuardError, clearAnalysisTimer, setSelectedStepTracked]);

  const handleNavigateToStep = useCallback(
    (step: SdlcStepId) => {
      clearAnalysisTimer();
      setSelectedStepTracked(step);
      void coordinator.navigateToStep(step).catch(reportGuardError);
      // Any explicit navigation returns the step to its live artifact.
      setViewedVersion(undefined);
      setReadOnlySolution(false);
    },
    [coordinator, reportGuardError, clearAnalysisTimer, setSelectedStepTracked]
  );

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
            hasIntakeBaseline={Boolean(
              workflowState?.artifacts.pl01 && workflowState?.artifacts.pl02
            )}
            readOnly={readOnlySolution}
            viewedVersion={
              viewedVersion?.kind === 'SOLUTION'
                ? { version: viewedVersion.version, content: viewedVersion.content, title: viewedVersion.title }
                : undefined
            }
            onNavigateToStep={handleNavigateToStep}
            onCommitSolution={handleCommitSolution}
            onDraftChange={(markdown) => {
              void saveDraft(markdown);
            }}
            onRequestAiAnalysis={handleTriggerSolutionAnalysis}
            onProceedToStep3={() => handleNavigateToStep('CODE_GUIDE')}
            db={db}
          />
        );
      case 'CODE_GUIDE':
        return (
          <Step3CodeGuideView
            crCode={workflowState?.metadata.cr ?? ''}
            approvedSolutionMarkdown={workflowState?.artifacts.solution?.content}
            onProceedToStep4={() => handleNavigateToStep('CHANGE_PACK')}
            onNavigateToStep={handleNavigateToStep}
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
              try {
                const nextState = await coordinator.commitChangePackAndDrift(
                  packHash,
                  packTitle,
                  driftResult
                );
                setWorkflowState(nextState);
              } catch (err) {
                reportGuardError(err);
              }
            }}
            onNavigateToStep={handleNavigateToStep}
            onProceedToStep5={() => handleNavigateToStep('TECH_DOCS')}
            db={db}
          />
        );
      case 'TECH_DOCS':
        return (
          <Step5TechDocsView
            projectId={projectId}
            crId={activeCrId}
            workflowState={workflowState}
            draftPl03b={draftPl03b}
            draftPl07={draftPl07}
            onDraftChange={(kind, markdown) => {
              if (kind === 'PL03B') setDraftPl03b(markdown);
              else setDraftPl07(markdown);
            }}
            onCommitTechDoc={async (kind, markdown, noteId) => {
              try {
                const nextState = await coordinator.commitTechDoc(kind, markdown, noteId);
                setWorkflowState(nextState);
                const ref = kind === 'PL03B' ? nextState.artifacts.pl03b : nextState.artifacts.pl07;
                if (ref) await appendArtifactEvent('TECH_DOCS', kind, ref, 'approved');
              } catch (err) {
                reportGuardError(err);
              }
            }}
            wizardRuntime={wizardRuntime}
            viewedVersion={
              viewedVersion?.kind === 'PL03B' || viewedVersion?.kind === 'PL07'
                ? {
                    kind: viewedVersion.kind,
                    version: viewedVersion.version,
                    content: viewedVersion.content,
                    title: viewedVersion.title,
                  }
                : undefined
            }
            onNavigateToStep={handleNavigateToStep}
            onProceedToStep6={() => handleNavigateToStep('CAB')}
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
              try {
                const nextState = await coordinator.commitCab(markdown, noteId);
                setWorkflowState(nextState);
                if (nextState.artifacts.cab) {
                  await appendArtifactEvent('CAB', 'CAB', nextState.artifacts.cab, 'approved');
                }
              } catch (err) {
                reportGuardError(err);
              }
            }}
            wizardRuntime={wizardRuntime}
            viewedVersion={
              viewedVersion?.kind === 'CAB'
                ? { version: viewedVersion.version, content: viewedVersion.content, title: viewedVersion.title }
                : undefined
            }
            onNavigateToStep={handleNavigateToStep}
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
          // Sidebar navigation goes through the same path as every other step change, so a
          // pinned historical version is cleared and currentStep is persisted (D-06, D-23).
          onSelectStep={handleNavigateToStep}
          activeCrId={activeCrId}
          onSelectCr={selectCr}
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
          onNavigateToStep={handleNavigateToStep}
          onSolutionExtracted={handleSolutionExtracted}
          artifactEvents={artifactEvents}
          onArtifactOpen={handleArtifactOpen}
          onArtifactCta={(eventId) => {
            const event = stepMessages.find((m) => m.id === eventId);
            handleArtifactOpen(eventId, event?.artifactEvent?.status === 'approved' ? false : true);
          }}
          db={db}
        />
      </div>
    </div>
  );
};
