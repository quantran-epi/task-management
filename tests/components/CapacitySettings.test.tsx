import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../src/db/index';
import { initializeDatabaseDefaults } from '../../src/db/seeds';
import { WeeklyCapacityForm } from '../../src/components/settings/WeeklyCapacityForm';
import { OverridesTable } from '../../src/components/settings/OverridesTable';
import { CapacitySettingsModal } from '../../src/components/planner/CapacitySettingsModal';
import { SettingsView } from '../../src/views/SettingsView';
import { setCapacityOverride } from '../../src/db/repositories/capacityRepo';

describe('Capacity Settings UI Components (CAP-01, CAP-02, CAP-03, CAP-04, D-05, D-06, D-07, D-08)', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestCapacityUI_' + Math.random().toString(36).slice(2));
    await testDb.open();
    await initializeDatabaseDefaults(testDb);
  });

  afterEach(async () => {
    await testDb.delete();
  });

  describe('WeeklyCapacityForm (CAP-01, CAP-02, D-06)', () => {
    it('renders all 7 days Monday to Sunday with seeded 40h weekly total', async () => {
      render(<WeeklyCapacityForm db={testDb} />);

      expect(await screen.findByText('Thứ Hai')).toBeInTheDocument();
      expect(screen.getByText('Thứ Ba')).toBeInTheDocument();
      expect(screen.getByText('Thứ Tư')).toBeInTheDocument();
      expect(screen.getByText('Thứ Năm')).toBeInTheDocument();
      expect(screen.getByText('Thứ Sáu')).toBeInTheDocument();
      expect(screen.getByText('Thứ Bảy')).toBeInTheDocument();
      expect(screen.getByText('Chủ Nhật')).toBeInTheDocument();

      // Check weekly total
      expect(await screen.findByTestId('weekly-total')).toHaveTextContent('Tổng hàng tuần: 40h');
    });

    it('updates Monday capacity to 0h on preset click', async () => {
      render(<WeeklyCapacityForm db={testDb} />);

      await screen.findByText('Thứ Hai');
      const setMon0h = screen.getByRole('button', { name: 'Set Thứ Hai to 0h' });
      fireEvent.click(setMon0h);

      await waitFor(async () => {
        const monRule = await testDb.capacityRules.where('dayOfWeek').equals(1).first();
        expect(monRule?.workMinutes).toBe(0);
      });
    });

    it('updates Saturday capacity to 4h on preset click', async () => {
      render(<WeeklyCapacityForm db={testDb} />);

      await screen.findByText('Thứ Bảy');
      const setSat4h = screen.getByRole('button', { name: 'Set Thứ Bảy to 4h' });
      fireEvent.click(setSat4h);

      await waitFor(async () => {
        const satRule = await testDb.capacityRules.where('dayOfWeek').equals(6).first();
        expect(satRule?.workMinutes).toBe(240);
      });
    });
  });

  describe('OverridesTable (CAP-03, CAP-04, D-07, D-08)', () => {
    it('shows empty state when no overrides exist', async () => {
      render(<OverridesTable db={testDb} />);

      expect(await screen.findByText('Chưa có ngày ngoại lệ nào')).toBeInTheDocument();
      expect(
        screen.getByText(/Tất cả các ngày đều sử dụng số giờ mặc định theo mẫu hàng tuần/i)
      ).toBeInTheDocument();
    });

    it('renders existing overrides and removes via Reset to Default Popconfirm', async () => {
      await setCapacityOverride('2026-10-12', 0, 'Indigenous Peoples Day', testDb);

      render(<OverridesTable db={testDb} />);

      expect(await screen.findByText('2026-10-12')).toBeInTheDocument();
      expect(screen.getByText('Indigenous Peoples Day')).toBeInTheDocument();
      expect(screen.getByText('Nghỉ')).toBeInTheDocument();

      // Click reset button
      const resetBtn = screen.getByRole('button', { name: 'Khôi phục ngoại lệ cho 2026-10-12' });
      fireEvent.click(resetBtn);

      // Confirm in popconfirm
      const confirmBtn = await screen.findByRole('button', { name: 'Khôi phục' });
      fireEvent.click(confirmBtn);

      await waitFor(async () => {
        const remaining = await testDb.capacityOverrides.toArray();
        expect(remaining).toHaveLength(0);
      });
    });
  });

  describe('CapacitySettingsModal (D-05)', () => {
    it('renders modal with title and close action', async () => {
      const onCancel = vi.fn();
      render(<CapacitySettingsModal open={true} onCancel={onCancel} db={testDb} />);

      expect(await screen.findByText('Công suất làm việc & Ngoại lệ')).toBeInTheDocument();
      const doneBtn = screen.getByRole('button', { name: 'Xong' });
      fireEvent.click(doneBtn);
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('SettingsView (D-05)', () => {
    it('renders full settings view with navigation trigger', async () => {
      const onNavigate = vi.fn();
      render(<SettingsView db={testDb} onNavigate={onNavigate} />);

      expect(await screen.findByText('Cài đặt & Cấu hình công suất')).toBeInTheDocument();
      expect(screen.getByText('Mẫu công suất cơ bản hàng tuần')).toBeInTheDocument();
      expect(screen.getByText('Ngoại lệ theo ngày cụ thể')).toBeInTheDocument();

      const backBtn = screen.getByRole('button', { name: 'Quay lại Tác vụ' });
      fireEvent.click(backBtn);
      expect(onNavigate).toHaveBeenCalledWith('tasks');
    });
  });
});
