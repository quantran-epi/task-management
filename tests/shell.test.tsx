import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfigProvider, theme } from 'antd';
import { AppShell } from '../src/components/shell/AppShell';
import App from '../src/App';
import { db } from '../src/db';
import { initializeDatabaseDefaults } from '../src/db/seeds';

describe('AppShell Component (UX-01)', () => {
  const onNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders application header title and status badge with dynamic token styling', () => {
    const { container } = render(
      <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
        <AppShell currentRoute="tasks" onNavigate={onNavigate} isDark={true}>
          <div>Shell Content</div>
        </AppShell>
      </ConfigProvider>
    );

    expect(screen.getByText('Task Planner')).toBeInTheDocument();
    expect(screen.getByText('Trực tuyến')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Đặt lại CSDL/i })).toBeInTheDocument();
    expect(screen.getByText('Shell Content')).toBeInTheDocument();

    const header = container.querySelector('header');
    expect(header).toBeInTheDocument();
    // In dark mode, colorBgContainer is not white (#fff / rgb(255, 255, 255))
    expect(header?.getAttribute('style')).not.toContain('background: rgb(255, 255, 255)');
    expect(header?.getAttribute('style')).not.toContain('background: #fff');
  });

  it('renders navigation items and triggers navigation callback', () => {
    render(
      <AppShell currentRoute="tasks" onNavigate={onNavigate}>
        <div>Content</div>
      </AppShell>
    );

    const projectsLink = screen.getByText('Dự án');
    expect(projectsLink).toBeInTheDocument();
    fireEvent.click(projectsLink);
    expect(onNavigate).toHaveBeenCalledWith('projects');
  });

  it('opens reset database modal when clicking Reset DB button', () => {
    render(
      <AppShell currentRoute="tasks" onNavigate={onNavigate}>
        <div>Content</div>
      </AppShell>
    );

    fireEvent.click(screen.getByRole('button', { name: /Đặt lại CSDL/i }));
    expect(screen.getByText('Đặt lại cơ sở dữ liệu')).toBeInTheDocument();
    expect(screen.getByText(/Hành động nguy hiểm/i)).toBeInTheDocument();
  });
});

describe('App Integration & Hash Route & Live Query (UX-01, DATA-02)', () => {
  beforeEach(async () => {
    cleanup();
    window.location.hash = '#/tasks';
    await db.delete();
    await db.open();
    await initializeDatabaseDefaults();
  });

  it('renders TasksView with search and quick add on tasks route', async () => {
    render(<App />);

    expect(await screen.findByPlaceholderText(/Tìm kiếm tác vụ/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Thêm tác vụ nhanh/i)).toBeInTheDocument();
  });

  it('updates view when hash route changes to projects', async () => {
    render(<App />);

    expect(await screen.findByPlaceholderText(/Tìm kiếm tác vụ/i)).toBeInTheDocument();

    // Trigger hashchange to projects
    window.location.hash = '#/projects';
    window.dispatchEvent(new HashChangeEvent('hashchange'));

    await waitFor(() => {
      expect(screen.getByText('Phân cấp công việc')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Dự án mới/i })).toBeInTheDocument();
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
