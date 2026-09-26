import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../src/db';
import { QuickAddBar } from '../../src/components/tasks/QuickAddBar';

describe('QuickAddBar', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase(`test-quickadd-${Math.random()}`);
    await testDb.open();
  });

  it('renders input with placeholder and data-shortcut-id per D-05, D-29', () => {
    render(<QuickAddBar db={testDb} />);
    const input = screen.getByPlaceholderText(/Add a task.*Press Enter to save/i);
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('data-shortcut-id', 'quick-add-input');
  });

  it('parses duration syntax and creates Open task on Enter per D-05, D-23, UX-05', async () => {
    const onCreated = vi.fn();
    render(<QuickAddBar onTaskCreated={onCreated} db={testDb} />);

    const input = screen.getByPlaceholderText(/Add a task.*Press Enter to save/i);

    fireEvent.change(input, { target: { value: 'Refactor auth service ~2h 30m' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledTimes(1);
    });

    const createdTask = onCreated.mock.calls[0][0];
    expect(createdTask.name).toBe('Refactor auth service');
    expect(createdTask.estimateMinutes).toBe(150);
    expect(createdTask.status).toBe('Open');
    expect(createdTask.priority).toBe('Medium');

    // Input cleared
    expect(input).toHaveValue('');
  });

  it('creates task assigned to selected project', async () => {
    const onCreated = vi.fn();
    const projects = [
      { id: 'p1', name: 'Project Alpha' },
      { id: 'p2', name: 'Project Beta' },
    ];

    render(
      <QuickAddBar
        projects={projects}
        defaultProjectId="p1"
        onTaskCreated={onCreated}
        db={testDb}
      />
    );

    const input = screen.getByPlaceholderText(/Add a task.*Press Enter to save/i);
    fireEvent.change(input, { target: { value: 'Write unit tests ~45m' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledTimes(1);
    });

    const createdTask = onCreated.mock.calls[0][0];
    expect(createdTask.name).toBe('Write unit tests');
    expect(createdTask.estimateMinutes).toBe(45);
    expect(createdTask.projectId).toBe('p1');
  });

  it('ignores empty submission', async () => {
    const onCreated = vi.fn();
    render(<QuickAddBar onTaskCreated={onCreated} db={testDb} />);

    const input = screen.getByPlaceholderText(/Add a task.*Press Enter to save/i);
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    // Should not create anything
    expect(onCreated).not.toHaveBeenCalled();
  });
});
