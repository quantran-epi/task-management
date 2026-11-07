import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { App } from '../../src/App';
import { db } from '../../src/db';
import { createChangeRequest } from '../../src/db/repositories/changeRequestRepo';

/**
 * The default shell has no CR route after the 31.2 normalization — CRs live in the workbench
 * (CR Explorer + `cr_detail`/`sdlc` tabs). These tests therefore cover the surviving route
 * integration: the tasks route, and the dashboard fallback the router applies to the removed
 * `#/projects` route.
 */
describe('App & Route Integration', () => {
  beforeEach(async () => {
    await db.open();
    await db.tasks.clear();
    await db.changeRequests.clear();
    window.location.hash = '#/tasks';
  });

  afterEach(async () => {
    // Unmount and let pending live queries settle before closing the shared db, otherwise
    // Dexie rejects in-flight reads with DatabaseClosedError after the test has finished.
    cleanup();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await db.delete();
  });

  it('renders TasksView when route is #/tasks and allows creating a task via QuickAddBar', async () => {
    await createChangeRequest({
      code: 'CR-INT-01',
      name: 'Integration CR',
      status: 'Open',
      type: 'ENHANCEMENT',
      targets: [],
    });

    render(<App />);

    expect(screen.getByLabelText('Thêm nhanh tên tác vụ và ước tính')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Tìm kiếm tác vụ/i)).toBeInTheDocument();

    // QuickAddBar needs an active CR before it accepts input (D-27).
    fireEvent.change(screen.getByRole('combobox', { name: 'Change Request (CR)' }), {
      target: { value: 'CR-INT-01' },
    });
    fireEvent.click(await screen.findByTitle('CR-INT-01 · Integration CR'));

    const input = screen.getByLabelText('Thêm nhanh tên tác vụ và ước tính');
    fireEvent.change(input, { target: { value: 'Integration Test Task ~45m' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('Integration Test Task')).toBeInTheDocument();
      expect(screen.getByText(/45m/)).toBeInTheDocument();
    });
  });

  it('falls back to the dashboard when the hash names the removed projects route', async () => {
    render(<App />);

    window.location.hash = '#/projects';
    window.dispatchEvent(new HashChangeEvent('hashchange'));

    await waitFor(() => {
      expect(screen.queryByText('Dự án & Cột mốc')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Dự án mới/i })).not.toBeInTheDocument();
    });
  });
});
