import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { PlannerView } from '../../src/views/PlannerView';
import { App } from '../../src/App';
import { TaskPlannerDatabase } from '../../src/db/index';
import { initializeDatabaseDefaults } from '../../src/db/seeds';
import { createTask } from '../../src/db/repositories/taskRepo';
import { updateCapacityRule } from '../../src/db/repositories/capacityRepo';

describe('PlannerView & App Route Integration (PLAN-03, PLAN-04, UX-02, UX-03, UX-04, UX-05)', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestPlannerView_' + Math.random().toString(36).slice(2));
    await testDb.open();
    await initializeDatabaseDefaults(testDb);
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('renders 7 day columns (Monday through Sunday) with default capacity metrics (8h M-F, 0h Sa-Su)', async () => {
    // Fixed reference date: Wednesday 2026-09-30 (week: 2026-09-28 to 2026-10-04)
    render(<PlannerView db={testDb} initialDate="2026-09-30" />);

    expect(await screen.findByTestId('planner-view')).toBeInTheDocument();
    expect(screen.getByTestId('week-navigator')).toBeInTheDocument();

    // Verify 7 day columns exist
    const mon = await screen.findByTestId('day-column-2026-09-28');
    const tue = screen.getByTestId('day-column-2026-09-29');
    const wed = screen.getByTestId('day-column-2026-09-30');
    const thu = screen.getByTestId('day-column-2026-10-01');
    const fri = screen.getByTestId('day-column-2026-10-02');
    const sat = screen.getByTestId('day-column-2026-10-03');
    const sun = screen.getByTestId('day-column-2026-10-04');

    expect(mon).toBeInTheDocument();
    expect(tue).toBeInTheDocument();
    expect(wed).toBeInTheDocument();
    expect(thu).toBeInTheDocument();
    expect(fri).toBeInTheDocument();
    expect(sat).toBeInTheDocument();
    expect(sun).toBeInTheDocument();

    // Wait for live query to populate default capacity
    await waitFor(() => {
      // Monday to Friday default capacity is 8h (480m)
      expect(screen.getByTestId('day-column-header-2026-09-28')).toHaveTextContent(/Sức chứa:\s*8h/);
      expect(screen.getByTestId('day-column-header-2026-10-02')).toHaveTextContent(/Sức chứa:\s*8h/);

      // Saturday and Sunday default capacity is 0h
      expect(screen.getByTestId('day-column-header-2026-10-03')).toHaveTextContent(/Sức chứa:\s*0m/);
      expect(screen.getByTestId('day-column-header-2026-10-04')).toHaveTextContent(/Sức chứa:\s*0m/);
    });
  });

  it('navigates to Next Week and Previous Week updating displayed date range and columns', async () => {
    render(<PlannerView db={testDb} initialDate="2026-09-30" />);

    expect(await screen.findByText('28/09 – 04/10/2026')).toBeInTheDocument();

    // Click Next Week
    const nextBtn = screen.getByRole('button', { name: 'Tuần sau' });
    fireEvent.click(nextBtn);

    expect(await screen.findByText('05/10 – 11/10/2026')).toBeInTheDocument();
    expect(screen.getByTestId('day-column-2026-10-05')).toBeInTheDocument();

    // Click Previous Week
    const prevBtn = screen.getByRole('button', { name: 'Tuần trước' });
    fireEvent.click(prevBtn);

    expect(await screen.findByText('28/09 – 04/10/2026')).toBeInTheDocument();
    expect(screen.getByTestId('day-column-2026-09-28')).toBeInTheDocument();
  });

  it('navigates weeks using keyboard shortcuts (Alt+ArrowRight / Alt+ArrowLeft)', async () => {
    render(<PlannerView db={testDb} initialDate="2026-09-30" />);

    expect(await screen.findByText('28/09 – 04/10/2026')).toBeInTheDocument();

    // Alt+ArrowRight
    fireEvent.keyDown(window, { key: 'ArrowRight', altKey: true });
    expect(await screen.findByText('05/10 – 11/10/2026')).toBeInTheDocument();

    // Alt+ArrowLeft
    fireEvent.keyDown(window, { key: 'ArrowLeft', altKey: true });
    expect(await screen.findByText('28/09 – 04/10/2026')).toBeInTheDocument();
  });

  it('allocates task to day column via + Allocate button and updates load and balance reactively', async () => {
    await createTask(
      { name: 'Wireframe Dashboard', estimateMinutes: 240, status: 'In Progress', priority: 'High' },
      testDb
    );

    render(<PlannerView db={testDb} initialDate="2026-09-30" />);

    // Wait for liveQuery to populate Monday header
    await waitFor(() => {
      expect(screen.getByTestId('day-column-header-2026-09-28')).toHaveTextContent(/Còn lại:\s*\+8h/);
    });

    // Click + Allocate button for Monday
    const allocateBtn = screen.getByRole('button', { name: 'Phân bổ tác vụ cho 2026-09-28' });
    fireEvent.click(allocateBtn);

    // Allocation modal opens with target date prefilled to 2026-09-28
    expect(await screen.findByText('Phân bổ thời gian tác vụ')).toBeInTheDocument();

    // Select the task
    const select = screen.getByRole('combobox', { name: 'Chọn tác vụ' });
    fireEvent.mouseDown(select);
    const option = await screen.findByText(/Wireframe Dashboard/);
    fireEvent.click(option);

    // Click preset 2h
    const preset2h = screen.getByRole('button', { name: '2h' });
    fireEvent.click(preset2h);

    // Save allocation
    const saveBtn = screen.getByRole('button', { name: 'Lưu phân bổ' });
    fireEvent.click(saveBtn);

    // Wait for reactive update in Monday column
    await waitFor(() => {
      const header = screen.getByTestId('day-column-header-2026-09-28');
      expect(header).toHaveTextContent(/Phân bổ:\s*2h/);
      expect(header).toHaveTextContent(/Còn lại:\s*\+6h/);
      expect(screen.getByText('Wireframe Dashboard')).toBeInTheDocument();
    });
  });

  it('opens CapacitySettingsModal from Capacity Settings button and adjusts capacity reactively', async () => {
    render(<PlannerView db={testDb} initialDate="2026-09-30" />);

    await waitFor(() => {
      expect(screen.getByTestId('day-column-header-2026-09-28')).toHaveTextContent(/Sức chứa:\s*8h/);
    });

    // Click Capacity Settings button
    const settingsBtn = screen.getByRole('button', { name: 'Cài đặt công suất' });
    fireEvent.click(settingsBtn);

    expect(await screen.findByText('Công suất làm việc & Ngoại lệ')).toBeInTheDocument();
    expect(screen.getByText('Mẫu công suất cơ bản hàng tuần')).toBeInTheDocument();

    // Close modal via Done button
    const doneBtn = screen.getByRole('button', { name: 'Xong' });
    fireEvent.click(doneBtn);

    // Modify Monday capacity directly in DB to 6h (360m)
    await updateCapacityRule(1, 360, testDb);

    await waitFor(() => {
      expect(screen.getByTestId('day-column-header-2026-09-28')).toHaveTextContent(/Sức chứa:\s*6h/);
    });
  });

  it('verifies App shell routes /#/planner to PlannerView and /#/settings to SettingsView without empty states', async () => {
    render(<App />);

    // Click Planner in Menu
    fireEvent.click(screen.getByRole('menuitem', { name: /Lập kế hoạch/i }));
    expect(await screen.findByTestId('planner-view')).toBeInTheDocument();
    expect(screen.queryByText('Workload Planner')).toBeNull();

    // Click Settings in Menu
    fireEvent.click(screen.getByRole('menuitem', { name: /Cài đặt/i }));
    expect(await screen.findByText('Cài đặt & Cấu hình công suất')).toBeInTheDocument();
    expect(screen.getByText('Mẫu công suất cơ bản hàng tuần')).toBeInTheDocument();
  });

  it('configures desktop grid with minmax of at least 180px and auto horizontal overflow (03-04)', async () => {
    render(<PlannerView db={testDb} initialDate="2026-09-30" />);

    const grid = await screen.findByTestId('planner-grid');
    expect(grid).toBeInTheDocument();

    const style = grid.getAttribute('style') || '';
    expect(style).toMatch(/minmax\(230px,\s*1fr\)/);
    expect(style).toMatch(/overflow-x:\s*auto/);
  });
});
