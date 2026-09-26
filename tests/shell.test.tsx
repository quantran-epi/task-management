import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
    expect(screen.getByText('Online')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reset DB/i })).toBeInTheDocument();
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

    const projectsLink = screen.getByText('Projects');
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

    fireEvent.click(screen.getByRole('button', { name: /Reset DB/i }));
    expect(screen.getByText('Reset Database')).toBeInTheDocument();
    expect(screen.getByText(/Destructive Action/i)).toBeInTheDocument();
  });
});

describe('App Integration & Hash Route & Live Query (UX-01, DATA-02)', () => {
  beforeEach(async () => {
    window.location.hash = '#/tasks';
    await db.delete();
    await db.open();
    await initializeDatabaseDefaults();
  });

  it('renders TasksView with search and quick add on tasks route', async () => {
    render(<App />);

    expect(await screen.findByPlaceholderText(/Search tasks/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Add a task/i)).toBeInTheDocument();
  });

  it('updates view when hash route changes to projects', async () => {
    render(<App />);

    expect(await screen.findByPlaceholderText(/Search tasks/i)).toBeInTheDocument();

    // Trigger hashchange to projects
    window.location.hash = '#/projects';
    window.dispatchEvent(new HashChangeEvent('hashchange'));

    await waitFor(() => {
      expect(screen.getByText('Work Hierarchy')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /New Project/i })).toBeInTheDocument();
    });
  });

  it('updates view when hash route changes to planner', async () => {
    render(<App />);

    window.location.hash = '#/planner';
    window.dispatchEvent(new HashChangeEvent('hashchange'));

    expect(await screen.findByText('Workload Planner')).toBeInTheDocument();
    expect(screen.getByText(/Daily capacity allocation/i)).toBeInTheDocument();
  });
});
