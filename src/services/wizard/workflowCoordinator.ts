import { generateId } from '../../utils/uuid';
import type { ReconciliationResult } from './reconciliation';
import { detectWorkflowStaleness } from './stalenessDetector';
import {
  type SdlcStepId,
  type SdlcWorkflowMetadata,
  type SdlcWorkflowState,
  SdlcWorkflowStateSchema,
  type SdlcArtifactRef,
  type SdlcArtifactKind,
  type RevisionPreview,
  RevisionPreviewSchema,
  SdlcCheckpointSchema,
  type BranchSnapshot,
  BranchSnapshotSchema,
} from './workflowSchemas';
import type { SdlcSourceRef } from './sourceMerge';
import { guardError } from './workflowGuards';

export interface WorkflowCoordinatorDeps {
  changeRequestId: string;
  threadId: string;
  now?: () => string;
  createSessionId?: () => string;
  hashText?: (text: string) => Promise<string>;
  saveState?: (state: SdlcWorkflowState) => Promise<void>;
  loadState?: () => Promise<SdlcWorkflowState | undefined>;
  deleteState?: () => Promise<void>;
  onStateChange?: (state: SdlcWorkflowState) => void;
}

/**
 * The coordinator module owns the persistence key format. Views must never re-type the
 * `sdlc_workflow:` literal (D-23).
 *
 * The second segment is the durable SDLC tab's thread id — the same key the backup restore
 * path and the chat drawer read, so checkpoint recovery and the SDLC view share one row.
 */
export function workflowStorageKey(changeRequestId: string, threadId: string): string {
  return `sdlc_workflow:${changeRequestId}:${threadId}`;
}


export async function defaultSha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createSdlcWorkflowCoordinator(deps: WorkflowCoordinatorDeps) {
  const now = deps.now ?? (() => new Date().toISOString());
  const createSessionId = deps.createSessionId ?? generateId;
  const hashText = deps.hashText ?? defaultSha256;

  let currentState: SdlcWorkflowState | undefined;
  let restoreInFlight: Promise<SdlcWorkflowState | undefined> | undefined;

  const emit = async (nextState: SdlcWorkflowState) => {
    // Tự động kiểm tra staleness
    const staleness = detectWorkflowStaleness(nextState);
    const validatedState = SdlcWorkflowStateSchema.parse({
      ...nextState,
      staleSteps: staleness.staleSteps,
      updatedAt: now(),
    });
    currentState = validatedState;
    if (deps.saveState) {
      await deps.saveState(validatedState);
    }
    if (deps.onStateChange) {
      deps.onStateChange(validatedState);
    }
    return validatedState;
  };

  const getState = (): SdlcWorkflowState | undefined => currentState;

  const restore = async (): Promise<SdlcWorkflowState | undefined> => {
    // A turn that emits while this read is in flight must not be overwritten by the snapshot
    // loaded a moment earlier: that loses the newer state (e.g. a freshly opened cycle).
    const stateAtRead = currentState;
    const loaded = await deps.loadState?.();
    if (!loaded) return undefined;
    if (currentState !== stateAtRead) return currentState;
    const parsed = SdlcWorkflowStateSchema.parse(loaded);
    const checkpoint = parsed.checkpoint?.status === 'running'
      ? SdlcCheckpointSchema.parse({ ...parsed.checkpoint, status: 'interrupted' })
      : parsed.checkpoint;
    return emit({ ...parsed, checkpoint });
  };

  const ensureState = async (): Promise<SdlcWorkflowState> => {    if (currentState) return currentState;
    if (!deps.loadState) throw guardError('WORKFLOW_NOT_INITIALIZED');
    restoreInFlight ??= restore().finally(() => { restoreInFlight = undefined; });
    const restored = await restoreInFlight;
    if (restored) return restored;
    if (currentState) return currentState;
    throw guardError('WORKFLOW_NOT_INITIALIZED');
  };

  const selectStep = (stepId: SdlcStepId): SdlcStepId => {
    if (currentState) currentState = SdlcWorkflowStateSchema.parse({ ...currentState, selectedStep: stepId });
    return stepId;
  };

  const setCheckpoint = async (requestId: string, step: SdlcStepId): Promise<SdlcWorkflowState> => {
    const state = await ensureState();
    return emit({ ...state, checkpoint: { requestId, step, status: 'running', startedAt: now() } });
  };

  const clearCheckpoint = async (): Promise<SdlcWorkflowState> => {
    const state = await ensureState();
    return emit({ ...state, checkpoint: undefined });
  };

  const resumeCheckpoint = async (): Promise<SdlcWorkflowState> => {
    const state = await ensureState();
    const checkpoint = state.checkpoint;
    if (!checkpoint || checkpoint.status !== 'interrupted' || !checkpoint.step) {
      throw guardError('NO_INTERRUPTED_CHECKPOINT');
    }
    return emit({
      ...state,
      checkpoint: {
        requestId: createSessionId(),
        step: checkpoint.step,
        status: 'running',
        startedAt: now(),
      },
    });
  };

  const revisionImpact = (kind: SdlcArtifactKind): SdlcStepId[] => kind === 'PL01' || kind === 'PL02'
    ? ['SOLUTION', 'CODE_GUIDE', 'CHANGE_PACK', 'TECH_DOCS', 'CAB']
    : kind === 'SOLUTION'
      ? ['CODE_GUIDE', 'CHANGE_PACK', 'TECH_DOCS', 'CAB']
      : [];

  const previewRevision = async (kind: SdlcArtifactKind, markdown: string): Promise<RevisionPreview> => {
    const state = await ensureState();
    const hash = await hashText(markdown.trim());
    const current = state.artifacts[kind === 'PL01' ? 'pl01' : kind === 'PL02' ? 'pl02' : kind === 'SOLUTION' ? 'solution' : kind === 'CODE_GUIDE' ? 'codeGuide' : kind === 'CHANGE_PACK' ? 'changePack' : kind === 'PL03B' ? 'pl03b' : kind === 'PL07' ? 'pl07' : 'cab'];
    return RevisionPreviewSchema.parse({
      kind,
      markdown: markdown.trim(),
      hash,
      diff: [`- ${current?.content ?? ''}`, `+ ${markdown.trim()}`],
      sources: current ? [{ kind: current.kind, version: current.version, hash: current.hash, ...(current.noteId ? { noteId: current.noteId } : {}) }] : [],
      impactSteps: revisionImpact(kind),
      requiresConfirmation: true,
      baseVersion: current?.version ?? 0,
      ...(current ? { baseHash: current.hash } : {}),
    });
  };

  const commitRevision = async (preview: RevisionPreview, confirmed: boolean): Promise<SdlcWorkflowState> => {
    if (!confirmed) throw guardError('REVISION_CONFIRMATION_REQUIRED');
    const state = await ensureState();
    const key = preview.kind === 'PL01' ? 'pl01' : preview.kind === 'PL02' ? 'pl02' : preview.kind === 'SOLUTION' ? 'solution' : preview.kind === 'CODE_GUIDE' ? 'codeGuide' : preview.kind === 'CHANGE_PACK' ? 'changePack' : preview.kind === 'PL03B' ? 'pl03b' : preview.kind === 'PL07' ? 'pl07' : 'cab';
    const previous = state.artifacts[key];
    if ((previous?.version ?? 0) !== preview.baseVersion || (preview.baseHash && previous?.hash !== preview.baseHash)) throw guardError('REVISION_BASE_STALE');
    const next: SdlcArtifactRef = { kind: preview.kind, version: preview.baseVersion + 1, hash: preview.hash, title: previous?.title ?? preview.kind, content: preview.markdown, sourceHashes: previous?.sourceHashes ?? [], updatedAt: now(), approvedAt: now() };
    const versions = { ...(state.versions ?? {}) } as NonNullable<SdlcWorkflowState['versions']>;
    versions[preview.kind] = [...(versions[preview.kind] ?? []), ...(previous && (versions[preview.kind]?.length ?? 0) === 0 ? [previous] : []), next];
    const activeVersions = { ...(state.activeVersions ?? {}) } as NonNullable<SdlcWorkflowState['activeVersions']>;
    activeVersions[preview.kind] = next.version;
    return emit({ ...state, artifacts: { ...state.artifacts, [key]: next }, versions, activeVersions });
  };

  const openCycle = async (): Promise<SdlcWorkflowState> => {
    const state = await ensureState();
    return emit({ ...state, cycles: [...(state.cycles ?? []), { cycleId: createSessionId(), status: 'active', startedAt: now() }] });
  };
  const closeCycle = async (): Promise<SdlcWorkflowState> => {
    const state = await ensureState();
    const cycles = [...(state.cycles ?? [{ cycleId: createSessionId(), status: 'active' as const, startedAt: state.createdAt }])];
    const active = cycles.findLast((cycle) => cycle.status === 'active');
    if (active) active.status = 'completed';
    if (active) active.closedAt = now();
    return emit({ ...state, cycles });
  };
  /**
   * Khởi tạo hoặc cập nhật bước 1: Nạp hồ sơ đầu vào PL01 và PL02
   */
  const startOrUpdateIntake = async (
    metadata: SdlcWorkflowMetadata,
    pl01Content: string,
    pl02Content: string,
    sourceOptions?: {
      pl01Sources?: SdlcSourceRef[] | undefined;
      pl02Sources?: SdlcSourceRef[] | undefined;
    } | undefined
  ): Promise<SdlcWorkflowState> => {
    const trimmedPl01 = pl01Content.trim();
    const trimmedPl02 = pl02Content.trim();
    if (!trimmedPl01) throw guardError('INTAKE_PL01_REQUIRED');
    if (!trimmedPl02) throw guardError('INTAKE_PL02_REQUIRED');

    const existing = currentState ?? await restore();
    const pl01Hash = await hashText(trimmedPl01);
    const pl02Hash = await hashText(trimmedPl02);
    const timestamp = now();
    const sessionId = existing?.sessionId ?? createSessionId();

    const pl01ExtraHashes = (sourceOptions?.pl01Sources ?? []).map((s) => s.hash);
    const pl02ExtraHashes = (sourceOptions?.pl02Sources ?? []).map((s) => s.hash);

    const pl01Artifact: SdlcArtifactRef = {
      noteId: sourceOptions?.pl01Sources?.[0]?.id,
      kind: 'PL01',
      version: existing?.artifacts.pl01 ? existing.artifacts.pl01.version + 1 : 1,
      hash: pl01Hash,
      title: `PL01 — Yêu cầu nghiệp vụ (${metadata.featureName})`,
      content: trimmedPl01,
      sourceHashes: pl01ExtraHashes,
      updatedAt: timestamp,
    };

    const pl02Artifact: SdlcArtifactRef = {
      noteId: sourceOptions?.pl02Sources?.[0]?.id,
      kind: 'PL02',
      version: existing?.artifacts.pl02 ? existing.artifacts.pl02.version + 1 : 1,
      hash: pl02Hash,
      title: `PL02 — Đặc tả chức năng (${metadata.featureName})`,
      content: trimmedPl02,
      sourceHashes: [pl01Hash, ...pl02ExtraHashes],
      updatedAt: timestamp,
    };

    const nextState: SdlcWorkflowState = {
      schemaVersion: 1,
      sessionId,
      // Persisted workflow-state JSON field name is owned by `SdlcWorkflowStateSchema`
      // (plan 31.2-17); renaming it here alone would make every save fail its strict parse.
      projectId: deps.changeRequestId,
      threadId: deps.threadId,
      currentStep: 'SOLUTION', // Sau khi nạp xong INTAKE -> sang bước SOLUTION
      metadata,
      artifacts: {
        ...(existing?.artifacts ?? {}),
        branchSnapshots: existing?.artifacts.branchSnapshots ?? {},
        pl01: pl01Artifact,
        pl02: pl02Artifact,
      },
      staleSteps: [],
      versions: existing?.versions ?? {},
      activeVersions: existing?.activeVersions ?? {},
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };

    return emit(nextState);
  };

  /**
   * Lưu hoặc cập nhật phiên bản SOLUTION.md
   */
  const commitSolution = async (
    markdown: string,
    noteId?: string,
  ): Promise<SdlcWorkflowState> => {
    const state = await ensureState();
    const pl01Hash = state.artifacts.pl01?.hash;
    const pl02Hash = state.artifacts.pl02?.hash;
    if (!pl01Hash || !pl02Hash) throw guardError('INTAKE_BASELINE_MISSING');

    const trimmedMarkdown = markdown.trim();
    if (!trimmedMarkdown) throw guardError('SOLUTION_CONTENT_EMPTY');

    const solutionHash = await hashText(trimmedMarkdown);
    const timestamp = now();
    const currentVersion = state.artifacts.solution?.version ?? 0;
    const nextVersion = currentVersion + 1;

    const solutionArtifact: SdlcArtifactRef = {
      noteId,
      kind: 'SOLUTION',
      version: nextVersion,
      hash: solutionHash,
      title: `SOLUTION.md — v${nextVersion} (${state.metadata.featureName})`,
      content: trimmedMarkdown,
      sourceHashes: [pl01Hash, pl02Hash],
      approvedAt: timestamp,
      updatedAt: timestamp,
    };

    const nextState: SdlcWorkflowState = {
      ...state,
      currentStep: 'CODE_GUIDE', // Sau khi lưu SOLUTION -> sang bước hướng dẫn coding
      artifacts: {
        ...state.artifacts,
        solution: solutionArtifact,
      },
      versions: {
        ...(state.versions ?? {}),
        SOLUTION: [...(state.versions?.SOLUTION ?? []), solutionArtifact],
      },
      activeVersions: {
        ...(state.activeVersions ?? {}),
        SOLUTION: solutionArtifact.version,
      },
    };

    return emit(nextState);
  };

  /**
   * Lưu snapshot nhánh đã được phê duyệt ở Bước 3 (Code Guide & Remote Diff Review)
   */
  const commitBranchSnapshot = async (
    snapshot: BranchSnapshot,
    systemId?: string
  ): Promise<SdlcWorkflowState> => {
    const state = await ensureState();
    if (!state.artifacts.solution) {
      throw guardError('SOLUTION_REQUIRED_FOR_CHANGE_PACK');
    }

    const validatedSnapshot = BranchSnapshotSchema.parse(snapshot);

    // D-40: one approved snapshot per target subsystem. Without a systemId the legacy
    // single-slot behaviour is preserved for a CR that has no targets yet.
    const nextState: SdlcWorkflowState = {
      ...state,
      artifacts: systemId
        ? {
            ...state.artifacts,
            branchSnapshots: { ...state.artifacts.branchSnapshots, [systemId]: validatedSnapshot },
          }
        : {
            ...state.artifacts,
            branchSnapshot: validatedSnapshot,
          },
      updatedAt: now(),
    };

    return emit(nextState);
  };

  /**
   * Cập nhật kết quả nạp Change Pack và Drift Matrix
   */
  const commitChangePackAndDrift = async (
    packHash: string,
    packTitle: string,
    driftResult: ReconciliationResult,
  ): Promise<SdlcWorkflowState> => {
    const state = await ensureState();
    if (!state.artifacts.solution) throw guardError('SOLUTION_REQUIRED_FOR_CHANGE_PACK');
    const timestamp = now();

    const packArtifact: SdlcArtifactRef = {
      kind: 'CHANGE_PACK',
      version: (state.artifacts.changePack?.version ?? 0) + 1,
      hash: packHash,
      title: packTitle,
      sourceHashes: [state.artifacts.solution.hash],
      updatedAt: timestamp,
    };

    const nextState: SdlcWorkflowState = {
      ...state,
      currentStep: 'TECH_DOCS', // Sang bước sinh PL03B & PL07
      artifacts: {
        ...state.artifacts,
        changePack: packArtifact,
        driftResult,
      },
    };

    return emit(nextState);
  };

  /**
   * Lưu tài liệu kỹ thuật đã duyệt (PL03B hoặc PL07)
   */
  const commitTechDoc = async (
    kind: 'PL03B' | 'PL07',
    markdown: string,
    noteId?: string,
  ): Promise<SdlcWorkflowState> => {
    const state = await ensureState();
    if (!state.artifacts.solution || !state.artifacts.changePack) {
      throw guardError('SOLUTION_AND_PACK_REQUIRED_FOR_TECH_DOCS');
    }
    const timestamp = now();
    const docHash = await hashText(markdown.trim());
    const sourceHashes = [
      state.artifacts.solution.hash,
      state.artifacts.changePack.hash,
    ];

    const currentDoc = kind === 'PL03B' ? state.artifacts.pl03b : state.artifacts.pl07;
    const nextVersion = (currentDoc?.version ?? 0) + 1;

    const docArtifact: SdlcArtifactRef = {
      noteId,
      kind,
      version: nextVersion,
      hash: docHash,
      title: `${kind} — v${nextVersion} (${state.metadata.featureName})`,
      content: markdown.trim(),
      sourceHashes,
      approvedAt: timestamp,
      updatedAt: timestamp,
    };

    const nextArtifacts = {
      ...state.artifacts,
      [kind === 'PL03B' ? 'pl03b' : 'pl07']: docArtifact,
    };

    // Nếu cả PL03B và PL07 đều đã duyệt -> chuyển sang bước CAB
    const bothApproved = (kind === 'PL03B' ? docArtifact : nextArtifacts.pl03b) &&
                         (kind === 'PL07' ? docArtifact : nextArtifacts.pl07);

    const nextState: SdlcWorkflowState = {
      ...state,
      currentStep: bothApproved ? 'CAB' : 'TECH_DOCS',
      artifacts: nextArtifacts,
    };

    return emit(nextState);
  };

  /**
   * Lưu tờ trình CAB đã duyệt
   */
  const commitCab = async (
    markdown: string,
    noteId?: string,
  ): Promise<SdlcWorkflowState> => {
    const state = await ensureState();
    if (!state.artifacts.pl02 || !state.artifacts.pl03b || !state.artifacts.pl07) {
      throw guardError('ALL_DOCS_REQUIRED_FOR_CAB');
    }
    const timestamp = now();
    const cabHash = await hashText(markdown.trim());
    const sourceHashes = [
      state.artifacts.pl02.hash,
      state.artifacts.pl03b.hash,
      state.artifacts.pl07.hash,
    ];

    const cabArtifact: SdlcArtifactRef = {
      noteId,
      kind: 'CAB',
      version: (state.artifacts.cab?.version ?? 0) + 1,
      hash: cabHash,
      title: `Tờ trình CAB — (${state.metadata.featureName})`,
      content: markdown.trim(),
      sourceHashes,
      approvedAt: timestamp,
      updatedAt: timestamp,
    };

    const nextState: SdlcWorkflowState = {
      ...state,
      currentStep: 'CAB',
      artifacts: {
        ...state.artifacts,
        cab: cabArtifact,
      },
    };

    return emit(nextState);
  };

  /**
   * Điều hướng chuyển bước thủ công (khi người dùng click trên thanh Steps)
   */
  const navigateToStep = async (stepId: SdlcStepId): Promise<SdlcWorkflowState> => {
    const state = await ensureState();
    const nextState: SdlcWorkflowState = {
      ...state,
      currentStep: stepId,
    };
    return emit(nextState);
  };

  /**
   * Resets the workflow through the coordinator so the in-memory copy can never disagree
   * with what is persisted (the `WORKFLOW_NOT_INITIALIZED` class of bugs). Notes are untouched.
   */
  const reset = async (): Promise<void> => {
    currentState = undefined;
    await deps.deleteState?.();
  };

  return {
    getState,
    startOrUpdateIntake,
    commitSolution,
    commitBranchSnapshot,
    commitChangePackAndDrift,
    commitTechDoc,
    commitCab,
    navigateToStep,
    restore,
    reset,
    selectStep,
    previewRevision,
    commitRevision,
    openCycle,
    closeCycle,
    setCheckpoint,
    clearCheckpoint,
    resumeCheckpoint,
  };
}

export type SdlcWorkflowCoordinator = ReturnType<typeof createSdlcWorkflowCoordinator>;

