import type { SdlcStepId } from './workflowSchemas';

export type WorkflowGuardCode =
  | 'WORKFLOW_NOT_INITIALIZED'
  | 'INTAKE_PL01_REQUIRED'
  | 'INTAKE_PL02_REQUIRED'
  | 'INTAKE_BASELINE_MISSING'
  | 'SOLUTION_CONTENT_EMPTY'
  | 'SOLUTION_REQUIRED_FOR_CHANGE_PACK'
  | 'SOLUTION_AND_PACK_REQUIRED_FOR_TECH_DOCS'
  | 'ALL_DOCS_REQUIRED_FOR_CAB'
  | 'NO_INTERRUPTED_CHECKPOINT'
  | 'REVISION_CONFIRMATION_REQUIRED'
  | 'REVISION_BASE_STALE';

export const WORKFLOW_GUARD_STEP_NUMBER: Record<SdlcStepId, number> = {
  INTAKE: 1,
  SOLUTION: 2,
  CODE_GUIDE: 3,
  CHANGE_PACK: 4,
  TECH_DOCS: 5,
  CAB: 6,
};

export interface WorkflowGuardMessage {
  missingArtifact: string;
  supplyingStep: SdlcStepId;
}

export const WORKFLOW_GUARD_MESSAGES: Record<WorkflowGuardCode, WorkflowGuardMessage> = {
  WORKFLOW_NOT_INITIALIZED: { missingArtifact: 'Hồ sơ quy trình SDLC', supplyingStep: 'INTAKE' },
  INTAKE_PL01_REQUIRED: { missingArtifact: 'PL01 — Yêu cầu nghiệp vụ', supplyingStep: 'INTAKE' },
  INTAKE_PL02_REQUIRED: { missingArtifact: 'PL02 — Đặc tả chức năng', supplyingStep: 'INTAKE' },
  INTAKE_BASELINE_MISSING: { missingArtifact: 'PL01 — Yêu cầu nghiệp vụ', supplyingStep: 'INTAKE' },
  SOLUTION_CONTENT_EMPTY: { missingArtifact: 'SOLUTION.md', supplyingStep: 'SOLUTION' },
  SOLUTION_REQUIRED_FOR_CHANGE_PACK: { missingArtifact: 'SOLUTION.md', supplyingStep: 'SOLUTION' },
  SOLUTION_AND_PACK_REQUIRED_FOR_TECH_DOCS: { missingArtifact: 'SOLUTION.md và Change Pack đã xác thực', supplyingStep: 'CHANGE_PACK' },
  ALL_DOCS_REQUIRED_FOR_CAB: { missingArtifact: 'PL03B / PL07', supplyingStep: 'TECH_DOCS' },
  NO_INTERRUPTED_CHECKPOINT: { missingArtifact: 'lượt chạy bị gián đoạn', supplyingStep: 'SOLUTION' },
  REVISION_CONFIRMATION_REQUIRED: { missingArtifact: 'xác nhận thay đổi', supplyingStep: 'SOLUTION' },
  REVISION_BASE_STALE: { missingArtifact: 'phiên bản gốc mới nhất', supplyingStep: 'SOLUTION' },
};

export function formatGuardMessage(code: WorkflowGuardCode): string {
  const { missingArtifact, supplyingStep } = WORKFLOW_GUARD_MESSAGES[code];
  const stepNumber = WORKFLOW_GUARD_STEP_NUMBER[supplyingStep];
  return `Chưa đủ điều kiện: Thiếu ${missingArtifact} từ Bước ${stepNumber}. Vui lòng hoàn thành bước trước để tiếp tục.`;
}

export type WorkflowGuardError = Error & { code: WorkflowGuardCode };

export function guardError(code: WorkflowGuardCode): WorkflowGuardError {
  return Object.assign(new Error(code), { code });
}
