import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SdlcWorkflowHub } from '../SdlcWorkflowHub';
import { StepChangePackPanel, StepSolutionPanel, StepTechDocsPanel, type HubChangePackDraft } from '../HubStepPanels';
import { ERROR_COPY } from '../ChangePackConfirmStrip';
import { RevisionImpactModal } from '../RevisionImpactModal';
import type { SdlcWorkflowState } from '../../../../services/wizard/workflowSchemas';
import type { ChangePackManifest } from '../../../../services/wizard/changePack';
import type { ReconciliationResult } from '../../../../services/wizard/reconciliation';

describe('SdlcWorkflowHub', () => {
  const dummyState: SdlcWorkflowState = {
    schemaVersion: 1,
    sessionId: '11111111-1111-4111-8111-111111111111',
    projectId: '22222222-2222-4222-8222-222222222222',
    threadId: '33333333-3333-4333-8333-333333333333',
    currentStep: 'SOLUTION',
    selectedStep: 'SOLUTION',
    metadata: {
      cr: 'CR-TEST-99',
      featureName: 'Core Banking Payment',
      author: 'DevLead',
      requestingUnit: 'Digital Banking',
      date: '2026-10-30',
    },
    artifacts: {
      pl01: {
        kind: 'PL01',
        version: 1,
        hash: '01'.repeat(32),
        title: 'PL01 Yêu cầu',
        content: 'Yêu cầu nghiệp vụ ban đầu',
        sourceHashes: [],
        updatedAt: '2026-10-30T00:00:00.000Z',
      },
      pl02: {
        kind: 'PL02',
        version: 1,
        hash: '02'.repeat(32),
        title: 'PL02 Đặc tả',
        content: 'Đặc tả chức năng ban đầu',
        sourceHashes: ['01'.repeat(32)],
        updatedAt: '2026-10-30T00:00:00.000Z',
      },
      solution: {
        kind: 'SOLUTION',
        version: 1,
        hash: '03'.repeat(32),
        title: 'SOLUTION.md — v1 (Core Banking Payment)',
        content: 'Nội dung solution v1',
        sourceHashes: ['01'.repeat(32), '02'.repeat(32)],
        updatedAt: '2026-10-30T00:00:00.000Z',
      },
    },
    staleSteps: [],
    createdAt: '2026-10-30T00:00:00.000Z',
    updatedAt: '2026-10-30T00:00:00.000Z',
  };

  it('hiển thị nhắc nhở chọn project khi projectScoped = false', () => {
    render(<SdlcWorkflowHub projectScoped={false} onStartWorkflow={vi.fn()} />);
    expect(screen.getByText(/Chọn phạm vi Dự án để kích hoạt/i)).toBeInTheDocument();
  });

  it('hiển thị nút khởi tạo khi chưa có state', () => {
    const handleStart = vi.fn();
    render(<SdlcWorkflowHub projectScoped={true} onStartWorkflow={handleStart} />);
    const startButton = screen.getByText(/Khởi tạo SDLC/i);
    expect(startButton).toBeInTheDocument();

    fireEvent.click(startButton);
    expect(handleStart).toHaveBeenCalled();
  });

  it('hiển thị đúng 6 bước dọc với nhãn trạng thái tiếng Việt và không chỉ dùng màu sắc', () => {
    render(<SdlcWorkflowHub projectScoped={true} state={dummyState} onStartWorkflow={vi.fn()} />);

    expect(screen.getByText(/CR-TEST-99/i)).toBeInTheDocument();
    expect(screen.getByText(/Core Banking Payment/i)).toBeInTheDocument();

    // 6 bước dọc
    expect(screen.getAllByText(/Bước 1/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Bước 2/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Bước 3/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Bước 4/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Bước 5/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Bước 6/i).length).toBeGreaterThanOrEqual(1);

    // Nhãn trạng thái tiếng Việt rõ ràng trong DOM
    expect(screen.getByText('Đã xong')).toBeInTheDocument(); // Bước 1 (INTAKE)
    expect(screen.getByText('Đang xử lý')).toBeInTheDocument(); // Bước 2 (SOLUTION)
    const pendingLabels = screen.getAllByText('Chưa bắt đầu');
    expect(pendingLabels.length).toBeGreaterThanOrEqual(4); // Các bước sau
  });

  it('D-17: chọn dòng timeline chỉ đổi chi tiết xem (selectedStep), không đổi bước đang xử lý', () => {
    const handleSelectStep = vi.fn();
    render(
      <SdlcWorkflowHub
        projectScoped={true}
        state={dummyState}
        onStartWorkflow={vi.fn()}
        onSelectStep={handleSelectStep}
      />
    );

    // Click vào bước 1 (INTAKE)
    const step1Button = screen.getByRole('button', { name: /Hồ sơ Đầu vào/i });
    fireEvent.click(step1Button);

    expect(handleSelectStep).toHaveBeenCalledWith('INTAKE');
    // Bước đang xử lý vẫn là Bước 2: SOLUTION
    expect(screen.getByText('Đang xử lý')).toBeInTheDocument();
  });

  it('D-25: hiển thị ghi chú tài liệu cũ (stale) chỉ đọc và không có nút chạy downstream', () => {
    const staleState: SdlcWorkflowState = {
      ...dummyState,
      currentStep: 'TECH_DOCS',
      selectedStep: 'SOLUTION',
      staleSteps: ['SOLUTION', 'CODE_GUIDE'],
    };

    render(<SdlcWorkflowHub projectScoped={true} state={staleState} onStartWorkflow={vi.fn()} />);

    expect(
      screen.getByText(/Tài liệu cũ \(stale\) — chỉ đọc để đối chiếu, không dùng làm căn cứ cho bước mới\./i)
    ).toBeInTheDocument();
  });

  it('D-20/D-21: hiển thị nút cập nhật yêu cầu và solution khi đủ điều kiện', () => {
    render(<SdlcWorkflowHub projectScoped={true} state={dummyState} onStartWorkflow={vi.fn()} />);

    expect(screen.getByRole('button', { name: /Cập nhật yêu cầu/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cập nhật solution/i })).toBeInTheDocument();
  });

  it('D-26/D-27: hiển thị chu kỳ hiện tại và danh sách chu kỳ trước chỉ đọc', () => {
    const stateWithCycles: SdlcWorkflowState = {
      ...dummyState,
      cycles: [
        {
          cycleId: '11111111-1111-4111-8111-000000000001',
          status: 'completed',
          startedAt: '2026-10-29T00:00:00.000Z',
          closedAt: '2026-10-29T12:00:00.000Z',
        },
        {
          cycleId: '11111111-1111-4111-8111-000000000002',
          status: 'active',
          startedAt: '2026-10-30T00:00:00.000Z',
        },
      ],
    };

    render(<SdlcWorkflowHub projectScoped={true} state={stateWithCycles} onStartWorkflow={vi.fn()} />);

    // Chu kỳ 2 đang thực hiện
    expect(screen.getByText(/Chu kỳ 2 — Đang thực hiện/i)).toBeInTheDocument();
    // Chu kỳ 1 hoàn tất chỉ đọc
    expect(screen.getByText(/Chu kỳ 1 — Hoàn tất/i)).toBeInTheDocument();
    expect(screen.getByText('Chỉ đọc')).toBeInTheDocument();
  });

  it('collapses and expands the six-row timeline while keeping the detail panel visible', () => {
    render(<SdlcWorkflowHub projectScoped={true} state={dummyState} onStartWorkflow={vi.fn()} />);

    const list = document.getElementById('sdlc-step-list');
    expect(list).not.toBeNull();
    expect(list).not.toHaveAttribute('hidden');

    const toggle = screen.getByRole('button', { name: 'Thu gọn quy trình' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAttribute('aria-controls', 'sdlc-step-list');

    fireEvent.click(toggle);

    const collapsedToggle = screen.getByRole('button', { name: 'Mở rộng quy trình' });
    expect(collapsedToggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById('sdlc-step-list')).toHaveAttribute('hidden');
    expect(screen.getByText('Bước 2/6 — 2. Solution')).toBeInTheDocument();
    // Detail panel stays visible: only the six rows collapse.
    expect(screen.getByText(/Bước 2\/6: Giải pháp SOLUTION\.md/)).toBeInTheDocument();

    fireEvent.click(collapsedToggle);
    expect(screen.getByRole('button', { name: 'Thu gọn quy trình' })).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById('sdlc-step-list')).not.toHaveAttribute('hidden');
    expect(screen.queryByText('Bước 2/6 — 2. Solution')).not.toBeInTheDocument();
  });

  it('moves focus to the toggle before hiding the rows', () => {
    render(<SdlcWorkflowHub projectScoped={true} state={dummyState} onStartWorkflow={vi.fn()} />);

    const stepRow = screen.getByRole('button', { name: /Hồ sơ Đầu vào/i });
    stepRow.focus();
    expect(stepRow).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Thu gọn quy trình' }));

    expect(screen.getByRole('button', { name: 'Mở rộng quy trình' })).toHaveFocus();
  });

  it('appends the stale count to the collapsed summary', () => {
    const staleState: SdlcWorkflowState = {
      ...dummyState,
      currentStep: 'CHANGE_PACK',
      selectedStep: 'CHANGE_PACK',
      staleSteps: ['CHANGE_PACK'],
    };

    render(<SdlcWorkflowHub projectScoped={true} state={staleState} onStartWorkflow={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Thu gọn quy trình' }));

    expect(screen.getByText('Bước 4/6 — 4. Change Pack · 1 bước cần cập nhật')).toBeInTheDocument();
  });

  it('renders a per-step panel body and keeps step 3 on the hint body', () => {
    render(<SdlcWorkflowHub projectScoped={true} state={dummyState} onStartWorkflow={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Change Pack & Soi Drift/i }));
    expect(screen.getByText('Bước 4/6: Change Pack & Soi Drift')).toBeInTheDocument();
    expect(screen.getByTestId('hub-panel-CHANGE_PACK')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Triển khai Code ngoài/i }));
    const codeGuidePanel = screen.getByTestId('hub-panel-CODE_GUIDE');
    expect(codeGuidePanel).toHaveTextContent('node scripts/change-pack.mjs --cr <MÃ_CR>');
  });

  it('hosts the PL02 export slot on the INTAKE panel without touching currentStep', () => {
    render(<SdlcWorkflowHub projectScoped={true} state={dummyState} onStartWorkflow={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Hồ sơ Đầu vào/i }));

    const intakePanel = screen.getByTestId('hub-panel-INTAKE');
    expect(intakePanel).toHaveTextContent('PL02 — Đặc tả chức năng');
    expect(intakePanel).toContainElement(screen.getByTestId('export-slot-PL02'));
    // D-17: selecting a row is view-only; the processing row is still step 2.
    expect(screen.getByText('Đang xử lý')).toBeInTheDocument();
    expect(screen.getByText(/Đang xem bước 1 — chỉ đọc\. Bước đang xử lý: Giải pháp SOLUTION\.md\./)).toBeInTheDocument();
    expect(screen.getByText('Bước 1/6: Hồ sơ Đầu vào (PL01 & PL02)')).toBeInTheDocument();
  });

  it('renders injected panels when the drawer supplies them', () => {
    render(
      <SdlcWorkflowHub
        projectScoped={true}
        state={dummyState}
        onStartWorkflow={vi.fn()}
        stepPanels={{ solution: <div data-testid="wired-solution">wired panel</div> }}
      />
    );

    expect(screen.getByTestId('wired-solution')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lưu SOLUTION.md' })).not.toBeInTheDocument();
  });
});

describe('StepChangePackPanel', () => {
  const manifest: Readonly<ChangePackManifest> = {
    schemaVersion: 1,
    packHash: 'ab'.repeat(32),
    identity: { cr: 'CR-25001', base: 'base-1', head: 'head-2', branch: 'feature/CR-25001' },
    meta: {
      cr: 'CR-25001',
      base: 'base-1',
      head: 'head-2',
      branch: 'feature/CR-25001',
      author: 'tester',
      generatedAt: '2026-10-30T00:00:00.000Z',
      commits: [{ sha: 'head-2', subject: 'one commit' }],
      files: [{ path: 'src/feature.ts', status: 'modified' }],
    },
    entries: [{ path: 'src/feature.ts', sizeBytes: 10, status: 'included', coverage: 'included', content: 'x' }],
    compressedBytes: 100,
    expandedBytes: 200,
    commitCount: 1,
    fileCount: 1,
    coverageStatus: 'complete',
  };

  const artifact = {
    kind: 'CHANGE_PACK' as const,
    version: 1,
    hash: manifest.packHash,
    title: 'Change pack CR-25001 (1 tệp)',
    sourceHashes: ['03'.repeat(32)],
    updatedAt: '2026-10-30T00:00:00.000Z',
  };

  const drift: ReconciliationResult = {
    schemaVersion: 1,
    identity: {
      projectId: '22222222-2222-4222-8222-222222222222',
      threadId: '33333333-3333-4333-8333-333333333333',
      solutionNoteId: '44444444-4444-4444-8444-444444444444',
      solutionVersion: 1,
      solutionHash: '03'.repeat(32),
      packHash: manifest.packHash,
      cr: 'CR-25001',
      base: 'base-1',
      head: 'head-2',
    },
    status: 'PARTIAL_COVERAGE',
    approvedDesign: { currentSystem: 'x', affectedScreens: [], affectedApis: [], affectedTables: [] },
    actualImplementation: { affectedFiles: [], affectedScreens: [], affectedApis: [], affectedTables: [] },
    drift: [],
    dbChangesRollback: { affectedTables: [], changes: [], rollback: { status: 'unknown', evidenceIds: [] } },
    regressionMatrix: [],
    coverage: [{ path: 'src/feature.ts', state: 'included', evidenceIds: [] }],
  };

  const renderPanel = (draft: HubChangePackDraft, extra: Record<string, unknown> = {}) =>
    render(
      <StepChangePackPanel
        stale={false}
        cr="CR-25001"
        draft={draft}
        onSelectFile={vi.fn()}
        onConfirm={vi.fn()}
        onReplace={vi.fn()}
        {...extra}
      />
    );

  it('idle renders the dropzone with its exact copy', () => {
    renderPanel({ status: 'idle' });
    expect(screen.getByRole('button', { name: 'Khu vực nạp change-pack' })).toBeInTheDocument();
    expect(screen.getByText('Kéo thả change-pack.zip vào đây hoặc bấm để chọn tệp.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xác nhận pack' })).not.toBeInTheDocument();
  });

  it('validating renders the status line and no buttons', () => {
    renderPanel({ status: 'validating' });
    expect(screen.getByRole('status')).toHaveTextContent('Đang kiểm tra change-pack…');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Khu vực nạp change-pack' })).not.toBeInTheDocument();
  });

  it('invalid renders the enumerated error copy and Chọn pack khác', () => {
    renderPanel({ status: 'invalid', code: 'PACK_IDENTITY_MISMATCH' });
    expect(screen.getByText(ERROR_COPY.PACK_IDENTITY_MISMATCH)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chọn pack khác' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xác nhận pack' })).not.toBeInTheDocument();
  });

  it('pending renders the identity line and both buttons', () => {
    renderPanel({ status: 'pending', manifest });
    expect(screen.getByText('CR CR-25001 · Nhánh feature/CR-25001 · 1 commit · 1 tệp')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xác nhận pack' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Chọn pack khác' })).toBeEnabled();
  });

  it('moves focus to Xác nhận pack after the pending transition removes the dropzone', () => {
    const { rerender } = renderPanel({ status: 'validating' });
    rerender(
      <StepChangePackPanel stale={false} cr="CR-25001" draft={{ status: 'pending', manifest }} onReplace={vi.fn()} />
    );
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Xác nhận pack' }));
  });

  it('confirming disables both buttons and announces the reconciliation', () => {
    renderPanel({ status: 'confirming', manifest });
    expect(screen.getByRole('button', { name: /Xác nhận pack/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Chọn pack khác' })).toBeDisabled();
    expect(screen.getByText('Đang đối chiếu với SOLUTION.md…')).toBeInTheDocument();
  });

  it('committed renders Đã nạp change-pack and the stacked matrix', () => {
    renderPanel({ status: 'idle' }, { artifact, driftResult: drift });
    expect(screen.getByText('Đã nạp change-pack CR-25001')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bảng drift so với SOLUTION.md' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chọn pack khác' })).toBeInTheDocument();
  });

  it('omits the matrix when no drift result exists', () => {
    renderPanel({ status: 'idle' }, { artifact });
    expect(screen.getByText('Đã nạp change-pack CR-25001')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Bảng drift so với SOLUTION.md' })).not.toBeInTheDocument();
  });
});

describe('StepTechDocsPanel', () => {
  const artifact = (kind: 'PL03B' | 'PL07', version: number) => ({
    kind,
    version,
    hash: '07'.repeat(32),
    title: `${kind} — v${version} (Core Banking Payment)`,
    approvedAt: '2026-11-01T05:00:00.000Z',
    updatedAt: '2026-11-01T05:00:00.000Z',
  });

  const generateButton = () => screen.getByRole('button', { name: /Tạo (lại )?PL03B & PL07/ });

  it('blocked shows the prerequisite hint and a disabled generate button', () => {
    render(<StepTechDocsPanel stale={false} state="blocked" />);
    expect(screen.getByText('Cần SOLUTION.md và change-pack đã xác nhận trước khi sinh PL03B & PL07.')).toBeInTheDocument();
    expect(generateButton()).toBeDisabled();
  });

  it('ready enables the generate button', () => {
    render(<StepTechDocsPanel stale={false} state="ready" onGenerate={vi.fn()} />);
    expect(generateButton()).toBeEnabled();
    expect(screen.queryByText('Cần SOLUTION.md và change-pack đã xác nhận trước khi sinh PL03B & PL07.')).not.toBeInTheDocument();
  });

  it('generating announces the status line and keeps the rest of the panel rendered', () => {
    render(<StepTechDocsPanel stale={false} state="generating" onGenerate={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Đang sinh PL03B & PL07…');
    expect(generateButton()).toBeDisabled();
    expect(screen.getByTestId('export-slot-PL03B')).toBeInTheDocument();
    expect(screen.getByTestId('export-slot-PL07')).toBeInTheDocument();
  });

  it('error shows the enumerated copy and Thử lại calls onRetry', () => {
    const onRetry = vi.fn();
    render(<StepTechDocsPanel stale={false} state="error" onGenerate={vi.fn()} onRetry={onRetry} />);
    expect(screen.getByText('Không sinh được PL03B & PL07. Kiểm tra SOLUTION.md và change-pack rồi thử lại.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders artifact rows with kind label, version tag and approved date', () => {
    render(
      <StepTechDocsPanel
        stale={false}
        state="ready"
        pl03b={artifact('PL03B', 2)}
        pl07={artifact('PL07', 1)}
      />
    );
    expect(screen.getByText('PL03B — Tài liệu triển khai')).toBeInTheDocument();
    expect(screen.getByText('PL07 — Checklist review')).toBeInTheDocument();
    expect(screen.getByText('v2')).toBeInTheDocument();
    expect(screen.getByText('v1')).toBeInTheDocument();
    expect(screen.getAllByText('2026-11-01')).toHaveLength(2);
  });

  it('shows the missing-doc copy when an artifact is absent', () => {
    render(<StepTechDocsPanel stale={false} state="ready" pl03b={artifact('PL03B', 1)} />);
    expect(screen.getByText('Chưa có — bấm Tạo PL03B & PL07.')).toBeInTheDocument();
  });

  it('switches to the rerun label when stale or when a document already exists', () => {
    const { rerender } = render(<StepTechDocsPanel stale={false} state="ready" />);
    expect(screen.getByRole('button', { name: 'Tạo PL03B & PL07' })).toBeInTheDocument();

    rerender(<StepTechDocsPanel stale state="ready" />);
    expect(screen.getByRole('button', { name: 'Tạo lại PL03B & PL07' })).toBeInTheDocument();

    rerender(<StepTechDocsPanel stale={false} state="ready" pl03b={artifact('PL03B', 1)} />);
    expect(screen.getByRole('button', { name: 'Tạo lại PL03B & PL07' })).toBeInTheDocument();
  });

  it('renders the export rows when provided and omits them otherwise', () => {
    const { rerender } = render(<StepTechDocsPanel stale={false} state="ready" />);
    expect(screen.queryByTestId('export-row-PL03B')).not.toBeInTheDocument();

    rerender(
      <StepTechDocsPanel
        stale={false}
        state="ready"
        renderExportRow={(kind) => <span data-testid={`export-row-${kind}`}>Xuất {kind}</span>}
      />
    );
    expect(screen.getByTestId('export-row-PL03B')).toBeInTheDocument();
    expect(screen.getByTestId('export-row-PL07')).toBeInTheDocument();
  });
});

describe('StepSolutionPanel', () => {  const saveButton = () => screen.getByRole('button', { name: /Lưu SOLUTION\.md/ });

  it('disables the save button when canSave is false', () => {
    render(<StepSolutionPanel stale={false} canSave={false} onSave={vi.fn()} />);
    expect(saveButton()).toBeDisabled();
  });

  it('enables the save button when canSave is true', () => {
    render(<StepSolutionPanel stale={false} canSave={true} onSave={vi.fn()} />);
    expect(saveButton()).toBeEnabled();
  });

  it('shows the button loading while saving and does not fire onSave', () => {
    const onSave = vi.fn();
    render(<StepSolutionPanel stale={false} canSave={true} onSave={onSave} saving={true} />);

    expect(saveButton()).toBeDisabled();
    fireEvent.click(saveButton());
    expect(onSave).not.toHaveBeenCalled();
  });

  it('fires onSave once per click', () => {
    const onSave = vi.fn();
    render(<StepSolutionPanel stale={false} canSave={true} onSave={onSave} />);

    fireEvent.click(saveButton());
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('shows the saved confirmation when savedNoteId is set', () => {
    const { rerender } = render(<StepSolutionPanel stale={false} canSave={true} onSave={vi.fn()} />);
    expect(screen.queryByText('Đã lưu vào tài liệu dự án')).not.toBeInTheDocument();

    rerender(<StepSolutionPanel stale={false} canSave={true} onSave={vi.fn()} savedNoteId="note-1" />);
    expect(screen.getByText('Đã lưu vào tài liệu dự án')).toBeInTheDocument();
  });
});

describe('RevisionImpactModal', () => {
  const revisionState: SdlcWorkflowState = {
    schemaVersion: 1,
    sessionId: '11111111-1111-4111-8111-111111111111',
    projectId: '22222222-2222-4222-8222-222222222222',
    threadId: '33333333-3333-4333-8333-333333333333',
    currentStep: 'SOLUTION',
    metadata: { cr: 'CR-TEST-99', featureName: 'Feature', author: 'Dev', requestingUnit: 'Unit', date: '2026-10-30' },
    artifacts: {
      pl01: { kind: 'PL01', version: 1, hash: '01'.repeat(32), title: 'PL01', content: 'old', sourceHashes: [], updatedAt: '2026-10-30T00:00:00.000Z' },
      pl02: { kind: 'PL02', version: 1, hash: '02'.repeat(32), title: 'PL02', content: 'old', sourceHashes: [], updatedAt: '2026-10-30T00:00:00.000Z' },
      solution: { kind: 'SOLUTION', version: 1, hash: '03'.repeat(32), title: 'SOLUTION', content: 'old', sourceHashes: [], updatedAt: '2026-10-30T00:00:00.000Z' },
    },
    staleSteps: [],
    createdAt: '2026-10-30T00:00:00.000Z',
    updatedAt: '2026-10-30T00:00:00.000Z',
  };

  it('hiển thị diff (+/-), nguồn, chuỗi tác động stale, và chỉ gọi onConfirm khi người dùng xác nhận', async () => {
    const handleConfirm = vi.fn();
    const handleClose = vi.fn();

    render(
      <RevisionImpactModal
        open={true}
        revisionType="requirement"
        diff={{
          before: 'Hạn mức chuyển tiền: 100 triệu.',
          after: 'Hạn mức chuyển tiền: 500 triệu.\nBổ sung ưu đãi VIP.',
        }}
        sources={[
          { title: 'PL01 Yêu cầu Core Banking v2', shortHash: '01010101' },
        ]}
        staleStepIds={['SOLUTION', 'CODE_GUIDE', 'CHANGE_PACK', 'TECH_DOCS', 'CAB']}
        onConfirm={handleConfirm}
        onClose={handleClose}
      />
    );

    // Tiêu đề modal
    expect(screen.getByText('Xác nhận cập nhật yêu cầu')).toBeInTheDocument();

    // Nguồn
    expect(screen.getByText(/Nguồn: 1 tài liệu · PL01 Yêu cầu Core Banking v2/i)).toBeInTheDocument();

    // Chuỗi tác động stale
    expect(screen.getAllByText(/Giải pháp SOLUTION.md/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Tờ trình phê duyệt CAB/i).length).toBeGreaterThanOrEqual(1);

    // Câu tóm tắt
    expect(
      screen.getByText(/Cập nhật này sẽ làm stale 5 bước/i)
    ).toBeInTheDocument();

    // Bấm hủy -> không gọi confirm
    const cancelBtn = screen.getByRole('button', { name: /Tiếp tục thảo luận/i });
    fireEvent.click(cancelBtn);
    expect(handleClose).toHaveBeenCalled();
    expect(handleConfirm).not.toHaveBeenCalled();

    // Bấm xác nhận -> gọi handleConfirm
    const confirmBtn = screen.getByRole('button', { name: /Xác nhận cập nhật/i });
    fireEvent.click(confirmBtn);
    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });

  it('uses coordinator preview data and commits only after explicit confirmation', () => {
    const onPreview = vi.fn();
    const onCommit = vi.fn();
    render(
      <SdlcWorkflowHub
        projectScoped={true}
        state={revisionState}
        onStartWorkflow={vi.fn()}
        onRequestSolutionRevision={() => {}}
        revisionPreview={{
          diff: { before: 'old', after: 'new' },
          sources: [{ title: 'PL01 source', shortHash: 'abcd1234' }],
          impactSteps: ['CODE_GUIDE', 'CHANGE_PACK'],
        }}
        onPreviewRevision={onPreview}
        onCommitRevision={onCommit}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Cập nhật solution/i }));
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('opens its own revision modal and commits once after an explicit confirm', () => {
    const onPreview = vi.fn();
    const onCommit = vi.fn();
    const onDraftChange = vi.fn();
    render(
      <SdlcWorkflowHub
        projectScoped={true}
        state={revisionState}
        onStartWorkflow={vi.fn()}
        revisionPreview={{
          diff: { before: 'old', after: 'SOLUTION v2' },
          sources: [{ title: 'SOLUTION', shortHash: 'abcd1234' }],
          impactSteps: ['CODE_GUIDE'],
        }}
        onRevisionDraftChange={onDraftChange}
        onPreviewRevision={onPreview}
        onCommitRevision={onCommit}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Cập nhật solution/i }));
    const textarea = screen.getByPlaceholderText('Nhập bản nội dung mới để xem trước và xác nhận.');
    fireEvent.change(textarea, { target: { value: 'SOLUTION v3' } });
    fireEvent.blur(textarea);

    expect(onDraftChange).toHaveBeenLastCalledWith('SOLUTION v3');
    expect(onPreview).toHaveBeenCalledWith('solution', 'SOLUTION v3');
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Xác nhận cập nhật/i }));
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('previews instead of committing when the modal has no preview yet', () => {
    const onPreview = vi.fn();
    const onCommit = vi.fn();
    render(
      <SdlcWorkflowHub
        projectScoped={true}
        state={revisionState}
        onStartWorkflow={vi.fn()}
        revisionDraft="SOLUTION draft"
        onPreviewRevision={onPreview}
        onCommitRevision={onCommit}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Cập nhật solution/i }));
    fireEvent.click(screen.getByRole('button', { name: /Xác nhận cập nhật/i }));

    expect(onPreview).toHaveBeenCalledWith('solution', 'SOLUTION draft');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('commits nothing when the revision modal is dismissed', () => {
    const onCommit = vi.fn();
    render(
      <SdlcWorkflowHub
        projectScoped={true}
        state={revisionState}
        onStartWorkflow={vi.fn()}
        revisionPreview={{
          diff: { before: 'old', after: 'SOLUTION v2' },
          sources: [],
          impactSteps: [],
        }}
        onCommitRevision={onCommit}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Cập nhật solution/i }));
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục thảo luận/i }));

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('hiển thị thông báo khi diff trống', () => {
    render(
      <RevisionImpactModal
        open={true}
        revisionType="solution"
        diff={{ before: 'Nội dung giống hệt', after: 'Nội dung giống hệt' }}
        sources={[]}
        staleStepIds={[]}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Xác nhận cập nhật solution')).toBeInTheDocument();
    expect(
      screen.getByText('Không phát hiện thay đổi nội dung so với bản đang active.')
    ).toBeInTheDocument();
  });
});
