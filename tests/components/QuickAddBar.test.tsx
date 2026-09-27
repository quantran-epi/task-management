import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    const input = screen.getByPlaceholderText(/Thêm tác vụ nhanh/i);
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('data-shortcut-id', 'quick-add-input');
  });

  it('parses duration syntax and creates Open task on Enter per D-05, D-23, UX-05', async () => {
    const onCreated = vi.fn();
    render(<QuickAddBar onTaskCreated={onCreated} db={testDb} />);

    const input = screen.getByPlaceholderText(/Thêm tác vụ nhanh/i);

    fireEvent.change(input, { target: { value: 'Refactor auth service ~2h 30m' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledTimes(1);
    });

    const createdTask = onCreated.mock.calls[0]![0];
    expect(createdTask.name).toBe('Refactor auth service');
    expect(createdTask.estimateMinutes).toBe(150);
    expect(createdTask.status).toBe('Open');
    expect(createdTask.priority).toBe('Medium');

    // Input cleared
    expect(input).toHaveValue('');
  });

  it('creates task assigned to selected project', async () => {
    const onCreated = vi.fn();
    const p1Id = '11111111-1111-4111-8111-111111111111';
    const p2Id = '22222222-2222-4222-8222-222222222222';
    const projects = [
      { id: p1Id, name: 'Project Alpha' },
      { id: p2Id, name: 'Project Beta' },
    ];

    render(
      <QuickAddBar
        projects={projects}
        defaultProjectId={p1Id}
        onTaskCreated={onCreated}
        db={testDb}
      />
    );

    const input = screen.getByPlaceholderText(/Thêm tác vụ nhanh/i);
    fireEvent.change(input, { target: { value: 'Write unit tests ~45m' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledTimes(1);
    });

    const createdTask = onCreated.mock.calls[0]![0];
    expect(createdTask.name).toBe('Write unit tests');
    expect(createdTask.estimateMinutes).toBe(45);
    expect(createdTask.projectId).toBe(p1Id);
  });

  it('ignores empty submission', async () => {
    const onCreated = vi.fn();
    render(<QuickAddBar onTaskCreated={onCreated} db={testDb} />);

    const input = screen.getByPlaceholderText(/Thêm tác vụ nhanh/i);
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    // Should not create anything
    expect(onCreated).not.toHaveBeenCalled();
  });
});
