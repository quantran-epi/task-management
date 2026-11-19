import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TitleBar } from '../../src/workbench/TitleBar';
import { SettingsView } from '../../src/views/SettingsView';
import { TaskPlannerDatabase } from '../../src/db';

vi.mock('../../src/hooks/useTelegramPendingUsers', () => ({
  useTelegramPendingUsers: () => ({ pendingCount: 0 }),
}));

vi.mock('../../src/components/common/AriaLiveRegion', () => ({
  announceToScreenReader: vi.fn(),
  AriaLiveRegion: () => null,
}));

describe('config-profiles UI entry points (CR-02)', () => {
  it('exposes a TitleBar button that calls onOpenView with config-profiles', () => {
    const onOpenView = vi.fn();
    render(<TitleBar onOpenView={onOpenView} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Config Profiles' }));
    expect(onOpenView).toHaveBeenCalledWith('config-profiles');
  });

  it('exposes a Settings data-tab button that navigates to config-profiles without adding a tab', async () => {
    const db = new TaskPlannerDatabase(`ConfigProfilesEntry_${Date.now()}_${Math.random()}`);
    const onNavigate = vi.fn();
    const view = render(<SettingsView db={db} onNavigate={onNavigate} defaultActiveTab="data" />);

    expect(screen.getAllByRole('tab')).toHaveLength(6);
    const button = screen.getByRole('button', { name: 'Soạn & xuất Profile' });
    fireEvent.click(button);
    expect(onNavigate).toHaveBeenCalledWith('config-profiles');

    await view.unmount();
    await db.delete();
  });
});
