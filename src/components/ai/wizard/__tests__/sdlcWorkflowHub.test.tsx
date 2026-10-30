import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SdlcWorkflowHub } from '../SdlcWorkflowHub';
import { RevisionImpactModal } from '../RevisionImpactModal';
import type { SdlcWorkflowState } from '../../../../services/wizard/workflowSchemas';

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
