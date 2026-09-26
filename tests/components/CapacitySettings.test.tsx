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

      expect(await screen.findByText('Monday')).toBeInTheDocument();
      expect(screen.getByText('Tuesday')).toBeInTheDocument();
      expect(screen.getByText('Wednesday')).toBeInTheDocument();
      expect(screen.getByText('Thursday')).toBeInTheDocument();
      expect(screen.getByText('Friday')).toBeInTheDocument();
      expect(screen.getByText('Saturday')).toBeInTheDocument();
      expect(screen.getByText('Sunday')).toBeInTheDocument();

      // Check weekly total
      expect(await screen.findByTestId('weekly-total')).toHaveTextContent('Weekly Total: 40h');
    });

    it('updates Monday capacity to 0h on preset click', async () => {
      render(<WeeklyCapacityForm db={testDb} />);

      await screen.findByText('Monday');
      const setMon0h = screen.getByRole('button', { name: 'Set Monday to 0h' });
      fireEvent.click(setMon0h);

      await waitFor(async () => {
        const monRule = await testDb.capacityRules.where('dayOfWeek').equals(1).first();
        expect(monRule?.workMinutes).toBe(0);
      });
    });

    it('updates Saturday capacity to 4h on preset click', async () => {
      render(<WeeklyCapacityForm db={testDb} />);

      await screen.findByText('Saturday');
      const setSat4h = screen.getByRole('button', { name: 'Set Saturday to 4h' });
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

      expect(await screen.findByText('No specific date overrides')).toBeInTheDocument();
      expect(
        screen.getByText(/All dates use default weekly template hours/i)
      ).toBeInTheDocument();
    });

    it('renders existing overrides and removes via Reset to Default Popconfirm', async () => {
      await setCapacityOverride('2026-10-12', 0, 'Indigenous Peoples Day', testDb);

      render(<OverridesTable db={testDb} />);

      expect(await screen.findByText('2026-10-12')).toBeInTheDocument();
      expect(screen.getByText('Indigenous Peoples Day')).toBeInTheDocument();
      expect(screen.getByText('Leave / Off')).toBeInTheDocument();

      // Click reset button
      const resetBtn = screen.getByRole('button', { name: 'Reset override for 2026-10-12' });
      fireEvent.click(resetBtn);

      // Confirm in popconfirm
      const confirmBtn = await screen.findByRole('button', { name: 'Reset' });
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

      expect(await screen.findByText('Work Capacity & Overrides')).toBeInTheDocument();
      const doneBtn = screen.getByRole('button', { name: 'Done' });
      fireEvent.click(doneBtn);
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('SettingsView (D-05)', () => {
    it('renders full settings view with navigation trigger', async () => {
      const onNavigate = vi.fn();
      render(<SettingsView db={testDb} onNavigate={onNavigate} />);

      expect(await screen.findByText('Settings & Capacity Configuration')).toBeInTheDocument();
      expect(screen.getByText('Weekly Base Capacity Template')).toBeInTheDocument();
      expect(screen.getByText('Specific Date Overrides')).toBeInTheDocument();

      const backBtn = screen.getByRole('button', { name: 'Back to Tasks' });
      fireEvent.click(backBtn);
      expect(onNavigate).toHaveBeenCalledWith('tasks');
    });
  });
});
