import { describe, expect, it } from 'vitest';
import {
  WORKFLOW_GUARD_MESSAGES,
  WORKFLOW_GUARD_STEP_NUMBER,
  formatGuardMessage,
  guardError,
  type WorkflowGuardCode,
} from '../workflowGuards';

const ALL_CODES: WorkflowGuardCode[] = [
  'WORKFLOW_NOT_INITIALIZED',
  'INTAKE_PL01_REQUIRED',
  'INTAKE_PL02_REQUIRED',
  'INTAKE_BASELINE_MISSING',
  'SOLUTION_CONTENT_EMPTY',
  'SOLUTION_REQUIRED_FOR_CHANGE_PACK',
  'SOLUTION_AND_PACK_REQUIRED_FOR_TECH_DOCS',
  'ALL_DOCS_REQUIRED_FOR_CAB',
  'NO_INTERRUPTED_CHECKPOINT',
  'REVISION_CONFIRMATION_REQUIRED',
  'REVISION_BASE_STALE',
];

describe('workflowGuards', () => {
  it('has copy for every guard code', () => {
    ALL_CODES.forEach((code) => {
      const entry = WORKFLOW_GUARD_MESSAGES[code];
      expect(entry.missingArtifact).toBeTruthy();
      expect(entry.supplyingStep).toBeTruthy();
    });
  });

  it('formats the prerequisite guard sentence for the UI', () => {
    expect(formatGuardMessage('SOLUTION_REQUIRED_FOR_CHANGE_PACK')).toBe(
      'Chưa đủ điều kiện: Thiếu SOLUTION.md từ Bước 2. Vui lòng hoàn thành bước trước để tiếp tục.',
    );
  });

  it('keeps the raw guard code as the error message and exposes it as code', () => {
    const error = guardError('ALL_DOCS_REQUIRED_FOR_CAB');
    expect(error.message).toBe('ALL_DOCS_REQUIRED_FOR_CAB');
    expect(error.code).toBe('ALL_DOCS_REQUIRED_FOR_CAB');
    expect(error).toBeInstanceOf(Error);
  });

  it('maps steps to their display numbers', () => {
    expect(WORKFLOW_GUARD_STEP_NUMBER.INTAKE).toBe(1);
    expect(WORKFLOW_GUARD_STEP_NUMBER.SOLUTION).toBe(2);
    expect(WORKFLOW_GUARD_STEP_NUMBER.CAB).toBe(6);
  });
});
