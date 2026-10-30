import { generateId } from '../../utils/uuid';
import type { ReconciliationResult } from './reconciliation';
import { detectWorkflowStaleness } from './stalenessDetector';
import {
  type SdlcStepId,
  type SdlcWorkflowMetadata,
  type SdlcWorkflowState,
  SdlcWorkflowStateSchema,
  type SdlcArtifactRef,
} from './workflowSchemas';

export interface WorkflowCoordinatorDeps {
  projectId: string;
  threadId: string;
  now?: () => string;
  createSessionId?: () => string;
  hashText?: (text: string) => Promise<string>;
  saveState?: (state: SdlcWorkflowState) => Promise<void>;
  loadState?: () => Promise<SdlcWorkflowState | undefined>;
  onStateChange?: (state: SdlcWorkflowState) => void;
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

  /**
   * Khởi tạo hoặc cập nhật bước 1: Nạp hồ sơ đầu vào PL01 và PL02
   */
  const startOrUpdateIntake = async (
    metadata: SdlcWorkflowMetadata,
    pl01Content: string,
    pl02Content: string,
  ): Promise<SdlcWorkflowState> => {
    const trimmedPl01 = pl01Content.trim();
    const trimmedPl02 = pl02Content.trim();
    if (!trimmedPl01) throw new Error('INTAKE_PL01_REQUIRED');
    if (!trimmedPl02) throw new Error('INTAKE_PL02_REQUIRED');

    const pl01Hash = await hashText(trimmedPl01);
    const pl02Hash = await hashText(trimmedPl02);
    const timestamp = now();
    const sessionId = currentState?.sessionId ?? createSessionId();

    const pl01Artifact: SdlcArtifactRef = {
      kind: 'PL01',
      version: currentState?.artifacts.pl01 ? currentState.artifacts.pl01.version + 1 : 1,
      hash: pl01Hash,
      title: `PL01 — Yêu cầu nghiệp vụ (${metadata.featureName})`,
      content: trimmedPl01,
      sourceHashes: [],
      updatedAt: timestamp,
    };

    const pl02Artifact: SdlcArtifactRef = {
      kind: 'PL02',
      version: currentState?.artifacts.pl02 ? currentState.artifacts.pl02.version + 1 : 1,
      hash: pl02Hash,
      title: `PL02 — Đặc tả chức năng (${metadata.featureName})`,
      content: trimmedPl02,
      sourceHashes: [pl01Hash],
      updatedAt: timestamp,
    };

    const nextState: SdlcWorkflowState = {
      schemaVersion: 1,
      sessionId,
      projectId: deps.projectId,
      threadId: deps.threadId,
      currentStep: 'SOLUTION', // Sau khi nạp xong INTAKE -> sang bước SOLUTION
      metadata,
      artifacts: {
        ...(currentState?.artifacts ?? {}),
        pl01: pl01Artifact,
        pl02: pl02Artifact,
      },
      staleSteps: [],
      createdAt: currentState?.createdAt ?? timestamp,
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
    if (!currentState) throw new Error('WORKFLOW_NOT_INITIALIZED');
    const pl01Hash = currentState.artifacts.pl01?.hash;
    const pl02Hash = currentState.artifacts.pl02?.hash;
    if (!pl01Hash || !pl02Hash) throw new Error('INTAKE_BASELINE_MISSING');

    const trimmedMarkdown = markdown.trim();
    if (!trimmedMarkdown) throw new Error('SOLUTION_CONTENT_EMPTY');

    const solutionHash = await hashText(trimmedMarkdown);
    const timestamp = now();
    const currentVersion = currentState.artifacts.solution?.version ?? 0;
    const nextVersion = currentVersion + 1;

    const solutionArtifact: SdlcArtifactRef = {
      noteId,
      kind: 'SOLUTION',
      version: nextVersion,
      hash: solutionHash,
      title: `SOLUTION.md — v${nextVersion} (${currentState.metadata.featureName})`,
      content: trimmedMarkdown,
      sourceHashes: [pl01Hash, pl02Hash],
      approvedAt: timestamp,
      updatedAt: timestamp,
    };

    const nextState: SdlcWorkflowState = {
      ...currentState,
      currentStep: 'CODE_GUIDE', // Sau khi lưu SOLUTION -> sang bước hướng dẫn coding
      artifacts: {
        ...currentState.artifacts,
        solution: solutionArtifact,
      },
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
    if (!currentState || !currentState.artifacts.solution) {
      throw new Error('SOLUTION_REQUIRED_FOR_CHANGE_PACK');
    }
    const timestamp = now();

    const packArtifact: SdlcArtifactRef = {
      kind: 'CHANGE_PACK',
      version: (currentState.artifacts.changePack?.version ?? 0) + 1,
      hash: packHash,
      title: packTitle,
      sourceHashes: [currentState.artifacts.solution.hash],
      updatedAt: timestamp,
    };

    const nextState: SdlcWorkflowState = {
      ...currentState,
      currentStep: 'TECH_DOCS', // Sang bước sinh PL03B & PL07
      artifacts: {
        ...currentState.artifacts,
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
    if (!currentState || !currentState.artifacts.solution || !currentState.artifacts.changePack) {
      throw new Error('SOLUTION_AND_PACK_REQUIRED_FOR_TECH_DOCS');
    }
    const timestamp = now();
    const docHash = await hashText(markdown.trim());
    const sourceHashes = [
      currentState.artifacts.solution.hash,
      currentState.artifacts.changePack.hash,
    ];

    const currentDoc = kind === 'PL03B' ? currentState.artifacts.pl03b : currentState.artifacts.pl07;
    const nextVersion = (currentDoc?.version ?? 0) + 1;

    const docArtifact: SdlcArtifactRef = {
      noteId,
      kind,
      version: nextVersion,
      hash: docHash,
      title: `${kind} — v${nextVersion} (${currentState.metadata.featureName})`,
      content: markdown.trim(),
      sourceHashes,
      approvedAt: timestamp,
      updatedAt: timestamp,
    };

    const nextArtifacts = {
      ...currentState.artifacts,
      [kind === 'PL03B' ? 'pl03b' : 'pl07']: docArtifact,
    };

    // Nếu cả PL03B và PL07 đều đã duyệt -> chuyển sang bước CAB
    const bothApproved = (kind === 'PL03B' ? docArtifact : nextArtifacts.pl03b) &&
                         (kind === 'PL07' ? docArtifact : nextArtifacts.pl07);

    const nextState: SdlcWorkflowState = {
      ...currentState,
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
    if (!currentState || !currentState.artifacts.pl02 || !currentState.artifacts.pl03b || !currentState.artifacts.pl07) {
      throw new Error('ALL_DOCS_REQUIRED_FOR_CAB');
    }
    const timestamp = now();
    const cabHash = await hashText(markdown.trim());
    const sourceHashes = [
      currentState.artifacts.pl02.hash,
      currentState.artifacts.pl03b.hash,
      currentState.artifacts.pl07.hash,
    ];

    const cabArtifact: SdlcArtifactRef = {
      noteId,
      kind: 'CAB',
      version: (currentState.artifacts.cab?.version ?? 0) + 1,
      hash: cabHash,
      title: `Tờ trình CAB — (${currentState.metadata.featureName})`,
      content: markdown.trim(),
      sourceHashes,
      approvedAt: timestamp,
      updatedAt: timestamp,
    };

    const nextState: SdlcWorkflowState = {
      ...currentState,
      currentStep: 'CAB',
      artifacts: {
        ...currentState.artifacts,
        cab: cabArtifact,
      },
    };

    return emit(nextState);
  };

  /**
   * Điều hướng chuyển bước thủ công (khi người dùng click trên thanh Steps)
   */
  const navigateToStep = async (stepId: SdlcStepId): Promise<SdlcWorkflowState> => {
    if (!currentState) throw new Error('WORKFLOW_NOT_INITIALIZED');
    const nextState: SdlcWorkflowState = {
      ...currentState,
      currentStep: stepId,
    };
    return emit(nextState);
  };

  return {
    getState,
    startOrUpdateIntake,
    commitSolution,
    commitChangePackAndDrift,
    commitTechDoc,
    commitCab,
    navigateToStep,
  };
}
