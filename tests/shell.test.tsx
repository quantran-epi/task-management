import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfigProvider, theme } from 'antd';
import { APP_NAME } from '../src/constants/app';
import { AppShell } from '../src/components/shell/AppShell';
import App from '../src/App';
import { db } from '../src/db';
import { resetDatabaseToDefaults } from '../src/db/seeds';

describe('AppShell Component (UX-01)', () => {
  const onNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders application header title, search pill, and status badge with dynamic token styling', () => {
    const { container } = render(
      <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
        <AppShell currentRoute="tasks" onNavigate={onNavigate} isDark={true}>
          <div>Shell Content</div>
        </AppShell>
      </ConfigProvider>
    );

    expect(screen.getAllByText(APP_NAME).length).toBeGreaterThan(0);
    expect(screen.getByText('Trực tuyến')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Mở tìm kiếm nhanh/i })).toBeInTheDocument();
    expect(screen.getByText('Shell Content')).toBeInTheDocument();

    const header = container.querySelector('header');
    expect(header).toBeInTheDocument();
    // In dark mode, colorBgContainer is not white (#fff / rgb(255, 255, 255))
    expect(header?.getAttribute('style')).not.toContain('background: rgb(255, 255, 255)');
    expect(header?.getAttribute('style')).not.toContain('background: #fff');
  });

  it('renders the surviving navigation items and no project entry', () => {
    render(
      <AppShell currentRoute="tasks" onNavigate={onNavigate}>
        <div>Content</div>
      </AppShell>
    );

    // Plan 05 removed the `projects` route and its nav item outright.
    expect(screen.queryByText('Dự án')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Tác vụ'));
    expect(onNavigate).toHaveBeenCalledWith('tasks');

    fireEvent.click(screen.getByText('Lập kế hoạch'));
    expect(onNavigate).toHaveBeenCalledWith('planner');
  });

  it('does not render dangerous reset database button in header', () => {
    render(
      <AppShell currentRoute="tasks" onNavigate={onNavigate}>
        <div>Content</div>
      </AppShell>
    );

    expect(screen.queryByRole('button', { name: /Đặt lại CSDL/i })).not.toBeInTheDocument();
  });
});

describe('App Integration & Hash Route & Live Query (UX-01, DATA-02)', () => {
  beforeEach(async () => {
    cleanup();
    window.location.hash = '#/tasks';
    await resetDatabaseToDefaults(db);
  });

  afterEach(async () => {
    cleanup();
  });

  it('renders TasksView with search and quick add on tasks route', async () => {
    render(<App />);

    expect(await screen.findByPlaceholderText(/Tìm kiếm tác vụ/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Thêm nhanh tên tác vụ và ước tính')).toBeInTheDocument();
  });

  it('falls back to the dashboard when the hash names the removed projects route', async () => {
    render(<App />);

    expect(await screen.findByPlaceholderText(/Tìm kiếm tác vụ/i)).toBeInTheDocument();

    // `projects` is no longer an AppRoute, so the router falls back to the default route.
    window.location.hash = '#/projects';
    window.dispatchEvent(new HashChangeEvent('hashchange'));

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/Tìm kiếm tác vụ/i)).not.toBeInTheDocument();
      expect(screen.queryByText('Dự án & Cột mốc')).not.toBeInTheDocument();
    });
  });

  it('updates view when hash route changes to planner', async () => {
    render(<App />);

    window.location.hash = '#/planner';
    window.dispatchEvent(new HashChangeEvent('hashchange'));

    expect(await screen.findByTestId('planner-view')).toBeInTheDocument();
    expect(screen.getByTestId('week-navigator')).toBeInTheDocument();
  });
});
