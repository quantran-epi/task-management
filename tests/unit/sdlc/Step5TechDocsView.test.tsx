import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Step5TechDocsView } from '../../../src/components/sdlc/steps/Step5TechDocsView';
import { SdlcWorkflowStateSchema, type SdlcWorkflowState } from '../../../src/services/wizard/workflowSchemas';
import type { ReconciliationResult } from '../../../src/services/wizard/reconciliation';
import type { SdlcWizardRuntime } from '../../../src/services/wizard/sdlcWizardRuntime';

const PROJECT_ID = 'b45c2f09-1a89-4c07-b24e-4f056d68b981';
const THREAD_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const HASH = 'ab'.repeat(32);

const driftResult: ReconciliationResult = {
  schemaVersion: 1,
  identity: {
    projectId: PROJECT_ID, threadId: THREAD_ID, solutionNoteId: '55555555-5555-4555-8555-555555555555',
    solutionVersion: 1, solutionHash: HASH, packHash: HASH, cr: 'CR-2026-999', base: 'base-1', head: 'head-2',
  },
  status: 'PARTIAL_COVERAGE',
  approvedDesign: { currentSystem: 'Core banking', affectedScreens: [], affectedApis: [], affectedTables: [] },
  actualImplementation: { affectedFiles: [], affectedScreens: [], affectedApis: [], affectedTables: ['TRANSFER'] },
  drift: [],
  dbChangesRollback: { affectedTables: ['TRANSFER'], changes: [], rollback: { status: 'unknown', evidenceIds: [] } },
  regressionMatrix: [],
  coverage: [{ path: 'src/transfer.ts', state: 'included', evidenceIds: [] }],
};

function workflowState(overrides: { solution?: boolean; changePack?: boolean; pl03b?: boolean; pl07?: boolean } = {}): SdlcWorkflowState {
  const ref = (kind: string, title: string) => ({
    kind, version: 1, hash: HASH, title, sourceHashes: [], updatedAt: '2026-11-01T12:00:00.000Z',
  });
  return SdlcWorkflowStateSchema.parse({
    schemaVersion: 1,
    sessionId: SESSION_ID,
    projectId: PROJECT_ID,
    threadId: THREAD_ID,
    currentStep: 'TECH_DOCS',
    metadata: {
      cr: 'CR-2026-999', featureName: 'Chuyển tiền nhanh', author: 'Dev Lead',
      requestingUnit: 'Digital Banking', date: '2026-11-01',
    },
    artifacts: {
      ...(overrides.solution === false ? {} : { solution: { ...ref('SOLUTION', 'SOLUTION.md'), noteId: '55555555-5555-4555-8555-555555555555' } }),
      ...(overrides.changePack === false ? {} : { changePack: ref('CHANGE_PACK', 'Change Pack') }),
      driftResult,
      ...(overrides.pl03b ? { pl03b: ref('PL03B', 'PL03B v1') } : {}),
      ...(overrides.pl07 ? { pl07: ref('PL07', 'PL07 v1') } : {}),
    },
    createdAt: '2026-11-01T12:00:00.000Z',
    updatedAt: '2026-11-01T12:00:00.000Z',
  });
}

const runtime: SdlcWizardRuntime = {
  model: { endpoint: 'http://localhost:20128', model: 'test' },
  collectEvidence: vi.fn(async () => ({ items: [], coverage: 'PARTIAL' as const, degraded: [] })),
  resolveSetIds: vi.fn(async () => []),
};

describe('Step5TechDocsView', () => {
  it('renders both review tabs with the draft CTA labels', () => {
    render(
      <Step5TechDocsView
        projectId={PROJECT_ID}
        crId="cr-001"
        workflowState={workflowState()}
        onCommitTechDoc={vi.fn().mockResolvedValue(undefined)}
        wizardRuntime={runtime}
      />,
    );

    expect(screen.getByText(/PL03B — Thiết kế & Triển khai/i)).toBeInTheDocument();
    expect(screen.getByText(/PL07 — Checklist An toàn Review/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tạo bản nháp$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tạo PL03B & PL07 bằng AI/i })).toBeNull();
  });

  it('produces a draft without ever calling onCommitTechDoc', async () => {
    const handleCommit = vi.fn().mockResolvedValue(undefined);
    const generateDrafts = vi.fn(async () => ({ pl03b: '# PL03B nháp\nNội dung nháp.', pl07: '# PL07 nháp' }));

    render(
      <Step5TechDocsView
        projectId={PROJECT_ID}
        crId="cr-001"
        workflowState={workflowState()}
        onCommitTechDoc={handleCommit}
        generateDrafts={generateDrafts}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Tạo bản nháp$/i }));

    await waitFor(() => expect(generateDrafts).toHaveBeenCalledTimes(1));
    expect(handleCommit).not.toHaveBeenCalled();
  });

  it('labels the generated content as a draft and offers the re-generate label', async () => {
    const generateDrafts = vi.fn(async () => ({ pl03b: '# PL03B nháp\nNội dung nháp.', pl07: '# PL07 nháp' }));

    render(
      <Step5TechDocsView
        projectId={PROJECT_ID}
        crId="cr-001"
        workflowState={workflowState()}
        onCommitTechDoc={vi.fn().mockResolvedValue(undefined)}
        generateDrafts={generateDrafts}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Tạo bản nháp$/i }));

    await waitFor(() => expect(screen.getAllByText('Bản nháp')).toHaveLength(2));
    expect(screen.queryByText(/Đã duyệt \(v\d+\)/)).toBeNull();
    expect(screen.getByRole('button', { name: /Tạo lại bản nháp/i })).toBeInTheDocument();
  });

  it('calls onCommitTechDoc with the complete markdown only from Lưu & Phê duyệt', async () => {
    const handleCommit = vi.fn().mockResolvedValue(undefined);
    const pl03bMarkdown = '# PL03B nháp\nNội dung nháp đầy đủ.';
    const generateDrafts = vi.fn(async () => ({ pl03b: pl03bMarkdown, pl07: '# PL07 nháp' }));

    render(
      <Step5TechDocsView
        projectId={PROJECT_ID}
        crId="cr-001"
        workflowState={workflowState()}
        onCommitTechDoc={handleCommit}
        generateDrafts={generateDrafts}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Tạo bản nháp$/i }));
    await waitFor(() => expect(screen.getAllByText('Bản nháp')).toHaveLength(2));

    fireEvent.click(screen.getByRole('button', { name: /Lưu & Phê duyệt/i }));

    await waitFor(() => expect(handleCommit).toHaveBeenCalledWith('PL03B', pl03bMarkdown));
    expect(handleCommit).toHaveBeenCalledTimes(1);
  });

  it('disables generation and names the missing artifact with navigation when prerequisites are absent', () => {
    const handleNavigate = vi.fn();

    render(
      <Step5TechDocsView
        projectId={PROJECT_ID}
        crId="cr-001"
        workflowState={workflowState({ solution: false, changePack: false })}
        onCommitTechDoc={vi.fn().mockResolvedValue(undefined)}
        onNavigateToStep={handleNavigate}
        wizardRuntime={runtime}
      />,
    );

    expect(screen.getByRole('button', { name: /Tạo bản nháp$/i })).toBeDisabled();
    expect(screen.getByText(/Chưa đủ điều kiện: Thiếu SOLUTION\.md và Change Pack đã xác thực từ Bước 4/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Chuyển đến Bước 4: Kiểm soát Change Pack/i }));
    expect(handleNavigate).toHaveBeenCalledWith('CHANGE_PACK');
  });

  it('disables generation and shows the configuration alert when no model is wired', () => {
    render(
      <Step5TechDocsView
        projectId={PROJECT_ID}
        crId="cr-001"
        workflowState={workflowState()}
        onCommitTechDoc={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByRole('button', { name: /Tạo bản nháp$/i })).toBeDisabled();
    expect(screen.getByText(/Chưa cấu hình mô hình AI\. Vui lòng thiết lập endpoint và API key trong Cài đặt\./i)).toBeInTheDocument();
  });

  it('never pre-marks the approval tag while a document is only a draft', () => {
    render(
      <Step5TechDocsView
        projectId={PROJECT_ID}
        crId="cr-001"
        workflowState={workflowState()}
        onCommitTechDoc={vi.fn().mockResolvedValue(undefined)}
        draftPl03b="# PL03B nháp"
        wizardRuntime={runtime}
      />,
    );

    expect(screen.getAllByText('Bản nháp')).toHaveLength(1);
    expect(screen.queryByText(/Đã duyệt/)).toBeNull();
  });
});
