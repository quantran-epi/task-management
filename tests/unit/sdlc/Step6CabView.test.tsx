import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Step6CabView } from '../../../src/components/sdlc/steps/Step6CabView';
import { SdlcWorkflowStateSchema, type SdlcWorkflowState } from '../../../src/services/wizard/workflowSchemas';
import type { ReconciliationResult } from '../../../src/services/wizard/reconciliation';
import type { SdlcWizardRuntime } from '../../../src/services/wizard/sdlcWizardRuntime';

const PROJECT_ID = 'b45c2f09-1a89-4c07-b24e-4f056d68b981';
const THREAD_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const NOTE_ID = '55555555-5555-4555-8555-555555555555';
const HASH = 'ab'.repeat(32);
const NOW = '2026-11-01T12:00:00.000Z';

const driftResult: ReconciliationResult = {
  schemaVersion: 1,
  identity: {
    projectId: PROJECT_ID, threadId: THREAD_ID, solutionNoteId: NOTE_ID,
    solutionVersion: 1, solutionHash: HASH, packHash: HASH, cr: 'CR-2026-999', base: 'base-1', head: 'head-2',
  },
  status: 'PARTIAL_COVERAGE',
  approvedDesign: { currentSystem: 'Core banking', affectedScreens: [], affectedApis: [], affectedTables: [] },
  actualImplementation: { affectedFiles: ['src/transfer.ts'], affectedScreens: [], affectedApis: [], affectedTables: ['TRANSFER'] },
  drift: [],
  dbChangesRollback: { affectedTables: ['TRANSFER'], changes: [], rollback: { status: 'unknown', evidenceIds: [] } },
  regressionMatrix: [],
  coverage: [{ path: 'src/transfer.ts', state: 'included', evidenceIds: [] }],
};

function workflowState(overrides: { pl02?: boolean; pl07?: boolean; cab?: boolean } = {}): SdlcWorkflowState {
  const ref = (kind: string, title: string) => ({
    kind, version: 1, hash: HASH, title, sourceHashes: [], updatedAt: NOW, noteId: NOTE_ID,
  });
  return SdlcWorkflowStateSchema.parse({
    schemaVersion: 1,
    sessionId: SESSION_ID,
    projectId: PROJECT_ID,
    threadId: THREAD_ID,
    currentStep: 'CAB',
    metadata: { cr: 'CR-2026-999', featureName: 'Chuyển tiền nhanh', author: 'Dev Lead', requestingUnit: 'Digital Banking', date: '2026-11-01' },
    artifacts: {
      ...(overrides.pl02 === false ? {} : { pl02: { ...ref('PL02', 'PL02 — Đặc tả'), content: '# PL02\nĐặc tả chức năng.' } }),
      pl03b: { ...ref('PL03B', 'PL03B v1'), content: '# PL03B\n## Thực tế triển khai\n- Thêm API /transfer' },
      ...(overrides.pl07 === false ? {} : { pl07: { ...ref('PL07', 'PL07 v1'), content: '# PL07' } }),
      driftResult,
      ...(overrides.cab ? { cab: ref('CAB', 'CAB v1') } : {}),
    },
    createdAt: NOW,
    updatedAt: NOW,
  });
}

const runtime: SdlcWizardRuntime = {
  model: { endpoint: 'http://localhost:20128', model: 'test' },
  collectEvidence: vi.fn(async () => ({ items: [], coverage: 'PARTIAL' as const, degraded: [] })),
  resolveSetIds: vi.fn(async () => []),
};

const DRAFT_MARKDOWN = [
  '# Tờ trình CAB v1 — Chuyển tiền nhanh',
  '',
  '- Nguồn: PL02 v1, PL03B v1, PL07 v1',
  '- Kỹ thuật: Thêm API /transfer',
  '- Rollback: chưa kiểm chứng',
  '',
  '## Khoảng trống bằng chứng',
  '- Chưa có kết quả đối chiếu Change Pack.',
].join('\n');

describe('Step6CabView', () => {
  it('generates a draft without committing or approving (T-25.3-18)', async () => {
    const handleCommitCab = vi.fn().mockResolvedValue(undefined);
    const handleDraftChange = vi.fn();
    const generateCabDraft = vi.fn(async () => ({ markdown: DRAFT_MARKDOWN }));

    render(
      <Step6CabView
        projectId={PROJECT_ID}
        crId="cr-001"
        workflowState={workflowState()}
        onCommitCab={handleCommitCab}
        onDraftChange={handleDraftChange}
        generateCabDraft={generateCabDraft}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Tạo bản nháp CAB/i }));

    await waitFor(() => expect(generateCabDraft).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('Bản nháp')).toBeInTheDocument());
    expect(handleCommitCab).not.toHaveBeenCalled();
    expect(handleDraftChange).toHaveBeenCalledWith(DRAFT_MARKDOWN);
  });

  it('renders a draft whose text carries no fabricated verification or pin fallback', async () => {
    const generateCabDraft = vi.fn(async () => ({ markdown: DRAFT_MARKDOWN }));

    render(
      <Step6CabView
        projectId={PROJECT_ID}
        crId="cr-001"
        workflowState={workflowState()}
        onCommitCab={vi.fn().mockResolvedValue(undefined)}
        generateCabDraft={generateCabDraft}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Tạo bản nháp CAB/i }));

    await waitFor(() => expect(screen.getByText(/Khoảng trống bằng chứng/i)).toBeInTheDocument());
    expect(screen.queryByText(/Verified:\s*Có/i)).toBeNull();
    expect(screen.queryByText(/đã được kiểm soát/i)).toBeNull();
    expect(screen.queryByText(/pl02-note-id|pl03b-note-id|pl07-note-id/i)).toBeNull();
  });

  it('disables generation and names the missing doc with navigation when prerequisites are absent', () => {
    const handleNavigate = vi.fn();

    render(
      <Step6CabView
        projectId={PROJECT_ID}
        crId="cr-001"
        workflowState={workflowState({ pl02: false, pl07: false })}
        onCommitCab={vi.fn().mockResolvedValue(undefined)}
        onNavigateToStep={handleNavigate}
        wizardRuntime={runtime}
      />,
    );

    expect(screen.getByRole('button', { name: /Tạo bản nháp CAB/i })).toBeDisabled();
    expect(screen.getByText(/Chưa đủ điều kiện: Thiếu PL03B \/ PL07 từ Bước 5/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Chuyển đến Bước 5: Tài liệu kỹ thuật/i }));
    expect(handleNavigate).toHaveBeenCalledWith('TECH_DOCS');
  });

  it('calls onCommitCab with the complete markdown only from Lưu & Phê duyệt', async () => {
    const handleCommitCab = vi.fn().mockResolvedValue(undefined);
    const generateCabDraft = vi.fn(async () => ({ markdown: DRAFT_MARKDOWN }));

    render(
      <Step6CabView
        projectId={PROJECT_ID}
        crId="cr-001"
        workflowState={workflowState()}
        onCommitCab={handleCommitCab}
        generateCabDraft={generateCabDraft}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Tạo bản nháp CAB/i }));
    await waitFor(() => expect(screen.getByText('Bản nháp')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Lưu & Phê duyệt/i }));

    await waitFor(() => expect(handleCommitCab).toHaveBeenCalledWith(DRAFT_MARKDOWN));
    expect(handleCommitCab).toHaveBeenCalledTimes(1);
  });

  it('disables generation and shows the configuration alert when no model is wired (T-25.3-51)', () => {
    render(
      <Step6CabView
        projectId={PROJECT_ID}
        crId="cr-001"
        workflowState={workflowState()}
        onCommitCab={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByRole('button', { name: /Tạo bản nháp CAB/i })).toBeDisabled();
    expect(screen.getByText(/Chưa cấu hình mô hình AI\. Vui lòng thiết lập endpoint và API key trong Cài đặt\./i)).toBeInTheDocument();
  });

  it('renders the internal CR summary separately and flags an unverified rollback (T-25.3-19)', () => {
    render(
      <Step6CabView
        projectId={PROJECT_ID}
        crId="cr-001"
        workflowState={workflowState()}
        onCommitCab={vi.fn().mockResolvedValue(undefined)}
        wizardRuntime={runtime}
      />,
    );

    expect(screen.getByText(/Tóm tắt CR nội bộ \(chỉ trong TaskMate\)/i)).toBeInTheDocument();
    expect(screen.getByText('Chưa kiểm chứng')).toBeInTheDocument();
    expect(screen.getByText('Thêm API /transfer')).toBeInTheDocument();
    expect(screen.getByText(/Thiếu bằng chứng: chưa có Tờ trình CAB đã duyệt/i)).toBeInTheDocument();
  });

  it('keeps approval out of reach until a draft exists', () => {
    render(
      <Step6CabView
        projectId={PROJECT_ID}
        crId="cr-001"
        workflowState={workflowState()}
        onCommitCab={vi.fn().mockResolvedValue(undefined)}
        wizardRuntime={runtime}
      />,
    );

    expect(screen.getByRole('button', { name: /Lưu & Phê duyệt/i })).toBeDisabled();
  });
});
