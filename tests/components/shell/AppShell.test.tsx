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

    // Bottom Sider trigger should not exist
    expect(document.querySelector('.ant-layout-sider-trigger')).not.toBeInTheDocument();

    // Header toggle button
    const toggleBtn = screen.getByTestId('sidebar-toggle-btn');
    expect(toggleBtn).toBeInTheDocument();

    // Click collapse trigger
    fireEvent.click(toggleBtn);

    // Should now be collapsed and saved in localStorage
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe('true');
    const sider = document.querySelector('.ant-layout-sider');
    expect(sider).toHaveClass('ant-layout-sider-collapsed');

    // Click expand trigger
    fireEvent.click(toggleBtn);
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe('false');
    expect(sider).not.toHaveClass('ant-layout-sider-collapsed');
  });

  it('renders header right action group with timer and labeled sync dot placement', () => {
    render(
      <AppShell currentRoute="tasks" onNavigate={vi.fn()}>
        <div>Content</div>
      </AppShell>
    );

    const header = document.querySelector('.ant-layout-header');
    expect(header).toBeInTheDocument();

    // Center space should be removed: header has only 2 direct child Space elements (left and right)
    const directSpaces = header?.querySelectorAll(':scope > .ant-space');
    expect(directSpaces?.length).toBe(2);

    const rightSpace = directSpaces?.[1];
    expect(rightSpace).toBeInTheDocument();
    // Daily review summary button in right group
    expect(rightSpace?.textContent).toContain('Tổng kết');
  });
});
