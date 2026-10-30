import type { SdlcStepId, SdlcWorkflowState } from './workflowSchemas';

export interface WorkflowStalenessReport {
  staleSteps: SdlcStepId[];
  reasons: Partial<Record<SdlcStepId, string>>;
}

/**
 * Phát hiện các bước bị lệch/cũ trong chu trình phát triển (DAG hash dependency).
 * Chuỗi phụ thuộc:
 * - PL01 & PL02 -> SOLUTION.md
 * - SOLUTION.md -> CODE_GUIDE & CHANGE_PACK (Drift)
 * - SOLUTION.md & CHANGE_PACK -> TECH_DOCS (PL03B & PL07)
 * - PL02, TECH_DOCS (PL03B, PL07), SOLUTION -> CAB
 */
export function detectWorkflowStaleness(state: SdlcWorkflowState): WorkflowStalenessReport {
  const staleSteps: SdlcStepId[] = [];
  const reasons: Partial<Record<SdlcStepId, string>> = {};

  const pl01 = state.artifacts.pl01;
  const pl02 = state.artifacts.pl02;
  const solution = state.artifacts.solution;
  const changePack = state.artifacts.changePack;
  const driftResult = state.artifacts.driftResult;
  const pl03b = state.artifacts.pl03b;
  const pl07 = state.artifacts.pl07;
  const cab = state.artifacts.cab;

  const currentPl01Hash = pl01?.hash;
  const currentPl02Hash = pl02?.hash;
  const currentSolutionHash = solution?.hash;
  const currentPackHash = changePack?.hash;

  // 1. Kiểm tra SOLUTION.md: phụ thuộc vào PL01 và PL02
  if (solution) {
    const isPl01MissingInSource = currentPl01Hash ? !solution.sourceHashes.includes(currentPl01Hash) : false;
    const isPl02MissingInSource = currentPl02Hash ? !solution.sourceHashes.includes(currentPl02Hash) : false;
    if (isPl01MissingInSource || isPl02MissingInSource) {
      staleSteps.push('SOLUTION');
      reasons.SOLUTION = 'Hồ sơ đầu vào PL01 hoặc PL02 đã cập nhật bản mới.';
    }
  }

  // 2. Kiểm tra CHANGE_PACK / Drift: phụ thuộc vào SOLUTION và ChangePack
  if (driftResult) {
    if (currentSolutionHash && driftResult.identity.solutionHash !== currentSolutionHash) {
      staleSteps.push('CHANGE_PACK');
      reasons.CHANGE_PACK = 'SOLUTION.md đã có phiên bản mới, cần tái đối chiếu ma trận drift.';
    } else if (currentPackHash && driftResult.identity.packHash !== currentPackHash) {
      staleSteps.push('CHANGE_PACK');
      reasons.CHANGE_PACK = 'Đã nạp file change-pack.zip mới, cần tái đối chiếu ma trận drift.';
    }
  }

  // 3. Kiểm tra TECH_DOCS (PL03B & PL07): phụ thuộc vào SOLUTION và CHANGE_PACK
  let techDocsStale = false;
  let techDocsReason = '';

  for (const doc of [pl03b, pl07]) {
    if (doc) {
      if (currentSolutionHash && !doc.sourceHashes.includes(currentSolutionHash)) {
        techDocsStale = true;
        techDocsReason = 'SOLUTION.md đã thay đổi so với bản dùng để lập tài liệu kỹ thuật.';
        break;
      }
      if (currentPackHash && !doc.sourceHashes.includes(currentPackHash)) {
        techDocsStale = true;
        techDocsReason = 'Change-pack mới đã nạp, tài liệu kỹ thuật cần cập nhật theo code diff mới.';
        break;
      }
    }
  }

  if (techDocsStale) {
    staleSteps.push('TECH_DOCS');
    reasons.TECH_DOCS = techDocsReason;
  }

  // 4. Kiểm tra CAB: phụ thuộc vào PL02, PL03B, PL07 (và Solution nếu có)
  if (cab) {
    const requiredHashes: string[] = [];
    if (currentPl02Hash) requiredHashes.push(currentPl02Hash);
    if (pl03b?.hash) requiredHashes.push(pl03b.hash);
    if (pl07?.hash) requiredHashes.push(pl07.hash);

    const isCabStale = requiredHashes.some((h) => !cab.sourceHashes.includes(h));
    if (isCabStale) {
      staleSteps.push('CAB');
      reasons.CAB = 'Một hoặc nhiều tài liệu thành phần (PL02, PL03B, PL07) đã thay đổi.';
    }
  }

  return { staleSteps, reasons };
}
