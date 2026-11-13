import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AssignmentPlanCard } from '../../../../src/components/ai/office/AssignmentPlanCard';

const plan = {
  batchIndex: 1,
  assignments: [{ agentId: 'agent-a', agentName: 'Agent A', task: 'Kiểm tra yêu cầu' }],
};

describe('AssignmentPlanCard collapse', () => {
  it('collapses details without hiding approval actions and reopens for new plan', () => {
    const onApprove = vi.fn();
    const props = { plan, decision: undefined, onApprove, onReject: vi.fn() };
    const { rerender } = render(<AssignmentPlanCard {...props} />);
    const task = screen.getByText('Kiểm tra yêu cầu');
    expect(task).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Thu gọn kế hoạch' }));
    expect(task).not.toBeVisible();
    expect(screen.getByRole('button', { name: 'Mở rộng kế hoạch' })).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByTestId('assignment-plan-approve'));
    expect(onApprove).toHaveBeenCalledOnce();
    rerender(<AssignmentPlanCard {...props} decision="approved" />);
    expect(task).not.toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Mở rộng kế hoạch' }));
    expect(task).toBeVisible();
    rerender(<AssignmentPlanCard {...props} plan={{ ...plan, batchIndex: 2 }} />);
    expect(task).toBeVisible();
    expect(screen.getByTestId('assignment-plan-approve')).toBeVisible();
  });
});
