import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

  it('renders capacity rules reactively queried from IndexedDB on tasks route', async () => {
    render(<App />);

    expect(await screen.findByText(/Tasks - Capacity Rules/i)).toBeInTheDocument();
    // Monday-Friday have 480 mins (8h), total 5 items
    const matches = await screen.findAllByText(/480 mins \(8h\)/i);
    expect(matches).toHaveLength(5);
  });

  it('updates view when hash route changes to projects', async () => {
    render(<App />);

    expect(await screen.findByText(/Tasks - Capacity Rules/i)).toBeInTheDocument();

    // Trigger hashchange to projects
    window.location.hash = '#/projects';
    window.dispatchEvent(new HashChangeEvent('hashchange'));

    expect(await screen.findByText('Projects')).toBeInTheDocument();
    expect(screen.getByText(/No projects created yet/i)).toBeInTheDocument();
  });

  it('updates view when hash route changes to planner', async () => {
    render(<App />);

    window.location.hash = '#/planner';
    window.dispatchEvent(new HashChangeEvent('hashchange'));

    expect(await screen.findByText(/Workload Planner - Capacity Rules/i)).toBeInTheDocument();
  });
});
