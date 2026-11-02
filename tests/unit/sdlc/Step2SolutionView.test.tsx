import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../../src/db';
import { Step2SolutionView } from '../../../src/components/sdlc/steps/Step2SolutionView';

describe('Step2SolutionView intake-baseline gate (D-20)', () => {
  let db: TaskPlannerDatabase;
  const projectId = 'b45c2f09-1a89-4c07-b24e-4f056d68b981';

  const renderView = (props: Partial<React.ComponentProps<typeof Step2SolutionView>> = {}) =>
    render(
      <Step2SolutionView
        projectId={projectId}
        initialContent="# SOLUTION draft"
        onCommitSolution={vi.fn().mockResolvedValue(undefined)}
        db={db}
        {...props}
      />
    );

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`test-step2-${Math.random()}`);
    await db.projects.add({
      id: projectId,
      name: 'Hệ thống Loyalty',
      status: 'In Progress',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  it('disables approval and names both missing artifacts when no baseline exists', () => {
    const handleNavigate = vi.fn();
    renderView({ onNavigateToStep: handleNavigate });

    expect(screen.getByRole('button', { name: /Duyệt & Lưu SOLUTION\.md/i })).toBeDisabled();
    expect(
      screen.getByText(/Chưa đủ điều kiện: Thiếu PL01 — Yêu cầu nghiệp vụ từ Bước 1/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/PL02 — Đặc tả chức năng/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Chuyển đến Bước 1: Hồ sơ đầu vào' }));
    expect(handleNavigate).toHaveBeenCalledWith('INTAKE');
  });

  it('keeps read-only AI analysis reachable without the baseline', () => {
    const handleAnalysis = vi.fn();
    renderView({ onRequestAiAnalysis: handleAnalysis });

    fireEvent.click(screen.getByRole('button', { name: /Phân tích lại bằng AI/i }));
    expect(handleAnalysis).toHaveBeenCalledTimes(1);
  });

  it('enables approval once both PL01 and PL02 content are supplied', () => {
    renderView({ pl01Content: 'PL01 text', pl02Content: 'PL02 text' });

    expect(screen.getByRole('button', { name: /Duyệt & Lưu SOLUTION\.md/i })).toBeEnabled();
    expect(screen.queryByText(/Chưa đủ điều kiện/i)).toBeNull();
  });

  it('syncs approval badge and continue banner when approvedAt changes in both directions', () => {
    const onProceedToStep3 = vi.fn();
    const solutionArtifact = {
      kind: 'SOLUTION' as const,
      version: 1,
      hash: 'a'.repeat(64),
      title: 'SOLUTION.md',
      content: '# SOLUTION draft',
      sourceHashes: [],
      updatedAt: '2026-11-02T00:00:00.000Z',
    };
    const props = {
      projectId,
      db,
      hasIntakeBaseline: true,
      onCommitSolution: vi.fn().mockResolvedValue(undefined),
      onProceedToStep3,
    };
    const { rerender } = renderView({ ...props, solutionArtifact });
    expect(screen.queryByText('Đã phê duyệt')).not.toBeInTheDocument();
    expect(screen.queryByText(/Giải pháp đã được phê duyệt/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tiếp tục sang Bước 3/i })).not.toBeInTheDocument();

    rerender(<Step2SolutionView {...props} solutionArtifact={{ ...solutionArtifact, approvedAt: '2026-11-02T01:00:00.000Z' }} />);
    expect(screen.getByText('Đã phê duyệt')).toBeInTheDocument();
    expect(screen.getByText(/Giải pháp đã được phê duyệt/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục sang Bước 3/i }));
    expect(onProceedToStep3).toHaveBeenCalledTimes(1);

    rerender(<Step2SolutionView {...props} solutionArtifact={solutionArtifact} />);
    expect(screen.queryByText('Đã phê duyệt')).not.toBeInTheDocument();
    expect(screen.queryByText(/Giải pháp đã được phê duyệt/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tiếp tục sang Bước 3/i })).not.toBeInTheDocument();
  });

  it('treats hasIntakeBaseline as authoritative over the text fallback', () => {
    renderView({ hasIntakeBaseline: true });

    expect(screen.getByRole('button', { name: /Duyệt & Lưu SOLUTION\.md/i })).toBeEnabled();
    expect(screen.queryByText(/Chưa đủ điều kiện/i)).toBeNull();
  });
});
