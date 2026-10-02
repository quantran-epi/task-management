import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { CommandPaletteModal } from '../../../src/components/palette/CommandPaletteModal';
import { TaskPlannerDatabase } from '../../../src/db';
import 'fake-indexeddb/auto';

describe('CommandPaletteModal', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase('test-command-palette-' + Math.random());
    await db.open();
  });

  it('renders modal when open=true and displays static views', () => {
    const onNavigate = vi.fn();
    const onClose = vi.fn();

    render(
      <CommandPaletteModal
        open={true}
        onClose={onClose}
        onNavigate={onNavigate}
        db={db}
      />
    );

    expect(screen.getByPlaceholderText(/Tìm công việc, dự án, màn hình, lệnh/)).toBeInTheDocument();
    expect(screen.getByText('Tổng quan (Dashboard)')).toBeInTheDocument();
    expect(screen.getByText('Công việc (Tasks)')).toBeInTheDocument();
    expect(screen.getByText('Lập kế hoạch tuần (Planner)')).toBeInTheDocument();
  });

  it('navigates to route when view item clicked', () => {
    const onNavigate = vi.fn();
    const onClose = vi.fn();

    render(
      <CommandPaletteModal
        open={true}
        onClose={onClose}
        onNavigate={onNavigate}
        db={db}
      />
    );

    fireEvent.click(screen.getByText('Công việc (Tasks)'));

    expect(onNavigate).toHaveBeenCalledWith('tasks');
    expect(onClose).toHaveBeenCalled();
  });

  it('filters items and shows quick create when typing query', async () => {
    const onNavigate = vi.fn();
    const onClose = vi.fn();
    const onCreateTask = vi.fn();

    render(
      <CommandPaletteModal
        open={true}
        onClose={onClose}
        onNavigate={onNavigate}
        onCreateTask={onCreateTask}
        db={db}
      />
    );

    const input = screen.getByPlaceholderText(/Tìm công việc, dự án, màn hình, lệnh/);
    fireEvent.change(input, { target: { value: 'Fix payment bug' } });

    expect(screen.getByText('Tạo công việc: "Fix payment bug"')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Tạo công việc: "Fix payment bug"'));
    expect(onCreateTask).toHaveBeenCalledWith('Fix payment bug');
    expect(onClose).toHaveBeenCalled();
  });

  it('allows keyboard navigation with arrow keys and Enter', () => {
    const onNavigate = vi.fn();
    const onClose = vi.fn();

    render(
      <CommandPaletteModal
        open={true}
        onClose={onClose}
        onNavigate={onNavigate}
        db={db}
      />
    );

    const input = screen.getByPlaceholderText(/Tìm công việc, dự án, màn hình, lệnh/);

    // Press ArrowDown to select second item (Tasks)
    fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(onNavigate).toHaveBeenCalledWith('tasks');
    expect(onClose).toHaveBeenCalled();
  });
});
