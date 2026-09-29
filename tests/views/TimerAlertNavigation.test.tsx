import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { message } from 'antd';
import 'fake-indexeddb/auto';
import { App } from '../../src/App';
import { db } from '../../src/db';
import { getTodayDateString } from '../../src/utils/date';

describe('Timer alert across navigation', () => {
  const today = getTodayDateString();

  beforeEach(async () => {
    await db.open();
    await Promise.all([
      db.tasks.clear(),
      db.projects.clear(),
      db.milestones.clear(),
      db.activeTimers.clear(),
      db.plannedAllocations.clear(),
      db.workSessions.clear(),
      db.settings.clear(),
    ]);
    window.location.hash = '#/tasks';
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await Promise.all([
      db.tasks.clear(),
      db.projects.clear(),
      db.milestones.clear(),
      db.activeTimers.clear(),
      db.plannedAllocations.clear(),
      db.workSessions.clear(),
      db.settings.clear(),
    ]);
  });

  it('triggers notification even after navigating away from tasks page', async () => {
    const warningSpy = vi.spyOn(message, 'warning').mockImplementation((() => {}) as any);

    // Mock window.Notification
    const notificationInstances: any[] = [];
    class MockNotification {
      static permission = 'granted';
      title: string;
      options: any;
      constructor(title: string, options: any) {
        this.title = title;
        this.options = options;
        notificationInstances.push(this);
      }
      close() {}
    }
    vi.stubGlobal('Notification', MockNotification);

    // Enable desktop notification
    await db.settings.put({
      key: 'browserNotificationsEnabled',
      value: true,
    });

    // Create task
    const taskId = 'task-alloc-nav-5';
    await db.tasks.put({
      id: taskId,
      name: 'Task Nav 5m',
      status: 'In Progress',
      progress: 0,
      priority: 'Medium',
      estimateMinutes: 60,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Allocate 5m today
    await db.plannedAllocations.put({
      id: 'alloc-nav-1',
      taskId,
      date: today,
      allocatedMinutes: 5,
    });

    // Start timer with 4m 58s already elapsed
    const now = Date.now();
    await db.activeTimers.put({
      taskId,
      status: 'running',
      startedAt: now - 298000, // 298s
      accumulatedMs: 0,
      sessionStartTime: new Date(now - 298000).toISOString(),
    });

    render(<App />);

    // Wait for Tasks view
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Thêm tác vụ nhanh/i)).toBeInTheDocument();
    });

    // Navigate to projects
    const projectsMenu = screen.getByRole('menuitem', { name: /Dự án/i });
    fireEvent.click(projectsMenu);

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/Thêm tác vụ nhanh/i)).not.toBeInTheDocument();
    });

    // Advance timers by 4 seconds (from 298s to 302s > 300s)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 3500));
    });

    console.log('warningSpy calls:', warningSpy.mock.calls);
    console.log('notificationInstances:', notificationInstances);

    expect(warningSpy).toHaveBeenCalledTimes(1);
    expect(notificationInstances.length).toBe(1);
  });

  it('verifies exactly one in-app alert when staying on task page (no duplicates)', async () => {
    const warningSpy = vi.spyOn(message, 'warning').mockImplementation((() => {}) as any);

    const notificationInstances: any[] = [];
    class MockNotification {
      static permission = 'granted';
      title: string;
      options: any;
      constructor(title: string, options: any) {
        this.title = title;
        this.options = options;
        notificationInstances.push(this);
      }
      close() {}
    }
    vi.stubGlobal('Notification', MockNotification);

    await db.settings.put({
      key: 'browserNotificationsEnabled',
      value: true,
    });

    const taskId = 'task-alloc-stay-5';
    await db.tasks.put({
      id: taskId,
      name: 'Task Stay 5m',
      status: 'In Progress',
      progress: 0,
      priority: 'Medium',
      estimateMinutes: 60,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await db.plannedAllocations.put({
      id: 'alloc-stay-1',
      taskId,
      date: today,
      allocatedMinutes: 5,
    });

    const now = Date.now();
    await db.activeTimers.put({
      taskId,
      status: 'running',
      startedAt: now - 298000, // 298s
      accumulatedMs: 0,
      sessionStartTime: new Date(now - 298000).toISOString(),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Thêm tác vụ nhanh/i)).toBeInTheDocument();
    });

    // Stay on task page and wait for timer to pass 300s
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 3500));
    });

    expect(warningSpy).toHaveBeenCalledTimes(1); // EXACTLY 1 - NO DUPLICATE!
  });

  it('tests starting timer in UI then navigating away', async () => {
    const warningSpy = vi.spyOn(message, 'warning').mockImplementation((() => {}) as any);

    const notificationInstances: any[] = [];
    class MockNotification {
      static permission = 'granted';
      title: string;
      options: any;
      constructor(title: string, options: any) {
        this.title = title;
        this.options = options;
        notificationInstances.push(this);
      }
      close() {}
    }
    vi.stubGlobal('Notification', MockNotification);

    await db.settings.put({
      key: 'browserNotificationsEnabled',
      value: true,
    });

    const taskId = 'task-alloc-start-ui';
    await db.tasks.put({
      id: taskId,
      name: 'Task Start UI 5m',
      status: 'Open',
      progress: 0,
      priority: 'Medium',
      estimateMinutes: 60,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await db.plannedAllocations.put({
      id: 'alloc-start-ui-1',
      taskId,
      date: today,
      allocatedMinutes: 5,
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Thêm tác vụ nhanh/i)).toBeInTheDocument();
      expect(screen.getByText('Task Start UI 5m')).toBeInTheDocument();
    });

    // Start timer by clicking start button in TaskTable
    const playBtn = screen.getByRole('button', { name: /Bắt đầu/i });
    fireEvent.click(playBtn);

    // Verify timer started in DB
    await waitFor(async () => {
      const active = await db.activeTimers.get(taskId);
      expect(active?.status).toBe('running');
    });

    // Simulate timer running: update startedAt in DB to 298s ago
    const now = Date.now();
    await db.activeTimers.update(taskId, {
      startedAt: now - 298000,
    });

    // Navigate to Projects view
    const projectsMenu = screen.getByRole('menuitem', { name: /Dự án/i });
    fireEvent.click(projectsMenu);

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/Thêm tác vụ nhanh/i)).not.toBeInTheDocument();
    });

    // Advance time by 3.5s
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 3500));
    });

    console.log('UI start then navigate warningSpy calls:', warningSpy.mock.calls.length);
    console.log('UI start then navigate notificationInstances:', notificationInstances.length);

    expect(warningSpy).toHaveBeenCalledTimes(1);
    expect(notificationInstances.length).toBe(1);
  }, 15000);
});
