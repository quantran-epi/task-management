import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InlineStatusTag } from '../../../src/components/tasks/InlineStatusTag';

describe('InlineStatusTag', () => {
  it('renders pastel status tag with correct label and border style', () => {
    const { container } = render(
      <InlineStatusTag taskId="task-1" status="In Progress" />
    );

    const tag = container.querySelector('.ant-tag');
    expect(tag).toBeInTheDocument();
    expect(screen.getByText('Đang làm')).toBeInTheDocument();
    expect(tag).toHaveStyle({
      backgroundColor: 'rgb(238, 242, 255)',
      color: 'rgb(67, 56, 202)',
    });
  });

  it('renders cancelled status with line-through', () => {
    const { container } = render(
      <InlineStatusTag taskId="task-2" status="Cancelled" />
    );

    const tag = container.querySelector('.ant-tag');
    expect(tag).toBeInTheDocument();
    expect(screen.getByText('Đã hủy')).toBeInTheDocument();
    expect(tag?.getAttribute('style')).toContain('line-through');
  });

  it('triggers onStatusChange when selecting a new status', async () => {
    const onStatusChange = vi.fn();
    render(
      <InlineStatusTag
        taskId="task-3"
        status="Open"
        onStatusChange={onStatusChange}
      />
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    const doneOption = await screen.findByText('Hoàn thành');
    expect(doneOption).toBeInTheDocument();
  });
});
