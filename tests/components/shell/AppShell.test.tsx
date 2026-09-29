import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppShell, SIDEBAR_COLLAPSED_KEY } from '../../../src/components/shell/AppShell';

// Mock contexts and hooks that AppShell relies on
vi.mock('../../../src/hooks/useServiceWorkerUpdate', () => ({
  useServiceWorkerUpdate: () => ({
    needRefresh: false,
    reloadApp: vi.fn(),
  }),
}));

vi.mock('../../../src/hooks/useNotifications', () => ({
  useNotifications: () => ({
    items: [],
    activeCount: 0,
  }),
}));

vi.mock('../../../src/hooks/useDesktopNotification', () => ({
  useDesktopNotification: vi.fn(),
}));

vi.mock('../../../src/hooks/useTimerAlertMonitor', () => ({
  useTimerAlertMonitor: vi.fn(),
}));

describe('AppShell', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('initializes desktop Sider with collapsed = false when localStorage is empty', () => {
    render(
      <AppShell currentRoute="tasks" onNavigate={vi.fn()}>
        <div>App Shell Content</div>
      </AppShell>
    );

    const sider = document.querySelector('.ant-layout-sider');
    expect(sider).toBeInTheDocument();
    expect(sider).not.toHaveClass('ant-layout-sider-collapsed');
    expect(screen.getByText('App Shell Content')).toBeInTheDocument();
  });

  it('initializes desktop Sider with collapsed = true when localStorage contains planner:sidebar_collapsed = "true"', () => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, 'true');

    render(
      <AppShell currentRoute="tasks" onNavigate={vi.fn()}>
        <div>App Shell Content</div>
      </AppShell>
    );

    const sider = document.querySelector('.ant-layout-sider');
    expect(sider).toBeInTheDocument();
    expect(sider).toHaveClass('ant-layout-sider-collapsed');
  });

  it('updates localStorage when toggling Sider collapse trigger', () => {
    render(
      <AppShell currentRoute="tasks" onNavigate={vi.fn()}>
        <div>App Shell Content</div>
      </AppShell>
    );

    // Ant Design Sider collapsible trigger button
    const trigger = document.querySelector('.ant-layout-sider-trigger');
    expect(trigger).toBeInTheDocument();

    // Click collapse trigger
    fireEvent.click(trigger!);

    // Should now be collapsed and saved in localStorage
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe('true');
    const sider = document.querySelector('.ant-layout-sider');
    expect(sider).toHaveClass('ant-layout-sider-collapsed');

    // Click expand trigger
    fireEvent.click(trigger!);
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe('false');
    expect(sider).not.toHaveClass('ant-layout-sider-collapsed');
  });
});
