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
  const codeGuide = state.artifacts.codeGuide;
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
    const isPl01MissingInSource = currentPl01Hash ? !(solution.sourceHashes ?? []).includes(currentPl01Hash) : false;
    const isPl02MissingInSource = currentPl02Hash ? !(solution.sourceHashes ?? []).includes(currentPl02Hash) : false;
    if (isPl01MissingInSource || isPl02MissingInSource) {
      staleSteps.push('SOLUTION');
      reasons.SOLUTION = 'Hồ sơ đầu vào PL01 hoặc PL02 đã cập nhật bản mới.';
    }
  }

  // 2. SOLUTION revision invalidates code guide and downstream artifacts.
  if (solution) {
    const solutionChanged = Boolean(codeGuide && currentSolutionHash && !(codeGuide.sourceHashes ?? []).includes(currentSolutionHash));
    if (solutionChanged) {
      staleSteps.push('CODE_GUIDE');
      reasons.CODE_GUIDE = 'SOLUTION.md đã thay đổi, cần cập nhật hướng dẫn code.';
    }
  }

  // 3. Kiểm tra CHANGE_PACK / Drift: phụ thuộc vào SOLUTION và ChangePack
  if (solution && changePack && currentSolutionHash && !(changePack.sourceHashes ?? []).includes(currentSolutionHash)) {
    staleSteps.push('CHANGE_PACK');
    reasons.CHANGE_PACK = 'SOLUTION.md đã thay đổi, cần tái đối chiếu change-pack.';
  }
  if (driftResult) {
    if (currentSolutionHash && driftResult.identity?.solutionHash !== currentSolutionHash) {
      staleSteps.push('CHANGE_PACK');
      reasons.CHANGE_PACK = 'SOLUTION.md đã có phiên bản mới, cần tái đối chiếu ma trận drift.';
    } else if (currentPackHash && driftResult.identity?.packHash !== currentPackHash) {
      staleSteps.push('CHANGE_PACK');
      reasons.CHANGE_PACK = 'Đã nạp file change-pack.zip mới, cần tái đối chiếu ma trận drift.';
    }
  }

  // 3. Kiểm tra TECH_DOCS (PL03B & PL07): phụ thuộc vào SOLUTION và CHANGE_PACK
  let techDocsStale = false;
  let techDocsReason = '';

  for (const doc of [pl03b, pl07]) {
    if (doc) {
      if (currentSolutionHash && !(doc.sourceHashes ?? []).includes(currentSolutionHash)) {
        techDocsStale = true;
        techDocsReason = 'SOLUTION.md đã thay đổi so với bản dùng để lập tài liệu kỹ thuật.';
        break;
      }
      if (currentPackHash && !(doc.sourceHashes ?? []).includes(currentPackHash)) {
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

    const isCabStale = requiredHashes.some((h) => !(cab.sourceHashes ?? []).includes(h));
    if (isCabStale) {
      staleSteps.push('CAB');
      reasons.CAB = 'Một hoặc nhiều tài liệu thành phần (PL02, PL03B, PL07) đã thay đổi.';
    }
  }

  return { staleSteps, reasons };
}

/**
 * D-03/A-ART04: a draft that diverges from its committed version marks only the owning step.
 * Read-only by construction — it never emits, saves, or synthesizes a committed hash change.
 */
export function detectDraftHashDivergence(
  state: SdlcWorkflowState,
  draftHashes: Partial<Record<'SOLUTION' | 'PL03B' | 'PL07' | 'CAB', string>> = {}
): WorkflowStalenessReport {
  const staleSteps: SdlcStepId[] = [];
  const reasons: Partial<Record<SdlcStepId, string>> = {};
  const owningStep: Record<'SOLUTION' | 'PL03B' | 'PL07' | 'CAB', SdlcStepId> = {
    SOLUTION: 'SOLUTION', PL03B: 'TECH_DOCS', PL07: 'TECH_DOCS', CAB: 'CAB',
  };
  const committed: Record<'SOLUTION' | 'PL03B' | 'PL07' | 'CAB', string | undefined> = {
    SOLUTION: state.artifacts.solution?.hash,
    PL03B: state.artifacts.pl03b?.hash,
    PL07: state.artifacts.pl07?.hash,
    CAB: state.artifacts.cab?.hash,
  };
  for (const kind of ['SOLUTION', 'PL03B', 'PL07', 'CAB'] as const) {
    const hash = draftHashes[kind];
    // An absent draft is absent; a missing baseline has nothing to diverge from.
    if (hash === undefined || committed[kind] === undefined) continue;
    if (hash === committed[kind]) continue;
    const step = owningStep[kind];
    if (!staleSteps.includes(step)) staleSteps.push(step);
    reasons[step] = `Bản nháp ${kind} khác với phiên bản đã lưu. Hãy review và dùng thao tác lưu/phê duyệt hiện có nếu muốn cập nhật phiên bản.`;
  }
  return { staleSteps, reasons };
}
