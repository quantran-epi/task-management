import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import dayjs from 'dayjs';
import { TaskPlannerDatabase } from '../../src/db/index';
import { createTask } from '../../src/db/repositories/taskRepo';
import { createProject } from '../../src/db/repositories/projectRepo';
import { upsertAllocation } from '../../src/db/repositories/allocationRepo';
import { updateCapacityRule } from '../../src/db/repositories/capacityRepo';
import { FeasibilityModal } from '../../src/components/planner/FeasibilityModal';

describe('FeasibilityModal Component (CALC-03, CALC-04, CALC-05, CALC-06, D-08, D-10, D-12, D-14, D-15, D-16, T-04-03)', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestFeasibilityModal_' + Math.random().toString(36).slice(2));
    await testDb.open();

    // Default working week Mon-Fri 8h (480m)
    for (let day = 1; day <= 5; day++) {
      await updateCapacityRule(day, 480, testDb);
    }
    await updateCapacityRule(6, 0, testDb);
    await updateCapacityRule(0, 0, testDb);
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('renders modal when open with parameters, result alert, and candidate table', async () => {
    const deadline = dayjs().add(3, 'day').format('YYYY-MM-DD');
    const task = await createTask(
      { name: 'Analyze Architecture', estimateMinutes: 240, status: 'In Progress', deadline },
      testDb
    );

    render(
      <FeasibilityModal
        open={true}
        task={task}
        onCancel={vi.fn()}
        db={testDb}
      />
    );

    expect(await screen.findByText(/Đánh giá tính khả thi & Phân bổ khối lượng công việc/i)).toBeInTheDocument();
    expect(screen.getByText('Khoảng thời gian đánh giá')).toBeInTheDocument();
    expect(screen.getByText('Chiến lược phân bổ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Áp dụng phân bổ/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hủy bỏ/i })).toBeInTheDocument();
  });

  it('CALC-03: renders green Alert when task fits within range with surplus capacity', async () => {
    const deadline = dayjs().add(5, 'day').format('YYYY-MM-DD');
    const task = await createTask(
      { name: 'Feasible Task', estimateMinutes: 120, status: 'Open', deadline },
      testDb
    );

    render(
      <FeasibilityModal
        open={true}
        task={task}
        onCancel={vi.fn()}
        db={testDb}
      />
    );

    // Green alert with surplus text
    const banner = await screen.findByTestId('feasibility-alert');
    await waitFor(() => {
      expect(banner).toHaveTextContent(/Khả thi: Công việc vừa với khoảng thời gian/i);
    });
    expect(banner).toHaveTextContent(/Dư công suất/i);
  });

  it('CALC-03 / D-12: renders warning Alert when task is infeasible and allows extending to earliest feasible date', async () => {
    // 1-day range with 480m capacity, but task estimate is 1200m -> infeasible deficit
    const deadline = dayjs().format('YYYY-MM-DD');
    const task = await createTask(
      { name: 'Overloaded Task', estimateMinutes: 1200, status: 'Open', deadline },
      testDb
    );

    render(
      <FeasibilityModal
        open={true}
        task={task}
        onCancel={vi.fn()}
        db={testDb}
      />
    );

    const banner = await screen.findByTestId('feasibility-alert');
    await waitFor(() => {
      expect(banner).toHaveTextContent(/Không khả thi: Thiếu hụt/i);
    });
    expect(banner).toHaveTextContent(/Ngày hoàn thành khả thi sớm nhất là/i);

    // Extend button exists
    const extendBtn = screen.getByRole('button', { name: /Gia hạn đến/i });
    expect(extendBtn).toBeInTheDocument();

    // Clicking extend updates range end date
    fireEvent.click(extendBtn);

    // After extending, banner becomes feasible
    await waitFor(() => {
      const updatedBanner = screen.getByTestId('feasibility-alert');
      expect(updatedBanner).toHaveTextContent(/Khả thi: Công việc vừa với khoảng thời gian/i);
    });
  });

  it('CALC-06 / T-04-03: candidate minutes edits and toggling checkboxes do NOT mutate IndexedDB until Apply is clicked', async () => {
    const deadline = dayjs().add(3, 'day').format('YYYY-MM-DD');
    const task = await createTask(
      { name: 'Draft Proposal', estimateMinutes: 180, status: 'Open', deadline },
      testDb
    );

    const onCancel = vi.fn();
    const onSuccess = vi.fn();

    render(
      <FeasibilityModal
        open={true}
        task={task}
        onCancel={onCancel}
        onSuccess={onSuccess}
        db={testDb}
      />
    );

    await screen.findByTestId('feasibility-alert');

    // Verify candidate rows exist
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBeGreaterThan(0);

    // Toggle first checkbox off
    fireEvent.click(checkboxes[0]!);

    // Check DB: plannedAllocations MUST be empty!
    const inDbBefore = await testDb.plannedAllocations.where('taskId').equals(task.id).toArray();
    expect(inDbBefore.length).toBe(0);

    // Click Discard Allocations
    const discardBtn = screen.getByRole('button', { name: /Hủy bỏ/i });
    fireEvent.click(discardBtn);

    expect(onCancel).toHaveBeenCalledTimes(1);

    // Still empty in DB
    const inDbAfterDiscard = await testDb.plannedAllocations.where('taskId').equals(task.id).toArray();
    expect(inDbAfterDiscard.length).toBe(0);
  });

  it('CALC-06 / D-08 / D-16: clicking Apply Allocations atomically writes merged allocations to IndexedDB', async () => {
    const today = dayjs().format('YYYY-MM-DD');
    const deadline = dayjs().add(2, 'day').format('YYYY-MM-DD');
    const task = await createTask(
      { name: 'Deploy Pipeline', estimateMinutes: 120, status: 'In Progress', deadline },
      testDb
    );

    // Seed existing allocation of 30m on today
    await upsertAllocation(task.id, today, 30, testDb);

    const onSuccess = vi.fn();
    const onCancel = vi.fn();

    render(
      <FeasibilityModal
        open={true}
        task={task}
        onCancel={onCancel}
        onSuccess={onSuccess}
        db={testDb}
      />
    );

    await screen.findByTestId('feasibility-alert');

    const applyBtn = screen.getByRole('button', { name: /Áp dụng phân bổ/i });
    fireEvent.click(applyBtn);

    await waitFor(async () => {
      const records = await testDb.plannedAllocations.where('taskId').equals(task.id).toArray();
      expect(records.length).toBeGreaterThan(0);
      const totalMinutes = records.reduce((s, r) => s + r.allocatedMinutes, 0);
      // Remainder was 90m (120m estimate - 30m existing). Total should be 120m!
      expect(totalMinutes).toBe(120);
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });

  it('automatically updates task deadline to new extended date when saving allocations', async () => {
    const today = dayjs().format('YYYY-MM-DD');
    const task = await createTask(
      { name: 'Big Task', estimateMinutes: 1200, status: 'Open', deadline: today },
      testDb
    );

    render(
      <FeasibilityModal
        open={true}
        task={task}
        onCancel={vi.fn()}
        db={testDb}
      />
    );

    // Infeasible banner
    await waitFor(() => {
      expect(screen.getByTestId('feasibility-alert')).toHaveTextContent(/Không khả thi/i);
    });

    // Click Extend to earliest feasible date
    const extendBtn = screen.getByRole('button', { name: /Gia hạn đến/i });
    fireEvent.click(extendBtn);

    // Apply allocations
    const applyBtn = screen.getByRole('button', { name: /Áp dụng phân bổ/i });
    fireEvent.click(applyBtn);

    await waitFor(async () => {
      const updated = await testDb.tasks.get(task.id);
      expect(updated?.deadline).not.toBe(today);
      expect(dayjs(updated?.deadline).isAfter(today)).toBe(true);
    });
  });

  it('renders task name and project badge in task context header', async () => {
    const proj = await createProject({ name: 'Alpha Core', status: 'Open' }, testDb);
    const task = await createTask(
      { name: 'Core Engine Task', estimateMinutes: 120, status: 'Open', projectId: proj.id },
      testDb
    );

    render(
      <FeasibilityModal
        open={true}
        task={task}
        onCancel={vi.fn()}
        db={testDb}
      />
    );

    const contextHeader = await screen.findByTestId('feasibility-task-context');
    expect(contextHeader).toBeInTheDocument();
    expect(contextHeader).toHaveTextContent('Core Engine Task');
    expect(await screen.findByText('Alpha Core')).toBeInTheDocument();
  });
});
