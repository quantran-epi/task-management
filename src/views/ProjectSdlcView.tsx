import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { theme, Button, Popconfirm, Space, Typography, message } from 'antd';
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
import { buildSdlcStepGroundingResult } from '../services/sdlc/groundingBuilder';
import type { SdlcArtifactKindForTurn } from '../services/ai/sdlcPromptComposer';
import type { WizardEvidence } from '../services/ai/wizardService';
import { useOptionalKnowledgeConfig } from '../services/knowledge/knowledgeConfig';
import type {
  SdlcArtifactKind,
  SdlcStepId,
  SdlcWorkflowState,
} from '../services/wizard/workflowSchemas';
import type { AiChatArtifactEvent } from '../components/ai/AiChatWidget';
import type { StepChatPanelHandle } from '../components/sdlc/chat/StepChatPanel';
import { generateId } from '../utils/uuid';
import type { ChatMessage } from '../types/models';
import { readArtifactSnapshot, type ArtifactPatchProposal, type ArtifactToolContext, type ArtifactToolKind } from '../services/ai/sdlcArtifactTools';
import { getGlobalConventions, loadRepoConventions, type RepoConventionResult } from '../services/conventionService';
import type { ConventionsSummaryProps } from '../components/sdlc/common/ConventionsSummaryCard';
import { RepoConfigView } from '../components/sdlc/config/RepoConfigView';

export interface ProjectSdlcViewProps {
  projectId?: string;
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
  projectId: propProjectId = '',
  onBack,
  db = defaultDb,
}) => {
  const { token } = theme.useToken();
  const [selectedProjectId, setSelectedProjectId] = useState<string>(propProjectId);
  const allProjects = useLiveQuery(() => db.projects.toArray(), [db]) ?? [];

  useEffect(() => {
    if (propProjectId) {
      setSelectedProjectId(propProjectId);
    }
  }, [propProjectId]);

  useEffect(() => {
    if (!selectedProjectId && allProjects.length > 0 && allProjects[0]) {
      setSelectedProjectId(allProjects[0].id);
    }
  }, [selectedProjectId, allProjects]);

  const projectId = selectedProjectId;
  const knowledgeConfig = useOptionalKnowledgeConfig();
  const [selectedStep, setSelectedStep] = useState<SdlcStepId>('INTAKE');
  const selectedStepRef = useRef<SdlcStepId>('INTAKE');
  const setSelectedStepTracked = useCallback((step: SdlcStepId) => {
    if (selectedStepRef.current !== step) {
      scopeEpochRef.current += 1;
      patchTransactionRef.current?.abort();
    }
    selectedStepRef.current = step;
    setSelectedStep(step);
  }, []);
  const [activeCrId, setActiveCrId] = useState<string>('');
  const [stepThread, setStepThread] = useState(() => ({ id: generateId(), scopeKey: '' }));
  const threadId = stepThread.id;
  const threadReady = stepThread.scopeKey === `sdlc:${projectId}:${activeCrId}:${selectedStep}`;
  const [workflowState, setWorkflowState] = useState<SdlcWorkflowState | undefined>(undefined);
  // The step editors gate approval on a proven intake baseline, so they must not mount before
  // this CR's workflow restore settles: a transiently empty state renders a wrongly blocked
  // editor and drops an early click (T-25.3-34).
  const [workflowRestored, setWorkflowRestored] = useState(false);
  const [stepEvidence, setStepEvidence] = useState<WizardEvidence | undefined>(undefined);
  const [incomingSolutionDraft, setIncomingSolutionDraft] = useState<string | undefined>(undefined);
  const [draftPl03b, setDraftPl03b] = useState<string | undefined>(undefined);
  const [draftPl07, setDraftPl07] = useState<string | undefined>(undefined);
  const [draftCab, setDraftCab] = useState<string | undefined>(undefined);
  const [wizardRuntime, setWizardRuntime] = useState<SdlcWizardRuntime | undefined>(undefined);
  const draftRef = useRef<Partial<Record<ArtifactToolKind, string>>>({});
  const editEpochRef = useRef(0);
  const scopeEpochRef = useRef(0);
  const mountedRef = useRef(true);
  const solutionWritesRef = useRef(new Map<string, Promise<void>>());
  const patchTransactionRef = useRef<{ abort: () => void } | null>(null);
  const [draftHashes, setDraftHashes] = useState<Partial<Record<ArtifactToolKind, string>>>({});
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; scopeEpochRef.current += 1; patchTransactionRef.current?.abort(); };
  }, []);
  const chatPanelRef = useRef<StepChatPanelHandle>(null);
  const analysisTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearAnalysisTimer = useCallback(() => {
    if (analysisTimerRef.current !== null) clearTimeout(analysisTimerRef.current);
    analysisTimerRef.current = null;
  }, []);

  useEffect(() => clearAnalysisTimer, [clearAnalysisTimer]);
  // Guards late callbacks from a coordinator belonging to a previously selected CR.
  const activeCrRef = useRef<string>('');

  const project = useLiveQuery(() => db.projects.get(projectId), [projectId, db]);
  const crList = useLiveQuery(() => listCrs(projectId, db), [projectId, db]) ?? [];
  const [readOnlySolution, setReadOnlySolution] = useState(false);

  // Active ChangeRequest and target subsystems resolution
  const activeCrRecord = useLiveQuery(
    () => (activeCrId ? db.changeRequests.get(activeCrId) : undefined),
    [activeCrId, db]
  );
  const crTargetSystems = useLiveQuery(async () => {
    if (!activeCrRecord?.targetSystemIds || activeCrRecord.targetSystemIds.length === 0) return [];
    return db.systems.where('id').anyOf(activeCrRecord.targetSystemIds).toArray();
  }, [activeCrRecord?.targetSystemIds, db]) ?? [];

  // Conventions state (D-07, D-08, D-13)
  const [globalConventions, setGlobalConventions] = useState<string>('');
  const [repoConventions, setRepoConventions] = useState<RepoConventionResult | null>(null);
  const [conventionsLoading, setConventionsLoading] = useState<boolean>(false);
  const [sshStatus, setSshStatus] = useState<'connected' | 'not_linked' | 'error' | 'file_not_found'>('not_linked');
  const [isConfigActive, setIsConfigActive] = useState<boolean>(false);

  const fetchAllConventions = useCallback(async () => {
    setConventionsLoading(true);
    try {
      const globalText = await getGlobalConventions(db);
      setGlobalConventions(globalText);

      try {
        const repoRes = await loadRepoConventions(projectId, db);
        if (repoRes) {
          setRepoConventions(repoRes);
          setSshStatus('connected');
        } else {
          setRepoConventions(null);
          // Distinguish not linked vs file not found
          const bindingRow = await db.settings.get(`project_repo_ssh_binding:${projectId}`);
          if (bindingRow?.value) {
            setSshStatus('file_not_found');
          } else {
            setSshStatus('not_linked');
          }
        }
      } catch {
        setRepoConventions(null);
        setSshStatus('error');
      }
    } catch {
      setGlobalConventions('');
    } finally {
      setConventionsLoading(false);
    }
  }, [projectId, db]);

  useEffect(() => {
    void fetchAllConventions();
  }, [fetchAllConventions]);

  const conventionsSummary = useMemo<ConventionsSummaryProps>(() => ({
    globalText: globalConventions,
    repoText: repoConventions?.content,
    repoPath: repoConventions?.foundPath,
    loadedAt: repoConventions?.loadedAt,
    sshStatus,
    loading: conventionsLoading,
    onRefresh: fetchAllConventions,
  }), [globalConventions, repoConventions, sshStatus, conventionsLoading, fetchAllConventions]);
  // D-06: a historical card pins the owning step view to that exact approved version.
  const [viewedVersion, setViewedVersion] = useState<
    { kind: SdlcArtifactKind; version: number; content: string; title: string } | undefined
  >(undefined);

  // Cards for the step thread currently on screen (D-06: metadata only, body stays in the editor).
  const stepMessages =
    useLiveQuery(
      async () => {
        const thread = await db.chatThreads.get(threadId);
        if (thread?.scopeKey !== `sdlc:${projectId}:${activeCrId}:${selectedStep}`) return [];
        return db.chatMessages.where('threadId').equals(threadId).toArray();
      },
      [threadId, projectId, activeCrId, selectedStep, db]
    ) ?? [];
  const currentCr = crList.find((cr) => cr.id === activeCrId);
  const crStatus = currentCr?.status ?? 'active';
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
            readOnly: (event.status === 'approved' && event.version !== active) || crStatus !== 'active',
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
      if (!activeCrId) return;
      const thread = await getStepThread(projectId, activeCrId, stepId, db);
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
    [projectId, db, activeCrId]
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
      const pinned = event.status === 'approved'
        ? history.find((ref) => ref.version === event.version && ref.content?.trim())
        : undefined;
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
    if (activeCrRef.current !== crId) {
      scopeEpochRef.current += 1;
      editEpochRef.current += 1;
      patchTransactionRef.current?.abort();
      draftRef.current = {};
      setDraftHashes({});
      clearAnalysisTimer();
      setWorkflowState(undefined);
      setViewedVersion(undefined);
      setReadOnlySolution(false);
      setIncomingSolutionDraft(undefined);
      setDraftPl03b(undefined);
      setDraftPl07(undefined);
      setDraftCab(undefined);
    }
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
          setStepThread({ id: t.id, scopeKey: t.scopeKey });
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
    const editEpoch = editEpochRef.current;
    async function loadDraft() {
      const crKey = activeCrId || 'default-cr';
      try {
        const draftRow = await db.settings.get(draftSettingKey(projectId, crKey));
        if (!cancelled && editEpochRef.current === editEpoch) {
          const text = typeof draftRow?.value === 'string' ? draftRow.value : undefined;
          if (text === undefined) delete draftRef.current.SOLUTION;
          else draftRef.current.SOLUTION = text;
          setIncomingSolutionDraft(text);
        }
      } catch {
        if (!cancelled && editEpochRef.current === editEpoch) setIncomingSolutionDraft(undefined);
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

  // Each CR owns its coordinator memory and fixed persistence key (D-23).
  const createCoordinator = useCallback(
    (crId: string) => createSdlcWorkflowCoordinator({
        projectId,
        get threadId() {
          return threadIdRef.current;
        },
        saveState: async (state) => {
          if (!crId) return;
          await db.settings.put({
            key: workflowStorageKey(projectId, crId),
            value: JSON.stringify(state),
          });
        },
        loadState: async () => {
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
          if (!crId) return;
          await db.settings.delete(workflowStorageKey(projectId, crId));
        },
        onStateChange: (newState) => {
          if (activeCrRef.current === crId) setWorkflowState(newState);
        },
      }),
    [projectId, db]
  );
  const coordinator = useMemo(() => createCoordinator(activeCrId), [createCoordinator, activeCrId]);

  // Restore before any step action can render as enabled (T-25.3-34).
  useEffect(() => {
    let cancelled = false;
    if (!activeCrId) {
      setWorkflowState(undefined);
      setWorkflowRestored(true);
      return undefined;
    }
    setWorkflowRestored(false);
    void (async () => {
      try {
        const restored = await coordinator.restore();
        if (!cancelled) setWorkflowState(restored);
      } catch {
        // A failed restore leaves prerequisites unproven, so step views render their guards.
        if (!cancelled) setWorkflowState(undefined);
      } finally {
        if (!cancelled) setWorkflowRestored(true);
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

  const evidenceSessionId = workflowState?.sessionId;
  const evidenceUpdatedAt = workflowState?.updatedAt;
  const evidenceCr = workflowState?.metadata.cr;
  const evidenceFeature = workflowState?.metadata.featureName;

  // Retrieval is bounded to the active CR and step. Cleanup prevents stale evidence leaking across navigation.
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setStepEvidence(undefined);
    // Navigation changes selectedStep before its thread resolves. Aborting a started BM25
    // scan cannot undo its local work, so wait rather than retrieving against the old thread.
    if (!threadReady || !wizardRuntime || !evidenceSessionId || !evidenceUpdatedAt || !activeCrId) {
      return () => controller.abort();
    }

    const query = [evidenceCr, evidenceFeature, selectedStep].join(' ');
    void (async () => {
      try {
        const resolvedSetIds = await wizardRuntime.resolveSetIds(projectId);
        if (cancelled || controller.signal.aborted) return;
        const evidence = await wizardRuntime.collectEvidence({
          projectId,
          threadId,
          sessionId: evidenceSessionId,
          inputRevision: Date.parse(evidenceUpdatedAt) || 0,
          query,
          resolvedSetIds,
          signal: controller.signal,
        });
        if (!cancelled && !controller.signal.aborted) setStepEvidence(evidence);
      } catch {
        if (!cancelled) setStepEvidence(undefined);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [threadReady, wizardRuntime, activeCrId, projectId, threadId, selectedStep, evidenceSessionId, evidenceUpdatedAt, evidenceCr, evidenceFeature]);

  // The chat gate reads the builder's real marker set, never the rendered text.
  const stepGroundingContext = useMemo(
    () => buildSdlcStepGroundingResult({
      step: selectedStep,
      metadata: workflowState?.metadata,
      crStatus,
      artifacts: workflowState?.artifacts ?? {},
      activeVersions: workflowState?.activeVersions,
      versions: workflowState?.versions,
      evidence: stepEvidence,
    }),
    [selectedStep, workflowState, crStatus, stepEvidence]
  );

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

  const enqueueSolutionWrite = useCallback((crKey: string, write: () => Promise<void>) => {
    const key = `${projectId}:${crKey}`;
    const previous = solutionWritesRef.current.get(key) ?? Promise.resolve();
    const pending = previous.catch(() => undefined).then(write);
    solutionWritesRef.current.set(key, pending);
    void pending.finally(() => {
      if (solutionWritesRef.current.get(key) === pending) solutionWritesRef.current.delete(key);
    }).catch(() => undefined);
    return pending;
  }, [projectId]);

  const setRuntimeDraft = useCallback((kind: ArtifactToolKind, markdown: string) => {
    if (draftRef.current[kind] === markdown) return;
    editEpochRef.current += 1;
    patchTransactionRef.current?.abort();
    draftRef.current[kind] = markdown;
    if (kind === 'SOLUTION') setIncomingSolutionDraft(markdown);
    else if (kind === 'PL03B') setDraftPl03b(markdown);
    else if (kind === 'PL07') setDraftPl07(markdown);
    else setDraftCab(markdown);
  }, []);

  const saveDraft = useCallback(
    (markdown: string) => {
      const crKey = activeCrId || 'default-cr';
      setRuntimeDraft('SOLUTION', markdown);
      return enqueueSolutionWrite(crKey, async () => {
        await db.settings.put({ key: draftSettingKey(projectId, crKey), value: markdown });
      });
    },
    [projectId, db, activeCrId, enqueueSolutionWrite, setRuntimeDraft]
  );

  // All getters read live refs, including access after an async hash/transaction boundary.
  const liveArtifactStateRef = useRef({ projectId, activeCrId, selectedStep, crStatus, viewedVersion,
    readOnlySolution, workflowState });
  liveArtifactStateRef.current = { projectId, activeCrId, selectedStep, crStatus, viewedVersion,
    readOnlySolution, workflowState };
  const artifactToolContext = useMemo<ArtifactToolContext>(() => {
    const scopeKey = `sdlc:${projectId}:${activeCrId}:${selectedStep}`;
    const scopeEpoch = scopeEpochRef.current;
    return {
      scopeKey, projectId, crId: activeCrId, stepId: selectedStep,
      getDraft: (kind) => draftRef.current[kind],
      getWorkflowState: () => liveArtifactStateRef.current.workflowState,
      getAccess: () => {
        const live = liveArtifactStateRef.current;
        return {
          scopeValid: mountedRef.current && scopeEpochRef.current === scopeEpoch && live.projectId === projectId &&
            activeCrRef.current === activeCrId && selectedStepRef.current === selectedStep && Boolean(live.workflowState),
          crActive: live.crStatus === 'active',
          readOnly: Boolean(live.viewedVersion) || live.readOnlySolution,
        };
      },
    };
  }, [projectId, activeCrId, selectedStep]);

  const handleApplyArtifactPatch = useCallback(async (proposal: ArtifactPatchProposal, decision: ChatMessage) => {
    const context = artifactToolContext;
    const epoch = editEpochRef.current;
    const scopeEpoch = scopeEpochRef.current;
    const assertCurrent = () => {
      const access = context.getAccess();
      if (!access.scopeValid || access.readOnly || !access.crActive || epoch !== editEpochRef.current ||
        scopeEpoch !== scopeEpochRef.current || proposal.scopeKey !== context.scopeKey ||
        proposal.projectId !== projectId || proposal.crId !== activeCrId || decision.role !== 'system' ||
        !decision.content.startsWith('ARTIFACT_PATCH_DECISION ')) throw new Error('Đề xuất không còn thuộc bản nháp hiện tại. Hãy yêu cầu đề xuất mới.');
    };
    assertCurrent();
    const snapshot = await readArtifactSnapshot(db, context, proposal.kind);
    assertCurrent();
    if (!('markdown' in snapshot) || snapshot.baseHash !== proposal.baseHash ||
      snapshot.markdown !== proposal.baseMarkdown || snapshot.version !== proposal.version) {
      throw new Error('Tài liệu đã thay đổi. Hãy yêu cầu AI đề xuất lại.');
    }
    const commit = async () => {
      assertCurrent();
      await db.transaction('rw', [db.settings, db.chatMessages], async (transaction) => {
        patchTransactionRef.current = transaction;
        try {
          assertCurrent();
          const prior = await db.chatMessages.get(decision.id);
          if (prior) {
            if (prior.content !== decision.content || prior.threadId !== decision.threadId) throw new Error('Quyết định không khớp.');
            return;
          }
          if (proposal.kind === 'SOLUTION') {
            await db.settings.put({ key: draftSettingKey(projectId, activeCrId), value: proposal.patchedMarkdown });
          }
          assertCurrent();
          await db.chatMessages.put(decision);
          assertCurrent();
        } finally { patchTransactionRef.current = null; }
      });
      assertCurrent();
      // No fallible write remains: publish only the selected draft after durable success.
      draftRef.current[proposal.kind] = proposal.patchedMarkdown;
      editEpochRef.current += 1;
      if (proposal.kind === 'SOLUTION') setIncomingSolutionDraft(proposal.patchedMarkdown);
      else if (proposal.kind === 'PL03B') setDraftPl03b(proposal.patchedMarkdown);
      else if (proposal.kind === 'PL07') setDraftPl07(proposal.patchedMarkdown);
      else setDraftCab(proposal.patchedMarkdown);
    };
    if (proposal.kind === 'SOLUTION') await enqueueSolutionWrite(activeCrId, commit);
    else await commit();
  }, [artifactToolContext, db, projectId, activeCrId, enqueueSolutionWrite]);

  useEffect(() => {
    let cancelled = false;
    const scopeEpoch = scopeEpochRef.current;
    const draftEpoch = editEpochRef.current;
    void (async () => {
      const hashes: Partial<Record<ArtifactToolKind, string>> = {};
      for (const kind of ['SOLUTION', 'PL03B', 'PL07', 'CAB'] as const) {
        const text = draftRef.current[kind];
        if (text !== undefined) hashes[kind] = await defaultSha256(text.trim());
      }
      if (!cancelled && mountedRef.current && scopeEpoch === scopeEpochRef.current && draftEpoch === editEpochRef.current) {
        setDraftHashes(hashes);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, activeCrId, incomingSolutionDraft, draftPl03b, draftPl07, draftCab]);

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

  /**
   * D-16/D-17: a chat-produced PL03B/PL07/CAB lands in its step editor as a draft. It never
   * commits, approves, or appends an artifact card — approval stays the editor's explicit action.
   */
  const handleChatArtifactDraft = useCallback(
    (kind: SdlcArtifactKindForTurn, markdown: string) => {
      setRuntimeDraft(kind, markdown);
      message.success(`Đã chuyển bản nháp ${kind} vào trình soạn thảo`);
    },
    [setRuntimeDraft]
  );

  const handleStartIntake = async (
    metadata: Parameters<typeof coordinator.startOrUpdateIntake>[0],
    pl01: string,
    pl02: string
  ) => {
    try {
      let crId = activeCrId;
      let intakeCoordinator = coordinator;
      if (!crId) {
        const created = await createNewCr(projectId, metadata, false, db);
        crId = created.id;
        selectCr(crId);
        intakeCoordinator = createCoordinator(crId);
      }
      await intakeCoordinator.startOrUpdateIntake(metadata, pl01, pl02);
      if (activeCrRef.current !== crId) return;
      setSelectedStepTracked('SOLUTION');
      scheduleSolutionAnalysis();
    } catch (err) {
      reportGuardError(err);
    }
  };

  const handleCommitSolution = async (markdown: string, noteId: string) => {
    try {
      const nextState = await coordinator.commitSolution(markdown, noteId);
      await db.settings.delete(draftSettingKey(projectId, activeCrId || 'default-cr'));
      if (nextState.artifacts.solution) {
        await appendArtifactEvent('SOLUTION', 'SOLUTION', nextState.artifacts.solution, 'approved');
      }
      if (activeCrRef.current === activeCrId) setReadOnlySolution(false);
    } catch (err) {
      reportGuardError(err);
    }
  };

  // Reset through the coordinator so no view writes the workflow key behind its back.
  const handleResetWorkflow = useCallback(async () => {
    try {
      await coordinator.reset();
      await db.settings.delete(draftSettingKey(projectId, activeCrId || 'default-cr'));
      if (activeCrRef.current !== activeCrId) return;
      setWorkflowState(undefined);
      setIncomingSolutionDraft(undefined);
      clearAnalysisTimer();
      setSelectedStepTracked('INTAKE');
      message.success('Đã đặt lại quy trình về ban đầu. Ghi chú đã lưu vẫn được bảo toàn.');
    } catch (err) {
      reportGuardError(err);
    }
  }, [coordinator, projectId, db, activeCrId, reportGuardError, clearAnalysisTimer, setSelectedStepTracked]);

  const handleNavigateToStep = useCallback(
    (step: SdlcStepId) => {
      setIsConfigActive(false);
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
    if (isConfigActive) {
      return (
        <RepoConfigView
          projectId={projectId}
          onBindingSaved={fetchAllConventions}
          onNavigateToStep={handleNavigateToStep}
          db={db}
        />
      );
    }
    switch (selectedStep) {
      case 'INTAKE':
        return (
          <Step1IntakeView
            projectId={projectId}
            initialMetadata={workflowState?.metadata}
            initialPl01={workflowState?.artifacts.pl01?.content}
            initialPl02={workflowState?.artifacts.pl02?.content}
            conventionsSummary={conventionsSummary}
            onStartIntake={handleStartIntake}
            db={db}
          />
        );
      case 'SOLUTION':
        return (
          <Step2SolutionView
            key={`${activeCrId}:${viewedVersion?.kind === 'SOLUTION' ? viewedVersion.version : 'live'}`}
            projectId={projectId}
            crId={activeCrId}
            solutionArtifact={workflowState?.artifacts.solution}
            initialContent={workflowState?.artifacts.solution?.content}
            incomingDraft={viewedVersion?.kind === 'SOLUTION' ? undefined : incomingSolutionDraft}
            pl01Content={workflowState?.artifacts.pl01?.content}
            pl02Content={workflowState?.artifacts.pl02?.content}
            metadata={workflowState?.metadata}
            conventionsSummary={conventionsSummary}
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
              void saveDraft(markdown).catch(() => message.error('Không thể lưu bản nháp SOLUTION. Nội dung trong trình soạn thảo vẫn được giữ nguyên.'));
            }}
            onRequestAiAnalysis={handleTriggerSolutionAnalysis}
            onProceedToStep3={() => handleNavigateToStep('CODE_GUIDE')}
            db={db}
          />
        );
      case 'CODE_GUIDE':
        return (
          <Step3CodeGuideView
            projectId={projectId}
            crCode={workflowState?.metadata.cr ?? ''}
            targetSystems={crTargetSystems}
            approvedSolutionMarkdown={workflowState?.artifacts.solution?.content}
            savedSnapshot={workflowState?.artifacts.branchSnapshot}
            conventionsSummary={conventionsSummary}
            onCommitBranchSnapshot={async (snapshot) => {
              try {
                await coordinator.commitBranchSnapshot(snapshot);
                message.success('Đã phê duyệt branch snapshot thành công!');
              } catch (err) {
                reportGuardError(err);
              }
            }}
            onProceedToStep4={() => handleNavigateToStep('CHANGE_PACK')}
            onNavigateToStep={handleNavigateToStep}
            db={db}
          />
        );
      case 'CHANGE_PACK':
        return (
          <Step4ChangePackView
            projectId={projectId}
            crId={activeCrId}
            crCode={workflowState?.metadata.cr ?? ''}
            solutionArtifact={workflowState?.artifacts.solution}
            branchSnapshot={workflowState?.artifacts.branchSnapshot}
            initialDriftResult={workflowState?.artifacts.driftResult}
            conventionsSummary={conventionsSummary}
            onCommitChangePackAndDrift={async (packHash, packTitle, driftResult) => {
              try {
                await coordinator.commitChangePackAndDrift(
                  packHash,
                  packTitle,
                  driftResult
                );
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
            conventionsSummary={conventionsSummary}
            onDraftChange={setRuntimeDraft}
            onCommitTechDoc={async (kind, markdown, noteId) => {
              try {
                const nextState = await coordinator.commitTechDoc(kind, markdown, noteId);
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
            incomingDraft={draftCab}
            conventionsSummary={conventionsSummary}
            onDraftChange={(markdown) => setRuntimeDraft('CAB', markdown)}
            onCommitCab={async (markdown, noteId) => {
              try {
                const nextState = await coordinator.commitCab(markdown, noteId);
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
          title={`SDLC Studio — ${project?.name ?? 'Chọn dự án'}`}
          subtitle={
            currentCr
              ? `Change Request: ${currentCr.crCode} — ${currentCr.featureName}`
              : 'Môi trường phát triển & kiểm soát chất lượng bàn giao 6 bước'
          }
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
          onSelectProject={(newId) => {
            setSelectedProjectId(newId);
            setIsConfigActive(false);
          }}
          selectedStep={selectedStep}
          // Sidebar navigation goes through the same path as every other step change, so a
          // pinned historical version is cleared and currentStep is persisted (D-06, D-23).
          onSelectStep={handleNavigateToStep}
          activeCrId={activeCrId}
          onSelectCr={selectCr}
          workflowState={workflowState}
          isConfigActive={isConfigActive}
          onSelectConfig={() => setIsConfigActive(true)}
          db={db}
        />
        <SdlcWorkspace
          chatPanelRef={chatPanelRef}
          projectId={projectId}
          crId={activeCrId}
          selectedStep={selectedStep}
          stepGroundingContext={stepGroundingContext}
          readOnly={Boolean(viewedVersion)}
          workflowState={workflowState}
          stepViewNode={
            !projectId ? (
              <div style={{ color: token.colorTextSecondary, padding: 48, textAlign: 'center' }}>
                <Typography.Title level={4} style={{ color: token.colorTextSecondary }}>
                  Chưa có Dự án nào
                </Typography.Title>
                <Typography.Paragraph type="secondary">
                  Vui lòng tạo Dự án trước từ Project Explorer để bắt đầu quy trình SDLC.
                </Typography.Paragraph>
              </div>
            ) : !activeCrId && !isConfigActive ? (
              <div style={{ color: token.colorTextSecondary, padding: 48, textAlign: 'center' }}>
                <Typography.Title level={4} style={{ color: token.colorTextSecondary }}>
                  Dự án chưa có Change Request (CR) nào
                </Typography.Title>
                <Typography.Paragraph type="secondary">
                  Hãy nhấn <b>"Tạo CR"</b> trên thanh điều hướng bên trái để khởi tạo một Change Request mới.
                </Typography.Paragraph>
              </div>
            ) : activeCrId && !workflowRestored ? (
              <div data-testid="sdlc-step-loading" style={{ color: token.colorTextSecondary, padding: 32, textAlign: 'center' }}>
                Đang khôi phục hồ sơ quy trình của CR này…
              </div>
            ) : (
              renderStepNode()
            )
          }
          onNavigateToStep={handleNavigateToStep}
          onSolutionExtracted={handleSolutionExtracted}
          onArtifactDraft={handleChatArtifactDraft}
          artifactToolContext={artifactToolContext}
          onApplyArtifactPatch={handleApplyArtifactPatch}
          draftHashes={draftHashes}
          artifactEvents={artifactEvents}
          onArtifactOpen={handleArtifactOpen}
          onArtifactCta={(eventId) => {
            const event = artifactEvents.find((event) => event.id === eventId);
            if (event) handleArtifactOpen(eventId, event.readOnly === true);
          }}
          conventions={{
            global: globalConventions,
            repo: repoConventions?.content,
            repoPath: repoConventions?.foundPath,
          }}
          db={db}
        />
      </div>
    </div>
  );
};
