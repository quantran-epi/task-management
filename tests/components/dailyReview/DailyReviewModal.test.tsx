import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DailyReviewModal } from '../../../src/components/dailyReview/DailyReviewModal';
import { TaskPlannerDatabase } from '../../../src/db';
import 'fake-indexeddb/auto';
import type { Task, PlannedAllocation } from '../../../src/types/models';
import * as nineRouterClient from '../../../src/services/ai/nineRouterClient';
import * as nineRouterTokenService from '../../../src/services/ai/nineRouterTokenService';

describe('DailyReviewModal', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase('test-daily-review-' + Math.random());
    await db.open();
    vi.restoreAllMocks();
  });

  it('renders modal with summary metrics and date header for briefing by default', async () => {
    const onClose = vi.fn();

    render(
      <DailyReviewModal
        open={true}
        onClose={onClose}
        date="2026-10-02"
        db={db}
      />
    );

    expect(screen.getByText(/Khởi động ngày \(Briefing\)/)).toBeInTheDocument();
    expect(screen.getByText('Kế hoạch (Planned)')).toBeInTheDocument();
    expect(screen.getByText('Công suất ngày')).toBeInTheDocument();
  });

  it('renders debriefing view when initialTab is debriefing', async () => {
    const onClose = vi.fn();

    render(
      <DailyReviewModal
        open={true}
        onClose={onClose}
        date="2026-10-02"
        initialTab="debriefing"
        db={db}
      />
    );

    expect(screen.getByText(/Tổng kết ngày \(Debriefing\)/)).toBeInTheDocument();
    expect(screen.getByText('Đã ghi nhận (Actual)')).toBeInTheDocument();
    expect(screen.getByText('Công suất mục tiêu')).toBeInTheDocument();
  });

  it('allows switching between Briefing and Debriefing tabs', async () => {
    const onClose = vi.fn();

    render(
      <DailyReviewModal
        open={true}
        onClose={onClose}
        date="2026-10-02"
        db={db}
      />
    );

    // Initial is Briefing
    expect(screen.getByText('Kế hoạch (Planned)')).toBeInTheDocument();

    // Click Debriefing tab
    const debriefingTab = screen.getByText('Debriefing (Tổng kết)');
    fireEvent.click(debriefingTab);

    await waitFor(() => {
      expect(screen.getByText('Đã ghi nhận (Actual)')).toBeInTheDocument();
      expect(screen.getByText('Công suất mục tiêu')).toBeInTheDocument();
    });
  });

  it('displays empty state in Debriefing when no incomplete tasks exist', async () => {
    const onClose = vi.fn();

    render(
      <DailyReviewModal
        open={true}
        onClose={onClose}
        date="2026-10-02"
        initialTab="debriefing"
        db={db}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Không còn công việc tồn đọng nào/i)).toBeInTheDocument();
    });
  });

  it('renders incomplete tasks in Debriefing and allows rolling over to tomorrow', async () => {
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
        initialTab="debriefing"
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

  it('shows graceful warning message when AI key is missing on AI button click', async () => {
    const onClose = vi.fn();
    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('');

    render(
      <DailyReviewModal
        open={true}
        onClose={onClose}
        date="2026-10-02"
        db={db}
      />
    );

    const aiBtn = screen.getByText('Nhận diện & Gợi ý AI');
    fireEvent.click(aiBtn);

    await waitFor(() => {
      expect(screen.getByText(/Chưa cấu hình API Key cho Trợ lý AI/)).toBeInTheDocument();
    });
  });

  it('streams AI insight when AI key is present and button is clicked', async () => {
    const onClose = vi.fn();
    vi.spyOn(nineRouterTokenService, 'getNineRouterApiKey').mockResolvedValue('test-key');
    vi.spyOn(nineRouterTokenService, 'getNineRouterConfig').mockResolvedValue({
      endpoint: 'http://localhost:20128',
      defaultModel: 'gpt-4o',
      charLimit: 12000,
    });

    async function* mockStream() {
      yield 'Tập trung hoàn thành ';
      yield 'task ưu tiên cao trước.';
    }

    vi.spyOn(nineRouterClient, 'streamChatCompletion').mockImplementation(() => mockStream() as any);

    render(
      <DailyReviewModal
        open={true}
        onClose={onClose}
        date="2026-10-02"
        db={db}
      />
    );

    const aiBtn = screen.getByText('Nhận diện & Gợi ý AI');
    fireEvent.click(aiBtn);

    await waitFor(() => {
      expect(screen.getByText(/Tập trung hoàn thành task ưu tiên cao trước./)).toBeInTheDocument();
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
