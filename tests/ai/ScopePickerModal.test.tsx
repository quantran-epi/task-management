import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScopePickerModal } from '../../src/components/ai/ScopePickerModal';
import { TaskPlannerDatabase } from '../../src/db';
import 'fake-indexeddb/auto';

describe('ScopePickerModal', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase('test-scope-picker-' + Math.random());
    await db.open();

    await db.projects.add({
      id: 'proj-1',
      name: 'Dự án Website',
      status: 'In Progress',
      createdAt: '2026-10-01',
      updatedAt: '2026-10-01',
    });

    await db.milestones.add({
      id: 'ms-1',
      projectId: 'proj-1',
      name: 'Mốc Launch MVP',
      status: 'In Progress',
      createdAt: '2026-10-01',
      updatedAt: '2026-10-01',
    });

    await db.tasks.add({
      id: 'task-1',
      projectId: 'proj-1',
      name: 'Thiết kế Navbar',
      status: 'Open',
      priority: 'High',
      estimateMinutes: 60,
      progress: 0,
      createdAt: '2026-10-01',
      updatedAt: '2026-10-01',
    });
  });

  it('renders modal and lists global option, projects, milestones, tasks', async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();

    render(
      <ScopePickerModal
        open={true}
        onClose={onClose}
        currentScope={{ type: 'global' }}
        onSelectScope={onSelect}
        db={db}
      />
    );

    expect(screen.getByText('Chọn phạm vi ngữ cảnh AI')).toBeInTheDocument();
    expect(screen.getByText('Toàn cục (Không gắn)')).toBeInTheDocument();
    expect(await screen.findByText('Dự án Website')).toBeInTheDocument();
    expect(await screen.findByText('Mốc Launch MVP')).toBeInTheDocument();
    expect(await screen.findByText('Thiết kế Navbar')).toBeInTheDocument();
  });

  it('selecting a task item invokes onSelectScope with task type and closes modal', async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();

    render(
      <ScopePickerModal
        open={true}
        onClose={onClose}
        currentScope={{ type: 'global' }}
        onSelectScope={onSelect}
        db={db}
      />
    );

    const taskItem = await screen.findByText('Thiết kế Navbar');
    fireEvent.click(taskItem);

    expect(onSelect).toHaveBeenCalledWith({
      type: 'task',
      id: 'task-1',
      title: 'Thiết kế Navbar',
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('selecting global option selects global scope', async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();

    render(
      <ScopePickerModal
        open={true}
        onClose={onClose}
        currentScope={{ type: 'task', id: 'task-1', title: 'Thiết kế Navbar' }}
        onSelectScope={onSelect}
        db={db}
      />
    );

    const globalItem = screen.getByText('Toàn cục (Không gắn)');
    fireEvent.click(globalItem);

    expect(onSelect).toHaveBeenCalledWith({
      type: 'global',
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('filters items when typing in search input', async () => {
    render(
      <ScopePickerModal
        open={true}
        onClose={vi.fn()}
        currentScope={{ type: 'global' }}
        onSelectScope={vi.fn()}
        db={db}
      />
    );

    const searchInput = screen.getByLabelText('Tìm kiếm ngữ cảnh');
    fireEvent.change(searchInput, { target: { value: 'Navbar' } });

    expect(await screen.findByText('Thiết kế Navbar')).toBeInTheDocument();
    expect(screen.queryByText('Mốc Launch MVP')).not.toBeInTheDocument();
  });
});
