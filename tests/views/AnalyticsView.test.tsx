import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { AnalyticsView } from '../../src/views/AnalyticsView';
import { TaskPlannerDatabase } from '../../src/db/index';
import { createTask } from '../../src/db/repositories/taskRepo';
import { createWorkSession } from '../../src/db/repositories/workSessionRepo';

// Mock @ant-design/plots for jsdom environment
vi.mock('@ant-design/plots', () => ({
  Column: (props: { data?: unknown[] }) => (
    <div data-testid="mock-column-chart">Items: {props.data?.length ?? 0}</div>
  ),
  Pie: (props: { data?: unknown[] }) => (
    <div data-testid="mock-pie-chart">Items: {props.data?.length ?? 0}</div>
  ),
  Heatmap: (props: { data?: unknown[] }) => (
    <div data-testid="mock-heatmap-chart">Items: {props.data?.length ?? 0}</div>
  ),
}));

describe('AnalyticsView', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestAnalyticsView_' + Math.random().toString(36).slice(2));
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('renders analytics view with stats and charts', async () => {
    // Seed sample task and work session
    const task = await createTask(
      {
        name: 'Task mẫu phân tích',
        status: 'In Progress',
        priority: 'High',
        progress: 30,
        estimateMinutes: 120,
        workType: 'code',
      },
      testDb
    );

    await createWorkSession(
      {
        taskId: task.id,
        durationMinutes: 60,
        startTime: '2026-10-02T10:00:00.000Z',
        endTime: '2026-10-02T11:00:00.000Z',
      },
      testDb
    );

    render(<AnalyticsView db={testDb} />);

    // Wait for liveQuery to resolve
    const mainTitle = await screen.findByText('Thống kê hiệu suất & Thời gian làm việc');
    expect(mainTitle).toBeInTheDocument();

    // Check chart titles
    expect(screen.getByText('Ước tính vs Thực tế (giờ)')).toBeInTheDocument();
    expect(screen.getByText('Phân bố theo Loại công việc')).toBeInTheDocument();
    expect(
      screen.getByText('Bản đồ nhiệt năng suất (Thứ trong tuần × Khung giờ)')
    ).toBeInTheDocument();

    // Check period options
    expect(screen.getByText('7 ngày qua')).toBeInTheDocument();
    expect(screen.getByText('14 ngày qua')).toBeInTheDocument();
    expect(screen.getByText('30 ngày qua')).toBeInTheDocument();
    expect(screen.getByText('Tất cả')).toBeInTheDocument();

    // Verify mock charts rendered
    expect(screen.getByTestId('mock-column-chart')).toBeInTheDocument();
    expect(screen.getByTestId('mock-pie-chart')).toBeInTheDocument();
    expect(screen.getByTestId('mock-heatmap-chart')).toBeInTheDocument();

    // Switch period to "Tất cả"
    fireEvent.click(screen.getByText('Tất cả'));
  });
});
