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

  it('treats hasIntakeBaseline as authoritative over the text fallback', () => {
    renderView({ hasIntakeBaseline: true });

    expect(screen.getByRole('button', { name: /Duyệt & Lưu SOLUTION\.md/i })).toBeEnabled();
    expect(screen.queryByText(/Chưa đủ điều kiện/i)).toBeNull();
  });
});
