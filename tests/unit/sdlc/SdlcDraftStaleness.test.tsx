import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { detectDraftHashDivergence, detectWorkflowStaleness } from '../../../src/services/wizard/stalenessDetector';
import { SdlcStaleBanner } from '../../../src/components/sdlc/common/SdlcStaleBanner';
import { SdlcWorkspace } from '../../../src/components/sdlc/SdlcWorkspace';
import { defaultSha256 } from '../../../src/services/wizard/workflowCoordinator';
import type { SdlcStepId, SdlcWorkflowState } from '../../../src/services/wizard/workflowSchemas';

const COMMITTED: Record<'SOLUTION' | 'PL03B' | 'PL07' | 'CAB', string> = {
  SOLUTION: '# SOLUTION\n## Mục tiêu\nNội dung gốc.',
  PL03B: '# PL03B\n## Mục tiêu\nNội dung PL03B.',
  PL07: '# PL07\n## Mục tiêu\nNội dung PL07.',
  CAB: '# CAB\n## Mục tiêu\nNội dung CAB.',
};

async function state(): Promise<SdlcWorkflowState> {
  const at = '2026-11-05T00:00:00.000Z';
  const ref = async (kind: string, content: string, sourceHashes: string[] = []) => ({
    kind, version: 1, hash: await defaultSha256(content.trim()), title: kind, content, sourceHashes,
    updatedAt: at, ...(kind === 'CHANGE_PACK' ? {} : { approvedAt: at }),
  });
  const artifacts = {
    pl01: await ref('PL01', 'PL01'), pl02: await ref('PL02', 'PL02'),
    solution: await ref('SOLUTION', COMMITTED.SOLUTION),
    pl03b: await ref('PL03B', COMMITTED.PL03B), pl07: await ref('PL07', COMMITTED.PL07),
    cab: await ref('CAB', COMMITTED.CAB), changePack: await ref('CHANGE_PACK', 'PACK'),
  };
  const solutionHash = artifacts.solution.hash;
  artifacts.solution.sourceHashes = [artifacts.pl01.hash, artifacts.pl02.hash];
  for (const artifact of [artifacts.pl03b, artifacts.pl07, artifacts.cab]) {
    artifact.sourceHashes = [solutionHash, artifacts.changePack.hash];
  }
  artifacts.changePack.sourceHashes = [solutionHash];
  artifacts.cab.sourceHashes = [artifacts.pl02.hash, artifacts.pl03b.hash, artifacts.pl07.hash];
  return { schemaVersion: 1, sessionId: crypto.randomUUID(), projectId: crypto.randomUUID(),
    threadId: crypto.randomUUID(), currentStep: 'SOLUTION',
    metadata: { cr: 'CR', featureName: 'F', author: 'A', requestingUnit: 'U', date: '2026-11-05' },
    artifacts, staleSteps: [], createdAt: at, updatedAt: at } as unknown as SdlcWorkflowState;
}

const hashes = async (drafts: Partial<Record<keyof typeof COMMITTED, string>>) => {
  const out: Partial<Record<keyof typeof COMMITTED, string>> = {};
  for (const [kind, text] of Object.entries(drafts) as Array<[keyof typeof COMMITTED, string]>) {
    out[kind] = await defaultSha256(text.trim());
  }
  return out;
};

afterEach(cleanup);

describe('detectDraftHashDivergence (SDLC-ART-04 read-only)', () => {
  it.each([['SOLUTION', 'SOLUTION'], ['PL03B', 'TECH_DOCS'], ['PL07', 'TECH_DOCS'], ['CAB', 'CAB']] as const)(
    'marks only the owning step for changed %s', async (kind, step) => {
      const base = await state();
      const before = JSON.stringify(base);
      const draft = await hashes({ [kind]: `${COMMITTED[kind]}\nDòng mới.` });
      const report = detectDraftHashDivergence(base, draft);
      expect(report.staleSteps).toEqual([step]);
      expect(report.reasons[step]).toContain(kind);
      expect(report.reasons[step]).toContain('Bản nháp');
      expect(JSON.stringify(base)).toBe(before);
    }
  );

  it('ignores equal normalized hashes, absent drafts and missing baselines', async () => {
    const base = await state();
    expect(detectDraftHashDivergence(base, await hashes(COMMITTED)).staleSteps).toEqual([]);
    expect(detectDraftHashDivergence(base, {})).toEqual({ staleSteps: [], reasons: {} });
    const withoutSolution = { ...base, artifacts: { ...base.artifacts, solution: undefined } };
    const report = detectDraftHashDivergence(withoutSolution, await hashes({ SOLUTION: '# khác' }));
    expect(report.staleSteps).toEqual([]);
  });

  it('treats whitespace-only differences at the edges as equal because hashing uses trim', async () => {
    const base = await state();
    const padded = await hashes({ SOLUTION: `\n  ${COMMITTED.SOLUTION}  \n` });
    expect(detectDraftHashDivergence(base, padded).staleSteps).toEqual([]);
    const inner = await hashes({ SOLUTION: COMMITTED.SOLUTION.replace('Nội dung', 'Nội  dung') });
    expect(detectDraftHashDivergence(base, inner).staleSteps).toEqual(['SOLUTION']);
  });

  it('treats an empty draft over a nonempty committed artifact as divergent', async () => {
    const base = await state();
    expect(detectDraftHashDivergence(base, await hashes({ SOLUTION: '' })).staleSteps).toEqual(['SOLUTION']);
  });

  it('marks TECH_DOCS once for both technical documents', async () => {
    const base = await state();
    const report = detectDraftHashDivergence(base, await hashes({
      PL03B: `${COMMITTED.PL03B}\nx`, PL07: `${COMMITTED.PL07}\ny`,
    }));
    expect(report.staleSteps).toEqual(['TECH_DOCS']);
  });

  it('preserves committed dependency staleness and existing report shape at merge', async () => {
    const base = await state();
    const committedReport = detectWorkflowStaleness(base);
    expect(committedReport).toEqual({ staleSteps: [], reasons: {} });
    render(<SdlcStaleBanner currentStep="SOLUTION" workflowState={base} onNavigateToStep={vi.fn()}
      draftStaleness={detectDraftHashDivergence(base, await hashes({ SOLUTION: `${COMMITTED.SOLUTION}\nx` }))} />);
    const banner = screen.getByTestId('sdlc-stale-banner');
    expect(banner).toHaveTextContent('Cảnh báo bước hiện tại');
    expect(banner).toHaveTextContent('Bản nháp SOLUTION khác với phiên bản đã lưu.');
    expect(JSON.stringify(base)).toBe(JSON.stringify(base));
  });

  it('keeps committed reasons ahead of draft reasons and never rewrites committed steps', async () => {
    const base = await state();
    const staleCommitted = { ...base, artifacts: { ...base.artifacts,
      pl01: { ...base.artifacts.pl01!, hash: 'f'.repeat(64) } } };
    const committedReport = detectWorkflowStaleness(staleCommitted);
    expect(committedReport.staleSteps).toContain('SOLUTION');
    const draft = detectDraftHashDivergence(staleCommitted, await hashes({ SOLUTION: `${COMMITTED.SOLUTION}\nx` }));
    render(<SdlcStaleBanner currentStep="SOLUTION" workflowState={staleCommitted} onNavigateToStep={vi.fn()}
      draftStaleness={draft} />);
    expect(screen.getByTestId('sdlc-stale-banner')).toHaveTextContent('Hồ sơ đầu vào PL01 hoặc PL02 đã cập nhật bản mới.');
    expect(screen.getByTestId('sdlc-stale-banner')).not.toHaveTextContent('Bản nháp SOLUTION');
  });

  it('covers pipeline input/output draft hash propagation in the workspace without saving state', async () => {
    const base = await state();
    const before = JSON.stringify(base);
    const onNavigateToStep = vi.fn();
    const { rerender } = render(<SdlcWorkspace changeRequestId={base.projectId} crId="cr" selectedStep="SOLUTION"
      workflowState={base} draftHashes={await hashes(COMMITTED)} onNavigateToStep={onNavigateToStep} />);
    expect(screen.queryByTestId('sdlc-stale-banner')).not.toBeInTheDocument();
    rerender(<SdlcWorkspace changeRequestId={base.projectId} crId="cr" selectedStep="SOLUTION" workflowState={base}
      draftHashes={await hashes({ SOLUTION: `${COMMITTED.SOLUTION}\nĐã sửa.` })} onNavigateToStep={onNavigateToStep} />);
    expect(screen.getByTestId('sdlc-stale-banner')).toHaveTextContent('Bản nháp SOLUTION khác với phiên bản đã lưu.');
    rerender(<SdlcWorkspace changeRequestId={base.projectId} crId="cr" selectedStep="SOLUTION" workflowState={base}
      draftHashes={await hashes({ SOLUTION: COMMITTED.SOLUTION })} onNavigateToStep={onNavigateToStep} />);
    expect(screen.queryByTestId('sdlc-stale-banner')).not.toBeInTheDocument();
    expect(JSON.stringify(base)).toBe(before);
  });

  it('shows the owning stale banner after approval and clears it when the draft is restored', async () => {
    const base = await state();
    const onNavigateToStep = vi.fn();
    const approved = await hashes({ SOLUTION: `${COMMITTED.SOLUTION}\nDòng duyệt.` });
    const { rerender } = render(<SdlcWorkspace changeRequestId={base.projectId} crId="cr" selectedStep="SOLUTION"
      workflowState={base} draftHashes={await hashes({ SOLUTION: COMMITTED.SOLUTION })} onNavigateToStep={onNavigateToStep} />);
    expect(screen.queryByTestId('sdlc-stale-banner')).not.toBeInTheDocument();
    rerender(<SdlcWorkspace changeRequestId={base.projectId} crId="cr" selectedStep="SOLUTION" workflowState={base}
      draftHashes={approved} onNavigateToStep={onNavigateToStep} />);
    expect(screen.getByTestId('sdlc-stale-banner')).toHaveTextContent('Bản nháp SOLUTION khác với phiên bản đã lưu.');
    expect(base.artifacts.solution?.version).toBe(1);
    expect(base.artifacts.solution?.approvedAt).toBe('2026-11-05T00:00:00.000Z');
    rerender(<SdlcWorkspace changeRequestId={base.projectId} crId="cr" selectedStep="SOLUTION" workflowState={base}
      draftHashes={await hashes({ SOLUTION: COMMITTED.SOLUTION })} onNavigateToStep={onNavigateToStep} />);
    expect(screen.queryByTestId('sdlc-stale-banner')).not.toBeInTheDocument();
    expect(JSON.stringify(base.artifacts.solution)).toContain('"version":1');
    expect(JSON.stringify(base.artifacts.solution)).toContain('"approvedAt":"2026-11-05T00:00:00.000Z"');
  });

  it('shows TECH_DOCS stale on its owning step only', async () => {
    const base = await state();
    const draftHashes = await hashes({ PL03B: `${COMMITTED.PL03B}\nx` });
    render(<SdlcWorkspace changeRequestId={base.projectId} crId="cr" selectedStep={'TECH_DOCS' as SdlcStepId}
      workflowState={base} draftHashes={draftHashes} onNavigateToStep={vi.fn()} />);
    expect(screen.getByTestId('sdlc-stale-banner')).toHaveTextContent('Bản nháp PL03B khác với phiên bản đã lưu.');
  });
});
