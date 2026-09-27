import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { DashboardView } from '../../src/views/DashboardView';
import { TaskPlannerDatabase } from '../../src/db/index';
import { initializeDatabaseDefaults } from '../../src/db/seeds';
import { createTask } from '../../src/db/repositories/taskRepo';
import { upsertAllocation } from '../../src/db/repositories/allocationRepo';
import { getTodayDateString } from '../../src/utils/date';
import dayjs from 'dayjs';

describe('DashboardView Integration (DASH-01..DASH-06)', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestDashboardView_' + Math.random().toString(36).slice(2));
    await testDb.open();
    await initializeDatabaseDefaults(testDb);
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('renders top tier (TodaySummaryCard, AttentionTodayList) and bottom tier (WorkloadForecast)', async () => {
    const today = getTodayDateString();

    // Create an overdue task and a due today task
    const yesterday = dayjs(today, 'YYYY-MM-DD').subtract(1, 'day').format('YYYY-MM-DD');
    await createTask(
      {
        name: 'Urgent Overdue Bug',
        status: 'Open',
        priority: 'Urgent',
        estimateMinutes: 60,
        progress: 0,
        deadline: yesterday,
      },
      testDb
    );

    await createTask(
      {
        name: 'Task Due Today',
        status: 'In Progress',
        priority: 'High',
        estimateMinutes: 120,
        progress: 20,
        deadline: today,
      },
      testDb
    );

    render(<DashboardView db={testDb} />);

    // Top tier
    expect(await screen.findByTestId('today-summary-card')).toBeInTheDocument();
    expect(screen.getByTestId('attention-today-card')).toBeInTheDocument();

    // Bottom tier
    expect(screen.getByTestId('forecast-grid')).toBeInTheDocument();

    // Verify tasks show up in attention list
    expect(await screen.findByText('Urgent Overdue Bug')).toBeInTheDocument();
    expect(screen.getByText('Task Due Today')).toBeInTheDocument();
    expect(screen.getByText(/Quá hạn 1 ngày/)).toBeInTheDocument();
    expect(screen.getByText('Đến hạn hôm nay')).toBeInTheDocument();
  });

  it('clicking attention task title opens TaskDrawer in-place without page transition', async () => {
    const today = getTodayDateString();
    await createTask(
      {
        name: 'Inspectable Task Item',
        status: 'Open',
        priority: 'Medium',
        estimateMinutes: 90,
        progress: 0,
        deadline: today,
      },
      testDb
    );

    render(<DashboardView db={testDb} />);

    const taskTitle = await screen.findByText('Inspectable Task Item');
    fireEvent.click(taskTitle);

    // TaskDrawer opens
    expect(await screen.findByText('Chỉnh sửa tác vụ')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('Inspectable Task Item')).toBeInTheDocument();
  });

  it('clicking forecast day card or overload chip navigates to PlannerView focused on target date', async () => {
    const today = getTodayDateString();
    const tomorrow = dayjs(today, 'YYYY-MM-DD').add(1, 'day').format('YYYY-MM-DD');

    // Create an overloaded day on tomorrow by allocating 600m when capacity is 480m (or if tomorrow is weekend, capacity is 0)
    const task = await createTask(
      {
        name: 'Heavy Task',
        status: 'Open',
        priority: 'High',
        estimateMinutes: 600,
        progress: 0,
      },
      testDb
    );
    await upsertAllocation(task.id, tomorrow, 600, testDb);

    const onNavigate = vi.fn();
    render(<DashboardView db={testDb} onNavigate={onNavigate} />);

    // Find mini day card for tomorrow and click it
    const miniCard = await screen.findByTestId(`mini-day-card-${tomorrow}`);
    fireEvent.click(miniCard);

    expect(onNavigate).toHaveBeenCalledWith('planner', { date: tomorrow });

    // Also test overload chip if rendered
    const overloadChip = screen.queryByTestId(`overload-chip-${tomorrow}`);
    if (overloadChip) {
      fireEvent.click(overloadChip);
      expect(onNavigate).toHaveBeenLastCalledWith('planner', { date: tomorrow });
    }
  });

  it('TodaySummaryCard CTA button navigates to PlannerView for today', async () => {
    const today = getTodayDateString();
    const onNavigate = vi.fn();
    render(<DashboardView db={testDb} onNavigate={onNavigate} />);

    const todayBtn = await screen.findByTestId('open-today-planner-btn');
    fireEvent.click(todayBtn);

    expect(onNavigate).toHaveBeenCalledWith('planner', { date: today });
  });
});
