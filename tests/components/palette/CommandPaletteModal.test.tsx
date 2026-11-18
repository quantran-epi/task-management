import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CommandPaletteModal } from '../../../src/components/palette/CommandPaletteModal';
import { TaskPlannerDatabase } from '../../../src/db';
import 'fake-indexeddb/auto';
import type { Task, ChangeRequest, System, Note } from '../../../src/types/models';

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

    expect(screen.getByPlaceholderText(/Tìm công việc, CR, hệ thống, màn hình, lệnh/)).toBeInTheDocument();
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

    const input = screen.getByPlaceholderText(/Tìm công việc, CR, hệ thống, màn hình, lệnh/);
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

    const input = screen.getByPlaceholderText(/Tìm công việc, CR, hệ thống, màn hình, lệnh/);

    // Press ArrowDown to select second item (Tasks)
    fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(onNavigate).toHaveBeenCalledWith('tasks');
    expect(onClose).toHaveBeenCalled();
  });

  it('shows cheatsheet guide when ? is typed or guide button clicked', () => {
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

    const guideBtn = screen.getByLabelText('Hướng dẫn cú pháp');
    fireEvent.click(guideBtn);

    expect(screen.getByText(/Hướng dẫn cú pháp Command Palette/)).toBeInTheDocument();
    expect(screen.getByText('Màn hình')).toBeInTheDocument();
    expect(screen.getByText('Tác vụ')).toBeInTheDocument();
    expect(screen.getByText('CR & Hệ thống')).toBeInTheDocument();
    expect(screen.getByText('Tạo việc')).toBeInTheDocument();
  });

  it('filters by prefix when tag is clicked or prefix typed', async () => {
    const onNavigate = vi.fn();
    const onClose = vi.fn();

    const task: Task = {
      id: 'a0000000-0000-4000-8000-000000000001',
      crId: 'b0000000-0000-4000-8000-000000000001',
      name: 'Kiểm tra bảo mật API',
      status: 'Open',
      priority: 'High',
      progress: 0,
      estimateMinutes: 60,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.tasks.add(task);

    render(
      <CommandPaletteModal
        open={true}
        onClose={onClose}
        onNavigate={onNavigate}
        db={db}
      />
    );

    // Click @ Tác vụ filter tag
    const taskTag = screen.getByText('@ Tác vụ');
    fireEvent.click(taskTag);

    await waitFor(() => {
      expect(screen.getByText('Kiểm tra bảo mật API')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Kiểm tra bảo mật API'));
    expect(onNavigate).toHaveBeenCalledWith('insight', {
      type: 'task',
      id: 'a0000000-0000-4000-8000-000000000001',
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onOpenNote when selecting a note', async () => {
    const onNavigate = vi.fn();
    const onClose = vi.fn();
    const onOpenNote = vi.fn();

    const note: Note = {
      id: 'note-1',
      title: 'Chiến lược phát hành Q4',
      body: 'Nội dung chi tiết ghi chú...',
      isPinned: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.notes.add(note);

    render(
      <CommandPaletteModal
        open={true}
        onClose={onClose}
        onNavigate={onNavigate}
        onOpenNote={onOpenNote}
        db={db}
      />
    );

    const input = screen.getByPlaceholderText(/Tìm công việc, CR, hệ thống, màn hình, lệnh/);
    fireEvent.change(input, { target: { value: '! Chiến lược' } });

    await waitFor(() => {
      expect(screen.getByText('Chiến lược phát hành Q4')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Chiến lược phát hành Q4'));
    expect(onOpenNote).toHaveBeenCalledWith(expect.objectContaining({ id: 'note-1' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onOpenCr when selecting a change request', async () => {
    const onNavigate = vi.fn();
    const onClose = vi.fn();
    const onOpenCr = vi.fn();

    const cr: ChangeRequest = {
      id: '25000000-0000-4000-8000-000000000099',
      name: 'Nền tảng thanh toán mới',
      code: 'CR-2026-099',
      status: 'In Progress',
      type: 'NEW_FEATURE',
      targets: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.changeRequests.add(cr);

    render(
      <CommandPaletteModal
        open={true}
        onClose={onClose}
        onNavigate={onNavigate}
        onOpenCr={onOpenCr}
        db={db}
      />
    );

    const input = screen.getByPlaceholderText(/Tìm công việc, CR, hệ thống, màn hình, lệnh/);
    fireEvent.change(input, { target: { value: '# thanh toán' } });

    await waitFor(() => {
      expect(screen.getByText('CR-2026-099')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('CR-2026-099'));
    expect(onOpenCr).toHaveBeenCalledWith(expect.objectContaining({ id: cr.id }));
    expect(onClose).toHaveBeenCalled();
  });

  it('filters systems under # prefix and opens system detail', async () => {
    const onNavigate = vi.fn();
    const onClose = vi.fn();
    const onOpenSystem = vi.fn();

    const system: System = {
      id: '26000000-0000-4000-8000-000000000099',
      name: 'Beta Release Service',
      code: 'BETA_SVC',
      parentId: null,
      type: 'SERVICE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.systems.add(system);

    render(
      <CommandPaletteModal
        open={true}
        onClose={onClose}
        onNavigate={onNavigate}
        onOpenSystem={onOpenSystem}
        db={db}
      />
    );

    const input = screen.getByPlaceholderText(/Tìm công việc, CR, hệ thống, màn hình, lệnh/);
    fireEvent.change(input, { target: { value: '# Beta' } });

    await waitFor(() => {
      expect(screen.getByText('BETA_SVC')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('BETA_SVC'));
    expect(onOpenSystem).toHaveBeenCalledWith(expect.objectContaining({ id: system.id }));
    expect(onClose).toHaveBeenCalled();
  });

  it('triggers AI with ? prefix and opens AI drawer with global context and prompt', async () => {
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

    const input = screen.getByPlaceholderText(/Tìm công việc, CR, hệ thống, màn hình, lệnh/);
    fireEvent.change(input, { target: { value: '? phân tích tiến độ' } });

    await waitFor(() => {
      expect(screen.getByText('Hỏi Trợ lý AI: "phân tích tiến độ"')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Hỏi Trợ lý AI: "phân tích tiến độ"'));
    expect(onClose).toHaveBeenCalled();
  });
});
