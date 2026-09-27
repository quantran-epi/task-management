import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../src/db/index';
import { initializeDatabaseDefaults } from '../../src/db/seeds';
import { createTask } from '../../src/db/repositories/taskRepo';
import { TaskDrawerPlanning } from '../../src/components/tasks/TaskDrawerPlanning';
import { PlannerView } from '../../src/views/PlannerView';
import { TasksView } from '../../src/views/TasksView';

describe('Feasibility Integration (CALC-01, CALC-06, D-13, D-16)', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestFeasibilityIntegration_' + Math.random().toString(36).slice(2));
    await testDb.open();
    await initializeDatabaseDefaults(testDb);
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('D-13 & D-16: launches FeasibilityModal from TaskDrawerPlanning, applies allocations, and updates database reactively', async () => {
    const task = await createTask(
      {
        name: 'Feasibility Integration Task',
        estimateMinutes: 240, // 4 hours
        status: 'Open',
        deadline: '2026-10-05',
      },
      testDb
    );

    render(<TaskDrawerPlanning task={task} db={testDb} />);

    // 1. Verify "✨ Auto-Distribute" button exists
    const triggerBtn = screen.getByRole('button', { name: /Đánh giá khả thi & Tự động phân bổ/i });
    expect(triggerBtn).toBeInTheDocument();
    expect(triggerBtn).not.toBeDisabled();

    // 2. Click button to open FeasibilityModal
    fireEvent.click(triggerBtn);

    expect(await screen.findByText('Đánh giá tính khả thi & Phân bổ khối lượng công việc')).toBeInTheDocument();
    await screen.findByTestId('feasibility-alert');
    const applyBtn = await screen.findByRole('button', { name: 'Áp dụng phân bổ' });

    // 3. Click Apply Allocations
    fireEvent.click(applyBtn);

    // 4. Verify modal closes and allocations committed to database
    await waitFor(async () => {
      const dbAllocs = await testDb.plannedAllocations.where('taskId').equals(task.id).toArray();
      expect(dbAllocs.length).toBeGreaterThan(0);
      const totalMins = dbAllocs.reduce((sum, a) => sum + a.allocatedMinutes, 0);
      expect(totalMins).toBe(240);
    });

    // 5. Verify reactive progress update in TaskDrawerPlanning
    await waitFor(() => {
      expect(screen.getByTestId('planning-metrics-total')).toHaveTextContent('Đã phân bổ: 4h / Ước tính: 4h');
      expect(screen.getByTestId('planning-metrics-balance')).toHaveTextContent('Còn lại cần phân bổ: 0m');
    });
  });

  it('D-13 & D-16: launches FeasibilityModal from PlannerView toolbar and updates weekly grid board reactively', async () => {
    await createTask(
      {
        name: 'Planner Grid Feasibility Task',
        estimateMinutes: 120, // 2 hours
        status: 'Open',
        deadline: '2026-10-02',
      },
      testDb
    );

    // Week: 2026-09-28 (Mon) to 2026-10-04 (Sun)
    render(<PlannerView db={testDb} initialDate="2026-09-30" />);

    // 1. Verify toolbar action exists
    const autoDistributeBtn = await screen.findByRole('button', { name: /Tự động phân bổ/i });
    expect(autoDistributeBtn).toBeInTheDocument();

    // 2. Click Auto-Distribute
    fireEvent.click(autoDistributeBtn);

    // 3. Feasibility modal opens
    expect(await screen.findByText('Đánh giá tính khả thi & Phân bổ khối lượng công việc')).toBeInTheDocument();
    await screen.findByTestId('feasibility-alert');
    const applyBtn = await screen.findByRole('button', { name: 'Áp dụng phân bổ' });

    // 4. Apply allocations
    fireEvent.click(applyBtn);

    // 5. Verify card appears on planner board
    await waitFor(() => {
      const cards = screen.getAllByText('Planner Grid Feasibility Task');
      expect(cards.length).toBeGreaterThan(0);
    });
  });

  it('D-13: provides Auto-Distribute quick action in TasksView', async () => {
    await createTask(
      {
        name: 'Tasks View Feasibility Task',
        estimateMinutes: 180,
        status: 'Open',
      },
      testDb
    );

    render(<TasksView db={testDb} />);

    // Verify Auto-Distribute button exists in TasksView
    const autoDistributeBtn = await screen.findByRole('button', { name: /Tự động phân bổ/i });
    expect(autoDistributeBtn).toBeInTheDocument();
  });
});
