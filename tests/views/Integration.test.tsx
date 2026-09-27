import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { App } from '../../src/App';
import { db } from '../../src/db';
import { createProject } from '../../src/db/repositories/projectRepo';

describe('App & Route Integration', () => {
  beforeEach(async () => {
    await db.open();
    await db.tasks.clear();
    await db.projects.clear();
    await db.milestones.clear();
    window.location.hash = '#/tasks';
  });

  afterEach(async () => {
    await db.delete();
  });

  it('renders TasksView when route is #/tasks and allows creating a task via QuickAddBar', async () => {
    render(<App />);

    // Verify Tasks view elements are rendered
    expect(screen.getByPlaceholderText(/Thêm tác vụ nhanh/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Tìm kiếm tác vụ/i)).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/Thêm tác vụ nhanh/i);
    fireEvent.change(input, { target: { value: 'Integration Test Task ~45m' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('Integration Test Task')).toBeInTheDocument();
      expect(screen.getByText('45m')).toBeInTheDocument();
    });
  });

  it('navigates to #/projects and renders ProjectsView hierarchy', async () => {
    await createProject({
      name: 'Integration Project',
      status: 'Open',
    });

    render(<App />);

    // Switch hash to projects by clicking menu item
    fireEvent.click(screen.getByRole('menuitem', { name: /Dự án/i }));

    await waitFor(() => {
      expect(screen.getByText('Integration Project')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Dự án mới/i })).toBeInTheDocument();
    });
  });
});
