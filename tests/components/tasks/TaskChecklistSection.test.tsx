import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { TaskChecklistSection } from '../../../src/components/tasks/TaskChecklistSection';
import type { TaskChecklistItem } from '../../../src/types/models';

describe('TaskChecklistSection', () => {
  it('renders empty state when no items provided', () => {
    render(<TaskChecklistSection value={[]} />);
    expect(screen.getByText('Chưa có mục nào')).toBeInTheDocument();
  });

  it('renders items with completion count and progress percentage', () => {
    const items: TaskChecklistItem[] = [
      { id: '1', text: 'Subtask 1', done: true },
      { id: '2', text: 'Subtask 2', done: false },
    ];
    render(<TaskChecklistSection value={items} />);
    expect(screen.getByText('Đã hoàn thành 1/2 (50%)')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Subtask 1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Subtask 2')).toBeInTheDocument();
  });

  it('allows adding a new checklist item', () => {
    const onChange = vi.fn();
    render(<TaskChecklistSection value={[]} onChange={onChange} />);

    const input = screen.getByLabelText('Nội dung mục kiểm tra mới');
    const addButton = screen.getByRole('button', { name: 'Thêm mục checklist' });

    fireEvent.change(input, { target: { value: 'New item to do' } });
    fireEvent.click(addButton);

    expect(onChange).toHaveBeenCalledTimes(1);
    const addedItems = onChange.mock.calls[0][0];
    expect(addedItems).toHaveLength(1);
    expect(addedItems[0].text).toBe('New item to do');
    expect(addedItems[0].done).toBe(false);
  });

  it('toggles item done status and calls onChange', () => {
    const onChange = vi.fn();
    const items: TaskChecklistItem[] = [
      { id: '1', text: 'Subtask 1', done: false },
    ];
    render(<TaskChecklistSection value={items} onChange={onChange} />);

    const checkbox = screen.getByRole('checkbox', { name: 'Hoàn thành: Subtask 1' });
    fireEvent.click(checkbox);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0][0].done).toBe(true);
  });

  it('edits item text and calls onChange', () => {
    const onChange = vi.fn();
    const items: TaskChecklistItem[] = [
      { id: '1', text: 'Subtask 1', done: false },
    ];
    render(<TaskChecklistSection value={items} onChange={onChange} />);

    const textInput = screen.getByDisplayValue('Subtask 1');
    fireEvent.change(textInput, { target: { value: 'Subtask 1 edited' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0][0].text).toBe('Subtask 1 edited');
  });

  it('deletes an item and calls onChange', () => {
    const onChange = vi.fn();
    const items: TaskChecklistItem[] = [
      { id: '1', text: 'Subtask 1', done: false },
    ];
    render(<TaskChecklistSection value={items} onChange={onChange} />);

    const deleteBtn = screen.getByRole('button', { name: 'Xóa mục Subtask 1' });
    fireEvent.click(deleteBtn);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toHaveLength(0);
  });

  it('triggers onSyncProgress with correct percentage when button clicked', () => {
    const onSyncProgress = vi.fn();
    const items: TaskChecklistItem[] = [
      { id: '1', text: 'Subtask 1', done: true },
      { id: '2', text: 'Subtask 2', done: false },
    ];
    render(<TaskChecklistSection value={items} onSyncProgress={onSyncProgress} />);

    const syncBtn = screen.getByRole('button', { name: /Cập nhật tiến độ \(50%\)/ });
    fireEvent.click(syncBtn);

    expect(onSyncProgress).toHaveBeenCalledWith(50);
  });
});
