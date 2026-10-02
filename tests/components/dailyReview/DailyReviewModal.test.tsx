import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DailyReviewModal } from '../../../src/components/dailyReview/DailyReviewModal';
import { TaskPlannerDatabase } from '../../../src/db';
import 'fake-indexeddb/auto';
import type { Task, PlannedAllocation } from '../../../src/types/models';

describe('DailyReviewModal', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase('test-daily-review-' + Math.random());
    await db.open();
  });

  it('renders modal with summary metrics and date header', async () => {
    const onClose = vi.fn();

    render(
      <DailyReviewModal
        open={true}
        onClose={onClose}
        date="2026-10-02"
        db={db}
      />
    );

    expect(screen.getByText(/Tổng kết ngày/)).toBeInTheDocument();
    expect(screen.getByText('Đã ghi nhận (Actual)')).toBeInTheDocument();
    expect(screen.getByText('Công suất mục tiêu')).toBeInTheDocument();
  });

  it('displays empty state when no incomplete tasks exist', async () => {
    const onClose = vi.fn();

    render(
      <DailyReviewModal
        open={true}
        onClose={onClose}
        date="2026-10-02"
        db={db}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Không còn công việc tồn đọng nào/i)).toBeInTheDocument();
    });
  });

  it('renders incomplete tasks and allows rolling over to tomorrow', async () => {
    const onClose = vi.fn();
    const taskId = 'a0000000-0000-4000-8000-000000000001';
    const allocId = 'b0000000-0000-4000-8000-000000000001';

    // Seed task
    const task: Task = {
      id: taskId,
      name: 'Viết báo cáo tuần',
      status: 'In Progress',
      priority: 'High',
      progress: 30,
      estimateMinutes: 120,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.tasks.add(task);

    // Seed allocation for today
    const alloc: PlannedAllocation = {
      id: allocId,
      taskId,
      date: '2026-10-02',
      allocatedMinutes: 60,
    };
    await db.plannedAllocations.add(alloc);

    render(
      <DailyReviewModal
        open={true}
        onClose={onClose}
        date="2026-10-02"
        db={db}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Viết báo cáo tuần')).toBeInTheDocument();
      expect(screen.getByText('Sang mai')).toBeInTheDocument();
      expect(screen.getByText(/Chuyển tất cả sang ngày mai/)).toBeInTheDocument();
    });

    // Click rollover button for single task
    const rolloverBtn = screen.getByText('Sang mai');
    fireEvent.click(rolloverBtn);

    await waitFor(async () => {
      // Check that an allocation on 2026-10-03 exists
      const tomorrowAllocs = await db.plannedAllocations
        .where('date')
        .equals('2026-10-03')
        .toArray();
      expect(tomorrowAllocs.length).toBe(1);
      expect(tomorrowAllocs[0]?.taskId).toBe(taskId);
      expect(tomorrowAllocs[0]?.allocatedMinutes).toBe(60);
    });
  });

  it('closes modal when close button is clicked', async () => {
    const onClose = vi.fn();

    render(
      <DailyReviewModal
        open={true}
        onClose={onClose}
        date="2026-10-02"
        db={db}
      />
    );

    const closeBtn = screen.getByText('Hoàn thành đánh giá');
    fireEvent.click(closeBtn);

    expect(onClose).toHaveBeenCalled();
  });
});
