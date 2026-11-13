import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AssignmentPlanCard } from '../../../src/components/ai/office/AssignmentPlanCard';

const plan = {
  batchIndex: 1,
  assignments: [
    { agentId: 'agent-1', agentName: 'An', skillName: 'Kiểm thử', task: 'Viết test cho luồng đăng nhập' },
    { agentId: 'agent-2', agentName: 'Bình', task: 'Rà soát migration' },
  ],
};

describe('AssignmentPlanCard', () => {
  it('renders the card, one row per assignment and both decision buttons', () => {
    render(<AssignmentPlanCard plan={plan} decision={undefined} onApprove={vi.fn()} onReject={vi.fn()} />);

    const card = screen.getByTestId('assignment-plan-card');
    expect(card).toBeInTheDocument();
    expect(card.textContent).toContain('Kế hoạch phân việc');
    expect(card.textContent).toContain('Lô 1');
    expect(card.textContent).toContain('An');
    expect(card.textContent).toContain('Kiểm thử');
    expect(card.textContent).toContain('Viết test cho luồng đăng nhập');
    expect(card.textContent).toContain('Bình');
    expect(screen.getByTestId('assignment-plan-approve')).toBeInTheDocument();
    expect(screen.getByTestId('assignment-plan-reject')).toBeInTheDocument();
  });

  it('is not warning-colored and carries a primary left border', () => {
    render(<AssignmentPlanCard plan={plan} decision={undefined} onApprove={vi.fn()} onReject={vi.fn()} />);
    const card = screen.getByTestId('assignment-plan-card');
    expect(card.style.borderLeft).toContain('3px');
    expect(card.style.backgroundColor).not.toMatch(/warning/i);
  });

  it('calls onApprove and onReject', () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    render(<AssignmentPlanCard plan={plan} decision={undefined} onApprove={onApprove} onReject={onReject} />);
    fireEvent.click(screen.getByTestId('assignment-plan-approve'));
    fireEvent.click(screen.getByTestId('assignment-plan-reject'));
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('replaces the buttons with a role=status line after approval', () => {
    render(<AssignmentPlanCard plan={plan} decision="approved" onApprove={vi.fn()} onReject={vi.fn()} />);
    expect(screen.queryByTestId('assignment-plan-approve')).toBeNull();
    expect(screen.queryByTestId('assignment-plan-reject')).toBeNull();
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Đã chấp thuận — lô việc đang chạy.');
  });

  it('replaces the buttons with a rejection status line', () => {
    render(<AssignmentPlanCard plan={plan} decision="rejected" onApprove={vi.fn()} onReject={vi.fn()} />);
    expect(screen.queryByTestId('assignment-plan-approve')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain(
      'Đã từ chối — không nhân viên nào được giao việc.'
    );
  });
});
