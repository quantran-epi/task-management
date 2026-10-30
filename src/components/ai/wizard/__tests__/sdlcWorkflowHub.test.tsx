import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SdlcWorkflowHub } from '../SdlcWorkflowHub';
import type { SdlcWorkflowState } from '../../../../services/wizard/workflowSchemas';

describe('SdlcWorkflowHub', () => {
  const dummyState: SdlcWorkflowState = {
    schemaVersion: 1,
    sessionId: '11111111-1111-4111-8111-111111111111',
    projectId: '22222222-2222-4222-8222-222222222222',
    threadId: '33333333-3333-4333-8333-333333333333',
    currentStep: 'SOLUTION',
    metadata: {
      cr: 'CR-TEST-99',
      featureName: 'Core Banking Payment',
      author: 'DevLead',
      requestingUnit: 'Digital Banking',
      date: '2026-10-30',
    },
    artifacts: {},
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
    const startButton = screen.getByText(/Khởi tạo SDLC Workflow/i);
    expect(startButton).toBeInTheDocument();

    fireEvent.click(startButton);
    expect(handleStart).toHaveBeenCalled();
  });

  it('hiển thị đúng 6 bước SDLC và CR code khi đã có state', () => {
    render(<SdlcWorkflowHub projectScoped={true} state={dummyState} onStartWorkflow={vi.fn()} />);

    expect(screen.getByText(/CR-TEST-99/i)).toBeInTheDocument();
    expect(screen.getByText(/Core Banking Payment/i)).toBeInTheDocument();

    // 6 bước
    expect(screen.getByText(/Hồ sơ Đầu vào/i)).toBeInTheDocument();
    expect(screen.getByText(/Giải pháp SOLUTION.md/i)).toBeInTheDocument();
    expect(screen.getByText(/Triển khai Code/i)).toBeInTheDocument();
    expect(screen.getByText(/Change Pack & Drift/i)).toBeInTheDocument();
    expect(screen.getByText(/Kỹ thuật PL03B \/ PL07/i)).toBeInTheDocument();
    expect(screen.getByText(/Tờ trình CAB/i)).toBeInTheDocument();
  });

  it('hiển thị cảnh báo stale khi có bước bị cũ', () => {
    const staleState: SdlcWorkflowState = {
      ...dummyState,
      staleSteps: ['SOLUTION', 'TECH_DOCS'],
    };

    render(<SdlcWorkflowHub projectScoped={true} state={staleState} onStartWorkflow={vi.fn()} />);
    expect(screen.getByText(/Có 2 bước cần cập nhật lại/i)).toBeInTheDocument();
  });
});
